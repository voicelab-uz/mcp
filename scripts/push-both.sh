#!/bin/bash
# Push to both Origin (Cursor) and GitHub remotes

set -e

BRANCH="${1:-main}"

echo "📦 Pushing branch: $BRANCH"
echo ""

echo "1️⃣  Pushing to Origin (cursor.com)..."
if git push origin "$BRANCH"; then
    echo "   ✅ Pushed to Origin"
else
    echo "   ❌ Failed to push to Origin"
    exit 1
fi

echo ""
echo "2️⃣  Pushing to GitHub (github.com/voicelab-uz/mcp)..."
if git push github "$BRANCH"; then
    echo "   ✅ Pushed to GitHub"
else
    echo "   ⚠️  Failed to push to GitHub"
    echo "   Hint: Run 'git remote add github https://github.com/voicelab-uz/mcp.git'"
    exit 1
fi

echo ""
echo "✨ Successfully pushed to both remotes!"
