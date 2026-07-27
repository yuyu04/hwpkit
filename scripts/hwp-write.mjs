// hwp-write.mjs — Create a .hwp / .hwpx document from Markdown.
//
// Usage: node hwp-write.mjs <input.md|-> <output.hwp|output.hwpx>
//   input "-" reads Markdown from stdin.
//   output extension decides the format (.hwpx → OWPML open standard, else .hwp).
//
// Supported Markdown subset (kept deliberately small and robust):
//   # / ## / ###  headings        → sized, bold paragraph (visual hierarchy)
//   - / *          bullet items    → "• " prefixed, indented paragraph (nesting by indent)
//   1. 2. 3.       ordered items   → "N. " kept, indented like bullets
//   | a | b |      table rows      → real HWP table (header row bolded, separator skipped)
//   **bold** *italic* `code`       → inline character formatting
//   [text](url) ![alt](src)        → reduced to their text
//   blank line     paragraph break (consecutive lines soft-wrap into one paragraph)
//   everything else                → plain paragraph
//
// Typography: body text uses a clean sans font (맑은 고딕) at 10pt with 160% line
// spacing; headings step down 22→17→14→11.5pt with spacing above/below. This is
// what makes generated documents look intentional rather than flat.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadRhwp } from './rhwp-init.mjs';
import { fixTableHeaders } from './hwp-fix-tables.mjs';

const [, , inArg, outArg] = process.argv;
if (!inArg || !outArg) {
  console.error('usage: node hwp-write.mjs <input.md|-> <output.hwp|output.hwpx>');
  process.exit(1);
}
const md = inArg === '-' ? readFileSync(0, 'utf8') : readFileSync(inArg, 'utf8');

// ── Typography (sizes are pt×100; margins/spacing are HWPUNIT = pt×100) ──────
const BODY_FONT = '맑은 고딕';   // clean Korean sans; renders well across viewers
const CODE_FONT = 'Consolas';    // monospace for inline code (falls back gracefully)
const BODY_SIZE = 1000;          // 10pt
const CODE_COLOR = '#C0392B';    // subtle red so `code` reads even without the mono font
const LINE_SPACING = 160;        // percent
// heading level → { size, before, after } (spacing in HWPUNIT)
const HEADING = {
  1: { size: 2200, before: 600, after: 300 },
  2: { size: 1700, before: 500, after: 250 },
  3: { size: 1400, before: 400, after: 200 },
  4: { size: 1150, before: 300, after: 150 },
};
const headingStyle = (lvl) => HEADING[Math.min(lvl, 4)];
const INDENT_STEP = 1200;        // per bullet/ordered nesting level

/** Strip link/image markup down to visible text. */
function stripLinks(s) {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
}

/** Split a line into styled inline segments: {text, bold?, italic?, code?}. */
function parseInline(text) {
  const src = stripLinks(text);
  const segs = [];
  const push = (t, style) => { if (t) segs.push({ text: t, ...style }); };
  const re = /(`+)([^`]+?)\1|(\*\*|__)(.+?)\3|(\*|_)([^*_]+?)\5/g;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) push(src.slice(last, m.index), {});
    if (m[1]) push(m[2], { code: true });
    else if (m[3]) push(m[4], { bold: true });
    else if (m[5]) push(m[6], { italic: true });
    last = re.lastIndex;
  }
  if (last < src.length) push(src.slice(last), {});
  if (!segs.length) push(src, {});
  return segs;
}

/** Parse Markdown into a flat block list. */
function parseBlocks(text) {
  const rows = text.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const isSep = (l) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes('-');
  const indentDepth = (l) => Math.floor((l.match(/^\s*/)[0].replace(/\t/g, '  ').length) / 2);
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
    const b = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (b) { blocks.push({ type: 'para', text: `• ${b[2].trim()}`, depth: indentDepth(line) + 1 }); i += 1; continue; }
    const o = /^(\s*)(\d+)\.\s+(.*)$/.exec(line);
    if (o) { blocks.push({ type: 'para', text: `${o[2]}. ${o[3].trim()}`, depth: indentDepth(line) + 1 }); i += 1; continue; }
    // Markdown soft wrap: consecutive plain lines are ONE paragraph. Emitting a
    // paragraph per source line would hard-break sentences mid-word in HWP.
    const chunk = [line.trim()];
    i += 1;
    while (i < rows.length) {
      const next = rows[i];
      if (!next.trim()) break;                       // blank line ends the paragraph
      if (isTableRow(next)) break;
      if (/^#{1,6}\s+/.test(next)) break;
      if (/^\s*[-*+]\s+/.test(next)) break;
      if (/^\s*\d+\.\s+/.test(next)) break;
      chunk.push(next.trim());
      i += 1;
    }
    blocks.push({ type: 'para', text: chunk.join(' ') });
  }
  return blocks;
}

// rhwp's OWPML (HWPX) writer flattens every paragraph to a single character run,
// so mid-paragraph style changes (inline **bold** / *italic* / `code`) are lost —
// applying several shapes would even leak one onto the whole line. The binary .hwp
// writer preserves per-run shapes. So we branch: full inline styling for .hwp, and
// one consistent shape per paragraph for .hwpx (headings/font/spacing still apply).
const isHwpx = /\.hwpx$/i.test(outArg);

