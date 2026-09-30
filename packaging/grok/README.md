# Grok Marketplace Package

Canonical plugin source lives at:

https://github.com/voicelab-uz/grok-plugin

That repo ships:

- `.grok-plugin/plugin.json` — Grok Build manifest
- `.mcp.json` — hosted MCP at `https://mcp.voicelab.uz/mcp` with Bearer `${VOICELAB_MCP_AUTH_TOKEN}`
- `README.md` / `LICENSE`

This folder mirrors those files for the VoiceLab MCP monorepo. Prefer the
dedicated `voicelab-uz/grok-plugin` remote source in the xAI marketplace
(SHA-pinned), matching other third-party plugins.

## Auth (what Grok users paste)

| Credential | Paste in Grok? |
|---|---|
| MCP gateway token → `VOICELAB_MCP_AUTH_TOKEN` | **Yes** (`Authorization: Bearer …`) |
| VoiceLab API key `vlk_…` | **No** (server-side only) |

## Marketplace submission

1. Publish/update https://github.com/voicelab-uz/grok-plugin
2. Fork https://github.com/xai-org/plugin-marketplace
3. Add remote entry to `.grok-plugin/marketplace.json` with pinned SHA
4. Run `python3 scripts/generate-plugin-index.py` and `validate-catalog.py`
5. Open PR

See [SUBMISSION.md](SUBMISSION.md).
