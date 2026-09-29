# VoiceLab MCP connector — draft tool spec

Remote MCP for Grok, Muse, Dots, Cursor, and other agents.
Base API: `https://api.voicelab.uz` · Auth: `Authorization: Bearer vlk_...`
Suggested MCP URL: `https://mcp.voicelab.uz/mcp` (streamable HTTP)

Do **not** expose JWT account-management or analytics tools in v1.
Realtime WebSockets stay out of v1 tools (mint ticket only if needed later).

## Auth

- Connector setup: developer API key (`vlk_`) as secret header
- Server maps key scopes → available tools
- Never put the key in tool args or model context

## Tools (v1)

| Tool | Maps to | Notes |
|------|---------|--------|
| `list_models` | `GET /v1/models` | Free discovery |
| `chat_completions` | `POST /v1/chat/completions` | Paid; unique idempotency key |
| `get_llm_request` | `GET /v1/llm/requests/{id}` | After interrupts / retries |
| `list_tts_languages` | `GET /v1/tts/languages` | Before TTS |
| `list_voices` | `GET /v1/voices?language=` | Resolve opaque `voice_id` |
| `text_to_speech` | `POST /v1/tts` | Returns / saves 24 kHz mono WAV |
| `list_tts_generations` | `GET /v1/tts/generations` | History |
| `get_tts_generation` | `GET /v1/tts/generations/{id}` | Detail |
| `delete_tts_generation` | `DELETE /v1/tts/generations/{id}` | Destructive — confirm |
| `speech_to_text` | `POST /v1/stt` + poll | Accept 202, poll until terminal |
| `get_transcription` | `GET /v1/stt/transcriptions/{id}` | |
| `list_transcriptions` | `GET /v1/stt/transcriptions` | |
| `export_transcription` | `GET .../export` | |
| `update_transcription` | `PATCH` / editor `PUT` | |
| `delete_transcription` | `DELETE` | Destructive — confirm |
| `isolate_voice` | `POST /v1/voice-isolations` + poll | Multipart `file` |
| `isolate_voice_batch` | `POST /v1/voice-isolations/batch` | |
| `get_isolation` | `GET /v1/voice-isolations/{id}` | Refresh signed URLs |
| `list_isolations` | `GET /v1/voice-isolations` | |
| `create_isolation_export` | `POST .../exports` | |
| `get_isolation_export` | `GET .../exports/{format}` | |
| `hide_isolation` | `DELETE` | Hides history only |

Existing agent sample names `voicelab_tts` / `voicelab_stt` can stay as aliases of `text_to_speech` / `speech_to_text`.

## Agent install (once hosted)

**Cursor / Grok Bot:** Add remote MCP URL + API key header (catalog plugin later).

**Claude / Muse-style:** Same remote URL + Bearer key in connector settings.

**Dots / other:** Point at `https://mcp.voicelab.uz/mcp` with `Authorization: Bearer vlk_...`.

## Build order

1. Host streamable-HTTP MCP wrapping `/v1` with key auth
2. Ship discovery + TTS + STT tools first (match docs agent flow)
3. Add LLM + Voice Isolator
4. Publish Cursor plugin + install snippets for Grok / Muse / Dots
5. Keep docs `for-agents` tool schemas in sync with MCP

## Out of v1

- Account API-key CRUD (JWT)
- Analytics / request logs (JWT)
- Browser realtime streams (ticket + WSS) — optional later `create_realtime_ticket`
