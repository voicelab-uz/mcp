# Claude Desktop MCP Configuration

## Installation for Claude Desktop

### 1. Locate Config File

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

**Linux**: `~/.config/Claude/claude_desktop_config.json`

### 2. Add VoiceLab MCP Server

Open the config file and add:

```json
{
  "mcpServers": {
    "voicelab": {
      "command": "npx",
      "args": ["@voicelab/mcp"],
      "env": {
        "VOICELAB_API_KEY": "vlk_your_api_key_here"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

Close and reopen Claude Desktop. The VoiceLab tools will be available.

## Testing

Try these prompts in Claude:

1. **List capabilities**: "What VoiceLab tools do you have?"
2. **Generate speech**: "Generate Uzbek speech for: Assalomu alaykum"
3. **Transcribe**: "I'll upload an audio file, please transcribe it"
4. **List voices**: "Show me available Russian voices"

## Remote MCP Option

For Claude Desktop with remote MCP support:

```json
{
  "mcpServers": {
    "voicelab": {
      "url": "https://mcp.voicelab.uz/mcp",
      "headers": {
        "Authorization": "Bearer vlk_your_api_key_here"
      }
    }
  }
}
```

## Environment Variables

Alternatively, set environment variable:

```bash
# macOS/Linux
export VOICELAB_API_KEY='vlk_your_key'

# Windows
setx VOICELAB_API_KEY "vlk_your_key"
```

Then in config:
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

## Troubleshooting

### "Tool not found"
- Verify `@voicelab/mcp` is published to npm
- Try: `npm install -g @voicelab/mcp`
- Check Claude Desktop logs

### "Authentication failed"
- Verify API key starts with `vlk_`
- Check key is not expired at voicelab.uz
- Ensure key has required permissions

### "Module not found"
- Run: `npx @voicelab/mcp` manually to test
- Check Node.js version (need 20+)
- Clear npm cache: `npm cache clean --force`

## Advanced Configuration

### Use local build
```json
{
  "mcpServers": {
    "voicelab": {
      "command": "node",
      "args": ["/path/to/voicelab-mcp/dist/index.js"],
      "env": {
        "VOICELAB_API_KEY": "vlk_...",
        "VOICELAB_BASE_URL": "https://api.voicelab.uz"
      }
    }
  }
}
```

### Multiple API keys (dev/prod)
```json
{
  "mcpServers": {
    "voicelab-dev": {
      "command": "npx",
      "args": ["@voicelab/mcp"],
      "env": {
        "VOICELAB_API_KEY": "vlk_dev_key"
      }
    },
    "voicelab-prod": {
      "command": "npx",
      "args": ["@voicelab/mcp"],
      "env": {
        "VOICELAB_API_KEY": "vlk_prod_key"
      }
    }
  }
}
```
