import type { PageIndexResult, PageData, ReverseIndex } from 'react-native-pageindex';
import type { BuildMode, ActiveTab } from '../App';
import TreeView from './TreeView';
import SearchPanel from './SearchPanel';
import RawPages from './RawPages';

interface Props {
  result: PageIndexResult;
  reverseIndex: ReverseIndex | null;
  pages: PageData[];
  mode: BuildMode;
  activeTab: ActiveTab;
  setActiveTab: (t: ActiveTab) => void;
  durationMs: number;
}

function countNodes(node: object): number {
  const n = node as { children?: object[] };
  if (!n.children) return 1;
  return 1 + n.children.reduce((s, c) => s + countNodes(c), 0);
}

export default function ResultsPanel({
  result, reverseIndex, pages, mode, activeTab, setActiveTab, durationMs,
}: Props) {
  const nodeCount = countNodes(result.structure as object);
  const termCount = reverseIndex?.stats.totalTerms ?? 0;
  const sec = (durationMs / 1000).toFixed(1);

  const tabs = [
    { id: 'tree' as ActiveTab,   label: '🌲 Tree View' },
    { id: 'search' as ActiveTab, label: '🔍 Search',  disabled: !reverseIndex },
    { id: 'pages' as ActiveTab,  label: '📄 Raw Pages' },
  ];

  return (
    <div>
      {/* Stats bar */}
      <div className="stats-bar">
        <div className="stat-pill">
          <span className="stat-pill-value">{nodeCount}</span>
          <span className="stat-pill-label">nodes</span>
        </div>
        <div className="stat-pill">
          <span className="stat-pill-value">{pages.length}</span>
          <span className="stat-pill-label">pages</span>
        </div>
        {termCount > 0 && (
          <div className="stat-pill">
            <span className="stat-pill-value">{termCount.toLocaleString()}</span>
            <span className="stat-pill-label">indexed terms</span>
          </div>
        )}
        <div className="stat-pill">
          <span className="stat-pill-value">{sec}s</span>
          <span className="stat-pill-label">build time</span>
        </div>
        <div className="stat-pill">
          <span
            className="stat-pill-value"
            style={{ color: mode === 'llm' ? 'var(--blue)' : 'var(--green)' }}
          >
            {mode === 'keyword' ? '🔍 Keyword' : '🤖 LLM'}
          </span>
          <span className="stat-pill-label">mode</span>
        </div>
        {result.description && (
          <div className="stat-pill">
            <span className="stat-pill-value">✓</span>
            <span className="stat-pill-label">doc description</span>
          </div>
        )}
      </div>

      {/* Document description (LLM mode) */}
      {result.description && (
        <div style={{
          padding: '10px 14px', marginBottom: 16,
          background: 'var(--blue-light)', border: '1px solid #bfdbfe',
          borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--text)',
          lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--blue)' }}>Document description: </strong>
          {result.description}
        </div>
      )}

      {/* Tab bar */}
      <div className="tab-bar">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => !t.disabled && setActiveTab(t.id)}
            disabled={t.disabled}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'tree' && (
        <TreeView structure={result.structure} />
      )}

      {activeTab === 'search' && reverseIndex && (
        <SearchPanel reverseIndex={reverseIndex} />
      )}

      {activeTab === 'pages' && (
        <RawPages pages={pages} />
      )}
    </div>
  );
}
