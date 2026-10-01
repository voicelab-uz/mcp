# VoiceLab OAuth 2.1 Authorization Server Specification

**Target**: VoiceLab Backend Team  
**Purpose**: Enable OpenAI ChatGPT/Codex Plugin integration with per-user billing  
**Status**: Specification (backend implementation required)

---

## Executive Summary

VoiceLab must implement an **OAuth 2.1 Authorization Server** to enable OpenAI ChatGPT/Codex Plugin integration. OpenAI Plugins require OAuth 2.1 and do NOT support static API keys.

**Key Requirements**:
- Users authenticate via VoiceLab accounts (authorization-code + PKCE S256)
- On successful OAuth consent, mint or bind a per-user API key
- MCP resource server verifies VoiceLab-issued JWTs for tool authorization
- Per-user billing: each ChatGPT user's API calls charge their VoiceLab account

**Why Not Auth0**: Product decision to avoid third-party Auth0 dependency and ensure VoiceLab controls user-to-billing mapping directly.

---

## OAuth 2.1 Endpoints Required

VoiceLab backend must implement these endpoints at `https://auth.voicelab.uz` (or `https://api.voicelab.uz/oauth`):

### 1. OpenID Connect Discovery (Required)

**Endpoint**: `GET /.well-known/openid-configuration`  
**Purpose**: OpenAI and MCP discover OAuth endpoints automatically

**Response** (JSON):
```json
{
  "issuer": "https://auth.voicelab.uz",
  "authorization_endpoint": "https://auth.voicelab.uz/oauth/authorize",
  "token_endpoint": "https://auth.voicelab.uz/oauth/token",
  "jwks_uri": "https://auth.voicelab.uz/.well-known/jwks.json",
  "userinfo_endpoint": "https://auth.voicelab.uz/oauth/userinfo",
  "scopes_supported": ["openid", "email", "profile", "mcp:tools"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "claims_supported": ["sub", "email", "email_verified", "name", "picture", "iss", "aud", "exp", "iat"]
}
```

**Security**: Serve over HTTPS with proper CORS headers for OpenAI origins.

---

### 2. Authorization Endpoint (Required)

**Endpoint**: `GET /oauth/authorize`  
**Purpose**: Present VoiceLab login + OAuth consent screen

**Query Parameters**:
| Parameter | Required | Description |
|-----------|----------|-------------|
| `response_type` | Yes | Must be `code` |
| `client_id` | Yes | OpenAI's client ID (or DCR-registered client) |
| `redirect_uri` | Yes | `https://chat.openai.com/aip/callback` or `https://chatgpt.com/aip/callback` |
| `scope` | Yes | Space-separated scopes (e.g., `openid email mcp:tools`) |
| `state` | Yes | CSRF protection token from OpenAI |
| `code_challenge` | Yes | PKCE S256 code challenge |
| `code_challenge_method` | Yes | Must be `S256` |

**User Flow**:
1. If user not logged in → redirect to VoiceLab login
2. After login → show consent screen:
   ```
   OpenAI ChatGPT wants to:
   - Access your profile (name, email)
   - Use VoiceLab speech AI tools on your behalf
   - Charge your VoiceLab account for API usage
   
   [Allow] [Deny]
   ```
3. On Allow → mint authorization code + bind to user's VoiceLab account
4. Redirect back: `{redirect_uri}?code={auth_code}&state={state}`
5. On Deny → redirect: `{redirect_uri}?error=access_denied&state={state}`

**Authorization Code**:
- Short-lived (10 minutes)
- Single-use only
- Bound to `code_challenge` for PKCE verification
- Bound to VoiceLab user account ID

**Security**:
- Validate `redirect_uri` against allowlist (OpenAI URIs + any registered clients)
- Prevent CSRF via `state` parameter validation
- Store PKCE `code_challenge` with authorization code for later verification

---

### 3. Token Endpoint (Required)

