#!/usr/bin/env node
// hwp-preview.mjs — Render pages of a .hwp / .hwpx to SVG (and optionally PNG).
//
// Usage: node hwp-preview.mjs <input.hwp|input.hwpx> [outdir] [options]
//   --png            also rasterize each page to PNG (needs Chrome/Chromium)
//   --scale <n>      PNG pixel ratio (default 2)
//   --pages <spec>   1-based page list, e.g. "1", "1,3", "2-4" (default: all)
//
// Why this exists: HWP is hard to inspect without Hancom Office (Windows-only for
// most people). rhwp ships its own layout engine, so we can rasterize a page
// anywhere Node runs — handy for README screenshots, code review, CI diffing, and
// for anyone on macOS/Linux who just wants to see what a .hwp contains.
//
// SVG output is dependency-free. PNG needs a Chrome-family browser only as a
// rasterizer (no page scripting, no network): the SVG is wrapped in a local HTML
// file and captured with --screenshot.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { loadRhwp } from './rhwp-init.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const positional = argv.filter((a, i) => !a.startsWith('--') && !['--scale', '--pages'].includes(argv[i - 1]));

const [input, outdirArg] = positional;
if (!input) {
  console.error('usage: node hwp-preview.mjs <input.hwp|input.hwpx> [outdir] [--png] [--scale 2] [--pages 1-3]');
  process.exit(1);
}
const outdir = outdirArg ?? '.';
const scale = Number(opt('--scale', '2')) || 2;
const wantPng = flag('--png');

/** Parse "1,3-5" (1-based, inclusive) into a 0-based index list. */
function parsePages(spec, total) {
  if (!spec) return [...Array(total).keys()];
  const want = new Set();
  for (const part of spec.split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) continue;
    const from = Number(m[1]);
    const to = Number(m[2] ?? m[1]);
    for (let p = from; p <= to; p += 1) if (p >= 1 && p <= total) want.add(p - 1);
  }
  return [...want].sort((a, b) => a - b);
}

/** Locate a Chrome-family binary to use purely as an SVG rasterizer. */
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

const { HwpDocument } = await loadRhwp();
const doc = new HwpDocument(new Uint8Array(readFileSync(input)));
doc.convertToEditable();

const total = doc.pageCount();
const pages = parsePages(opt('--pages', null), total);
if (!pages.length) {
  console.error(`no pages selected (document has ${total})`);
  process.exit(1);
}

mkdirSync(outdir, { recursive: true });
// The format goes in the name so previewing report.hwp and report.hwpx into the same
// directory doesn't silently overwrite one with the other.
const stem = `${basename(input, extname(input))}-${extname(input).slice(1).toLowerCase() || 'hwp'}`;

const chrome = wantPng ? findChrome() : null;
if (wantPng && !chrome) {
  console.error('--png needs a Chrome-family browser; set CHROME_PATH, or drop --png for SVG output.');
  process.exit(1);
}
const staging = wantPng ? join(tmpdir(), `hwpkit-preview-${process.pid}`) : null;
if (staging) mkdirSync(staging, { recursive: true });

for (const p of pages) {
  const svg = doc.renderPageSvg(p);
  const svgPath = join(outdir, `${stem}-p${p + 1}.svg`);
  writeFileSync(svgPath, svg);
  console.error(`wrote ${svgPath}`);
  if (!wantPng) continue;

  // Page size comes from the SVG root; Chrome's viewport must match or it clips.
  const w = Math.ceil(Number(/\bwidth="([\d.]+)"/.exec(svg)?.[1] ?? 794));
  const h = Math.ceil(Number(/\bheight="([\d.]+)"/.exec(svg)?.[1] ?? 1123));
  const htmlPath = join(staging, `${stem}-p${p + 1}.html`);
  writeFileSync(htmlPath, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0}</style>${svg}`);
  const pngPath = resolve(outdir, `${stem}-p${p + 1}.png`);
  // No --user-data-dir on purpose: with a fresh profile, headless Chrome writes the
  // screenshot but then lingers instead of exiting. The timeout is a second belt —
  // we check the file rather than trusting the exit status.
  try {
    execFileSync(chrome, [
      '--headless', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
      `--force-device-scale-factor=${scale}`,
      `--window-size=${w},${h}`,
      `--screenshot=${pngPath}`,
      `file://${htmlPath}`,
    ], { stdio: ['ignore', 'ignore', 'ignore'], timeout: 60_000 });
  } catch { /* fall through to the existence check */ }
  if (!existsSync(pngPath)) {
    console.error(`failed to rasterize page ${p + 1}; the SVG is still at ${svgPath}`);
    process.exitCode = 1;
    continue;
  }
  console.error(`wrote ${pngPath} (${w * scale}×${h * scale})`);
}

if (staging) rmSync(staging, { recursive: true, force: true });
