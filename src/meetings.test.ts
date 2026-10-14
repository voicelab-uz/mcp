import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MeetingsModule, meetingTools } from './meetings.js';

interface CapturedCall {
  kind: 'request' | 'upload';
  method?: string;
  path: string;
  options?: {
    headers?: Record<string, string>;
    body?: unknown;
    query?: Record<string, string>;
  };
  fields?: Record<string, string | Blob>;
}

class FakeClient {
  calls: CapturedCall[] = [];
  nextResponse: unknown = { meeting: { id: 'mtg_test' } };

  async request<T>(
    method: string,
    path: string,
    options: {
      headers?: Record<string, string>;
      body?: unknown;
      query?: Record<string, string>;
    } = {}
  ): Promise<T> {
    this.calls.push({ kind: 'request', method, path, options });
    return this.nextResponse as T;
  }

  async uploadMultipart<T>(
    path: string,
    fields: Record<string, string | Blob>,
    options: { headers?: Record<string, string> } = {}
  ): Promise<T> {
    this.calls.push({ kind: 'upload', path, fields, options });
    return this.nextResponse as T;
  }
}

function moduleWithFake(): { meetings: MeetingsModule; client: FakeClient } {
  const client = new FakeClient();
  const meetings = new MeetingsModule(client as never);
  return { meetings, client };
}

