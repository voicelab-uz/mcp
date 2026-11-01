import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { PostHog } from 'posthog-node';
import {
  createMcpAnalytics,
  instrumentMcpServer,
  sanitizeMcpEvent,
  sanitizeMcpPayload,
} from './analytics.js';

const tool = {
  name: 'speech_to_text',
  description: 'Transcribe audio',
  inputSchema: {
    type: 'object' as const,
    properties: { language: { type: 'string' }, audio_url: { type: 'string' } },
  },
};

test('payloads keep bounded option/result structure and remove private content and dynamic keys', async () => {
  const result = await sanitizeMcpEvent({
    event: '$mcp_tool_call',
    distinctId: 'usr_opaque',
    properties: {
      $mcp_source: 'posthog_mcp_analytics',
      $mcp_tool_name: 'speech_to_text',
      $mcp_duration_ms: 42,
      $mcp_parameters: {
        request: {
          method: 'tools/call',
          params: {
            name: 'speech_to_text',
            arguments: {
              language: 'uz',
              audio_url: 'https://secret.example/file?token=private',
              text: '{"status":"private_prompt"}',
              token: 'private-key',
              'private-person@example.com': 'secret',
            },
          },
        },
      },
      $mcp_response: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'completed',
              duration_ms: 1500,
              text: '{"status":"private_transcript"}',
              email: 'person@example.com',
              token: 'secret',
            }),
          },
        ],
      },
      $mcp_error_message: 'private server response',
      $mcp_intent: 'private user task',
      $set: { email: 'person@example.com' },
    },
  });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /private_|private-|person@example|secret\.example/);
  assert.match(serialized, /completed/);
  assert.match(serialized, /1500/);
  assert.match(serialized, /"uz"/);
  assert.equal(result?.properties?.$mcp_duration_ms, 42);
  assert.equal(result?.properties?.$set, undefined);
  assert.equal(
    (sanitizeMcpPayload({ model: 'vlk_sensitive_token', stream: true }) as any).model,
    '[redacted]'
  );
});

test('analytics is opt-in and validates ingestion configuration without reading product credentials', () => {
  assert.equal(createMcpAnalytics({}), undefined);
  assert.throws(() => createMcpAnalytics({ POSTHOG_MCP_ENABLED: '1' }), /requires/);
  assert.throws(
    () =>
      createMcpAnalytics({
        POSTHOG_MCP_ENABLED: '1',
        POSTHOG_PROJECT_TOKEN: 'phc_test',
        POSTHOG_HOST: 'https://user:password@example.com/path',
      }),
    /origin/
  );
});

test('real SDK wrapper captures success/errors without changing handler arguments or leaking result content', async () => {
  const posthog = new PostHog('phc_test_only', { disabled: true });
  const events: any[] = [];
  posthog.capture = (event) => {
    events.push(event);
  };
  const server = new Server(
    { name: 'voicelab-mcp', version: 'test' },
    { capabilities: { tools: {} } }
  );
  let received: unknown;
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [tool] }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    received = request.params.arguments;
    return {
      isError: request.params.arguments?.language === 'fail',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'completed',
            duration_ms: 80,
            text: 'private customer transcript',
          }),
        },
      ],
    };
  });
  instrumentMcpServer(server, posthog, [tool], {
    sub: 'usr_verified_account',
    scopes: [],
    voicelab_api_key: 'vlk_private_backend_key',
  });
  const client = new Client({ name: 'test-client', version: '1.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    // Calls work on a fresh low-level server even without a preceding tools/list.
    await client.callTool({
      name: 'speech_to_text',
      arguments: {
        language: 'uz',
        audio_url: 'https://example.com/private?token=secret',
        llm_model: 'gpt-test',
      },
    });
    assert.deepEqual(received, {
      language: 'uz',
      audio_url: 'https://example.com/private?token=secret',
    });
    await client.callTool({ name: 'speech_to_text', arguments: { language: 'fail' } });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const calls = events.filter((event) => event.event === '$mcp_tool_call');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].distinctId, 'usr_verified_account');
    assert.equal(calls[0].properties.$mcp_is_error, false);
    assert.equal(calls[1].properties.$mcp_is_error, true);
    assert.equal(typeof calls[0].properties.$mcp_duration_ms, 'number');
    assert.equal(calls[0].properties.$mcp_source, 'posthog_mcp_analytics');
    assert.doesNotMatch(
      JSON.stringify(events),
      /private customer|vlk_private|https:\/\/example.com\/private|token=secret/
    );
  } finally {
    await client.close();
    await server.close();
    await posthog.shutdown();
  }
});

test('credentials, IP metadata and raw conversation handles never leave; session correlation remains stable', async () => {
  for (const unsafe of [
    'Bearer secret_token',
    'eyJhbGciOiJIUzI1NiJ9.payload.signature',
    'https://example.com/private?token=secret',
    'person@example.com',
    '192.168.1.10',
    '12345678901',
  ]) {
    const event = await sanitizeMcpEvent({
      event: '$mcp_tool_call',
      distinct_id: 'usr_safe',
      timestamp: '2026-11-02T00:00:00Z',
      type: 'capture',
      properties: { $mcp_llm_model: unsafe },
    });
    assert.equal(event?.properties.$mcp_llm_model, undefined, unsafe);
  }
  const properties = {
    $session_id: 'transport-token-with-1234567890',
    $mcp_conversation_id: 'raw-signed-handle',
    $mcp_listed_tool_names: ['speech_to_text', 'text_to_speech'],
  };
  const base = {
    event: '$mcp_tool_call',
    distinct_id: 'usr_safe',
    timestamp: '2026-11-02T00:00:00Z',
    type: 'capture' as const,
    properties,
  };
  const first = await sanitizeMcpEvent(base);
  const second = await sanitizeMcpEvent(base);
  assert.equal(first?.properties.$session_id, second?.properties.$session_id);
  assert.match(first?.properties.$session_id as string, /^[a-f0-9-]{36}$/);
  assert.doesNotMatch(JSON.stringify(first), /transport-token|raw-signed-handle/);
  assert.deepEqual(first?.properties.$mcp_listed_tool_names, ['speech_to_text', 'text_to_speech']);
});

test('common provider credentials are redacted in metadata, parameters and JSON responses', async () => {
  for (const credential of [
    'sk_live_privateTokenValue',
    'sk-proj-privateTokenValue',
    'rk_live_privateTokenValue',
    'ghp_privateTokenValue',
    'gho_privateTokenValue',
    'ghu_privateTokenValue',
    'ghs_privateTokenValue',
    'ghr_privateTokenValue',
    'github_pat_privateTokenValue',
    'xoxb-privateTokenValue',
    'xoxp-privateTokenValue',
    'token:privateTokenValue',
  ]) {
    const event = await sanitizeMcpEvent({
      event: '$mcp_tool_call',
      distinct_id: 'usr_safe',
      timestamp: '2026-11-02T00:00:00Z',
      type: 'capture',
      properties: {
        $mcp_llm_model: credential,
        $mcp_client_name: credential,
        $mcp_parameters: {
          request: { method: 'tools/call', params: { arguments: { model: credential } } },
        },
        $mcp_response: {
          content: [{ type: 'text', text: JSON.stringify({ model: credential, status: 'ready' }) }],
        },
      },
    });
    assert.equal(event?.properties.$mcp_llm_model, undefined);
    assert.equal(event?.properties.$mcp_client_name, undefined);
    assert.equal(JSON.stringify(event).includes(credential), false, credential);
    assert.match(JSON.stringify(event), /ready/);
  }
});
