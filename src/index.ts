/**
 * react-native-pageindex
 *
 * Vectorless, reasoning-based RAG — builds a hierarchical tree index from
 * PDF or Markdown documents using any LLM provider.
 *
 * @example — Quick start with OpenAI
 * ```ts
 * import { pageIndex, pageIndexMd } from 'react-native-pageindex';
 * import OpenAI from 'openai';
 *
 * const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 *
 * // LLM provider callback (works with any AI provider)
 * const llm = async (prompt, opts) => {
 *   const res = await openai.chat.completions.create({
 *     model: 'gpt-4o',
 *     messages: [
 *       ...(opts?.chatHistory ?? []),
 *       { role: 'user', content: prompt },
 *     ],
 *   });
 *   return {
 *     content: res.choices[0].message.content ?? '',
 *     finishReason: res.choices[0].finish_reason ?? 'stop',
 *   };
 * };
 *
 * // PDF (pre-extracted pages)
 * const result = await pageIndex({ pages: myPages, llm, docName: 'report' });
 *
 * // Markdown
 * const result = await pageIndexMd({ content: markdownString, llm });
 * ```
 */

// Main APIs
export { pageIndex } from './pageIndex';
export { pageIndexMd } from './pageIndexMd';

// Unified multi-format entrypoint
export { pageIndexDocument } from './pageIndexDocument';
export type { PageIndexDocumentInput, PageIndexDocumentOptions } from './pageIndexDocument';

// Reverse / inverted index
export { buildReverseIndex, searchReverseIndex } from './reverseIndex';

// Format-specific parsers (each requires an optional dep — see README)
export { extractPdfPages } from './utils/pdf';
export { extractDocxPages } from './parsers/docx';
export { extractCsvPages } from './parsers/csv';
export { extractXlsxPages } from './parsers/xlsx';

// Types
export type {
  PageData,
  LLMMessage,
  LLMResult,
  LLMFinishReason,
  LLMProvider,
  TokenCounter,
  ProgressInfo,
  ProgressCallback,
  TreeNode,
  PageIndexResult,
  PageIndexOptions,
  MdPageIndexOptions,
  DocumentFileType,
  CsvParseOptions,
  XlsxParseOptions,
  ReverseIndex,
  ReverseIndexEntry,
  SearchResult,
  ReverseIndexOptions,
} from './types';

// Utilities (useful for downstream tree-search / RAG pipelines)
export { defaultTokenCounter } from './utils/tokens';
export { extractJson, getJsonContent } from './utils/json';
export {
  writeNodeId,
  structureToList,
  getNodes,
  getLeafNodes,
  addNodeText,
  removeStructureText,
  removeFields,
  deepClone,
} from './utils/tree';
