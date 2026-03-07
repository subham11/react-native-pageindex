/**
 * Example: Index a PDF with OpenAI
 *
 * Install deps:
 *   npm install react-native-pageindex pdfjs-dist openai
 *
 * Run:
 *   OPENAI_API_KEY=sk-... npx ts-node examples/pdf-openai.ts
 */

import fs from 'fs';
import { pageIndex, extractPdfPages } from 'react-native-pageindex';

// ── LLM Provider (OpenAI) ────────────────────────────────────────────────────
async function callOpenAI(
  prompt: string,
  opts?: { chatHistory?: { role: 'user' | 'assistant'; content: string }[] },
): Promise<{ content: string; finishReason: string }> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        ...(opts?.chatHistory ?? []),
        { role: 'user', content: prompt },
      ],
      max_tokens: 4096,
      temperature: 0.1,
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`OpenAI ${res.status}: ${err?.error?.message ?? res.statusText}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string }; finish_reason: string }[];
  };
  return {
    content: data.choices[0].message.content ?? '',
    finishReason: data.choices[0].finish_reason,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const pdfPath = process.argv[2] ?? 'demo/public/crop_production_guide.pdf';
  console.log(`\nIndexing: ${pdfPath}\n`);

  // 1. Extract per-page text from the PDF
  const pdfBuffer = fs.readFileSync(pdfPath).buffer as ArrayBuffer;
  const pages = await extractPdfPages(pdfBuffer);
  console.log(`Extracted ${pages.length} pages`);

  // 2. Build the hierarchical index
  const result = await pageIndex({
    pages,
    llm: callOpenAI,
    docName: 'Crop Production Guide',
    options: {
      ifAddNodeSummary: true,
      ifAddDocDescription: true,
      onProgress: ({ step, percent, detail }) =>
        console.log(`  [${String(percent).padStart(3)}%] ${step}${detail ? ` — ${detail}` : ''}`),
    },
  });

  // 3. Print the tree
  console.log('\n── Result ──────────────────────────────────────────────────────');
  console.log(`Doc: ${result.doc_name}`);
  if (result.doc_description) console.log(`Desc: ${result.doc_description}`);
  console.log(`\nStructure (${result.structure.length} root nodes):`);

  function printNode(node: (typeof result.structure)[number], indent = 0) {
    const prefix = '  '.repeat(indent) + (indent === 0 ? '▸ ' : '• ');
    const pages =
      node.start_index != null && node.end_index != null
        ? ` [pp. ${node.start_index}–${node.end_index}]`
        : '';
    console.log(`${prefix}${node.title}${pages}`);
    if (node.summary) {
      console.log(`${'  '.repeat(indent + 1)}↳ ${node.summary.slice(0, 80)}…`);
    }
    for (const child of node.nodes ?? []) printNode(child, indent + 1);
  }

  for (const node of result.structure) printNode(node);
  console.log('\nDone ✓');
}

main().catch((e) => { console.error(e); process.exit(1); });
