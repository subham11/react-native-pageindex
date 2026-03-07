/**
 * Reverse (inverted) index — maps terms → tree nodes that contain them.
 *
 * Two modes:
 *   'keyword' — fast, no LLM. Extracts stopword-filtered terms with TF scoring.
 *   'llm'     — slower, semantic. Uses LLM to extract concept terms per node.
 */

import type {
  PageIndexResult,
  PageData,
  LLMProvider,
  ReverseIndex,
  ReverseIndexEntry,
  ReverseIndexOptions,
  SearchResult,
  TreeNode,
} from './types';
import { getNodes } from './utils/tree';

// ─── Stopwords ────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'not',
  'this', 'that', 'these', 'those', 'it', 'its', 'we', 'our', 'you',
  'your', 'he', 'she', 'they', 'their', 'my', 'his', 'her', 'which',
  'who', 'what', 'when', 'where', 'how', 'if', 'then', 'so', 'than',
  'more', 'also', 'about', 'into', 'up', 'out', 'no', 'all', 'each',
  'any', 'some', 'other', 'new', 'one', 'two', 'such', 'only', 'over',
  'after', 'before', 'between', 'through', 'during', 'including', 'without',
  'within', 'along', 'following', 'across', 'behind', 'beyond', 'plus',
  'except', 'however', 'therefore', 'thus', 'hence', 'while', 'although',
  'because', 'since', 'unless', 'until', 'whether', 'both', 'either',
  'neither', 'per', 'via', 'etc', 'ie', 'eg',
]);

// ─── Keyword Extraction ───────────────────────────────────────────────────────

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, '').trim())
    .filter(Boolean);
}

function extractKeywords(
  text: string,
  minLength: number,
): Map<string, number> {
  const tokens = tokenise(text);
  const tf = new Map<string, number>();

  for (const token of tokens) {
    if (token.length < minLength) continue;
    if (STOPWORDS.has(token)) continue;
    if (/^\d+$/.test(token)) continue; // pure numbers
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }

  return tf;
}

// Normalise TF into 0-1 score (log-normalised)
function normaliseTf(count: number, maxCount: number): number {
  if (maxCount === 0) return 0;
  return Math.log1p(count) / Math.log1p(maxCount);
}

// ─── LLM Prompt ───────────────────────────────────────────────────────────────

function buildLlmPrompt(nodeTitle: string, nodeSummary: string, maxTerms: number): string {
  return `Extract up to ${maxTerms} key concepts, named entities, or important terms from the section below.
Return a JSON array of strings only — short terms or phrases (1–4 words each), no duplicates, no stopwords.

Section title: ${nodeTitle}
Section summary: ${nodeSummary}

Respond with ONLY a JSON array, e.g.: ["machine learning", "gradient descent", "neural network"]`;
}

async function extractLlmTerms(
  node: TreeNode,
  llm: LLMProvider,
  maxTerms: number,
): Promise<string[]> {
  const title = node.title ?? '';
  const summary = node.summary ?? node.prefix_summary ?? node.text ?? '';
  if (!title && !summary) return [];

  const prompt = buildLlmPrompt(title, summary, maxTerms);
  try {
    const result = await llm(prompt);
    const match = result.content.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[])
      .filter((t) => typeof t === 'string')
      .map((t) => (t as string).toLowerCase().trim())
      .filter((t) => t.length >= 2)
      .slice(0, maxTerms);
  } catch {
    return [];
  }
}

// ─── Node Text for Keyword Mode ───────────────────────────────────────────────

function nodeTextForKeywords(node: TreeNode): string {
  const parts: string[] = [];
  if (node.title) parts.push(node.title, node.title); // weight title 2x
  if (node.summary) parts.push(node.summary);
  if (node.prefix_summary) parts.push(node.prefix_summary);
  if (node.text) parts.push(node.text);
  return parts.join(' ');
}

// ─── Build Reverse Index ──────────────────────────────────────────────────────

/**
 * Builds an inverted index from a `PageIndexResult`.
 *
 * In **keyword** mode (default), terms are extracted via stopword-filtered TF
 * scoring — fast, no LLM calls needed.
 *
 * In **llm** mode, the LLM extracts semantic concept terms from each node's
 * title + summary — slower but catches synonyms/concepts.
 *
 * @param result   The forward-index output from `pageIndex()` / `pageIndexMd()`
 * @param pages    Original page data (optional; used for extra keyword signal)
 * @param llm      LLM provider (required for mode 'llm')
 * @param options  Index options
 */
