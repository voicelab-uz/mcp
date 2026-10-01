# Logo SVG → PNG

Source: real VoiceLab wordmark from https://voicelab.uz/logo/logo.svg (800×192), stored as `logo.svg`.

## Required assets (done on box 2026-10-01)

- `logo.png` — 512×512 square PNG (white canvas, centered wordmark)
- `icon.png` — 256×256 square PNG

Regenerate with sharp (or ImageMagick / rsvg-convert) if the brand SVG changes:

```bash
# example using sharp — see agent notes /tmp/svg2png
node convert-logo.mjs
```

Then rebuild: `../build-plugin.sh`
