import type { PageData, TokenCounter } from '../types';
import { defaultTokenCounter } from './tokens';

/**
 * Extracts per-page text from a PDF buffer using `pdfjs-dist`.
 *
 * This is an **optional helper** — install `pdfjs-dist` (>=4.0.0) to use it.
 * If you already have page text (e.g., from `react-native-pdf` or a backend),
 * you can pass `PageData[]` directly to `pageIndex()` without calling this.
 *
 * @param data    Raw PDF bytes (ArrayBuffer or Uint8Array)
 * @param counter Token counter function (defaults to ~4 chars/token)
 * @returns       Array of `{ text, tokenCount }` — one entry per page
 *
 * @example
 * import RNFS from 'react-native-fs';
 * const base64 = await RNFS.readFile(filePath, 'base64');
 * const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
 * const pages = await extractPdfPages(bytes.buffer as ArrayBuffer);
 */
export async function extractPdfPages(
  data: ArrayBuffer | Uint8Array,
  counter: TokenCounter = defaultTokenCounter,
): Promise<PageData[]> {
  // Dynamically import pdfjs-dist so projects that don't need PDF parsing
  // don't get a hard dependency / bundler error.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pdfjsLib: any;
  try {
    // Try the legacy build first (better compatibility with non-browser envs)
    pdfjsLib = await import(/* webpackIgnore: true */ 'pdfjs-dist/legacy/build/pdf' as string);
  } catch {
    try {
      pdfjsLib = await import(/* webpackIgnore: true */ 'pdfjs-dist' as string);
    } catch {
      throw new Error(
        '[PageIndex] pdfjs-dist is not installed. ' +
          'Run: npm install pdfjs-dist  (or yarn add pdfjs-dist)',
      );
    }
  }

  // Normalise to ArrayBuffer (Uint8Array.buffer can be SharedArrayBuffer in some envs)
  const buffer: ArrayBuffer =
    data instanceof Uint8Array
      ? (data.buffer as ArrayBuffer).slice(data.byteOffset, data.byteOffset + data.byteLength)
      : (data as ArrayBuffer);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const doc = await loadingTask.promise;

  const pages: PageData[] = [];
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  for (let i = 1; i <= doc.numPages; i++) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const page = await doc.getPage(i);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const text: string = (content.items as Array<Record<string, unknown>>)
      .map((item) => (typeof item['str'] === 'string' ? item['str'] : ''))
      .join(' ');
    pages.push({ text, tokenCount: counter(text) });
  }

  return pages;
}
