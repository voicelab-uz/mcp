# Grok Marketplace Package

This folder contains configuration for xAI Grok plugin marketplace submission.

## Repository Structure

```
voicelab-mcp-plugin/
├── plugin.json
├── README.md
├── LICENSE
└── examples/
```

## plugin.json

```json
{
  "name": "VoiceLab",
  "description": "Speech AI for agents: text-to-speech, speech-to-text with timing, voice isolation, LLM completions in Uzbek/Russian/English",
  "mcp_endpoint": "https://mcp.voicelab.uz/mcp",
  "author": "VoiceLab",
  "homepage": "https://voicelab.uz",
  "documentation": "https://docs.voicelab.uz",
  "repository": "https://github.com/voicelab/voicelab-mcp",
  "keywords": ["voicelab", "aisha", "tts", "stt", "speech", "uzbek"],
  "domains": ["voicelab.uz", "docs.voicelab.uz"],
  "version": "1.0.0",
  "authentication": {
    "type": "bearer_token",
    "env_variable": "VOICELAB_API_KEY"
  }
}
```

## Submission

1. Create plugin repo under VoiceLab GitHub org
2. Add plugin.json with SHA-pinned remote source
3. Fork [xai-org/plugin-marketplace](https://github.com/xai-org/plugin-marketplace)
4. Add plugin to catalog
5. Regenerate plugin-index.json
6. Submit PR

## CLI Usage

```bash
# User installs
grok mcp add --transport http voicelab https://mcp.voicelab.uz/mcp

# Or custom endpoint
grok.com/connectors → Custom → MCP URL
```

## Keywords

Brand keywords: `voicelab`, `aisha`
Domains: `voicelab.uz`, `docs.voicelab.uz`
