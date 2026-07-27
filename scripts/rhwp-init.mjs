// Loads the vendored rhwp WASM engine in plain Node (no browser/DOM).
// rhwp's renderer calls a global measureTextWidth(); in Node there is no
// <canvas>, so we install a lightweight approximation BEFORE init. Exact glyph
// widths only affect line-wrap/pagination hints, which HWP viewers recompute on
// open — the document model (text, tables, structure) is unaffected.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const VENDOR = resolve(here, '../vendor/rhwp');

const g = globalThis;
if (!g.measureTextWidth) {
  g.measureTextWidth = (font, text) => {
    const m = /([\d.]+)px/.exec(font);
    const size = m ? parseFloat(m[1]) : 12;
    let w = 0;
    for (const ch of text) w += (ch.codePointAt(0) > 0x2000 ? 1.0 : 0.55) * size;
    return w;
  };
}

let mod;
/** Initialize (once) and return the rhwp WASM module namespace. */
export async function loadRhwp() {
  if (mod) return mod;
  // pathToFileURL, not a bare path: on Windows, import("D:\\...") is rejected as an
  // unsupported URL scheme ("Received protocol 'd:'"), which broke every script there.
  mod = await import(pathToFileURL(resolve(VENDOR, 'rhwp.js')).href);
  await mod.default({ module_or_path: readFileSync(resolve(VENDOR, 'rhwp_bg.wasm')) });
  return mod;
}
