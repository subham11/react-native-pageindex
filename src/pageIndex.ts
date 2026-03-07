/**
 * PDF pipeline — port of pageindex/page_index.py
 *
 * Processes PDF pages (as pre-extracted text + token counts) and builds a
 * hierarchical tree index using LLM reasoning.  No PDF parser is included
 * here — pass `PageData[]` directly, or use the `extractPdfPages()` helper
 * from `./utils/pdf` (requires pdfjs-dist to be installed).
 */

import type {
  LLMProvider,
  LLMMessage,
  PageData,
  PageIndexOptions,
  PageIndexResult,
  TreeNode,
} from './types';
import { DEFAULT_PDF_OPTIONS } from './config';
import { defaultTokenCounter } from './utils/tokens';
import { extractJson, getJsonContent } from './utils/json';
import { ProgressReporter } from './utils/progress';
import {
  deepClone,
  writeNodeId,
  addNodeText,
  removeStructureText,
  createCleanStructureForDescription,
  postProcessing,
  addPrefaceIfNeeded,
  validateAndTruncatePhysicalIndices,
  convertPhysicalIndexToInt,
  convertPageToInt,
  structureToList,
} from './utils/tree';

// ─── PDF Pipeline Steps (in order) ───────────────────────────────────────────

const PDF_STEPS = [
  'Initializing',
  'Extracting PDF pages',
  'Scanning for table of contents',
  'Transforming TOC to structured format',
  'Mapping TOC entries to page numbers',
  'Building tree from document text',
  'Verifying TOC accuracy',
  'Fixing inaccurate TOC entries',
  'Resolving large sections',
  'Attaching page text to nodes',
  'Generating node summaries',
  'Generating document description',
  'Done',
] as const;

// ─── Internal Config ──────────────────────────────────────────────────────────

interface ResolvedOpts {
  tocCheckPageNum: number;
  maxPageNumEachNode: number;
  maxTokenNumEachNode: number;
  ifAddNodeId: boolean;
  ifAddNodeSummary: boolean;
  ifAddDocDescription: boolean;
  ifAddNodeText: boolean;
  counter: (text: string) => number;
}

// ─── LLM Wrappers ─────────────────────────────────────────────────────────────

async function llmCall(
  llm: LLMProvider,
  prompt: string,
  chatHistory?: LLMMessage[],
): Promise<string> {
  const MAX_RETRIES = 10;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const result = await llm(prompt, chatHistory ? { chatHistory } : undefined);
      return result.content;
    } catch (err) {
      console.warn(`[PageIndex] LLM call failed (attempt ${i + 1}/${MAX_RETRIES}):`, err);
      if (i < MAX_RETRIES - 1) await sleep(1000);
    }
  }
  throw new Error('[PageIndex] Max retries reached for LLM call');
}

async function llmCallWithFinishReason(
  llm: LLMProvider,
  prompt: string,
  chatHistory?: LLMMessage[],
): Promise<{ content: string; finishReason: string }> {
  const MAX_RETRIES = 10;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const result = await llm(prompt, chatHistory ? { chatHistory } : undefined);
      return { content: result.content, finishReason: result.finishReason };
    } catch (err) {
      console.warn(`[PageIndex] LLM call failed (attempt ${i + 1}/${MAX_RETRIES}):`, err);
      if (i < MAX_RETRIES - 1) await sleep(1000);
    }
  }
  throw new Error('[PageIndex] Max retries reached for LLM call');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── TOC Detection ────────────────────────────────────────────────────────────

async function tocDetectorSinglePage(content: string, llm: LLMProvider): Promise<string> {
  const prompt = `Your job is to detect if there is a table of content provided in the given text.

Given text: ${content}

return the following JSON format:
{
    "thinking": <why do you think there is a table of content in the given text>
    "toc_detected": "<yes or no>",
}

Directly return the final JSON structure. Do not output anything else.
Please note: abstract,summary, notation list, figure list, table list, etc. are not table of contents.`;

  const response = await llmCall(llm, prompt);
  const json = extractJson(response) as Record<string, string>;
  return json['toc_detected'] ?? 'no';
}

async function detectPageIndex(tocContent: string, llm: LLMProvider): Promise<string> {
  const prompt = `You will be given a table of contents.

Your job is to detect if there are page numbers/indices given within the table of contents.

Given text: ${tocContent}

Reply format:
{
    "thinking": <why do you think there are page numbers/indices given within the table of contents>
    "page_index_given_in_toc": "<yes or no>"
}
Directly return the final JSON structure. Do not output anything else.`;

  const response = await llmCall(llm, prompt);
  const json = extractJson(response) as Record<string, string>;
  return json['page_index_given_in_toc'] ?? 'no';
}

function transformDotsToColon(text: string): string {
  return text.replace(/\.{5,}/g, ': ').replace(/(?:\. ){5,}\.?/g, ': ');
}

async function tocExtractorHelper(
  pageList: PageData[],
  tocPageList: number[],
  llm: LLMProvider,
): Promise<{ toc_content: string; page_index_given_in_toc: string }> {
  let tocContent = '';
  for (const pageIndex of tocPageList) tocContent += pageList[pageIndex].text;
  tocContent = transformDotsToColon(tocContent);
  const hasPageIndex = await detectPageIndex(tocContent, llm);
  return { toc_content: tocContent, page_index_given_in_toc: hasPageIndex };
}

