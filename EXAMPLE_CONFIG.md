# Example Cursor MCP Configuration

This file shows how to configure the VoiceLab MCP server in Cursor.

## Local Configuration (Recommended)

Add to your Cursor settings at `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "voicelab": {
      "command": "npx",
      "args": ["@voicelab/mcp"],
      "env": {
        "VOICELAB_API_KEY": "${VOICELAB_API_KEY}"
      }
    }
  }
}
```

Then set the environment variable in your shell:

```bash
export VOICELAB_API_KEY='vlk_your_api_key_here'
```

## Development/Local Build

If you've cloned and built the repo locally:

```json
{
  "mcpServers": {
    "voicelab": {
      "command": "node",
      "args": ["/absolute/path/to/voicelab-mcp/dist/index.js"],
      "env": {
        "VOICELAB_API_KEY": "vlk_your_api_key_here",
        "VOICELAB_BASE_URL": "https://api.voicelab.uz"
      }
    }
  }
}
```

## Global Installation

If installed globally via `npm install -g @voicelab/mcp`:

```json
{
  "mcpServers": {
    "voicelab": {
      "command": "voicelab-mcp",
      "env": {
        "VOICELAB_API_KEY": "vlk_your_api_key_here"
      }
    }
  }
}
```

## Testing Your Configuration

1. Save your mcp.json
2. Restart Cursor
3. Open Cursor's MCP panel
4. You should see "voicelab" listed as a connected server
5. Try a prompt: "List available VoiceLab LLM models"

## Security Notes

- Never commit your API key to version control
- Use environment variables for production
- Consider using restricted API keys with only required permissions
- Set `allowed_ips` in the VoiceLab dashboard for server deployments

## Troubleshooting

### "Could not connect to MCP server"
- Verify Node.js 20+ is installed: `node --version`
- Check the command path is correct
- Ensure VOICELAB_API_KEY is set

### "401 invalid_api_key"
- Verify your API key at https://voicelab.uz
- Check the key is enabled and not expired
- Ensure the key has required permissions

### Package not found
- Run `npm install -g @voicelab/mcp` first
- Or use `npx @voicelab/mcp` which auto-installs
