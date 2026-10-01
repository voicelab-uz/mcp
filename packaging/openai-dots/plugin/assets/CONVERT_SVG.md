# Convert VoiceLab Logo SVG to PNG

## Source

Real VoiceLab logo downloaded from: https://voicelab.uz/logo/logo.svg

✅ **Actual brand asset** (not placeholder) is present as `logo.svg`

## Required Conversions

OpenAI Agent Plugins require PNG format:

1. **logo.png** - 512x512 square PNG
2. **icon.png** - 256x256 square PNG (can be same as logo or simplified)

## Conversion Methods

### Option 1: ImageMagick (if available)
```bash
convert logo.svg -background white -flatten -resize 512x512 logo.png
convert logo.svg -background white -flatten -resize 256x256 icon.png
```

### Option 2: Inkscape (if available)
```bash
inkscape logo.svg --export-width=512 --export-height=512 --export-filename=logo.png
inkscape logo.svg --export-width=256 --export-height=256 --export-filename=icon.png
```

### Option 3: rsvg-convert (if installed)
```bash
rsvg-convert logo.svg -w 512 -h 512 -o logo.png
rsvg-convert logo.svg -w 256 -h 256 -o icon.png
```

### Option 4: Online Tool
1. Upload `logo.svg` to https://cloudconvert.com/svg-to-png
2. Set dimensions: 512x512 for logo, 256x256 for icon
3. Download and place in this directory

### Option 5: Local Image Editor
1. Open `logo.svg` in GIMP, Photoshop, Affinity Designer, etc.
2. Export as PNG:
   - logo.png: 512x512
   - icon.png: 256x256
3. Save to this directory

## Notes

- The source SVG is 800x192 (wide rectangle)
- For square assets, center the VoiceLab wordmark or use just the "V" glyph
- Use white or transparent background
- Ensure readability at small sizes (icon especially)

## Verify

After conversion:
```bash
file logo.png icon.png
# Should show: PNG image data, 512 x 512 / 256 x 256

identify logo.png icon.png  # ImageMagick
# Should show dimensions
```

Then rebuild plugin ZIP:
```bash
cd /workspace/packaging/openai-dots
./build-plugin.sh
```

The build script will confirm PNG files exist and no longer show placeholder warnings.
