# PostHog MCP analytics

The production Node MCP server can use the official pinned `@posthog/mcp` SDK
with one process-wide `posthog-node` client. Each per-request low-level server is
instrumented before it accepts requests. The legacy Cloudflare entry point is not
the production deployment and is unchanged.

## Configuration

Use server environment values, never frontend `NEXT_PUBLIC_*` values or hardcoded
tokens. The target PostHog project is 606234; obtain its token and ingestion origin
from that project's settings.

```dotenv
POSTHOG_MCP_ENABLED=1
POSTHOG_PROJECT_TOKEN=<project-token>
POSTHOG_HOST=<https-ingestion-origin>
POSTHOG_SERVER_BUILD=<immutable-git-sha>
```

Without explicit enablement analytics is disabled. Enabled configuration requires
both token and a valid HTTPS ingestion origin. The queue is bounded to 1000 events,
flushes every 10 seconds or 20 events, and gets up to 5 seconds to flush on SIGTERM,
SIGINT or normal process exit. Product API credentials are not reused for analytics.

The beta SDK is pinned to `@posthog/mcp` 0.25.0 and `posthog-node` 5.61.1.
Its Node requirement is `^20.20.0 || >=22.22.0`. The original 5090 runtime has Node 22.20.0. The analytics release uses a dedicated,
checksum-verified Node 22.23.4 under `/opt/mcp/runtimes`; global Node is unchanged.

## Captured data

The official SDK emits `$mcp_tool_call` with tool name, server/client metadata,
reported model when available, duration, and error state. Initialization and tool
listing events also support discoverability analysis. A verified OAuth subject
maps to the same opaque VoiceLab account; email, name, JWT and product API key are
not attached. Legacy callers have no verified person identity.

`resolveOriginalTool` supplies the original schema on every stateless request,
so SDK-owned model/conversation arguments are removed before the unchanged handler
runs even when the instance has not served `tools/list`.

Arguments/results retain useful bounded structure: language, model, format,
status, safe error codes, counts, token counts, audio duration, numerical options
and boolean settings. JSON response content blocks are parsed once for this
summary. Free text, prompts, transcripts, names, emails, URLs, audio bytes, payment
or resource IDs, unknown fields and credentials are removed or replaced with
redaction stubs. Nested text is never reparsed as trusted response structure.
Payloads are depth/width/length bounded. Tool handlers receive their original
arguments and return their original results; redaction only affects telemetry.

Raw error messages, free-form agent intent, exception payloads and raw
conversation handles are not sent. Session correlation is retained through a
stable locally hashed UUID rather than exporting a transport/session token.
Agent-written `context` is disabled, and model self-report is not verified and
must not be used for authorization or billing. GeoIP and exception autocapture
are disabled. This telemetry is diagnostic and best effort, not an accounting
ledger or guaranteed record of every call.

## 5090 deployment inventory and scoped candidate

Read-only inventory on 2026-11-02 found:

- Host: `31.40.29.33`, private address `192.168.100.101`.
- Service: `voicelab-mcp.service`, owner/group `aisha`.
- Working directory: `/opt/mcp`.
- Entry point: `/usr/local/bin/node /opt/mcp/dist/index.js --http`.
- Environment file: `/opt/mcp/.env` (owner-only, aisha).
- Live `src/index.ts` and `src/tools.ts` match repository commit `0c76aed`.

The source and executing binaries differ: disk TypeScript is old, but all 25
executing JavaScript modules match a clean main (`3902a2b`) build. Rebuilding the
old source would remove two existing file tools. The source-only
`scripts/5090-analytics.patch` and its manifest are reconstruction/audit artifacts;
**do not promote a whole build from that stale source**.

Use `scripts/prepare-5090-runtime.py` and `5090-runtime.manifest.json` for the actual
runtime candidate. They verify every executing JavaScript baseline hash, preserve
live compiled files, and stage matching main source. After building, exactly
`dist/index.js` and `dist/server.js` change and `dist/analytics.js` is added;
all 23 other existing JavaScript modules remain byte-identical. Tool parity checks
compare all 35 original descriptors and argument schemas after removing only the
SDK's added model/conversation arguments.

The ordinary `elzodxon` SSH account has no sudo rule. User-authorized root access
was obtained through `su`, then separately authorized additive SSH keys provided
key-based root access. The service continues to run as aisha. No sshd policy or
global Node settings were changed. Temporary password/ASKPASS files were deleted
once key access was verified.

For future releases, stage the runtime candidate, verify executing baseline
hashes, install pinned dependencies under the service owner's permissions, use a
supported dedicated Node runtime and set analytics variables privately. Validate a synthetic tool call
in a staging/test project first. During authorized promotion retain the old build,
Node path and environment for rollback. Restart only the MCP service and check
health, OAuth negotiation, tools/list and safe read-only calls. Reconcile a
synthetic success and deliberate validation error with PostHog before declaring
production telemetry live.

