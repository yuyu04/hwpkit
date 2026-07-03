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
| `# / ## / ###` | Heading (bold paragraph) |
| plain line | Paragraph |
| `- item` / `* item` | Bullet paragraph (`• item`) |
| `\| a \| b \|` rows | Real HWP table (the `---` separator row is ignored) |
| blank line | Paragraph break |

## Notes

- `.hwp` = legacy binary format (most common in Korean orgs); `.hwpx` = open OWPML standard.
- For `.hwp`, freshly-created table headers are auto-repaired to the correct 48-byte
  layout so tables render and anchor correctly in Hancom (한글). `.hwpx` needs no such fix.
- Requires Node.js (available in the Cowork VM / Claude Code environment). Dependencies
  are bundled; if missing, run `npm install --prefix "${CLAUDE_PLUGIN_ROOT}"` once.
- Formatting is intentionally simple (headings, paragraphs, bullets, tables). Rich
  styling and images are on the roadmap.
