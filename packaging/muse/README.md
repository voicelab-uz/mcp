# Muse Connector Package

This folder contains configuration for submitting to Muse.ai platform connectors.

## Submission Portal

https://muse.ai/platform → Submit a connector → Existing MCP

## Requirements

- Hosted MCP endpoint: `https://mcp.voicelab.uz/mcp`
- API key authentication
- 512×512 icon (PNG)
- Example prompts
- Privacy policy + Terms of Service + Support URL

## Connector Details

**Name:** VoiceLab

**Short Description:** Speech AI for agents

**Long Description:**
Connect Muse agents to VoiceLab for natural speech generation, accurate transcription with timing and speaker labels, voice isolation with noise removal, and LLM completions. Supports Uzbek, Russian, and English languages.

**Category:** AI Tools / Speech Processing

**MCP Endpoint:** https://mcp.voicelab.uz/mcp

**Authentication:** API Key (Bearer token)
- Env variable: `VOICELAB_API_KEY`
- Get key at: https://voicelab.uz

**Icon:** 512×512 PNG logo

**Example Prompts:**
1. "Generate Uzbek TTS for this product description with a natural voice"
2. "Transcribe this meeting audio with speaker labels and word timing"
3. "Remove background noise from this call recording"
4. "List available Uzbek voices for narration"
5. "Create an LLM completion using Aisha model"

**Documentation:** https://docs.voicelab.uz

**Privacy Policy:** https://voicelab.uz/privacy

**Terms of Service:** https://voicelab.uz/terms

**Support URL:** mailto:support@voicelab.uz or https://voicelab.uz/support

## Assets Needed

- `logo-512.png` - Square logo, 512×512px
- `screenshot-1.png` - TTS generation example
- `screenshot-2.png` - STT transcription with timing
- `screenshot-3.png` - Voice isolation interface

## Submission Process

1. Gather all assets
2. Test MCP endpoint is live
3. Fill out Muse connector submission form
4. Provide API key for reviewer testing
5. Wait for approval (typically 5-10 business days)

## Testing

Before submission, verify:
- [ ] MCP endpoint responds at `/mcp`
- [ ] Health check returns 200 at `/`
- [ ] API key authentication works
- [ ] All 22 tools are functional
- [ ] Example prompts work in Muse preview
