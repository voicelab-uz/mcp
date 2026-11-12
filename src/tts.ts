import { VoiceLabClient } from './client.js';

export interface Language {
  code: string;
  name: string;
  native_name: string;
}

export interface ModelOutput {
  format: string;
  label?: string;
  content_type?: string;
  sample_rate: number;
  streaming: boolean;
}

export interface TTSModel {
  id: string;
  name?: string;
  badge?: string;
  description?: string;
  recommended?: boolean;
  languages: string[];
  outputs: ModelOutput[];
}

export interface TTSLanguagesResponse {
  provider: string;
  sample_rate: number;
  data: Language[];
  models: TTSModel[];
}

export interface TTSRequest {
  text: string;
  language: string;
  voice_id: string;
  speed?: number;
}

export interface TTSGeneration {
  id: string;
  status?: 'queued' | 'processing' | 'completed' | 'failed';
  text?: string;
  text_preview?: string;
  voice?: {
    id: string;
    name: string;
    language: string;
  };
  speed?: number;
  duration_ms?: number;
  sample_rate?: number;
  audio_url?: string;
  audio_url_expires_at?: string;
  audio_available?: boolean;
  created_at: string;
}

export interface TTSGenerationsResponse {
  data: TTSGeneration[];
  next_cursor: string | null;
  request_id: string;
}

const generationIdPattern = /^gen_[A-Za-z0-9_-]{1,120}$/;

export type TTSGenerateResult =
  | { status: 'completed'; audio: ArrayBuffer; generationId?: string }
  | { status: 'queued' | 'processing'; generationId: string };

export class TTSModule {
  constructor(private client: VoiceLabClient) {}

  async listLanguages(): Promise<TTSLanguagesResponse> {
    return this.client.request<TTSLanguagesResponse>('GET', '/v1/tts/languages');
  }

  async generateSpeech(request: TTSRequest, idempotencyKey: string): Promise<TTSGenerateResult> {
    const response = await this.client.requestBinaryResponse('POST', '/v1/tts', {
      headers: { 'Idempotency-Key': idempotencyKey },
      body: request,
    });
    const headerId = response.headers.get('X-VoiceLab-Generation-ID');
    if (response.status === 202) {
      const body = await response.json() as { id?: unknown; status?: unknown };
      if (
        typeof body.id !== 'string' || !generationIdPattern.test(body.id) ||
        (body.status !== 'queued' && body.status !== 'processing') ||
        (headerId && headerId !== body.id)
      ) throw new Error('Unexpected queued TTS response');
      return { status: body.status, generationId: body.id };
    }
    if (response.status !== 200) throw new Error('Unexpected TTS response status');
    const generationId = headerId && generationIdPattern.test(headerId) ? headerId : undefined;
    return { status: 'completed', audio: await response.arrayBuffer(), ...(generationId ? { generationId } : {}) };
  }

  async listGenerations(limit: number = 30, cursor?: string): Promise<TTSGenerationsResponse> {
    const query: Record<string, string> = { limit: limit.toString() };
    if (cursor) query.cursor = cursor;
    return this.client.request<TTSGenerationsResponse>('GET', '/v1/tts/generations', { query });
  }

  async getGeneration(generationId: string): Promise<TTSGeneration> {
    return this.client.request<TTSGeneration>('GET', `/v1/tts/generations/${generationId}`);
  }

  async deleteGeneration(generationId: string): Promise<void> {
    return this.client.request<void>('DELETE', `/v1/tts/generations/${generationId}`);
  }
}