async function findTocPages(
  startPageIndex: number,
  pageList: PageData[],
  opts: ResolvedOpts,
  llm: LLMProvider,
  pr: ProgressReporter,
): Promise<number[]> {
  const tocPageList: number[] = [];
  let lastPageIsYes = false;
  let i = startPageIndex;

  while (i < pageList.length) {
    if (i >= opts.tocCheckPageNum && !lastPageIsYes) break;
    pr.advance(
      'Scanning for table of contents',
      `Checking page ${i + 1} / ${Math.min(opts.tocCheckPageNum, pageList.length)}`,
    );
    const result = await tocDetectorSinglePage(pageList[i].text, llm);
    if (result === 'yes') {
      tocPageList.push(i);
      lastPageIsYes = true;
    } else if (result === 'no' && lastPageIsYes) {
      break;
    }
    i++;
  }
  return tocPageList;
}

async function checkToc(
  pageList: PageData[],
  opts: ResolvedOpts,
  llm: LLMProvider,
  pr: ProgressReporter,
): Promise<{ toc_content: string | null; toc_page_list: number[]; page_index_given_in_toc: string }> {
  pr.report('Scanning for table of contents', `Checking up to ${opts.tocCheckPageNum} pages`);
  const tocPageList = await findTocPages(0, pageList, opts, llm, pr);

  if (tocPageList.length === 0) {
    console.log('[PageIndex] No TOC found — will extract structure from content');
    return { toc_content: null, toc_page_list: [], page_index_given_in_toc: 'no' };
  }

  console.log(`[PageIndex] TOC found on pages: ${tocPageList.map((p) => p + 1).join(', ')}`);
  const tocJson = await tocExtractorHelper(pageList, tocPageList, llm);

  if (tocJson.page_index_given_in_toc === 'yes') {
    return {
      toc_content: tocJson.toc_content,
      toc_page_list: tocPageList,
      page_index_given_in_toc: 'yes',
    };
  }

  let currentStartIndex = tocPageList[tocPageList.length - 1] + 1;
  while (
    tocJson.page_index_given_in_toc === 'no' &&
    currentStartIndex < pageList.length &&
    currentStartIndex < opts.tocCheckPageNum
  ) {
    const additionalTocPages = await findTocPages(currentStartIndex, pageList, opts, llm, pr);
    if (additionalTocPages.length === 0) break;
    const additionalTocJson = await tocExtractorHelper(pageList, additionalTocPages, llm);
    if (additionalTocJson.page_index_given_in_toc === 'yes') {
      return {
        toc_content: additionalTocJson.toc_content,
        toc_page_list: additionalTocPages,
        page_index_given_in_toc: 'yes',
      };
    }
    currentStartIndex = additionalTocPages[additionalTocPages.length - 1] + 1;
  }

  return {
    toc_content: tocJson.toc_content,
    toc_page_list: tocPageList,
    page_index_given_in_toc: 'no',
  };
}

// ─── TOC Transformation ───────────────────────────────────────────────────────

async function checkIfTocTransformationIsComplete(
  content: string,
  toc: string,
  llm: LLMProvider,
): Promise<string> {
  const prompt = `You are given a raw table of contents and a  table of contents.
Your job is to check if the  table of contents is complete.

Reply format:
{
    "thinking": <why do you think the cleaned table of contents is complete or not>
    "completed": "yes" or "no"
}
Directly return the final JSON structure. Do not output anything else.

Raw Table of contents:
${content}

Cleaned Table of contents:
${toc}`;
  const response = await llmCall(llm, prompt);
  const json = extractJson(response) as Record<string, string>;
  return json['completed'] ?? 'no';
}

async function tocTransformer(
  tocContent: string,
  llm: LLMProvider,
  pr: ProgressReporter,
): Promise<TreeNode[]> {
  pr.report('Transforming TOC to structured format', 'Converting TOC to JSON hierarchy');

  const initPrompt = `You are given a table of contents, You job is to transform the whole table of content into a JSON format included table_of_contents.

structure is the numeric system which represents the index of the hierarchy section in the table of contents. For example, the first section has structure index 1, the first subsection has structure index 1.1, the second subsection has structure index 1.2, etc.

The response should be in the following JSON format:
{
table_of_contents: [
    {
        "structure": <structure index, "x.x.x" or None> (string),
        "title": <title of the section>,
        "page": <page number or None>,
    },
    ...
    ],
}
You should transform the full table of contents in one go.
Directly return the final JSON structure, do not output anything else.

Given table of contents:
${tocContent}`;

  let { content: lastComplete, finishReason } = await llmCallWithFinishReason(llm, initPrompt);
  let ifComplete = await checkIfTocTransformationIsComplete(tocContent, lastComplete, llm);

  if (ifComplete === 'yes' && finishReason !== 'length') {
    const parsed = extractJson(lastComplete) as Record<string, unknown>;
    return convertPageToInt((parsed['table_of_contents'] ?? []) as TreeNode[]);
  }

  lastComplete = getJsonContent(lastComplete);
  let attempts = 0;
  const MAX_ATTEMPTS = 5;

  while (!(ifComplete === 'yes' && finishReason !== 'length') && attempts < MAX_ATTEMPTS) {
    pr.advance('Transforming TOC to structured format', `Completing TOC (attempt ${attempts + 2})`);
    const position = lastComplete.lastIndexOf('}');
    if (position !== -1) lastComplete = lastComplete.slice(0, position + 2);

    const continuePrompt = `Your task is to continue the table of contents json structure, directly output the remaining part of the json structure.

The raw table of contents json structure is:
${tocContent}

The incomplete transformed table of contents json structure is:
${lastComplete}

Please continue the json structure, directly output the remaining part of the json structure.`;

    let newComplete: string;
    ({ content: newComplete, finishReason } = await llmCallWithFinishReason(llm, continuePrompt));

    if (newComplete.startsWith('```json')) newComplete = getJsonContent(newComplete);
    lastComplete = lastComplete + newComplete;
    ifComplete = await checkIfTocTransformationIsComplete(tocContent, lastComplete, llm);
    attempts++;
  }

  const parsed = JSON.parse(lastComplete) as Record<string, unknown>;
  return convertPageToInt((parsed['table_of_contents'] ?? []) as TreeNode[]);
}

