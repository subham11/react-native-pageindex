/**
 * Browser-specific file extractors for the demo app.
 *
 * These live in demo/ rather than the main package because they use
 * browser-only APIs (DOMParser, window) and the CDN worker trick for pdfjs.
 */

import type { PageData, TokenCounter } from 'react-native-pageindex';

// ─── Default token counter ────────────────────────────────────────────────────
const defaultTokens: TokenCounter = (t) => Math.ceil((t ?? '').length / 4);

// ─── PDF ──────────────────────────────────────────────────────────────────────

/**
 * Extract text pages from a PDF ArrayBuffer using pdfjs-dist.
 * The worker is loaded from a CDN so we don't need a bundler config.
 */
export async function extractPdfPagesFromBuffer(
  buffer: ArrayBuffer,
  tokenCounter: TokenCounter = defaultTokens,
): Promise<PageData[]> {
  // Dynamic import — pdfjs-dist is installed in demo/node_modules
  const pdfjsLib = await import('pdfjs-dist');

  // Point the worker at the CDN to avoid bundler worker config headaches
  const workerVersion = (pdfjsLib as any).version ?? '5.5.207';
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${workerVersion}/pdf.worker.min.mjs`;

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  const pages: PageData[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Join text items, inserting newlines when items have a large y-gap
    let text = '';
    let lastY: number | null = null;
    for (const item of content.items as any[]) {
      if (item.str == null) continue;
      if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
        text += '\n';
      }
      text += item.str;
      lastY = item.transform[5];
    }
    text = text.trim();
    pages.push({ text, tokenCount: tokenCounter(text) });
  }
  return pages;
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

/**
 * Convert an HTML string to a Markdown-like plain text string suitable
 * for passing to pageIndexMd().
 * Uses the browser's built-in DOMParser.
 */
export function htmlToMarkdown(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove scripts, styles, nav, footer
  for (const tag of ['script', 'style', 'nav', 'footer', 'header', 'aside']) {
    doc.querySelectorAll(tag).forEach((el) => el.remove());
  }

  function nodeToMd(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent ?? '').replace(/\s+/g, ' ');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const children = Array.from(el.childNodes).map(nodeToMd).join('');

    switch (tag) {
      case 'h1': return `\n# ${children.trim()}\n`;
      case 'h2': return `\n## ${children.trim()}\n`;
      case 'h3': return `\n### ${children.trim()}\n`;
      case 'h4': return `\n#### ${children.trim()}\n`;
      case 'h5': return `\n##### ${children.trim()}\n`;
      case 'h6': return `\n###### ${children.trim()}\n`;
      case 'p':  return `\n${children.trim()}\n`;
      case 'br': return '\n';
      case 'li': return `\n- ${children.trim()}`;
      case 'ul':
      case 'ol': return `\n${children}\n`;
      case 'strong':
      case 'b':  return `**${children}**`;
      case 'em':
      case 'i':  return `_${children}_`;
      case 'code': return `\`${children}\``;
      case 'pre': return `\n\`\`\`\n${children.trim()}\n\`\`\`\n`;
      case 'blockquote': return `\n> ${children.trim()}\n`;
      case 'hr': return '\n---\n';
      case 'table': return extractTable(el);
      case 'a': return children;      // keep link text, drop URL
      case 'img': return '';          // drop images
      default: return children;
    }
  }

  function extractTable(table: Element): string {
    const rows = Array.from(table.querySelectorAll('tr'));
    return (
      '\n' +
      rows
        .map((row) =>
          Array.from(row.querySelectorAll('td,th'))
            .map((cell) => (cell.textContent ?? '').trim())
            .join(' | ')
        )
        .filter(Boolean)
        .join('\n') +
      '\n'
    );
  }

  const md = nodeToMd(doc.body ?? doc.documentElement);
  // Collapse 3+ blank lines to 2
  return md.replace(/\n{3,}/g, '\n\n').trim();
}

// ─── Plain text / Markdown ────────────────────────────────────────────────────

/** Read a text File as a string */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Read a file as an ArrayBuffer (for PDF / DOCX / XLSX) */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return the lowercase extension of a filename, e.g. "pdf", "html", "csv" */
export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

/** File types the demo supports for upload */
export type SupportedFileType = 'pdf' | 'html' | 'csv' | 'md' | 'docx' | 'xlsx' | 'txt';

export function getSupportedFileType(filename: string): SupportedFileType | null {
  const ext = getFileExtension(filename);
  const map: Record<string, SupportedFileType> = {
    pdf:  'pdf',
    html: 'html',
    htm:  'html',
    csv:  'csv',
    md:   'md',
    txt:  'txt',
    docx: 'docx',
    xlsx: 'xlsx',
  };
  return map[ext] ?? null;
}