**Endpoint**: `POST /oauth/token`  
**Purpose**: Exchange authorization code for access token (with PKCE verification)

**Request** (application/x-www-form-urlencoded):
```
grant_type=authorization_code
&code={authorization_code}
&redirect_uri={same_redirect_uri_from_authorize}
&client_id={client_id}
&code_verifier={pkce_code_verifier}
```

**PKCE Verification**:
```javascript
const challengeFromStorage = getStoredCodeChallenge(code);
const verifierHash = base64url(sha256(code_verifier));
if (verifierHash !== challengeFromStorage) {
  return { error: 'invalid_grant' };
}
```

**Success Response** (JSON):
```json
{
  "access_token": "vl_oauth_xxx",
  "token_type": "Bearer",
  "expires_in": 86400,
  "refresh_token": "vl_refresh_xxx",
  "scope": "openid email mcp:tools",
  "id_token": "{jwt_id_token}"
}
```

**Access Token Format**: JWT signed with RS256 (see JWT Claims below)

**Refresh Token Grant** (optional but recommended):
```
grant_type=refresh_token
&refresh_token={refresh_token}
&client_id={client_id}
```

**Security**:
- Verify authorization code is valid and not expired
- Verify code is bound to this `client_id` and `redirect_uri`
- Verify PKCE `code_verifier` against stored `code_challenge`
- Mark code as used (prevent replay)
- Rate limit token endpoint (10 req/min per IP)

---

### 4. JWKS Endpoint (Required)

**Endpoint**: `GET /.well-known/jwks.json`  
**Purpose**: Publish public keys for JWT signature verification

**Response** (JSON):
```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "kid": "voicelab-2026-01",
      "alg": "RS256",
      "n": "{rsa_modulus_base64url}",
      "e": "AQAB"
    }
  ]
}
```

**Key Management**:
- Use RS256 (RSA + SHA-256)
- Rotate keys every 90 days (keep old key for 30 days grace period)
- Each key must have unique `kid` (key ID)
- Private keys stored securely (HSM or KMS recommended)

**Security**:
- Serve with CORS `Access-Control-Allow-Origin: *` (public endpoint)
- Cache-Control: `max-age=3600` (clients cache for 1 hour)

---

### 5. UserInfo Endpoint (Recommended)

**Endpoint**: `GET /oauth/userinfo`  
**Purpose**: Fetch user profile details (OpenAI may call this)

**Request Headers**:
```
Authorization: Bearer {access_token}
```

**Response** (JSON):
```json
{
  "sub": "voicelab|user_12345",
  "email": "user@example.com",
  "email_verified": true,
  "name": "John Doe",
  "picture": "https://voicelab.uz/avatars/user_12345.jpg"
}
```

**Security**:
- Verify access token signature and expiry
- Return only claims user consented to

---

### 6. JWT Access Token Claims (Required)

Access tokens must be JWTs with these claims:

**Standard Claims**:
| Claim | Type | Description | Example |
|-------|------|-------------|---------|
| `iss` | string | Issuer (VoiceLab AS) | `https://auth.voicelab.uz` |
| `sub` | string | User ID (unique) | `voicelab\|user_12345` |
| `aud` | string | Audience (MCP resource) | `https://mcp.voicelab.uz` |
| `exp` | number | Expiration (Unix timestamp) | `1728000000` (24h from iat) |
| `iat` | number | Issued at (Unix timestamp) | `1727913600` |
| `scope` | string | Space-separated scopes | `openid email mcp:tools` |

**Custom Claims** (per-user billing):
| Claim | Type | Description | Example |
|-------|------|-------------|---------|
| `voicelab_api_key` | string | **User's VoiceLab API key** | `vlk_user_12345_abc` |
| `email` | string | User email | `user@example.com` |
| `name` | string | User display name | `John Doe` |
| `email_verified` | boolean | Email verified | `true` |

