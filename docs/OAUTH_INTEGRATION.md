# VoiceLab OAuth 2.1 Integration Guide

**For**: VoiceLab MCP Operators  
**Purpose**: Enable OpenAI ChatGPT/Codex Plugin integration with per-user billing  
**Prerequisites**: VoiceLab backend must implement OAuth AS (see [`BACKEND_OAUTH_SPEC.md`](../BACKEND_OAUTH_SPEC.md))

---

## Overview

This MCP server acts as an **OAuth 2.1 Resource Server** that verifies VoiceLab-issued JWT access tokens and extracts per-user API keys for billing.

**Architecture**:
- **Authorization Server (AS)**: VoiceLab backend (`https://auth.voicelab.uz`)
- **Resource Server (RS)**: This MCP server (`https://mcp.voicelab.uz`)
- **Client**: OpenAI ChatGPT
- **User**: ChatGPT user with VoiceLab account

**Per-User Billing Flow**:
1. User authorizes ChatGPT → VoiceLab OAuth consent screen
2. VoiceLab mints/binds user's API key, includes in JWT `voicelab_api_key` claim
3. ChatGPT sends Bearer JWT to MCP server
4. MCP extracts per-user API key from JWT, uses for VoiceLab API calls
5. API charges hit user's VoiceLab account (not shared key)

---

## Environment Variables

### Required for OAuth

```bash
# VoiceLab OAuth Authorization Server issuer
OAUTH_ISSUER=https://auth.voicelab.uz

# This MCP server's resource identifier (audience claim)
OAUTH_AUDIENCE=https://mcp.voicelab.uz
```

### Optional Fallback

```bash
# Fallback API key for legacy token users (Cursor, Claude, Grok)
# Also used when JWT missing voicelab_api_key claim
VOICELAB_API_KEY=vlk_fallback_key_here

# Legacy static Bearer token (non-OAuth clients)
MCP_AUTH_TOKEN=static_bearer_token_here
```

### Standard Config

```bash
VOICELAB_BASE_URL=https://api.voicelab.uz
HOST=127.0.0.1
PORT=3100
ALLOWED_ORIGINS=https://chatgpt.com,https://chat.openai.com
```

---

## Deployment

### Systemd Service

Update `/etc/systemd/system/voicelab-mcp.service`:

```ini
[Unit]
Description=VoiceLab MCP Server with OAuth 2.1
After=network.target

[Service]
Type=simple
User=voicelab
WorkingDirectory=/opt/voicelab-mcp
ExecStart=/usr/bin/node /opt/voicelab-mcp/dist/index.js --http
Restart=on-failure
RestartSec=5s

# OAuth Configuration (VoiceLab AS)
Environment="OAUTH_ISSUER=https://auth.voicelab.uz"
Environment="OAUTH_AUDIENCE=https://mcp.voicelab.uz"

# Fallback for non-OAuth clients
Environment="VOICELAB_API_KEY=vlk_fallback_..."
Environment="MCP_AUTH_TOKEN=legacy_token_..."

# Server Config
Environment="HOST=127.0.0.1"
Environment="PORT=3100"
Environment="ALLOWED_ORIGINS=https://chatgpt.com,https://chat.openai.com"

[Install]
WantedBy=multi-user.target
```

Restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart voicelab-mcp
sudo systemctl status voicelab-mcp
```

### Docker Compose

```yaml
version: '3.8'
services:
  voicelab-mcp:
    image: voicelab/mcp:latest
    ports:
      - "127.0.0.1:3100:3100"
    environment:
      OAUTH_ISSUER: https://auth.voicelab.uz
      OAUTH_AUDIENCE: https://mcp.voicelab.uz
      VOICELAB_API_KEY: vlk_fallback_...
      MCP_AUTH_TOKEN: legacy_token_...
      ALLOWED_ORIGINS: https://chatgpt.com,https://chat.openai.com
    restart: unless-stopped
```

### Nginx Configuration

Ensure `/.well-known/oauth-protected-resource` proxies to Node app:

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

Reload nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## Testing OAuth Flow

### 1. Test Resource Metadata Discovery

```bash
curl -sS https://mcp.voicelab.uz/.well-known/oauth-protected-resource | jq
```

**Expected**:
```json
{
  "resource": "https://mcp.voicelab.uz",
  "authorization_servers": ["https://auth.voicelab.uz"],
  "scopes_supported": ["openid", "email", "profile", "mcp:tools"],
  "resource_documentation": "https://docs.voicelab.uz",
  "resource_policy_uri": "https://voicelab.uz/privacy",
  "resource_tos_uri": "https://voicelab.uz/terms"
}
```

### 2. Test Unauthorized Access (401 + WWW-Authenticate)

```bash
curl -i https://mcp.voicelab.uz/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

