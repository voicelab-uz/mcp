# Legacy ChatGPT Plugins Format (ai-plugin.json)

This file documents the **legacy ChatGPT Plugins format** (pre-2026) for reference only.

## Status: DEPRECATED

As of 2026, OpenAI uses the **Agent Plugins** standard instead of ai-plugin.json.

### Migration Path

**Old approach (deprecated):**
1. Create `ai-plugin.json` manifest
2. Reference OpenAPI spec
3. Host at `/.well-known/ai-plugin.json`
4. Submit manifest URL to OpenAI

**New approach (current):**
1. Create `plugin.json` with Agent Plugins schema
2. Create `mcp.json` for MCP server connection
3. Package as ZIP with skills and assets
4. Upload ZIP to OpenAI Plugins portal

### Key Differences

| Legacy (ai-plugin.json) | 2026 (Agent Plugins) |
|------------------------|----------------------|
| Manifest file: `ai-plugin.json` | Manifest file: `plugin.json` |
| API spec: OpenAPI/Swagger | API spec: MCP tools via `tools/list` |
| Distribution: URL to manifest | Distribution: ZIP upload |
| Schema: Custom ChatGPT format | Schema: https://agent-plugins.org |
| Tools discovery: OpenAPI paths | Tools discovery: MCP protocol |

### Why Agent Plugins?

**Benefits:**
- Standardized schema shared across AI platforms
- Native MCP support (no OpenAPI translation layer)
- Skills and onboarding content bundled
- Better versioning and asset management
- Review process integrated in portal

**Compatibility:**
- Legacy ai-plugin.json may still work for backward compatibility
- But primary submission path is now plugin.json ZIP
- OpenAI prioritizes Agent Plugins in marketplace

### What to Do with ai-plugin.json

**Options:**

1. **Remove entirely** (recommended for new projects)
   - Focus on plugin.json
   - No legacy baggage

2. **Keep for backward compatibility** (if needed)
   - Host at `/.well-known/ai-plugin.json`
   - Mark as "legacy" in docs
   - Point to plugin.json as primary

3. **Convert reference** (for documentation)
   - Keep in repo as historical reference
   - Do not host publicly

**VoiceLab decision:** Keep ai-plugin.json in repo for reference, but do NOT host at `/.well-known/`. Primary submission is plugin.json ZIP.

### Legacy ai-plugin.json Content

The old format looked like this:

```json
{
  "schema_version": "v1",
  "name_for_human": "VoiceLab",
  "name_for_model": "voicelab",
  "description_for_human": "Speech AI: generate natural voice...",
  "description_for_model": "VoiceLab provides text-to-speech...",
  "auth": {
    "type": "user_http",
    "authorization_type": "bearer"
  },
  "api": {
    "type": "openapi",
    "url": "https://mcp.voicelab.uz/openapi.json"
  },
  "logo_url": "https://mcp.voicelab.uz/logo.png",
  "contact_email": "...",
  "legal_info_url": "..."
}
```

**Issues with this approach:**
- Required maintaining separate OpenAPI spec
- MCP server doesn't natively speak OpenAPI
- Would need translation layer
- Discovery and updates more complex

### Resources

- Agent Plugins spec: https://agent-plugins.org
- OpenAI Plugins migration guide: https://developers.openai.com/plugins/migrate
- MCP specification: https://modelcontextprotocol.io

---

**For current submission instructions, see README.md and SUBMISSION.md.**
