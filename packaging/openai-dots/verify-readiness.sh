#!/usr/bin/env bash
set -euo pipefail

# VoiceLab OpenAI Agent Plugins - Submission Readiness Checker
# Usage: ./verify-readiness.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$SCRIPT_DIR/plugin"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "VoiceLab OpenAI Agent Plugins - Readiness Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

ERRORS=0
WARNINGS=0

# Check required files
echo "📋 Checking required files..."
if [ -f "$PLUGIN_DIR/plugin.json" ]; then
    echo "  ✓ plugin.json"
else
    echo "  ✗ plugin.json MISSING"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "$PLUGIN_DIR/mcp.json" ]; then
    echo "  ✓ mcp.json"
else
    echo "  ✗ mcp.json MISSING"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "$PLUGIN_DIR/skills/get-started/SKILL.md" ]; then
    echo "  ✓ skills/get-started/SKILL.md"
else
    echo "  ✗ skills/get-started/SKILL.md MISSING"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "🎨 Checking assets..."
if [ -f "$PLUGIN_DIR/assets/logo.svg" ]; then
    echo "  ✓ logo.svg (source)"
else
    echo "  ✗ logo.svg MISSING"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "$PLUGIN_DIR/assets/logo.png" ]; then
    echo "  ✓ logo.png (512x512)"
else
    echo "  ⚠ logo.png MISSING - convert SVG to PNG"
    WARNINGS=$((WARNINGS + 1))
fi

if [ -f "$PLUGIN_DIR/assets/icon.png" ]; then
    echo "  ✓ icon.png (256x256)"
else
    echo "  ⚠ icon.png MISSING - convert SVG to PNG"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "🌐 Checking URLs..."
check_url() {
    local url=$1
    local name=$2
    if curl -sSf -I "$url" > /dev/null 2>&1; then
        echo "  ✓ $name ($url)"
    else
        echo "  ✗ $name UNREACHABLE ($url)"
        ERRORS=$((ERRORS + 1))
    fi
}

check_url "https://voicelab.uz/privacy" "Privacy Policy"
check_url "https://voicelab.uz/terms" "Terms of Service"
check_url "https://docs.voicelab.uz/mcp/security" "Support URL"
check_url "https://mcp.voicelab.uz/mcp" "MCP Server"

echo ""
echo "🔧 Checking MCP tool hints..."
if [ -f "$SCRIPT_DIR/../../src/tools.ts" ]; then
    HINT_COUNT=$(grep -E "(readOnlyHint|destructiveHint|openWorldHint)" "$SCRIPT_DIR/../../src/tools.ts" | wc -l)
    if [ "$HINT_COUNT" -ge 30 ]; then
        echo "  ✓ Tool hints present ($HINT_COUNT annotations found)"
        echo "  ⚠ Verify deployed to https://mcp.voicelab.uz/mcp"
        WARNINGS=$((WARNINGS + 1))
    else
        echo "  ✗ Tool hints missing or incomplete (found $HINT_COUNT, expected ≥30)"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "  ⚠ src/tools.ts not found (cannot verify hints)"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "📦 Checking build..."
if [ -f "$SCRIPT_DIR/voicelab-openai-plugin.zip" ]; then
    SIZE=$(ls -lh "$SCRIPT_DIR/voicelab-openai-plugin.zip" | awk '{print $5}')
    echo "  ✓ voicelab-openai-plugin.zip exists ($SIZE)"
    
    # Check if PNGs are in ZIP
    if unzip -l "$SCRIPT_DIR/voicelab-openai-plugin.zip" | grep -q "logo.png"; then
        echo "  ✓ ZIP contains logo.png"
    else
        echo "  ⚠ ZIP missing logo.png - rebuild after PNG conversion"
        WARNINGS=$((WARNINGS + 1))
    fi
    
    if unzip -l "$SCRIPT_DIR/voicelab-openai-plugin.zip" | grep -q "icon.png"; then
        echo "  ✓ ZIP contains icon.png"
    else
        echo "  ⚠ ZIP missing icon.png - rebuild after PNG conversion"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "  ⚠ voicelab-openai-plugin.zip not found - run ./build-plugin.sh"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Summary:"
echo "  Errors:   $ERRORS"
echo "  Warnings: $WARNINGS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✅ READY FOR SUBMISSION!"
    echo ""
    echo "Next steps:"
    echo "1. Upload voicelab-openai-plugin.zip to https://platform.openai.com/plugins"
    echo "2. Complete domain verification"
    echo "3. Submit for review"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo "⚠️  ALMOST READY - Address warnings:"
    echo ""
    if [ $WARNINGS -gt 0 ]; then
        echo "Required actions:"
        echo "• Convert logo.svg to PNG (see plugin/assets/CONVERT_SVG.md)"
        echo "• Rebuild ZIP: ./build-plugin.sh"
        echo "• Deploy MCP server with tool hints"
        echo ""
        echo "Then run this script again to verify."
    fi
    exit 1
else
    echo "❌ NOT READY - Fix $ERRORS error(s) before submission"
    exit 2
fi