// ─── TOC Index Extraction ─────────────────────────────────────────────────────

async function tocIndexExtractor(
  toc: TreeNode[],
  content: string,
  llm: LLMProvider,
): Promise<TreeNode[]> {
  const prompt = `You are given a table of contents in a json format and several pages of a document, your job is to add the physical_index to the table of contents in the json format.

The provided pages contains tags like <physical_index_X> and <physical_index_X> to indicate the physical location of the page X.

The structure variable is the numeric system which represents the index of the hierarchy section in the table of contents. For example, the first section has structure index 1, the first subsection has structure index 1.1, the second subsection has structure index 1.2, etc.

The response should be in the following JSON format:
[
    {
        "structure": <structure index, "x.x.x" or None> (string),
        "title": <title of the section>,
        "physical_index": "<physical_index_X>" (keep the format)
    },
    ...
]

Only add the physical_index to the sections that are in the provided pages.
If the section is not in the provided pages, do not add the physical_index to it.
Directly return the final JSON structure. Do not output anything else.

Table of contents:
${JSON.stringify(toc)}

Document pages:
${content}`;

  const response = await llmCall(llm, prompt);
  return extractJson(response) as TreeNode[];
}

// ─── Page Grouping ────────────────────────────────────────────────────────────

function pageListToGroupText(
  pageContents: string[],
  tokenLengths: number[],
  maxTokens = 20000,
  overlapPage = 1,
): string[] {
  const numTokens = tokenLengths.reduce((a, b) => a + b, 0);
  if (numTokens <= maxTokens) return [pageContents.join('')];

  const expectedParts = Math.ceil(numTokens / maxTokens);
  const avgTokensPerPart = Math.ceil((numTokens / expectedParts + maxTokens) / 2);

  const subsets: string[] = [];
  let currentSubset: string[] = [];
  let currentTokenCount = 0;

  for (let i = 0; i < pageContents.length; i++) {
    if (currentTokenCount + tokenLengths[i] > avgTokensPerPart) {
      subsets.push(currentSubset.join(''));
      const overlapStart = Math.max(i - overlapPage, 0);
      currentSubset = pageContents.slice(overlapStart, i);
      currentTokenCount = tokenLengths.slice(overlapStart, i).reduce((a, b) => a + b, 0);
    }
    currentSubset.push(pageContents[i]);
    currentTokenCount += tokenLengths[i];
  }

  if (currentSubset.length > 0) subsets.push(currentSubset.join(''));
  console.log(`[PageIndex] Split into ${subsets.length} text group(s)`);
  return subsets;
}

// ─── TOC Generation (no existing TOC) ────────────────────────────────────────

async function generateTocInit(
  part: string,
  llm: LLMProvider,
  pr: ProgressReporter,
  groupIndex: number,
  totalGroups: number,
): Promise<TreeNode[]> {
  pr.report(
    'Building tree from document text',
    `Extracting structure from group ${groupIndex + 1} / ${totalGroups}`,
  );

  const prompt = `You are an expert in extracting hierarchical tree structure, your task is to generate the tree structure of the document.

The structure variable is the numeric system which represents the index of the hierarchy section in the table of contents. For example, the first section has structure index 1, the first subsection has structure index 1.1, the second subsection has structure index 1.2, etc.

For the title, you need to extract the original title from the text, only fix the space inconsistency.

The provided text contains tags like <physical_index_X> and <physical_index_X> to indicate the start and end of page X.

For the physical_index, you need to extract the physical index of the start of the section from the text. Keep the <physical_index_X> format.

The response should be in the following format.
[
    {
        "structure": <structure index, "x.x.x"> (string),
        "title": <title of the section, keep the original title>,
        "physical_index": "<physical_index_X> (keep the format)"
    },
],

Directly return the final JSON structure. Do not output anything else.

Given text:
${part}`;

  const { content: response, finishReason } = await llmCallWithFinishReason(llm, prompt);
  if (finishReason !== 'length') return extractJson(response) as TreeNode[];
  throw new Error('[PageIndex] TOC generation truncated (output too long)');
}

async function generateTocContinue(
  tocContent: TreeNode[],
  part: string,
  llm: LLMProvider,
  pr: ProgressReporter,
  groupIndex: number,
  totalGroups: number,
): Promise<TreeNode[]> {
  pr.advance(
    'Building tree from document text',
    `Continuing structure extraction — group ${groupIndex + 1} / ${totalGroups}`,
  );

  const prompt = `You are an expert in extracting hierarchical tree structure.
You are given a tree structure of the previous part and the text of the current part.
Your task is to continue the tree structure from the previous part to include the current part.

The structure variable is the numeric system which represents the index of the hierarchy section in the table of contents. For example, the first section has structure index 1, the first subsection has structure index 1.1, the second subsection has structure index 1.2, etc.

For the title, you need to extract the original title from the text, only fix the space inconsistency.

The provided text contains tags like <physical_index_X> and <physical_index_X> to indicate the start and end of page X.

For the physical_index, you need to extract the physical index of the start of the section from the text. Keep the <physical_index_X> format.

The response should be in the following format.
[
    {
        "structure": <structure index, "x.x.x"> (string),
        "title": <title of the section, keep the original title>,
        "physical_index": "<physical_index_X> (keep the format)"
    },
    ...
]

Directly return the additional part of the final JSON structure. Do not output anything else.

Given text:
${part}

Previous tree structure:
${JSON.stringify(tocContent, null, 2)}`;

  const { content: response, finishReason } = await llmCallWithFinishReason(llm, prompt);
  if (finishReason !== 'length') return extractJson(response) as TreeNode[];
  throw new Error('[PageIndex] TOC continuation truncated (output too long)');
}

