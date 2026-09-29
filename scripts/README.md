# Scripts

Helper scripts for development and deployment.

## push-both.sh

Pushes the current branch to both Origin (Cursor) and GitHub remotes.

**Usage:**
```bash
# Push main branch (default)
./scripts/push-both.sh

# Push a specific branch
./scripts/push-both.sh feature-branch
```

**Prerequisites:**
- GitHub remote configured: `git remote add github https://github.com/voicelab-uz/mcp.git`
- Push access to both remotes

**What it does:**
1. Pushes to Origin (cursor.com git)
2. Pushes to GitHub (github.com/voicelab-uz/mcp)
3. Reports success/failure for each

---

For more information, see [GITHUB_MIRROR.md](../GITHUB_MIRROR.md)