describe('MeetingsModule paths and payloads', () => {
  it('gets capabilities from GET /v1/meetings/capabilities', async () => {
    const { meetings, client } = moduleWithFake();
    client.nextResponse = { data: [{ code: 'en', name: 'English', native_name: 'English' }] };
    const result = await meetings.getCapabilities();
    assert.strictEqual(client.calls[0].method, 'GET');
    assert.strictEqual(client.calls[0].path, '/v1/meetings/capabilities');
    assert.strictEqual(result.data[0].code, 'en');
  });

  it('uploads audio as multipart field audio with Idempotency-Key', async () => {
    const { meetings, client } = moduleWithFake();
    const audio = new Blob([new Uint8Array([1, 2, 3])]);
    await meetings.createMeeting(audio, '550e8400-e29b-41d4-a716-446655440000', {
      title: 'Weekly sync',
      language: 'en',
      filename: 'weekly-sync.mp3',
    });
    const call = client.calls[0];
    assert.strictEqual(call.kind, 'upload');
    assert.strictEqual(call.path, '/v1/meetings');
    assert.ok(call.fields && 'audio' in call.fields);
    assert.ok(!call.fields || !('file' in call.fields));
    assert.strictEqual(call.fields?.title, 'Weekly sync');
    assert.strictEqual(call.fields?.language, 'en');
    assert.strictEqual(call.options?.headers?.['Idempotency-Key'], '550e8400-e29b-41d4-a716-446655440000');
    assert.ok(call.fields?.audio instanceof File);
    assert.strictEqual((call.fields?.audio as File).name, 'weekly-sync.mp3');
  });

  it('omits optional create fields when not provided', async () => {
    const { meetings, client } = moduleWithFake();
    await meetings.createMeeting(new Blob([new Uint8Array([0])]), 'key-1');
    const fields = client.calls[0].fields || {};
    assert.deepStrictEqual(Object.keys(fields), ['audio']);
  });

  it('sends audio_url as the only source field for url sources', async () => {
    const { meetings, client } = moduleWithFake();
    await meetings.createMeeting({ kind: 'url', url: 'https://cdn.example.com/a.mp3' }, 'key-1', {
      title: 'From URL',
    });
    const fields = client.calls[0].fields || {};
    assert.deepStrictEqual(Object.keys(fields).sort(), ['audio_url', 'title']);
    assert.strictEqual(fields.audio_url, 'https://cdn.example.com/a.mp3');
  });

  it('sends upload_id as the only source field for upload sources', async () => {
    const { meetings, client } = moduleWithFake();
    await meetings.createMeeting({ kind: 'upload', id: 'upl_abcdefghijklmnopqrstu' }, 'key-1', {
      filename: 'ignored.mp3',
    });
    const fields = client.calls[0].fields || {};
    assert.deepStrictEqual(Object.keys(fields), ['upload_id']);
    assert.strictEqual(fields.upload_id, 'upl_abcdefghijklmnopqrstu');
  });

  it('accepts a file AudioSource with filename', async () => {
    const { meetings, client } = moduleWithFake();
    await meetings.createMeeting(
      { kind: 'file', blob: new Blob([new Uint8Array([1])]), filename: 'x.wav' },
      'key-1'
    );
    const fields = client.calls[0].fields || {};
    assert.deepStrictEqual(Object.keys(fields), ['audio']);
    assert.strictEqual((fields.audio as File).name, 'x.wav');
  });

  it('lists meetings with default limit 20', async () => {
    const { meetings, client } = moduleWithFake();
    client.nextResponse = { meetings: [], next_cursor: null };
    await meetings.listMeetings();
    assert.strictEqual(client.calls[0].method, 'GET');
    assert.strictEqual(client.calls[0].path, '/v1/meetings');
    assert.deepStrictEqual(client.calls[0].options?.query, { limit: '20' });
  });

  it('sends ids instead of cursor when refreshing selected meetings', async () => {
    const { meetings, client } = moduleWithFake();
    await meetings.listMeetings({
      limit: 10,
      cursor: 'should-be-ignored',
      ids: 'mtg_1,mtg_2',
    });
    assert.deepStrictEqual(client.calls[0].options?.query, {
      limit: '10',
      ids: 'mtg_1,mtg_2',
    });
  });

  it('sends cursor when ids is absent', async () => {
    const { meetings, client } = moduleWithFake();
    await meetings.listMeetings({ cursor: 'abc' });
    assert.deepStrictEqual(client.calls[0].options?.query, {
      limit: '20',
      cursor: 'abc',
    });
  });

  it('gets a meeting by id', async () => {
    const { meetings, client } = moduleWithFake();
    await meetings.getMeeting('mtg_550e8400-e29b-41d4-a716-446655440000');
    assert.strictEqual(client.calls[0].method, 'GET');
    assert.strictEqual(
      client.calls[0].path,
      '/v1/meetings/mtg_550e8400-e29b-41d4-a716-446655440000'
    );
  });

  it('renames with PATCH and title-only JSON body', async () => {
    const { meetings, client } = moduleWithFake();
    await meetings.renameMeeting('mtg_1', 'Weekly sync — product');
    assert.strictEqual(client.calls[0].method, 'PATCH');
    assert.strictEqual(client.calls[0].path, '/v1/meetings/mtg_1');
    assert.deepStrictEqual(client.calls[0].options?.body, { title: 'Weekly sync — product' });
  });

  it('deletes with DELETE /v1/meetings/{id}', async () => {
    const { meetings, client } = moduleWithFake();
    await meetings.deleteMeeting('mtg_1');
    assert.strictEqual(client.calls[0].method, 'DELETE');
    assert.strictEqual(client.calls[0].path, '/v1/meetings/mtg_1');
  });

  it('regenerates notes with POST /v1/meetings/{id}/notes/generations', async () => {
    const { meetings, client } = moduleWithFake();
    await meetings.regenerateNotes('mtg_1');
    assert.strictEqual(client.calls[0].method, 'POST');
    assert.strictEqual(client.calls[0].path, '/v1/meetings/mtg_1/notes/generations');
    assert.strictEqual(client.calls[0].options?.body, undefined);
  });

  it('requests translations on the developer /v1 prefix', async () => {
    const { meetings, client } = moduleWithFake();
    await meetings.getTranslations('mtg_1');
    assert.strictEqual(client.calls[0].method, 'GET');
    assert.strictEqual(client.calls[0].path, '/v1/meetings/mtg_1/translations');
  });

  it('never uses the dashboard /api/v1/meetings prefix', async () => {
    const { meetings, client } = moduleWithFake();
    await meetings.getCapabilities();
    await meetings.listMeetings();
    await meetings.getMeeting('mtg_1');
    await meetings.renameMeeting('mtg_1', 't');
    await meetings.deleteMeeting('mtg_1');
    await meetings.regenerateNotes('mtg_1');
    await meetings.getTranslations('mtg_1');
    for (const call of client.calls) {
      assert.ok(call.path.startsWith('/v1/meetings'), call.path);
      assert.ok(!call.path.startsWith('/api/'), call.path);
    }
  });
});