const { HwpDocument } = await loadRhwp();
const doc = HwpDocument.createEmpty();
doc.createBlankDocument(); // one empty paragraph at (0,0)

const SEC = 0;
// HWPX only: the original blank paragraph carries a phantom empty run that HWPX's
// writer keeps as the flattened shape, silently dropping the first heading's
// formatting. Isolate it into an empty para 0 (deleted before export) and write real
// content from para 1.
//
// We must NOT do this for binary .hwp: there the section's page definition (paper
// size, margins) is attached to the section's FIRST paragraph, so deleting para 0
// wipes it — the file re-opens with a 0×0 page and absurd pagination. .hwp keeps
// per-run shapes anyway, so it never needed the workaround.
let pi = 0; // current (empty) paragraph to write into
if (isHwpx) {
  doc.splitParagraph(SEC, 0, 0);
  pi = 1;
}

// Register fonts once; reference them by id in char formats.
const idOf = (v) => (typeof v === 'string' && v.startsWith('{') ? (JSON.parse(v).id ?? 0) : v);
const BODY_FONT_ID = idOf(doc.findOrCreateFontId(BODY_FONT));
const CODE_FONT_ID = idOf(doc.findOrCreateFontId(CODE_FONT));

/** Apply character formatting over an already-inserted plain string. */
function styleRuns(applyFmt, segs, { size, bold = false }) {
  const total = segs.reduce((n, s) => n + s.text.length, 0);
  if (!total) return;
  // Every key is set explicitly: applyCharFormat merges onto the ambient shape, so an
  // omitted key would inherit stray bold/italic from a neighbouring or split paragraph.
  const shape = (s) => JSON.stringify({
    fontId: s.code ? CODE_FONT_ID : BODY_FONT_ID,
    fontSize: size,
    bold: bold || !!s.bold,
    italic: !!s.italic,
    textColor: s.code ? CODE_COLOR : '#000000',
  });
  if (isHwpx) {
    // One shape for the whole paragraph (see isHwpx note). Honour inline style only
    // when every segment agrees, so a fully-**bold** line still comes out bold.
    const s0 = segs[0];
    const uniform = segs.every((s) => !!s.bold === !!s0.bold && !!s.italic === !!s0.italic && !!s.code === !!s0.code);
    try { applyFmt(0, total, shape(uniform ? s0 : {})); } catch { /* best effort */ }
    return;
  }
  let off = 0;
  for (const s of segs) {
    if (s.text.length) {
      try { applyFmt(off, off + s.text.length, shape(s)); } catch { /* best effort */ }
    }
    off += s.text.length;
  }
}

/** Write one paragraph (with inline styling + block typography), then open a fresh one. */
function writeParagraph(text, { size = BODY_SIZE, bold = false, before = 0, after = 200, depth = 0 } = {}) {
  const segs = parseInline(text);
  const plain = segs.map((s) => s.text).join('');
  if (plain) doc.insertText(SEC, pi, 0, plain);
  styleRuns((s, e, p) => doc.applyCharFormat(SEC, pi, s, e, p), segs, { size, bold });
  const para = { lineSpacing: LINE_SPACING, lineSpacingType: 'Percent', spacingBefore: before, spacingAfter: after };
  if (depth) para.marginLeft = depth * INDENT_STEP;
  try { doc.applyParaFormat(SEC, pi, JSON.stringify(para)); } catch { /* best effort */ }
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
      // applyCharFormatInCell reports success but is a no-op on freshly-created
      // tables (rhwp limitation), so cell text keeps the document's default font.
      // We still run inline markup through parseInline to strip **/`` markers.
      const plain = parseInline(matrix[r][c] ?? '').map((s) => s.text).join('');
      if (plain) doc.insertTextInCell(SEC, tPara, tCtrl, r * colCount + c, 0, 0, plain);
    }
  }
  // open a fresh paragraph after the table's host paragraph
  const len = doc.getParagraphLength(SEC, tPara);
  doc.splitParagraph(SEC, tPara, len);
  pi = tPara + 1;
}

const blocks = parseBlocks(md);
for (const blk of blocks) {
  if (blk.type === 'heading') {
    const h = headingStyle(blk.level);
    writeParagraph(blk.text, { size: h.size, bold: true, before: h.before, after: h.after });
  } else if (blk.type === 'table') {
    writeTable(blk.rows);
  } else {
    writeParagraph(blk.text, { depth: blk.depth ?? 0 });
  }
}

if (isHwpx) doc.deleteParagraph(SEC, 0); // drop the isolated phantom paragraph
let bytes = isHwpx ? doc.exportHwpx() : doc.exportHwp();
// HWP only: repair freshly-created table headers (42→48 bytes) for Hancom safety.
// HWPX tables are OWPML XML and don't have this issue.
if (!isHwpx) bytes = fixTableHeaders(Buffer.from(bytes));
writeFileSync(outArg, Buffer.from(bytes));
console.error(`wrote ${outArg} (${bytes.length} bytes, ${blocks.length} blocks)`);
