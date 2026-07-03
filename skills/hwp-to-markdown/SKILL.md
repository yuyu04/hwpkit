---
name: hwp-to-markdown
description: This skill should be used to read Korean HWP or HWPX documents (한글 .hwp / .hwpx files) and extract their text content. Use it whenever the user provides, attaches, or points to a .hwp or .hwpx file and wants to read, summarize, quote, translate, or analyze it — Claude cannot open these Korean word-processor formats natively.
---

# Read HWP / HWPX documents

Claude cannot open `.hwp` or `.hwpx` files on its own. This skill extracts their
text (including the contents of tables, where Korean documents keep most of their
information) so you can read, summarize, quote, or analyze the document.

## How to use

Run the reader on the file path and capture stdout:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/hwp-read.mjs" "<path-to-file.hwp|.hwpx>"
```

The script prints the document text to stdout in reading order (body text plus
table-cell text). Read that output, then answer the user's request.

## Notes

- Works for both legacy `.hwp` (binary, OLE) and `.hwpx` (open OWPML) formats.
- Requires Node.js (already available in the Cowork VM / Claude Code environment).
- Dependencies are bundled in `node_modules`. If they are ever missing, run once:
  `npm install --prefix "${CLAUDE_PLUGIN_ROOT}"`.
- Extraction is text-focused. Complex layout (multi-column, nested tables) is
  flattened into readable reading order rather than reconstructed as Markdown tables.
