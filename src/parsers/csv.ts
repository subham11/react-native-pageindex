/**
 * CSV parser — no external dependencies.
 *
 * Converts a CSV string or buffer into page-like chunks so it can be fed
 * into pageIndex().  Each "page" is a fixed number of rows (rowsPerPage)
 * formatted as a plain-text table.
 */

import type { CsvParseOptions, PageData, TokenCounter } from '../types';
import { defaultTokenCounter } from '../utils/tokens';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parses a CSV file into `PageData[]` chunks.
 *
 * @param data    CSV as a UTF-8 string or raw bytes (ArrayBuffer / Uint8Array)
 * @param options Parsing options (delimiter, rowsPerPage, hasHeader)
 * @param counter Token counter function
 */
export async function extractCsvPages(
  data: string | ArrayBuffer | Uint8Array,
  options: CsvParseOptions = {},
  counter: TokenCounter = defaultTokenCounter,
): Promise<PageData[]> {
  const text = dataToString(data);
  const { rowsPerPage = 100, hasHeader = true } = options;

  const delimiter = options.delimiter ?? detectDelimiter(text);
  const rows = parseCsv(text, delimiter);

  if (rows.length === 0) return [];

  const header = hasHeader ? rows[0] : null;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  if (dataRows.length === 0) {
    const page = formatChunk(header, [], header);
    return [{ text: page, tokenCount: counter(page) }];
  }

  // Split dataRows into page-sized chunks
  const pages: PageData[] = [];
  for (let i = 0; i < dataRows.length; i += rowsPerPage) {
    const chunk = dataRows.slice(i, i + rowsPerPage);
    const pageNum = Math.floor(i / rowsPerPage) + 1;
    const totalPages = Math.ceil(dataRows.length / rowsPerPage);
    const text = formatChunk(header, chunk, header, pageNum, totalPages);
    pages.push({ text, tokenCount: counter(text) });
  }

  return pages;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function dataToString(data: string | ArrayBuffer | Uint8Array): string {
  if (typeof data === 'string') return data;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return new TextDecoder('utf-8').decode(bytes);
}

/** Detects the most likely delimiter by scoring candidates on consistency */
function detectDelimiter(text: string): string {
  const candidates = [',', ';', '\t', '|'];
  const firstLine = text.split('\n')[0] ?? '';
  let best = ',';
  let bestCount = 0;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) { bestCount = count; best = d; }
  }
  return best;
}

/** RFC 4180-compatible CSV parser */
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (const line of lines) {
    if (!inQuotes && line.trim() === '' && currentRow.length === 0) continue;

    for (let i = 0; i <= line.length; i++) {
      const ch = line[i];

      if (i === line.length) {
        // End of line
        if (inQuotes) {
          currentField += '\n';
        } else {
          currentRow.push(currentField.trim());
          currentField = '';
        }
        break;
      }

      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { currentField += '"'; i++; }
          else inQuotes = false;
        } else {
          currentField += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          currentRow.push(currentField.trim());
          currentField = '';
        } else {
          currentField += ch;
        }
      }
    }

    if (!inQuotes) {
      if (currentRow.length > 0) {
        rows.push(currentRow);
        currentRow = [];
      }
    }
  }

  // Flush last row
  if (currentRow.length > 0 || currentField.trim()) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  return rows;
}

/** Formats a chunk of rows as a plain-text table */
function formatChunk(
  header: string[] | null,
  rows: string[][],
  allHeaders: string[] | null,
  pageNum?: number,
  totalPages?: number,
): string {
  const lines: string[] = [];

  if (pageNum !== undefined && totalPages !== undefined) {
    lines.push(`[CSV Data — Rows ${((pageNum - 1) * (rows.length || 1)) + 1}–${(pageNum - 1) * (rows.length || 1) + rows.length} of total, Page ${pageNum}/${totalPages}]`);
    lines.push('');
  }

  const effectiveHeader = header ?? allHeaders;
  if (effectiveHeader) {
    // Column header row
    lines.push(effectiveHeader.join(' | '));
    lines.push(effectiveHeader.map((h) => '-'.repeat(Math.max(h.length, 3))).join('-|-'));
  }

  for (const row of rows) {
    lines.push(row.join(' | '));
  }

  return lines.join('\n');
}
