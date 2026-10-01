# Getting Started with VoiceLab

Welcome to VoiceLab! This guide will help you start using VoiceLab's speech AI capabilities.

## What VoiceLab Does

VoiceLab provides production-grade speech AI tools for agents:

- **Text-to-Speech (TTS)**: Generate natural speech in Uzbek, Russian, and English
- **Speech-to-Text (STT)**: Transcribe audio with word-level timing and speaker labels
- **Voice Isolation**: Remove background noise with optional speech restoration
- **LLM Completions**: Chat with Aisha models for Uzbek language understanding

## Authentication

VoiceLab uses Bearer token authentication. You'll need to provide your VoiceLab MCP auth token or VoiceLab API key when connecting.

Get your API key at [voicelab.uz](https://voicelab.uz).

## Quick Start Examples

### Generate Speech

```
Generate Uzbek speech for: "Salom, dunyo!"
```

The agent will:
1. Call `list_voices` to find available Uzbek voices
2. Call `text_to_speech` with your text
3. Return base64-encoded WAV audio

### Transcribe Audio

```
Transcribe this meeting recording with speaker labels.
[Attach audio file]
```

The agent will:
1. Call `speech_to_text` with your audio (base64-encoded)
2. Poll `get_transcription` until processing completes
3. Return transcription with word timing and speaker labels

### Remove Noise

```
Clean up this phone call recording by removing background noise.
[Attach audio file]
```

The agent will:
1. Call `isolate_voice` with your audio
2. Poll `get_isolation` until processing completes
3. Return isolated audio URL

## Key Concepts

### Audio Format
- **Input**: Audio files must be base64-encoded before sending
- **Output**: Generated audio is returned as base64-encoded WAV (24kHz)
- **Supported formats**: MP3, WAV, M4A, OGG, WebM, FLAC

### Async Operations
STT and voice isolation are asynchronous:
1. Submit job (returns job ID immediately)
2. Poll status endpoint until `status: "completed"`
3. Access results from completed response

### Languages
- **Uzbek (uz)**: Full TTS and STT support
- **Russian (ru)**: Full TTS and STT support  
- **English (en)**: Full TTS and STT support

### Idempotency
All operations support idempotency keys. The agent auto-generates UUIDs if you don't provide them. Retrying with the same key returns the cached result without reprocessing.

## Common Workflows

### TTS Workflow
```
User → list_voices (optional) → text_to_speech → audio_base64
```

### STT Workflow
```
User → speech_to_text → get_transcription (poll) → transcription result
```

### Voice Isolation Workflow
```
User → isolate_voice → get_isolation (poll) → audio URLs
```

## Tips

1. **Always list voices first** when generating speech in a new language
2. **Check supported languages** with `list_tts_languages` before TTS
3. **Enable speaker labels** for multi-speaker transcriptions with `include_speakers: true`
4. **Use speech restoration** for low-quality audio with `speech_restoration: true`
5. **Export transcriptions** as SRT or VTT for video subtitles

## Support

- Documentation: [docs.voicelab.uz](https://docs.voicelab.uz)
- Website: [voicelab.uz](https://voicelab.uz)
- Contact: elzodxon@gmail.com

## What's Next

Try these commands:
- "Show me all available Uzbek voices"
- "Generate Russian speech for: Привет, мир!"
- "Transcribe this audio with word timing"
- "Remove background noise and restore speech quality"
