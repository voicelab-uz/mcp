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

## [Unreleased]

### Planned

- HTTP transport for remote MCP hosting (e.g., mcp.voicelab.uz)
- Docker deployment example
- Additional integration examples (ChatGPT, Grok, Muse)
- Enhanced test coverage
- Performance optimizations for large audio files
