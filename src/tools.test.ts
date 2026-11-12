import { describe, it } from 'node:test';
import assert from 'node:assert';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  handleToolCall,
  listTools,
  resolveAudioSource,
  withSecuritySchemes,
  titleFromFilename,
  buildBrowserUploadUrl,
  serializeToolError,
  type Modules,
  type ToolsOptions,
} from './tools.js';
import { MeetingsModule } from './meetings.js';
import { STTModule } from './stt.js';
import { UploadsModule } from './uploads.js';
import { loadAppsConfig } from './apps-config.js';
import { createMcpServer } from './server.js';
import { uuidV5, wavInfo, base64Decode } from './utils.js';
import { TTSModule } from './tts.js';
import { OPENAI_FILE_DEF } from './ingestion-tools.js';
import { VoiceLabError } from './client.js';

const UPLOAD_ID = 'upl_AbCdEfGhIjKlMnOpQrStUv';
const TOKEN = 'vlup_secret_token_value_1234567890';
const DOWNLOAD_URL = 'https://files.oaiusercontent.com/file-abc?se=2026&sig=SIGNATURE_SECRET_123';

interface Call {
  kind: 'request' | 'upload';
  method?: string;
  path: string;
  options?: any;
  fields?: Record<string, string | Blob>;
}

class FakeClient {
  calls: Call[] = [];
  responses: unknown[] = [];
  next(): unknown {
    return this.responses.shift() ?? {};
  }
  async request<T>(method: string, path: string, options: any = {}): Promise<T> {
    this.calls.push({ kind: 'request', method, path, options });
    return this.next() as T;
  }
  binary: ArrayBuffer = new ArrayBuffer(0);
  async requestBinary(method: string, path: string, options: any = {}): Promise<ArrayBuffer> {
    this.calls.push({ kind: 'request', method, path, options });
    return this.binary;
  }
  async uploadMultipart<T>(path: string, fields: Record<string, string | Blob>, options: any = {}): Promise<T> {
    this.calls.push({ kind: 'upload', path, fields, options });
    return this.next() as T;
  }
}

function setup(env: Record<string, string> = {}) {
  const client = new FakeClient();
  const modules = {
    meetings: new MeetingsModule(client as never),
    stt: new STTModule(client as never),
    tts: new TTSModule(client as never),
    uploads: new UploadsModule(client as never),
  } as unknown as Modules;
  const options: ToolsOptions = { apps: loadAppsConfig(env) };
  const call = (name: string, args: unknown) => handleToolCall(name, args, modules, 'legacy', options);
  return { client, modules, options, call };
}

function sessionResponse() {
  return {
    upload: {
      id: UPLOAD_ID,
      purpose: 'meeting',
      status: 'pending',
      expires_at: '2026-10-14T12:15:00Z',
      max_bytes: 524288000,
    },
    upload_url: `https://api.voicelab.uz/v1/uploads/${UPLOAD_ID}/content`,
    upload_token: TOKEN,
    request_id: 'req_1',
  };
}