// ─── TOC with Page Numbers Processing ────────────────────────────────────────

function removePageNumber(data: TreeNode | TreeNode[]): TreeNode | TreeNode[] {
  if (Array.isArray(data)) {
    for (const item of data) removePageNumber(item);
  } else if (data !== null && typeof data === 'object') {
    delete data.page;
    if (data.nodes) removePageNumber(data.nodes);
  }
  return data;
}

function extractMatchingPagePairs(
  tocPage: TreeNode[],
  tocPhysicalIndex: TreeNode[],
  startPageIndex: number,
): Array<{ title: string; page: number | null; physical_index: number | null }> {
  const pairs = [];
  for (const phyItem of tocPhysicalIndex) {
    for (const pageItem of tocPage) {
      if (phyItem.title === pageItem.title) {
        const physIdx = phyItem.physical_index;
        if (physIdx != null && physIdx >= startPageIndex) {
          pairs.push({ title: phyItem.title, page: pageItem.page ?? null, physical_index: physIdx });
        }
      }
    }
  }
  return pairs;
}

function calculatePageOffset(
  pairs: Array<{ page: number | null; physical_index: number | null }>,
): number | null {
  const differences: number[] = [];
  for (const pair of pairs) {
    if (pair.physical_index != null && pair.page != null) {
      differences.push(pair.physical_index - pair.page);
    }
  }
  if (differences.length === 0) return null;
  const counts: Record<number, number> = {};
  for (const d of differences) counts[d] = (counts[d] ?? 0) + 1;
  return Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
}

function addPageOffsetToTocJson(data: TreeNode[], offset: number): TreeNode[] {
  for (const item of data) {
    if (item.page != null && typeof item.page === 'number') {
      item.physical_index = item.page + offset;
      delete item.page;
    }
  }
  return data;
}

async function addPageNumberToToc(
  part: string,
  structure: TreeNode[],
  llm: LLMProvider,
): Promise<TreeNode[]> {
  const prompt = `You are given an JSON structure of a document and a partial part of the document. Your task is to check if the title that is described in the structure is started in the partial given document.

The provided text contains tags like <physical_index_X> and <physical_index_X> to indicate the physical location of the page X.

If the full target section starts in the partial given document, insert the given JSON structure with the "start": "yes", and "start_index": "<physical_index_X>".

If the full target section does not start in the partial given document, insert "start": "no",  "start_index": None.

The response should be in the following format.
    [
        {
            "structure": <structure index, "x.x.x" or None> (string),
            "title": <title of the section>,
            "start": "<yes or no>",
            "physical_index": "<physical_index_X> (keep the format)" or None
        },
        ...
    ]
The given structure contains the result of the previous part, you need to fill the result of the current part, do not change the previous result.
Directly return the final JSON structure. Do not output anything else.

Current Partial Document:
${part}

Given Structure:
${JSON.stringify(structure, null, 2)}`;

  const response = await llmCall(llm, prompt);
  const jsonResult = extractJson(response) as TreeNode[];
  for (const item of jsonResult) {
    delete (item as unknown as Record<string, unknown>)['start'];
  }
  return jsonResult;
}

async function processNonePageNumbers(
  tocItems: TreeNode[],
  pageList: PageData[],
  startIndex: number,
  llm: LLMProvider,
): Promise<TreeNode[]> {
  for (let i = 0; i < tocItems.length; i++) {
    const item = tocItems[i];
    if (item.physical_index == null) {
      let prevPhysicalIndex = 0;
      for (let j = i - 1; j >= 0; j--) {
        if (tocItems[j].physical_index != null) { prevPhysicalIndex = tocItems[j].physical_index as number; break; }
      }
      let nextPhysicalIndex = pageList.length + startIndex - 1;
      for (let j = i + 1; j < tocItems.length; j++) {
        if (tocItems[j].physical_index != null) { nextPhysicalIndex = tocItems[j].physical_index as number; break; }
      }
      const pageContents: string[] = [];
      for (let p = prevPhysicalIndex; p <= nextPhysicalIndex; p++) {
        const li = p - startIndex;
        if (li >= 0 && li < pageList.length) {
          pageContents.push(`<physical_index_${p}>\n${pageList[li].text}\n<physical_index_${p}>\n\n`);
        }
      }
      const itemCopy = deepClone(item);
      delete (itemCopy as unknown as Record<string, unknown>)['page'];
      const result = await addPageNumberToToc(pageContents.join(''), [itemCopy], llm);
      const phyStr = result[0]?.physical_index as string | number | null;
      if (typeof phyStr === 'string' && phyStr.startsWith('<physical_index')) {
        const match = phyStr.match(/physical_index_(\d+)/);
        if (match) { tocItems[i].physical_index = parseInt(match[1], 10); delete tocItems[i].page; }
      }
    }
  }
  return tocItems;
}

// ─── Processing Modes ─────────────────────────────────────────────────────────

async function processNoToc(
  pageList: PageData[],
  startIndex: number,
  opts: ResolvedOpts,
  llm: LLMProvider,
  pr: ProgressReporter,
): Promise<TreeNode[]> {
  const pageContents: string[] = [];
  const tokenLengths: number[] = [];
  for (let i = 0; i < pageList.length; i++) {
    const pi = i + startIndex;
    const text = `<physical_index_${pi}>\n${pageList[i].text}\n<physical_index_${pi}>\n\n`;
    pageContents.push(text);
    tokenLengths.push(opts.counter(text));
  }
  const groupTexts = pageListToGroupText(pageContents, tokenLengths, opts.maxTokenNumEachNode);

  let tocWithPageNumber = await generateTocInit(groupTexts[0], llm, pr, 0, groupTexts.length);
  for (let g = 1; g < groupTexts.length; g++) {
    const additional = await generateTocContinue(tocWithPageNumber, groupTexts[g], llm, pr, g, groupTexts.length);
    tocWithPageNumber = [...tocWithPageNumber, ...additional];
  }

  convertPhysicalIndexToInt(tocWithPageNumber as TreeNode[]);
  return tocWithPageNumber;
}

