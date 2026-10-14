---
name: mcp
description: Review VoiceLab TypeScript MCP changes for OAuth audience and scope checks, tool and resource contracts, transport isolation, bounded execution, and MCP Apps host boundaries.
---

# MCP review

TypeScript MCP SDK server with Node stdio/HTTP, VoiceLab API adapters and MCP Apps.
The Cloudflare worker entry point is legacy, not the production Node MCP Apps
server. Review MCP behavior and related deploy/tests only; do not apply general
product-dashboard or inference-kernel rules to this repository.

- Security: identify the caller, token issuer/audience/scope, requested resource
  and downstream credential. Verify per-user authorization on tools/resources,
  token expiry and session isolation. OAuth tokens must be issued for this server;
  accepting an arbitrary upstream token is not validation. The current design
  derives a VoiceLab API credential from a verified VoiceLab token: assess that
  explicit trust contract rather than blindly calling all credential forwarding
  token passthrough. Do not let configured legacy credentials become a fallback
  for an invalid OAuth identity or share one user's billing credential with another.
- Trace SSRF/private targets and redirects in media fetches, uploads and discovery;
  bound payloads and generated output. Tool annotations and descriptions are hints,
  not permission checks. Untrusted tool/resource text must not become instructions
  to perform privileged operations. Check required user consent at actual side
  effects; do not demand redundant prompts for harmless reads.
- Readability/contracts: align tool schemas, runtime validation, handler behavior,
  advertised capabilities and error results. Distinguish protocol errors from
  tool execution errors. Preserve SDK and supported protocol-version behavior;
  do not demand every newest optional feature. Keep protocol stdout clean in stdio
  and diagnostics on stderr. Keep request/session state ownership explicit.
- Scalability: check cancellation/timeouts propagated to downstream requests,
  duplicate side effects on retries, upload cleanup, bounded buffers/results,
  pagination, transport teardown and per-request server lifetimes. Avoid global
  mutable auth/session state and unbounded retained streams.
- MCP Apps: validate host/window message origin and source, bridge schemas,
  resource access, upload-session ownership and the iframe's CSP/network boundary.
  Host-provided metadata is not authorization. Keep UI resources compatible with
  clients that ignore Apps metadata and expose an understandable textual result.
- Tests: request relevant wrong-audience/issuer/scope, user A accessing B's upload,
  spoofed bridge messages, malformed JSON-RPC/tool args, cancellation, duplicate
  calls and unsupported-client cases. Verify effects and isolation, not only schema
  snapshots. UX applies to tool discoverability, actionable errors and Apps only.

Original repository-specific guidance informed by the
[MCP security guidance](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices).
The link is for maintenance; review has no network tools or remote skill loading.