## Validation

Tests exercise the real SDK over paired MCP in-memory transports: success and
error events, duration, verified identity, fresh-server calls without tools/list,
unchanged handler arguments, and removal of private request/result content.
Additional tests cover opt-in configuration, nested JSON text, credentials/IPs,
unknown field names and stable session hashing without raw conversation handles.

References:

- [Official TypeScript installation](https://posthog.com/docs/mcp-analytics/installation/typescript)
- [Privacy and redaction](https://posthog.com/docs/mcp-analytics/privacy)
- [Event contract](https://posthog.com/docs/mcp-analytics/events)
- [Identity mapping](https://posthog.com/docs/mcp-analytics/identifying-users)

## Privileged operator promotion and rollback

These are actions for the existing service owner/admin; they were not executed.
Do not change global Node or any other service.

1. Verify the bundle SHA256, then run `prepare-5090-runtime.py --source-archive
<matching-source.tar.gz> --stage <fresh-path>` against `/opt/mcp`. It refuses
   executing-binary drift and copies no credentials. Never build from the stale
   disk TypeScript source without first restoring source matching the runtime.
2. Provision a supported, checksum-verified Node binary in a dedicated MCP-only
   directory such as `/opt/mcp/runtime-node/`. Keep `/usr/local/bin/node` intact.
3. In an aisha-owned release directory, combine the staged patched source with
   the existing unchanged application files. Run `npm ci`, `npm run build` and
   `npm run test:unit` using that dedicated Node. Compare every original runtime
   hash: only index/server may differ, with analytics added. Latest-main source
   is appropriate only after its clean build is proven to match the actual
   executing baseline; source filenames/version strings alone are insufficient.
4. Privately create `/opt/mcp/posthog.env`, owner aisha and mode 0600, with the
   four analytics variables above. Preserve `/opt/mcp/.env` unchanged. First point
   at an isolated test project while testing a staged loopback-only MCP process;
   switch only the analytics file to project 606234 after verification.
5. Save a private rollback copy of the MCP unit/drop-ins and their original
   `WorkingDirectory`, `ExecStart` and environment file paths. Retain the current
   `/opt/mcp/dist` and dependency tree untouched. Add a scoped MCP drop-in:

   ```ini
   [Service]
   WorkingDirectory=/opt/mcp/releases/<candidate>
   ExecStart=
   ExecStart=/opt/mcp/runtime-node/bin/node /opt/mcp/releases/<candidate>/dist/index.js --http
   EnvironmentFile=/opt/mcp/posthog.env
   ```

   The original unit's `/opt/mcp/.env` remains loaded; the additional file contains
   only PostHog settings. Check the resolved unit before restart.

6. During the authorized MCP release window, reload systemd and restart only
   `voicelab-mcp.service`. Check local/public health, OAuth, tool discovery, a safe
   synthetic success and an intentional validation error. Verify corresponding
   `$mcp_tool_call` records in PostHog, safe redaction and queue delivery.
7. If checks fail, restore the recorded original MCP drop-ins/unit paths, reload
   systemd and restart only that service. Because the old `/opt/mcp/dist`, old
   Node and old dependency tree were not overwritten, rollback uses the original
   executable. Recheck health/OAuth and leave analytics disabled until corrected.

The compiled bundle contains platform-independent JavaScript for index/server
and new analytics only, plus baseline manifests, source and runbook. It contains no Node executable,
node_modules, `.env`, API credentials or customer data. Dependency installation
and supported Node provisioning remain explicit operator steps.

## Verified production release

On 2026-11-02 (Asia/Tashkent), analytics build `132049b` was promoted to
`/opt/mcp/releases/posthog-132049b-runtime` using MCP-only drop-in
`/etc/systemd/system/voicelab-mcp.service.d/90-posthog-analytics.conf`.
`/opt/mcp/posthog.env` is aisha-owned 0600 and loaded in addition to the unchanged
original environment. The old dist/dependencies/global Node remain intact.

Local and 5090 matching-runtime builds pass 79 unit tests. Controlled loopback and
production success/error probes pass, all 35 original tool definitions remain
compatible, and public/local health is healthy. Root-only rollback material is
under `/root/mcp-analytics-rollback-132049b`; remove only the new MCP drop-in and
restart that service to restore the original executable paths. No customer
inference or paid operation was executed by the deployment probes.

PostHog ingestion was verified directly in project 606234 after promotion for build
`132049bbd0e5f449420b0cc7a05e71a717b6e661`: `$mcp_initialize` at
2026-11-01 22:52:36.960 UTC, `get_profile` success at 22:52:36.984 UTC (2 ms),
and the intentional `deployment_validation_unknown` error at 22:52:36.989 UTC
(0 ms). These were controlled probes; no customer inference was executed.
