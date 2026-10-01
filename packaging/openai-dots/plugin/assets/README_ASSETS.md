# VoiceLab Plugin Assets

## Status

✅ **Real VoiceLab logo downloaded**: `logo.svg` from https://voicelab.uz/logo/logo.svg

⚠️ **PNG conversion required** - see `CONVERT_SVG.md` for instructions

## Required Assets

This directory must contain:

1. **logo.png** - Square logo (512x512px)
   - Used in plugin listings and marketplace
   - Currently: Need to convert `logo.svg` to PNG

2. **icon.png** - Square icon (256x256px)
   - Used in composer/chat interface
   - Can be same as logo or simplified
   - Currently: Need to convert `logo.svg` to PNG

## Source

Official VoiceLab brand asset (SVG format):
- ✅ Downloaded from: https://voicelab.uz/logo/logo.svg
- ⚠️ Not hosted at: https://mcp.voicelab.uz/logo.png (returns 404)

## Creating Placeholder PNGs

The placeholders below are simple colored squares with text. Replace before submission.

### Commands to create placeholders:

```bash
# Requires ImageMagick
convert -size 512x512 xc:#4A90E2 -pointsize 72 -fill white -gravity center -annotate +0+0 "VL" logo.png
convert -size 256x256 xc:#4A90E2 -pointsize 48 -fill white -gravity center -annotate +0+0 "VL" icon.png
```

### Or manually:
1. Create 512x512 PNG with VoiceLab brand colors
2. Add "VoiceLab" text or logo graphic
3. Export as logo.png
4. Create 256x256 simplified version as icon.png
