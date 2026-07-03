// hwp-write.mjs — Create a .hwp / .hwpx document from Markdown.
//
// Usage: node hwp-write.mjs <input.md|-> <output.hwp|output.hwpx>
//   input "-" reads Markdown from stdin.
//   output extension decides the format (.hwpx → OWPML open standard, else .hwp).
//
// Supported Markdown subset (kept deliberately small and robust):
//   # / ## / ###  headings        → bold paragraph
//   - / *          bullet items    → "• " prefixed paragraph
//   1. 2. 3.       ordered items   → "N. " kept as-is
//   | a | b |      table rows      → real HWP table (header separator row skipped)
//   blank line     paragraph break
//   everything else                → plain paragraph
import { readFileSync, writeFileSync } from 'node:fs';
import { loadRhwp } from './rhwp-init.mjs';
import { fixTableHeaders } from './hwp-fix-tables.mjs';

const [, , inArg, outArg] = process.argv;
if (!inArg || !outArg) {
  console.error('usage: node hwp-write.mjs <input.md|-> <output.hwp|output.hwpx>');
  process.exit(1);
}
const md = inArg === '-' ? readFileSync(0, 'utf8') : readFileSync(inArg, 'utf8');

/** Parse Markdown into a flat block list. */
function parseBlocks(text) {
  const rows = text.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const isSep = (l) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes('-');
  while (i < rows.length) {
    const line = rows[i];
    if (!line.trim()) { i += 1; continue; }
    if (isTableRow(line)) {
      const cells = [];
      while (i < rows.length && isTableRow(rows[i])) {
        if (!isSep(rows[i])) {
          cells.push(rows[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
        }
        i += 1;
      }
      if (cells.length) blocks.push({ type: 'table', rows: cells });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { blocks.push({ type: 'heading', level: h[1].length, text: h[2].trim() }); i += 1; continue; }
    const b = /^\s*[-*]\s+(.*)$/.exec(line);
    if (b) { blocks.push({ type: 'para', text: `• ${b[1].trim()}` }); i += 1; continue; }
    blocks.push({ type: 'para', text: line.trim() });
    i += 1;
  }
  return blocks;
}

const { HwpDocument } = await loadRhwp();
const doc = HwpDocument.createEmpty();
doc.createBlankDocument(); // one empty paragraph at (0,0)

const SEC = 0;
let pi = 0; // current (empty) paragraph to write into

/** Write text into the current empty paragraph, then open a fresh one after it. */
function writeParagraph(text, { bold = false } = {}) {
  if (text) doc.insertText(SEC, pi, 0, text);
  if (bold && text) {
    try { doc.applyCharFormat(SEC, pi, 0, text.length, JSON.stringify({ bold: true })); } catch { /* best effort */ }
  }
  const len = doc.getParagraphLength(SEC, pi);
  doc.splitParagraph(SEC, pi, len);
  pi += 1;
}

function writeTable(matrix) {
  const rowCount = matrix.length;
  const colCount = Math.max(...matrix.map((r) => r.length));
  const res = JSON.parse(doc.createTable(SEC, pi, 0, rowCount, colCount));
  const tPara = res.paraIdx ?? pi;
  const tCtrl = res.controlIdx ?? 0;
  for (let r = 0; r < rowCount; r += 1) {
    for (let c = 0; c < colCount; c += 1) {
      const val = matrix[r][c] ?? '';
      if (val) doc.insertTextInCell(SEC, tPara, tCtrl, r * colCount + c, 0, 0, val);
    }
  }
  // open a fresh paragraph after the table's host paragraph
  const len = doc.getParagraphLength(SEC, tPara);
  doc.splitParagraph(SEC, tPara, len);
  pi = tPara + 1;
}

const blocks = parseBlocks(md);
for (const blk of blocks) {
  if (blk.type === 'heading') writeParagraph(blk.text, { bold: true });
  else if (blk.type === 'table') writeTable(blk.rows);
  else writeParagraph(blk.text);
}

const isHwpx = /\.hwpx$/i.test(outArg);
let bytes = isHwpx ? doc.exportHwpx() : doc.exportHwp();
// HWP only: repair freshly-created table headers (42→48 bytes) for Hancom safety.
// HWPX tables are OWPML XML and don't have this issue.
if (!isHwpx) bytes = fixTableHeaders(Buffer.from(bytes));
writeFileSync(outArg, Buffer.from(bytes));
console.error(`wrote ${outArg} (${bytes.length} bytes, ${blocks.length} blocks)`);
