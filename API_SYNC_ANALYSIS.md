# VoiceLab API Documentation Sync Analysis

## Date: 2026-10-10

## Current MCP Server Status
- **Version**: 1.0.0
- **Total Tools**: 23
- **Last Updated**: 2026-09-29

## Documentation Review Summary

Reviewed latest docs from https://docs.voicelab.uz (uploaded ~2 weeks ago based on git history)

### Key Changes Identified

#### 1. STT Full Document Editing - NEW ENDPOINT ✅
**Docs Change**: Added `PUT /v1/stt/transcriptions/{id}/editor` for atomic document replacement
- **Current MCP**: Only has `update_transcription` for title changes (PATCH)
- **Required Action**: Add new `edit_transcription_document` tool
- **Impact**: Major - enables full transcript editing with segments, speakers, and revision-based conflict resolution

**Schema**:
```typescript
{
  revision: number;          // Current revision from GET response
  title: string;
  segments: Array<{
    ordinal: number;
    start_ms: number;
    end_ms: number;
    text: string;
    speaker?: string;
  }>;
  speakers: Array<{
    id: string;
    display_name: string;
  }>;
}
```

#### 2. Voice Isolator Batch Upload - NEW ENDPOINT ✅
**Docs Change**: Added `POST /v1/voice-isolations/batch` for 1-4 file atomic uploads
- **Current MCP**: Only single file upload via `isolate_voice`
- **Required Action**: Add new `isolate_voice_batch` tool
- **Impact**: Medium - enables efficient multi-file processing

**Features**:
- 1-4 files per request
- Atomic validation and credit reservation
- Shared processing options (speech_restoration, restoration_model)
- Returns batch ID and individual job IDs

#### 3. Parameter and Schema Updates

##### LLM (`list_models`, `chat_completions`, `get_llm_request`)
- **Docs Update**: Detailed pricing structure with `pricing.version`, `pricing.model`, `pricing.credits_per_usd`
- **Docs Update**: New reasoning controls: `thinking` (boolean), `reasoning` (object with `enabled` and `effort`), `reasoning_effort` (enum)
- **Docs Update**: Request status includes `resolution_required`, `failure_code`, `credit_units`, `credit_unit_scale`
- **Current MCP**: Basic implementation exists, needs schema refinement
- **Action**: Update response type definitions and tool descriptions

##### STT (`speech_to_text`, `get_transcription`)
- **Docs Update**: Clarified `202 Accepted` for all uploads (including short clips)
- **Docs Update**: `audio_url` is optional (only when source storage is configured)
- **Docs Update**: Word timing is optional (not guaranteed by all providers)
- **Current MCP**: Implementation matches, but descriptions need updates
- **Action**: Update tool descriptions for clarity

##### Voice Isolator (`isolate_voice`, `get_isolation`)
- **Docs Update**: New processing stages: `noise_reduction`, `speech_restoration`, `finalizing`
- **Docs Update**: Separate `audio_status` for MP3 preparation (queued/running/completed/failed)
- **Docs Update**: Poll until BOTH `status=completed` AND `audio_status=completed`
- **Docs Update**: Additional response fields: `original_filename`, `original_content_type`, `original_available`, `input_audio_url`, `denoised_audio_url`
- **Current MCP**: Implementation needs polling logic clarification
- **Action**: Update tool descriptions and add schema fields

##### Realtime (`create_realtime_ticket`)
- **Docs Update**: Tickets expire after ~2 minutes (was generic "short-lived")
- **Docs Update**: Server authentication via `xvl-api-key` header for trusted clients
- **Current MCP**: Basic ticket creation exists
- **Action**: Update tool description with timing and server auth details

#### 4. No Breaking Changes Detected
- All existing endpoints remain valid
- No removed endpoints
- No renamed parameters
- Backward compatible additions only

