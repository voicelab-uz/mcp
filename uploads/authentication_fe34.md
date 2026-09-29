Source: https://docs.voicelab.uz/api/authentication

# Authentication and API keys

Create scoped server credentials, manage their lifecycle, and mint short-lived tickets for realtime connections.

## API keys are server credentials

Every developer API request uses this header:

```http
Authorization: Bearer vlk_<your-secret>
```

API keys are intended for backend jobs, CLI tools, and private services. Do
not expose them in a browser bundle, mobile app, public Git repository, URL,
or client-side local storage. If a key is exposed, revoke it immediately and
create a replacement.

The backend stores only a hash of the secret. The plaintext secret is returned
once, when the key is created.

## Permission model

Use `GET /api/v1/account/api-key-permissions` to render the dashboard's key
editor. Only entries with `implemented: true` should be offered for selection:

| Permission | Levels | Gives access to |
| --- | --- | --- |
| `text_to_speech` | `none`, `read`, `write`, `access` | TTS generation and/or TTS history |
| `tts_realtime` | `none`, `access` | Realtime TTS tickets and WebSocket |
| `speech_to_text` | `none`, `read`, `write`, `access` | STT transcription and/or STT history |
| `stt_realtime` | `none`, `access` | Realtime STT tickets and WebSocket |
| `audio_isolation` | `none`, `read`, `write`, `access` | Voice Isolator jobs, retained audio, and exports |
| `llm` | `none`, `read`, `write`, `access` | Model discovery, chat completions, and LLM request status |
| `voices` | `none`, `read` | Voice catalog |

Meaning of levels:

- `none`: no access; omit it from the saved map or send it as `none`.
- `read`: list, inspect, or download existing resources. For Voice Isolator,
  requesting a new export conversion requires write access.
- `write`: create, edit, or delete resources.
- `access`: both read and write for TTS, STT, Voice Isolator, and LLM, or the complete access offered by
  a realtime/voices permission.

The permission endpoint also returns planned permissions with
`implemented: false`. Do not enable those in your UI yet. They are catalog
metadata, not permission to call an endpoint.

The current legacy scope equivalents are:

| Scope | Equivalent permission |
| --- | --- |
| `tts:read` | `text_to_speech: read` |
| `tts:write` | `text_to_speech: write` |
| `tts:realtime` | `tts_realtime: access` |
| `stt:read` | `speech_to_text: read` |
| `stt:write` | `speech_to_text: write` |
| `stt:realtime` | `stt_realtime: access` |
| `llm:read` | `llm: read` |
| `llm:write` | `llm: write` |
| `voices:read` | `voices: read` |
| `audio_isolation:read` | `audio_isolation: read` |
| `audio_isolation:write` | `audio_isolation: write` |

Use `permissions` for new integrations. `scopes` remains available for
backwards compatibility, but a request must not contain both.

## LLM access

