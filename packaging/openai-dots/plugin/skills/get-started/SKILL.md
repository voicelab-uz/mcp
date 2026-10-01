---
name: get-started
description: Get started with VoiceLab speech AI tools for TTS, STT, voice isolation, and LLM.
---

# Get Started with VoiceLab

VoiceLab provides powerful speech AI capabilities for agents through the MCP protocol. This guide will help you get started with text-to-speech, speech-to-text, voice isolation, and LLM completions.

## Quick Start

### 1. Authentication

All API requests require authentication using your VoiceLab API key in the `Authorization` header:

```
Authorization: Bearer vlk_your_api_key_here
```

### 2. Available Tools

#### Text-to-Speech (TTS)

Generate natural-sounding speech from text in Uzbek, Russian, or English.

**Workflow:**
1. Call `list_voices` to see available voices
2. Call `text_to_speech` with your text and chosen voice
3. Receive WAV audio (24kHz, mono)

**Example:**
```
User: "Generate speech for 'Salom dunyo' in Uzbek"
→ Call list_voices (filter by language: uz)
→ Call text_to_speech with text and voice_id
```

#### Speech-to-Text (STT)

Transcribe audio with word-level timing and speaker labels.

**Workflow:**
1. Base64-encode your audio file
2. Call `speech_to_text` with the encoded audio
3. Poll `get_transcription` with the returned transcription_id
4. Receive transcription with timestamps and speaker labels

**Example:**
```
User: "Transcribe this audio with speaker labels"
→ Call speech_to_text with base64-encoded audio
→ Poll get_transcription until status is 'completed'
```

#### Voice Isolation

Remove background noise and isolate human speech from audio.

**Workflow:**
1. Base64-encode your audio file
2. Call `isolate_voice` with the encoded audio
3. Receive cleaned audio with noise removed

**Example:**
```
User: "Remove background noise from this recording"
→ Call isolate_voice with base64-encoded audio
```

#### LLM Completions

Use VoiceLab's language models (like Aisha) for text generation.

**Workflow:**
1. Call `list_models` to see available models
2. Call `create_completion` with your prompt and chosen model
3. Receive generated text response

**Example:**
```
User: "Use Aisha model to answer: What is Uzbekistan?"
→ Call list_models
→ Call create_completion with model and prompt
```

## Supported Languages

- **Uzbek (uz)**: Native support for Uzbek language
- **Russian (ru)**: Full Russian language support
- **English (en)**: English language support

## Audio Format Requirements

### Input Audio (STT, Voice Isolation)
- Format: WAV, MP3, M4A, or FLAC
- Encoding: Base64 string
- Max duration: 10 minutes

### Output Audio (TTS, Voice Isolation)
- Format: WAV
- Sample rate: 24kHz
- Channels: Mono
- Encoding: Base64 string

## Best Practices

### Always List First
Before using TTS, always call `list_voices` to get current available voices and their IDs. Voice IDs may change.

### Poll for Results
For STT, use `get_transcription` in a polling loop. Check the `status` field:
- `processing`: Still working, poll again
- `completed`: Transcription ready
- `failed`: Check error message

### Handle Errors Gracefully
Common errors:
- **401 Unauthorized**: Invalid or missing API key
- **404 Not Found**: Invalid voice_id, model_id, or transcription_id
- **400 Bad Request**: Invalid audio format or unsupported language

### Audio Encoding
Always base64-encode audio before sending:
```python
import base64
with open('audio.wav', 'rb') as f:
    audio_base64 = base64.b64encode(f.read()).decode('utf-8')
```

## Example Workflows

### Generate Multilingual Speech
```
1. list_voices → get all Uzbek voices
2. text_to_speech → generate "Assalomu alaykum"
3. Return audio to user
```

### Transcribe Meeting Recording
```
1. speech_to_text → start transcription
2. get_transcription → poll until completed
3. Export with word timing and speaker labels
4. Return formatted transcript
```

### Clean Noisy Audio
```
1. isolate_voice → remove background noise
2. Return cleaned audio
3. Optionally: speech_to_text on cleaned audio
```

### AI Assistant with Voice
```
1. speech_to_text → transcribe user question
2. create_completion → generate answer with Aisha
3. text_to_speech → speak the answer
4. Return audio response
```

## Rate Limits

- TTS: 100 requests/minute
- STT: 50 requests/minute
- Voice Isolation: 50 requests/minute
- LLM: 60 requests/minute

## Support

- Documentation: https://docs.voicelab.uz
- API Reference: https://docs.voicelab.uz/api
- Security: https://docs.voicelab.uz/mcp/security
- Support: elzodxon@gmail.com
