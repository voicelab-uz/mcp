import { createHash } from 'node:crypto';
import { instrument, type BeforeSendFn } from '@posthog/mcp';
import { PostHog } from 'posthog-node';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { VerifiedOAuthUser } from './oauth.js';

const REDACTED = '[redacted]';
const codeFields = new Set([
  'model',
  'model_id',
  'language',
  'format',
  'output_format',
  'status',
  'code',
  'error_code',
  'type',
  'kind',
  'role',
  'purpose',
  'operation',
  'mime_type',
  'content_type',
  'method',
]);
const numberFields = new Set([
  'count',
  'total',
  'limit',
  'offset',
  'page',
  'page_size',
  'duration',
  'duration_ms',
  'duration_seconds',
  'size',
  'size_bytes',
  'characters',
  'credits',
  'speed',
  'sample_rate',
  'channels',
  'start',
  'end',
  'start_ms',
  'end_ms',
  'statusCode',
  'status_code',
  'max_tokens',
  'temperature',
  'top_p',
  'input_tokens',
  'output_tokens',
  'total_tokens',
  'index',
]);
const structuralFields = new Set([
  'request',
  'params',
  'arguments',
  'name',
  'result',
  'content',
  'structuredContent',
  'isError',
  'error',
  'data',
  'items',
  'models',
  'voices',
  'languages',
  'segments',
  'speakers',
  'usage',
  'pagination',
  'processing',
  'transcription',
  'notes',
  'audio',
  'text',
  'success',
  'has_more',
  'stream',
  'include_speakers',
  'include_words',
]);
const secretValue =
  /(?:vlk_|vlup_|ph[a-z]_|Bearer\s|eyJ[A-Za-z0-9_-]+\.|https?:\/\/|[^\s@]+@[^\s@]+\.[^\s@]+)/i;

/** Keep useful bounded structure, options, counts and timings; never customer content. */
export function sanitizeMcpPayload(value: unknown, field = '', depth = 0): unknown {
  if (depth > 8) return '[depth limited]';
  if (value === null || value === undefined) return null;
  if (typeof value === 'number')
    return numberFields.has(field) && Number.isFinite(value) ? value : REDACTED;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (field === 'text') return `[redacted text; ${value.length} chars]`;
    return codeFields.has(field) &&
      /^[a-zA-Z0-9][a-zA-Z0-9_.:/+-]{0,79}$/.test(value) &&
      !secretValue.test(value)
      ? value
      : REDACTED;
  }
  if (Array.isArray(value))
    return value.slice(0, 25).map((item) => sanitizeMcpPayload(item, field, depth + 1));
  if (typeof value !== 'object') return REDACTED;
  const result: Record<string, unknown> = {};
  let omitted = 0;
  for (const [key, item] of Object.entries(value).slice(0, 60)) {
    if (!codeFields.has(key) && !numberFields.has(key) && !structuralFields.has(key)) {
      omitted += 1;
      continue;
    }
    // An unstructured content field is never recursively trusted merely because it has a familiar name.
    result[key] = sanitizeMcpPayload(item, key, depth + 1);
  }
  if (omitted) result.redacted_fields = omitted;
  return result;
}

function sanitizeResponse(value: unknown): unknown {
  const sanitized = sanitizeMcpPayload(value);
  if (!value || typeof value !== 'object' || !sanitized || typeof sanitized !== 'object')
    return sanitized;
  const content = (value as { content?: unknown }).content;
  if (!Array.isArray(content)) return sanitized;
  return {
    ...sanitized,
    content: content.slice(0, 25).map((block) => {
      if (
        !block ||
        typeof block !== 'object' ||
        block.type !== 'text' ||
        typeof block.text !== 'string'
      )
        return sanitizeMcpPayload(block);
      try {
        return { type: 'text', text: JSON.stringify(sanitizeMcpPayload(JSON.parse(block.text))) };
      } catch {
        return { type: 'text', text: `[redacted text; ${block.text.length} chars]` };
      }
    }),
  };
}

