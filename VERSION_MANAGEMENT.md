# Version Management

## Single Source of Truth

The VoiceLab MCP server version is managed from **`package.json`** as the single source of truth.

### Architecture

```
package.json (authoritative version)
    ↓
src/version.ts (imports as JSON module)
    ↓
├── src/index.ts (HTTP server)
├── src/worker.ts (Cloudflare Worker)
└── src/smoke-test.ts (verification test)
```

### How It Works

**`src/version.ts`** imports `package.json` as a JSON module (works in both Node.js and Cloudflare Workers):

```typescript
import packageJson from '../package.json' with { type: 'json' };
export const VERSION: string = packageJson.version;
```

All server code imports `VERSION` from `version.ts`. The smoke test verifies that `VERSION` matches `package.json` and fails if they drift.

### Why This Matters

**Before:** Version hard-coded in multiple files → drift when `package.json` updated  
**After:** Version read from `package.json` → automatic propagation, test-enforced

### Bumping the Version

```bash
npm version patch  # 1.1.1 → 1.1.2
npm run build && npm test  # Verifies version match
```

The server automatically reports the new version. No manual file edits needed.
