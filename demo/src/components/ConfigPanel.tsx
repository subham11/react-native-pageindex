import type { BuildMode, BuildState } from '../App';
import type { LLMConfig, ProviderType } from '../llm';
import { DEFAULT_MODELS, PROVIDER_LABELS } from '../llm';

interface Props {
  mode: BuildMode;
  setMode: (m: BuildMode) => void;
  llmConfig: LLMConfig;
  setLlmConfig: (c: LLMConfig) => void;
  buildState: BuildState;
  onBuild: () => void;
}

const PROVIDERS: ProviderType[] = ['openai', 'anthropic', 'ollama'];

const MODELS: Record<ProviderType, string[]> = {
  openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-3-5-haiku-20241022'],
  ollama:    ['llama3', 'llama3:8b', 'mistral', 'mixtral', 'phi3', 'gemma2'],
};

export default function ConfigPanel({ mode, setMode, llmConfig, setLlmConfig, buildState, onBuild }: Props) {
  const isBuilding = buildState === 'building';

  function upd<K extends keyof LLMConfig>(key: K, val: LLMConfig[K]) {
    setLlmConfig({ ...llmConfig, [key]: val });
  }

  function handleProviderChange(provider: ProviderType) {
    setLlmConfig({
      ...llmConfig,
      provider,
      model: DEFAULT_MODELS[provider],
    });
  }

  const needsKey = llmConfig.provider !== 'ollama';
  const canBuild =
    mode === 'keyword' ||
    (llmConfig.apiKey.trim().length > 0 || llmConfig.provider === 'ollama');

  return (
    <>
      {/* Dataset */}
      <div>
        <div className="card-title">Dataset</div>
        <div className="dataset-info">
          <span className="dataset-icon">🗂️</span>
          <div>
            <div className="dataset-name">farmer_dataset.csv</div>
            <div className="dataset-meta">100 farmers · 14 columns</div>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* Mode */}
      <div>
        <div className="card-title">Index Mode</div>
        <div className="mode-toggle">
          <button
            className={`mode-btn ${mode === 'keyword' ? 'active' : ''}`}
            onClick={() => setMode('keyword')}
            disabled={isBuilding}
          >
            <span className="mode-btn-icon">🔍</span>
            Keyword
            <br />
            <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.8 }}>No API key</span>
          </button>
          <button
            className={`mode-btn ${mode === 'llm' ? 'active' : ''}`}
            onClick={() => setMode('llm')}
            disabled={isBuilding}
          >
            <span className="mode-btn-icon">🤖</span>
            Full LLM
            <br />
            <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.8 }}>API key req.</span>
          </button>
        </div>
      </div>

      {/* LLM Config — shown only in LLM mode */}
      {mode === 'llm' && (
        <>
          <div className="divider" />
          <div>
            <div className="card-title">LLM Configuration</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              <div className="field">
                <label>Provider</label>
                <select
                  className="select"
                  value={llmConfig.provider}
                  onChange={e => handleProviderChange(e.target.value as ProviderType)}
                  disabled={isBuilding}
                >
                  {PROVIDERS.map(p => (
                    <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Model</label>
                <select
                  className="select"
                  value={llmConfig.model}
                  onChange={e => upd('model', e.target.value)}
                  disabled={isBuilding}
                >
                  {MODELS[llmConfig.provider].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {needsKey && (
                <div className="field">
                  <label>API Key</label>
                  <input
                    type="password"
                    className="input input-mono"
                    placeholder={llmConfig.provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
                    value={llmConfig.apiKey}
                    onChange={e => upd('apiKey', e.target.value)}
                    disabled={isBuilding}
                  />
                  <span className="input-hint">Stored in memory only, never sent elsewhere</span>
                </div>
              )}

              {llmConfig.provider === 'ollama' && (
                <div className="field">
                  <label>Ollama URL</label>
                  <input
                    type="text"
                    className="input input-mono"
                    value={llmConfig.ollamaUrl}
                    onChange={e => upd('ollamaUrl', e.target.value)}
                    disabled={isBuilding}
                  />
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div className="divider" />

      {/* What will happen */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        {mode === 'keyword' ? (
          <>
            <strong>Keyword mode:</strong><br />
            ① Parse CSV into 10-row pages<br />
            ② Build flat PageIndexResult<br />
            ③ Extract keyword terms (TF scoring)<br />
            ④ Enable full-text search
          </>
        ) : (
          <>
            <strong>LLM mode:</strong><br />
            ① Parse CSV into 10-row pages<br />
            ② Detect TOC / document structure<br />
            ③ Build hierarchical tree via LLM<br />
            ④ Generate summaries per node<br />
            ⑤ Build keyword reverse index
          </>
        )}
      </div>

      {/* Build button */}
      <button
        className="btn btn-primary btn-full"
        onClick={onBuild}
        disabled={isBuilding || !canBuild}
      >
        {isBuilding ? (
          <><span className="spinner" /> Building…</>
        ) : (
          <>{mode === 'keyword' ? '🔍 Build Keyword Index' : '🚀 Build LLM Index'}</>
        )}
      </button>

      {mode === 'llm' && !canBuild && (
        <p style={{ fontSize: 11, color: 'var(--red)', textAlign: 'center' }}>
          Enter an API key to continue
        </p>
      )}
    </>
  );
}
