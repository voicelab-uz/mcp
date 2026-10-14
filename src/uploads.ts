import { VoiceLabClient } from './client.js';

/**
 * Upload sessions (POST /v1/uploads, GET /v1/uploads/{id}).
 *
 * Flow: the MCP server creates a session with the user's API key and hands the
 * single-use `upload_token` to the MCP Apps view ONLY via result `_meta`. The view
 * PUTs the file bytes straight to `upload_url` with header `X-Upload-Token`
 * (no Authorization header), then calls create_meeting / speech_to_text with
 * `upload_id`. Tokens expire after ~15 minutes and are burned on first PUT.
 */

export type UploadPurpose = 'meeting' | 'stt';

export const UPLOAD_PURPOSES: readonly UploadPurpose[] = ['meeting', 'stt'] as const;

export const UPLOAD_ID_PATTERN = /^upl_[A-Za-z0-9]{20,40}$/;

export type UploadStatus = 'pending' | 'uploading' | 'ready' | 'consumed' | 'failed' | 'expired' | string;

export interface Upload {
  id: string;
  purpose: UploadPurpose | string;
  status: UploadStatus;
  filename?: string | null;
  content_type?: string | null;
  size_bytes?: number | null;
  duration_ms?: number | null;
  created_at?: string;
  expires_at?: string;
  consumed_at?: string | null;
  consumed_resource_id?: string | null;
  max_bytes?: number;
  failure?: { code: string } | null;
  [key: string]: unknown;
}

export interface CreateUploadSessionOptions {
  filename?: string;
  content_type?: string;
  size_bytes?: number;
}

export interface UploadSessionResponse {
  upload: Upload;
  upload_url: string;
  upload_token: string;
  request_id?: string;
}

export interface UploadEnvelope {
  upload: Upload;
  request_id?: string;
}

export function isUploadPurpose(value: unknown): value is UploadPurpose {
  return value === 'meeting' || value === 'stt';
}

export class UploadsModule {
  constructor(private client: VoiceLabClient) {}

  /**
   * POST /v1/uploads — scope meetings:write (purpose meeting) or stt:write (purpose stt).
   * Returns 201 with upload, upload_url and single-use upload_token.
   */
  async createSession(
    purpose: UploadPurpose,
    options: CreateUploadSessionOptions = {}
  ): Promise<UploadSessionResponse> {
    if (!isUploadPurpose(purpose)) {
      throw new Error('purpose must be "meeting" or "stt"');
    }
    const body: Record<string, unknown> = { purpose };
    if (options.filename) body.filename = options.filename;
    if (options.content_type) body.content_type = options.content_type;
    if (typeof options.size_bytes === 'number' && Number.isFinite(options.size_bytes) && options.size_bytes > 0) {
      body.size_bytes = Math.floor(options.size_bytes);
    }
    return this.client.request<UploadSessionResponse>('POST', '/v1/uploads', { body });
  }

  /** GET /v1/uploads/{id} — owner-scoped; foreign or unknown ids return 404 upload_not_found. */
  async get(uploadId: string): Promise<UploadEnvelope> {
    if (!UPLOAD_ID_PATTERN.test(uploadId)) {
      throw new Error('upload_id must match upl_[A-Za-z0-9]{20,40}');
    }
    return this.client.request<UploadEnvelope>('GET', `/v1/uploads/${uploadId}`);
  }
}
