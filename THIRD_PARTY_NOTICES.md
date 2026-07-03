# Third-Party Notices

hwpkit bundles and depends on the following third-party components.

## rhwp (WebAssembly engine — `vendor/rhwp/`)

- Project: https://github.com/edwardkim/rhwp
- License: MIT
- Copyright (c) 2025-2026 Edward Kim

The files in `vendor/rhwp/` (`rhwp.js`, `rhwp_bg.wasm`) are a WebAssembly build of
the rhwp HWP viewer/editor engine, redistributed under the MIT License.

## SheetJS CFB and dependencies (`node_modules/`)

Used by `scripts/hwp-fix-tables.mjs` to read/write the OLE compound file structure
of `.hwp` documents.

- `cfb` — https://github.com/SheetJS/js-cfb — Apache-2.0
- `crc-32` — https://github.com/SheetJS/js-crc32 — Apache-2.0
- `adler-32` — https://github.com/SheetJS/js-adler32 — Apache-2.0

---

"HWP", "HWPX", "한글", and "Hancom" are trademarks of Hancom Inc. hwpkit is an
independent, unaffiliated project and is not endorsed by Hancom Inc. The HWP/HWPX
formats are implemented from publicly available specifications (HWPX / OWPML is the
open national standard KS X 6101).
