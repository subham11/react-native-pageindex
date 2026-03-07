import { useState, useDeferredValue } from 'react';
import { searchReverseIndex, type ReverseIndex, type SearchResult } from 'react-native-pageindex';

interface Props {
  reverseIndex: ReverseIndex;
}

export default function SearchPanel({ reverseIndex }: Props) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const results: SearchResult[] =
    deferredQuery.trim().length >= 2
      ? searchReverseIndex(reverseIndex, deferredQuery, 20)
      : [];

  const totalTerms = reverseIndex.stats.totalTerms;
  const totalNodes = reverseIndex.stats.totalNodes;

  return (
    <div>
      <p className="search-hint">
        Index covers <strong>{totalTerms.toLocaleString()} terms</strong> across{' '}
        <strong>{totalNodes} nodes</strong> ({reverseIndex.stats.indexMode} mode).
        Search by crop, state, soil type, risk level, or any value from the dataset.
      </p>

      {/* Suggested queries */}
      <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {['paddy', 'jute', 'odisha', 'high risk', 'clay', 'alluvial', 'wheat', 'sugarcane'].map(s => (
          <button
            key={s}
            className="btn btn-outline btn-sm"
            onClick={() => setQuery(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="search-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Search e.g. paddy, high risk, clay soil, odisha…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        {query && (
          <button className="btn btn-outline" onClick={() => setQuery('')}>✕</button>
        )}
      </div>

      {query.trim().length > 0 && query.trim().length < 2 && (
        <p className="search-empty">Type at least 2 characters to search…</p>
      )}

      {deferredQuery.trim().length >= 2 && results.length === 0 && (
        <p className="search-empty">No results found for "<strong>{deferredQuery}</strong>"</p>
      )}

      {results.length > 0 && (
        <>
          <p className="search-count">
            {results.length} result{results.length !== 1 ? 's' : ''} for "{deferredQuery}"
          </p>
          <div className="search-results">
            {results.map((r, i) => (
              <SearchResultCard key={i} result={r} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SearchResultCard({ result }: { result: SearchResult }) {
  const score = Math.round(result.totalScore * 100);
  const relevance =
    score >= 80 ? 'High' :
    score >= 50 ? 'Medium' : 'Low';
  const relevanceColor =
    score >= 80 ? 'var(--green-dark)' :
    score >= 50 ? 'var(--orange)' : 'var(--text-muted)';

  return (
    <div className="search-result">
      <div className="search-result-header">
        <span className="search-result-title">{result.nodeTitle}</span>
        <span className="search-result-term">"{result.matchedTerm}"</span>
        <span className="search-result-score" style={{ color: relevanceColor }}>
          {relevance} ({score}%)
        </span>
      </div>
      <div className="search-result-meta">
        {result.nodeId && (
          <span className="badge badge-blue">{result.nodeId}</span>
        )}
        {result.startIndex != null && result.endIndex != null && (
          <span className="badge badge-orange">
            pages {result.startIndex}–{result.endIndex}
          </span>
        )}
        <span className="badge badge-green">
          score {result.totalScore.toFixed(3)}
        </span>
      </div>
    </div>
  );
}
