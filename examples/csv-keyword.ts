/**
 * Example: Index a CSV with keyword mode (no LLM needed)
 *
 * Install deps:
 *   npm install react-native-pageindex
 *
 * Run:
 *   npx ts-node examples/csv-keyword.ts demo/public/farmer_dataset.csv
 */

import fs from 'fs';
import {
  extractCsvPages,
  buildReverseIndex,
  searchReverseIndex,
  type PageIndexResult,
} from 'react-native-pageindex';

async function main() {
  const csvPath = process.argv[2] ?? 'demo/public/farmer_dataset.csv';
  const csvText = fs.readFileSync(csvPath, 'utf8');
  console.log(`\nIndexing CSV: ${csvPath}\n`);

  // 1. Parse CSV into pages (10 rows per page)
  const pages = await extractCsvPages(csvText, { rowsPerPage: 10 });
  console.log(`Parsed into ${pages.length} pages`);

  // 2. Build a flat PageIndexResult (no LLM — keyword mode doesn't need one)
  const result: PageIndexResult = {
    doc_name: 'Farmer Dataset',
    structure: pages.map((page, i) => ({
      title: `Rows ${i * 10 + 1}–${(i + 1) * 10}`,
      node_id: `page_${i}`,
      text: page.text,
      start_index: i,
      end_index: i,
    })),
  };

  // 3. Build the keyword reverse index
  const ri = await buildReverseIndex({
    result,
    pages,
    options: {
      mode: 'keyword',
      minTermLength: 3,
      maxTermsPerNode: 30,
    },
  });
  console.log(
    `Built keyword index: ${ri.stats.totalTerms} terms, ${ri.stats.nodeCount} nodes\n`,
  );

  // 4. Run some searches
  const queries = (process.argv[3] ?? 'paddy,wheat,odisha').split(',');
  for (const q of queries) {
    const hits = searchReverseIndex(ri, q.trim(), { topK: 3 });
    if (hits.length === 0) {
      console.log(`"${q}": no results`);
    } else {
      console.log(`"${q}":`);
      for (const hit of hits) {
        console.log(`  [${hit.score.toFixed(3)}] ${hit.node.title}  — matched: ${hit.matchedTerms.join(', ')}`);
      }
    }
  }

  console.log('\nDone ✓');
}

main().catch((e) => { console.error(e); process.exit(1); });
