import { useState, useCallback } from 'react';
import {
  pageIndexDocument,
  extractCsvPages,
  buildReverseIndex,
  type PageIndexResult,
  type PageData,
  type ReverseIndex,
  type ProgressInfo,
} from 'react-native-pageindex';
import { createLLMProvider, type LLMConfig, DEFAULT_MODELS } from './llm';
import Header from './components/Header';
import ConfigPanel from './components/ConfigPanel';
import ProgressDisplay from './components/ProgressDisplay';
import ResultsPanel from './components/ResultsPanel';

export type BuildMode = 'keyword' | 'llm';
export type BuildState = 'idle' | 'building' | 'done' | 'error';
export type ActiveTab = 'tree' | 'search' | 'pages';

const CSV_URL = '/farmer_dataset.csv';
const ROWS_PER_PAGE = 10;

/** Build a flat PageIndexResult from pages — used in keyword-only mode.
 *  PageIndexResult.structure is TreeNode[], so we return the page groups
 *  as a flat top-level array — no wrapping root node needed. */
function makeFlatResult(pages: PageData[]): PageIndexResult {
  return {
    doc_name: 'Farmer Dataset',
    structure: pages.map((page, i) => ({
      title: `Farmers ${i * ROWS_PER_PAGE + 1}–${Math.min((i + 1) * ROWS_PER_PAGE, 100)}`,
      node_id: `group_${i}`,
      text: page.text,
      start_index: i,
      end_index: i,
    })),
  };
}

export default function App() {
  const [mode, setMode] = useState<BuildMode>('keyword');
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    provider: 'openai',
    apiKey: '',
    model: DEFAULT_MODELS.openai,
    ollamaUrl: 'http://localhost:11434',
  });
  const [buildState, setBuildState] = useState<BuildState>('idle');
  const [progressList, setProgressList] = useState<ProgressInfo[]>([]);
  const [currentProgress, setCurrentProgress] = useState<ProgressInfo | null>(null);
  const [result, setResult] = useState<PageIndexResult | null>(null);
  const [reverseIndex, setReverseIndex] = useState<ReverseIndex | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('tree');
  const [durationMs, setDurationMs] = useState(0);

  const report = useCallback((info: ProgressInfo) => {
    setCurrentProgress(info);
    setProgressList(prev => {
      // Update existing step entry or append new one
      const idx = prev.findIndex(p => p.step === info.step);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = info;
        return next;
      }
      return [...prev, info];
    });
  }, []);

  const handleBuild = useCallback(async () => {
    setBuildState('building');
    setProgressList([]);
    setCurrentProgress(null);
    setResult(null);
    setReverseIndex(null);
    setError(null);
    const t0 = Date.now();

    try {
      report({ step: 'Loading dataset', percent: 2, detail: 'Fetching farmer_dataset.csv' });
      const res = await fetch(CSV_URL);
      if (!res.ok) throw new Error(`Failed to load CSV: ${res.statusText}`);
      const csvText = await res.text();

      if (mode === 'keyword') {
        // ── Keyword-only (no LLM) ─────────────────────────────────────────
        report({ step: 'Parsing CSV', percent: 10, detail: `Splitting into ${ROWS_PER_PAGE}-row pages` });
        const csvPages = await extractCsvPages(csvText, { rowsPerPage: ROWS_PER_PAGE });
        setPages(csvPages);

        report({ step: 'Building flat index', percent: 25, detail: `${csvPages.length} page groups created` });
        const flatResult = makeFlatResult(csvPages);
        setResult(flatResult);

        const ri = await buildReverseIndex({
          result: flatResult,
          pages: csvPages,
          options: {
            mode: 'keyword',
            minTermLength: 3,
            maxTermsPerNode: 30,
            onProgress: report,
          },
        });
        setReverseIndex(ri);
      } else {
        // ── Full LLM mode ─────────────────────────────────────────────────
        const llm = createLLMProvider(llmConfig);

        const indexResult = await pageIndexDocument({
          text: csvText,
          fileType: 'csv',
          docName: 'Farmer Dataset',
          llm,
          options: {
            csvOptions: { rowsPerPage: ROWS_PER_PAGE },
            onProgress: report,
          },
        });
        setResult(indexResult);

        // Extract pages separately for the Pages tab display
        const csvPages = await extractCsvPages(csvText, { rowsPerPage: ROWS_PER_PAGE });
        setPages(csvPages);

        // Build keyword reverse index over the LLM-generated tree
        const ri = await buildReverseIndex({
          result: indexResult,
          pages: csvPages,
          options: {
            mode: 'keyword',
            minTermLength: 3,
            maxTermsPerNode: 25,
            onProgress: report,
          },
        });
        setReverseIndex(ri);
      }

      setDurationMs(Date.now() - t0);
      setBuildState('done');
      setActiveTab('tree');
    } catch (e) {
      console.error('[PageIndex demo]', e);
      setError(e instanceof Error ? e.message : String(e));
      setBuildState('error');
    }
  }, [mode, llmConfig, report]);

  return (
    <div className="app">
      <Header />
      <div className="layout">
        <aside className="sidebar">
          <ConfigPanel
            mode={mode}
            setMode={setMode}
            llmConfig={llmConfig}
            setLlmConfig={setLlmConfig}
            buildState={buildState}
            onBuild={handleBuild}
          />
        </aside>

        <main className="content">
          {buildState === 'idle' && (
            <div className="empty-state">
              <div className="empty-icon">🌾</div>
              <h2>PageIndex Demo</h2>
              <p>
                Click <strong>Build Index</strong> to index the farmer dataset
                with <code>react-native-pageindex</code>.
              </p>
              <div className="empty-features">
                <div className="feature">
                  <span>📄</span>
                  <span>100 farmers · 14 columns · CSV format</span>
                </div>
                <div className="feature">
                  <span>🔍</span>
                  <span><strong>Keyword mode</strong> — fast, no API key needed</span>
                </div>
                <div className="feature">
                  <span>🤖</span>
                  <span><strong>LLM mode</strong> — semantic tree + node summaries</span>
                </div>
              </div>
            </div>
          )}

          {buildState === 'building' && (
            <ProgressDisplay
              progressList={progressList}
              current={currentProgress}
              mode={mode}
            />
          )}

          {buildState === 'error' && (
            <div className="error-state">
              <div className="error-icon">⚠️</div>
              <h3>Build failed</h3>
              <pre className="error-message">{error}</pre>
              <button className="btn btn-outline" onClick={() => setBuildState('idle')}>
                ← Back
              </button>
            </div>
          )}

          {buildState === 'done' && result && (
            <ResultsPanel
              result={result}
              reverseIndex={reverseIndex}
              pages={pages}
              mode={mode}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              durationMs={durationMs}
            />
          )}
        </main>
      </div>
    </div>
  );
}