describe('resolveAudioSource', () => {
  it('resolves each single source', () => {
    assert.deepStrictEqual(resolveAudioSource({ upload_id: UPLOAD_ID }, { uploadSessions: true }), { kind: 'upload', id: UPLOAD_ID });
    assert.deepStrictEqual(resolveAudioSource({ audio_url: 'https://x.example/a.mp3' }), {
      kind: 'url',
      url: 'https://x.example/a.mp3',
    });
    const file = resolveAudioSource({ audio_base64: 'AQID' }, { filename: 'a.wav' });
    assert.strictEqual(file.kind, 'file');
    assert.strictEqual(file.kind === 'file' && file.filename, 'a.wav');
  });

  it('rejects zero or multiple sources', () => {
    assert.throws(() => resolveAudioSource({}), (e: any) => e.code === 'invalid_audio_source');
    assert.throws(
      () => resolveAudioSource({ upload_id: UPLOAD_ID, audio_url: 'https://x.example/a.mp3' }, { uploadSessions: true }),
      /exactly one/
    );
    assert.throws(() => resolveAudioSource({ audio_base64: 'AQID', audio_url: 'https://x' }), /exactly one/);
  });

  it('treats empty strings and null as absent', () => {
    assert.deepStrictEqual(resolveAudioSource({ upload_id: UPLOAD_ID, audio_url: '', audio_base64: null }, { uploadSessions: true }), {
      kind: 'upload',
      id: UPLOAD_ID,
    });
  });

  it('validates audio_url (https only, length, no credentials) without echoing it', () => {
    assert.throws(() => resolveAudioSource({ audio_url: 'http://x.example/a.mp3' }), /https/);
    assert.throws(() => resolveAudioSource({ audio_url: 'ftp://x' }), /https/);
    assert.throws(() => resolveAudioSource({ audio_url: 'not a url' }), /valid URL/);
    assert.throws(() => resolveAudioSource({ audio_url: 'https://u:p@x.example/a' }), /credentials/);
    assert.throws(
      () => resolveAudioSource({ audio_url: 'https://x.example/' + 'a'.repeat(4100) }),
      /4096/
    );
    try {
      resolveAudioSource({ audio_url: 'http://secret.example/?sig=SECRET' });
    } catch (e: any) {
      assert.ok(!e.message.includes('SECRET'));
    }
  });

  it('validates upload_id format when upload sessions are enabled', () => {
    const on = { uploadSessions: true };
    assert.throws(() => resolveAudioSource({ upload_id: 'upl_short' }, on), /upl_/);
    assert.throws(() => resolveAudioSource({ upload_id: '../v1/admin' }, on), /upl_/);
    assert.throws(() => resolveAudioSource({ upload_id: 42 }, on), /upl_/);
  });

  it('rejects upload_id with a clear error when upload sessions are disabled (default)', () => {
    assert.throws(
      () => resolveAudioSource({ upload_id: UPLOAD_ID }),
      (e: any) => e.code === 'invalid_audio_source' && /upload sessions are disabled/.test(e.message) && /audio_url/.test(e.message)
    );
    assert.throws(() => resolveAudioSource({}), (e: any) => !/upload_id/.test(e.message));
  });

  it('rejects empty base64 payloads', () => {
    assert.throws(() => resolveAudioSource({ audio_base64: '====' }), /empty/);
  });
});

describe('speech_to_text and create_meeting multipart sources', () => {
  for (const [args, field] of [
    [{ upload_id: UPLOAD_ID }, 'upload_id'],
    [{ audio_url: 'https://cdn.example/a.mp3' }, 'audio_url'],
    [{ audio_base64: 'AQID' }, 'audio'],
  ] as const) {
    it(`speech_to_text sends only ${field}`, async () => {
      const { client, call } = setup({ MCP_ENABLE_UPLOAD_SESSIONS: '1' });
      client.responses.push({ id: 'stt_1', status: 'queued' });
      const result: any = await call('speech_to_text', { ...args, language: 'uz' });
      assert.ok(!result.isError, JSON.stringify(result));
      const fields = client.calls[0].fields || {};
      assert.strictEqual(client.calls[0].path, '/v1/stt');
      const sources = ['audio', 'audio_url', 'upload_id'].filter((k) => k in fields);
      assert.deepStrictEqual(sources, [field]);
      assert.strictEqual(fields.language, 'uz');
      assert.ok(client.calls[0].options.headers['Idempotency-Key']);
    });

    it(`create_meeting sends only ${field}`, async () => {
      const { client, call } = setup({ MCP_ENABLE_UPLOAD_SESSIONS: '1' });
      client.responses.push({ meeting: { id: 'mtg_1' } });
      const result: any = await call('create_meeting', { ...args, title: 'T' });
      assert.ok(!result.isError);
      const fields = client.calls[0].fields || {};
      const sources = ['audio', 'audio_url', 'upload_id'].filter((k) => k in fields);
      assert.deepStrictEqual(sources, [field]);
    });
  }

  it('upload_id is rejected before any API call when upload sessions are off', async () => {
    const { client, call } = setup();
    for (const tool of ['create_meeting', 'speech_to_text']) {
      await assert.rejects(
        () => call(tool, { upload_id: UPLOAD_ID, language: 'uz' }) as Promise<unknown>,
        /upload sessions are disabled/
      );
    }
    assert.strictEqual(client.calls.length, 0);
  });

  it('speech_to_text requires language', async () => {
    const { call } = setup();
    await assert.rejects(() => call('speech_to_text', { upload_id: UPLOAD_ID }) as Promise<unknown>, /language/);
  });

  it('create_meeting rejects conflicting sources before calling the API', async () => {
    const { client, call } = setup();
    await assert.rejects(
      () => call('create_meeting', { audio_url: 'https://x.example/a.mp3', audio_base64: 'AQID' }) as Promise<unknown>,
      /exactly one/
    );
    assert.strictEqual(client.calls.length, 0);
  });
});