describe('meetingTools annotations', () => {
  const byName = Object.fromEntries(meetingTools.map((tool) => [tool.name, tool]));

  it('registers the documented Meeting AI tools plus flagged translations', () => {
    assert.deepStrictEqual(
      meetingTools.map((tool) => tool.name),
      [
        'list_meeting_capabilities',
        'create_meeting',
        'list_meetings',
        'get_meeting',
        'rename_meeting',
        'delete_meeting',
        'regenerate_meeting_notes',
        'get_meeting_translations',
      ]
    );
  });

  it('marks read tools read-only and open-world', () => {
    for (const name of [
      'list_meeting_capabilities',
      'list_meetings',
      'get_meeting',
      'get_meeting_translations',
    ]) {
      assert.strictEqual(byName[name].annotations?.readOnlyHint, true);
      assert.strictEqual(byName[name].annotations?.destructiveHint, false);
      assert.strictEqual(byName[name].annotations?.openWorldHint, true);
    }
  });

  it('marks writes non-readonly and only delete as destructive', () => {
    assert.strictEqual(byName.create_meeting.annotations?.readOnlyHint, false);
    assert.strictEqual(byName.create_meeting.annotations?.destructiveHint, false);
    assert.strictEqual(byName.rename_meeting.annotations?.readOnlyHint, false);
    assert.strictEqual(byName.rename_meeting.annotations?.destructiveHint, false);
    assert.strictEqual(byName.regenerate_meeting_notes.annotations?.readOnlyHint, false);
    assert.strictEqual(byName.regenerate_meeting_notes.annotations?.destructiveHint, false);
    assert.strictEqual(byName.delete_meeting.annotations?.readOnlyHint, false);
    assert.strictEqual(byName.delete_meeting.annotations?.destructiveHint, true);
    assert.strictEqual(byName.delete_meeting.annotations?.openWorldHint, true);
  });

  it('accepts exclusive audio sources on create (none required) and meeting_id on resource tools', () => {
    assert.strictEqual(byName.create_meeting.inputSchema.required, undefined);
    const props = Object.keys(byName.create_meeting.inputSchema.properties || {});
    for (const key of ['audio_url', 'audio_base64', 'title', 'language', 'filename', 'idempotency_key']) {
      assert.ok(props.includes(key), key);
    }
    // Base descriptor = upload sessions off; tools.ts adds upload_id when enabled.
    assert.ok(!props.includes('upload_id'));
    assert.ok(!/upload_id|upload_audio/.test(byName.create_meeting.description || ''));
    assert.ok(!('oneOf' in byName.create_meeting.inputSchema));
    assert.deepStrictEqual((byName.create_meeting._meta as any)?.ui?.visibility, ['model', 'app']);
    assert.match(byName.create_meeting.description || '', /7 MB/);
    assert.deepStrictEqual(byName.get_meeting.inputSchema.required, ['meeting_id']);
    assert.deepStrictEqual(byName.rename_meeting.inputSchema.required, ['meeting_id', 'title']);
    assert.deepStrictEqual(byName.delete_meeting.inputSchema.required, ['meeting_id']);
    assert.deepStrictEqual(byName.regenerate_meeting_notes.inputSchema.required, ['meeting_id']);
    assert.deepStrictEqual(byName.get_meeting_translations.inputSchema.required, ['meeting_id']);
  });
});
