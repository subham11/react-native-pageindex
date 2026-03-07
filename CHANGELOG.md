# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] — 2026-03-07

### Added
- Initial release — TypeScript port of the Python PageIndex project
- **`pageIndex()`** — PDF hierarchical tree index pipeline (13-step with progress)
- **`pageIndexMd()`** — Markdown hierarchical tree index pipeline (8-step with progress)
- **`pageIndexDocument()`** — Unified multi-format entrypoint; auto-detects format from filename
- **`buildReverseIndex()`** — Inverted index from a forward-index result; `'keyword'` and `'llm'` modes
- **`searchReverseIndex()`** — Multi-term query with partial-match scoring
- **Format parsers:**
  - `extractPdfPages()` — PDF via pdfjs-dist (optional dep)
  - `extractDocxPages()` — DOCX via mammoth (optional dep)
  - `extractCsvPages()` — CSV, pure JS, zero dependencies
  - `extractXlsxPages()` — XLSX / XLS via SheetJS (optional dep)
- **Progress tracking** — `onProgress` callback on all pipelines and `buildReverseIndex`
- **Provider-agnostic LLM** — pass any `LLMProvider` callback (OpenAI, Anthropic, Ollama, Gemini…)
- Full TypeScript types and `.d.ts` declarations