**Example JWT Payload**:
```json
{
  "iss": "https://auth.voicelab.uz",
  "sub": "voicelab|user_12345",
  "aud": "https://mcp.voicelab.uz",
  "exp": 1728000000,
  "iat": 1727913600,
  "scope": "openid email mcp:tools",
  "voicelab_api_key": "vlk_user_12345_abc",
  "email": "user@example.com",
  "name": "John Doe",
  "email_verified": true
}
```

**Critical**: The `voicelab_api_key` claim enables per-user billing. MCP extracts this key and uses it for VoiceLab API calls, charging the correct user.

---

## Per-User API Key Management

### Key Minting on OAuth Consent

When user approves OAuth consent:

1. **Check for existing API key**:
   ```sql
   SELECT api_key FROM user_api_keys WHERE user_id = ? AND scope = 'mcp_oauth';
   ```

2. **If no key exists, mint new one**:
   ```javascript
   const apiKey = `vlk_user_${userId}_${randomBytes(16).toString('hex')}`;
   await db.insert('user_api_keys', {
     user_id: userId,
     api_key: apiKey,
     scope: 'mcp_oauth',
     created_at: now(),
     expires_at: null // Long-lived key
   });
   ```

3. **Include key in JWT**:
   ```javascript
   const accessToken = jwt.sign({
     iss: 'https://auth.voicelab.uz',
     sub: `voicelab|${userId}`,
     aud: 'https://mcp.voicelab.uz',
     exp: Math.floor(Date.now() / 1000) + 86400, // 24h
     iat: Math.floor(Date.now() / 1000),
     scope: 'openid email mcp:tools',
     voicelab_api_key: apiKey,
     email: user.email,
     name: user.name,
     email_verified: user.emailVerified
   }, privateKey, { algorithm: 'RS256', keyid: 'voicelab-2026-01' });
   ```

### Key Validation in VoiceLab API

VoiceLab API must accept `vlk_user_*` keys and route charges to the owning user's account:

```javascript
// VoiceLab API: validate and resolve user
if (apiKey.startsWith('vlk_user_')) {
  const keyRecord = await db.query('SELECT user_id FROM user_api_keys WHERE api_key = ?', [apiKey]);
  if (!keyRecord) {
    return { error: 'invalid_api_key' };
  }
  const userId = keyRecord.user_id;
  // Charge this userId's account for the API call
  await billing.charge(userId, cost);
}
```

### Key Revocation

Users can revoke OAuth API keys in VoiceLab dashboard:

```javascript
// Dashboard: revoke OAuth API key
await db.query('DELETE FROM user_api_keys WHERE user_id = ? AND scope = "mcp_oauth"', [userId]);
// Future OAuth access tokens will mint a new key
```

---

## OpenAI Client Registration

### Option A: Pre-registered Client (Simple)

**Recommended for MVP**: Manually register OpenAI as a known client.

```javascript
// Backend config
const KNOWN_CLIENTS = {
  'openai-chatgpt': {
    client_id: 'openai-chatgpt',
    redirect_uris: [
      'https://chat.openai.com/aip/callback',
      'https://chatgpt.com/aip/callback'
    ],
    name: 'OpenAI ChatGPT',
    logo: 'https://openai.com/logo.png'
  }
};
```

### Option B: Dynamic Client Registration (DCR) (Advanced)

Implement RFC 7591 for OpenAI to auto-register:

**Endpoint**: `POST /oauth/register`  
**Request**:
```json
{
  "client_name": "OpenAI ChatGPT",
  "redirect_uris": ["https://chat.openai.com/aip/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_method": "none",
  "scope": "openid email mcp:tools"
}
```

**Response**:
```json
{
  "client_id": "generated_client_id",
  "client_id_issued_at": 1727913600,
  "client_name": "OpenAI ChatGPT",
  "redirect_uris": ["https://chat.openai.com/aip/callback"],
  "grant_types": ["authorization_code"],
  "token_endpoint_auth_method": "none"
}
```

