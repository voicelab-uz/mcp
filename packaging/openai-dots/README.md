# OpenAI Agent Plugins (2026) Package

This package contains the complete submission bundle for VoiceLab MCP in the OpenAI Plugins Directory (2026 Agent Plugins format).

## Package Structure

```
packaging/openai-dots/
├── plugin/                          # Plugin source (ZIP this folder)
│   ├── plugin.json                  # Agent Plugins manifest (required)
│   ├── mcp.json                     # MCP server connection config
│   ├── assets/                      # Icons and images
│   │   ├── logo.png                 # 512x512 plugin logo (⚠️ PLACEHOLDER)
│   │   ├── icon.png                 # 256x256 composer icon (⚠️ PLACEHOLDER)
│   │   └── PLACEHOLDER_NOTICE.txt   # Asset replacement instructions
│   └── skills/                      # Onboarding and help skills
│       └── get-started/
│           └── SKILL.md             # Getting started guide
├── build-plugin.sh                  # Build ZIP for submission
├── README.md                        # This file
└── SUBMISSION.md                    # Submission checklist and guide
```

## 2026 Agent Plugins Format

OpenAI now uses the **Agent Plugins** standard (https://agent-plugins.org) instead of the legacy ChatGPT ai-plugin.json format.

### Key Changes from Legacy Format

| Legacy (ai-plugin.json) | 2026 (plugin.json) |
|------------------------|-------------------|
| `name_for_human/model` | `name`, `extensions.com.openai.interface.displayName` |
| OpenAPI spec reference | MCP server in `mcp.json` |
| Installed via manifest URL | Uploaded as ZIP package |
| Manual domain verification | Same verification process |

### What's Included

1. **plugin.json** - Agent Plugins schema v1.0.0 manifest with:
   - Core metadata (id, version, name, description)
   - Author and contact info
   - OpenAI interface extensions (display name, descriptions, capabilities)
   - Legal URLs (privacy, terms, support)
   - Test cases (5 positive, 3 negative with real tool names)
   - Release notes

2. **mcp.json** - MCP server connection:
   - Remote streamable-http transport
   - Server URL: `https://mcp.voicelab.uz/mcp`

3. **skills/** - Onboarding content:
   - `get-started/SKILL.md` - Getting started guide for users

4. **assets/** - Visual assets:
   - `logo.png` - Plugin listing logo (512x512)
   - `icon.png` - Composer icon (256x256)
   - ⚠️ **Currently placeholders** - replace with real VoiceLab assets

## Submission Workflow (2026)

### 1. Prerequisites

- ✅ MCP server deployed: `https://mcp.voicelab.uz/mcp`
- ⚠️ **MCP tool hints deployment required** (see SUBMISSION.md - critical for OpenAI Scan Tools)
- ⚠️ PNG logo assets (SVG downloaded, conversion pending in `plugin/assets/`)
- ✅ Privacy policy: `https://voicelab.uz/privacy`
- ✅ Terms of service: `https://voicelab.uz/terms`
- ✅ Support docs: `https://docs.voicelab.uz/mcp/security`

### 2. Build Plugin ZIP

```bash
cd packaging/openai-dots
./build-plugin.sh
```

This creates `voicelab-openai-plugin.zip` from the `plugin/` directory.

### 3. Submit to OpenAI

1. Go to https://platform.openai.com/plugins
2. Click **"Upload plugin ZIP"**
3. Upload `voicelab-openai-plugin.zip`
4. OpenAI scans the ZIP and extracts:
   - `plugin.json` manifest
   - `mcp.json` MCP configuration
   - Skills and assets
5. Click **"Connect MCP"** - OpenAI tests connection to `https://mcp.voicelab.uz/mcp`
6. Complete **domain verification** (see below)
7. OpenAI scans tools via MCP `tools/list`
8. Review test cases and submission materials
9. Click **"Submit for Review"**

### 4. Domain Verification

OpenAI requires proof you control the MCP domain.

**Steps:**
1. OpenAI portal shows a verification token (e.g., `openai_verify_abc123...`)
2. Host this token as plain text at:
   ```
   https://mcp.voicelab.uz/.well-known/openai-apps-challenge
   ```
3. Optionally also host at parent domain:
   ```
   https://voicelab.uz/.well-known/openai-apps-challenge
   ```
4. Click **"Verify Domain"** in OpenAI portal
5. OpenAI fetches the file and checks token match

**Example nginx config:**
```nginx
location /.well-known/openai-apps-challenge {
    alias /var/www/openai-verify.txt;
    default_type text/plain;
}
```

### 5. Review Process

- **Initial review**: 3-5 business days
- **Test cases**: OpenAI will test all 8 cases (5 positive, 3 negative)
- **Feedback**: May request changes to descriptions, test cases, or MCP responses
- **Approval**: Plugin goes live in OpenAI marketplace

## Test Cases

Our submission includes 8 test cases using **real tool names** from the VoiceLab MCP:

### Positive (5)
1. **Generate Uzbek speech** → `list_voices`, `text_to_speech`
2. **Transcribe with speakers** → `speech_to_text`, `get_transcription`
3. **List Russian voices** → `list_voices`
4. **Voice isolation** → `isolate_voice`, `get_isolation`
5. **LLM completion** → `list_models`, `chat_completions`

### Negative (3)
1. **Invalid voice ID** → `text_to_speech` error
2. **Unsupported language** → language validation error
3. **Missing audio** → parameter validation error

All tool names match the actual MCP tools in `src/tools.ts`.

## Authentication

VoiceLab MCP uses **gateway Bearer token authentication**:
- Gateway auth: `MCP_AUTH_TOKEN` environment variable on the MCP server
- Server-side API key: `VOICELAB_API_KEY` (configured on server, not user-facing)
- OpenAI sends: `Authorization: Bearer <MCP_AUTH_TOKEN>`
- **Users do NOT provide vlk_* API keys to ChatGPT** - auth is gateway-level only

## Known Issues / TODOs

1. ⚠️ **PNG conversion required**
   - ✅ Real VoiceLab SVG logo downloaded: `plugin/assets/logo.svg`
   - ⚠️ Convert to PNG: see `plugin/assets/CONVERT_SVG.md`
   - Need: `logo.png` (512x512) + `icon.png` (256x256)
   - Note: https://mcp.voicelab.uz/logo.png returns 404 (not hosted)

2. ⚠️ **MCP tool hints deployment**
   - ✅ Code updated in `src/tools.ts` (this PR)
   - ⚠️ Must deploy to production before OpenAI Scan Tools step
   - All 27 tools now have readOnlyHint/destructiveHint/openWorldHint annotations

3. **Demo video** - OpenAI may request a demo recording URL
   - Record a 1-2 minute walkthrough showing:
     - TTS generation
     - STT transcription
     - Voice isolation
   - Host publicly (YouTube, Loom, etc.)
   - Add URL to SUBMISSION.md

## Legacy ai-plugin.json

The old `ai-plugin.json` format (ChatGPT Plugins, pre-2026) is still in this directory for reference but is **no longer the primary submission format**.

If needed for backward compatibility:
- Keep `ai-plugin.json` in repo root or at `/.well-known/ai-plugin.json`
- Mark as "legacy" in docs
- Primary path is now the plugin.json ZIP upload

## Resources

- Agent Plugins spec: https://agent-plugins.org
- OpenAI Plugins docs: https://developers.openai.com/plugins
- MCP specification: https://modelcontextprotocol.io
- VoiceLab docs: https://docs.voicelab.uz

## Support

Questions about this package:
- GitHub: https://github.com/voicelab-uz/mcp
- Email: elzodxon@gmail.com
