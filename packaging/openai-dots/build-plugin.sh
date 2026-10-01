#!/usr/bin/env bash
set -euo pipefail

# Build VoiceLab OpenAI Agent Plugin ZIP package
# Usage: ./build-plugin.sh [output-name]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$SCRIPT_DIR/plugin"
OUTPUT_NAME="${1:-voicelab-openai-plugin.zip}"
OUTPUT_PATH="$SCRIPT_DIR/$OUTPUT_NAME"

echo "Building VoiceLab OpenAI plugin package..."
echo ""

# Verify plugin directory exists
if [ ! -d "$PLUGIN_DIR" ]; then
    echo "❌ Error: plugin/ directory not found at $PLUGIN_DIR"
    exit 1
fi

# Verify required files
echo "Verifying required files..."
MISSING_FILES=0

if [ ! -f "$PLUGIN_DIR/plugin.json" ]; then
    echo "  ❌ plugin.json not found"
    MISSING_FILES=$((MISSING_FILES + 1))
else
    echo "  ✓ plugin.json found"
fi

if [ ! -f "$PLUGIN_DIR/mcp.json" ]; then
    echo "  ❌ mcp.json not found"
    MISSING_FILES=$((MISSING_FILES + 1))
else
    echo "  ✓ mcp.json found"
fi

if [ ! -f "$PLUGIN_DIR/skills/get-started/SKILL.md" ]; then
    echo "  ❌ skills/get-started/SKILL.md not found"
    MISSING_FILES=$((MISSING_FILES + 1))
else
    echo "  ✓ skills/get-started/SKILL.md found"
fi

# Check assets (warn but don't fail)
if [ ! -f "$PLUGIN_DIR/assets/logo.png" ]; then
    echo "  ⚠ WARNING: plugin/assets/logo.png not found"
    echo "     OpenAI submission requires a 512x512 logo.png"
    echo "     See plugin/assets/PLACEHOLDER_NOTICE.txt for instructions"
elif [ -f "$PLUGIN_DIR/assets/PLACEHOLDER_NOTICE.txt" ]; then
    echo "  ⚠ WARNING: Assets appear to be placeholders"
    echo "     Replace plugin/assets/* with real VoiceLab branding"
else
    echo "  ✓ logo.png found"
fi

if [ ! -f "$PLUGIN_DIR/assets/icon.png" ]; then
    echo "  ⚠ WARNING: plugin/assets/icon.png not found"
    echo "     OpenAI submission requires a 256x256 icon.png"
elif [ -f "$PLUGIN_DIR/assets/PLACEHOLDER_NOTICE.txt" ]; then
    echo "  ⚠ WARNING: Assets appear to be placeholders"
else
    echo "  ✓ icon.png found"
fi

if [ $MISSING_FILES -gt 0 ]; then
    echo ""
    echo "❌ Build failed: $MISSING_FILES required file(s) missing"
    exit 1
fi

echo ""
echo "Creating $OUTPUT_NAME..."

# Remove old ZIP if exists
if [ -f "$OUTPUT_PATH" ]; then
    rm "$OUTPUT_PATH"
fi

# Create ZIP from plugin/ directory
# -r: recursive
# -q: quiet
# -9: max compression
# -X: exclude extended attributes (macOS ._ files)
# -x: exclude patterns
cd "$PLUGIN_DIR"
zip -r -q -9 -X "$OUTPUT_PATH" . \
    -x "*.DS_Store" \
    -x "__pycache__/*" \
    -x "*.pyc" \
    -x ".git/*" \
    -x "*.swp" \
    -x "*~"

cd "$SCRIPT_DIR"

# Verify ZIP was created
if [ ! -f "$OUTPUT_PATH" ]; then
    echo "❌ Error: Failed to create ZIP package"
    exit 1
fi

# Show ZIP contents
echo ""
echo "✓ Package created: $OUTPUT_NAME"
ls -lh "$OUTPUT_PATH" | awk '{print "  Size:", $5}'

echo ""
echo "ZIP contents:"
unzip -l "$OUTPUT_PATH" | head -n -2 | tail -n +4 | sed 's/^/  /'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Next steps:"
echo ""
echo "1. Verify assets are not placeholders:"
echo "   unzip -p $OUTPUT_NAME assets/PLACEHOLDER_NOTICE.txt"
echo "   (Should fail if real assets are present)"
echo ""
echo "2. Submit at: https://platform.openai.com/plugins"
echo ""
echo "3. Follow submission guide: ./SUBMISSION.md"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