---

## Security Checklist (OWASP Top 10)

### A01: Broken Access Control
- ✅ Validate `redirect_uri` against strict allowlist
- ✅ Bind authorization codes to `client_id` and `redirect_uri`
- ✅ Verify PKCE `code_verifier` on token exchange
- ✅ Single-use authorization codes (mark as used after exchange)

### A02: Cryptographic Failures
- ✅ Use RS256 for JWT signing (not HS256)
- ✅ Store private keys in HSM/KMS or encrypted at rest
- ✅ TLS 1.3 only for all OAuth endpoints
- ✅ Secure random for authorization codes (`crypto.randomBytes(32)`)

### A03: Injection
- ✅ Parameterized SQL queries (no string concatenation)
- ✅ Validate all query parameters (whitelist allowed values)
- ✅ Sanitize user-provided `redirect_uri` (strict URL validation)

### A04: Insecure Design
- ✅ PKCE S256 required (prevents authorization code interception)
- ✅ State parameter required (CSRF protection)
- ✅ Short-lived authorization codes (10 min)
- ✅ Reasonable access token expiry (24h)

### A05: Security Misconfiguration
- ✅ Disable debug logs in production (no token/key logging)
- ✅ Rate limiting on token endpoint (10 req/min per IP)
- ✅ CORS configured for OpenAI origins only
- ✅ Security headers (HSTS, CSP, X-Frame-Options: DENY)

### A07: Identification and Authentication Failures
- ✅ Strong password policy for VoiceLab accounts
- ✅ Optional: MFA for OAuth consent screen
- ✅ Session timeout on authorization endpoint (30 min)
- ✅ Logout invalidates session and refresh tokens

### A08: Software and Data Integrity Failures
- ✅ JWT signature verification on every API call
- ✅ Verify `iss`, `aud`, `exp` claims
- ✅ Key rotation with grace period (90d rotation, 30d overlap)

### A09: Security Logging and Monitoring
- ✅ Log all OAuth flows (authorize, token, userinfo)
- ✅ Log failed PKCE verification attempts
- ✅ Alert on unusual patterns (many failed authorizations from one IP)
- ✅ Include `request_id` in all logs

### A10: Server-Side Request Forgery (SSRF)
- ✅ Validate `redirect_uri` against allowlist (no open redirect)
- ✅ No user-controlled URLs in backend requests

---

## REST API Design Principles

### 1. Idempotency
- Token endpoint: Same `code` + `code_verifier` returns same error (code already used)
- Refresh token grant: Same `refresh_token` returns new access token (not idempotent by nature)

### 2. Statelessness
- JWTs are self-contained (no session lookup on every API call)
- MCP resource server verifies JWT signature + claims, no backend call to AS

### 3. HTTP Status Codes
| Code | Scenario |
|------|----------|
| `200 OK` | Successful token exchange |
| `302 Found` | Redirect after authorization |
| `400 Bad Request` | Invalid OAuth parameters |
| `401 Unauthorized` | Invalid/expired access token |
| `403 Forbidden` | User denied consent |
| `429 Too Many Requests` | Rate limit exceeded |
| `500 Internal Server Error` | AS failure (log and alert) |

### 4. Error Responses
Follow OAuth 2.0 error format:

```json
{
  "error": "invalid_grant",
  "error_description": "Authorization code has expired or been used",
  "error_uri": "https://docs.voicelab.uz/errors/invalid_grant"
}
```

Standard error codes:
- `invalid_request` - Missing/invalid parameter
- `invalid_client` - Unknown client_id
- `invalid_grant` - Code expired, used, or PKCE mismatch
- `unauthorized_client` - Client not allowed this grant type
- `unsupported_grant_type` - Only `authorization_code` and `refresh_token` supported
- `invalid_scope` - Requested scope not available

---

## Testing Requirements

