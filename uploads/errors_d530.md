Source: https://docs.voicelab.uz/api/errors

# Errors, limits, and security

Handle stable error envelopes, retry safely, and protect API credentials in production.

## Error envelope

Standard JSON errors follow this shape:

```json
{
  "message": "A user-safe explanation.",
  "error": {
    "code": "stable_machine_code",
    "fields": {
      "language": "Choose a supported language."
    }
  },
  "request_id": "req_01J..."
}
```

`error.fields` is optional. Use `error.code` for program logic and show
`message` only when it is appropriate for your users. Never depend on exact
wording or parse the message.

LLM handler errors have a different message location:

```json
{
  "error": {
    "message": "LLM usage needs reconciliation. Contact support before making another request.",
    "type": "request_error",
    "code": "llm_usage_pending"
  },
  "request_id": "req_example"
}
```

Shared authentication errors can still use the standard envelope. LLM clients
must handle both. After SSE starts, an error can arrive inside a data event
while HTTP status remains `200`. See [LLM errors](https://docs.voicelab.uz/api/llm#errors).

## Common HTTP statuses

| Status | Meaning | What to do |
| ---: | --- | --- |
| `200` | Successful response or stream opened | Read the response; LLM SSE must finish with `[DONE]` |
| `201` | Resource or realtime ticket created | Store the returned ID/ticket |
| `202` | STT or Voice Isolator work accepted for background processing | Poll the returned resource or export |
| `204` | Successful request with no body | Mark the resource deleted/revoked |
| `400` | Malformed JSON, multipart, cursor, or idempotency key | Correct the request |
| `401` | Missing, invalid, expired, disabled, or revoked credential | Replace or refresh the credential |
| `402` | Insufficient credits or API-key credit limit | Check the balance and the key's configured limit |
| `403` | Scope, IP, or origin policy denied the request | Change the key policy; do not retry unchanged |
| `404` | Resource or feature is not available | Refresh IDs/catalog; do not guess a route |
| `409` | Idempotency, edit, or resource state conflict | Follow the endpoint-specific recovery |
| `413` | Body or audio is too large | Upload a smaller payload |
| `415` | Media type is unsupported | Use a supported audio format |
| `422` | Unsupported fields, model settings, or audio | Read `error.code` and any `error.fields`; correct the request |
| `429` | Rate or capacity limit | Wait for `Retry-After` when present |
| `500` | Unexpected server error | Retry only with the same idempotency key |
| `503` | Dependency outage or unresolved LLM usage | Inspect the code; `llm_model_temporarily_unavailable` / legacy `llm_usage_pending` require support, otherwise follow endpoint retry rules |

Do not blindly retry `POST` requests without an idempotency key. For TTS,
STT, and Voice Isolator uploads, retries after a timeout should reuse the same
key and identical input, including processing options.

For LLM completions, identical retries with the same key return
`409 request_already_submitted` and `X-LLM-Request-ID`. No response is replayed
and no new generation starts. Read the original request's status. A changed
body with the same key returns `409 idempotency_conflict`. See
[LLM retry rules](https://docs.voicelab.uz/api/llm#idempotency-and-retries).

## Rate limits and backoff

The exact account policy can vary. When the response includes `Retry-After`,
wait at least that many seconds. For retryable errors, otherwise use exponential backoff with jitter,
for example 1s, 2s, 4s, then stop after a small number of attempts.

Do not retry:

- `401`, `403`, `404`, or validation `422` without changing the request;
- an idempotency conflict with the same changed payload;
- a permanently revoked key;
- any error explicitly marked `retryable:false`;
- `llm_model_temporarily_unavailable` or legacy `llm_usage_pending`, which requires
  support reconciliation rather than waiting for a cooldown.

## Voice Isolator errors and limits

[Voice Isolator](https://docs.voicelab.uz/api/voice-isolator) accepts up to 300 MiB of uploaded audio,
or that combined total for a batch of 1–4 files. Each file must contain at least
0.5 seconds of decodable audio. There is no separate maximum recording duration;
decode resource budgets and processing timeouts still apply.

| Status | Code | Recovery |
| ---: | --- | --- |
| `402` | `insufficient_credits` | Add enough account credits for the request |
| `402` | `api_key_credit_limit` | Check the key limit, recorded billable usage, and pending Voice Isolator reservations |
| `404` | `voice_isolation_disabled`, `not_found` | Check feature availability and account ownership |
| `409` | `idempotency_conflict` | Reuse the original input for a retry; use a fresh UUID for changed audio, title, or options |
| `409` | `audio_not_ready` | Continue polling before requesting an export |
| `413` | `audio_too_large` | Reduce the uploaded audio size |
| `422` | `invalid_audio`, `invalid_speech_restoration`, `invalid_restoration_model`, `invalid_export_format` | Correct the audio or options described in the endpoint reference |
| `429` | `queue_full` | Wait for capacity and respect `Retry-After` |
| `503` | `voice_isolation_unavailable`, `speech_restoration_unavailable` | Retry after `Retry-After`; changed processing options require a new idempotency key |

A job with `status=completed` may still have a pending MP3 export. Wait for
`audio_status=completed` and `audio_url` before downloading the default result.
Refresh the job to get fresh signed URLs, and do not send an API key to storage
URLs. Deleting a job only hides it from history; it does not erase stored audio
or cancel accepted work.

## API-key security checklist

- Store keys in a server-side secret manager.
- Give each service its own key and the smallest permissions it needs.
- Set `expires_at` for temporary or employee-owned integrations.
- Set `allowed_ips` for fixed server egress addresses.
- Keep `restrict_key` and `auto_disable_if_leaked` enabled unless you have a
  documented reason not to.
- Revoke a leaked key immediately; do not wait for expiration.
- Do not put API keys in Git, Docker images, frontend JavaScript, URLs, query
  strings, analytics events, or exception messages.
- Treat signed audio URLs and realtime tickets as secrets too.
- Keep `request_id` when reporting a failure, but never include credentials in
  support logs.

## Ownership and privacy

Every API-key request is owner-scoped. A key from account A cannot read or
delete account B's TTS generations, STT transcriptions, voices, or audio.

Audio URLs are short-lived and private. Download the object when needed rather
than storing the URL permanently. The API never returns provider credentials,
internal model names, raw upstream responses, or account IDs in normal product
responses.

## What is not a developer API yet

The following are first-party VoiceLab or operator surfaces, not part of the
server-to-server API-key contract:

- `/api/v1/account/*` product/profile and voice-cloning workflows, except the
  API-key management and dashboard analytics endpoints documented here;
- `/api/v1/voice-isolations*` dashboard JWT routes; use the documented
  `/v1/voice-isolations` developer API instead;
- `/api/v1/llm/*` and `/api/v1/chats/*` JWT-only Ask routes; use the [LLM developer API](https://docs.voicelab.uz/api/llm) for server integrations;
- `/api/v1/voice-agent/*` website/LiveKit voice-agent session routes;
- `/api/v1/public-preview/*` anonymous preview routes;
- retired TTS job aliases and retired subtitle list/download aliases;
- arbitrary LiveKit token generation.

Do not call undocumented routes or rely on the legacy catch-all proxy. A new
developer capability should be added to the `/v1` API with an explicit scope,
an owner-scoped contract, idempotency rules where needed, and documentation.