export async function buildReverseIndex(input: {
  result: PageIndexResult;
  pages?: PageData[];
  llm?: LLMProvider;
  options?: ReverseIndexOptions;
}): Promise<ReverseIndex> {
  const { result, llm, options = {} } = input;
  const {
    mode = 'keyword',
    minTermLength = 3,
    maxTermsPerNode = 10,
    onProgress,
  } = options;

  if (mode === 'llm' && !llm) {
    throw new Error('[PageIndex] LLM provider is required when mode is "llm"');
  }

  // Flatten tree into leaf + branch nodes (all nodes)
  const nodes = getNodes(result.structure);

  const terms: Record<string, ReverseIndexEntry[]> = {};

  const total = nodes.length;

  for (let i = 0; i < total; i++) {
    const node = nodes[i];

    onProgress?.({
      step: mode === 'llm' ? 'Extracting concepts via LLM' : 'Extracting keywords',
      percent: Math.round((i / total) * 90),
      detail: `Node ${i + 1} / ${total}: ${node.title ?? ''}`,
    });

    const entry: ReverseIndexEntry = {
      nodeId: node.node_id,
      nodeTitle: node.title ?? '',
      startIndex: node.start_index,
      endIndex: node.end_index,
      score: 0, // filled in below
    };

    if (mode === 'keyword') {
      const text = nodeTextForKeywords(node);
      const tf = extractKeywords(text, minTermLength);

      if (tf.size === 0) continue;

      const maxCount = Math.max(...tf.values());

      // Keep top-N by count
      const sorted = [...tf.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxTermsPerNode);

      for (const [term, count] of sorted) {
        const score = normaliseTf(count, maxCount);
        const entryWithScore: ReverseIndexEntry = { ...entry, score };
        if (!terms[term]) terms[term] = [];
        terms[term].push(entryWithScore);
      }
    } else {
      // LLM mode
      const termList = await extractLlmTerms(node, llm!, maxTermsPerNode);

      for (let rank = 0; rank < termList.length; rank++) {
        const term = termList[rank];
        // Score decays with position (first term most important)
        const score = 1 - rank / termList.length;
        const entryWithScore: ReverseIndexEntry = { ...entry, score };
        if (!terms[term]) terms[term] = [];
        terms[term].push(entryWithScore);
      }
    }
  }

  // Sort each term's entries by score descending
  for (const term of Object.keys(terms)) {
    terms[term].sort((a, b) => b.score - a.score);
  }

  onProgress?.({
    step: 'Reverse index complete',
    percent: 100,
    detail: `${Object.keys(terms).length} terms across ${total} nodes`,
  });

  return {
    docName: result.doc_name,
    terms,
    stats: {
      totalTerms: Object.keys(terms).length,
      totalNodes: total,
      indexMode: mode,
      indexedAt: new Date().toISOString(),
    },
  };
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Queries the reverse index for one or more terms.
 * Multi-word queries are split and each term is looked up separately;
 * nodes matching multiple terms get a combined score boost.
 *
 * @param index  The reverse index (from `buildReverseIndex`)
 * @param query  Free-text query string
 * @param topK   Max results to return (default: 10)
 */
export function searchReverseIndex(
  index: ReverseIndex,
  query: string,
  topK = 10,
): SearchResult[] {
  const queryTerms = tokenise(query).filter(
    (t) => t.length >= 2 && !STOPWORDS.has(t),
  );

  if (queryTerms.length === 0) return [];

  // nodeId (or nodeTitle as fallback) → combined result
  const combined = new Map<string, SearchResult>();

  for (const qTerm of queryTerms) {
    // Exact match
    const exactHits = index.terms[qTerm] ?? [];
    // Prefix / partial match
    const partialHits: ReverseIndexEntry[] = [];
    for (const [term, entries] of Object.entries(index.terms)) {
      if (term !== qTerm && term.includes(qTerm)) {
        partialHits.push(
          ...entries.map((e) => ({ ...e, score: e.score * 0.6 })), // partial penalty
        );
      }
    }

    const allHits = [...exactHits, ...partialHits];

    for (const hit of allHits) {
      const key = hit.nodeId ?? hit.nodeTitle;
      const existing = combined.get(key);
      if (existing) {
        existing.totalScore += hit.score;
        // keep the best individual term score
        if (hit.score > existing.score) {
          existing.score = hit.score;
          existing.matchedTerm = qTerm;
        }
      } else {
        combined.set(key, {
          ...hit,
          matchedTerm: qTerm,
          totalScore: hit.score,
        });
      }
    }
  }

  return [...combined.values()]
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, topK);
}
