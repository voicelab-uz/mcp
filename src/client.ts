/**
 * VoiceLab API error envelope
 */
export interface VoiceLabErrorResponse {
  message: string;
  error: {
    code: string;
    type?: string;
    message?: string;
    fields?: Record<string, string>;
  };
  request_id: string;
}

export class VoiceLabError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public requestId?: string,
    public fields?: Record<string, string>
  ) {
    super(message);
    this.name = 'VoiceLabError';
  }

  static fromResponse(statusCode: number, body: VoiceLabErrorResponse): VoiceLabError {
    const message = body.error.message || body.message;
    const code = body.error.code;
    return new VoiceLabError(message, code, statusCode, body.request_id, body.error.fields);
  }
}

export interface VoiceLabClientConfig {
  apiKey: string;
  baseUrl?: string;
}

export class VoiceLabClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: VoiceLabClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.voicelab.uz';
  }

  async request<T>(
    method: string,
    path: string,
    options: {
      headers?: Record<string, string>;
      body?: unknown;
      query?: Record<string, string>;
    } = {}
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      ...options.headers,
    };

    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      let errorBody: VoiceLabErrorResponse;
      try {
        errorBody = await response.json() as VoiceLabErrorResponse;
      } catch {
        throw new VoiceLabError(
          `HTTP ${response.status}: ${response.statusText}`,
          'unknown_error',
          response.status
        );
      }
      throw VoiceLabError.fromResponse(response.status, errorBody);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async requestBinary(
    method: string,
    path: string,
    options: {
      headers?: Record<string, string>;
      body?: unknown;
      query?: Record<string, string>;
    } = {}
  ): Promise<ArrayBuffer> {
    const url = new URL(path, this.baseUrl);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      ...options.headers,
    };

    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      let errorBody: VoiceLabErrorResponse;
      try {
        errorBody = await response.json() as VoiceLabErrorResponse;
      } catch {
        throw new VoiceLabError(
          `HTTP ${response.status}: ${response.statusText}`,
          'unknown_error',
          response.status
        );
      }
      throw VoiceLabError.fromResponse(response.status, errorBody);
    }

    return response.arrayBuffer();
  }

  async uploadMultipart<T>(
    path: string,
    fields: Record<string, string | Blob>,
    options: {
      headers?: Record<string, string>;
      query?: Record<string, string>;
    } = {}
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        url.searchParams.set(key, value);
      }
    }

    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      formData.append(key, value);
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      ...options.headers,
    };

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      let errorBody: VoiceLabErrorResponse;
      try {
        errorBody = await response.json() as VoiceLabErrorResponse;
      } catch {
        throw new VoiceLabError(
          `HTTP ${response.status}: ${response.statusText}`,
          'unknown_error',
          response.status
        );
      }
      throw VoiceLabError.fromResponse(response.status, errorBody);
    }

    if (response.status === 202 || response.status === 201 || response.status === 200) {
      return response.json() as Promise<T>;
    }

    throw new VoiceLabError('Unexpected response', 'unknown_error', response.status);
  }
}
