import type { PageData } from 'react-native-pageindex';

interface Props {
  pages: PageData[];
}

export default function RawPages({ pages }: Props) {
  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        The CSV was split into <strong>{pages.length} page chunks</strong> of 10 rows each
        by <code>extractCsvPages()</code>. Each chunk becomes one unit of context for the index.
      </p>
      <div className="pages-grid">
        {pages.map((page, i) => (
          <div className="page-card" key={i}>
            <div className="page-card-header">
              <span className="page-card-title">
                Page {i + 1} — Farmers {i * 10 + 1}–{Math.min((i + 1) * 10, 100)}
              </span>
              <span className="page-card-tokens">{page.tokenCount} tokens</span>
            </div>
            <pre className="page-card-text">{page.text}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
