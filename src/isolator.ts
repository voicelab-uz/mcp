import { VoiceLabClient } from './client.js';

export interface VoiceIsolationJob {
  id: string;
  title: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  processing_stage?: 'noise_reduction' | 'speech_restoration' | 'finalizing';
  duration_ms?: number;
  credits: number;
  audio_available: boolean;
  audio_format?: string;
  audio_status?: 'queued' | 'running' | 'completed' | 'failed';
  audio_url?: string;
  speech_restoration: boolean;
  restoration_model?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  original_filename?: string;
  original_content_type?: string;
  original_available?: boolean;
  original_audio_url?: string;
  input_audio_url?: string;
  denoised_audio_url?: string;
  output_sample_rate?: number;
  batch_id?: string;
  batch_index?: number;
  error_code?: string;
  request_id?: string;
}

export interface VoiceIsolationBatchResponse {
  id: string;
  data: VoiceIsolationJob[];
  request_id: string;
}

export interface VoiceIsolationsResponse {
  data: VoiceIsolationJob[];
  next_cursor: string | null;
  request_id: string;
}

export interface IsolationExport {
  job_id: string;
  format: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  filename?: string;
  audio_url?: string;
}

export class VoiceIsolatorModule {
  constructor(private client: VoiceLabClient) {}

  async isolateVoice(
    file: Blob,
    idempotencyKey: string,
    title?: string,
    speechRestoration: boolean = false,
    restorationModel?: string
  ): Promise<VoiceIsolationJob> {
    const fields: Record<string, string | Blob> = { file };
    if (title) fields.title = title;
    fields.speech_restoration = speechRestoration.toString();
    if (restorationModel) fields.restoration_model = restorationModel;

    return this.client.uploadMultipart<VoiceIsolationJob>('/v1/voice-isolations', fields, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  async isolateVoiceBatch(
    files: Blob[],
    idempotencyKey: string,
    speechRestoration: boolean = false,
    restorationModel?: string
  ): Promise<VoiceIsolationBatchResponse> {
    const fields: Record<string, string | Blob> = {};
    files.forEach((file, index) => {
      fields[`files`] = file;
    });
    fields.speech_restoration = speechRestoration.toString();
    if (restorationModel) fields.restoration_model = restorationModel;

    return this.client.uploadMultipart<VoiceIsolationBatchResponse>(
      '/v1/voice-isolations/batch',
      fields,
      { headers: { 'Idempotency-Key': idempotencyKey } }
    );
  }

  async listIsolations(limit: number = 20, cursor?: string): Promise<VoiceIsolationsResponse> {
    const query: Record<string, string> = { limit: limit.toString() };
    if (cursor) query.cursor = cursor;
    return this.client.request<VoiceIsolationsResponse>('GET', '/v1/voice-isolations', { query });
  }

  async getIsolation(isolationId: string): Promise<VoiceIsolationJob> {
    return this.client.request<VoiceIsolationJob>('GET', `/v1/voice-isolations/${isolationId}`);
  }

  async hideIsolation(isolationId: string): Promise<void> {
    return this.client.request<void>('DELETE', `/v1/voice-isolations/${isolationId}`);
  }

  async createExport(isolationId: string, format: string): Promise<IsolationExport> {
    return this.client.request<IsolationExport>(
      'POST',
      `/v1/voice-isolations/${isolationId}/exports`,
      { body: { format } }
    );
  }

  async getExport(isolationId: string, format: string): Promise<IsolationExport> {
    return this.client.request<IsolationExport>(
      'GET',
      `/v1/voice-isolations/${isolationId}/exports/${format}`
    );
  }
}
