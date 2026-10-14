# MCP Apps upload spike (Phase 0)

A throwaway diagnostics view that answers one question per host (Claude, ChatGPT):
**can an MCP Apps iframe pick a local file and PUT it cross-origin, and do the
messages our real upload view depends on work?**

It is staging-only. The tool and resource do not exist unless both env vars are set:

| Variable | Value |
|----------|-------|
| `MCP_ENABLE_SPIKE` | `1` |
| `SPIKE_ECHO_URL` | HTTPS URL that accepts `PUT` with CORS `Access-Control-Allow-Origin: *` and allows the `Content-Type` and `X-Upload-Token` request headers |

If `SPIKE_ECHO_URL` is missing or not `https`, the server logs a config warning and keeps the spike disabled.

When enabled, the server exposes:

- `upload_spike` (model-visible) → renders `ui://voicelab/spike`; result `_meta["voicelab/spike"]` carries a nonce
- `upload_spike_done` (app-only, `_meta.ui.visibility: ["app"]`) → receives the view's report
- `ui://voicelab/spike` with CSP `connectDomains` = origin of `SPIKE_ECHO_URL`

## 1. Echo endpoint

Use a test file only (a few MB of dummy audio). Either:

- **Staging nginx** (preferred). Add to a staging HTTPS server block (not production):

  ```nginx
  location = /spike-echo {
      client_max_body_size 200m;
      if ($request_method = OPTIONS) {
          add_header Access-Control-Allow-Origin "*" always;
          add_header Access-Control-Allow-Methods "PUT, OPTIONS" always;
          add_header Access-Control-Allow-Headers "Content-Type, X-Upload-Token" always;
          add_header Access-Control-Max-Age 600 always;
          return 204;
      }
      limit_except PUT OPTIONS { deny all; }
      add_header Access-Control-Allow-Origin "*" always;
      default_type application/json;
      return 200 '{"ok":true}';
  }
  ```

  Then `SPIKE_ECHO_URL=https://<staging-host>/spike-echo`.

- **Third party** for a quick check: `SPIKE_ECHO_URL=https://httpbin.org/put` (dummy files only; the bytes leave our infrastructure).

Check it from a shell first:

```bash
curl -si -X OPTIONS "$SPIKE_ECHO_URL" -H 'Origin: https://example.com' \
  -H 'Access-Control-Request-Method: PUT' -H 'Access-Control-Request-Headers: content-type,x-upload-token' | head -20
curl -si -X PUT "$SPIKE_ECHO_URL" -H 'X-Upload-Token: x' --data-binary @/etc/hosts | head -5
```

## 2. Run the staging MCP server

```bash
npm ci && npm run build
MCP_ENABLE_SPIKE=1 SPIKE_ECHO_URL=https://<staging-host>/spike-echo \
  <usual staging env: OAUTH_ISSUER / MCP_AUTH_TOKEN / VOICELAB_API_KEY ...> \
  node dist/index.js --http
```

The startup log should print `MCP Apps spike: ENABLED (echo origin …) — staging only`.
Sanity check via MCP: `tools/list` contains `upload_spike`; `resources/read` of `ui://voicelab/spike`
returns `text/html;profile=mcp-app`.

## 3. Test in each host

Ask the assistant: **"Run the VoiceLab upload spike."** (it should call `upload_spike`).
In the view: click the file input (or drop a file), wait for the table to fill, then press
**Test ui/update-model-context** and **Test ui/open-link**.

- **Claude** (claude.ai web, Claude Desktop): add the staging MCP URL as a custom connector
  (Settings → Connectors), authenticate, enable it in a new chat.
- **ChatGPT** (web, desktop, mobile if possible): Settings → Apps & Connectors → Advanced → Developer mode;
  create a connector with the staging MCP URL. After any server redeploy use **Refresh** on the
  connector so ChatGPT re-reads tools and templates.

## 4. What to record (per host × platform)

Screenshot the whole view and copy the **Report** JSON. Fill this table:

| Row | Claude web | Claude Desktop | ChatGPT web | ChatGPT desktop/mobile |
|-----|-----------|----------------|-------------|------------------------|
| View rendered at all | | | | |
| `ui/initialize` ok + `hostInfo` | | | | |
| `window.openai` present (and `uploadFile`) | | | | |
| tool-input / tool-result received | | | | |
| tool-result `_meta["voicelab/spike"]` received (or via `window.openai.toolResponseMetadata`) | | | | |
| File picker opens (click) / drag-drop works | | | | |
| File size reported correctly | | | | |
| PUT status (2xx? network error?) + progress events | | | | |
| CSP violation row (directive + blocked URI) | | | | |
| `tools/call upload_spike_done` (app-only tool) | | | | |
| `ui/message` result | | | | |
| `ui/update-model-context` result | | | | |
| `ui/open-link` result | | | | |

Also note: maximum file size you tried, upload time, and whether the echo server saw the
`OPTIONS` preflight and the `PUT` (staging nginx access log).

## 5. How the results map to decisions

- **PUT fails** (network error and/or CSP violation) in a host → that host needs the browser
  fallback page (`UPLOAD_PAGE_URL`, opened via `ui/open-link`) or `create_meeting_from_file` (ChatGPT).
- **tool-result `_meta` missing** → the upload view cannot get the token from `upload_audio`'s result;
  it must rely on its own `tools/call create_upload_session` response.
- **App-only `tools/call` rejected** → `create_upload_session` must become model-visible or the view must
  only use the initial `upload_audio` session.
- **`ui/message` fails** → rely on `ui/update-model-context` + visible "tell the assistant" text.

Disable the spike afterwards (unset `MCP_ENABLE_SPIKE`) and remove the echo location.
