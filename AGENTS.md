# AGENTS.md

Instructions for AI coding agents. hwpkit reads, writes and previews Korean HWP/HWPX
(한글) documents — formats most AI runtimes cannot handle natively.

Everything below is plain Node with no install step: dependencies and the rhwp WASM
engine are committed. Requires Node.js 18+.

## Using hwpkit to handle .hwp / .hwpx

### Read a document

```bash
node scripts/hwp-read.mjs <file.hwp|file.hwpx>
```

Prints the text to stdout in reading order, including table-cell text. Korean documents
(연구노트, 공문, 보고서) keep much of their content inside tables, so never assume the body
paragraphs are the whole document.

### Create a document from Markdown

```bash
node scripts/hwp-write.mjs <input.md|-> <output.hwp|output.hwpx>
```

Pass `-` to read Markdown from stdin. **The output extension picks the format.**

| Markdown | Result |
| --- | --- |
| `#` `##` `###` | Heading, sized for hierarchy (22 / 17 / 14 / 11.5pt), bold |
| plain lines | Paragraph (맑은 고딕 10pt, 160% line spacing); consecutive lines join into one paragraph |
| `- item` / `* item` | Bullet paragraph (`• item`), indented; nesting by indent |
| `1. item` | Ordered item, indented |
| `**bold**` `*italic*` `` `code` `` | Inline character styling — **`.hwp` only**, see below |
| `[text](url)` `![alt](src)` | Reduced to their visible text |
| `\| a \| b \|` | Real HWP table; the `---` separator row is ignored |

Anything else becomes a plain paragraph. There is no support for images, block quotes,
code fences, or horizontal rules — do not emit Markdown expecting them to render.

### Choosing .hwp vs .hwpx

- **`.hwp`** — legacy binary, what most Korean organisations actually use. Preserves
  per-run inline styling. **Default to this unless the user asks otherwise.**
- **`.hwpx`** — open OWPML standard (KS X 6101). rhwp's HWPX writer collapses each
  paragraph to a single character run, so mid-paragraph `**bold**` is lost. Headings,
  fonts, sizes, spacing and indentation still apply.

### Verify before handing the file over

Do not claim the document looks right without checking. Render page 1 and actually look
at the image:

```bash
node scripts/hwp-preview.mjs <file.hwp> <outdir> --png --pages 1
```

Then read the produced PNG. Output is `<stem>-<format>-p<N>.png`. Options: `--scale <n>`
(default 2), `--pages 1,3` or `2-4`, and plain SVG output if you omit `--png`.

`--png` needs a Chrome-family browser purely as a rasterizer; set `CHROME_PATH` if it
isn't found, or drop `--png` and use the SVG, which needs nothing but Node.

The preview is rhwp's renderer, not Hancom's — close, but tell the user to open the file
in 한글 for final visual sign-off.

### Known limitations to state honestly

- Table cells keep the document's default font; rhwp cannot restyle freshly-created cells.
- Reading flattens layout into reading order — multi-column and nested tables come out as
  linear text, not reconstructed Markdown tables.
- Pagination can differ slightly between `.hwp` and `.hwpx` for the same Markdown.

## Working on hwpkit itself

```bash
npm test                 # round-trip: text, table contents, page geometry, SVG render
npm run example          # regenerate examples/sample.hwp and .hwpx
npm run example:preview  # regenerate the README hero image
```

Rules:

- **No new runtime dependencies.** Everything ships vendored so the skill works offline
  inside a sandboxed VM. New deps are a hard sell.
- `npm test` must pass, and new behaviour needs a test.
- If you change writer output, regenerate `examples/` and `docs/images/` so the README
  screenshot stays honest.
- Comments explain *why*, especially for HWP format quirks.

Before patching the writer, read [CONTRIBUTING.md](CONTRIBUTING.md) — it documents the
rhwp and HWP-format traps we already hit (the section's page definition living on
paragraph 0, HWPX run flattening, `applyCharFormat` merging onto the ambient shape,
`applyCharFormatInCell` silently no-oping, `findOrCreateFontId` returning JSON).

## Tool-specific setup

Most agents read `AGENTS.md` at the repo root automatically. Two exceptions:

- **Gemini CLI** does not read `AGENTS.md` unless you add it to `settings.json`:
  ```json
  { "context": { "fileName": ["GEMINI.md", "AGENTS.md"] } }
  ```
- **Claude Code / Claude Cowork** use the Agent Skills in `skills/` instead, which
  activate automatically. See [README.md](README.md).
