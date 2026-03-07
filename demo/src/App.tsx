import { useState, useCallback } from 'react';
import {
  pageIndex,
  pageIndexMd,
  pageIndexDocument,
  extractCsvPages,
  buildReverseIndex,
  defaultTokenCounter,
  type PageIndexResult,
  type PageData,
  type ReverseIndex,
  type ProgressInfo,
} from 'react-native-pageindex';
import { createLLMProvider, type LLMConfig, DEFAULT_MODELS } from './llm';
import {
  extractPdfPagesFromBuffer,
  htmlToMarkdown,
  readFileAsText,
  readFileAsArrayBuffer,
  getSupportedFileType,
} from './demoExtractors';
import Header from './components/Header';
import ConfigPanel from './components/ConfigPanel';
import ProgressDisplay from './components/ProgressDisplay';
import ResultsPanel from './components/ResultsPanel';

export type BuildMode  = 'keyword' | 'llm';
export type BuildState = 'idle' | 'building' | 'done' | 'error';
export type ActiveTab  = 'tree' | 'search' | 'pages';
export type DataSource = 'sample_csv' | 'sample_pdf' | 'upload';

// ─── Constants ────────────────────────────────────────────────────────────────
const CSV_URL = '/farmer_dataset.csv';
const PDF_URL = '/crop_production_guide.pdf';
const ROWS_PER_PAGE  = 10;
const TOKENS_PER_PAGE = 600;   // for text/html/md chunking in keyword mode

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Flat PageIndexResult for keyword mode — CSV pages */
function makeCsvResult(pages: PageData[], docName: string): PageIndexResult {
  return {
    doc_name: docName,
    structure: pages.map((page, i) => ({
      title: `Rows ${i * ROWS_PER_PAGE + 1}–${(i + 1) * ROWS_PER_PAGE}`,
      node_id: `group_${i}`,
      text: page.text,
      start_index: i,
      end_index: i,
    })),
  };
}

/** Flat PageIndexResult for keyword mode — PDF pages */
function makePdfResult(pages: PageData[], docName: string): PageIndexResult {
  return {
    doc_name: docName,
    structure: pages.map((page, i) => ({
      title: `Page ${i + 1}`,
      node_id: `page_${i + 1}`,
      text: page.text,
      start_index: i + 1,
      end_index: i + 1,
    })),
  };
}

/** Split plain text into ~TOKENS_PER_PAGE-token PageData chunks */
function textToPages(text: string, tokensPerPage = TOKENS_PER_PAGE): PageData[] {
  const paras = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  const pages: PageData[] = [];
  let buf: string[] = [];
  let bufTokens = 0;

  for (const para of paras) {
    const t = Math.ceil(para.length / 4);
    if (bufTokens + t > tokensPerPage && buf.length > 0) {
      const txt = buf.join('\n\n');
      pages.push({ text: txt, tokenCount: defaultTokenCounter(txt) });
      buf = [];
      bufTokens = 0;
    }
    buf.push(para);
    bufTokens += t;
  }
  if (buf.length > 0) {
    const txt = buf.join('\n\n');
    pages.push({ text: txt, tokenCount: defaultTokenCounter(txt) });
  }
  return pages.length > 0 ? pages : [{ text, tokenCount: defaultTokenCounter(text) }];
}

