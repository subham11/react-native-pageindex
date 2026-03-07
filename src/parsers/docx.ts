/**
 * DOCX parser — extracts per-section PageData from a Word document.
 *
 * Requires `mammoth` to be installed:
 *   npm install mammoth
 *
 * Sections are determined by heading styles (Heading 1/2/3…).
 * If no headings are found, the document is returned as a single page.
 */

import type { PageData, TokenCounter } from '../types';
import { defaultTokenCounter } from '../utils/tokens';

/**
 * Extracts text from a DOCX file and segments it into page-like chunks
 * using heading boundaries.
 *
 * @param data    Raw DOCX bytes (ArrayBuffer or Uint8Array)
 * @param counter Token counter function
 * @returns       Array of `{ text, tokenCount }` — one per heading section
 */
export async function extractDocxPages(
  data: ArrayBuffer | Uint8Array,
  counter: TokenCounter = defaultTokenCounter,
): Promise<PageData[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mammoth: any;
  try {
    mammoth = await import(/* webpackIgnore: true */ 'mammoth' as string);
  } catch {
    throw new Error(
      '[PageIndex] mammoth is not installed. Run: npm install mammoth  (or yarn add mammoth)',
    );
  }

  // Normalise to Buffer/ArrayBuffer
  const buffer =
    data instanceof Uint8Array
      ? (data.buffer as ArrayBuffer).slice(data.byteOffset, data.byteOffset + data.byteLength)
      : data;

  // Extract raw text with heading markers preserved
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const rawResult = await mammoth.extractRawText({ arrayBuffer: buffer });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const fullText: string = rawResult.value as string;

  // Also extract HTML to detect headings
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const htmlResult = await mammoth.convertToHtml({ arrayBuffer: buffer });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const html: string = htmlResult.value as string;

  // Split HTML into sections by heading tags (h1–h6)
  const sections = splitHtmlBySections(html, fullText);

  if (sections.length === 0) {
    // No headings found — return the full document as one page
    return [{ text: fullText, tokenCount: counter(fullText) }];
  }

  return sections.map(({ text }) => ({ text, tokenCount: counter(text) }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface HtmlSection {
  title: string;
  text: string;
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitHtmlBySections(html: string, _fallbackText: string): HtmlSection[] {
  // Match heading tags h1–h6
  const headingRegex = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
  const headingMatches: Array<{ index: number; title: string; fullMatch: string }> = [];
  let m: RegExpExecArray | null;

  while ((m = headingRegex.exec(html)) !== null) {
    headingMatches.push({
      index: m.index,
      title: stripHtmlTags(m[2]).trim(),
      fullMatch: m[0],
    });
  }

  if (headingMatches.length === 0) return [];

  const sections: HtmlSection[] = [];

  for (let i = 0; i < headingMatches.length; i++) {
    const current = headingMatches[i];
    const nextIndex =
      i + 1 < headingMatches.length ? headingMatches[i + 1].index : html.length;
    const sectionHtml = html.slice(current.index, nextIndex);
    const text = stripHtmlTags(sectionHtml);
    sections.push({ title: current.title, text });
  }

  // Prepend any content before the first heading as a "Preface" section
  const firstHeadingIndex = headingMatches[0].index;
  if (firstHeadingIndex > 0) {
    const prefaceHtml = html.slice(0, firstHeadingIndex);
    const prefaceText = stripHtmlTags(prefaceHtml);
    if (prefaceText.trim()) {
      sections.unshift({ title: 'Preface', text: prefaceText });
    }
  }

  return sections;
}