async function processTocNoPageNumbers(
  tocContent: string,
  pageList: PageData[],
  startIndex: number,
  opts: ResolvedOpts,
  llm: LLMProvider,
  pr: ProgressReporter,
): Promise<TreeNode[]> {
  const transformedToc = await tocTransformer(tocContent, llm, pr);
  const pageContents: string[] = [];
  const tokenLengths: number[] = [];
  for (let i = 0; i < pageList.length; i++) {
    const pi = i + startIndex;
    const text = `<physical_index_${pi}>\n${pageList[i].text}\n<physical_index_${pi}>\n\n`;
    pageContents.push(text);
    tokenLengths.push(opts.counter(text));
  }
  const groupTexts = pageListToGroupText(pageContents, tokenLengths, opts.maxTokenNumEachNode);

  pr.report('Mapping TOC entries to page numbers', `Processing ${groupTexts.length} group(s)`);
  let tocWithPageNumber: TreeNode[] = deepClone(transformedToc);
  for (let g = 0; g < groupTexts.length; g++) {
    pr.advance('Mapping TOC entries to page numbers', `Group ${g + 1} / ${groupTexts.length}`);
    tocWithPageNumber = await addPageNumberToToc(groupTexts[g], tocWithPageNumber, llm);
  }

  convertPhysicalIndexToInt(tocWithPageNumber);
  return tocWithPageNumber;
}

async function processTocWithPageNumbers(
  tocContent: string,
  tocPageList: number[],
  pageList: PageData[],
  startIndex: number,
  opts: ResolvedOpts,
  llm: LLMProvider,
  pr: ProgressReporter,
): Promise<TreeNode[]> {
  const tocWithPageNumber = await tocTransformer(tocContent, llm, pr);
  const tocNoPageNumber = deepClone(tocWithPageNumber);
  removePageNumber(tocNoPageNumber);

  pr.report('Mapping TOC entries to page numbers', 'Matching TOC entries to physical pages');
  const startPageIndex = tocPageList[tocPageList.length - 1] + 1;
  let mainContent = '';
  const end = Math.min(startPageIndex + opts.tocCheckPageNum, pageList.length);
  for (let p = startPageIndex; p < end; p++) {
    mainContent += `<physical_index_${p + 1}>\n${pageList[p].text}\n<physical_index_${p + 1}>\n\n`;
  }

  let tocWithPhysicalIndex = await tocIndexExtractor(tocNoPageNumber as TreeNode[], mainContent, llm);
  convertPhysicalIndexToInt(tocWithPhysicalIndex);

  const matchingPairs = extractMatchingPagePairs(tocWithPageNumber, tocWithPhysicalIndex, startPageIndex);
  const offset = calculatePageOffset(matchingPairs);

  let result: TreeNode[];
  if (offset != null) {
    result = addPageOffsetToTocJson(deepClone(tocWithPageNumber), offset);
    result = await processNonePageNumbers(result, pageList, startIndex, llm);
  } else {
    result = tocWithPhysicalIndex;
  }
  return result;
}

// ─── TOC Verification & Fixing ────────────────────────────────────────────────

async function checkTitleAppearance(
  item: TreeNode,
  pageList: PageData[],
  startIndex: number,
  llm: LLMProvider,
): Promise<{ list_index: number; answer: string; title: string; page_number: number | null }> {
  const title = item.title;
  if (item.physical_index == null) {
    return { list_index: item.list_index ?? 0, answer: 'no', title, page_number: null };
  }
  const pageNumber = item.physical_index as number;
  const listIdx = pageNumber - startIndex;
  const pageText = listIdx >= 0 && listIdx < pageList.length ? pageList[listIdx].text : '';

  const prompt = `Your job is to check if the given section appears or starts in the given page_text.

Note: do fuzzy matching, ignore any space inconsistency in the page_text.

The given section title is ${title}.
The given page_text is ${pageText}.

Reply format:
{
    "thinking": <why do you think the section appears or starts in the page_text>
    "answer": "yes or no" (yes if the section appears or starts in the page_text, no otherwise)
}
Directly return the final JSON structure. Do not output anything else.`;

  const response = await llmCall(llm, prompt);
  const json = extractJson(response) as Record<string, string>;
  return { list_index: item.list_index ?? 0, answer: json['answer'] ?? 'no', title, page_number: pageNumber };
}

async function checkTitleAppearanceInStart(
  title: string,
  pageText: string,
  llm: LLMProvider,
): Promise<string> {
  const prompt = `You will be given the current section title and the current page_text.
Your job is to check if the current section starts in the beginning of the given page_text.
If there are other contents before the current section title, then the current section does not start in the beginning of the given page_text.
If the current section title is the first content in the given page_text, then the current section starts in the beginning of the given page_text.

Note: do fuzzy matching, ignore any space inconsistency in the page_text.

The given section title is ${title}.
The given page_text is ${pageText}.

reply format:
{
    "thinking": <why do you think the section appears or starts in the page_text>
    "start_begin": "yes or no" (yes if the section starts in the beginning of the page_text, no otherwise)
}
Directly return the final JSON structure. Do not output anything else.`;

  const response = await llmCall(llm, prompt);
  const json = extractJson(response) as Record<string, string>;
  return json['start_begin'] ?? 'no';
}