describe('upload sessions', () => {
  it('upload tools are unknown when MCP_ENABLE_UPLOAD_SESSIONS is off', async () => {
    const { client, call } = setup();
    for (const tool of ['upload_audio', 'create_upload_session', 'get_upload']) {
      const result: any = await call(tool, { purpose: 'meeting', upload_id: UPLOAD_ID });
      assert.strictEqual(result.isError, true, tool);
      assert.match(result.content[0].text, /Unknown tool/);
    }
    assert.strictEqual(client.calls.length, 0);
  });

  it('upload_audio returns the token only in result _meta', async () => {
    const { client, call } = setup({ MCP_ENABLE_UPLOAD_SESSIONS: '1' });
    client.responses.push(sessionResponse());
    const result: any = await call('upload_audio', { purpose: 'meeting', title: 'Sync' });
    assert.deepStrictEqual(client.calls[0].options.body, { purpose: 'meeting' });
    assert.strictEqual(client.calls[0].path, '/v1/uploads');
    assert.ok(!JSON.stringify(result.content).includes(TOKEN));
    assert.ok(!JSON.stringify(result.structuredContent).includes(TOKEN));
    assert.ok(!('browser_upload_url' in result.structuredContent));
    assert.deepStrictEqual(result.structuredContent, {
      upload_id: UPLOAD_ID,
      purpose: 'meeting',
      status: 'pending',
      expires_at: '2026-10-14T12:15:00Z',
    });
    assert.deepStrictEqual(result._meta['voicelab/upload'], {
      upload_url: `https://api.voicelab.uz/v1/uploads/${UPLOAD_ID}/content`,
      upload_token: TOKEN,
      max_bytes: 524288000,
      expires_at: '2026-10-14T12:15:00Z',
    });
    assert.match(result.content[0].text, /audio_url/);
  });

  it('upload_audio adds a fragment link only when UPLOAD_PAGE_URL is configured', async () => {
    const { client, call } = setup({ MCP_ENABLE_UPLOAD_SESSIONS: '1', UPLOAD_PAGE_URL: 'https://voicelab.uz/upload' });
    client.responses.push(sessionResponse());
    const result: any = await call('upload_audio', { purpose: 'stt' });
    const link = result.structuredContent.browser_upload_url as string;
    assert.ok(link.startsWith('https://voicelab.uz/upload#'));
    const fragment = new URLSearchParams(link.split('#')[1]);
    assert.strictEqual(fragment.get('t'), TOKEN);
    assert.strictEqual(fragment.get('id'), UPLOAD_ID);
    assert.strictEqual(fragment.get('p'), 'stt');
    assert.ok(!link.split('#')[0].includes(TOKEN), 'token must only be in the fragment');
    // The token appears in content only inside that fragment link.
    const text: string = result.content[0].text;
    assert.strictEqual(text.split(TOKEN).length - 1, 1);
    assert.ok(text.includes(link));
  });

  it('create_upload_session forwards filename/content_type/size and validates purpose', async () => {
    const { client, call } = setup({ MCP_ENABLE_UPLOAD_SESSIONS: '1' });
    client.responses.push(sessionResponse());
    const result: any = await call('create_upload_session', {
      purpose: 'meeting',
      filename: 'a.mp3',
      content_type: 'audio/mpeg',
      size_bytes: 1234.7,
    });
    assert.deepStrictEqual(client.calls[0].options.body, {
      purpose: 'meeting',
      filename: 'a.mp3',
      content_type: 'audio/mpeg',
      size_bytes: 1234,
    });
    assert.ok(!JSON.stringify(result.content).includes(TOKEN));
    await assert.rejects(() => call('create_upload_session', { purpose: 'video' }) as Promise<unknown>, /purpose/);
  });

  it('get_upload validates the id and calls GET /v1/uploads/{id}', async () => {
    const { client, call } = setup({ MCP_ENABLE_UPLOAD_SESSIONS: '1' });
    client.responses.push({ upload: { id: UPLOAD_ID, status: 'ready' } });
    const result: any = await call('get_upload', { upload_id: UPLOAD_ID });
    assert.strictEqual(client.calls[0].method, 'GET');
    assert.strictEqual(client.calls[0].path, `/v1/uploads/${UPLOAD_ID}`);
    assert.strictEqual(result.structuredContent.upload.status, 'ready');
    await assert.rejects(() => call('get_upload', { upload_id: '../x' }) as Promise<unknown>, /upl_/);
  });

  it('buildBrowserUploadUrl encodes values in the fragment', () => {
    assert.strictEqual(
      buildBrowserUploadUrl('https://voicelab.uz/upload', 'a&b', UPLOAD_ID, 'meeting'),
      `https://voicelab.uz/upload#t=a%26b&id=${UPLOAD_ID}&p=meeting`
    );
  });
});

