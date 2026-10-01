# Auth0 OAuth 2.1 Setup Guide

This guide explains how to configure Auth0 for OpenAI ChatGPT/Codex Plugin authentication with the VoiceLab MCP server.

## Overview

OpenAI Plugins require OAuth 2.1 authentication and do NOT support static API keys. This implementation:

- **Resource Server**: VoiceLab MCP (`https://mcp.voicelab.uz`) verifies Auth0 access tokens
- **Authorization Server**: Your Auth0 tenant issues tokens via authorization-code + PKCE flow
- **Dual Auth Mode**: OAuth for OpenAI clients, legacy Bearer tokens for Cursor/Claude/Grok
- **Standards**: RFC 9068 (OAuth 2.1 Protected Resource Metadata), RFC 9126 (PAR), RFC 7591 (DCR)

## Prerequisites

- Auth0 account (free tier works)
- VoiceLab MCP server deployed at `https://mcp.voicelab.uz` (nginx + systemd)
- Domain control for the audience URL (e.g., `mcp.voicelab.uz`)

## Step 1: Create Auth0 API

1. Log in to [Auth0 Dashboard](https://manage.auth0.com/)
2. Navigate to **Applications → APIs**
3. Click **Create API**
4. Configure:
   - **Name**: `VoiceLab MCP`
   - **Identifier (Audience)**: `https://mcp.voicelab.uz`
     - ⚠️ Must match your public MCP URL (HTTPS, no path)
     - This becomes your `AUTH0_AUDIENCE` env var
   - **Signing Algorithm**: RS256 (default)
5. Click **Create**

## Step 2: Enable API Settings

In your new API settings:

### Permissions (Scopes)

Add these scopes under the **Permissions** tab:

| Scope | Description |
|-------|-------------|
| `mcp:tools` | Access VoiceLab MCP tools |
| `openid` | OpenID Connect identity |
| `email` | User email address |
| `profile` | User profile information |

### RBAC Settings

1. Go to **Settings** tab
2. Enable:
   - ✅ **Enable RBAC** (Role-Based Access Control)
   - ✅ **Add Permissions in the Access Token**
3. Save changes

### Token Settings

- **Token Expiration**: 86400 seconds (24 hours) recommended
- **Allow Offline Access**: Disable (not needed for MCP)
- **Allow Skipping User Consent**: Enable (for smoother UX)

## Step 3: Configure Auth0 Tenant Settings

### Enable Required Features

Navigate to **Settings → Advanced**:

1. **OAuth Grant Types**: Ensure enabled:
   - ✅ Authorization Code
   - ✅ Refresh Token
   - ✅ Client Credentials (for M2M, optional)

2. **OAuth Features**:
   - ✅ PKCE (Proof Key for Code Exchange) — required by OpenAI
   - ✅ Resource Indicators (RFC 8707)
   - ✅ Pushed Authorization Requests (PAR, RFC 9126)

3. **Advanced Settings → OAuth**:
   - Set **Default Audience**: `https://mcp.voicelab.uz`
   - Enable **Dynamic Client Registration** if you want OpenAI to auto-register

### Application Settings (for OpenAI)

OpenAI may use Dynamic Client Registration (DCR) or you can pre-create an application:

#### Option A: Pre-create Application for OpenAI

1. Go to **Applications → Applications**
2. Create **Machine to Machine Application** (or Regular Web App)
3. Configure:
   - **Name**: `OpenAI ChatGPT Plugin`
   - **Application Type**: Machine to Machine (or Single Page Application)
   - **Allowed Callback URLs**: Add OpenAI redirect URIs:
     ```
     https://chat.openai.com/aip/callback
     https://chatgpt.com/aip/callback
     ```
   - **Allowed Web Origins**: `https://chat.openai.com, https://chatgpt.com`
   - **Grant Types**: Authorization Code, Refresh Token
   - **Token Endpoint Authentication Method**: None (PKCE only)
4. Authorize this app to access the **VoiceLab MCP** API with all scopes

#### Option B: Enable Dynamic Client Registration (DCR)

1. Navigate to **Applications → APIs → Auth0 Management API**
2. Grant `create:clients` scope to a trusted M2M app
3. OpenAI will register clients dynamically using DCR (RFC 7591)

## Step 4: Configure VoiceLab MCP Server

### Environment Variables

Set these on your VPS (systemd service, docker-compose, or shell):

```bash
# Auth0 OAuth 2.1
export AUTH0_DOMAIN='your-tenant.auth0.com'
export AUTH0_AUDIENCE='https://mcp.voicelab.uz'
export AUTH0_ISSUER='https://your-tenant.auth0.com'  # Optional, defaults to https://${AUTH0_DOMAIN}

# Legacy Bearer token (optional, for non-OpenAI clients)
export MCP_AUTH_TOKEN='your_secure_token_here'

# VoiceLab API key (unchanged)
export VOICELAB_API_KEY='vlk_...'
```

### Systemd Service Example

Edit `/etc/systemd/system/voicelab-mcp.service`:

```ini
[Unit]
Description=VoiceLab MCP Server
After=network.target

[Service]
Type=simple
User=voicelab
WorkingDirectory=/opt/voicelab-mcp
ExecStart=/usr/bin/node /opt/voicelab-mcp/dist/index.js --http
Restart=on-failure
RestartSec=5s

# Environment
Environment="VOICELAB_API_KEY=vlk_..."
Environment="AUTH0_DOMAIN=your-tenant.auth0.com"
Environment="AUTH0_AUDIENCE=https://mcp.voicelab.uz"
Environment="MCP_AUTH_TOKEN=legacy_token_here"
Environment="HOST=127.0.0.1"
Environment="PORT=3100"

[Install]
WantedBy=multi-user.target
```

Reload and restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart voicelab-mcp
sudo systemctl status voicelab-mcp
```

### Docker Compose Example

```yaml
version: '3.8'
services:
  voicelab-mcp:
    image: voicelab/mcp:latest
    ports:
      - "127.0.0.1:3100:3100"
    environment:
      VOICELAB_API_KEY: vlk_...
      AUTH0_DOMAIN: your-tenant.auth0.com
      AUTH0_AUDIENCE: https://mcp.voicelab.uz
      MCP_AUTH_TOKEN: legacy_token_here
    restart: unless-stopped
```

## Step 5: Verify Nginx Configuration

Ensure `/.well-known/oauth-protected-resource` is proxied to the Node app:

```nginx
server {
    listen 443 ssl http2;
    server_name mcp.voicelab.uz;

    ssl_certificate /etc/letsencrypt/live/mcp.voicelab.uz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.voicelab.uz/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Required for SSE (Server-Sent Events)
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
    }
}
```

Test nginx config and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Step 6: Test OAuth Flow

### Test Resource Metadata Endpoint

```bash
curl -sS https://mcp.voicelab.uz/.well-known/oauth-protected-resource | jq
```

Expected response:

```json
{
  "resource": "https://mcp.voicelab.uz",
  "authorization_servers": [
    "https://your-tenant.auth0.com"
  ],
  "scopes_supported": [
    "mcp:tools",
    "openid",
    "email",
    "profile"
  ],
  "resource_documentation": "https://docs.voicelab.uz",
  "resource_policy_uri": "https://voicelab.uz/privacy",
  "resource_tos_uri": "https://voicelab.uz/terms"
}
```

### Test Unauthorized Access (401 + WWW-Authenticate)

```bash
curl -i https://mcp.voicelab.uz/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

