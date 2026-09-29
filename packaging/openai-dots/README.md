# OpenAI Dots / ChatGPT Plugins Package

This folder contains configuration for submitting to the OpenAI Plugins Directory.

## Requirements

- Public HTTPS MCP endpoint (e.g., `https://mcp.voicelab.uz/mcp`)
- Domain verification file at `/.well-known/openai-apps-challenge`
- Plugin ZIP with manifest
- Review materials (test cases, demo video)

## plugin.json

```json
{
  "schema_version": "v1",
  "name_for_human": "VoiceLab",
  "name_for_model": "voicelab",
  "description_for_human": "Speech AI: generate natural voice, transcribe with timing, remove noise. Uzbek, Russian, English.",
  "description_for_model": "VoiceLab provides text-to-speech (WAV 24kHz), speech-to-text with word timing and speaker labels, voice isolation with noise removal, and LLM completions. Supports uz, ru, en languages. Use list_voices before TTS, poll get_transcription after STT.",
  "auth": {
    "type": "user_http",
    "authorization_type": "bearer",
    "authorization_content_type": "application/json"
  },
  "api": {
    "type": "mcp",
    "url": "https://mcp.voicelab.uz/mcp",
    "is_user_authenticated": true
  },
  "logo_url": "https://mcp.voicelab.uz/logo.png",
  "contact_email": "support@voicelab.uz",
  "legal_info_url": "https://voicelab.uz/terms"
}
```

## Test Cases

### Positive
1. Generate Uzbek TTS: "Generate speech for 'Salom dunyo' in Uzbek"
2. Transcribe audio with speakers
3. List models and create completion
4. Remove background noise
5. Export transcription as SRT

### Negative
1. Missing API key → clear error
2. Invalid voice ID → validation error
3. Unsupported language → error with supported list

## Submission

1. Host at `https://mcp.voicelab.uz/mcp`
2. Domain verify: `/.well-known/openai-apps-challenge`
3. Package ZIP with plugin.json + mcp config
4. Submit at https://developers.openai.com/plugins/submit
5. Provide reviewer test credentials

## Domain Verification

Place at `https://mcp.voicelab.uz/.well-known/openai-apps-challenge`:

```
{YOUR_VERIFICATION_TOKEN}
```
