# Mirroring to Public GitHub Repository

This document provides instructions for pushing the VoiceLab MCP server from Origin (cursor.com git) to the public GitHub repository at https://github.com/voicelab-uz/mcp.

## Prerequisites

- Access to the Origin repository (where code currently lives)
- Push access to https://github.com/voicelab-uz/mcp
- Git configured locally

## One-Time Setup

### 1. Add GitHub Remote

```bash
cd /workspace

# Add GitHub as a remote named 'github'
git remote add github https://github.com/voicelab-uz/mcp.git

# Verify remotes
git remote -v
# Should show:
# origin    https://origin.cursor.com/git/elzodxon/tmp-...git
# github    https://github.com/voicelab-uz/mcp.git
```

### 2. Configure GitHub Authentication

**Option A: SSH (Recommended)**
```bash
# Use SSH URL instead
git remote set-url github git@github.com:voicelab-uz/mcp.git

# Test SSH connection
ssh -T git@github.com
```

**Option B: HTTPS with Token**
```bash
# Use personal access token
# Create at: https://github.com/settings/tokens
# Scopes needed: repo (full control)

# Git will prompt for credentials on push
# Username: your-github-username
# Password: your-personal-access-token
```

**Option C: GitHub CLI**
```bash
# Install GitHub CLI
gh auth login

# Push using gh
gh repo view voicelab-uz/mcp
```

## Push to GitHub

### Initial Push (First Time)

```bash
cd /workspace

# Ensure you're on main branch
git branch

# Push to GitHub
git push github main

# If you want to set up tracking
git push -u github main
```

### Regular Updates

After making changes and committing to Origin:

```bash
# 1. Commit changes locally
git add .
git commit -m "Your commit message"

# 2. Push to Origin (cursor.com)
git push origin main

# 3. Push to GitHub
git push github main
```

### Push All Branches and Tags

```bash
# Push all branches
git push github --all

# Push all tags
git push github --tags
```

## Automated Sync Script

Create a helper script to push to both remotes:

```bash
#!/bin/bash
# File: push-both.sh

set -e

echo "Pushing to Origin..."
git push origin main

echo "Pushing to GitHub..."
git push github main

echo "✅ Pushed to both remotes successfully"
```

Make it executable:
```bash
chmod +x push-both.sh
./push-both.sh
```

## What Gets Pushed

### ✅ Included
- All source code (`src/`)
- Configuration files (`package.json`, `tsconfig.json`, `wrangler.toml`)
- Documentation (`README.md`, `API_REFERENCE.md`, etc.)
- Packaging guides (`packaging/`)
- License (`LICENSE`)
- `.gitignore` file
- Example configs (`.dev.vars.example`)

### ❌ Excluded (via .gitignore)
- `node_modules/` - Dependencies (users run `npm install`)
- `dist/` - Build artifacts (users run `npm run build`)
- `.env` - Local secrets
- `.dev.vars` - Local Cloudflare secrets
- `*.log` - Log files

### 🔒 Secrets Handling

**Important**: No secrets are committed to the repository.

Secrets are managed via:
1. **Local development**: `.dev.vars` file (gitignored, use `.dev.vars.example` as template)
2. **Cloudflare Workers**: `wrangler secret put VOICELAB_API_KEY` (stored in Cloudflare)
3. **User installations**: Users set their own `VOICELAB_API_KEY` in environment variables

## Verify GitHub Repository

After pushing, verify at https://github.com/voicelab-uz/mcp:

```bash
# Clone the GitHub repo to a new directory to test
cd /tmp
git clone https://github.com/voicelab-uz/mcp.git test-clone
cd test-clone

# Verify structure
ls -la

# Test build
npm install
npm run build
npm test

# Verify no secrets
grep -r "vlk_" . || echo "✅ No API keys found"
```

## Repository Settings on GitHub

### 1. Branch Protection (Recommended)

Go to https://github.com/voicelab-uz/mcp/settings/branches:

- Enable branch protection for `main`
- Require pull request reviews (optional for personal project)
- Require status checks (if you set up CI/CD)

### 2. Topics/Tags

Add topics to help discovery:
- `mcp`
- `model-context-protocol`
- `voicelab`
- `text-to-speech`
- `speech-to-text`
- `typescript`
- `cloudflare-workers`

### 3. About Section

Update repository description:
```
Official VoiceLab MCP server - AI agent integration for speech AI APIs (TTS, STT, LLM, Voice Isolation)
```

Website: `https://voicelab.uz`

### 4. GitHub Pages (Optional)

Enable GitHub Pages for documentation:
- Settings → Pages
- Source: Deploy from branch `main` / `docs` folder
- Or set up custom domain

## Continuous Integration (Optional)

Create `.github/workflows/ci.yml` for automated testing:

```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: npm run build
      - run: npm test
```

**Note**: E2E tests (`npm run test:e2e`) will skip in CI since `VOICELAB_API_KEY` is not set.

## Troubleshooting

### "fatal: remote github already exists"

```bash
git remote remove github
git remote add github https://github.com/voicelab-uz/mcp.git
```

### "Permission denied (publickey)"

```bash
# Check SSH keys
ssh-add -l

# Add your SSH key
ssh-add ~/.ssh/id_ed25519

# Or use HTTPS instead of SSH
git remote set-url github https://github.com/voicelab-uz/mcp.git
```

### "Updates were rejected because the remote contains work"

```bash
# If GitHub has commits not in Origin
git pull github main --rebase

# Then push
git push github main
```

### Different commit authors

Git will preserve commit authors as "Elzodxon Sharofaddinov <elzodxon@gmail.com>" since we configured that locally.

## Collaboration Workflow

### For Other Contributors

1. Fork https://github.com/voicelab-uz/mcp
2. Clone their fork
3. Make changes
4. Push to their fork
5. Open Pull Request to `voicelab-uz/mcp`

### Accepting PRs

```bash
# Fetch PR
git fetch github pull/123/head:pr-123
git checkout pr-123

# Review and test
npm install
npm test

# Merge if good
git checkout main
git merge pr-123
git push github main
```

## Release Process

### Creating a Release

```bash
# 1. Update version in package.json
npm version patch  # or minor, or major

# 2. Commit and tag
git add package.json package-lock.json
git commit -m "Release v1.0.1"
git tag v1.0.1

# 3. Push to both remotes
git push origin main --tags
git push github main --tags
```

### Publishing to npm

```bash
# Build
npm run build

# Publish (requires npm login)
npm publish --access public
```

## Maintenance

### Keep Origin and GitHub in Sync

```bash
# Check if any differences
git fetch origin
git fetch github

# Compare
git log github/main..origin/main  # Commits in origin not in github
git log origin/main..github/main  # Commits in github not in origin

# Sync
git push github main
```

---

## Quick Reference Commands

```bash
# Setup (one-time)
git remote add github https://github.com/voicelab-uz/mcp.git

# Regular workflow
git add .
git commit -m "Your message"
git push origin main    # Origin (Cursor)
git push github main    # GitHub (public)

# Check status
git remote -v
git status
git log --oneline -5
```

---

**Repository**: https://github.com/voicelab-uz/mcp  
**Origin**: cursor.com internal git  
**Author**: Elzodxon Sharofaddinov <elzodxon@gmail.com>
