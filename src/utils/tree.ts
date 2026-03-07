import type { TreeNode, PageData } from '../types';

// ─── Node ID ──────────────────────────────────────────────────────────────────

/**
 * Recursively writes sequential zero-padded node_id values to every node.
 * Port of `write_node_id()` from utils.py
 */
export function writeNodeId(data: TreeNode | TreeNode[], nodeId = 0): number {
  if (Array.isArray(data)) {
    for (const item of data) {
      nodeId = writeNodeId(item, nodeId);
    }
  } else if (typeof data === 'object' && data !== null) {
    data.node_id = String(nodeId).padStart(4, '0');
    nodeId += 1;
    if (data.nodes) {
      nodeId = writeNodeId(data.nodes, nodeId);
    }
  }
  return nodeId;
}

// ─── Traversal ────────────────────────────────────────────────────────────────

/**
 * Returns all nodes as a flat list (each node without its `nodes` children).
 * Port of `get_nodes()` from utils.py
 */
export function getNodes(structure: TreeNode | TreeNode[]): TreeNode[] {
  if (Array.isArray(structure)) {
    return structure.flatMap(getNodes);
  }
  const node = { ...structure };
  delete node.nodes;
  const result: TreeNode[] = [node];
  if (structure.nodes) {
    result.push(...getNodes(structure.nodes));
  }
  return result;
}

/**
 * Flattens the tree into a list where each element still contains its `nodes`.
 * Port of `structure_to_list()` from utils.py
 */
export function structureToList(structure: TreeNode | TreeNode[]): TreeNode[] {
  if (Array.isArray(structure)) {
    return structure.flatMap(structureToList);
  }
  const result: TreeNode[] = [structure];
  if (structure.nodes) {
    result.push(...structureToList(structure.nodes));
  }
  return result;
}

/**
 * Returns only leaf nodes (nodes with no children).
 * Port of `get_leaf_nodes()` from utils.py
 */
export function getLeafNodes(structure: TreeNode | TreeNode[]): TreeNode[] {
  if (Array.isArray(structure)) {
    return structure.flatMap(getLeafNodes);
  }
  if (!structure.nodes || structure.nodes.length === 0) {
    const node = { ...structure };
    delete node.nodes;
    return [node];
  }
  return getLeafNodes(structure.nodes);
}

// ─── Tree Building ────────────────────────────────────────────────────────────

function getParentStructure(structure: string): string | null {
  const parts = structure.split('.');
  return parts.length > 1 ? parts.slice(0, -1).join('.') : null;
}

/**
 * Converts a flat list with `structure` index codes (e.g. "1.2.3") into a
 * nested tree. Port of `list_to_tree()` from utils.py
 */
