#!/bin/bash
# GitHub Push Instructions - Run this locally where you have GitHub access

set -e

REPO_URL="https://github.com/voicelab-uz/mcp.git"

echo "════════════════════════════════════════════════════════════"
echo "VoiceLab MCP - GitHub Push Script"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "This script will push the complete repository to GitHub."
echo "Target: $REPO_URL"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "wrangler.toml" ]; then
    echo "❌ Error: Run this script from the voicelab-mcp root directory"
    exit 1
fi

echo "✓ Found package.json and wrangler.toml"

# Check for secrets
if [ -f ".env" ] || [ -f ".dev.vars" ]; then
    echo "⚠️  Warning: Found .env or .dev.vars files"
    echo "   These should be in .gitignore and NOT pushed"
    read -p "   Continue? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check current remotes
echo ""
echo "Current remotes:"
git remote -v

# Add GitHub remote if needed
if ! git remote get-url github &>/dev/null; then
    echo ""
    echo "Adding GitHub remote..."
    git remote add github "$REPO_URL"
    echo "✓ Added remote 'github'"
else
    echo ""
    echo "✓ Remote 'github' already exists"
fi

# Show what will be pushed
echo ""
echo "Files to be pushed (top-level):"
git ls-files | grep -v '/' | head -20

echo ""
echo "Directories:"
git ls-files | cut -d/ -f1 | sort -u

# Confirm
echo ""
read -p "Push to GitHub now? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled"
    exit 0
fi

# Push
echo ""
echo "Pushing to GitHub..."
git push github main

# Verify
echo ""
echo "Verifying push..."
git ls-remote github main

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ Successfully pushed to GitHub!"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "View at: https://github.com/voicelab-uz/mcp"
echo ""
