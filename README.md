# VoiceLab MCP Server

Official [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for [VoiceLab](https://voicelab.uz) — enabling AI agents (Cursor, ChatGPT, Grok, Muse, etc.) to use VoiceLab's speech AI capabilities.

## Features

- **LLM Completions**: Chat with Aisha models, manage requests
- **Text-to-Speech**: Generate natural speech in Uzbek, Russian, and English
- **Speech-to-Text**: Transcribe audio with timing and speaker labels
- **Voice Isolation**: Remove background noise with optional speech restoration
- **Voice Management**: List and discover available voices
- **Realtime Support**: Create WebSocket tickets for streaming TTS/STT
- **Meeting AI**: Upload recordings, poll transcripts, summaries, decisions, and action items

## Installation

### Prerequisites

- Node.js 20.0.0 or later
- VoiceLab API key (get one at [voicelab.uz](https://voicelab.uz))

### Install from npm

```bash
npm install -g @voicelab/mcp
```

### Or build from source

```bash
git clone https://github.com/voicelab/voicelab-mcp.git
cd voicelab-mcp
npm install
npm run build
```

## Configuration

### Environment Variables

```bash
export VOICELAB_API_KEY='vlk_your_api_key_here'
export VOICELAB_BASE_URL='https://api.voicelab.uz'  # Optional, uses default if not set
```

Store your API key securely. Never commit it to version control.

### Cursor Configuration

Add to your Cursor settings (`~/.cursor/mcp.json` or workspace `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "voicelab": {
      "command": "npx",
      "args": ["@voicelab/mcp"],
      "env": {
        "VOICELAB_API_KEY": "${VOICELAB_API_KEY}"
      }
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "voicelab": {
      "command": "voicelab-mcp",
      "env": {
        "VOICELAB_API_KEY": "vlk_your_api_key_here"
      }
    }
  }
}
```

## Remote Usage (ChatGPT, Grok, Muse)

Once deployed (VPS HTTP + nginx, or Cloudflare Workers), agents can connect to the hosted endpoint.

### ChatGPT / OpenAI Plugins

OpenAI Plugins require **OAuth 2.1** authentication with per-user billing (static API keys are not supported).

**Quick Setup:**
1. VoiceLab backend implements OAuth AS (see [`BACKEND_OAUTH_SPEC.md`](./BACKEND_OAUTH_SPEC.md))
2. Configure MCP server:
   ```bash
   export OAUTH_ISSUER='https://auth.voicelab.uz'
   export OAUTH_AUDIENCE='https://mcp.voicelab.uz'
   export VOICELAB_API_KEY='vlk_fallback_...'  # For non-OAuth clients
   ```
3. Register plugin in ChatGPT: `https://mcp.voicelab.uz`

ChatGPT discovers OAuth via `/.well-known/oauth-protected-resource` and initiates authorization-code + PKCE flow with VoiceLab.

**Per-User Billing**: OAuth JWTs contain each user's VoiceLab API key in the `voicelab_api_key` claim. MCP extracts this key and uses it for all API calls, charging the correct user's account.

**Full documentation**: [docs/OAUTH_INTEGRATION.md](./docs/OAUTH_INTEGRATION.md)  
**Backend requirements**: [BACKEND_OAUTH_SPEC.md](./BACKEND_OAUTH_SPEC.md)

### Grok

```bash
grok mcp add --transport http voicelab https://mcp.voicelab.uz/mcp
```

Or use custom connector in grok.com/connectors.

### Muse

Submit connector at muse.ai/platform → "Existing MCP" with:
- Endpoint: `https://mcp.voicelab.uz/mcp`
- Auth: Bearer token (user provides their API key)

See `packaging/` folders for detailed catalog submission guides.

## Usage

### Start the Server

**stdio mode** (for local Cursor):
```bash
npm start
# or
voicelab-mcp
```

**HTTP mode** (for remote hosting):
```bash
npm run start:http
```

HTTP mode binds to `127.0.0.1:3100` by default (`HOST` / `PORT`). Put nginx (or another TLS terminator) in front.

#### HTTP environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `VOICELAB_API_KEY` | _(optional)_ | Fallback API key for legacy token users; OAuth users get per-user keys from JWT |
| `VOICELAB_BASE_URL` | `https://api.voicelab.uz` | VoiceLab API origin (must be HTTPS and allowlisted) |
| **OAuth 2.1 (OpenAI)** | | |
| `OAUTH_ISSUER` | _(empty)_ | VoiceLab OAuth issuer — enables OAuth. **MUST exactly match backend `OAUTH_ISSUER_URL` and JWT `iss` claim** |
| `OAUTH_AUDIENCE` | `https://mcp.voicelab.uz` | MCP resource identifier (audience claim in JWTs). **MUST match JWT `aud` claim** |
| **Legacy Auth** | | |
| `MCP_AUTH_TOKEN` | _(empty)_ | Static Bearer token for non-OpenAI clients (Cursor, Claude, Grok) |
| **Server Config** | | |
| `ALLOWED_ORIGINS` | _(empty)_ | Comma-separated browser origins for CORS; empty disables CORS reflection |
| `MAX_BODY_BYTES` | `10485760` | Max request body size (10 MiB) |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | `120` / `60000` | App-level rate limit per client IP |
| `HOST` / `PORT` | `127.0.0.1` / `3100` | Listen address (keep loopback in production) |
| **MCP Apps / audio upload** | | |
| `UPLOAD_PAGE_URL` | _(empty)_ | Optional HTTPS browser upload page. When set, `upload_audio` returns `${UPLOAD_PAGE_URL}#t=<token>&id=<upload_id>&p=<purpose>` as a no-widget fallback; otherwise it suggests `audio_url` |
| `MCP_WIDGET_DOMAIN` | `https://mcp.voicelab.uz` | ChatGPT `openai/widgetDomain` for ui:// resources |
| `MCP_ENABLE_SPIKE` / `SPIKE_ECHO_URL` | _(off)_ | Staging only: `1` + an HTTPS echo URL exposes the Phase 0 spike tool/resource. See [docs/MCP_APPS_SPIKE.md](./docs/MCP_APPS_SPIKE.md) |

#### Dual Authentication Mode

The server supports **both OAuth 2.1 and legacy Bearer tokens** simultaneously:

- **OAuth (VoiceLab AS)**: Required for OpenAI ChatGPT/Codex Plugins. Enable by setting `OAUTH_ISSUER`.
  - Per-user billing: JWTs contain user's API key in `voicelab_api_key` claim
  - MCP extracts this key and charges the correct user's VoiceLab account
- **Legacy Token**: Works for Cursor, Claude Desktop, Grok, and other MCP clients. Enable by setting `MCP_AUTH_TOKEN`.
- **Coexistence**: Both can be active — OpenAI clients use OAuth, others use the legacy token.
- **Fallback Key**: `VOICELAB_API_KEY` used when legacy token auth succeeds or JWT missing per-user key.

**Why Per-User Keys?** OpenAI ChatGPT users share one MCP endpoint. Without per-user keys, all users would charge a single shared VoiceLab account. OAuth JWTs carry each user's API key, ensuring correct billing attribution.

See [docs/OAUTH_INTEGRATION.md](./docs/OAUTH_INTEGRATION.md) for OAuth setup and [BACKEND_OAUTH_SPEC.md](./BACKEND_OAUTH_SPEC.md) for backend implementation requirements.

#### MCP Bearer auth (clients)

When `MCP_AUTH_TOKEN` is set on the server, every `/mcp` request must include:

```http
Authorization: Bearer <MCP_AUTH_TOKEN>
Accept: application/json, text/event-stream
Content-Type: application/json
```

Example initialize:

```bash
curl -sS https://mcp.voicelab.uz/mcp \
  -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

Public discovery (no auth): `GET /health`, `GET /v1`, `GET /.well-known/mcp.json`.

### Available Tools

#### LLM

- `list_models` — List available LLM models with pricing
- `chat_completions` — Create chat completion (auto-generates idempotency key)
- `get_llm_request` — Get request status and token usage

#### Text-to-Speech

- `list_tts_languages` — List supported languages and models
- `list_voices` — List available voices (filter by language)
- `text_to_speech` — Generate speech (returns base64 WAV)
- `list_tts_generations` — List generation history
- `get_tts_generation` — Get generation details with audio URL
- `delete_tts_generation` — Delete a generation (destructive)

#### Speech-to-Text

- `speech_to_text` — Transcribe audio from exactly one of `upload_id`, `audio_url`, or `audio_base64` (≤ ~7 MB); returns job ID
- `get_transcription` — Get transcription status and results (poll until complete)
- `list_transcriptions` — List transcription history
- `update_transcription` — Update transcription title
- `edit_transcription_document` — Atomically replace transcript document (segments, speakers, revision-based)
- `delete_transcription` — Delete transcription (destructive)
- `export_transcription` — Export as TXT, JSON, SRT, or VTT (returns base64)

#### Voice Isolation

- `isolate_voice` — Remove background noise (returns job ID for polling)
- `isolate_voice_batch` — Submit 1-4 files for atomic batch processing
- `get_isolation` — Get job status and audio URLs (poll until complete)
- `list_isolations` — List isolation history
- `create_isolation_export` — Request export in specific format
- `get_isolation_export` — Get export status and download URL
- `hide_isolation` — Hide job from history (does not delete audio)

#### Realtime

- `create_realtime_ticket` — Create WebSocket ticket for streaming TTS or STT

#### Meeting AI

- `list_meeting_capabilities` — List supported recording languages and feature flags
- `create_meeting` — Submit a recording from exactly one of `upload_id`, `audio_url`, or `audio_base64` (≤ ~7 MB); returns 202, poll `get_meeting`
- `list_meetings` — List meetings or refresh selected IDs
- `get_meeting` — Poll status and read transcript, summary, decisions, and action items
- `rename_meeting` — Change a meeting title
- `delete_meeting` — Delete a meeting and its results (destructive)
- `regenerate_meeting_notes` — Retry notes after a notes failure (`transcribed` only)
- `get_meeting_translations` — Attempt translations (docs: not available with API keys)

#### Audio upload (MCP Apps) and ChatGPT files

- `upload_audio` — Open the VoiceLab upload widget (`ui://voicelab/upload`) so the user can send a local file (up to 500 MB) directly to VoiceLab; processing starts automatically. Text fallback for clients without MCP Apps
- `create_upload_session` — App-only (`_meta.ui.visibility: ["app"]`): fresh single-use upload session for the widget
- `get_upload` — Upload session status (`pending` / `ready` / `consumed` / `failed` / `expired`)
- `create_meeting_from_file` — ChatGPT only (`openai/fileParams`): create a meeting from a file attached in ChatGPT
- `transcribe_file` — ChatGPT only (`openai/fileParams`): transcribe a file attached in ChatGPT

The server advertises `capabilities.resources` and serves `ui://voicelab/upload` as `text/html;profile=mcp-app` (MCP Apps spec 2026-01-26). Hosts without MCP Apps ignore the UI metadata. The legacy Cloudflare Worker (`src/worker.ts`) does not support MCP Apps.

### Example Agent Prompts

**Generate speech:**
```
Use VoiceLab to generate Uzbek speech for: "Salom, dunyo!"
```

**Transcribe audio:**
```
Transcribe this meeting recording with speaker labels.
[Attach audio file]
```

**Clean audio:**
```
Remove background noise from this call recording using VoiceLab voice isolation.
[Attach audio file]
```

**Meeting notes:**
```
Upload this recording to VoiceLab Meeting AI, poll until it is ready, and give me the summary, decisions, and action items.
[Attach audio file]
```

## API Reference

Full API documentation: [https://docs.voicelab.uz](https://docs.voicelab.uz)

### Idempotency

STT, TTS, Voice Isolator, and Meeting AI upload tools auto-generate UUIDs for idempotency when not provided. Retries with the same key and body return the original result without reprocessing or charging again.

### Binary Audio Handling

- **Input** (`create_meeting`, `speech_to_text`): exactly one of `upload_id` (from `upload_audio`), `audio_url` (public HTTPS URL, ≤ 4096 chars), or `audio_base64`. The MCP request body is capped at 10 MiB, so base64 audio must stay under ~7 MB. Voice isolation tools accept `audio_base64` only
- **Output**: Audio returned as `audio_base64` (WAV/export format) or via signed URLs in job responses

### Polling

STT transcriptions, Voice Isolator jobs, and Meeting AI uploads are asynchronous:
1. Call `speech_to_text`, `isolate_voice`, or `create_meeting` to submit
2. Poll `get_transcription` or `get_isolation` until `status: "completed"`; poll `get_meeting` until status is `ready`, `transcribed`, or `failed` (not `queued` or `running`)
3. Access results from the completed response

Respect `Retry-After` headers when present. Meeting AI has no completion webhooks.

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Project Structure

```
src/
├── index.ts          # MCP server and tool registration
├── client.ts         # HTTP client and error handling
├── llm.ts            # LLM module
├── tts.ts            # Text-to-Speech module
├── stt.ts            # Speech-to-Text module
├── voices.ts         # Voices module
├── isolator.ts       # Voice Isolator module
├── realtime.ts       # Realtime ticket module
└── meetings.ts       # Meeting AI module
```

## Deployment

### Cloudflare Workers

Deploy the MCP server to Cloudflare Workers for remote HTTP access at `https://mcp.voicelab.uz`.

#### Prerequisites

- Cloudflare account (account ID: `ac52eda10a0df089ff1d6052087b5367`)
- wrangler CLI: `npm install -g wrangler`
- VoiceLab API key

#### Quick Deploy

```bash
# 1. Build the worker
npm run build:worker

# 2. Set your API key secret
wrangler secret put VOICELAB_API_KEY
# Paste your vlk_... key when prompted

# 3. Deploy to Workers
npm run deploy

# Your MCP endpoint will be at:
# https://voicelab-mcp.your-subdomain.workers.dev/mcp
```

#### Custom Domain Setup

1. **Deploy to Workers** (initial deploy uses workers.dev subdomain)

```bash
npm run deploy
```

2. **Add Custom Domain** in Cloudflare Dashboard:
   - Navigate to Workers & Pages
   - Select `voicelab-mcp`
   - Go to Settings → Triggers
   - Add Custom Domain: `mcp.voicelab.uz`

3. **Configure DNS** for voicelab.uz zone:
   - Add `CNAME` record: `mcp` → `voicelab-mcp.your-subdomain.workers.dev`
   - Or use Cloudflare's automatic setup

4. **Update wrangler.toml** (optional, after custom domain is configured):

```toml
routes = [{ pattern = "mcp.voicelab.uz/*", custom_domain = true }]
```

#### Environment Variables

Set secrets via wrangler:

```bash
# Required
wrangler secret put VOICELAB_API_KEY

# Optional
wrangler secret put VOICELAB_BASE_URL
```

Or configure in Cloudflare Dashboard under Settings → Variables.

#### Staging Environment

```bash
# Deploy to staging
npm run deploy:staging

# Set staging secrets
wrangler secret put VOICELAB_API_KEY --env staging
```

#### Health Check

```bash
# Test deployment
curl https://mcp.voicelab.uz/
# Should return: {"name":"VoiceLab MCP Server","version":"1.0.0",...}

# Test MCP endpoint (requires MCP client)
curl -X POST https://mcp.voicelab.uz/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

#### Local Development

Test the worker locally before deploying:

```bash
# Start local worker with hot reload
npm run dev

# Server runs at http://localhost:8787
# Set VOICELAB_API_KEY in .dev.vars file
```

Create `.dev.vars` for local development:

```
VOICELAB_API_KEY=vlk_your_test_key
VOICELAB_BASE_URL=https://api.voicelab.uz
```

#### Monitoring

- View logs: `wrangler tail`
- Dashboard: https://dash.cloudflare.com → Workers & Pages → voicelab-mcp
- Metrics: requests/sec, errors, CPU time

### Docker (Optional)

Create a `Dockerfile`:

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
ENV VOICELAB_API_KEY=""
CMD ["node", "dist/index.js"]
```

Build and run:

```bash
docker build -t voicelab-mcp .
docker run -e VOICELAB_API_KEY=vlk_your_key voicelab-mcp
```

### Hosting for Remote MCP

The server supports both **stdio** (local Cursor) and **HTTP** (remote agents) transports:

**Stdio** (default): For local Cursor usage
```bash
npm start
```

**HTTP (Cloudflare Workers)**: For remote access
```bash
npm run deploy
# Endpoint: https://mcp.voicelab.uz/mcp
```

Use the Workers deployment for ChatGPT, Grok, Muse, and other agents that require remote MCP endpoints.

## Security

- **Never expose your API key** in client code, URLs, or version control
- Store keys in environment variables or a secret manager
- Use restricted API keys with minimum required permissions
- Set `allowed_ips` and `expires_at` when creating keys
- Signed audio URLs expire after ~10 minutes; refresh as needed
- Realtime tickets expire after ~2 minutes; mint fresh tickets per connection

## Troubleshooting

### "VOICELAB_API_KEY environment variable is required"

Set the environment variable before starting:
```bash
export VOICELAB_API_KEY='vlk_...'
npm start
```

### "401 invalid_api_key"

- Check that your key is correct and not expired
- Verify the key is enabled in the VoiceLab dashboard
- Ensure the key has required permissions (`llm:access`, `tts:write`, `stt:write`, etc.)

### "402 insufficient_credits"

Add credits to your VoiceLab account at [voicelab.uz](https://voicelab.uz).

### "409 idempotency_key_reused"

You're retrying with a different request body but the same idempotency key. Either:
- Use a new key for the new request
- Reuse the original body to retrieve the cached result

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure `npm test` and `npm run build` pass
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Links

- [VoiceLab Website](https://voicelab.uz)
- [API Documentation](https://docs.voicelab.uz)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Support](mailto:support@voicelab.uz)

## What's Not Included

Per the VoiceLab developer API contract, this MCP server does **not** expose:

- Account JWT analytics and API-key management UI routes
- Meeting AI dashboard-only surfaces (audio download, transcript/notes editing, speaker renaming, webhooks). Translations are documented as unavailable with API keys; `get_meeting_translations` still attempts `GET /v1/meetings/{id}/translations` and may fail.
- Voice-agent dashboard data
- Browser realtime streams (use `create_realtime_ticket` for WebSocket setup)

Developer Meeting AI uses `/v1/meetings` with an API key (`meetings` Access). Dashboard routes at `/api/v1/meetings` require a user JWT and are not used here.