### Features NOT in Scope (Dashboard/JWT-only)
These are documented but correctly excluded from MCP (not API-key accessible):
- Voice Cloning (owner-only, not publicly available yet)
- Webhooks (JWT-only management)
- Analytics/Logs (JWT-only, `/api/v1/account/*`)
- LLM Files/Attachments (mentioned in index but no public `/v1` endpoint documented)

## Implementation Plan

### Phase 1: Add New Tools (Priority 1)
1. ✅ Add `edit_transcription_document` tool
2. ✅ Add `isolate_voice_batch` tool

### Phase 2: Update Existing Tools (Priority 2)
3. ✅ Update LLM tools with reasoning controls and enhanced pricing
4. ✅ Update STT tools with clarified polling and optional fields
5. ✅ Update Voice Isolator tools with processing stages and audio status
6. ✅ Update Realtime tool with timing and auth details

### Phase 3: Documentation & Testing (Priority 3)
7. ✅ Update README tool list (23 → 25 tools)
8. ✅ Update CHANGELOG with version 1.1.0
9. ✅ Add/update tests for new tools
10. ✅ Verify MCP annotations (readOnlyHint, destructiveHint, openWorldHint)

### Phase 4: PR & Deployment
11. ✅ Create PR with detailed changelog table
12. ⏸️  Deployment (not in scope - PR only)

## Changelog Table for PR

| Documentation Change | MCP Change | Type |
|---------------------|------------|------|
| Added `PUT /v1/stt/transcriptions/{id}/editor` | Added `edit_transcription_document` tool | New Tool |
| Added `POST /v1/voice-isolations/batch` | Added `isolate_voice_batch` tool | New Tool |
| Enhanced LLM reasoning controls (`thinking`, `reasoning`, `reasoning_effort`) | Updated `chat_completions` schema | Schema Update |
| Enhanced LLM pricing structure with `credit_units`, `credit_unit_scale` | Updated `list_models` and `get_llm_request` descriptions | Schema Update |
| Clarified STT `202 Accepted` for all uploads | Updated `speech_to_text` description | Description |
| Added Voice Isolator processing stages and `audio_status` | Updated `get_isolation` description and schema | Schema Update |
| Clarified realtime ticket expiry (~2 minutes) | Updated `create_realtime_ticket` description | Description |

## Version Bump Rationale
- **Current**: 1.0.0
- **New**: 1.1.0
- **Reason**: Minor version bump (added 2 new tools, backward compatible)

## Tools Summary

### Current (23 tools):
1. get_profile (OAuth)
2. list_models (LLM)
3. chat_completions (LLM)
4. get_llm_request (LLM)
5. list_tts_languages (TTS)
6. list_voices (Voices)
7. text_to_speech (TTS)
8. list_tts_generations (TTS)
9. get_tts_generation (TTS)
10. delete_tts_generation (TTS)
11. speech_to_text (STT)
12. get_transcription (STT)
13. list_transcriptions (STT)
14. update_transcription (STT - title only)
15. delete_transcription (STT)
16. export_transcription (STT)
17. isolate_voice (Voice Isolator)
18. get_isolation (Voice Isolator)
19. list_isolations (Voice Isolator)
20. create_isolation_export (Voice Isolator)
21. get_isolation_export (Voice Isolator)
22. hide_isolation (Voice Isolator)
23. create_realtime_ticket (Realtime)

### After Update (25 tools):
24. **edit_transcription_document (STT - NEW)**
25. **isolate_voice_batch (Voice Isolator - NEW)**

## Testing Strategy
1. Unit tests for new tools (STT module, Isolator module)
2. Update smoke test to cover 25 tools
3. E2E test for batch upload (if feasible)
4. Manual validation of updated descriptions

## Notes
- All changes are additive (no breaking changes)
- OAuth integration unchanged
- MCP annotations preserved for OpenAI Plugins Directory compliance
- Git author: Elzodxon Sharofaddinov <elzodxon@gmail.com> (verified)