export function listToTree(data: TreeNode[]): TreeNode[] {
  const nodes: Record<string, TreeNode> = {};
  const rootNodes: TreeNode[] = [];

  for (const item of data) {
    const structure = item.structure ?? '';
    const node: TreeNode = {
      title: item.title ?? '',
      start_index: item.start_index,
      end_index: item.end_index,
      nodes: [],
    };
    nodes[structure] = node;

    const parentStructure = getParentStructure(structure);
    if (parentStructure && nodes[parentStructure]) {
      nodes[parentStructure].nodes!.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  const cleanNode = (node: TreeNode): TreeNode => {
    if (!node.nodes || node.nodes.length === 0) {
      delete node.nodes;
    } else {
      node.nodes = node.nodes.map(cleanNode);
    }
    return node;
  };

  return rootNodes.map(cleanNode);
}

// ─── Post Processing ──────────────────────────────────────────────────────────

/**
 * Converts a flat TOC list (with `physical_index`) into a tree, assigning
 * `start_index` and `end_index` to each node.
 * Port of `post_processing()` from utils.py
 */
export function postProcessing(structure: TreeNode[], endPhysicalIndex: number): TreeNode[] {
  // Assign start_index and end_index from physical_index
  for (let i = 0; i < structure.length; i++) {
    structure[i].start_index = structure[i].physical_index ?? undefined;
    if (i < structure.length - 1) {
      const nextItem = structure[i + 1];
      structure[i].end_index =
        nextItem.appear_start === 'yes'
          ? (nextItem.physical_index ?? 1) - 1
          : nextItem.physical_index ?? undefined;
    } else {
      structure[i].end_index = endPhysicalIndex;
    }
  }

  const tree = listToTree(structure);
  if (tree.length !== 0) {
    return tree;
  }

  // Fallback: return the flat list cleaned up
  for (const node of structure) {
    delete node.appear_start;
    delete node.physical_index;
  }
  return structure;
}

/**
 * Inserts a "Preface" node at the beginning if the first section starts
 * after page 1. Port of `add_preface_if_needed()` from utils.py
 */
export function addPrefaceIfNeeded(data: TreeNode[]): TreeNode[] {
  if (!Array.isArray(data) || data.length === 0) return data;
  if (data[0].physical_index != null && data[0].physical_index > 1) {
    data.unshift({
      structure: '0',
      title: 'Preface',
      physical_index: 1,
    });
  }
  return data;
}

// ─── Text Attachment ──────────────────────────────────────────────────────────

function getPdfPageText(pages: PageData[], startPage: number, endPage: number): string {
  let text = '';
  for (let i = startPage - 1; i < endPage && i < pages.length; i++) {
    text += pages[i].text;
  }
  return text;
}

function getPdfPageTextWithLabels(pages: PageData[], startPage: number, endPage: number): string {
  let text = '';
  for (let i = startPage - 1; i < endPage && i < pages.length; i++) {
    text += `<physical_index_${i + 1}>\n${pages[i].text}\n<physical_index_${i + 1}>\n`;
  }
  return text;
}

/**
 * Attaches raw page text to each node based on its start/end indices.
 * Port of `add_node_text()` from utils.py
 */
export function addNodeText(node: TreeNode | TreeNode[], pages: PageData[]): void {
  if (Array.isArray(node)) {
    for (const n of node) addNodeText(n, pages);
    return;
  }
  if (node.start_index != null && node.end_index != null) {
    node.text = getPdfPageText(pages, node.start_index, node.end_index);
  }
  if (node.nodes) addNodeText(node.nodes, pages);
}

/**
 * Same as `addNodeText` but wraps text in `<physical_index_X>` tags.
 * Port of `add_node_text_with_labels()` from utils.py
 */
export function addNodeTextWithLabels(node: TreeNode | TreeNode[], pages: PageData[]): void {
  if (Array.isArray(node)) {
    for (const n of node) addNodeTextWithLabels(n, pages);
    return;
  }
  if (node.start_index != null && node.end_index != null) {
    node.text = getPdfPageTextWithLabels(pages, node.start_index, node.end_index);
  }
  if (node.nodes) addNodeTextWithLabels(node.nodes, pages);
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * Recursively removes specified fields from all nodes.
 * Port of `remove_fields()` from utils.py
 */
export function removeFields(data: unknown, fields: string[] = ['text']): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => removeFields(item, fields));
  }
  if (typeof data === 'object' && data !== null) {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>)
        .filter(([k]) => !fields.includes(k))
        .map(([k, v]) => [k, removeFields(v, fields)]),
    );
  }
  return data;
}

/**
 * Removes the `text` field from all nodes in-place.
 * Port of `remove_structure_text()` from utils.py
 */
