import type { ProgressInfo } from 'react-native-pageindex';
import type { BuildMode } from '../App';

interface Props {
  progressList: ProgressInfo[];
  current: ProgressInfo | null;
  mode: BuildMode;
}

export default function ProgressDisplay({ progressList, current, mode }: Props) {
  const pct = current?.percent ?? 0;

  return (
    <div className="progress-wrap">
      <div className="progress-header">
        <div className="progress-title">
          {mode === 'keyword' ? '🔍 Building Keyword Index…' : '🤖 Building LLM Index…'}
        </div>
        <div className="progress-subtitle">
          {mode === 'keyword'
            ? 'Parsing CSV and extracting keywords — no LLM calls'
            : 'Analysing document structure with your LLM provider'}
        </div>
      </div>

      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-percent">{pct}%</div>

      {current && (
        <div className="progress-step-current">
          {current.step}
          {current.detail && (
            <div className="progress-step-detail">{current.detail}</div>
          )}
        </div>
      )}

      {progressList.length > 0 && (
        <div className="progress-log">
          {progressList.map((p, i) => {
            const isActive = p.step === current?.step;
            return (
              <div key={i} className={`progress-log-item ${isActive ? 'active' : 'done'}`}>
                <div className={`progress-log-dot ${isActive ? 'dot-active' : 'dot-done'}`} />
                <span style={{ flex: 1 }}>{p.step}</span>
                {p.detail && <span style={{ fontSize: 11, opacity: 0.7 }}>{p.detail}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
