import { useRef, useState, useCallback } from 'react';
import type { BuildMode, BuildState, DataSource } from '../App';
import type { LLMConfig, ProviderType } from '../llm';
import { DEFAULT_MODELS, PROVIDER_LABELS } from '../llm';
import { getSupportedFileType } from '../demoExtractors';

interface Props {
  mode: BuildMode;
  setMode: (m: BuildMode) => void;
  llmConfig: LLMConfig;
  setLlmConfig: (c: LLMConfig) => void;
  buildState: BuildState;
  onBuild: () => void;
  // Data source
  dataSource: DataSource;
  setDataSource: (s: DataSource) => void;
  uploadedFile: File | null;
  setUploadedFile: (f: File | null) => void;
}

const PROVIDERS: ProviderType[] = ['openai', 'anthropic', 'ollama'];

const MODELS: Record<ProviderType, string[]> = {
  openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-3-5-haiku-20241022'],
  ollama:    ['llama3', 'llama3:8b', 'mistral', 'mixtral', 'phi3', 'gemma2'],
};

const ACCEPTED_EXTS = '.pdf,.html,.htm,.csv,.md,.txt';
const UNSUPPORTED_FORMATS = new Set(['docx', 'xlsx']);

export default function ConfigPanel({
  mode, setMode, llmConfig, setLlmConfig, buildState, onBuild,
  dataSource, setDataSource, uploadedFile, setUploadedFile,
}: Props) {
  const isBuilding = buildState === 'building';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function upd<K extends keyof LLMConfig>(key: K, val: LLMConfig[K]) {
    setLlmConfig({ ...llmConfig, [key]: val });
  }

  function handleProviderChange(provider: ProviderType) {
    setLlmConfig({ ...llmConfig, provider, model: DEFAULT_MODELS[provider] });
  }

  const handleFileSelect = useCallback((file: File) => {
    const type = getSupportedFileType(file.name);
    if (!type) {
      alert('Unsupported file type. Please upload a PDF, HTML, CSV, Markdown, or TXT file.');
      return;
    }
    setUploadedFile(file);
  }, [setUploadedFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    // Reset so re-selecting same file still fires
    e.target.value = '';
  }, [handleFileSelect]);

  const uploadedFileType = uploadedFile ? getSupportedFileType(uploadedFile.name) : null;
  const isUnsupported = uploadedFileType ? UNSUPPORTED_FORMATS.has(uploadedFileType) : false;

  const needsKey = llmConfig.provider !== 'ollama';
  const hasKey   = llmConfig.apiKey.trim().length > 0 || llmConfig.provider === 'ollama';
  const hasFile  = dataSource !== 'upload' || (uploadedFile !== null && !isUnsupported);
  const canBuild = !isBuilding && (mode === 'keyword' || hasKey) && hasFile;

  // Human-friendly description of what steps will run
  const sourceLabel =
    dataSource === 'sample_csv' ? 'CSV' :
    dataSource === 'sample_pdf' ? 'PDF' :
    uploadedFileType === 'pdf'  ? 'PDF' :
    (uploadedFileType === 'html' || uploadedFileType === 'md' || uploadedFileType === 'txt') ? 'Markdown/HTML' :
    'CSV';

  return (
    <>
      {/* ── Data Source ──────────────────────────────────────────────────── */}
      <div>
        <div className="card-title">Data Source</div>
        <div className="source-toggle">
          {(['sample_csv', 'sample_pdf', 'upload'] as DataSource[]).map((src) => (
            <button
              key={src}
              className={`source-btn ${dataSource === src ? 'active' : ''}`}
              onClick={() => setDataSource(src)}
              disabled={isBuilding}
            >
              <span className="source-btn-icon">
                {src === 'sample_csv' ? '📊' : src === 'sample_pdf' ? '📄' : '📁'}
              </span>
              {src === 'sample_csv' ? 'Sample CSV' : src === 'sample_pdf' ? 'Sample PDF' : 'Upload'}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 10 }}>
          {dataSource === 'sample_csv' && (
            <div className="dataset-info">
              <span className="dataset-icon">🗂️</span>
              <div>
                <div className="dataset-name">farmer_dataset.csv</div>
                <div className="dataset-meta">100 farmers · 14 columns</div>
              </div>
            </div>
          )}

          {dataSource === 'sample_pdf' && (
            <div className="sample-pdf-info">
              <div className="sample-pdf-name">📄 crop_production_guide.pdf</div>
              <div className="sample-pdf-meta">~32 pages · 7 chapters · has TOC</div>
              <a
                className="sample-pdf-download"
                href="/crop_production_guide.pdf"
                download
              >
                ⬇ Download sample PDF
              </a>
            </div>
          )}

          {dataSource === 'upload' && (
            <>
              {/* Hidden native file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTS}
                style={{ display: 'none' }}
                onChange={handleInputChange}
              />

              {/* Drop zone */}
              <div
                className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <div className="drop-zone-icon">☁️</div>
                <div className="drop-zone-text">
                  {dragOver ? 'Drop it!' : 'Click or drag a file here'}
                </div>
                <div className="drop-zone-hint">PDF · HTML · CSV · Markdown · TXT</div>
              </div>

              {/* Selected file */}
              {uploadedFile && (
                <div className="file-selected">
                  <span style={{ fontSize: 16 }}>
                    {uploadedFileType === 'pdf' ? '📄' :
                     uploadedFileType === 'html' ? '🌐' :
                     uploadedFileType === 'csv' ? '📊' : '📝'}
                  </span>
                  <span className="file-selected-name">{uploadedFile.name}</span>
                  <button
                    className="file-selected-clear"
                    onClick={(e) => { e.stopPropagation(); setUploadedFile(null); }}
                    title="Remove file"
                  >✕</button>
                </div>
              )}

              {/* Warning for unsupported formats */}
              {isUnsupported && (
                <div className="format-warning" style={{ marginTop: 8 }}>
                  ⚠️ DOCX / XLSX require optional dependencies not installed in the browser demo.
                  Please convert to PDF, HTML, CSV or Markdown.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="divider" />

      {/* ── Index Mode ───────────────────────────────────────────────────── */}
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

      {/* ── LLM Config ───────────────────────────────────────────────────── */}
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

      {/* ── Pipeline description ──────────────────────────────────────────── */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>
        {mode === 'keyword' ? (
          <>
            <strong>Keyword mode ({sourceLabel}):</strong><br />
            ① Parse document into pages<br />
            ② Build flat PageIndexResult<br />
            ③ Extract keyword terms (TF scoring)<br />
            ④ Enable full-text search
          </>
        ) : (
          <>
            <strong>LLM mode ({sourceLabel}):</strong><br />
            ① Parse document into pages<br />
            {sourceLabel === 'CSV' ? (
              <>② Detect document structure<br /></>
            ) : (
              <>② Detect TOC / section hierarchy<br /></>
            )}
            ③ Build hierarchical tree via LLM<br />
            ④ Generate summaries per node<br />
            ⑤ Build keyword reverse index
          </>
        )}
      </div>

      {/* ── Build button ─────────────────────────────────────────────────── */}
      <button
        className="btn btn-primary btn-full"
        onClick={onBuild}
        disabled={!canBuild}
      >
        {isBuilding ? (
          <><span className="spinner" /> Building…</>
        ) : (
          <>{mode === 'keyword' ? '🔍 Build Keyword Index' : '🚀 Build LLM Index'}</>
        )}
      </button>

      {mode === 'llm' && !hasKey && (
        <p style={{ fontSize: 11, color: 'var(--red)', textAlign: 'center' }}>
          Enter an API key to continue
        </p>
      )}
      {dataSource === 'upload' && !uploadedFile && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
          Select a file to index
        </p>
      )}
    </>
  );
}
