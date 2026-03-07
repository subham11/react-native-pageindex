# react-native-pageindex

[![npm version](https://img.shields.io/npm/v/react-native-pageindex.svg)](https://www.npmjs.com/package/react-native-pageindex)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Vectorless, reasoning-based RAG** — builds a hierarchical tree index from any document using any LLM provider. Works in React Native, Node.js, and the browser.

No vector database required. Instead of embeddings, the library uses the LLM to *reason* about document structure, producing a navigable tree that lets your AI answer questions with precise source attribution.

---

## Features

| Feature | Detail |
|---|---|
| **Multi-format** | PDF, Word (.docx), CSV, Spreadsheet (.xlsx/.xls), Markdown |
| **Forward index** | Hierarchical tree: chapters → sections → subsections |
| **Reverse index** | Inverted index: term → node locations for fast lookup |
| **Provider-agnostic** | Pass any LLM (OpenAI, Anthropic, Ollama, Gemini…) |
| **Progress tracking** | Fine-grained per-step callbacks (13 PDF steps, 8 MD steps) |
| **Fully typed** | 100% TypeScript, `.d.ts` declarations included |
| **Optional deps** | pdfjs-dist / mammoth / xlsx are opt-in; CSV & MD have zero deps |

---

## Installation

```bash
npm install react-native-pageindex
```

### Optional format dependencies

Install only what you need:

```bash
# PDF support
npm install pdfjs-dist

# Word .docx support
npm install mammoth

# Excel / spreadsheet support
npm install xlsx
```

---

## Quick Start

### 1. Wire up your LLM provider

```ts
import OpenAI from 'openai';
import { LLMProvider } from 'react-native-pageindex';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const llm: LLMProvider = async (prompt, opts) => {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      ...(opts?.chatHistory ?? []),
      { role: 'user', content: prompt },
    ],
  });
  return {
    content: res.choices[0].message.content ?? '',
    finishReason: res.choices[0].finish_reason ?? 'stop',
  };
};
```

### 2. Index any document

```ts
import { pageIndexDocument } from 'react-native-pageindex';
import { readFileSync } from 'fs';

// Works with PDF, DOCX, XLSX, CSV, or Markdown
const data = readFileSync('report.pdf');

const result = await pageIndexDocument({
  data,
  fileName: 'report.pdf',   // used to auto-detect format
  docName: 'Annual Report 2024',
  llm,
  options: {
    onProgress: ({ step, percent, detail }) =>
      console.log(`[${percent}%] ${step}${detail ? ` — ${detail}` : ''}`),
  },
});

console.log(result.structure);  // hierarchical tree
```

### 3. Build a reverse index for fast search

```ts
import { buildReverseIndex, searchReverseIndex } from 'react-native-pageindex';

const reverseIndex = await buildReverseIndex({
  result,          // forward index from pageIndexDocument()
  options: {
    mode: 'keyword',   // 'keyword' (fast, no LLM) | 'llm' (semantic)
  },
});

const hits = searchReverseIndex(reverseIndex, 'revenue growth', 5);
// hits[0] = { nodeTitle, nodeId, score, matchedTerm, totalScore, ... }
```

---

## API

### `pageIndexDocument(input)` — Unified entrypoint

Accepts any supported file format and returns a hierarchical `PageIndexResult`.

```ts
interface PageIndexDocumentInput {
  data?:     ArrayBuffer | Uint8Array | string;  // binary for PDF/DOCX/XLSX; string for CSV/MD
  text?:     string;                             // convenience alias for Markdown / CSV
  fileType?: 'pdf' | 'docx' | 'csv' | 'xlsx' | 'md';  // inferred from fileName if omitted
  fileName?: string;
  docName?:  string;
  llm:       LLMProvider;
  options?:  PageIndexDocumentOptions;
}
```

`PageIndexDocumentOptions`:

| Option | Type | Default | Description |
|---|---|---|---|
| `onProgress` | `ProgressCallback` | — | Per-step progress updates |
| `pdfOptions` | `PageIndexOptions` | — | Forwarded to the PDF pipeline |
| `mdOptions` | `MdPageIndexOptions` | — | Forwarded to the Markdown pipeline |
| `csvOptions` | `CsvParseOptions` | — | CSV row-grouping & delimiter options |
| `xlsxOptions` | `XlsxParseOptions` | — | XLSX sheet selection & row-grouping |
| `tokenCounter` | `TokenCounter` | `~4 chars/token` | Custom tokeniser |

---

### `pageIndex(input)` — PDF pipeline (direct)

Use when you already have extracted pages or want PDF-specific options.

```ts
import { pageIndex, extractPdfPages } from 'react-native-pageindex';

const pages = await extractPdfPages(pdfBuffer);   // requires pdfjs-dist

const result = await pageIndex({ pages, llm, docName: 'Report' });
```

`PageIndexOptions`:

| Option | Default | Description |
|---|---|---|
| `tocCheckPageNum` | `20` | Pages to scan for table of contents |
| `maxPageNumEachNode` | `10` | Max pages per tree node |
| `maxTokenNumEachNode` | `20000` | Max tokens per tree node |
| `ifAddNodeId` | `true` | Attach unique IDs to each node |
| `ifAddNodeSummary` | `true` | LLM-generated summary per node |
| `ifAddDocDescription` | `false` | Generate overall document description |
| `ifAddNodeText` | `false` | Attach raw page text to nodes |

---

### `pageIndexMd(input)` — Markdown pipeline (direct)

```ts
import { pageIndexMd } from 'react-native-pageindex';

const result = await pageIndexMd({
  content: markdownString,
  docName: 'README',
  llm,
  options: { ifThinning: true, minTokenThreshold: 3000 },
});
```

`MdPageIndexOptions`:

| Option | Default | Description |
|---|---|---|
| `ifThinning` | `false` | Merge small sections below threshold |
| `minTokenThreshold` | `5000` | Min tokens before thinning kicks in |
| `ifAddNodeSummary` | `true` | LLM-generated summary per node |
| `summaryTokenThreshold` | `200` | Only summarise nodes above this size |
| `ifAddDocDescription` | `false` | Generate overall document description |
| `ifAddNodeText` | `false` | Attach raw section text to nodes |

---

### `buildReverseIndex(input)` — Inverted index

```ts
const reverseIndex = await buildReverseIndex({
  result,          // PageIndexResult
  pages?,          // original PageData[] (optional enrichment)
  llm?,            // required only for mode: 'llm'
  options?: {
    mode: 'keyword' | 'llm',   // default: 'keyword'
    minTermLength: number,      // default: 3
    maxTermsPerNode: number,    // default: 10
    onProgress: ProgressCallback,
  },
});
```

---

### `searchReverseIndex(index, query, topK?)` — Query the index

```ts
const results = searchReverseIndex(reverseIndex, 'machine learning', 10);

// SearchResult[]
results.forEach(r => {
  console.log(r.nodeTitle, r.totalScore, r.matchedTerm);
});
```

---

### Format parsers (lower-level)

```ts
import {
  extractPdfPages,   // requires pdfjs-dist
  extractDocxPages,  // requires mammoth
  extractCsvPages,   // no deps
  extractXlsxPages,  // requires xlsx
} from 'react-native-pageindex';

// All return: Promise<PageData[]>
// PageData = { text: string; tokenCount: number }
```

---

### Key Types

```ts
// LLM provider — wire up any AI
type LLMProvider = (
  prompt: string,
  options?: { chatHistory?: LLMMessage[] }
) => Promise<{ content: string; finishReason: string }>;

// Progress tracking
type ProgressCallback = (info: {
  step: string;
  percent: number;
  detail?: string;
}) => void;

// Forward index result
interface PageIndexResult {
  structure: TreeNode;    // root of the hierarchy
  doc_name: string;
  description?: string;
}

// Tree node
interface TreeNode {
  title?: string;
  node_id?: string;
  summary?: string;
  start_index?: number;
  end_index?: number;
  children?: TreeNode[];
  [key: string]: unknown;
}

// Reverse index search result
interface SearchResult extends ReverseIndexEntry {
  matchedTerm: string;
  totalScore: number;
}
```

---

## Progress Tracking

Both pipelines emit fine-grained progress events:

```ts
options: {
  onProgress: ({ step, percent, detail }) => {
    // PDF pipeline steps (0–100%):
    // Initializing → Extracting PDF pages → Scanning for table of contents
    // → Transforming TOC → Mapping page numbers → Building tree
    // → Verifying TOC → Fixing inaccuracies → Resolving large sections
    // → Attaching page text → Generating node summaries
    // → Generating document description → Done

    // Markdown pipeline steps:
    // Initializing → Parsing headings → Extracting section text
    // → Optimizing tree → Building tree → Generating summaries
    // → Generating description → Done

    updateProgressBar(percent);
    setStatusText(`${step}${detail ? ': ' + detail : ''}`);
  },
}
```

---

## LLM Provider Examples

### Anthropic Claude

```ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const llm: LLMProvider = async (prompt) => {
  const msg = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  const block = msg.content[0];
  return {
    content: block.type === 'text' ? block.text : '',
    finishReason: msg.stop_reason ?? 'stop',
  };
};
```

### Ollama (local)

```ts
const llm: LLMProvider = async (prompt) => {
  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama3', prompt, stream: false }),
  });
  const data = await res.json();
  return { content: data.response, finishReason: 'stop' };
};
```

### Google Gemini

```ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

const llm: LLMProvider = async (prompt) => {
  const result = await model.generateContent(prompt);
  return {
    content: result.response.text(),
    finishReason: 'stop',
  };
};
```

---

## React Native Usage

```ts
// Use RNFS or fetch to get file bytes
import RNFS from 'react-native-fs';
import { pageIndexDocument } from 'react-native-pageindex';

const base64 = await RNFS.readFile(filePath, 'base64');
const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

const result = await pageIndexDocument({
  data: bytes,
  fileName: 'document.pdf',
  llm,
  options: { onProgress: setProgress },
});
```

> **Note:** pdfjs-dist has a web worker that may need special Metro configuration.
> Alternatively, pass pre-extracted `pages: PageData[]` directly to `pageIndex()` to skip pdfjs entirely.

---

## Versioning

This package follows [Semantic Versioning](https://semver.org/):

- **Patch** (`0.1.x`) — bug fixes, no API changes
- **Minor** (`0.x.0`) — new features, backward compatible
- **Major** (`x.0.0`) — breaking changes to the public API

---

## License

MIT © [subham11](https://github.com/subham11)
