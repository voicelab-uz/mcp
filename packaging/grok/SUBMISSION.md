# Grok Marketplace Submission

Follows https://github.com/xai-org/plugin-marketplace/blob/main/CONTRIBUTING.md

## Plugin source

Public repo: https://github.com/voicelab-uz/grok-plugin

Pin SHA:

```bash
git ls-remote https://github.com/voicelab-uz/grok-plugin.git HEAD
```

## Catalog entry (`.grok-plugin/marketplace.json`)

```json
{
  "name": "voicelab",
  "description": "Speech AI for agents via the hosted VoiceLab MCP: text-to-speech, speech-to-text with timing, voice isolation, and LLM completions in Uzbek, Russian, and English.",
  "category": "productivity",
  "source": {
    "source": "url",
    "url": "https://github.com/voicelab-uz/grok-plugin.git",
    "sha": "<40-char-lowercase-commit-sha>"
  },
  "homepage": "https://voicelab.uz",
  "keywords": ["voicelab", "aisha", "voicelab tts", "voicelab stt", "voicelab mcp"],
  "domains": ["voicelab.uz", "docs.voicelab.uz", "mcp.voicelab.uz"]
}
```

Then:

```bash
python3 scripts/generate-plugin-index.py
python3 scripts/validate-catalog.py
python3 scripts/generate-plugin-index.py --check
```

## Auth note for reviewers

Live `https://mcp.voicelab.uz/mcp` requires `Authorization: Bearer <gateway-token>`.
Grok users set `VOICELAB_MCP_AUTH_TOKEN`. The VoiceLab API key stays on the server.