describe('ChatGPT fileParams tools', () => {
  const byName = Object.fromEntries(listTools().map((t) => [t.name, t]));

  for (const name of ['create_meeting_from_file', 'transcribe_file']) {
    it(`${name} declares the exact OpenAI file schema`, () => {
      const tool: any = byName[name];
      assert.deepStrictEqual(tool._meta['openai/fileParams'], ['file']);
      assert.deepStrictEqual(tool.inputSchema.properties.file, { $ref: '#/$defs/OpenAIFile' });
      const def = tool.inputSchema.$defs.OpenAIFile;
      assert.deepStrictEqual(def, OPENAI_FILE_DEF);
      assert.deepStrictEqual(Object.keys(def.properties).sort(), ['download_url', 'file_id', 'file_name', 'mime_type']);
      assert.deepStrictEqual(def.required, ['download_url', 'file_id']);
      assert.ok(tool.inputSchema.required.includes('file'));
      assert.ok(!('oneOf' in tool.inputSchema));
    });
  }

  it('create_meeting_from_file forwards download_url as audio_url and never echoes it', async () => {
    const { client, call } = setup();
    client.responses.push({ meeting: { id: 'mtg_1', source_url: DOWNLOAD_URL } });
    const result: any = await call('create_meeting_from_file', {
      file: { download_url: DOWNLOAD_URL, file_id: 'file_123', file_name: 'Weekly sync.m4a' },
    });
    const fields = client.calls[0].fields || {};
    assert.strictEqual(fields.audio_url, DOWNLOAD_URL);
    assert.ok(!('audio' in fields) && !('upload_id' in fields));
    assert.strictEqual(fields.title, 'Weekly sync');
    const text = result.content[0].text as string;
    assert.ok(!text.includes('SIGNATURE_SECRET_123'));
    assert.ok(!text.includes('files.oaiusercontent.com'));
    assert.match(text, /file_123/);
  });

  it('uses a deterministic idempotency key derived from file_id', async () => {
    const { client, call } = setup();
    client.responses.push({ meeting: { id: 'a' } }, { meeting: { id: 'b' } }, { id: 'stt' });
    await call('create_meeting_from_file', { file: { download_url: DOWNLOAD_URL, file_id: 'file_123' } });
    await call('create_meeting_from_file', {
      file: { download_url: DOWNLOAD_URL + '&x=1', file_id: 'file_123' },
    });
    await call('transcribe_file', { file: { download_url: DOWNLOAD_URL, file_id: 'file_123' }, language: 'en' });
    const keys = client.calls.map((c) => c.options.headers['Idempotency-Key']);
    assert.strictEqual(keys[0], keys[1]);
    assert.notStrictEqual(keys[0], keys[2]);
    assert.match(keys[0], /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('transcribe_file forwards audio_url and requires language', async () => {
    const { client, call } = setup();
    client.responses.push({ id: 'stt_1' });
    await call('transcribe_file', { file: { download_url: DOWNLOAD_URL, file_id: 'f' }, language: 'ru' });
    assert.strictEqual(client.calls[0].fields?.audio_url, DOWNLOAD_URL);
    await assert.rejects(
      () => call('transcribe_file', { file: { download_url: DOWNLOAD_URL, file_id: 'f' } }) as Promise<unknown>,
      /language/
    );
  });

  it('rejects non-https download URLs without echoing them', async () => {
    const { call } = setup();
    await assert.rejects(
      () => call('transcribe_file', { file: { download_url: 'http://evil/?sig=XYZSECRET', file_id: 'f' }, language: 'en' }) as Promise<unknown>,
      (e: any) => /https/.test(e.message) && !e.message.includes('XYZSECRET')
    );
  });
});

/** Minimal mono 16-bit PCM WAV with `frames` silent samples. */
function makeWav(frames: number, sampleRate = 24000): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + frames * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, frames * 2, true);
  return buffer;
}

describe('text_to_speech audio player result', () => {
  const ARGS = { text: 'Salom', language: 'uz', voice_id: 'voice_1', speed: 1.1 };

  it('wavInfo reads sample rate and duration, and rejects non-WAV bytes', () => {
    assert.deepStrictEqual(wavInfo(makeWav(36000)), { sampleRate: 24000, channels: 1, durationMs: 1500 });
    assert.strictEqual(wavInfo(new Uint8Array(64)), undefined);
    assert.strictEqual(wavInfo(new ArrayBuffer(10)), undefined);
    // Placeholder data size (streamed WAV) falls back to the remaining bytes.
    const streamed = makeWav(24000);
    new DataView(streamed).setUint32(40, 0xffffffff, true);
    assert.strictEqual(wavInfo(streamed)?.durationMs, 1000);
  });

  it('keeps audio bytes out of the model-visible result and hands them to the view via _meta', async () => {
    const { client, call } = setup();
    client.binary = makeWav(36000);
    const result: any = await call('text_to_speech', ARGS);
    assert.ok(!result.isError);
    const base64 = result._meta['voicelab/audio'].audio_base64;
    assert.strictEqual(base64Decode(base64).byteLength, 44 + 72000);
    assert.strictEqual(result._meta['voicelab/audio'].mime_type, 'audio/wav');
    assert.strictEqual(result.content.length, 1);
    assert.match(result.content[0].text, /Audio generated \(1\.5 s, WAV, 24000 Hz\)/);
    assert.match(result.content[0].text, /audio player/);
    assert.ok(!result.content[0].text.includes(base64.slice(0, 40)));
    assert.ok(!JSON.stringify(result.structuredContent).includes('audio_base64'));
    assert.deepStrictEqual(result.structuredContent, {
      format: 'wav',
      mime_type: 'audio/wav',
      sample_rate: 24000,
      duration_ms: 1500,
      size_bytes: 44 + 72000,
      voice_id: 'voice_1',
      language: 'uz',
      idempotency_key: result.structuredContent.idempotency_key,
    });
    assert.match(result.structuredContent.idempotency_key, /^[0-9a-f-]{36}$/);
  });

  it('sends only TTS fields to the API so a replay with the same key has an identical body', async () => {
    const { client, call } = setup();
    client.binary = makeWav(100);
    await call('text_to_speech', ARGS);
    const first: any = await call('text_to_speech', { ...ARGS, idempotency_key: 'key-12345678', include_audio_base64: true });
    assert.deepStrictEqual(client.calls[0].options.body, ARGS);
    assert.deepStrictEqual(client.calls[1].options.body, ARGS);
    assert.strictEqual(client.calls[1].options.headers['Idempotency-Key'], 'key-12345678');
    // Opt-in keeps the previous JSON text shape for programmatic clients.
    const parsed = JSON.parse(first.content[0].text);
    assert.deepStrictEqual(Object.keys(parsed), ['audio_base64', 'format', 'sample_rate', 'idempotency_key']);
    assert.strictEqual(parsed.audio_base64, first._meta['voicelab/audio'].audio_base64);
    assert.strictEqual(parsed.idempotency_key, 'key-12345678');
  });

  it('still returns a playable result when the bytes are not a parseable WAV', async () => {
    const { client, call } = setup();
    client.binary = new Uint8Array([1, 2, 3]).buffer;
    const result: any = await call('text_to_speech', ARGS);
    assert.strictEqual(result.structuredContent.sample_rate, 24000);
    assert.ok(!('duration_ms' in result.structuredContent));
    assert.match(result.content[0].text, /Audio generated \(WAV, 24000 Hz\)/);
    assert.strictEqual(result._meta['voicelab/audio'].audio_base64, 'AQID');
  });

  it('is linked to the always-on audio view in tools/list', () => {
    const tool: any = listTools().find((t) => t.name === 'text_to_speech');
    assert.strictEqual(tool._meta.ui.resourceUri, 'ui://voicelab/audio');
    assert.deepStrictEqual(tool._meta.ui.visibility, ['model', 'app']);
    assert.strictEqual(tool._meta['openai/outputTemplate'], 'ui://voicelab/audio');
    assert.strictEqual(tool._meta['openai/widgetAccessible'], true);
    assert.strictEqual(tool.inputSchema.properties.include_audio_base64.type, 'boolean');
    assert.ok(withSecuritySchemes([tool])[0]._meta, 'security schemes keep _meta');
  });
});

describe('tool list and _meta', () => {
  it('uuidV5 matches the RFC test vector', async () => {
    assert.strictEqual(
      await uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
      '2ed6657d-e927-568b-95e1-2665a8aea6a2'
    );
  });

  it('titleFromFilename strips extension and control characters', () => {
    assert.strictEqual(titleFromFilename('a\nb.mp3'), 'a b');
    assert.strictEqual(titleFromFilename(undefined), undefined);
    assert.strictEqual(titleFromFilename('x'.repeat(300) + '.wav')!.length, 160);
  });

  it('withSecuritySchemes merges get_profile _meta instead of replacing it', () => {
    const [profile, other] = withSecuritySchemes([
      { name: 'get_profile', inputSchema: { type: 'object' }, _meta: { keep: 1 } } as any,
      { name: 'x', inputSchema: { type: 'object' }, _meta: { ui: { resourceUri: 'ui://a' } } } as any,
    ]) as any[];
    assert.deepStrictEqual(profile._meta, { keep: 1, 'openai/profile': true });
    assert.deepStrictEqual(other._meta, { ui: { resourceUri: 'ui://a' } });
    assert.ok(other.securitySchemes);
  });

  it('spike tools are listed and callable only when MCP_ENABLE_SPIKE=1 with an https echo URL', async () => {
    const names = (env: Record<string, string>) => listTools({ apps: loadAppsConfig(env) }).map((t) => t.name);
    assert.ok(!names({}).includes('upload_spike'));
    assert.ok(!names({ MCP_ENABLE_SPIKE: '1' }).includes('upload_spike'));
    assert.ok(!names({ MCP_ENABLE_SPIKE: '1', SPIKE_ECHO_URL: 'http://x' }).includes('upload_spike'));
    const enabled = names({ MCP_ENABLE_SPIKE: '1', SPIKE_ECHO_URL: 'https://echo.example/put' });
    assert.ok(enabled.includes('upload_spike') && enabled.includes('upload_spike_done'));

    const off: any = await setup().call('upload_spike', {});
    assert.strictEqual(off.isError, true);
    const on: any = await setup({ MCP_ENABLE_SPIKE: '1', SPIKE_ECHO_URL: 'https://echo.example/put' }).call('upload_spike', {});
    assert.ok(!on.isError);
    assert.ok(on._meta['voicelab/spike'].nonce);
  });

  async function rawToolsList(env: Record<string, string>) {
    const server = createMcpServer({
      apiKey: 'vlk_test',
      baseUrl: 'https://api.voicelab.uz',
      apps: loadAppsConfig(env),
      verifiedUser: 'legacy',
    });
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
    const responses = new Map<number, any>();
    clientSide.onmessage = (msg: any) => {
      if (typeof msg.id === 'number') responses.set(msg.id, msg);
    };
    await server.connect(serverSide);
    await clientSide.start();
    const rpc = async (id: number, method: string, params: unknown = {}) => {
      await clientSide.send({ jsonrpc: '2.0', id, method, params } as any);
      for (let i = 0; i < 100 && !responses.has(id); i++) await new Promise((r) => setTimeout(r, 5));
      return responses.get(id);
    };
    try {
      const init = await rpc(1, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'raw', version: '0' },
      });
      const list = await rpc(2, 'tools/list');
      const byName: Record<string, any> = Object.fromEntries(list.result.tools.map((t: any) => [t.name, t]));
      return { capabilities: init.result.capabilities, byName };
    } finally {
      await server.close();
    }
  }

  it('tools/list (raw wire, upload sessions OFF): no upload tools, no upload_id, fileParams tools present', async () => {
    const { capabilities, byName } = await rawToolsList({});
    assert.ok(capabilities.resources, 'resources capability');
    assert.ok(capabilities.tools, 'tools capability');
    for (const name of ['upload_audio', 'create_upload_session', 'get_upload', 'upload_spike']) {
      assert.ok(!byName[name], `${name} must be hidden`);
    }
    for (const name of ['create_meeting', 'speech_to_text']) {
      assert.ok(!('upload_id' in byName[name].inputSchema.properties), `${name} upload_id`);
      assert.ok('audio_url' in byName[name].inputSchema.properties);
      assert.ok('audio_base64' in byName[name].inputSchema.properties);
      assert.ok(!/upload_id|upload_audio/.test(byName[name].description), `${name} description`);
      assert.ok(byName[name].securitySchemes);
      assert.deepStrictEqual(byName[name]._meta.ui.visibility, ['model', 'app']);
    }
    for (const name of ['create_meeting_from_file', 'transcribe_file']) {
      assert.ok(byName[name], name);
      assert.deepStrictEqual(byName[name]._meta['openai/fileParams'], ['file']);
      assert.ok(!/upload_audio/.test(byName[name].description));
    }
    assert.deepStrictEqual(byName.speech_to_text.inputSchema.required, ['language']);
    assert.strictEqual(byName.get_profile._meta['openai/profile'], true);
    assert.ok(!byName.get_profile.securitySchemes);
  });

  it('tools/list (raw wire, upload sessions ON) keeps securitySchemes and _meta.ui', async () => {
    const { byName } = await rawToolsList({ MCP_ENABLE_UPLOAD_SESSIONS: '1' });
    for (const name of ['upload_audio', 'create_upload_session', 'get_upload', 'create_meeting_from_file', 'transcribe_file', 'create_meeting', 'speech_to_text']) {
      assert.ok(byName[name], name);
      assert.ok(byName[name].securitySchemes, `${name} securitySchemes`);
    }
    assert.strictEqual(byName.upload_audio._meta.ui.resourceUri, 'ui://voicelab/upload');
    assert.deepStrictEqual(byName.upload_audio._meta.ui.visibility, ['model', 'app']);
    assert.strictEqual(byName.upload_audio._meta['openai/outputTemplate'], 'ui://voicelab/upload');
    assert.deepStrictEqual(byName.create_upload_session._meta.ui.visibility, ['app']);
    assert.strictEqual(byName.create_upload_session._meta['openai/visibility'], 'private');
    assert.strictEqual(byName.create_upload_session._meta['openai/widgetAccessible'], true);
    for (const name of ['create_meeting', 'speech_to_text']) {
      assert.strictEqual(byName[name].inputSchema.properties.upload_id.type, 'string');
      assert.match(byName[name].description, /upload_id \(preferred for large local files: a ready upload from upload_audio\)/);
      assert.deepStrictEqual(byName[name]._meta.ui.visibility, ['model', 'app']);
      assert.ok(!('oneOf' in byName[name].inputSchema));
    }
    assert.deepStrictEqual(byName.speech_to_text.inputSchema.required, ['language']);
    assert.ok(byName.create_meeting_from_file.inputSchema.$defs.OpenAIFile);
    assert.strictEqual(byName.get_profile._meta['openai/profile'], true);
    assert.ok(!byName.upload_spike);
    // Isolator is intentionally unchanged (no audio_url / upload_id).
    assert.ok(!('audio_url' in byName.isolate_voice.inputSchema.properties));
    assert.ok(!('upload_id' in byName.isolate_voice.inputSchema.properties));
  });

  it('listTools does not mutate the shared descriptors when upload sessions are on', () => {
    listTools({ apps: loadAppsConfig({ MCP_ENABLE_UPLOAD_SESSIONS: '1' }) });
    const off = Object.fromEntries(listTools().map((t) => [t.name, t]));
    assert.ok(!('upload_id' in (off.create_meeting.inputSchema.properties as object)));
  });
});