### Unit Tests
- JWT signing and verification (RS256)
- PKCE S256 code_challenge generation and verification
- Authorization code expiration logic
- API key minting uniqueness

### Integration Tests
- Full OAuth flow: authorize → code → token → userinfo
- PKCE verification failure scenarios
- Authorization code replay attack (should fail)
- Expired token rejection by MCP resource server

### Security Tests
- SSRF via malicious `redirect_uri`
- Open redirect via unvalidated `redirect_uri`
- CSRF via missing/invalid `state`
- Authorization code interception (PKCE should protect)
- JWT signature tampering (should fail verification)

---

## Deployment Checklist

### Before Production Launch

- [ ] Generate RSA keypair for JWT signing (4096-bit minimum)
- [ ] Store private key in HSM/KMS (e.g., AWS KMS, GCP KMS, HashiCorp Vault)
- [ ] Publish public key at `/.well-known/jwks.json`
- [ ] Deploy OAuth endpoints at `https://auth.voicelab.uz` (or subdomain)
- [ ] Configure TLS 1.3 with valid certificate
- [ ] Set up rate limiting (nginx/API gateway)
- [ ] Enable logging and monitoring (Sentry, Datadog, etc.)
- [ ] Test OAuth flow end-to-end with curl/Postman
- [ ] Add OpenAI redirect URIs to allowlist
- [ ] Document user-facing OAuth consent screen
- [ ] Create user docs: "How to link ChatGPT to VoiceLab"

### Post-Launch Monitoring

- Monitor token endpoint response times (p50, p95, p99)
- Alert on failed authorization attempts spike (potential attack)
- Track daily active OAuth users
- Monitor per-user API key usage for billing validation

---

## Implementation Timeline Estimate

| Phase | Tasks | Estimated Effort |
|-------|-------|------------------|
| **Phase 1: Core OAuth** | Discovery, authorize, token, JWKS endpoints | 2-3 weeks |
| **Phase 2: Per-User API Keys** | Key minting, DB schema, billing integration | 1-2 weeks |
| **Phase 3: Security Hardening** | PKCE, rate limiting, logging, tests | 1 week |
| **Phase 4: UI/UX** | Consent screen, login flow, user docs | 1 week |
| **Total** | | **5-7 weeks** |

---

## References

- [OAuth 2.1 (Draft)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-10)
- [RFC 7636: PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
- [RFC 7591: Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)
- [RFC 9068: OAuth 2.0 Access Token JWT Profile](https://datatracker.ietf.org/doc/html/rfc9068)
- [OpenID Connect Discovery](https://openid.net/specs/openid-connect-discovery-1_0.html)
- [OpenAI Plugin Auth Docs](https://platform.openai.com/docs/plugins/authentication)
- [OWASP Top 10 2021](https://owasp.org/www-project-top-ten/)

---

## Questions for VoiceLab Team

1. **Preferred domain for OAuth AS**: `https://auth.voicelab.uz` or `https://api.voicelab.uz/oauth`?
2. **User account system**: Does VoiceLab already have user accounts with login? Or OAuth-only users?
3. **API key format**: Should OAuth keys follow `vlk_user_{id}_{random}` pattern or different?
4. **Billing integration**: How are API calls currently charged? Is there a `billing.charge(userId, cost)` method?
5. **Key rotation**: Acceptable downtime during JWT signing key rotation? (recommend 30-day overlap)
6. **Consent screen**: Any VoiceLab branding/legal requirements for OAuth consent UI?
7. **User revocation**: Should users be able to revoke OpenAI access from VoiceLab dashboard?
8. **Rate limits**: What limits per user for OAuth token requests? (recommend 10/min)

---

## Contact

- **MCP Implementation**: Elzodxon Sharofaddinov <elzodxon@gmail.com>
- **Backend OAuth Questions**: support@voicelab.uz
- **Documentation**: https://docs.voicelab.uz (to be updated with OAuth guide)
