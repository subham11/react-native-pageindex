/**
 * XLSX / XLS / ODS parser — extracts per-sheet PageData.
 *
 * Requires `xlsx` (SheetJS) to be installed:
 *   npm install xlsx
 *
 * Each worksheet becomes one or more "pages" (chunked by rowsPerChunk).
 * Cells are rendered as a plain-text table.
 */

import type { PageData, TokenCounter, XlsxParseOptions } from '../types';
import { defaultTokenCounter } from '../utils/tokens';

/**
 * Reads an XLSX/XLS/ODS/CSV spreadsheet and returns `PageData[]`.
 *
 * @param data    Raw spreadsheet bytes (ArrayBuffer or Uint8Array)
 * @param options Parsing options (sheets, rowsPerChunk)
 * @param counter Token counter function
 */
export async function extractXlsxPages(
  data: ArrayBuffer | Uint8Array,
  options: XlsxParseOptions = {},
  counter: TokenCounter = defaultTokenCounter,
): Promise<PageData[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let XLSX: any;
  try {
    XLSX = await import(/* webpackIgnore: true */ 'xlsx' as string);
  } catch {
    throw new Error(
      '[PageIndex] xlsx is not installed. Run: npm install xlsx  (or yarn add xlsx)',
    );
  }

  const { sheets: targetSheets, rowsPerChunk = 200 } = options;

  // Normalise to Uint8Array
  const bytes =
    data instanceof Uint8Array
      ? data
      : new Uint8Array(data);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const workbook = XLSX.read(bytes, { type: 'array' });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const sheetNames: string[] = workbook.SheetNames as string[];

  const selectedSheets = targetSheets
    ? sheetNames.filter((n) => targetSheets.includes(n))
    : sheetNames;

  const pages: PageData[] = [];

  for (const sheetName of selectedSheets) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const worksheet = workbook.Sheets[sheetName];

    // Convert sheet to array-of-arrays (rows × cols)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const aoa: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      blankrows: false,
    }) as unknown[][];

    if (aoa.length === 0) continue;

    // Determine header row
    const header = aoa[0].map(String);
    const dataRows = aoa.slice(1);

    if (dataRows.length === 0) {
      const t = formatSheetChunk(sheetName, header, [], 1, 1);
      pages.push({ text: t, tokenCount: counter(t) });
      continue;
    }

    const totalChunks = Math.ceil(dataRows.length / rowsPerChunk);
    for (let c = 0; c < totalChunks; c++) {
      const chunk = dataRows.slice(c * rowsPerChunk, (c + 1) * rowsPerChunk);
      const t = formatSheetChunk(sheetName, header, chunk, c + 1, totalChunks);
      pages.push({ text: t, tokenCount: counter(t) });
    }
  }

  return pages;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSheetChunk(
  sheetName: string,
  header: string[],
  rows: unknown[][],
  chunkNum: number,
  totalChunks: number,
): string {
  const lines: string[] = [];

  lines.push(`=== Sheet: ${sheetName} (Part ${chunkNum}/${totalChunks}) ===`);
  lines.push('');

  // Column widths for alignment
  const colWidths = header.map((h, ci) =>
    Math.min(
      40,
      Math.max(
        h.length,
        ...rows.map((r) => String(r[ci] ?? '').length),
      ),
    ),
  );

  // Header row
  lines.push(header.map((h, i) => h.padEnd(colWidths[i])).join(' | '));
  lines.push(colWidths.map((w) => '-'.repeat(w)).join('-|-'));

  // Data rows
  for (const row of rows) {
    lines.push(
      header.map((_, i) => String(row[i] ?? '').padEnd(colWidths[i])).join(' | '),
    );
  }

  return lines.join('\n');
}
