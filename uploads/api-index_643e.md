Source: https://docs.voicelab.uz/api/

# VoiceLab API

The VoiceLab API lets your server generate speech, transcribe audio, remove
background noise, generate LLM completions, list voices, and open realtime TTS or STT connections.

This guide is for server-to-server integrations. It uses API keys, not browser
sessions. Keep your API key on your server and never put it in frontend code.

## Base URL

Production:

```text
https://api.voicelab.uz
```

The public developer API uses the `/v1` prefix. For example:

```text
POST https://api.voicelab.uz/v1/tts
```

## Choose the right credential

There are two different credentials in VoiceLab:

| Credential | Used for | Example |
| --- | --- | --- |
| User access JWT | VoiceLab website and API-key management | `Authorization: Bearer eyJ...` |
| Developer API key | Your application calling LLM, TTS, STT, Voice Isolator, voices, and realtime ticket endpoints | `Authorization: Bearer vlk_...` |
| Realtime ticket | One short-lived WebSocket connection | `?ticket=eyJ...` |

Do not send a user JWT to `/v1/tts`, `/v1/stt`, or `/v1/voices`. Do not send a
long-lived API key in a WebSocket URL. The only value allowed in that URL is a
short-lived ticket returned by `POST /v1/ticket`.

Voice Isolator developer requests use an API key at `/v1/voice-isolations`.
The dashboard routes at `/api/v1/voice-isolations` require a user JWT.

## API surface

Create and manage keys with the signed-in dashboard:

| Method | Endpoint | Credential |
| --- | --- | --- |
| `GET` | `/api/v1/account/api-key-permissions` | User JWT |
| `GET` | `/api/v1/account/api-key-scopes` | User JWT |
| `POST` | `/api/v1/account/api-keys` | User JWT |
| `GET` | `/api/v1/account/api-keys` | User JWT |
| `PATCH` | `/api/v1/account/api-keys/{key_id}` | User JWT |
| `POST` | `/api/v1/account/api-keys/{key_id}/revoke` | User JWT |
| `DELETE` | `/api/v1/account/api-keys/{key_id}` | User JWT |

Use the generated key for application services:

| Feature | Endpoints | Permission |
| --- | --- | --- |
| LLM models | `GET /v1/models` | `llm:read` |
| Chat completion | `POST /v1/chat/completions` | `llm:write` |
| LLM request status | `GET /v1/llm/requests/{id}` | `llm:read` |
| TTS capabilities | `GET /v1/tts/languages` | TTS read |
| Voices | `GET /v1/voices?language={code}` | Voices read |
| TTS generation | `POST /v1/tts` | TTS write |
| TTS history | `GET /v1/tts/generations`, `GET /v1/tts/generations/{id}` | TTS read |
| Delete TTS audio | `DELETE /v1/tts/generations/{id}` | TTS write |
| STT transcription | `POST /v1/stt` | STT write |
| STT history and files | `GET /v1/stt/transcriptions...` | STT read |
| Edit or delete STT | `PATCH`, `PUT`, `DELETE /v1/stt/transcriptions/{id}` | STT write |
| Voice isolation | `POST /v1/voice-isolations`, `POST /v1/voice-isolations/batch` | `audio_isolation:write` |
| Isolation history and results | `GET /v1/voice-isolations`, `GET /v1/voice-isolations/{id}` | `audio_isolation:read` |
| Hide isolation | `DELETE /v1/voice-isolations/{id}` | `audio_isolation:write` |
| Create isolation export | `POST /v1/voice-isolations/{id}/exports` | `audio_isolation:write` |
| Get isolation export | `GET /v1/voice-isolations/{id}/exports/{format}` | `audio_isolation:read` |
| Realtime TTS | `POST /v1/ticket`, then `GET /v1/tts/stream` | TTS realtime |
| Realtime STT | `POST /v1/ticket`, then `GET /v1/stt/stream` | STT realtime |

