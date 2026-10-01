# VoiceLab Plugin Assets

## Required Assets

This directory must contain:

1. **logo.png** - Square logo (minimum 48x48px, recommended 512x512px)
   - Used in plugin listings and marketplace
   - Should be the official VoiceLab brand logo
   - Currently: PLACEHOLDER - Replace with real logo before submission

2. **icon.png** - Square icon (minimum 48x48px, recommended 256x256px)
   - Used in composer/chat interface
   - Can be simplified version of logo
   - Currently: PLACEHOLDER - Replace with real icon before submission

## Where to Get Real Assets

- Check if logo exists at: https://mcp.voicelab.uz/logo.png
- Or contact VoiceLab team at: elzodxon@gmail.com
- Or extract from https://voicelab.uz website

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
