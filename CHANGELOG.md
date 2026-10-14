# Changelog

All notable changes to the VoiceLab MCP server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-29

### Added

- Initial release of VoiceLab MCP server
- **LLM Module**: List models, create chat completions, get request status
- **Text-to-Speech Module**: Generate speech, list/get/delete generations, list languages
- **Speech-to-Text Module**: Transcribe audio, list/get/update/delete transcriptions, export to TXT/JSON/SRT/VTT
- **Voice Isolator Module**: Remove background noise, list/get jobs, create/get exports, hide jobs
- **Voices Module**: List available voices with language filtering
- **Realtime Module**: Create WebSocket tickets for streaming TTS/STT
- Auto-generation of idempotency keys for STT, TTS, and Voice Isolator operations
- Base64 audio encoding for MCP binary compatibility
- Comprehensive error handling with VoiceLab error envelope support
- Stdio transport for local Cursor usage
- Full TypeScript implementation with type safety
- MIT License
- Comprehensive README with setup and usage examples
- Example Cursor configuration file
- Contributing guidelines
- Smoke tests for module verification

### Technical Details

- Built with official `@modelcontextprotocol/sdk` v1.0.4
- Requires Node.js 20.0.0 or later
- Modular architecture with separate domain modules
- Proper HTTP client with fetch API
- Support for pagination, cursor-based navigation
- Idempotency key validation and generation

### Documentation

- Complete API reference links
- Security best practices
- Troubleshooting guide
- Development setup instructions
- Example prompts for AI agents

## [1.1.0] - 2026-10-10

### Added

- **New Tool**: `edit_transcription_document` — Atomically replace complete transcription documents with revision-based conflict detection (PUT /v1/stt/transcriptions/{id}/editor)
- **New Tool**: `isolate_voice_batch` — Submit 1-4 audio files for atomic batch noise removal (POST /v1/voice-isolations/batch)
- **Client Enhancement**: `uploadMultipartBatch` method for proper multi-file uploads with repeated field names

### Changed

- **LLM Tools**: Enhanced `chat_completions` with reasoning controls (`thinking`, `reasoning_effort`)
- **STT Tools**: Clarified `speech_to_text` returns 202 Accepted for all uploads (including short clips)
- **Voice Isolator Tools**: Updated `get_isolation` description to clarify dual-status polling (job status AND audio_status)
- **Realtime Tools**: Updated `create_realtime_ticket` with ~2 minute expiry timing
- **Tool Descriptions**: Improved accuracy and detail for all tool descriptions to match current API documentation

### Documentation

- Updated README with 25 total tools (was 23)
- Added API_SYNC_ANALYSIS.md documenting sync process and changes
- Synchronized all tool schemas with https://docs.voicelab.uz (Oct 2026 update)

### Technical

- Total tools: 23 → 25
- No breaking changes (backward compatible)
- All existing tools remain functional
- MCP annotations preserved for OpenAI Plugins Directory compliance

## [1.1.1] - 2026-10-10

### Fixed

- **Version Drift**: Server now reads version from `package.json` as single source of truth
  - Fixed hard-coded VERSION in `src/index.ts` (was '1.0.0', should be '1.1.0')
  - Fixed hard-coded version in `src/worker.ts` (was '1.0.0', should be '1.1.0')
  - Added `src/version.ts` module to centralize version reading
  - Added test assertion to verify VERSION matches `package.json`
  - Future version bumps in `package.json` now automatically propagate to all consumers

### Documentation

- Added `VERSION_MANAGEMENT.md` explaining the version management architecture

## [1.2.0] - 2026-10-14

### Added

- **Meeting AI Module** (`src/meetings.ts`): Developer API tools from https://docs.voicelab.uz/api/meetings
  - `list_meeting_capabilities` — `GET /v1/meetings/capabilities` (read-only)
  - `create_meeting` — `POST /v1/meetings` multipart `audio` + UUID `Idempotency-Key` (202)
  - `list_meetings` — `GET /v1/meetings` with `limit`, `cursor`, or `ids`
  - `get_meeting` — `GET /v1/meetings/{id}` (poll until `ready` / `transcribed` / `failed`)
  - `rename_meeting` — `PATCH /v1/meetings/{id}` title-only body
  - `delete_meeting` — `DELETE /v1/meetings/{id}` (destructive, 204)
  - `regenerate_meeting_notes` — `POST /v1/meetings/{id}/notes/generations` (202)
  - `get_meeting_translations` — `GET /v1/meetings/{id}/translations` (flagged: docs say translations are not available with API keys)