Grant **Voice Isolator → Access** for the complete upload, polling, and export
workflow. This enables both isolation scopes. Existing restricted keys need
this permission added explicitly. See [Voice Isolator](https://docs.voicelab.uz/api/voice-isolator).

Grant `llm: access` for model discovery, completions, and request status.
Developer LLM requests use API keys and token-based credits. Ask's
`/api/v1/llm/*` and `/api/v1/chats/*` routes remain JWT-only and uncharged.
See [LLM API](https://docs.voicelab.uz/api/llm).

Analytics and request logs are dashboard views. They use a user JWT and show
only traffic authenticated with developer API keys; website JWT traffic is not
included. See [analytics.md](https://docs.voicelab.uz/api/analytics).

## Quick start

### 1. Create an API key

Use a user access JWT from the VoiceLab dashboard to create a key. The secret
is returned only in this response.

```bash
curl -X POST 'https://api.voicelab.uz/api/v1/account/api-keys' \
  -H 'Authorization: Bearer USER_ACCESS_JWT' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "My production integration",
    "permissions": {
      "text_to_speech": "access",
      "speech_to_text": "access",
      "voices": "read"
    },
    "expires_at": null,
    "restrict_key": true,
    "auto_disable_if_leaked": true
  }'
```

Save `data.secret` immediately. It cannot be recovered later.

### 2. Store the key on your server

```bash
export VOICELAB_API_KEY='vlk_replace_with_the_secret_from_creation'
```

For production, use your deployment secret manager instead of a shell file.

### 3. Generate speech

```bash
curl -fS 'https://api.voicelab.uz/v1/tts' \
  -H "Authorization: Bearer $VOICELAB_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: hello-world-001' \
  -d '{
    "text": "Hello from VoiceLab.",
    "language": "en",
    "voice_id": "voice_01J9NEUTRAL0000000000000001",
    "speed": 1
  }' \
  -o hello.wav
```

The current output is a mono 24 kHz WAV file. The available model and
languages are returned by `/v1/tts/languages`; do not hardcode the catalog.

### 4. Transcribe audio

```bash
curl -fS 'https://api.voicelab.uz/v1/stt' \
  -H "Authorization: Bearer $VOICELAB_API_KEY" \
  -H 'Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000' \
  -F 'audio=@meeting.wav;type=audio/wav' \
  -F 'language=en' \
  -F 'include_speakers=false'
```

Read the full request and response contracts in [stt.md](https://docs.voicelab.uz/api/stt).

## Common response rules

- JSON responses use `Content-Type: application/json`.
- Resource timestamps are RFC 3339 UTC strings, for example `2026-08-16T12:30:00Z`. LLM completion `created` uses Unix seconds; model `created` is `0`.
- IDs, cursors, tickets, and URLs are opaque. Do not parse or construct them.
- Standard resource responses include `request_id`. LLM success bodies use their own shapes; completion headers include `X-LLM-Request-ID`. LLM streaming uses SSE. See [LLM response formats](https://docs.voicelab.uz/api/llm#json-response).
- TTS generation and STT export endpoints return files. Voice Isolator returns
  JSON resources with temporary signed URLs for completed audio and exports.
- Private audio URLs are short-lived signed URLs. Do not store them as
  permanent links.

## Error response

Standard JSON errors use this shape:

```json
{
  "message": "This API key is not allowed to perform this operation.",
  "error": {
    "code": "insufficient_scope"
  },
  "request_id": "req_01J..."
}
```

[LLM handler errors](https://docs.voicelab.uz/api/llm#errors) put the message in `error.message` and
include `error.type`. Shared authentication errors can still use the standard
shape shown above. Handle both envelopes when integrating LLM endpoints.

Some validation errors also contain `error.fields`:

```json
{
  "message": "Check the highlighted fields.",
  "error": {
    "code": "validation_error",
    "fields": {
      "language": "Choose a supported language."
    }
  },
  "request_id": "req_01J..."
}
```

Always log `request_id` in your application. Never log an API key, realtime
ticket, audio bytes, or signed audio URL.

## Documents


  - [Authentication and API keys](https://docs.voicelab.uz/api/authentication)
  - [LLM](https://docs.voicelab.uz/api/llm)
  - [Voices and capabilities](https://docs.voicelab.uz/api/voices)
  - [Text to Speech](https://docs.voicelab.uz/api/tts)
  - [Speech to Text](https://docs.voicelab.uz/api/stt)
  - [Voice Isolator](https://docs.voicelab.uz/api/voice-isolator)
  - [Realtime TTS](https://docs.voicelab.uz/api/tts#realtime-speech)
  - [Realtime STT](https://docs.voicelab.uz/api/realtime-stt)
  - [Analytics and logs](https://docs.voicelab.uz/api/analytics)
  - [Errors and limits](https://docs.voicelab.uz/api/errors)
