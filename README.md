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

## Install

### In Claude Cowork / Claude Desktop (as a plugin)

Cowork and Claude Desktop load plugins locally. Add this repository as a plugin
(via **Customize → Plugins**, or a private/GitHub plugin source). The two skills
(`hwp-to-markdown`, `markdown-to-hwp`) then activate automatically when you ask
Claude to read or produce a `.hwp` / `.hwpx` file.

### In Claude Code

```bash
git clone https://github.com/yuyu04/hwpkit
# add hwpkit as a plugin dir, or point Claude Code at it
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