async function checkTitleAppearanceInStartConcurrent(
  structure: TreeNode[],
  pageList: PageData[],
  llm: LLMProvider,
): Promise<TreeNode[]> {
  for (const item of structure) {
    if (item.physical_index == null) item.appear_start = 'no';
  }
  const validItems = structure.filter((item) => item.physical_index != null);
  const results = await Promise.all(
    validItems.map(async (item) => {
      const pageIdx = (item.physical_index as number) - 1;
      const pageText = pageIdx >= 0 && pageIdx < pageList.length ? pageList[pageIdx].text : '';
      try { return await checkTitleAppearanceInStart(item.title, pageText, llm); }
      catch { return 'no'; }
    }),
  );
  for (let i = 0; i < validItems.length; i++) validItems[i].appear_start = results[i];
  return structure;
}

async function verifyToc(
  pageList: PageData[],
  listResult: TreeNode[],
  startIndex: number,
  llm: LLMProvider,
  pr: ProgressReporter,
): Promise<{ accuracy: number; incorrectResults: TreeNode[] }> {
  pr.report('Verifying TOC accuracy', `Checking ${listResult.length} TOC entries`);

  const lastPhysicalIndex = [...listResult].reverse().find((item) => item.physical_index != null)?.physical_index;
  if (lastPhysicalIndex == null || (lastPhysicalIndex as number) < pageList.length / 2) {
    return { accuracy: 0, incorrectResults: [] };
  }

  const indexedSample = listResult
    .map((item, idx) => ({ ...item, list_index: idx }))
    .filter((item) => item.physical_index != null);

  let checked = 0;
  const results = await Promise.all(
    indexedSample.map(async (item) => {
      const result = await checkTitleAppearance(item, pageList, startIndex, llm);
      checked++;
      pr.advance(
        'Verifying TOC accuracy',
        `Verified ${checked} / ${indexedSample.length} entries`,
      );
      return result;
    }),
  );

  let correctCount = 0;
  const incorrectResults: TreeNode[] = [];
  for (const result of results) {
    if (result.answer === 'yes') correctCount++;
    else incorrectResults.push({ list_index: result.list_index, title: result.title, physical_index: result.page_number } as TreeNode);
  }
  const accuracy = results.length > 0 ? correctCount / results.length : 0;
  console.log(`[PageIndex] Verification accuracy: ${(accuracy * 100).toFixed(1)}%`);
  return { accuracy, incorrectResults };
}

