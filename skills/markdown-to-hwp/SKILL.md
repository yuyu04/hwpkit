---
name: markdown-to-hwp
description: This skill should be used to create a Korean HWP or HWPX document (한글 .hwp / .hwpx) from Markdown. Use it whenever the user asks to produce, generate, export, save, or convert content into a .hwp / .hwpx file — for example "make this a 한글 파일", "export to HWP", "save as 한글", or when a Korean office document is the requested deliverable. Claude cannot write these formats natively.
---

# Create HWP / HWPX from Markdown

Claude/Cowork can already draft polished document content. This skill turns that
content into a native Korean **HWP** or **HWPX** file — which Claude cannot write
on its own.

## How to use

1. Compose the document body as **Markdown**.
2. Save it to a temporary `.md` file (or pass `-` to read Markdown from stdin).
3. Convert, choosing the output extension for the format you want:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/hwp-write.mjs" "<input.md>" "<output.hwp|output.hwpx>"
```

Write the output file into the user's working folder so they receive it directly.

## Supported Markdown

| Markdown | Result |
| --- | --- |
| `# / ## / ###` | Heading, sized for hierarchy (22 / 17 / 14 / 11.5pt), bold |
| plain line | Paragraph (맑은 고딕 10pt, 160% line spacing) |
| `- item` / `* item` | Bullet paragraph (`• item`), indented; nesting by indent |
| `1. item` | Ordered item, indented (number kept) |
| `**bold**` `*italic*` `` `code` `` | Inline character styling |
| `[text](url)` `![alt](src)` | Reduced to their visible text |
| `\| a \| b \|` rows | Real HWP table (the `---` separator row is ignored) |
| blank line | Paragraph break |

## Typography

Output uses a clean sans body font (맑은 고딕) at 10pt with 160% line spacing, and
headings step down in size with spacing above/below — so generated documents read as
intentional rather than flat. This is applied automatically; no options to set.

## Notes

- `.hwp` = legacy binary format (most common in Korean orgs); `.hwpx` = open OWPML standard.
- **Inline styling (`**bold**` / `*italic*` / `` `code` ``) renders in `.hwp`.** In `.hwpx`,
  rhwp's writer collapses each paragraph to a single character run, so mid-paragraph
  emphasis is not preserved (the markers are still stripped, and heading/body fonts,
  sizes, spacing and indentation all apply). **Prefer `.hwp` output when inline emphasis
  matters.**
- Table cells keep the document's default font (Hancom 함초롬바탕); rhwp cannot restyle
  freshly-created table cells. In real 한글 this renders normally.
- For `.hwp`, freshly-created table headers are auto-repaired to the correct 48-byte
  layout so tables render and anchor correctly in Hancom (한글). `.hwpx` needs no such fix.
- Requires Node.js (available in the Cowork VM / Claude Code environment). Dependencies
  are bundled; if missing, run `npm install --prefix "${CLAUDE_PLUGIN_ROOT}"` once.
- Images are on the roadmap.