Expected response includes:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://mcp.voicelab.uz/.well-known/oauth-protected-resource"
```

### Test with Valid Access Token

1. Obtain a test token from Auth0:
   ```bash
   curl -X POST https://your-tenant.auth0.com/oauth/token \
     -H "Content-Type: application/json" \
     -d '{
       "client_id": "YOUR_TEST_CLIENT_ID",
       "client_secret": "YOUR_TEST_CLIENT_SECRET",
       "audience": "https://mcp.voicelab.uz",
       "grant_type": "client_credentials"
     }'
   ```

2. Use the token:
   ```bash
   TOKEN='eyJhbGc...'
   curl -X POST https://mcp.voicelab.uz/mcp \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
   ```

### Test get_profile Tool

```bash
curl -X POST https://mcp.voicelab.uz/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_profile",
      "arguments": {}
    }
  }'
```

Expected response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"id\":\"auth0|...\",\"name\":\"John Doe\",\"email\":\"john@example.com\"}"
    }],
    "_meta": {
      "openai/profile": true
    }
  }
}
```

## Step 7: Register with OpenAI

### OpenAI Plugin Manifest

OpenAI will discover your OAuth configuration automatically via:

1. `GET /.well-known/oauth-protected-resource` (resource metadata)
2. `GET https://your-tenant.auth0.com/.well-known/openid-configuration` (Auth0's OIDC discovery)

### Submit Plugin to ChatGPT

1. Go to ChatGPT settings → Beta features → Plugins
2. Click "Develop your own plugin"
3. Enter your MCP URL: `https://mcp.voicelab.uz`
4. ChatGPT will initiate OAuth flow:
   - User redirected to Auth0 login
   - User consents to scopes
   - Auth0 redirects back with authorization code
   - ChatGPT exchanges code for access token (with PKCE)
5. ChatGPT stores token and calls MCP with `Authorization: Bearer <access_token>`

## Troubleshooting

### JWT Verification Fails

**Error**: `JWT verification failed: signature verification failed`

**Fix**:
- Verify `AUTH0_AUDIENCE` matches the API identifier in Auth0
- Check `AUTH0_ISSUER` matches your tenant (e.g., `https://tenant.auth0.com`)
- Ensure JWKS endpoint is reachable: `https://your-tenant.auth0.com/.well-known/jwks.json`

### No `mcp:tools` Scope in Token

**Error**: Tool calls return 403 Forbidden

**Fix**:
1. Check API permissions include `mcp:tools`
2. Ensure **Add Permissions in the Access Token** is enabled
3. Verify the client is authorized for the API with this scope
4. Re-authenticate to get a fresh token

### OpenAI Can't Discover OAuth

**Error**: ChatGPT says "Authentication not configured"

**Fix**:
- Test `/.well-known/oauth-protected-resource` endpoint manually
- Ensure nginx proxies `/.well-known/*` to Node app
- Check Auth0 OIDC discovery: `https://your-tenant.auth0.com/.well-known/openid-configuration`
- Verify CORS headers allow OpenAI origin

### Legacy Token Still Works (Expected)

Both OAuth and legacy Bearer tokens are accepted. To disable legacy tokens:

```bash
unset MCP_AUTH_TOKEN
# Restart service
```

Only OAuth will be accepted after restart.

## Security Best Practices

1. **HTTPS Only**: Never run OAuth over HTTP in production
2. **Audience Validation**: Always validate `aud` claim matches `AUTH0_AUDIENCE`
3. **Issuer Validation**: Verify `iss` claim matches `AUTH0_ISSUER`
4. **Scope Enforcement**: Check `mcp:tools` scope before allowing tool calls
5. **Token Rotation**: Set reasonable expiration (24h recommended)
6. **Rate Limiting**: Keep app-level rate limits enabled
7. **Monitoring**: Log authentication failures for anomaly detection
8. **Secret Management**: Store `VOICELAB_API_KEY` securely (never in code)

## References

- [OpenAI Plugin Authentication](https://platform.openai.com/docs/plugins/authentication)
- [Auth0 MCP Guide](https://auth0.com/ai/docs/mcp)
- [OAuth 2.1 Protected Resource Metadata (RFC 9068)](https://datatracker.ietf.org/doc/html/rfc9068)
- [Auth0 MCP Template](https://github.com/mcp-use/mcp-oauth-auth0-template)
- [PKCE (RFC 7636)](https://datatracker.ietf.org/doc/html/rfc7636)

## Support

- VoiceLab: support@voicelab.uz
- Auth0: https://community.auth0.com
