/**
 * Example: Index a Markdown file with Anthropic Claude
 *
 * Install deps:
 *   npm install react-native-pageindex
 *
 * Run:
 *   ANTHROPIC_API_KEY=sk-ant-... npx ts-node examples/markdown-anthropic.ts README.md
 */

import fs from 'fs';
import { pageIndexMd, buildReverseIndex, searchReverseIndex } from 'react-native-pageindex';

// ── LLM Provider (Anthropic) ─────────────────────────────────────────────────
async function callAnthropic(
  prompt: string,
  opts?: { chatHistory?: { role: 'user' | 'assistant'; content: string }[] },
): Promise<{ content: string; finishReason: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 4096,
      messages: [
        ...(opts?.chatHistory ?? []),
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Anthropic ${res.status}: ${err?.error?.message ?? res.statusText}`);
  }
  const data = (await res.json()) as {
    content: { type: string; text?: string }[];
    stop_reason: string;
  };
  return {
    content: data.content.find((b) => b.type === 'text')?.text ?? '',
    finishReason: data.stop_reason ?? 'stop',
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const mdPath = process.argv[2] ?? 'README.md';
  const content = fs.readFileSync(mdPath, 'utf8');
  console.log(`\nIndexing: ${mdPath} (${content.length} chars)\n`);

  // 1. Build the tree index from Markdown
  const result = await pageIndexMd({
    content,
    docName: mdPath,
    llm: callAnthropic,
    options: {
      ifAddNodeSummary: true,
      ifAddDocDescription: true,
      onProgress: ({ step, percent, detail }) =>
        console.log(`  [${String(percent).padStart(3)}%] ${step}${detail ? ` — ${detail}` : ''}`),
    },
  });

  console.log(`\n── Tree (${result.structure.length} root nodes) ──────────────────────────`);

  function printNode(node: (typeof result.structure)[number], depth = 0) {
    console.log('  '.repeat(depth) + (depth === 0 ? '▸ ' : '• ') + node.title);
    for (const child of node.nodes ?? []) printNode(child, depth + 1);
  }
  for (const node of result.structure) printNode(node);

  // 2. Build a keyword reverse index and run a sample search
  console.log('\n── Building reverse index … ────────────────────────────────────');
  const ri = await buildReverseIndex({
    result,
    options: { mode: 'keyword', minTermLength: 3 },
  });
  console.log(`Indexed ${ri.stats.totalTerms} unique terms across ${ri.stats.nodeCount} nodes`);

  const query = process.argv[3] ?? 'install';
  const hits = searchReverseIndex(ri, query, { topK: 3 });
  console.log(`\nTop-3 results for "${query}":`);
  for (const hit of hits) {
    console.log(`  [${hit.score.toFixed(3)}] ${hit.node.title}`);
  }

  console.log('\nDone ✓');
}

main().catch((e) => { console.error(e); process.exit(1); });
