# Grok Marketplace Submission

## Submission via GitHub

### 1. Create Plugin Repository

Create public repo under VoiceLab org:
```
https://github.com/voicelab-uz/grok-plugin
```

Add files:
- `plugin.json` (from this folder)
- `README.md` (usage instructions)
- `LICENSE` (MIT)
- `examples/` (usage examples)

### 2. Fork xAI Marketplace

```bash
git clone https://github.com/xai-org/plugin-marketplace.git
cd plugin-marketplace
git checkout -b add-voicelab-plugin
```

### 3. Add Plugin Entry

Edit `plugins/index.json`:

```json
{
  "plugins": [
    {
      "id": "voicelab",
      "name": "VoiceLab",
      "description": "Speech AI: TTS, STT, voice isolation, LLM in Uzbek/Russian/English",
      "author": "Elzodxon Sharofaddinov",
      "repository": "https://github.com/voicelab-uz/grok-plugin",
      "version": "1.0.0",
      "config_url": "https://raw.githubusercontent.com/voicelab-uz/grok-plugin/main/plugin.json",
      "verified": false
    }
  ]
}
```

### 4. Regenerate Index

```bash
# Run xAI's index generator
npm run generate-index
```

### 5. Submit PR

```bash
git add .
git commit -m "Add VoiceLab speech AI plugin"
git push origin add-voicelab-plugin
```

Create PR at: https://github.com/xai-org/plugin-marketplace/pulls

## CLI Installation

Users can add directly:

```bash
grok mcp add --transport http voicelab https://mcp.voicelab.uz/mcp
```

Or via Web UI:
1. Go to grok.com/connectors
2. Click "Custom"
3. Enter MCP URL: `https://mcp.voicelab.uz/mcp`
4. Provide API key: `vlk_...`

## Example Usage in Grok

```
User: "I need to create an Uzbek audiobook"

Grok: "I can help with VoiceLab. Let me list available Uzbek voices."
[calls list_voices with language=uz]

User: "Use the first one for this text: [paste text]"

Grok: [calls text_to_speech, returns audio]
```

## Verification

xAI team will verify:
- [x] Plugin config is valid JSON
- [x] Endpoint responds to health checks
- [x] Documentation is clear
- [x] No malicious behavior

Timeline: 1-2 weeks for verification badge

## Support

For marketplace issues, contact: plugins@x.ai
For VoiceLab issues: elzodxon@gmail.com
