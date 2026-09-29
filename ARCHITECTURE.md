# VoiceLab MCP Server Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      AI Agent (Cursor, etc.)                │
└──────────────────────────┬──────────────────────────────────┘
                           │ MCP Protocol (stdio/HTTP)
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                  VoiceLab MCP Server                        │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │           Tool Registry (22 tools)                 │    │
│  │  - list_models, chat_completions, ...              │    │
│  │  - text_to_speech, list_voices, ...                │    │
│  │  - speech_to_text, get_transcription, ...          │    │
│  │  - isolate_voice, get_isolation, ...               │    │
│  └────────────────────┬───────────────────────────────┘    │
│                       │                                     │
│  ┌────────────────────▼───────────────────────────────┐    │
│  │            Domain Modules                          │    │
│  │  ┌───────┐  ┌────┐  ┌────┐  ┌────────┐  ┌──────┐ │    │
│  │  │  LLM  │  │TTS │  │STT │  │Isolator│  │Voices│ │    │
│  │  │Module │  │    │  │    │  │ Module │  │      │ │    │
│  │  └───┬───┘  └─┬──┘  └─┬──┘  └───┬────┘  └──┬───┘ │    │
│  │      └────────┴───────┴─────────┴───────────┘     │    │
│  └────────────────────┬───────────────────────────────┘    │
│                       │                                     │
│  ┌────────────────────▼───────────────────────────────┐    │
│  │         VoiceLabClient (HTTP + Error Handling)     │    │
│  │  - Bearer auth with API key                        │    │
│  │  - JSON/multipart request handling                 │    │
│  │  - Binary audio downloads                          │    │
│  │  - Error envelope parsing                          │    │
│  └────────────────────┬───────────────────────────────┘    │
└───────────────────────┼──────────────────────────────────┘
                        │ HTTPS
                        │
┌───────────────────────▼──────────────────────────────────┐
│              VoiceLab API (api.voicelab.uz)              │
│                                                           │
│  /v1/models              /v1/chat/completions            │
│  /v1/tts                 /v1/stt                         │
│  /v1/voices              /v1/voice-isolations            │
│  /v1/ticket              /v1/llm/requests/{id}           │
└──────────────────────────────────────────────────────────┘
```

## Module Responsibilities

### `index.ts` - MCP Server
- Initializes MCP server with stdio transport
- Registers 22 tools with schemas
- Routes tool calls to appropriate modules
- Handles errors and formats responses
- Auto-generates idempotency keys

### `client.ts` - HTTP Client
- Manages API authentication (Bearer token)
- Makes JSON and multipart/form-data requests
- Downloads binary audio (WAV, MP3, etc.)
- Parses VoiceLab error envelopes
- Throws typed `VoiceLabError` exceptions

### `llm.ts` - LLM Module
- Lists available models with pricing
- Creates chat completions
- Retrieves request status and token usage
- Handles both standard and LLM-specific error formats

### `tts.ts` - Text-to-Speech Module
- Lists supported languages and capabilities
- Generates speech (returns binary WAV)
- Manages generation history
- Deletes generations

### `stt.ts` - Speech-to-Text Module
- Submits audio for transcription (multipart upload)
- Polls transcription status
- Updates titles and edits documents
- Exports to TXT, JSON, SRT, VTT

### `voices.ts` - Voices Module
- Lists available voices
- Filters by language
- Returns voice metadata (ID, name, language)

### `isolator.ts` - Voice Isolator Module
- Removes background noise from audio
- Optionally applies Sidon speech restoration
- Manages job history
- Creates and retrieves exports in various formats
- Hides jobs from history

### `realtime.ts` - Realtime Module
- Mints short-lived WebSocket tickets
- Supports both TTS and STT services
- Tickets expire after ~2 minutes

## Data Flow

### Synchronous Flow (TTS)
```
Agent → text_to_speech
  ↓
MCP Server generates UUID idempotency key
  ↓
TTS Module → POST /v1/tts with key
  ↓
VoiceLab API returns binary WAV
  ↓
Base64 encode audio
  ↓
Return to agent
```

### Asynchronous Flow (STT)
```
Agent → speech_to_text
  ↓
MCP Server generates UUID idempotency key
  ↓
STT Module → POST /v1/stt (multipart) with key
  ↓
VoiceLab API returns 202 with job ID
  ↓
Return job ID to agent
  ↓
Agent → get_transcription (polling)
  ↓
STT Module → GET /v1/stt/transcriptions/{id}
  ↓
Return status + transcript when complete
```

## Error Handling

```
VoiceLab API Error
  ↓
VoiceLabClient catches HTTP error
  ↓
Parses error envelope:
  - Standard: { message, error: { code, fields }, request_id }
  - LLM: { error: { message, code, type }, request_id }
  ↓
Throws VoiceLabError(message, code, statusCode, requestId, fields)
  ↓
MCP Server catches exception
  ↓
Returns { content: [{ type: 'text', text: JSON }], isError: true }
  ↓
Agent receives structured error
```

## Key Design Decisions

### Idempotency
- Auto-generate UUIDs for STT, TTS, Voice Isolator
- Preserve keys on retries per VoiceLab docs
- Agent can override by passing `idempotency_key`

### Binary Audio
- Encode/decode base64 for MCP compatibility
- TTS returns base64 WAV directly
- STT accepts base64 audio input
- Isolator jobs return signed URLs (not base64 due to size)

### Async Jobs
- STT and Voice Isolator return job IDs immediately
- Agent must poll separate `get_*` tools
- Clear documentation of polling requirements

### Modular Architecture
- Each domain (LLM, TTS, STT, etc.) is a separate module
- Shared HTTP client for auth and error handling
- Easy to add new endpoints within existing modules

### Type Safety
- Full TypeScript types for all request/response shapes
- Strict mode enabled
- Helps catch API changes at compile time

## Future Enhancements

- HTTP transport for remote MCP hosting
- WebSocket streaming for realtime TTS/STT (beyond ticket mint)
- Enhanced caching for model/voice catalogs
- Batch operations for Voice Isolator
- Request retry logic with exponential backoff