export function removeStructureText(data: TreeNode | TreeNode[]): TreeNode | TreeNode[] {
  if (Array.isArray(data)) {
    for (const item of data) removeStructureText(item);
  } else if (typeof data === 'object' && data !== null) {
    delete data.text;
    if (data.nodes) removeStructureText(data.nodes);
  }
  return data;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

type KeyOrder = string[];

function reorderDict(data: Record<string, unknown>, keyOrder: KeyOrder): Record<string, unknown> {
  return Object.fromEntries(keyOrder.filter((k) => k in data).map((k) => [k, data[k]]));
}

/**
 * Re-orders keys of each node and optionally removes empty `nodes` arrays.
 * Port of `format_structure()` from utils.py
 */
export function formatStructure(
  structure: TreeNode | TreeNode[],
  order?: KeyOrder,
): TreeNode | TreeNode[] {
  if (!order) return structure;
  if (Array.isArray(structure)) {
    return structure.map((item) => formatStructure(item, order) as TreeNode);
  }
  if (typeof structure === 'object' && structure !== null) {
    const s = (structure as unknown) as Record<string, unknown>;
    if (s['nodes']) {
      s['nodes'] = formatStructure(s['nodes'] as TreeNode[], order);
    }
    if (!s['nodes'] || (Array.isArray(s['nodes']) && (s['nodes'] as unknown[]).length === 0)) {
      delete s['nodes'];
    }
    return (reorderDict(s, order) as unknown) as TreeNode;
  }
  return structure;
}

// ─── Description Helper ───────────────────────────────────────────────────────

/**
 * Creates a minimal structure (only title, node_id, summary, prefix_summary)
 * suitable for document description generation.
 * Port of `create_clean_structure_for_description()` from utils.py
 */
export function createCleanStructureForDescription(
  structure: TreeNode | TreeNode[],
): TreeNode | TreeNode[] {
  if (Array.isArray(structure)) {
    return structure.map((item) => createCleanStructureForDescription(item) as TreeNode);
  }
  const clean: TreeNode = { title: structure.title };
  if (structure.node_id) clean.node_id = structure.node_id;
  if (structure.summary) clean.summary = structure.summary;
  if (structure.prefix_summary) clean.prefix_summary = structure.prefix_summary;
  if (structure.nodes && structure.nodes.length > 0) {
    clean.nodes = createCleanStructureForDescription(structure.nodes) as TreeNode[];
  }
  return clean;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Sets `physical_index` to null for any TOC item that references a page
 * beyond the actual document length.
 * Port of `validate_and_truncate_physical_indices()` from utils.py
 */
export function validateAndTruncatePhysicalIndices(
  tocItems: TreeNode[],
  pageListLength: number,
  startIndex = 1,
): TreeNode[] {
  if (!tocItems || tocItems.length === 0) return tocItems;

  const maxAllowedPage = pageListLength + startIndex - 1;
  let truncatedCount = 0;

  for (const item of tocItems) {
    if (item.physical_index != null && item.physical_index > maxAllowedPage) {
      item.physical_index = null;
      truncatedCount++;
    }
  }

  if (truncatedCount > 0) {
    console.warn(`[PageIndex] Truncated ${truncatedCount} TOC items that exceeded document length`);
  }

  return tocItems;
}

// ─── Physical Index Conversion ────────────────────────────────────────────────

/**
 * Converts string-form `<physical_index_X>` values to integers in-place.
 * Port of `convert_physical_index_to_int()` from utils.py
 */
export function convertPhysicalIndexToInt(
  data: TreeNode[] | string,
): TreeNode[] | number | null {
  if (typeof data === 'string') {
    const match = data.match(/physical_index_(\d+)/);
    if (match) return parseInt(match[1], 10);
    return null;
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item.physical_index === 'string') {
        const match = (item.physical_index as string).match(/physical_index_(\d+)/);
        if (match) item.physical_index = parseInt(match[1], 10);
        else item.physical_index = null;
      }
    }
  }
  return data;
}

/**
 * Converts string `page` values to numbers in-place.
 * Port of `convert_page_to_int()` from utils.py
 */
export function convertPageToInt(data: TreeNode[]): TreeNode[] {
  for (const item of data) {
    if (typeof item.page === 'string') {
      const parsed = parseInt(item.page as unknown as string, 10);
      item.page = isNaN(parsed) ? null : parsed;
    }
  }
  return data;
}

// ─── Deep Clone ───────────────────────────────────────────────────────────────

/**
 * Deep clone any JSON-serialisable value.
 * Falls back to `JSON.parse(JSON.stringify())` when `structuredClone` is absent.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const structuredClone: ((value: any) => any) | undefined;

export function deepClone<T>(value: T): T {
  if (typeof structuredClone !== 'undefined') return structuredClone(value) as T;
  return JSON.parse(JSON.stringify(value)) as T;
}
