Source: https://docs.voicelab.uz/api/llm

# LLM API

Generate text and function calls with a server-side developer API key. Choose a
model, send your conversation, and receive a JSON completion or an SSE stream.
Completions spend VoiceLab credits based on token usage. Model discovery and
request-status lookups are free.

## Authentication

Send `Authorization: Bearer $VOICELAB_API_KEY`. Restricted keys need
`{"llm":"access"}` in their permission map for the complete workflow.
The compatibility scopes are `llm:read` for models and request status, and
`llm:write` for completions. Existing unrestricted keys can use these routes.
See [API-key permissions](https://docs.voicelab.uz/api/authentication#llm-access).

The developer API uses `/v1`. Ask's `/api/v1/llm/*` and `/api/v1/chats/*`
routes require a platform JWT and remain uncharged. Developer completions use
the messages you supply; they do not add Ask's prompts, knowledge, or history.

## List models

**GET https://api.voicelab.uz/v1/models**

List configured, priced models and their effective API limits. Requires llm:read.

Authentication: `Bearer <VOICELAB_API_KEY>`.

```bash
curl -fS 'https://api.voicelab.uz/v1/models' \
  -H "Authorization: Bearer $VOICELAB_API_KEY"
```

The response is an object with `object: "list"` and a `data` array. Each entry
contains:

| Field | Meaning |
| --- | --- |
| `id` | Public model ID to send in a completion request |
| `object` | `model` |
| `name`, `description` | Optional display metadata |
| `parameters`, `context_window` | Optional model parameter count and context capacity |
| `owned_by` | `voicelab` |
| `created` | `0`; no model creation timestamp is supplied |
| `pricing.version`, `pricing.model` | Active price version and public model ID |
| `pricing.input_usd_cents_per_million_tokens` | Input price in USD cents per million tokens |
| `pricing.output_usd_cents_per_million_tokens` | Output price in USD cents per million tokens |
| `pricing.credits_per_usd` | Conversion used for this price version |
| `limits.max_input_bytes` | Effective serialized messages/tools limit, currently `65536` |
| `limits.max_output_tokens` | Effective output-token limit, currently `4096` |

Resolve model IDs and prices from this response. The examples below use
`aisha-comet`; use a model returned for your account. Only configured models
with active pricing appear. A model's context capacity does not override the
[endpoint limits](https://docs.voicelab.uz/api/llm#limits).

## Create a chat completion

**POST https://api.voicelab.uz/v1/chat/completions**

Generate a text or function-call completion, billed in credits. Requires llm:write.

Authentication: `Bearer <VOICELAB_API_KEY>`.

Content-Type: `application/json`.

```bash
curl -fS -D llm-response.headers 'https://api.voicelab.uz/v1/chat/completions' \
  -H "Authorization: Bearer $VOICELAB_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: hello-turn-001' \
  -d '{
    "model": "aisha-comet",
    "messages": [
      {"role": "system", "content": "Answer briefly."},
      {"role": "user", "content": "Salom!"}
    ],
    "max_tokens": 128
  }'
```

### Request fields

| Field | Required | Rules |
| --- | --- | --- |
| `model` | yes | Public ID from `GET /v1/models` |
| `messages` | yes | 1 to 101 messages with `role` and text `content` |
| `stream` | no | Boolean; defaults to `false` |
| `stream_options.include_usage` | no | Set to `true` for a final SSE usage chunk |
| `max_tokens` | no | Integer from 1 to 4096; defaults to 1024 |
| `max_completion_tokens` | no | Alias for `max_tokens`; send only one of these fields |
| `temperature` | no | Number from 0 to 2; model support varies |
| `top_p` | no | Number from 0 to 1; model support varies |
| `stop` | no | One string or 1 to 4 strings, each 1 to 200 bytes |
| `seed` | no | Integer; model support varies |
| `n` | no | Only `1` is accepted |
| `tools` | no | Up to 32 function definitions; see [function calls](https://docs.voicelab.uz/api/llm#function-calls) |
| `tool_choice` | no | `auto`, `none`, `required`, or a supplied function selector |
| `parallel_tool_calls` | no | Boolean; model support varies |
| `thinking` | no | Boolean reasoning control; send at most one reasoning control |
| `reasoning` | no | Object with `enabled` boolean and optional `effort` |
| `reasoning_effort` | no | `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`, subject to model support |

Messages support `system`, `user`, `assistant`, and `tool` roles. Content must
be UTF-8 text; images, audio, attachments, and content-part arrays are unsupported.
An assistant message with function calls may have empty content. Tool messages
must include `tool_call_id` matching a preceding assistant call.

Choose at most one of `thinking`, `reasoning`, or `reasoning_effort`. The
`reasoning.effort` field accepts the same effort names as `reasoning_effort`.
Some models map lower reasoning settings to a lower effort rather than disabling
reasoning. Unknown fields, provider URLs/keys, and multiple choices are rejected.

`thinking: false` is supported. With the current model configuration, Comet
maps it to disabled reasoning, while Orbit and Halo map it to low reasoning
effort, not a guarantee of zero reasoning tokens. Do not combine it with
`reasoning` or `reasoning_effort`. It can reduce reasoning work but does not
promise a particular time to first token.

### JSON response

With `stream: false`, a successful `200` response has this shape. Values are
illustrative:

```json
{
  "id": "chatcmpl_example",
  "object": "chat.completion",
  "created": 1788998400,
  "model": "aisha-comet",
  "choices": [
    {
      "index": 0,
      "message": {"role": "assistant", "content": "Salom!"},
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 4,
    "total_tokens": 24
  }
}
```

`created` is Unix time in seconds. `message.content` can be `null` for a
tool-only response; `message.tool_calls` and `message.reasoning_content` are
optional. Finish reasons are `stop`, `length`, `tool_calls`, or `content_filter`.
Usage may also contain `prompt_tokens_details.cached_tokens` and
`completion_tokens_details.reasoning_tokens`.

Read `X-LLM-Request-ID` from the response headers for the billable request ID.
It matches the completion `id`. `X-Credits-Charged` reports the whole credits
debited when billing is settled. A completed answer with unverified usage can
instead return `usage: null` and `X-LLM-Billing-Status: pending`, without
`X-Credits-Charged`. Unknown usage is not zero cost. Successful LLM bodies have no generic `request_id`
wrapper; the HTTP trace ID in error bodies is separate from the LLM request ID.

## Stream a completion

Use the same completion endpoint with `stream: true`. `curl -N` displays SSE
events as they arrive:

```bash
curl -fS -N -D llm-stream.headers 'https://api.voicelab.uz/v1/chat/completions' \
  -H "Authorization: Bearer $VOICELAB_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: hello-stream-001' \
  -d '{
    "model": "aisha-comet",
    "messages": [{"role": "user", "content": "Say hello."}],
    "max_tokens": 128,
    "stream": true,
    "stream_options": {"include_usage": true}
  }'
```

The response uses `Content-Type: text/event-stream`. Events are separated by
a blank line. An illustrative stream is:

```text
data: {"id":"chatcmpl_example","object":"chat.completion.chunk","model":"aisha-comet","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello!"},"finish_reason":null}],"created":1788998400}

data: {"id":"chatcmpl_example","object":"chat.completion.chunk","model":"aisha-comet","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"created":1788998400}

data: {"id":"chatcmpl_example","object":"chat.completion.chunk","model":"aisha-comet","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12},"created":1788998400}

data: [DONE]
```

Append `choices[].delta.content` as it arrives. Reasoning can arrive in
`delta.reasoning_content`. Assemble function-call arguments from fragments
using each `delta.tool_calls[].index`. A network read may split or combine
events, so parse SSE boundaries rather than assuming one read is one event.

The final usage chunk appears only with `stream_options.include_usage: true`.
`[DONE]` is sent after a complete answer and either credit settlement or durable
recording of unresolved usage. A usage footer can contain `usage: null` when
counts are unverified. An HTTP `200` alone does
not prove a stream completed: it can end with an `llm_request_incomplete` error
event and no `[DONE]`, or disconnect. Read the error inside the SSE data, retain
`X-LLM-Request-ID`, and check [request status](https://docs.voicelab.uz/api/llm#get-request-status) before retrying.
Streaming responses do not provide `X-Credits-Charged`; use request status for
the settled charge.

HTTP headers cannot change after streaming has started. Treat any SSE `error`
as failure, even with HTTP `200`; an EOF without `[DONE]` is also incomplete.
Do not execute partial tool-call arguments from an incomplete stream. Streaming
failures are recorded separately from the wire HTTP status in request analytics.

## Function calls

Supply functions as data. Your application validates and executes the selected
function; VoiceLab does not run it. This completion request asks the model to
call one function:

```json
{
  "model": "aisha-comet",
  "messages": [{"role": "user", "content": "What is the weather in Tashkent?"}],
  "max_tokens": 256,
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get current weather for a city.",
        "parameters": {
          "type": "object",
          "properties": {"city": {"type": "string"}},
          "required": ["city"]
        }
      }
    }
  ],
  "tool_choice": {"type": "function", "function": {"name": "get_weather"}}
}
```

Function names must be unique and match `[a-zA-Z0-9_-]{1,64}`. Each function's
`parameters` must be a JSON object schema. `tool_choice: "required"` requires
at least one tool; a named selector must refer to a supplied function.

After executing a returned call, send a new completion request with the original
messages, the assistant's calls, and a `tool` result for every call. Use the
actual call IDs and arguments returned by the model. For example:

```json
{
  "model": "aisha-comet",
  "max_tokens": 256,
  "messages": [
    {"role": "user", "content": "What is the weather in Tashkent?"},
    {
      "role": "assistant",
      "content": "",
      "tool_calls": [
        {
          "id": "call_example",
          "type": "function",
          "function": {"name": "get_weather", "arguments": "{\"city\":\"Tashkent\"}"}
        }
      ]
    },
    {"role": "tool", "tool_call_id": "call_example", "content": "{\"temperature_c\":28}"}
  ]
}
```

Function arguments are a JSON-encoded string. Complete all pending tool results
before adding another conversation message. The follow-up is a new paid
generation and needs a new idempotency key. Resending history and tool results
adds input tokens to that request.

## Get request status

**GET https://api.voicelab.uz/v1/llm/requests/{id}**

Read account-scoped LLM status, token usage, and credit details. Requires llm:read.

Authentication: `Bearer <VOICELAB_API_KEY>`.

Use the `X-LLM-Request-ID` captured from a completion response:

```bash
curl -fS "https://api.voicelab.uz/v1/llm/requests/$LLM_REQUEST_ID" \
  -H "Authorization: Bearer $VOICELAB_API_KEY"
```

The response is a plain object with these fields:

| Field | Meaning |
| --- | --- |
| `id`, `model` | LLM request ID and public model ID |
| `status` | `running`, `completed`, `failed`, `usage_pending`, or `waived` |
| `reserved_credits` | Whole credits reserved before generation |
| `charged_credits` | Whole credits debited; nullable until settlement |
| `credit_units` | Exact request charge in fractional credit units; nullable |
| `credit_unit_scale` | `100000000` units per credit |
| `prompt_tokens`, `completion_tokens` | Reported input/output counts; nullable |
| `cached_tokens`, `reasoning_tokens` | Optional token details represented as nullable counts |
| `elapsed_ms`, `ttft_ms` | Elapsed time and time to first text token in milliseconds; nullable |
| `price_version` | Price version retained for this request |
| `created_at` | RFC3339 timestamp |
| `failure_code` | Optional sanitized diagnostic code, when known |
| `resolution_required` | `true` when usage requires reconciliation |

Nullable values mean the corresponding result is not available. A `failed`
request can still have a charge when usage is known. `usage_pending` means
usage needs reconciliation; contact support with the LLM request ID.
`waived` means support has resolved the unknown charge by waiving it.

Only requests belonging to the authenticated account are returned. The endpoint
does not return completion text, prompts, reasoning, tool contents, or a full
price object. Developer conversation content is not retained in chat tables
or request logs. Save responses in your application if you need them later.

## Idempotency and retries

Send `Idempotency-Key` for every logical completion request. The header is
optional, but without it every call starts a new request. Use 1 to 200 printable
ASCII characters with no spaces or control characters. Keys are scoped to the
account and API key.

| Retry | Result |
| --- | --- |
| Same key and same request body | `409 request_already_submitted`; no second generation or charge |
| Same key with changed input or options | `409 idempotency_conflict` |
| New key | A new generation, subject to admission and billing checks |

Both `409` responses include the original `X-LLM-Request-ID`. Read its status;
the API does not store or replay the completion. Keep the same body and key for
transport retries. Use a new key only for an intentionally new generation.

A broken stream, disconnect, or missing final usage can leave a request in
`usage_pending`. Independent requests can continue while balance, concurrency
and unresolved-exposure limits allow. Exposure is capped at eight unsettled
requests per account and upstream model (including active requests). At that
limit, new calls for the affected model return `503 llm_model_temporarily_unavailable`,
`error.retryable: false`, with no `Retry-After`. This is an accounting hold, not
a timed provider cooldown: support must reconcile or explicitly resolve it.
Other models have their own limits, so accumulating unresolved requests on all
three can block all three for one account. Switching keys does not bypass it.
Ask and other products are outside this developer-LLM hold.

A request proven not to have been sent upstream is recorded as `failed` with
`failure_code: not_dispatched`, its reservation released, without consuming an
unresolved slot. A disconnect after dispatch is ambiguous: neither zero visible
tokens nor an upstream `499` proves zero cost. The API cancels upstream work on
client disconnect and does not silently start another generation. Existing
pending records are not automatically cleared by this transport fix.

## Billing

Read current rates from `GET /v1/models`. Before generation, VoiceLab reserves
a conservative input budget plus the maximum output budget and checks the
API key's credit limit. This can require more balance than the final charge.
Actual reported usage settles the charge and releases unused reserved credits.
Each request retains its original price version.

Input includes messages, history, function definitions, and tool results. Output
includes generated function arguments and reported reasoning tokens. Reasoning
tokens count once within completion tokens; cached input uses the normal input
rate. Lower visible output does not necessarily mean lower reasoning usage.

Fractions accumulate per account at 1/100,000,000 of a credit. A small request
can debit zero whole credits while adding fractional usage. Whole credits debit
when the accumulated amount crosses a whole-credit boundary. Unlimited platform
plans do not bypass developer LLM billing.

See [pricing](https://docs.voicelab.uz/guide/pricing#llm-billing) and
[LLM analytics](https://docs.voicelab.uz/api/analytics#llm-usage) for usage tracking.

## Limits

| Limit | Value |
| --- | --- |
| HTTP request body | 128 KiB |
| Serialized messages and tools | 64 KiB |
| Messages | 1 to 101 |
| Function definitions | Up to 32 |
| Output tokens | 1 to 4096; default 1024 |
| Completion timeout | 120 seconds |
| Concurrent generations | 2 per account across API replicas |

Rate and capacity limits also apply. Respect `Retry-After` when present.

The two-generation limit includes parallel activities such as replying and
extracting facts; queue a third request client-side instead of retrying in a
tight loop. 64 KiB means 65,536 bytes of serialized messages/tools, not tokens
or characters. The 4,096-token output cap is an API limit, not model context size.

The upstream response-header wait shares the 120-second generation budget;
connection establishment still fails fast. Set your client deadline with room
for this budget and network overhead if you want to allow the full generation.
A shorter deadline intentionally cancels it. Streaming reduces time to first
visible text, not necessarily full-generation time. Provider queueing and model
generation are distinct from Go admission, database and response-forwarding
overhead; a sub-30ms backend overhead target is not a verified latency guarantee.

## Errors

LLM handler errors use this envelope:

```json
{
  "error": {
    "message": "This request was already submitted. Check X-LLM-Request-ID; no new generation was started.",
    "type": "request_error",
    "code": "request_already_submitted"
  },
  "request_id": "req_example"
}
```

Shared authentication failures can use the [standard error envelope](https://docs.voicelab.uz/api/errors)
with a top-level `message`. Read `error.code` for program logic and handle both
message locations.

| Status | Code | Recovery |
| --- | --- | --- |
| `400` | `invalid_request` | Correct JSON, fields, limits, content type, or idempotency key |
| `401` | `invalid_api_key` | Replace or correct the developer key |
| `403` | `insufficient_scope` | Grant the required LLM permission |
| `402` | `insufficient_credits`, `api_key_credit_limit` | Check balance, key limit, and maximum token budget |
| `404` | `not_found` | Refresh models or verify the request ID and account |
| `409` | `request_already_submitted`, `idempotency_conflict` | Read the original request status using `X-LLM-Request-ID` |
| `422` | `llm_request_unsupported` | Change settings unsupported by the selected model |
| `429` | `rate_limited` | Respect `Retry-After` when present |
| `503` | `llm_usage_pending` | Contact support; do not automatically retry |
| `503` | `llm_model_temporarily_unavailable` | Account/model unresolved-usage hold; `retryable:false`, contact support; waiting does not reset it |
| `503` | `llm_unavailable` | Check any admitted request's status before a same-key retry |
| `502` | `llm_upstream_canceled` | Upstream cancellation is ambiguous; inspect the request's usage state before retrying |

After SSE starts, an error can arrive as a data event with
`error.code: "llm_request_incomplete"` while HTTP status remains `200`. A stream
without `[DONE]` is incomplete. Retain both the HTTP trace `request_id`, when
available, and `X-LLM-Request-ID` for support.
