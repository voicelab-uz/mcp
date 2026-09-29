# VoiceLab MCP Tools Quick Reference

Complete list of all 22 tools available in the VoiceLab MCP server.

## LLM Tools

### `list_models`
List available LLM models with pricing and limits.

**Parameters:** None

**Returns:** List of models with IDs, pricing, and context limits

---

### `chat_completions`
Create an LLM chat completion.

**Parameters:**
- `model` (required): Model ID from `list_models`
- `messages` (required): Array of conversation messages with `role` and `content`
- `max_tokens` (optional): Maximum output tokens (1-4096)
- `temperature` (optional): Sampling temperature (0-2)
- `idempotency_key` (optional): Auto-generated UUID if omitted

**Returns:** Completion with request ID, text, and token usage

---

### `get_llm_request`
Get LLM request status, token usage, and credit details.

**Parameters:**
- `request_id` (required): Request ID from `chat_completions`

**Returns:** Status, tokens, credits, and timing data

---

## Text-to-Speech Tools

### `list_tts_languages`
List supported TTS languages and model capabilities.

**Parameters:** None

**Returns:** Languages, models, sample rates, and output formats

---

### `list_voices`
List available voices.

**Parameters:**
- `language` (optional): Filter by language code (e.g., "en", "uz", "ru")

**Returns:** Voice catalog with IDs, names, and languages

---

### `text_to_speech`
Generate speech from text.

**Parameters:**
- `text` (required): Text to synthesize (1-5000 characters)
- `language` (required): Language code
- `voice_id` (required): Voice ID from `list_voices`
- `speed` (optional): Speech speed (0.5-2.0, default 1)
- `idempotency_key` (optional): Auto-generated if omitted

**Returns:** Base64-encoded 24kHz mono WAV audio

---

### `list_tts_generations`
List TTS generation history.

**Parameters:**
- `limit` (optional): Results per page (1-100, default 30)
- `cursor` (optional): Pagination cursor

**Returns:** List of generations with metadata and pagination cursor

---

### `get_tts_generation`
Get TTS generation details with audio URL.

**Parameters:**
- `generation_id` (required): Generation ID

**Returns:** Full generation details with signed audio URL

---

### `delete_tts_generation`
Delete a TTS generation and its audio (destructive).

**Parameters:**
- `generation_id` (required): Generation ID to delete

**Returns:** Confirmation message

---

## Speech-to-Text Tools

### `speech_to_text`
Transcribe audio file (returns job ID for polling).

**Parameters:**
- `audio_base64` (required): Base64-encoded audio (MP3, WAV, M4A, OGG, WebM, FLAC)
- `language` (required): Language code (uz, en, ru)
- `include_speakers` (optional): Enable speaker diarization (default false)
- `idempotency_key` (optional): Auto-generated UUID if omitted

**Returns:** Job ID and status (202 Accepted)

---

### `get_transcription`
Get transcription status and results (poll until complete).

**Parameters:**
- `transcription_id` (required): Job ID from `speech_to_text`

**Returns:** Status, transcript, segments, word timing, speakers

---

### `list_transcriptions`
List STT transcription history.

**Parameters:**
- `limit` (optional): Results per page (1-100, default 10)
- `cursor` (optional): Pagination cursor

**Returns:** List of transcriptions with metadata

---

### `update_transcription`
Update transcription title.

**Parameters:**
- `transcription_id` (required): Transcription ID
- `title` (required): New title

**Returns:** Updated transcription metadata

---

### `delete_transcription`
Delete a transcription and its audio (destructive).

**Parameters:**
- `transcription_id` (required): Transcription ID to delete

**Returns:** Confirmation message

---

### `export_transcription`
Export transcription as TXT, JSON, SRT, or VTT.

**Parameters:**
- `transcription_id` (required): Transcription ID
- `format` (required): Export format (txt, json, srt, vtt)

**Returns:** Base64-encoded export file

---

## Voice Isolation Tools

### `isolate_voice`
Remove background noise with optional speech restoration (returns job ID).

**Parameters:**
- `audio_base64` (required): Base64-encoded audio (max 300 MiB)
- `title` (optional): Job title
- `speech_restoration` (optional): Enable Sidon restoration (default false)
- `restoration_model` (optional): Model name (sidon)
- `idempotency_key` (optional): Auto-generated UUID if omitted

**Returns:** Job ID, status, and credit quote (202 Accepted)

---

### `get_isolation`
Get voice isolation job status and audio URLs (poll until complete).

**Parameters:**
- `isolation_id` (required): Job ID from `isolate_voice`

**Returns:** Status, processing stage, audio URLs, duration

---

### `list_isolations`
List voice isolation history.

**Parameters:**
- `limit` (optional): Results per page (1-50, default 20)
- `cursor` (optional): Pagination cursor

**Returns:** List of isolation jobs with metadata

---

### `create_isolation_export`
Create an export of isolated audio in specified format.

**Parameters:**
- `isolation_id` (required): Job ID
- `format` (required): Export format (mp3, wav, flac, ogg, original)

**Returns:** Export job status

---

### `get_isolation_export`
Get export status and download URL.

**Parameters:**
- `isolation_id` (required): Job ID
- `format` (required): Export format

**Returns:** Export status and signed download URL

---

### `hide_isolation`
Hide isolation job from history (does not delete audio).

**Parameters:**
- `isolation_id` (required): Job ID to hide

**Returns:** Confirmation message

---

## Realtime Tools

### `create_realtime_ticket`
Create a short-lived WebSocket ticket for realtime TTS or STT.

**Parameters:**
- `service` (required): Service type (tts or stt)

**Returns:** Ticket, WebSocket URL, expiration time

---

## Notes

### Idempotency
STT, TTS, and Voice Isolator tools auto-generate UUIDs when `idempotency_key` is not provided. Retries with the same key and body return cached results without reprocessing.

### Async Operations
- `speech_to_text`: Returns job ID immediately; poll `get_transcription` until `status: "completed"`
- `isolate_voice`: Returns job ID immediately; poll `get_isolation` until `status: "completed"`

### Audio Format
- **Input**: Base64-encoded bytes of audio files
- **Output TTS**: Base64-encoded 24kHz mono WAV
- **Output STT Export**: Base64-encoded export in requested format
- **Output Isolator**: JSON with signed URLs to download processed audio

### Pagination
List endpoints return `next_cursor`. Pass it as `cursor` parameter for the next page.

### Rate Limits
Respect `Retry-After` headers. See https://docs.voicelab.uz/api/errors for details.
