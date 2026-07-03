// hwp-read.mjs — Read a .hwp / .hwpx file and print its text content.
//
// Usage: node hwp-read.mjs <input.hwp|input.hwpx>
//
// Reconstructs reading order from the rendered layout (getPageTextLayout),
// which includes BOTH body paragraphs and table-cell text — important because
// many Korean documents (연구노트, 공문 등) keep most content inside tables.
// Runs are grouped into lines by their vertical position, then ordered left→right.
import { readFileSync } from 'node:fs';
import { loadRhwp } from './rhwp-init.mjs';

const input = process.argv[2];
if (!input) {
  console.error('usage: node hwp-read.mjs <input.hwp|input.hwpx>');
  process.exit(1);
}

const { HwpDocument } = await loadRhwp();
const doc = new HwpDocument(new Uint8Array(readFileSync(input)));
doc.convertToEditable();

const pageCount = doc.pageCount();
const lines = [];
for (let p = 0; p < pageCount; p += 1) {
  let layout;
  try {
    layout = JSON.parse(doc.getPageTextLayout(p));
  } catch {
    continue;
  }
  // Bucket runs into lines by rounded y, keep x for intra-line ordering.
  const byLine = new Map();
  for (const run of layout.runs ?? []) {
    if (!run.text) continue;
    const key = Math.round((run.y ?? 0) / 2); // ~2px tolerance
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key).push(run);
  }
  const sortedKeys = [...byLine.keys()].sort((a, b) => a - b);
  for (const k of sortedKeys) {
    const runs = byLine.get(k).sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
    const text = runs.map((r) => r.text).join('').replace(/\s+$/g, '');
    if (text.trim()) lines.push(text);
  }
}

process.stdout.write(lines.join('\n') + '\n');