const safeMetadata = new Set([
  '$mcp_source',
  '$mcp_server_name',
  '$mcp_server_version',
  '$mcp_server_build',
  '$mcp_sdk_version',
  '$mcp_client_name',
  '$mcp_client_version',
  '$mcp_transport',
  '$mcp_protocol_version',
  '$mcp_tool_name',
  '$mcp_duration_ms',
  '$mcp_is_error',
  '$mcp_error_type',
  '$mcp_session_id',
  '$session_id',
  '$mcp_interface',
  '$mcp_listed_tool_names',
  '$mcp_llm_model',
  '$mcp_llm_model_source',
  '$mcp_intent_source',
  '$process_person_profile',
  '$mcp_input_keys',
  '$mcp_input_key_count',
]);

export const sanitizeMcpEvent: BeforeSendFn = (event) => {
  if (!event.event.startsWith('$mcp_')) return null;
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event.properties ?? {})) {
    if (key === '$mcp_parameters' || key === '$mcp_response') {
      const payload = key === '$mcp_response' ? sanitizeResponse(value) : sanitizeMcpPayload(value);
      properties[key] =
        JSON.stringify(payload).length <= 20000 ? payload : { redacted_oversized_payload: true };
    } else if (key === '$mcp_error_message') properties[key] = REDACTED;
    else if (key === '$mcp_intent') properties[key] = REDACTED;
    else if ((key === '$session_id' || key === '$mcp_session_id') && typeof value === 'string') {
      // Retain correlation without exporting transport/session token material.
      const hash = createHash('sha256')
        .update('voicelab-mcp-session:' + value)
        .digest('hex');
      properties[key] =
        `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    } else if (safeMetadata.has(key)) {
      if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
        properties[key] = value;
      else if (
        typeof value === 'string' &&
        /^[A-Za-z0-9_.:/+| -]{1,128}$/.test(value) &&
        !secretValue.test(value) &&
        !/\d{7}|\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(value)
      )
        properties[key] = value;
      else if (
        (key === '$mcp_input_keys' || key === '$mcp_listed_tool_names') &&
        Array.isArray(value)
      )
        properties[key] = value
          .filter((item) => typeof item === 'string' && /^[a-z_][a-z0-9_]{0,63}$/.test(item))
          .slice(0, 50);
    }
  }
  return { ...event, properties };
};

export interface McpAnalyticsRuntime {
  attach(server: Server, tools: Tool[], verifiedUser?: VerifiedOAuthUser | 'legacy'): void;
  shutdown(): Promise<void>;
}

export function createMcpAnalytics(
  env: Record<string, string | undefined>
): McpAnalyticsRuntime | undefined {
  if (env.POSTHOG_MCP_ENABLED !== '1') return undefined;
  const token = env.POSTHOG_PROJECT_TOKEN?.trim();
  const host = env.POSTHOG_HOST?.trim();
  if (!token || !host)
    throw new Error('MCP analytics requires POSTHOG_PROJECT_TOKEN and POSTHOG_HOST');
  const url = new URL(host);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('POSTHOG_HOST must be an HTTPS ingestion origin');
  }
  const client = new PostHog(token, {
    host: url.origin,
    flushAt: 20,
    flushInterval: 10000,
    maxQueueSize: 1000,
    disableGeoip: true,
    enableExceptionAutocapture: false,
  });
  return {
    attach: (server, tools, verifiedUser) =>
      instrumentMcpServer(server, client, tools, verifiedUser, env.POSTHOG_SERVER_BUILD),
    shutdown: () => client.shutdown(5000),
  };
}

export function instrumentMcpServer(
  server: Server,
  client: PostHog,
  tools: Tool[],
  verifiedUser?: VerifiedOAuthUser | 'legacy',
  build?: string
): void {
  const registry = new Map(tools.map((tool) => [tool.name, tool]));
  const subject = verifiedUser && verifiedUser !== 'legacy' ? verifiedUser.sub : undefined;
  const identity =
    subject && /^[A-Za-z0-9_|:-]{6,128}$/.test(subject) && !secretValue.test(subject)
      ? { distinctId: subject }
      : null;
  instrument(server, client, {
    ...(build && /^[a-f0-9]{7,64}$/.test(build) ? { serverBuild: build } : {}),
    identify: identity,
    context: false,
    captureModel: true,
    enableConversationId: true,
    enableExceptionAutocapture: false,
    resolveOriginalTool: (name) => registry.get(name),
    beforeSend: sanitizeMcpEvent,
  });
}
