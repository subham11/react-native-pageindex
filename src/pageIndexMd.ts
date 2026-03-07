/**
 * Markdown pipeline — port of pageindex/page_index_md.py
 *
 * Parses a Markdown string by its heading hierarchy (#, ##, ### …) and
 * builds a nested tree index, optionally generating LLM summaries.
 */

import type { LLMProvider, MdPageIndexOptions, PageIndexResult, TreeNode } from './types';
import { DEFAULT_MD_OPTIONS } from './config';
import { defaultTokenCounter } from './utils/tokens';
import { extractJson } from './utils/json';
import { ProgressReporter } from './utils/progress';
import {
  structureToList,
  writeNodeId,
  formatStructure,
  createCleanStructureForDescription,
} from './utils/tree';

// ─── Markdown Pipeline Steps (in order) ──────────────────────────────────────

const MD_STEPS = [
  'Initializing',
  'Parsing document headings',
  'Extracting section text',
  'Optimizing tree structure',
  'Building tree',
  'Generating node summaries',
  'Generating document description',
  'Done',
] as const;

// ─── Internal Types ───────────────────────────────────────────────────────────

interface RawNode {
  node_title: string;
  line_num: number;
}

interface ProcessedNode extends TreeNode {
  level: number;
  line_num: number;
  text_token_count?: number;
}

// ─── LLM Helpers ─────────────────────────────────────────────────────────────

async function generateNodeSummary(node: TreeNode, llm: LLMProvider): Promise<string> {
  const prompt = `You are given a part of a document, your task is to generate a description of the partial document about what are main points covered in the partial document.

Partial Document Text: ${node.text}

Directly return the description, do not include any other text.`;
  const result = await llm(prompt);
  return result.content;
}

async function getNodeSummary(
  node: TreeNode,
  summaryTokenThreshold: number,
  llm: LLMProvider,
  counter: (text: string) => number,
): Promise<string> {
  const text = node.text ?? '';
  return counter(text) < summaryTokenThreshold ? text : generateNodeSummary(node, llm);
}

async function generateSummariesForStructureMd(
  structure: TreeNode[],
  summaryTokenThreshold: number,
  llm: LLMProvider,
  counter: (text: string) => number,
  pr: ProgressReporter,
): Promise<TreeNode[]> {
  const nodes = structureToList(structure);
  pr.report('Generating node summaries', `0 / ${nodes.length} nodes`);
  let done = 0;
  const summaries = await Promise.all(
    nodes.map(async (node) => {
      const summary = await getNodeSummary(node, summaryTokenThreshold, llm, counter);
      done++;
      pr.advance('Generating node summaries', `${done} / ${nodes.length} nodes`);
      return summary;
    }),
  );
  for (let i = 0; i < nodes.length; i++) {
    if (!nodes[i].nodes || nodes[i].nodes!.length === 0) {
      nodes[i].summary = summaries[i];
    } else {
      nodes[i].prefix_summary = summaries[i];
    }
  }
  return structure;
}

async function generateDocDescription(
  structure: TreeNode | TreeNode[],
  llm: LLMProvider,
  pr: ProgressReporter,
): Promise<string> {
  pr.report('Generating document description');
  const prompt = `Your are an expert in generating descriptions for a document.
You are given a structure of a document. Your task is to generate a one-sentence description for the document, which makes it easy to distinguish the document from other documents.

Document Structure: ${JSON.stringify(structure)}

Directly return the description, do not include any other text.`;
  const result = await llm(prompt);
  return result.content;
}

// ─── Markdown Parsing ─────────────────────────────────────────────────────────

