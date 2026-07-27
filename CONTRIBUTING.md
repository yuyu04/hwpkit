# Contributing to hwpkit

Thanks for helping out. HWP has a lot of dialects in the wild, so the most valuable
contribution is usually **a document that doesn't work** plus what you expected.

## Reporting a bug

Please include:

1. What you ran (`hwp-read.mjs` / `hwp-write.mjs` / `hwp-preview.mjs`, with arguments).
2. Node version (`node -v`) and OS.
3. **A sample file**, if you can share one. If the document is confidential, a redacted
   version that still reproduces the problem is just as useful — or a `.md` that produces
   bad output.
4. For visual problems, a preview PNG helps:
   ```bash
   node scripts/hwp-preview.mjs your.hwp out/ --png
   ```

## Development

No build step and no dev dependencies. Clone and run.

```bash
git clone https://github.com/yuyu04/hwpkit && cd hwpkit
npm test                                        # round-trip + geometry + render tests
node scripts/hwp-write.mjs examples/sample.md /tmp/out.hwp
node scripts/hwp-preview.mjs /tmp/out.hwp /tmp --png    # eyeball the result
```

If you change writer output, regenerate the committed example and its preview so the
README screenshot stays honest:

```bash
npm run example          # regenerate examples/sample.hwp and .hwpx
npm run example:preview  # regenerate docs/images/sample-hwp-p1.png (the README hero)
```

## Things worth knowing before you patch the writer

These are real constraints we hit, documented so you don't rediscover them the hard way:

- **The section's page definition lives on the first paragraph of a binary `.hwp`.**
  Deleting paragraph 0 wipes paper size and margins — the file re-opens as a 0×0 page with
  absurd pagination. `test/roundtrip.test.mjs` guards this.
- **rhwp's HWPX writer flattens each paragraph to one character run**, so per-run inline
  styling only survives in `.hwp`.
- **`applyCharFormat` merges onto the ambient shape.** Set every key explicitly or a
  neighbouring paragraph's bold/italic leaks in.
- **`applyCharFormatInCell` reports success but is a no-op** on freshly-created tables.
- **`findOrCreateFontId` returns JSON**, not a bare id — take `.id`.

## Pull requests

- Keep the dependency count at zero-ish. Everything ships vendored so the skill works
  offline inside Cowork's VM; new runtime dependencies are a hard sell.
- `npm test` must pass. Add a test for behaviour you fix.
- Match the surrounding comment style: explain *why*, especially for HWP format quirks.

## License

Contributions are accepted under the [MIT License](LICENSE).
