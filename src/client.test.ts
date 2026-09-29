import { describe, it } from 'node:test';
import assert from 'node:assert';
import { VoiceLabClient, VoiceLabError } from './client.js';

describe('VoiceLabClient', () => {
  it('should create a client with default base URL', () => {
    const client = new VoiceLabClient({ apiKey: 'vlk_test' });
    assert.ok(client);
  });

  it('should create a client with custom base URL', () => {
    const client = new VoiceLabClient({
      apiKey: 'vlk_test',
      baseUrl: 'https://custom.example.com',
    });
    assert.ok(client);
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