function extractNodesFromMarkdown(
  markdownContent: string,
): { nodeList: RawNode[]; lines: string[] } {
  const headerPattern = /^(#{1,6})\s+(.+)$/;
  const codeBlockPattern = /^```/;
  const nodeList: RawNode[] = [];
  const lines = markdownContent.split('\n');
  let inCodeBlock = false;

  for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
    const stripped = lines[lineNum - 1].trim();
    if (codeBlockPattern.test(stripped)) { inCodeBlock = !inCodeBlock; continue; }
    if (!stripped) continue;
    if (!inCodeBlock) {
      const match = headerPattern.exec(stripped);
      if (match) nodeList.push({ node_title: match[2].trim(), line_num: lineNum });
    }
  }
  return { nodeList, lines };
}

function extractNodeTextContent(nodeList: RawNode[], markdownLines: string[]): ProcessedNode[] {
  const allNodes: ProcessedNode[] = [];
  for (const node of nodeList) {
    const lineContent = markdownLines[node.line_num - 1];
    const headerMatch = /^(#{1,6})/.exec(lineContent);
    if (!headerMatch) { console.warn(`[PageIndex] Line ${node.line_num} is not a valid header`); continue; }
    allNodes.push({ title: node.node_title, line_num: node.line_num, level: headerMatch[1].length } as ProcessedNode);
  }
  for (let i = 0; i < allNodes.length; i++) {
    const startLine = allNodes[i].line_num - 1;
    const endLine = i + 1 < allNodes.length ? allNodes[i + 1].line_num - 1 : markdownLines.length;
    allNodes[i].text = markdownLines.slice(startLine, endLine).join('\n').trim();
  }
  return allNodes;
}

// ─── Tree Thinning ────────────────────────────────────────────────────────────

function findAllChildren(parentIndex: number, parentLevel: number, nodeList: ProcessedNode[]): number[] {
  const children: number[] = [];
  for (let i = parentIndex + 1; i < nodeList.length; i++) {
    if (nodeList[i].level <= parentLevel) break;
    children.push(i);
  }
  return children;
}

function updateNodeListWithTextTokenCount(
  nodeList: ProcessedNode[],
  counter: (text: string) => number,
): ProcessedNode[] {
  const result = [...nodeList];
  for (let i = result.length - 1; i >= 0; i--) {
    const children = findAllChildren(i, result[i].level, result);
    let totalText = result[i].text ?? '';
    for (const ci of children) { const ct = result[ci].text ?? ''; if (ct) totalText += '\n' + ct; }
    result[i].text_token_count = counter(totalText);
  }
  return result;
}

function treeThinningForIndex(
  nodeList: ProcessedNode[],
  minNodeToken: number,
  counter: (text: string) => number,
): ProcessedNode[] {
  const result = [...nodeList];
  const nodesToRemove = new Set<number>();
  for (let i = result.length - 1; i >= 0; i--) {
    if (nodesToRemove.has(i)) continue;
    const current = result[i];
    if ((current.text_token_count ?? 0) < minNodeToken) {
      const children = findAllChildren(i, current.level, result);
      const childrenTexts: string[] = [];
      for (const ci of children.sort((a, b) => a - b)) {
        if (!nodesToRemove.has(ci)) {
          const ct = result[ci].text ?? '';
          if (ct.trim()) childrenTexts.push(ct);
          nodesToRemove.add(ci);
        }
      }
      if (childrenTexts.length > 0) {
        let merged = current.text ?? '';
        for (const ct of childrenTexts) { if (merged && !merged.endsWith('\n')) merged += '\n\n'; merged += ct; }
        result[i].text = merged;
        result[i].text_token_count = counter(merged);
      }
    }
  }
  return result.filter((_, idx) => !nodesToRemove.has(idx));
}

// ─── Tree Assembly ────────────────────────────────────────────────────────────

function buildTreeFromNodes(nodeList: ProcessedNode[]): TreeNode[] {
  if (nodeList.length === 0) return [];
  const stack: Array<[TreeNode, number]> = [];
  const rootNodes: TreeNode[] = [];
  let counter = 1;
  for (const node of nodeList) {
    const treeNode: TreeNode = { title: node.title, node_id: String(counter).padStart(4, '0'), text: node.text, nodes: [] };
    counter++;
    while (stack.length > 0 && stack[stack.length - 1][1] >= node.level) stack.pop();
    if (stack.length === 0) rootNodes.push(treeNode);
    else stack[stack.length - 1][0].nodes!.push(treeNode);
    stack.push([treeNode, node.level]);
  }
  return rootNodes;
}

function cleanTreeForOutput(treeNodes: TreeNode[]): TreeNode[] {
  return treeNodes.map((node) => {
    const cleaned: TreeNode = { title: node.title, node_id: node.node_id, text: node.text };
    if (node.nodes && node.nodes.length > 0) cleaned.nodes = cleanTreeForOutput(node.nodes);
    return cleaned;
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds a hierarchical tree index from a Markdown document.
 *
 * @example
 * ```ts
 * const result = await pageIndexMd({
 *   content: markdownString,
 *   llm: myLlmCallback,
 *   options: {
 *     onProgress: ({ step, percent, detail }) =>
 *       console.log(`[${percent}%] ${step}${detail ? ` — ${detail}` : ''}`),
 *   },
 * });
 * ```
 */
export async function pageIndexMd(input: {
  content: string;
  docName?: string;
  llm: LLMProvider;
  options?: MdPageIndexOptions;
}): Promise<PageIndexResult> {
  const { content, docName = 'document', llm, options = {} } = input;
  const opts = { ...DEFAULT_MD_OPTIONS, ...options };
  const counter = options.tokenCounter ?? defaultTokenCounter;
  const pr = new ProgressReporter([...MD_STEPS], options.onProgress);

  pr.report('Initializing');

  pr.report('Parsing document headings');
  const { nodeList, lines } = extractNodesFromMarkdown(content);
  pr.advance('Parsing document headings', `Found ${nodeList.length} heading(s)`);

  pr.report('Extracting section text');
  let nodesWithContent = extractNodeTextContent(nodeList, lines);
  pr.advance('Extracting section text', `Extracted text for ${nodesWithContent.length} section(s)`);

  if (opts.ifThinning) {
    pr.report('Optimizing tree structure', 'Calculating token counts');
    nodesWithContent = updateNodeListWithTextTokenCount(nodesWithContent, counter);
    pr.advance('Optimizing tree structure', 'Merging small nodes');
    nodesWithContent = treeThinningForIndex(nodesWithContent, opts.minTokenThreshold, counter);
    pr.advance('Optimizing tree structure', `${nodesWithContent.length} node(s) after thinning`);
  }

  pr.report('Building tree', `Assembling ${nodesWithContent.length} node(s)`);
  let treeStructure = buildTreeFromNodes(nodesWithContent);
  treeStructure = cleanTreeForOutput(treeStructure);

  if (opts.ifAddNodeId) writeNodeId(treeStructure);

  if (opts.ifAddNodeSummary) {
    treeStructure = formatStructure(
      treeStructure,
      ['title', 'node_id', 'summary', 'prefix_summary', 'text', 'nodes'],
    ) as TreeNode[];

    treeStructure = await generateSummariesForStructureMd(
      treeStructure, opts.summaryTokenThreshold, llm, counter, pr,
    );

    if (!opts.ifAddNodeText) {
      treeStructure = formatStructure(
        treeStructure,
        ['title', 'node_id', 'summary', 'prefix_summary', 'nodes'],
      ) as TreeNode[];
    }

    if (opts.ifAddDocDescription) {
      const cleanStructure = createCleanStructureForDescription(treeStructure);
      const docDescription = await generateDocDescription(cleanStructure, llm, pr);
      pr.report('Done');
      return { doc_name: docName, doc_description: docDescription, structure: treeStructure };
    }
  } else {
    const textOrder = opts.ifAddNodeText
      ? ['title', 'node_id', 'text', 'nodes']
      : ['title', 'node_id', 'nodes'];
    treeStructure = formatStructure(treeStructure, textOrder) as TreeNode[];
  }

  pr.report('Done');
  return { doc_name: docName, structure: treeStructure };
}

export { extractJson };
