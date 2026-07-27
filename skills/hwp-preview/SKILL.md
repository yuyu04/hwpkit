---
name: hwp-preview
description: This skill should be used to see what a Korean HWP or HWPX document looks like — rendering its pages to PNG or SVG images. Use it when the user asks to preview, show, view, screenshot, or visually check a .hwp / .hwpx file, when they ask whether a document Claude just generated "looks right", or when a layout/formatting problem needs to be inspected rather than read as text. Works without Hancom Office installed.
---

# Preview HWP / HWPX as images

Reading a `.hwp` gives you its text, but not its *appearance*. This skill renders pages to
images using rhwp's own layout engine, so you can look at a Korean document — or verify a
document you just generated — without Hancom Office.

## How to use

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/hwp-preview.mjs" "<file.hwp|.hwpx>" "<outdir>" --png
```

Then read the produced PNG files with the Read tool to actually look at them.

Options:

| Option | Meaning |
| --- | --- |
| `--png` | Also write PNG (needs Chrome/Chromium/Edge as a rasterizer). Without it, only SVG. |
| `--scale <n>` | PNG pixel ratio, default `2`. Use `1` for a quick look, `3` for detail. |
| `--pages <spec>` | 1-based pages, e.g. `1`, `1,3`, `2-4`. Default: every page. |

Output is named `<stem>-<format>-p<N>.svg` / `.png`, e.g. `report-hwp-p1.png`.

## Typical uses

- **Verify generated output.** After `hwp-write.mjs`, preview page 1 and check the heading
  hierarchy, table borders, and spacing before handing the file to the user.
- **Inspect a document the user sent** when the question is visual ("표가 왜 깨졌지?")
  rather than textual.
- **Show the user what they'll get** without asking them to open 한글.

## Notes

- If `--png` fails because no browser was found, set `CHROME_PATH` to a Chrome/Chromium/Edge
  binary — or drop `--png` and use the SVG, which needs nothing but Node.
- This is rhwp's renderer, not Hancom's. Fonts and pagination are close but not identical,
  and fonts actually available on the machine are substituted. For final visual sign-off,
  the user should open the file in 한글.
- Requires Node.js (available in the Cowork VM / Claude Code environment).
