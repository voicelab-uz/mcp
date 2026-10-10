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

## [Unreleased]

### Planned

- HTTP transport for remote MCP hosting (e.g., mcp.voicelab.uz)
- Docker deployment example
- Additional integration examples (ChatGPT, Grok, Muse)
- Enhanced test coverage
- Performance optimizations for large audio files
