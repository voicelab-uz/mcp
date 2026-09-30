import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  VoiceLabClient,
  VoiceLabError,
  resolveSafeBaseUrl,
  buildSafeUrl,
} from './client.js';

describe('VoiceLabClient', () => {
  it('should create a client with default base URL', () => {
    const client = new VoiceLabClient({ apiKey: 'vlk_test' });
    assert.strictEqual(client.getBaseUrl(), 'https://api.voicelab.uz');
  });

  it('should reject non-allowlisted custom base URL', () => {
    assert.throws(
      () =>
        new VoiceLabClient({
          apiKey: 'vlk_test',
          baseUrl: 'https://custom.example.com',
        }),
      /allowlist/
    );
  });

  it('should allow custom origin when listed in VOICELAB_ALLOWED_API_ORIGINS', () => {
    const prev = process.env.VOICELAB_ALLOWED_API_ORIGINS;
    process.env.VOICELAB_ALLOWED_API_ORIGINS = 'https://custom.example.com';
    try {
      const client = new VoiceLabClient({
        apiKey: 'vlk_test',
        baseUrl: 'https://custom.example.com',
      });
      assert.strictEqual(client.getBaseUrl(), 'https://custom.example.com');
    } finally {
      if (prev === undefined) delete process.env.VOICELAB_ALLOWED_API_ORIGINS;
      else process.env.VOICELAB_ALLOWED_API_ORIGINS = prev;
    }
  });
});

describe('resolveSafeBaseUrl / buildSafeUrl', () => {
  it('rejects http base URLs', () => {
    assert.throws(() => resolveSafeBaseUrl('http://api.voicelab.uz'), /https/);
  });

  it('rejects absolute path overrides (SSRF)', () => {
    assert.throws(
      () => buildSafeUrl('https://api.voicelab.uz', 'https://evil.example/'),
      /Absolute URLs/
    );
  });

  it('builds relative paths under the API origin', () => {
    const url = buildSafeUrl('https://api.voicelab.uz', '/v1/voices');
    assert.strictEqual(url.toString(), 'https://api.voicelab.uz/v1/voices');
  });
});

describe('VoiceLabError', () => {
  it('should create error from response', () => {
    const errorResponse = {
      message: 'Test error',
      error: {
        code: 'test_error',
      },
      request_id: 'req_123',
    };

    const error = VoiceLabError.fromResponse(400, errorResponse);
    assert.strictEqual(error.message, 'Test error');
    assert.strictEqual(error.code, 'test_error');
    assert.strictEqual(error.statusCode, 400);
    assert.strictEqual(error.requestId, 'req_123');
  });

  it('should handle LLM error format', () => {
    const errorResponse = {
      message: 'Wrapper message',
      error: {
        message: 'LLM specific error',
        code: 'llm_error',
        type: 'request_error',
      },
      request_id: 'req_456',
    };

    const error = VoiceLabError.fromResponse(503, errorResponse);
    assert.strictEqual(error.message, 'LLM specific error');
    assert.strictEqual(error.code, 'llm_error');
  });
});