For [LLM completions](https://docs.voicelab.uz/api/llm), grant `{"llm":"access"}` in the permission
map. Read access lists models and retrieves account-scoped request status.
Write access generates completions. A write-only key cannot read model prices
or inspect request usage; grant both for the complete workflow.

Existing unrestricted keys work. Restricted keys need an explicit LLM grant.
When editing a key, preserve its other required permissions: `permissions`
replaces the complete map. The compatibility scopes are `llm:read` and
`llm:write`.

Developer LLM endpoints require a server-side API key and spend credits.
Platform JWTs authorize Ask's `/api/v1/llm/*` and `/api/v1/chats/*` routes,
which remain uncharged; they cannot authorize developer completions.

## Voice Isolator access

For the complete [Voice Isolator workflow](https://docs.voicelab.uz/api/voice-isolator), grant
`audio_isolation: access` in the permission map. Read access lists jobs,
retrieves their status, and downloads available audio or exports. Write access
submits files or batches, requests new export conversions, and hides jobs.
A write-only key cannot poll results.

Restricted keys need an explicit grant; existing keys do not gain this permission
automatically. Unrestricted keys can use all implemented endpoints. Check the
permission catalog for support before offering Voice Isolator in a key editor.
The developer routes use `/v1/voice-isolations`; dashboard
`/api/v1/voice-isolations` routes require a user JWT.

Revoking a key blocks new access but does not cancel accepted jobs. Revoke keys
referenced by retained jobs instead of permanently deleting them.

## List permission and scope catalogs

These endpoints require a user access JWT, not a developer API key:

**GET https://api.voicelab.uz/api/v1/account/api-key-permissions**

List the current permission catalog for the API-key editor.

Authentication: `Bearer <USER_ACCESS_JWT>`.

**GET https://api.voicelab.uz/api/v1/account/api-key-scopes**

List legacy API-key scopes for backwards compatibility.

Authentication: `Bearer <USER_ACCESS_JWT>`.

Permission response:

```json
{
  "data": {
    "permissions": [
      {
        "id": "text_to_speech",
        "name": "Text to speech",
        "description": "Read TTS history and generate speech from text.",
        "levels": ["none", "read", "write", "access"],
        "implemented": true
      }
    ]
  },
  "request_id": "req_01J..."
}
```

Scope response:

```json
{
  "scopes": [
    {
      "id": "tts:write",
      "name": "TTS write",
      "description": "Create and delete TTS generations."
    }
  ],
  "request_id": "req_01J..."
}
```

## Create a key

**POST https://api.voicelab.uz/api/v1/account/api-keys**

Create a scoped developer API key with a user access JWT.

Authentication: `Bearer <USER_ACCESS_JWT>`.

Content-Type: `application/json`.

Example using permissions:

```json
{
  "name": "Production speech service",
  "permissions": {
    "text_to_speech": "access",
    "speech_to_text": "access",
    "tts_realtime": "access",
    "voices": "read"
  },
  "expires_at": null,
  "restrict_key": true,
  "credit_limit": null,
  "allowed_ips": ["203.0.113.10"],
  "auto_disable_if_leaked": true
}
```

Fields:

| Field | Required | Rules |
| --- | --- | --- |
| `name` | yes | 1–80 characters; control characters are rejected |
| `permissions` | no* | Map of supported permission IDs to levels; `{}` clears all access |
| `scopes` | no* | Legacy array; use this only when `permissions` is absent |
| `expires_at` | no | Future RFC3339 timestamp or `null` for no expiry |
| `restrict_key` | no | Defaults to `true` |
| `credit_limit` | no | Non-negative integer or `null` |
| `allowed_ips` | no | Up to 100 IPv4, IPv6, or CIDR entries |
| `auto_disable_if_leaked` | no | Defaults to `true` |

\* A key may be created with no product permissions, but it will not be able
to call product endpoints. For a useful key, select at least one implemented
permission.

Legacy request example:

```json
{
  "name": "Legacy TTS key",
  "scopes": ["tts:read", "tts:write", "voices:read"]
}
```

Do not send both `permissions` and `scopes`.

`201 Created`:

```json
{
  "data": {
    "key": {
      "id": "key_01J...",
      "name": "Production speech service",
      "masked_key": "vlk_••••••••9x2a",
      "prefix": "vlk_",
      "permissions": {
        "text_to_speech": "access",
        "speech_to_text": "access",
        "tts_realtime": "access",
        "voices": "read"
      },
      "scopes": ["tts:read", "tts:write", "tts:realtime", "stt:read", "stt:write", "voices:read"],
      "created_at": "2026-08-16T12:00:00Z",
      "last_used_at": null,
      "expires_at": null,
      "enabled": true,
      "revoked_at": null,
      "restrict_key": true,
      "credit_limit": null,
      "allowed_ips": ["203.0.113.10"],
      "auto_disable_if_leaked": true,
      "leaked_at": null
    },
    "secret": "vlk_<long-secret-returned-once>"
  },
  "request_id": "req_01J..."
}
```

Show the secret once and ask the user to copy it. It is never returned by
list, update, or any product endpoint.

## List keys

**GET https://api.voicelab.uz/api/v1/account/api-keys?limit=50&cursor=<opaque>**

List API keys with cursor pagination.

Authentication: `Bearer <USER_ACCESS_JWT>`.

`limit` defaults to 50 and must be 1–100. The response is:

```json
{
  "data": {
    "keys": [
      {
        "id": "key_01J...",
        "name": "Production speech service",
        "masked_key": "vlk_••••••••9x2a",
        "enabled": true,
        "created_at": "2026-08-16T12:00:00Z",
        "expires_at": null,
        "revoked_at": null,
        "permissions": {"text_to_speech": "access"}
      }
    ],
    "next_cursor": null
  },
  "request_id": "req_01J..."
}
```

## Edit a key

**PATCH https://api.voicelab.uz/api/v1/account/api-keys/{key_id}**

Update an API key's name, permissions, restrictions, or lifecycle settings.

Authentication: `Bearer <USER_ACCESS_JWT>`.

Content-Type: `application/json`.

The body is a partial update:

```json
{
  "name": "Production speech service v2",
  "enabled": true,
  "expires_at": "2027-08-16T00:00:00Z",
  "permissions": {
    "text_to_speech": "access",
    "tts_realtime": "access",
    "voices": "read"
  }
}
```

- Omitted fields stay unchanged.
- `expires_at: null` removes expiry. Omit it to keep the current expiry.
- `permissions` replaces the complete permission map. Omitted permissions are
  removed; `{}` removes all permissions.
- Use either `permissions` or legacy `scopes`, never both.
- The secret is never returned by `PATCH`.
- The update is atomic.

`200 OK` returns `{ "data": { "key": { ... } }, "request_id": "..." }`.

## Revoke versus delete

Revoke is the normal emergency or lifecycle action:

**POST https://api.voicelab.uz/api/v1/account/api-keys/{key_id}/revoke**

Immediately stop an API key from authenticating.

Authentication: `Bearer <USER_ACCESS_JWT>`.

`204 No Content` means the key stops authenticating immediately. Its metadata
and audit history remain available.

Delete is permanent:

**DELETE https://api.voicelab.uz/api/v1/account/api-keys/{key_id}**

Permanently delete an API-key record.

Authentication: `Bearer <USER_ACCESS_JWT>`.

`204 No Content` means the row was deleted. If existing work still references
the key, the API returns `409 api_key_in_use`; revoke it instead.

## Key-management errors

| Status | Code | Meaning |
| ---: | --- | --- |
| `400` | `invalid_json`, `validation_error`, `invalid_pagination` | Request or fields are invalid |
| `401` | `session_expired` | User JWT is missing, invalid, or expired |
| `403` | `origin_forbidden` | Browser origin is not allowed for this dashboard action |
| `404` | `not_found` | Key is not owned by this account |
| `409` | `api_key_in_use` | Permanent deletion is blocked by existing work |
| `500` | `internal_error` | Unexpected server error |
| `503` | `auth_unavailable`, `service_unavailable` | Required service is unavailable |