### Documentation

- Updated README and API_REFERENCE.md with Meeting AI tools and polling/idempotency notes
- Total tools: 25 → 33 (including `get_profile`)

### Technical

- No changes to existing tools
- Uses the existing REST client, per-user OAuth API key, and SSRF allowlist
- Developer prefix `/v1/meetings` (docs); not dashboard `/api/v1/meetings`

## [1.3.0] - 2026-10-14

### Added

- **`MCP_ENABLE_UPLOAD_SESSIONS`** (default off): backend `/v1/uploads` is not deployed yet, so everything that depends on upload sessions is hidden unless set to `1` — `upload_audio`, `create_upload_session`, `get_upload`, the `ui://voicelab/upload` resource (list + read), and the `upload_id` property on `create_meeting` / `speech_to_text` (when off, `upload_id` is rejected with `invalid_audio_source`). `audio_url`, `audio_base64`, and the ChatGPT file tools are always on
- **MCP Apps upload view** (spec 2026-01-26): `capabilities.resources`, `resources/list`, `resources/read`, and `resources/templates/list`; `ui://voicelab/upload` served as `text/html;profile=mcp-app` with CSP `connectDomains` = API origin (plus `openai/widgetCSP`, `openai/widgetDomain`, `openai/widgetDescription` aliases). Unknown resources return `-32002`
- **Upload sessions** (`src/uploads.ts`): `POST /v1/uploads`, `GET /v1/uploads/{id}`
  - `upload_audio` — creates a session and opens the upload widget; the single-use `upload_token` is returned only in result `_meta["voicelab/upload"]`
  - `create_upload_session` — app-only (`_meta.ui.visibility: ["app"]`, `openai/visibility: private`)
  - `get_upload` — session status
  - Optional `UPLOAD_PAGE_URL` adds a `browser_upload_url` fallback (`#t=…&id=…&p=…`)
- **ChatGPT file params**: `create_meeting_from_file` and `transcribe_file` (`openai/fileParams: ["file"]`) forward `download_url` as `audio_url`, never echo it, and derive a deterministic UUIDv5 idempotency key from `file_id`
- **Phase 0 spike** (staging only, `MCP_ENABLE_SPIKE=1` + `SPIKE_ECHO_URL`): `upload_spike`, app-only `upload_spike_done`, `ui://voicelab/spike` diagnostics view. See `docs/MCP_APPS_SPIKE.md`

### Changed

- `create_meeting` and `speech_to_text` accept exactly one of `audio_url` or `audio_base64` (plus `upload_id` with `MCP_ENABLE_UPLOAD_SESSIONS=1`); `audio_base64` is no longer required; `speech_to_text` still requires `language`. Descriptions document the ~7 MB base64 limit (10 MiB MCP body cap)
- `MeetingsModule.createMeeting` / `STTModule.transcribeAudio` take an `AudioSource` (`file` | `url` | `upload`); bare `Blob` still accepted
- `tools/list` merges per-tool `_meta` (e.g. `_meta.ui`) instead of overwriting it
- Server construction moved to `src/server.ts`
- `src/worker.ts` marked legacy; returns a clear error for `resources/*`

### Technical

- Total tools: 33 → 35 by default; 38 with `MCP_ENABLE_UPLOAD_SESSIONS=1`; +2 (`upload_spike`, `upload_spike_done`) with the spike enabled
- Voice isolation tools unchanged (`audio_base64` only)
- No new runtime dependencies

## [Unreleased]

### Planned

- HTTP transport for remote MCP hosting (e.g., mcp.voicelab.uz)
- Docker deployment example
- Additional integration examples (ChatGPT, Grok, Muse)
- Enhanced test coverage
- Performance optimizations for large audio files
