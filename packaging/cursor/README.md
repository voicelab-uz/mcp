# Cursor Marketplace Package

This folder contains configuration for submitting the VoiceLab MCP server to the Cursor Marketplace.

## Files Needed

- `.cursor-plugin/plugin.json` - Plugin metadata
- `.cursor-plugin/mcp.json` - MCP server configuration with `${VOICELAB_API_KEY}` variable
- `skills/` - Optional skills for TTS/STT workflows
- `README.md` - Usage documentation
- Icons (512x512 PNG)

## Configuration

```json
{
  "id": "voicelab",
  "name": "VoiceLab",
  "description": "Speech AI for agents: TTS, STT, voice isolation, and LLM completions in Uzbek, Russian, and English",
  "author": "VoiceLab",
  "version": "1.0.0",
  "mcp": {
    "command": "npx",
    "args": ["@voicelab/mcp"],
    "env": {
      "VOICELAB_API_KEY": "${VOICELAB_API_KEY}"
    }
  }
}
```

## Submission

1. Create public GitHub repository
2. Add plugin.json and mcp.json under `.cursor-plugin/`
3. Submit at https://cursor.com/marketplace/publish
4. Local test: `~/.cursor/plugins/local/voicelab/`

## Testing

```bash
# Local development
cd ~/.cursor/plugins/local/voicelab
npm link /path/to/voicelab-mcp

# Test in Cursor
"List available VoiceLab voices"
```
