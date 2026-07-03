# hwpkit

**Read and write Korean HWP / HWPX documents (한글) from Claude, Claude Cowork, or the command line.**

Claude — and AI document tools built on it, like **Claude Cowork** — can create and
read `.docx`, `.pptx`, `.xlsx`, `.pdf`, and Markdown, but **not** Korea's `.hwp` /
`.hwpx` formats, because no HWP library exists in their runtime. hwpkit fills that gap:
it ships the [rhwp](https://github.com/edwardkim/rhwp) HWP engine (compiled to
WebAssembly) plus small Node.js scripts, packaged as an **Agent Skill / plugin** that
runs entirely **locally** — inside Cowork's VM or your own machine. No server, no upload;
your documents never leave the environment.

## What it does

- **Read** `.hwp` / `.hwpx` → text (including table contents), so Claude can summarize,
  quote, translate, or analyze Korean documents.
- **Write** Markdown → `.hwp` / `.hwpx`, so Claude can hand you a native 한글 file.
  Created tables are auto-repaired to Hancom-safe headers.

## Use in Claude Cowork

Cowork runs a Linux VM with **Node.js pre-installed**, so hwpkit's scripts execute
locally in that VM — no server, and your documents never leave the environment. There
are two ways to use it; **Method A is the most reliable.**

### Method A — clone into your Cowork folder and run the scripts (recommended)

1. In the folder you gave Cowork access to, get the repo:
   ```bash
   git clone https://github.com/yuyu04/hwpkit
   ```
   (`node_modules` + the rhwp WASM are committed, so **no `npm install` is needed**.)
2. Then just ask Cowork, e.g.:
   - **Read:** *"read this .hwp with hwpkit/scripts/hwp-read.mjs"* → runs
     `node hwpkit/scripts/hwp-read.mjs <file.hwp>` and returns the text.
   - **Write:** *"draft this as Markdown, then convert to HWP with hwpkit/scripts/hwp-write.mjs"* →
     `node hwpkit/scripts/hwp-write.mjs <file.md> <out.hwp>`.

### Method B — install as a Cowork plugin (skills activate automatically)

Cowork → **Customize → Plugins → add a custom plugin**, using the GitHub source
`yuyu04/hwpkit` (now public). Once installed, the skills `hwp-to-markdown` and
`markdown-to-hwp` fire automatically whenever you ask Cowork to read or produce a
`.hwp` / `.hwpx` file — no explicit script path needed.

> Note: adding a plugin from a GitHub repo in Cowork is currently in beta. If it
> doesn't connect, download this repo as a ZIP and use "upload a custom plugin
> file", or just use Method A.

**한국어 요약:** 코워크 VM에 Node가 있어 로컬로 동작합니다(서버·업로드 없음).
가장 확실한 건 **방법 A** — 코워크 작업 폴더에 `git clone` 후 "hwpkit/scripts/hwp-write.mjs로
이 내용을 hwp로 저장해줘"처럼 요청. 자동 스킬 활성화를 원하면 **방법 B**(Customize→Plugins→
GitHub `yuyu04/hwpkit`, 베타).

### In Claude Code

```bash
git clone https://github.com/yuyu04/hwpkit
# add hwpkit as a plugin dir (--plugin-dir), or point Claude Code at it
```

### As a plain CLI

```bash
git clone https://github.com/yuyu04/hwpkit && cd hwpkit
npm install           # dependencies are also bundled; this is optional

# read
node scripts/hwp-read.mjs report.hwp

# write (extension picks the format)
node scripts/hwp-write.mjs report.md report.hwp
node scripts/hwp-write.mjs report.md report.hwpx
```

Requires Node.js 18+.

## Supported Markdown (write)

`#`/`##`/`###` headings, paragraphs, `-`/`*` bullets, and `| pipe | tables |`.
Blank lines separate paragraphs.

## How it works

- `vendor/rhwp/` — the rhwp engine compiled to WebAssembly (MIT). Runs in Node with a
  lightweight text-measurement shim (there is no `<canvas>` in Node; exact glyph widths
  only affect layout hints, which HWP viewers recompute on open).
- `scripts/hwp-read.mjs` — loads the document and reconstructs text from the rendered layout.
- `scripts/hwp-write.mjs` — builds a document from Markdown via the engine's editing API and
  exports `.hwp` / `.hwpx`.
- `scripts/hwp-fix-tables.mjs` — post-processes `.hwp` bytes to rewrite freshly-created table
  `CTRL_HEADER`s to the correct 48-byte layout (a JS port of the same fix hop's desktop app
  applies on save), so tables render/anchor correctly in Hancom.

## Limitations & roadmap

- Write formatting is intentionally minimal (headings, paragraphs, bullets, tables).
  Rich character/paragraph styling, images, and template-preserving fills are on the roadmap.
- Read flattens complex layout into reading order rather than reconstructing Markdown tables.
- Final visual fidelity is best confirmed by opening the file in Hancom (한글).

## Format background

`.hwpx` is an open national standard (**OWPML / KS X 6101**) — a ZIP of XML, similar to
`.docx`. Legacy `.hwp` is an OLE compound binary whose spec Hancom published in 2010.
Implementing interoperable readers/writers from these specs is well-established
(LibreOffice, pyhwp, hwp.js, ONLYOFFICE).

## License

MIT — see [LICENSE](LICENSE). Bundles the rhwp engine and other components under their own
licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). "HWP", "한글", and "Hancom"
are trademarks of Hancom Inc.; this project is an independent, unaffiliated,
HWP-compatible tool.
