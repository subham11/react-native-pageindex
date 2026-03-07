/**
 * Unified multi-format document indexing entrypoint.
 *
 * Accepts PDF, DOCX, CSV, XLSX, or Markdown data and routes to the correct
 * parser + pipeline automatically.
 *
 * Supported formats:
 *   pdf   — requires pdfjs-dist (optional)
 *   docx  — requires mammoth (optional)
 *   csv   — no extra deps
 *   xlsx  — requires xlsx / SheetJS (optional)
 *   md    — no extra deps
 */

import type {
  DocumentFileType,
  LLMProvider,
  PageData,
  PageIndexOptions,
  PageIndexResult,
  MdPageIndexOptions,
  CsvParseOptions,
  XlsxParseOptions,
  ProgressCallback,
  TokenCounter,
} from './types';

import { pageIndex } from './pageIndex';
import { pageIndexMd } from './pageIndexMd';
import { extractPdfPages } from './utils/pdf';
import { extractDocxPages } from './parsers/docx';
import { extractCsvPages } from './parsers/csv';
import { extractXlsxPages } from './parsers/xlsx';

// ─── Option Types ─────────────────────────────────────────────────────────────

/** Options specific to a document type, combined in one bag */
export interface PageIndexDocumentOptions {
  /** Options forwarded to the PDF/DOCX/CSV/XLSX pipeline (shared with pageIndex) */
  pdfOptions?: PageIndexOptions;
  /** Options forwarded to the Markdown pipeline */
  mdOptions?: MdPageIndexOptions;
  /** Options for CSV parsing */
  csvOptions?: CsvParseOptions;
  /** Options for XLSX parsing */
  xlsxOptions?: XlsxParseOptions;
  /** Custom token counter */
  tokenCounter?: TokenCounter;
  /** Progress callback */
  onProgress?: ProgressCallback;
}

/** Input for the unified indexing entrypoint */
export interface PageIndexDocumentInput {
  /**
   * Raw file bytes (for pdf / docx / xlsx).
   * Pass a `string` for csv or md (UTF-8 text).
   * Exactly one of `data` or `text` is required for each format.
   */
  data?: ArrayBuffer | Uint8Array | string;
  /** Convenience alias — pass Markdown/CSV content as a string */
  text?: string;
  /** File format. If omitted, inferred from `fileName`. */
  fileType?: DocumentFileType;
  /** File name — used to infer `fileType` when not supplied explicitly */
  fileName?: string;
  /** Human-readable document name used in the index result */
  docName?: string;
  /** LLM provider callback */
  llm: LLMProvider;
  /** All format-specific and pipeline options */
  options?: PageIndexDocumentOptions;
}

// ─── File Type Inference ──────────────────────────────────────────────────────

function inferFileType(fileName?: string): DocumentFileType | null {
  if (!fileName) return null;
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'pdf';
    case 'docx': return 'docx';
    case 'csv': return 'csv';
    case 'xlsx':
    case 'xls':
    case 'ods': return 'xlsx';
    case 'md':
    case 'markdown': return 'md';
    default: return null;
  }
}

// ─── Main Entrypoint ──────────────────────────────────────────────────────────

/**
 * Index any supported document format and return a hierarchical `PageIndexResult`.
 *
 * @example
 * // PDF from bytes
 * const result = await pageIndexDocument({
 *   data: pdfBuffer,
 *   fileType: 'pdf',
 *   docName: 'Annual Report 2024',
 *   llm: myLlmProvider,
 * });
 *
 * @example
 * // Markdown string
 * const result = await pageIndexDocument({
 *   text: markdownString,
 *   fileType: 'md',
 *   docName: 'README',
 *   llm: myLlmProvider,
 * });
 *
 * @example
 * // DOCX with progress tracking
 * const result = await pageIndexDocument({
 *   data: docxBuffer,
 *   fileName: 'contract.docx',
 *   docName: 'Service Contract',
 *   llm: myLlmProvider,
 *   options: {
 *     onProgress: (info) => console.log(info.step, info.percent + '%'),
 *   },
 * });
 */
export async function pageIndexDocument(
  input: PageIndexDocumentInput,
): Promise<PageIndexResult> {
  const {
    data,
    text,
    fileType: explicitType,
    fileName,
    docName,
    llm,
    options = {},
  } = input;

  const {
    pdfOptions,
    mdOptions,
    csvOptions,
    xlsxOptions,
    tokenCounter,
    onProgress,
  } = options;

  // Resolve file type
  const fileType = explicitType ?? inferFileType(fileName);
  if (!fileType) {
    throw new Error(
      '[PageIndex] Cannot determine file type. ' +
        'Provide `fileType` or a `fileName` with a recognised extension (.pdf, .docx, .csv, .xlsx, .md).',
    );
  }

  // ── Markdown ────────────────────────────────────────────────────────────────
  if (fileType === 'md') {
    const content = text ?? (typeof data === 'string' ? data : null);
    if (!content) {
      throw new Error('[PageIndex] Markdown input requires a string. Pass `text` or `data` as a string.');
    }
    return pageIndexMd({
      content,
      docName,
      llm,
      options: {
        ...mdOptions,
        tokenCounter: tokenCounter ?? mdOptions?.tokenCounter,
        onProgress: onProgress ?? mdOptions?.onProgress,
      },
    });
  }

  // ── Extract pages from binary formats ───────────────────────────────────────

  let pages: PageData[];

  const bytes = data instanceof ArrayBuffer || data instanceof Uint8Array
    ? data
    : null;

  if (!bytes) {
    throw new Error(
      `[PageIndex] File type "${fileType}" requires binary data. Pass \`data\` as ArrayBuffer or Uint8Array.`,
    );
  }

  onProgress?.({ step: 'Parsing document', percent: 0, detail: fileType.toUpperCase() });

  switch (fileType) {
    case 'pdf':
      pages = await extractPdfPages(bytes, tokenCounter);
      break;

    case 'docx':
      pages = await extractDocxPages(bytes, tokenCounter);
      break;

    case 'csv': {
      // CSV can be passed as raw bytes or as a string
      const csvData = text ?? data;
      if (csvData == null) {
        throw new Error('[PageIndex] CSV input requires `data` or `text`.');
      }
      pages = await extractCsvPages(csvData, csvOptions, tokenCounter);
      break;
    }

    case 'xlsx':
      pages = await extractXlsxPages(bytes, xlsxOptions, tokenCounter);
      break;

    default: {
      const _exhaustive: never = fileType;
      throw new Error(`[PageIndex] Unsupported file type: ${String(_exhaustive)}`);
    }
  }

  // ── Build page index from extracted pages ────────────────────────────────────
  return pageIndex({
    pages,
    docName,
    llm,
    options: {
      ...pdfOptions,
      tokenCounter: tokenCounter ?? pdfOptions?.tokenCounter,
      onProgress: onProgress ?? pdfOptions?.onProgress,
    },
  });
}
