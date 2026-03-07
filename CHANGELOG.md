# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.1] — 2026-03-08

### Fixed
- **`pageIndex.ts`** — LLM errors were silently swallowed by the retry loop and replaced with the generic `"Max retries reached"` message. The real underlying error (e.g., `"OpenAI 401: Incorrect API key"`) is now surfaced in full.
- **`pageIndex.ts`** — `429` rate-limit errors now parse the provider's `"Please try again in Xs"` hint and wait the correct delay (+ 500 ms buffer) before retrying. Previously all retries waited a flat 1 s regardless of the rate-limit window.
- **`pageIndex.ts`** — Fatal errors (HTTP 400 / 401 / 403 / 404, "Invalid API key", etc.) now break out of the retry loop immediately instead of wasting 10 × 1 s.
- **`pageIndexDocument.ts`** — Binary-data guard fired too early, causing `"File type 'csv' requires binary data"` when passing CSV as a plain string. Guard is now inside the individual `pdf` / `docx` / `xlsx` branches only.
- **`reverseIndex.ts`** — `buildReverseIndex` now correctly traverses the `TreeNode.nodes` field (Python convention) instead of `children`. Previously only 2 terms were indexed when using keyword mode with a flat CSV result.

### Added
- `examples/pdf-openai.ts` — Runnable example: index a PDF with OpenAI gpt-4o-mini.
- `examples/markdown-anthropic.ts` — Runnable example: index Markdown with Anthropic Claude Haiku + keyword search.
- `examples/csv-keyword.ts` — Runnable example: CSV keyword index with no LLM required.

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
