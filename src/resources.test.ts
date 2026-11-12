import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { runInNewContext } from 'node:vm';
import { createMcpServer } from './server.js';
import { loadAppsConfig } from './apps-config.js';
import {
  MCP_APP_MIME_TYPE,
  RESOURCE_NOT_FOUND,
  SPIKE_RESOURCE_URI,
  TTS_AUDIO_RESOURCE_URI,
  UPLOAD_RESOURCE_URI,
  listResourcesResult,
  readResourceResult,
} from './resources.js';
import { VERSION } from './version.js';
import { jsonForScript } from './ui/bridge.js';

async function connect(env: Record<string, string> = {}) {
  const server = createMcpServer({
    apiKey: 'vlk_test',
    baseUrl: 'https://api.voicelab.uz',
    apps: loadAppsConfig(env),
    verifiedUser: 'legacy',
  });
  const client = new Client({ name: 'test', version: '0.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe('ui:// resources', () => {
  it('with upload sessions OFF (default) only the TTS player is listed', async () => {
    const { client, close } = await connect();
    try {
      const { resources } = await client.listResources();
      assert.deepStrictEqual(resources.map((r) => r.uri), [TTS_AUDIO_RESOURCE_URI]);
      await assert.rejects(
        () => client.readResource({ uri: UPLOAD_RESOURCE_URI }),
        (e: any) => e instanceof McpError && e.code === RESOURCE_NOT_FOUND
      );
    } finally {
      await close();
    }
  });

  it('resources/read returns the upload view with MCP Apps mime type and CSP (upload sessions ON)', async () => {
    const { client, close } = await connect({ MCP_ENABLE_UPLOAD_SESSIONS: '1' });
    try {
      const { resources } = await client.listResources();
      assert.deepStrictEqual(resources.map((r) => r.uri), [TTS_AUDIO_RESOURCE_URI, UPLOAD_RESOURCE_URI]);
      const result = await client.readResource({ uri: UPLOAD_RESOURCE_URI });
      const content: any = result.contents[0];
      assert.strictEqual(content.uri, UPLOAD_RESOURCE_URI);
      assert.strictEqual(content.mimeType, MCP_APP_MIME_TYPE);
      assert.strictEqual(content.mimeType, 'text/html;profile=mcp-app');
      assert.deepStrictEqual(content._meta.ui.csp.connectDomains, ['https://api.voicelab.uz']);
      assert.deepStrictEqual(content._meta.ui.csp.resourceDomains, []);
      assert.strictEqual(content._meta.ui.prefersBorder, true);
      assert.deepStrictEqual(content._meta['openai/widgetCSP'].connect_domains, ['https://api.voicelab.uz']);
      assert.strictEqual(content._meta['openai/widgetDomain'], 'https://mcp.voicelab.uz');
      assert.strictEqual(content._meta['openai/widgetDescription'], 'Upload an audio file to VoiceLab');
      const html: string = content.text;
      assert.match(html, /ui\/initialize/);
      assert.match(html, /ui\/notifications\/initialized/);
      assert.match(html, /2026-01-26/);
      assert.match(html, /X-Upload-Token/);
      assert.match(html, /event\.source !== window\.parent/);
      assert.match(html, /jsonrpc !== '2\.0'/);
      assert.ok(!/innerHTML/.test(html), 'view must not use innerHTML');
      assert.ok(!/console\.(log|info|debug)/.test(html), 'view must not log');
      assert.ok(!/Authorization/.test(html), 'view must not send Authorization');
      assert.ok(html.includes(jsonForScript(VERSION)), 'clientInfo version comes from VERSION');
    } finally {
      await close();
    }
  });

  it('TTS player uses the exact signed URL and can renew it after playback errors', async () => {
    const content: any = readResourceResult(loadAppsConfig({}), TTS_AUDIO_RESOURCE_URI).contents[0];
    assert.strictEqual(content.mimeType, MCP_APP_MIME_TYPE);
    assert.deepStrictEqual(content._meta.ui.csp.resourceDomains, ['https://cdn.aisha.group']);
    assert.deepStrictEqual(content._meta['openai/widgetCSP'].resource_domains, ['https://cdn.aisha.group']);
    assert.ok(!content.text.includes('X-Amz-Signature='), 'resource must not embed a signed URL');
    assert.ok(!/localStorage|console\.(log|info|debug)/.test(content.text));

    const scripts = [...content.text.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    const handlers: Record<string, (params: any) => void> = {};
    const audioEvents: Record<string, () => void> = {};
    const buttonEvents: Record<string, () => void> = {};
    const audioAttributes: Record<string, string> = {};
    let audioLoadCount = 0;
    const audio = {
      addEventListener: (event: string, handler: () => void) => { audioEvents[event] = handler; },
      setAttribute: (name: string, value: string) => { audioAttributes[name] = value; },
      removeAttribute: (name: string) => { delete audioAttributes[name]; },
      pause: () => {},
      load: () => { audioLoadCount++; },
    };
    const status = { textContent: '', className: '' };
    const refresh = {
      hidden: true, disabled: false,
      addEventListener: (event: string, handler: () => void) => { buttonEvents[event] = handler; },
    };
    const elements: Record<string, any> = { audio, status, refresh };
    const signedUrl = 'https://cdn.aisha.group/backend/voicelab/go/tts-audio/test.wav?X-Amz-Signature=a%2Bb%2Fc&x=a+b';
    const renewedUrl = 'https://cdn.aisha.group/backend/voicelab/go/tts-audio/test.wav?X-Amz-Signature=renewed%2Bexact';
    const calls: any[] = [];
    let poll: (() => void) | null = null;
    runInNewContext(scripts.at(-1)?.[1] || '', {
      CONFIG: { audioOrigin: 'https://cdn.aisha.group', version: VERSION },
      Bridge: {
        on: (method: string, handler: (params: any) => void) => { handlers[method] = handler; },
        request: (method: string, params: any) => {
          calls.push({ method, params });
          if (calls.length === 1) return Promise.resolve({ structuredContent: { id: 'gen_test', status: 'processing' } });
          return Promise.resolve({ structuredContent: {
            id: 'gen_test', audio_available: true, audio_url: calls.length === 2 ? signedUrl : renewedUrl,
            audio_url_expires_at: new Date(Date.now() + 600000).toISOString(),
          } });
        },
        initialize: () => Promise.resolve({ hostContext: {} }),
        applyHostContext: () => {},
        autoResize: () => {},
      },
      document: { getElementById: (id: string) => elements[id] },
      window: { addEventListener: () => {} },
      setTimeout: (handler: () => void) => { poll = handler; return 1; },
      clearTimeout: () => { poll = null; },
      URL,
    });
    handlers['ui/notifications/tool-result']({ structuredContent: { generation_id: 'gen_test', status: 'processing' } });
    await new Promise(setImmediate);
    assert.strictEqual(status.textContent, 'Generating audio…');
    assert.ok(poll, 'queued generation should schedule a read-only status poll');
    (poll as () => void)();
    await new Promise(setImmediate);
    assert.strictEqual(audioAttributes.src, signedUrl);
    assert.strictEqual(status.textContent, 'Audio ready.');
    assert.strictEqual(refresh.hidden, false);

    handlers['ui/notifications/tool-result']({ structuredContent: {
      id: 'gen_test', audio_available: true, audio_url: 'https://other.example/audio.wav',
      audio_url_expires_at: new Date(Date.now() + 600000).toISOString(),
    } });
    assert.strictEqual(audioAttributes.src, signedUrl, 'unapproved origins must not replace the audio source');

    audioEvents.error();
    await new Promise(setImmediate);
    assert.strictEqual(calls[0].method, 'tools/call');
    assert.strictEqual(calls[0].params.name, 'get_tts_generation');
    assert.strictEqual(calls[0].params.arguments.generation_id, 'gen_test');
    assert.strictEqual(calls.length, 3);
    assert.strictEqual(audioAttributes.src, renewedUrl);

    const loadsBeforeRetry = audioLoadCount;
    buttonEvents.click();
    await new Promise(setImmediate);
    assert.strictEqual(calls.length, 4);
    assert.strictEqual(audioAttributes.src, renewedUrl);
    assert.strictEqual(audioLoadCount, loadsBeforeRetry + 1, 'manual refresh retries even if the signed URL is unchanged');
  });

  it('unknown resources return -32002', async () => {
    const { client, close } = await connect();
    try {
      await assert.rejects(
        () => client.readResource({ uri: 'ui://voicelab/nope' }),
        (e: any) => e instanceof McpError && e.code === RESOURCE_NOT_FOUND
      );
      // Spike resource is unknown when the spike is disabled.
      await assert.rejects(
        () => client.readResource({ uri: SPIKE_RESOURCE_URI }),
        (e: any) => e.code === RESOURCE_NOT_FOUND
      );
    } finally {
      await close();
    }
  });

  it('spike resource is listed only when enabled, with CSP from SPIKE_ECHO_URL origin', () => {
    const env = { MCP_ENABLE_SPIKE: '1', SPIKE_ECHO_URL: 'https://echo.staging.voicelab.uz/put?x=1' };
    const config = loadAppsConfig(env);
    assert.deepStrictEqual(listResourcesResult(config).resources.map((r) => r.uri), [TTS_AUDIO_RESOURCE_URI, SPIKE_RESOURCE_URI]);
    assert.deepStrictEqual(
      listResourcesResult(loadAppsConfig({ ...env, MCP_ENABLE_UPLOAD_SESSIONS: '1' })).resources.map((r) => r.uri),
      [TTS_AUDIO_RESOURCE_URI, UPLOAD_RESOURCE_URI, SPIKE_RESOURCE_URI]
    );
    const content: any = readResourceResult(config, SPIKE_RESOURCE_URI).contents[0];
    assert.deepStrictEqual(content._meta.ui.csp.connectDomains, ['https://echo.staging.voicelab.uz']);
    assert.match(content.text, /upload_spike_done/);
    assert.match(content.text, /securitypolicyviolation/);
    assert.ok(!/innerHTML/.test(content.text));
  });

  it('adds redirect_domains for the browser upload page when configured', () => {
    const config = loadAppsConfig({ MCP_ENABLE_UPLOAD_SESSIONS: '1', UPLOAD_PAGE_URL: 'https://voicelab.uz/upload' });
    const content: any = readResourceResult(config, UPLOAD_RESOURCE_URI).contents[0];
    assert.deepStrictEqual(content._meta['openai/widgetCSP'].redirect_domains, ['https://voicelab.uz']);
  });

  it('embeds config safely inside <script>', () => {
    assert.strictEqual(jsonForScript('</script><b>'), '"\\u003c/script\\u003e\\u003cb\\u003e"');
  });
});

describe('loadAppsConfig', () => {
  it('derives the API origin and ignores invalid optional settings', () => {
    const c = loadAppsConfig({ UPLOAD_PAGE_URL: 'http://insecure/upload', MCP_WIDGET_DOMAIN: 'nope' }, 'https://api.voicelab.uz/v1');
    assert.strictEqual(c.apiOrigin, 'https://api.voicelab.uz');
    assert.strictEqual(c.uploadPageUrl, undefined);
    assert.strictEqual(c.widgetDomain, 'https://mcp.voicelab.uz');
    assert.strictEqual(c.spike, undefined);
    assert.strictEqual(c.uploadSessions, false);
    assert.ok(c.warnings.length >= 1);
    assert.strictEqual(loadAppsConfig({ MCP_ENABLE_UPLOAD_SESSIONS: '1' }).uploadSessions, true);
    assert.strictEqual(loadAppsConfig({ MCP_ENABLE_UPLOAD_SESSIONS: 'true' }).uploadSessions, false);
  });

  it('rejects an upload page URL with a fragment', () => {
    assert.strictEqual(loadAppsConfig({ UPLOAD_PAGE_URL: 'https://voicelab.uz/upload#x' }).uploadPageUrl, undefined);
    assert.strictEqual(loadAppsConfig({ UPLOAD_PAGE_URL: 'https://voicelab.uz/upload' }).uploadPageUrl, 'https://voicelab.uz/upload');
  });
});
