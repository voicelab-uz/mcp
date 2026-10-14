import { describe, it } from 'node:test';
import assert from 'node:assert';
import { UploadsModule, UPLOAD_ID_PATTERN } from './uploads.js';

class FakeClient {
  calls: Array<{ method: string; path: string; options: any }> = [];
  async request<T>(method: string, path: string, options: any = {}): Promise<T> {
    this.calls.push({ method, path, options });
    return {} as T;
  }
}

describe('UploadsModule', () => {
  it('creates a session with POST /v1/uploads and only provided fields', async () => {
    const client = new FakeClient();
    const uploads = new UploadsModule(client as never);
    await uploads.createSession('stt');
    await uploads.createSession('meeting', { filename: 'a.mp3', content_type: 'audio/mpeg', size_bytes: 10 });
    await uploads.createSession('meeting', { size_bytes: -1 });
    assert.deepStrictEqual(client.calls[0], { method: 'POST', path: '/v1/uploads', options: { body: { purpose: 'stt' } } });
    assert.deepStrictEqual(client.calls[1].options.body, {
      purpose: 'meeting',
      filename: 'a.mp3',
      content_type: 'audio/mpeg',
      size_bytes: 10,
    });
    assert.deepStrictEqual(client.calls[2].options.body, { purpose: 'meeting' });
  });

  it('rejects unknown purposes', async () => {
    const uploads = new UploadsModule(new FakeClient() as never);
    await assert.rejects(() => uploads.createSession('video' as never), /purpose/);
  });

  it('gets an upload by validated id', async () => {
    const client = new FakeClient();
    const uploads = new UploadsModule(client as never);
    await uploads.get('upl_0123456789abcdefghij');
    assert.deepStrictEqual(client.calls[0], { method: 'GET', path: '/v1/uploads/upl_0123456789abcdefghij', options: {} });
    await assert.rejects(() => uploads.get('upl_../../v1/admin'), /upl_/);
  });

  it('upload id pattern matches the backend contract', () => {
    assert.ok(UPLOAD_ID_PATTERN.test('upl_' + 'a'.repeat(20)));
    assert.ok(UPLOAD_ID_PATTERN.test('upl_' + 'A1'.repeat(20)));
    assert.ok(!UPLOAD_ID_PATTERN.test('upl_' + 'a'.repeat(19)));
    assert.ok(!UPLOAD_ID_PATTERN.test('upl_' + 'a'.repeat(41)));
    assert.ok(!UPLOAD_ID_PATTERN.test('upl_' + 'a'.repeat(20) + '-'));
  });
});