**Expected**:
```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="VoiceLab MCP", resource_metadata="https://mcp.voicelab.uz/.well-known/oauth-protected-resource"
```

### 3. Test with VoiceLab OAuth Token

Obtain token from VoiceLab OAuth (see [`BACKEND_OAUTH_SPEC.md`](../BACKEND_OAUTH_SPEC.md)):

```bash
# Authorization-code + PKCE flow via VoiceLab consent screen
# (Browser flow, simplified here)

# After OAuth flow, use access token:
TOKEN='eyJhbGc...'  # VoiceLab-issued JWT with voicelab_api_key claim

curl -X POST https://mcp.voicelab.uz/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

**Expected**: Tools list with OAuth security schemes.

### 4. Test get_profile Tool

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

**Expected**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"id\":\"voicelab|user_12345\",\"name\":\"John Doe\",\"email\":\"john@example.com\"}"
    }],
    "_meta": {
      "openai/profile": true
    }
  }
}
```

### 5. Verify Per-User API Key Extraction

Check server logs after OAuth tool call:

```bash
sudo journalctl -u voicelab-mcp -f
```

**Expected log**:
```
OAuth user: voicelab|user_12345 (using per-user API key)
```

This confirms the server extracted `voicelab_api_key` from JWT and used it for VoiceLab API calls.

### 6. Test Legacy Token (Backward Compatibility)

```bash
curl -X POST https://mcp.voicelab.uz/mcp \
  -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

**Expected**: Works as before (uses fallback API key).

---

## OpenAI ChatGPT Registration

### Prerequisites

VoiceLab backend must have completed:
- [ ] OAuth AS implementation (see `BACKEND_OAUTH_SPEC.md`)
- [ ] JWKS endpoint published at `https://auth.voicelab.uz/.well-known/jwks.json`
- [ ] Per-user API key minting in OAuth flow
- [ ] OpenAI redirect URI allowlisted (`https://chat.openai.com/aip/callback`)

### Register with ChatGPT

1. Go to ChatGPT settings → Beta features → Plugins
2. Click "Develop your own plugin"
3. Enter: `https://mcp.voicelab.uz`
4. ChatGPT discovers OAuth via `/.well-known/oauth-protected-resource`
5. User clicks "Sign in with VoiceLab"
6. Redirect to VoiceLab OAuth consent screen
7. User authorizes → VoiceLab mints per-user API key
8. Redirect back to ChatGPT with authorization code
9. ChatGPT exchanges code for JWT (PKCE verified)
10. ChatGPT calls MCP with `Authorization: Bearer {voicelab_jwt}`

### Verify Integration

Ask ChatGPT:
```
Use VoiceLab to list available LLM models
```

Check server logs for:
```
OAuth user: voicelab|user_xxx (using per-user API key)
```

Check VoiceLab backend logs for API calls charged to `user_xxx`'s account.

---

## Security Considerations

### JWT Verification

The MCP server verifies:
- ✅ Signature via JWKS from `https://auth.voicelab.uz/.well-known/jwks.json`
- ✅ Issuer (`iss` claim) matches `OAUTH_ISSUER`
- ✅ Audience (`aud` claim) matches `OAUTH_AUDIENCE`
- ✅ Expiration (`exp` claim) is in the future
- ✅ Presence of `voicelab_api_key` claim (critical for per-user billing)

### Per-User API Key Security

- ✅ API keys never leave VoiceLab backend (not logged, not exposed)
- ✅ JWTs short-lived (24h recommended)
- ✅ Keys bound to user accounts (VoiceLab backend enforces)
- ✅ Users can revoke OAuth access from VoiceLab dashboard

### Rate Limiting

- App-level rate limit: 120 req/min per IP (configurable via `RATE_LIMIT_MAX`)
- VoiceLab API enforces per-user limits on keys

### Monitoring

Monitor these metrics:
- OAuth authentication success/failure rate
- JWT verification failures (potential attack)
- Missing `voicelab_api_key` claims (OAuth config issue)
- Per-user API key extraction success rate

---

## Troubleshooting

### JWT Verification Fails

**Error**: `JWT verification failed: signature verification failed`

**Fix**:
- Verify `OAUTH_ISSUER` matches VoiceLab backend issuer
- Check `OAUTH_AUDIENCE` matches resource identifier
- Test JWKS endpoint: `curl https://auth.voicelab.uz/.well-known/jwks.json`
- Verify JWT `iss` and `aud` claims match env vars

### Missing voicelab_api_key Claim

**Error**: Server logs `JWT missing voicelab_api_key claim (per-user billing requires this)`

**Fix**:
- VoiceLab backend must include `voicelab_api_key` in JWT payload
- Check OAuth consent flow mints/binds API key correctly
- Verify JWT payload: `echo $TOKEN | cut -d. -f2 | base64 -d | jq`

