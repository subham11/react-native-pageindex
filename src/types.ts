// ─── LLM Provider ────────────────────────────────────────────────────────────

/** A single message in a chat conversation */
export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** The finish reason returned by the LLM */
export type LLMFinishReason = 'stop' | 'length' | string;

/** The result of an LLM call */
export interface LLMResult {
  content: string;
  finishReason: LLMFinishReason;
}

/**
 * Provider-agnostic LLM callback.
 * Wire up OpenAI, Anthropic, Ollama, or any other provider here.
 *
 * @example
 * const llm: LLMProvider = async (prompt, opts) => {
 *   const response = await openai.chat.completions.create({
 *     model: 'gpt-4o',
 *     messages: [
 *       ...(opts?.chatHistory ?? []),
 *       { role: 'user', content: prompt },
 *     ],
 *   });
 *   return {
 *     content: response.choices[0].message.content ?? '',
 *     finishReason: response.choices[0].finish_reason ?? 'stop',
 *   };
 * };
 */
export type LLMProvider = (
  prompt: string,
  options?: { chatHistory?: LLMMessage[] },
) => Promise<LLMResult>;

// ─── Progress Reporting ───────────────────────────────────────────────────────

/** Emitted at every major milestone during processing */
export interface ProgressInfo {
  /** Human-readable description of the current step */
  step: string;
  /** Overall progress 0–100 */
  percent: number;
  /** Optional extra detail, e.g. "Page 3 / 45" or "Node 2 / 8" */
  detail?: string;
}

export type ProgressCallback = (info: ProgressInfo) => void;

// ─── Token Counting ───────────────────────────────────────────────────────────

/**
 * Returns the approximate number of tokens in `text`.
 * Default implementation: Math.ceil(text.length / 4)
 * Plug in `js-tiktoken` or similar for exact counts.
 */
export type TokenCounter = (text: string) => number;

// ─── Page Data ───────────────────────────────────────────────────────────────

/** Text and token count for a single document page */
export interface PageData {
  text: string;
  tokenCount: number;
}

// ─── Tree Structure ───────────────────────────────────────────────────────────

/** A node in the hierarchical tree index */
export interface TreeNode {
  title: string;
  node_id?: string;
  start_index?: number;
  end_index?: number;
  summary?: string;
  prefix_summary?: string;
  text?: string;
  nodes?: TreeNode[];
  // Internal fields used during processing (stripped from output)
  structure?: string;
  physical_index?: number | null;
  appear_start?: string;
  list_index?: number;
  page?: number | null;
}

/** The final output of pageIndex() or pageIndexMd() */
export interface PageIndexResult {
  doc_name: string;
  doc_description?: string;
  structure: TreeNode[];
}

// ─── Supported Document Types ────────────────────────────────────────────────

/** File formats supported by pageIndexDocument() */
export type DocumentFileType = 'pdf' | 'docx' | 'csv' | 'xlsx' | 'md';

/** Options for CSV parsing */
export interface CsvParseOptions {
  /** Column delimiter (default: auto-detect from ',', ';', '\t') */
  delimiter?: string;
  /** Rows per page-chunk (default: 100) */
  rowsPerPage?: number;
  /** Treat first row as header (default: true) */
  hasHeader?: boolean;
}

/** Options for XLSX parsing */
export interface XlsxParseOptions {
  /** Sheet names to include (default: all sheets) */
  sheets?: string[];
  /** Max rows per sheet-chunk (default: 200) */
  rowsPerChunk?: number;
}

// ─── Reverse Index ────────────────────────────────────────────────────────────

/** A single reverse-index hit — points back to the tree node that contains the term */
export interface ReverseIndexEntry {
  nodeId?: string;
  nodeTitle: string;
  /** Start page of the node (1-based) */
  startIndex?: number;
  /** End page of the node (1-based) */
  endIndex?: number;
  /**
   * Relevance score 0–1.
   * Keyword mode: TF-based score.
   * LLM mode: LLM-assigned importance.
   */
  score: number;
}

/** The complete reverse (inverted) index for one document */
export interface ReverseIndex {
  docName: string;
  /**
   * Maps every indexed term → list of nodes that contain it, sorted by score desc.
   * Keys are lowercase, normalised terms.
   */
  terms: Record<string, ReverseIndexEntry[]>;
  stats: {
    totalTerms: number;
    totalNodes: number;
    indexMode: 'keyword' | 'llm';
    indexedAt: string;
  };
}

/** A ranked search result returned by searchReverseIndex() */
export interface SearchResult extends ReverseIndexEntry {
  /** The term that matched the query */
  matchedTerm: string;
  /** Combined score when multiple terms match */
  totalScore: number;
}

/** Options for building the reverse index */
export interface ReverseIndexOptions {
  /**
   * 'keyword' — fast, no LLM calls, extracts terms via stopword-filtered TF
   * 'llm'     — slower, semantic; uses LLM to extract concepts per node
   * default: 'keyword'
   */
  mode?: 'keyword' | 'llm';
  /** Minimum term length to index (default: 3) */
  minTermLength?: number;
  /** Max number of terms to extract per node in LLM mode (default: 10) */
  maxTermsPerNode?: number;
  /** Called at each major milestone */
  onProgress?: ProgressCallback;
}

// ─── Configuration ────────────────────────────────────────────────────────────

/** Options for the PDF pipeline */
export interface PageIndexOptions {
  /** Number of pages to scan for an existing Table of Contents (default: 20) */
  tocCheckPageNum?: number;
  /** Max pages a single tree node may span before sub-indexing (default: 10) */
  maxPageNumEachNode?: number;
  /** Max tokens a single tree node may contain before sub-indexing (default: 20000) */
  maxTokenNumEachNode?: number;
  /** Whether to add a sequential node_id to each node (default: true) */
  ifAddNodeId?: boolean;
  /** Whether to generate an LLM summary for each node (default: true) */
  ifAddNodeSummary?: boolean;
  /** Whether to generate a one-sentence document description (default: false) */
  ifAddDocDescription?: boolean;
  /** Whether to include raw page text in each node (default: false) */
  ifAddNodeText?: boolean;
  /** Custom token counting function (default: ~4 chars/token approximation) */
  tokenCounter?: TokenCounter;
  /** Called at each major processing milestone with step name and 0–100 percent */
  onProgress?: ProgressCallback;
}

/** Options for the Markdown pipeline */
export interface MdPageIndexOptions {
  /** Whether to merge small nodes together (default: false) */
  ifThinning?: boolean;
  /** Minimum token threshold for thinning (default: 5000) */
  minTokenThreshold?: number;
  /** Whether to generate an LLM summary for each node (default: true) */
  ifAddNodeSummary?: boolean;
  /** Token threshold below which raw text is used instead of generating a summary (default: 200) */
  summaryTokenThreshold?: number;
  /** Whether to generate a one-sentence document description (default: false) */
  ifAddDocDescription?: boolean;
  /** Whether to include raw text in each node (default: false) */
  ifAddNodeText?: boolean;
  /** Whether to add a sequential node_id to each node (default: true) */
  ifAddNodeId?: boolean;
  /** Custom token counting function */
  tokenCounter?: TokenCounter;
  /** Called at each major processing milestone with step name and 0–100 percent */
  onProgress?: ProgressCallback;
}
