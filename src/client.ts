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

/** Default allowlist — prevents SSRF via VOICELAB_BASE_URL or absolute paths. */
const DEFAULT_ALLOWED_API_ORIGINS = ['https://api.voicelab.uz'] as const;

function allowedApiOrigins(): Set<string> {
  const fromEnv = process.env.VOICELAB_ALLOWED_API_ORIGINS;
  if (fromEnv && fromEnv.trim()) {
    return new Set(
      fromEnv
        .split(',')
        .map((s) => s.trim().replace(/\/$/, ''))
        .filter(Boolean)
    );
  }
  return new Set(DEFAULT_ALLOWED_API_ORIGINS);
}

/**
 * Normalize and validate API base URL against an HTTPS allowlist (SSRF lock).
 */
export function resolveSafeBaseUrl(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('Invalid VOICELAB_BASE_URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('VOICELAB_BASE_URL must use https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('VOICELAB_BASE_URL must not contain credentials');
  }
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname.endsWith('.local')) {
    throw new Error('VOICELAB_BASE_URL host is not allowed');
  }

  const origin = parsed.origin;
  if (!allowedApiOrigins().has(origin)) {
    throw new Error('VOICELAB_BASE_URL origin is not in the allowlist');
  }

  // Keep pathname prefix if present (e.g. https://api.voicelab.uz/v1), strip trailing slash
  const path = parsed.pathname.replace(/\/$/, '');
  return path && path !== '/' ? `${origin}${path}` : origin;
}

/**
 * Build a request URL that cannot escape the configured API origin.
 */
export function buildSafeUrl(baseUrl: string, path: string): URL {
  if (/^https?:\/\//i.test(path) || path.startsWith('//')) {
    throw new Error('Absolute URLs are not allowed in API paths');
  }
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  const baseOrigin = new URL(baseUrl).origin;
  if (url.origin !== baseOrigin) {
    throw new Error('Request URL origin mismatch (SSRF blocked)');
  }
  if (url.protocol !== 'https:') {
    throw new Error('Request URL must use https');
  }
  return url;
}

export class VoiceLabClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: VoiceLabClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = resolveSafeBaseUrl(config.baseUrl || 'https://api.voicelab.uz');
  }

  /** Exposed for tests — never log this in production paths. */
  getBaseUrl(): string {
    return this.baseUrl;
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
    const url = buildSafeUrl(this.baseUrl, path);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
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
        errorBody = (await response.json()) as VoiceLabErrorResponse;
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
    const url = buildSafeUrl(this.baseUrl, path);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
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
        errorBody = (await response.json()) as VoiceLabErrorResponse;
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
    const url = buildSafeUrl(this.baseUrl, path);
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
      Authorization: `Bearer ${this.apiKey}`,
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
        errorBody = (await response.json()) as VoiceLabErrorResponse;
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