### OpenAI Can't Discover OAuth

**Error**: ChatGPT says "Authentication not configured"

**Fix**:
- Test `/.well-known/oauth-protected-resource` endpoint manually
- Ensure nginx proxies `/.well-known/*` to Node app
- Check VoiceLab OIDC discovery: `curl https://auth.voicelab.uz/.well-known/openid-configuration`
- Verify CORS headers allow OpenAI origin

### Fallback API Key Used Instead of Per-User Key

**Symptom**: Logs show fallback key usage instead of per-user key

**Fix**:
- Verify JWT contains `voicelab_api_key` claim
- Check JWT is valid (not expired, correct issuer/audience)
- If JWT valid but claim missing, VoiceLab backend OAuth issue

### Legacy Token Doesn't Work

**Error**: 401 Unauthorized with legacy `MCP_AUTH_TOKEN`

**Fix**:
- Verify `MCP_AUTH_TOKEN` env var set correctly
- Check Bearer token format: `Authorization: Bearer {token}`
- Ensure dual auth mode enabled (both `OAUTH_ISSUER` and `MCP_AUTH_TOKEN` can coexist)

---

## Architecture Diagram

```
┌─────────────┐          ┌──────────────────┐         ┌─────────────┐
│   ChatGPT   │          │  VoiceLab OAuth  │         │ VoiceLab    │
│    User     │          │  (Auth Server)   │         │ MCP Server  │
│             │          │ auth.voicelab.uz │         │mcp.voicelab │
└──────┬──────┘          └────────┬─────────┘         └──────┬──────┘
       │                          │                          │
       │ 1. Authorize ChatGPT     │                          │
       ├─────────────────────────>│                          │
       │                          │                          │
       │ 2. OAuth consent screen  │                          │
       │<─────────────────────────┤                          │
       │                          │                          │
       │ 3. Approve & mint API key│                          │
       ├─────────────────────────>│                          │
       │                          │                          │
       │ 4. Authorization code    │                          │
       │<─────────────────────────┤                          │
       │                          │                          │
       │ 5. Exchange code (PKCE)  │                          │
       │────────────────────────> │                          │
       │                          │                          │
       │ 6. JWT with user API key │                          │
       │<─────────────────────────┤                          │
       │                          │                          │
       │ 7. Bearer JWT            │                          │
       ├──────────────────────────┼─────────────────────────>│
       │                          │                          │
       │                          │     8. Verify JWT        │
       │                          │<─────────────────────────┤
       │                          │                          │
       │                          │     9. JWKS public key   │
       │                          ├─────────────────────────>│
       │                          │                          │
       │                          │    10. Extract user key  │
       │                          │        from JWT          │
       │                          │                          │
       │                          │    11. Call VoiceLab API │
       │                          │     with per-user key    │
       │                          │                          │
┌──────┴──────┐                  │                   ┌──────┴──────┐
│ VoiceLab API│<─────────────────┼───────────────────│  Per-user   │
│   Backend   │                  │                   │  API Key    │
│             │                  │                   │vlk_user_xxx │
│  Charge     │                  │                   └─────────────┘
│  user_xxx   │                  │
│  account    │                  │
└─────────────┘                  │
```

---

## Migration from Auth0 (If Previously Used)

This implementation **does not use Auth0**. If you previously deployed Auth0 integration:

1. **Remove Auth0 environment variables**:
   ```bash
   unset AUTH0_DOMAIN AUTH0_AUDIENCE AUTH0_ISSUER
   ```

2. **Set VoiceLab OAuth variables**:
   ```bash
   export OAUTH_ISSUER=https://auth.voicelab.uz
   export OAUTH_AUDIENCE=https://mcp.voicelab.uz
   ```

3. **Update documentation references**: Remove Auth0 docs, use this guide.

4. **Restart MCP server**: OAuth now points to VoiceLab AS.

5. **Re-register with OpenAI**: ChatGPT will discover new OAuth endpoints.

---

## References

- [Backend OAuth Specification](../BACKEND_OAUTH_SPEC.md) — VoiceLab AS implementation guide
- [OpenAI Plugin Authentication](https://platform.openai.com/docs/plugins/authentication)
- [OAuth 2.1 (Draft)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-10)
- [RFC 9068: JWT Access Token Profile](https://datatracker.ietf.org/doc/html/rfc9068)
- [RFC 7636: PKCE](https://datatracker.ietf.org/doc/html/rfc7636)

---

## Support

- **MCP Server Issues**: Elzodxon Sharofaddinov <elzodxon@gmail.com>
- **Backend OAuth Implementation**: VoiceLab Backend Team via support@voicelab.uz
- **Documentation**: https://docs.voicelab.uz (to be updated with OAuth guide)