/** Flat PageIndexResult for keyword mode — text/md/html chunks */
function makeTextResult(pages: PageData[], docName: string): PageIndexResult {
  return {
    doc_name: docName,
    structure: pages.map((page, i) => ({
      title: `Section ${i + 1}`,
      node_id: `sec_${i + 1}`,
      text: page.text,
      start_index: i + 1,
      end_index: i + 1,
    })),
  };
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [mode, setMode]           = useState<BuildMode>('keyword');
  const [dataSource, setDataSource] = useState<DataSource>('sample_csv');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    provider: 'openai',
    apiKey: '',
    model: DEFAULT_MODELS.openai,
    ollamaUrl: 'http://localhost:11434',
  });
  const [buildState, setBuildState]       = useState<BuildState>('idle');
  const [progressList, setProgressList]   = useState<ProgressInfo[]>([]);
  const [currentProgress, setCurrentProgress] = useState<ProgressInfo | null>(null);
  const [result, setResult]               = useState<PageIndexResult | null>(null);
  const [reverseIndex, setReverseIndex]   = useState<ReverseIndex | null>(null);
  const [pages, setPages]                 = useState<PageData[]>([]);
  const [error, setError]                 = useState<string | null>(null);
  const [activeTab, setActiveTab]         = useState<ActiveTab>('tree');
  const [durationMs, setDurationMs]       = useState(0);

  const report = useCallback((info: ProgressInfo) => {
    setCurrentProgress(info);
    setProgressList(prev => {
      const idx = prev.findIndex(p => p.step === info.step);
      if (idx !== -1) {
        const next = [...prev]; next[idx] = info; return next;
      }
      return [...prev, info];
    });
  }, []);

  // ─── Build pipeline ────────────────────────────────────────────────────────
  const handleBuild = useCallback(async () => {
    setBuildState('building');
    setProgressList([]);
    setCurrentProgress(null);
    setResult(null);
    setReverseIndex(null);
    setError(null);
    const t0 = Date.now();

    try {
      // ── Resolve file type & raw data ──────────────────────────────────────
      let docName = 'Document';
      let pdfBuffer: ArrayBuffer | null = null;
      let textContent: string | null = null;
      // Use string to avoid TypeScript control-flow narrowing across branches
      let resolvedType: string = 'csv';

      if (dataSource === 'sample_csv') {
        report({ step: 'Loading dataset', percent: 2, detail: 'Fetching farmer_dataset.csv' });
        const res = await fetch(CSV_URL);
        if (!res.ok) throw new Error(`Failed to load CSV: ${res.statusText}`);
        textContent = await res.text();
        resolvedType = 'csv';
        docName = 'Farmer Dataset';

      } else if (dataSource === 'sample_pdf') {
        report({ step: 'Loading PDF', percent: 2, detail: 'Fetching crop_production_guide.pdf' });
        const res = await fetch(PDF_URL);
        if (!res.ok) throw new Error(`Failed to load PDF: ${res.statusText}`);
        pdfBuffer = await res.arrayBuffer();
        resolvedType = 'pdf';
        docName = 'Crop Production Guide';

      } else {
        // ── Uploaded file ───────────────────────────────────────────────────
        if (!uploadedFile) throw new Error('No file selected');
        const fileType = getSupportedFileType(uploadedFile.name);
        if (!fileType) throw new Error(`Unsupported file type: ${uploadedFile.name}`);

        docName = uploadedFile.name.replace(/\.[^.]+$/, '');
        report({ step: 'Reading file', percent: 2, detail: uploadedFile.name });

        if (fileType === 'pdf') {
          pdfBuffer = await readFileAsArrayBuffer(uploadedFile);
          resolvedType = 'pdf';
        } else {
          textContent = await readFileAsText(uploadedFile);
          resolvedType = fileType as typeof resolvedType;
        }
      }

      // ── Extract pages for PDF ─────────────────────────────────────────────
      let pdfPages: PageData[] = [];
      if (pdfBuffer) {
        report({ step: 'Extracting PDF text', percent: 8, detail: 'Reading PDF pages via pdfjs-dist' });
        pdfPages = await extractPdfPagesFromBuffer(pdfBuffer, defaultTokenCounter);
      }

      // ── Convert HTML → Markdown ───────────────────────────────────────────
      let markdownContent: string | null = null;
      if (resolvedType === 'html' && textContent) {
        report({ step: 'Converting HTML', percent: 6, detail: 'HTML → Markdown via DOMParser' });
        markdownContent = htmlToMarkdown(textContent);
      } else if (resolvedType === 'md' || resolvedType === 'txt') {
        markdownContent = textContent;
      }

      // ═════════════════════════════════════════════════════════════════════
      // KEYWORD MODE
      // ═════════════════════════════════════════════════════════════════════
      if (mode === 'keyword') {

        if (resolvedType === 'csv' && textContent) {
          // ── CSV keyword ──────────────────────────────────────────────────
          report({ step: 'Parsing CSV', percent: 10, detail: `Splitting into ${ROWS_PER_PAGE}-row pages` });
          const csvPages = await extractCsvPages(textContent, { rowsPerPage: ROWS_PER_PAGE });
          setPages(csvPages);

          report({ step: 'Building flat index', percent: 25, detail: `${csvPages.length} page groups` });
          const flatResult = makeCsvResult(csvPages, docName);
          setResult(flatResult);

          const ri = await buildReverseIndex({
            result: flatResult, pages: csvPages,
            options: { mode: 'keyword', minTermLength: 3, maxTermsPerNode: 30, onProgress: report },
          });
          setReverseIndex(ri);

        } else if (resolvedType === 'pdf') {
          // ── PDF keyword ──────────────────────────────────────────────────
          setPages(pdfPages);
          report({ step: 'Building flat index', percent: 30, detail: `${pdfPages.length} pages extracted` });
          const flatResult = makePdfResult(pdfPages, docName);
          setResult(flatResult);

          const ri = await buildReverseIndex({
            result: flatResult, pages: pdfPages,
            options: { mode: 'keyword', minTermLength: 3, maxTermsPerNode: 40, onProgress: report },
          });
          setReverseIndex(ri);

        } else if (markdownContent) {
          // ── HTML / MD / TXT keyword ──────────────────────────────────────
          report({ step: 'Chunking text', percent: 10, detail: `Splitting into ~${TOKENS_PER_PAGE}-token sections` });
          const textPages = textToPages(markdownContent);
          setPages(textPages);

          report({ step: 'Building flat index', percent: 25, detail: `${textPages.length} sections` });
          const flatResult = makeTextResult(textPages, docName);
          setResult(flatResult);

          const ri = await buildReverseIndex({
            result: flatResult, pages: textPages,
            options: { mode: 'keyword', minTermLength: 3, maxTermsPerNode: 40, onProgress: report },
          });
          setReverseIndex(ri);
        }

      // ═════════════════════════════════════════════════════════════════════
      // LLM MODE
      // ═════════════════════════════════════════════════════════════════════
      } else {
        const llm = createLLMProvider(llmConfig);

        if (resolvedType === 'csv' && textContent) {
          // ── CSV LLM ──────────────────────────────────────────────────────
          const indexResult = await pageIndexDocument({
            text: textContent, fileType: 'csv', docName, llm,
            options: { csvOptions: { rowsPerPage: ROWS_PER_PAGE }, onProgress: report },
          });
          setResult(indexResult);

          const csvPages = await extractCsvPages(textContent, { rowsPerPage: ROWS_PER_PAGE });
          setPages(csvPages);

          const ri = await buildReverseIndex({
            result: indexResult, pages: csvPages,
            options: { mode: 'keyword', minTermLength: 3, maxTermsPerNode: 25, onProgress: report },
          });
          setReverseIndex(ri);

        } else if (resolvedType === 'pdf') {
          // ── PDF LLM ──────────────────────────────────────────────────────
          // Pre-extract pages (we already have them) and pass directly to pageIndex
          // to avoid pdfjs worker issues inside the library's internal extractor.
          report({ step: 'Building LLM index', percent: 10, detail: `${pdfPages.length} pages → LLM tree` });
          const indexResult = await pageIndex({
            pages: pdfPages, llm, docName,
            options: { onProgress: report },
          });
          setResult(indexResult);
          setPages(pdfPages);

          const ri = await buildReverseIndex({
            result: indexResult, pages: pdfPages,
            options: { mode: 'keyword', minTermLength: 3, maxTermsPerNode: 30, onProgress: report },
          });
          setReverseIndex(ri);

        } else if (markdownContent) {
          // ── HTML / MD / TXT LLM ──────────────────────────────────────────
          const indexResult = await pageIndexMd({
            content: markdownContent, docName, llm,
            options: { onProgress: report },
          });
          setResult(indexResult);

          // Generate pages for the Pages tab (chunk for display)
          const textPages = textToPages(markdownContent);
          setPages(textPages);

          const ri = await buildReverseIndex({
            result: indexResult, pages: textPages,
            options: { mode: 'keyword', minTermLength: 3, maxTermsPerNode: 30, onProgress: report },
          });
          setReverseIndex(ri);
        }
      }

      setDurationMs(Date.now() - t0);
      setBuildState('done');
      setActiveTab('tree');

    } catch (e) {
      console.error('[PageIndex demo]', e);
      setError(e instanceof Error ? e.message : String(e));
      setBuildState('error');
    }
  }, [mode, dataSource, uploadedFile, llmConfig, report]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <Header />
      <div className="layout">
        <aside className="sidebar">
          <ConfigPanel
            mode={mode}             setMode={setMode}
            llmConfig={llmConfig}   setLlmConfig={setLlmConfig}
            buildState={buildState} onBuild={handleBuild}
            dataSource={dataSource} setDataSource={setDataSource}
            uploadedFile={uploadedFile} setUploadedFile={setUploadedFile}
          />
        </aside>

        <main className="content">
          {buildState === 'idle' && (
            <div className="empty-state">
              <div className="empty-icon">🌾</div>
              <h2>PageIndex Demo</h2>
              <p>
                Choose a data source and index mode, then click <strong>Build Index</strong> to see{' '}
                <code>react-native-pageindex</code> in action.
              </p>
              <div className="empty-features">
                <div className="feature">
                  <span>📊</span>
                  <span><strong>Sample CSV</strong> — 100 farmers · 14 columns</span>
                </div>
                <div className="feature">
                  <span>📄</span>
                  <span>
                    <strong>Sample PDF</strong> — 32-page farming guide with TOC
                    (ideal for LLM mode!)
                  </span>
                </div>
                <div className="feature">
                  <span>📁</span>
                  <span><strong>Upload</strong> — PDF, HTML, CSV, Markdown, or TXT</span>
                </div>
                <div className="feature">
                  <span>🔍</span>
                  <span><strong>Keyword mode</strong> — fast, no API key needed</span>
                </div>
                <div className="feature">
                  <span>🤖</span>
                  <span><strong>LLM mode</strong> — semantic tree + summaries via any LLM</span>
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