describe('tool error authentication challenges', () => {
  it('adds a sanitized relink challenge for upstream 401 errors', () => {
    const secret = 'vlk_must_not_leak';
    const result: any = serializeToolError(
      new VoiceLabError(`invalid key ${secret}`, 'unauthenticated', 401, 'req_auth')
    );

    assert.strictEqual(result.isError, true);
    assert.ok(Array.isArray(result._meta['mcp/www_authenticate']));
    assert.match(result._meta['mcp/www_authenticate'][0], /error="invalid_token"/);
    assert.match(result._meta['mcp/www_authenticate'][0], /oauth-protected-resource/);
    assert.ok(!JSON.stringify(result).includes(secret));
    assert.ok(!JSON.stringify(result).includes('req_auth'));
  });

  it('adds the challenge for an explicit invalid_api_key error', () => {
    const result: any = serializeToolError(
      new VoiceLabError('API key rejected', 'invalid_api_key', 403)
    );

    assert.strictEqual(result.isError, true);
    assert.ok(result._meta?.['mcp/www_authenticate']);
  });

  it('falls back to the production metadata URL for invalid or non-HTTPS audiences', () => {
    const previous = process.env.OAUTH_AUDIENCE;
    try {
      for (const audience of ['http://localhost:3100', 'not a URL']) {
        process.env.OAUTH_AUDIENCE = audience;
        const result: any = serializeToolError(
          new VoiceLabError('API key rejected', 'unauthenticated', 401)
        );
        const challenge = result._meta['mcp/www_authenticate'][0];
        assert.match(
          challenge,
          /resource_metadata="https:\/\/mcp\.voicelab\.uz\/\.well-known\/oauth-protected-resource"/
        );
        assert.ok(!challenge.includes(audience));
      }
    } finally {
      if (previous === undefined) delete process.env.OAUTH_AUDIENCE;
      else process.env.OAUTH_AUDIENCE = previous;
    }
  });

  it('preserves normal upstream errors without an authentication challenge', () => {
    const result: any = serializeToolError(
      new VoiceLabError('Insufficient credits', 'insufficient_credits', 402, 'req_billing')
    );

    assert.strictEqual(result.isError, true);
    assert.strictEqual(result._meta, undefined);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), {
      error: 'Insufficient credits',
      code: 'insufficient_credits',
      statusCode: 402,
    });
  });

  it('does not treat local errors with a statusCode field as upstream authentication failures', () => {
    const local = Object.assign(new Error('Local validation failed'), {
      code: 'unauthenticated',
      statusCode: 401,
    });
    const result: any = serializeToolError(local);

    assert.strictEqual(result._meta, undefined);
    assert.strictEqual(JSON.parse(result.content[0].text).error, 'Local validation failed');
  });
});
