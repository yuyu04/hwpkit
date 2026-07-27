// Round-trip tests: Markdown → .hwp/.hwpx → re-read → text + page geometry.
// Uses only node:test (no dev dependencies), so `npm test` works on a fresh clone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = join(ROOT, 'scripts');
const MD = join(ROOT, 'examples', 'sample.md');
const out = mkdtempSync(join(tmpdir(), 'hwpkit-test-'));

const write = (target) => {
  const file = join(out, target);
  execFileSync(process.execPath, [join(SCRIPTS, 'hwp-write.mjs'), MD, file], { stdio: 'pipe' });
  return file;
};
const read = (file) =>
  execFileSync(process.execPath, [join(SCRIPTS, 'hwp-read.mjs'), file], { encoding: 'utf8' });

/** Re-open a written file with the engine and report page geometry. */
async function geometry(file) {
  const { loadRhwp } = await import(join(SCRIPTS, 'rhwp-init.mjs'));
  const { HwpDocument } = await loadRhwp();
  const doc = new HwpDocument(new Uint8Array(readFileSync(file)));
  doc.convertToEditable();
  const svg = doc.renderPageSvg(0);
  return {
    pageCount: doc.pageCount(),
    width: Number(/\bwidth="([\d.]+)"/.exec(svg)?.[1] ?? 0),
    svgLength: svg.length,
  };
}

for (const ext of ['hwp', 'hwpx']) {
  test(`writes a non-trivial .${ext}`, () => {
    const file = write(`sample.${ext}`);
    assert.ok(statSync(file).size > 4000, `.${ext} looks too small to hold the sample`);
  });

  test(`reads text back from .${ext}`, () => {
    const text = read(join(out, `sample.${ext}`));
    assert.match(text, /2026년 상반기 사업 보고서/);
    assert.match(text, /개요/);
    assert.match(text, /1,850/, 'table cell text should survive the round trip');
  });

  test(`.${ext} keeps a valid page definition`, async () => {
    // Regression guard: deleting the section's first paragraph used to wipe the HWP
    // page definition, which re-opened as a 0×0 page and paginated a 2-page document
    // into 32. A4 at 96dpi is ~794px wide.
    const g = await geometry(join(out, `sample.${ext}`));
    assert.ok(g.width > 700 && g.width < 900, `page width ${g.width} is not A4-like`);
    assert.ok(g.pageCount >= 1 && g.pageCount <= 4, `implausible page count ${g.pageCount}`);
  });

  test(`renders .${ext} page 1 to SVG`, async () => {
    const g = await geometry(join(out, `sample.${ext}`));
    assert.ok(g.svgLength > 10_000, 'SVG looks empty');
  });
}

test('soft-wrapped Markdown lines become one paragraph', () => {
  // Two source lines, one sentence. If each line became its own HWP paragraph the
  // sentence would hard-break mid-word instead of reflowing.
  const md = join(out, 'wrap.md');
  writeFileSync(md, '문단 시작\n계속되는 같은 문단\n\n다음 문단\n');
  const file = join(out, 'wrap.hwp');
  execFileSync(process.execPath, [join(SCRIPTS, 'hwp-write.mjs'), md, file], { stdio: 'pipe' });
  const text = read(file);
  assert.match(text, /문단 시작 계속되는 같은 문단/);
});