async function singleTocItemIndexFixer(
  sectionTitle: string,
  content: string,
  llm: LLMProvider,
): Promise<number | null> {
  const prompt = `You are given a section title and several pages of a document, your job is to find the physical index of the start page of the section in the partial document.

The provided pages contains tags like <physical_index_X> and <physical_index_X> to indicate the physical location of the page X.

Reply in a JSON format:
{
    "thinking": <explain which page, started and closed by <physical_index_X>, contains the start of this section>,
    "physical_index": "<physical_index_X>" (keep the format)
}
Directly return the final JSON structure. Do not output anything else.

Section Title:
${sectionTitle}

Document pages:
${content}`;

  const response = await llmCall(llm, prompt);
  const json = extractJson(response) as Record<string, string>;
  const phyStr = json['physical_index'];
  if (typeof phyStr === 'string') {
    const match = phyStr.match(/physical_index_(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

async function fixIncorrectToc(
  tocWithPageNumber: TreeNode[],
  pageList: PageData[],
  incorrectResults: TreeNode[],
  startIndex: number,
  llm: LLMProvider,
  pr: ProgressReporter,
): Promise<{ toc: TreeNode[]; stillInvalid: TreeNode[] }> {
  pr.report(
    'Fixing inaccurate TOC entries',
    `Correcting ${incorrectResults.length} entry / entries`,
  );
  const incorrectIndices = new Set(incorrectResults.map((r) => r.list_index as number));
  const endIndex = pageList.length + startIndex - 1;

  const processItem = async (incorrectItem: TreeNode): Promise<{
    list_index: number; title: string; physical_index: number | null; is_valid: boolean;
  }> => {
    const listIndex = incorrectItem.list_index as number;
    if (listIndex < 0 || listIndex >= tocWithPageNumber.length) {
      return { list_index: listIndex, title: incorrectItem.title, physical_index: null, is_valid: false };
    }
    let prevCorrect = startIndex - 1;
    for (let j = listIndex - 1; j >= 0; j--) {
      if (!incorrectIndices.has(j) && tocWithPageNumber[j].physical_index != null) {
        prevCorrect = tocWithPageNumber[j].physical_index as number; break;
      }
    }
    let nextCorrect = endIndex;
    for (let j = listIndex + 1; j < tocWithPageNumber.length; j++) {
      if (!incorrectIndices.has(j) && tocWithPageNumber[j].physical_index != null) {
        nextCorrect = tocWithPageNumber[j].physical_index as number; break;
      }
    }
    const pageContents: string[] = [];
    for (let p = prevCorrect; p <= nextCorrect; p++) {
      const li = p - startIndex;
      if (li >= 0 && li < pageList.length)
        pageContents.push(`<physical_index_${p}>\n${pageList[li].text}\n<physical_index_${p}>\n\n`);
    }
    const physicalIndex = await singleTocItemIndexFixer(incorrectItem.title, pageContents.join(''), llm);
    const checkItem: TreeNode = { ...incorrectItem, physical_index: physicalIndex, list_index: listIndex };
    const checkResult = await checkTitleAppearance(checkItem, pageList, startIndex, llm);
    return { list_index: listIndex, title: incorrectItem.title, physical_index: physicalIndex, is_valid: checkResult.answer === 'yes' };
  };

  const results = await Promise.all(incorrectResults.map(processItem));
  const stillInvalid: TreeNode[] = [];
  for (const result of results) {
    if (result.is_valid && result.list_index >= 0 && result.list_index < tocWithPageNumber.length) {
      tocWithPageNumber[result.list_index].physical_index = result.physical_index;
    } else {
      stillInvalid.push({ list_index: result.list_index, title: result.title, physical_index: result.physical_index } as TreeNode);
    }
  }
  return { toc: tocWithPageNumber, stillInvalid };
}

async function fixIncorrectTocWithRetries(
  tocWithPageNumber: TreeNode[],
  pageList: PageData[],
  incorrectResults: TreeNode[],
  startIndex: number,
  llm: LLMProvider,
  pr: ProgressReporter,
  maxAttempts = 3,
): Promise<TreeNode[]> {
  let current = tocWithPageNumber;
  let currentIncorrect = incorrectResults;
  let attempt = 0;
  while (currentIncorrect.length > 0 && attempt < maxAttempts) {
    const { toc, stillInvalid } = await fixIncorrectToc(current, pageList, currentIncorrect, startIndex, llm, pr);
    current = toc;
    currentIncorrect = stillInvalid;
    attempt++;
    if (currentIncorrect.length > 0) {
      pr.advance('Fixing inaccurate TOC entries', `${currentIncorrect.length} remaining — attempt ${attempt + 1}`);
    }
  }
  return current;
}

// ─── Meta Processor ───────────────────────────────────────────────────────────

type ProcessMode = 'process_toc_with_page_numbers' | 'process_toc_no_page_numbers' | 'process_no_toc';

async function metaProcessor(
  pageList: PageData[],
  mode: ProcessMode,
  opts: ResolvedOpts,
  llm: LLMProvider,
  pr: ProgressReporter,
  startIndex: number,
  tocContent?: string | null,
  tocPageList?: number[],
): Promise<TreeNode[]> {
  console.log(`[PageIndex] Mode: ${mode}, startIndex: ${startIndex}`);

  let tocWithPageNumber: TreeNode[];
  if (mode === 'process_toc_with_page_numbers') {
    tocWithPageNumber = await processTocWithPageNumbers(tocContent!, tocPageList!, pageList, startIndex, opts, llm, pr);
  } else if (mode === 'process_toc_no_page_numbers') {
    tocWithPageNumber = await processTocNoPageNumbers(tocContent!, pageList, startIndex, opts, llm, pr);
  } else {
    tocWithPageNumber = await processNoToc(pageList, startIndex, opts, llm, pr);
  }

  tocWithPageNumber = tocWithPageNumber.filter((item) => item.physical_index != null);
  tocWithPageNumber = validateAndTruncatePhysicalIndices(tocWithPageNumber, pageList.length, startIndex);

  const { accuracy, incorrectResults } = await verifyToc(pageList, tocWithPageNumber, startIndex, llm, pr);

  if (accuracy === 1.0 && incorrectResults.length === 0) return tocWithPageNumber;

  if (accuracy > 0.6 && incorrectResults.length > 0) {
    return fixIncorrectTocWithRetries(tocWithPageNumber, pageList, incorrectResults, startIndex, llm, pr);
  }

  if (mode === 'process_toc_with_page_numbers')
    return metaProcessor(pageList, 'process_toc_no_page_numbers', opts, llm, pr, startIndex, tocContent, tocPageList);
  if (mode === 'process_toc_no_page_numbers')
    return metaProcessor(pageList, 'process_no_toc', opts, llm, pr, startIndex);
  throw new Error('[PageIndex] Processing failed: could not build a valid TOC');
}

// ─── Large Node Processing ────────────────────────────────────────────────────

async function processLargeNodeRecursively(
  node: TreeNode,
  pageList: PageData[],
  opts: ResolvedOpts,
  llm: LLMProvider,
  pr: ProgressReporter,
): Promise<TreeNode> {
  const start = node.start_index ?? 1;
  const end = node.end_index ?? pageList.length;
  const nodePageList = pageList.slice(start - 1, end);
  const tokenNum = nodePageList.reduce((sum, p) => sum + p.tokenCount, 0);

  if (end - start > opts.maxPageNumEachNode && tokenNum >= opts.maxTokenNumEachNode) {
    pr.advance('Resolving large sections', `Sub-indexing "${node.title}" (pages ${start}–${end})`);
    let nodeTocTree = await metaProcessor(nodePageList, 'process_no_toc', opts, llm, pr, start);
    nodeTocTree = await checkTitleAppearanceInStartConcurrent(nodeTocTree, pageList, llm);
    const validItems = nodeTocTree.filter((item) => item.physical_index != null);
    if (validItems.length > 0 && node.title.trim() === validItems[0].title.trim()) {
      node.nodes = postProcessing(validItems.slice(1), end);
      node.end_index = validItems.length > 1 ? validItems[1].start_index ?? end : end;
    } else {
      node.nodes = postProcessing(validItems, end);
      node.end_index = validItems.length > 0 ? validItems[0].start_index ?? end : end;
    }
  }

  if (node.nodes && node.nodes.length > 0) {
    await Promise.all(node.nodes.map((child) => processLargeNodeRecursively(child, pageList, opts, llm, pr)));
  }
  return node;
}

// ─── Summary Generation ───────────────────────────────────────────────────────

async function generateNodeSummary(node: TreeNode, llm: LLMProvider): Promise<string> {
  const prompt = `You are given a part of a document, your task is to generate a description of the partial document about what are main points covered in the partial document.

Partial Document Text: ${node.text}

Directly return the description, do not include any other text.`;
  return llmCall(llm, prompt);
}

async function generateSummariesForStructure(
  structure: TreeNode[],
  llm: LLMProvider,
  pr: ProgressReporter,
): Promise<void> {
  const nodes = structureToList(structure);
  pr.report('Generating node summaries', `0 / ${nodes.length} nodes`);
  let done = 0;
  const summaries = await Promise.all(
    nodes.map(async (n) => {
      const summary = await generateNodeSummary(n, llm);
      done++;
      pr.advance('Generating node summaries', `${done} / ${nodes.length} nodes`);
      return summary;
    }),
  );
  for (let i = 0; i < nodes.length; i++) nodes[i].summary = summaries[i];
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
  return llmCall(llm, prompt);
}

// ─── Tree Parser ──────────────────────────────────────────────────────────────

async function treeParser(
  pageList: PageData[],
  opts: ResolvedOpts,
  llm: LLMProvider,
  pr: ProgressReporter,
): Promise<TreeNode[]> {
  const checkTocResult = await checkToc(pageList, opts, llm, pr);

  let tocWithPageNumber: TreeNode[];
  if (
    checkTocResult.toc_content &&
    checkTocResult.toc_content.trim() &&
    checkTocResult.page_index_given_in_toc === 'yes'
  ) {
    tocWithPageNumber = await metaProcessor(
      pageList, 'process_toc_with_page_numbers', opts, llm, pr, 1,
      checkTocResult.toc_content, checkTocResult.toc_page_list,
    );
  } else {
    tocWithPageNumber = await metaProcessor(pageList, 'process_no_toc', opts, llm, pr, 1);
  }

  tocWithPageNumber = addPrefaceIfNeeded(tocWithPageNumber);
  tocWithPageNumber = await checkTitleAppearanceInStartConcurrent(tocWithPageNumber, pageList, llm);
  const validTocItems = tocWithPageNumber.filter((item) => item.physical_index != null);

  pr.report('Resolving large sections', 'Building final tree structure');
  const tocTree = postProcessing(validTocItems, pageList.length);
  await Promise.all(tocTree.map((node) => processLargeNodeRecursively(node, pageList, opts, llm, pr)));
  return tocTree;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds a hierarchical tree index from a PDF document.
 *
 * Supply either `pdf` (raw PDF bytes, requires pdfjs-dist) or pre-extracted
 * `pages` (array of `{text, tokenCount}` — one entry per page).
 *
 * @example — with OpenAI + progress bar
 * ```ts
 * import { pageIndex } from 'react-native-pageindex';
 * import OpenAI from 'openai';
 *
 * const openai = new OpenAI({ apiKey: '...' });
 *
 * const result = await pageIndex({
 *   pages: myExtractedPages,
 *   docName: 'annual-report',
 *   llm: async (prompt, opts) => {
 *     const res = await openai.chat.completions.create({
 *       model: 'gpt-4o',
 *       messages: [...(opts?.chatHistory ?? []), { role: 'user', content: prompt }],
 *     });
 *     return { content: res.choices[0].message.content ?? '', finishReason: res.choices[0].finish_reason ?? 'stop' };
 *   },
 *   options: {
 *     onProgress: ({ step, percent, detail }) => {
 *       console.log(`[${percent}%] ${step}${detail ? ` — ${detail}` : ''}`);
 *     },
 *   },
 * });
 * ```
 */
export async function pageIndex(input: {
  pdf?: ArrayBuffer | Uint8Array;
  pages?: PageData[];
  llm: LLMProvider;
  docName?: string;
  options?: PageIndexOptions;
}): Promise<PageIndexResult> {
  const { pdf, pages: rawPages, llm, docName = 'document', options = {} } = input;

  if (!pdf && !rawPages) {
    throw new Error('[PageIndex] Provide either `pdf` (ArrayBuffer) or `pages` (PageData[])');
  }

  const opts: ResolvedOpts = {
    tocCheckPageNum: options.tocCheckPageNum ?? DEFAULT_PDF_OPTIONS.tocCheckPageNum,
    maxPageNumEachNode: options.maxPageNumEachNode ?? DEFAULT_PDF_OPTIONS.maxPageNumEachNode,
    maxTokenNumEachNode: options.maxTokenNumEachNode ?? DEFAULT_PDF_OPTIONS.maxTokenNumEachNode,
    ifAddNodeId: options.ifAddNodeId ?? DEFAULT_PDF_OPTIONS.ifAddNodeId,
    ifAddNodeSummary: options.ifAddNodeSummary ?? DEFAULT_PDF_OPTIONS.ifAddNodeSummary,
    ifAddDocDescription: options.ifAddDocDescription ?? DEFAULT_PDF_OPTIONS.ifAddDocDescription,
    ifAddNodeText: options.ifAddNodeText ?? DEFAULT_PDF_OPTIONS.ifAddNodeText,
    counter: options.tokenCounter ?? defaultTokenCounter,
  };

  const pr = new ProgressReporter([...PDF_STEPS], options.onProgress);
  pr.report('Initializing');

  let pageList: PageData[];
  if (rawPages) {
    pageList = rawPages;
  } else {
    pr.report('Extracting PDF pages');
    const { extractPdfPages } = await import('./utils/pdf');
    pageList = await extractPdfPages(pdf!, opts.counter);
  }

  console.log(`[PageIndex] Processing ${pageList.length} pages`);
  const structure = await treeParser(pageList, opts, llm, pr);

  if (opts.ifAddNodeId) writeNodeId(structure);

  if (opts.ifAddNodeSummary) {
    if (!opts.ifAddNodeText) {
      pr.report('Attaching page text to nodes');
      addNodeText(structure, pageList);
    }
    await generateSummariesForStructure(structure, llm, pr);
    if (!opts.ifAddNodeText) removeStructureText(structure);

    if (opts.ifAddDocDescription) {
      const cleanStructure = createCleanStructureForDescription(structure);
      const docDescription = await generateDocDescription(cleanStructure, llm, pr);
      pr.report('Done');
      return { doc_name: docName, doc_description: docDescription, structure };
    }
  } else if (opts.ifAddNodeText) {
    pr.report('Attaching page text to nodes');
    addNodeText(structure, pageList);
  }

  pr.report('Done');
  return { doc_name: docName, structure };
}
