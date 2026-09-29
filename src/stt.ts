import { VoiceLabClient } from './client.js';

export interface Word {
  ordinal: number;
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface Segment {
  ordinal: number;
  start_ms: number;
  end_ms: number;
  text: string;
  speaker?: string;
  words?: Word[];
}

export interface Speaker {
  id: string;
  display_name: string;
}

export interface Transcription {
  id: string;
  title?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  transcript?: string;
  language: string;
  duration_ms?: number;
  audio_available: boolean;
  audio_url?: string;
  segments?: Segment[];
  speakers?: Speaker[];
  speakers_available: boolean;
  created_at: string;
  updated_at?: string;
  revision?: number;
  error?: {
    code: string;
    message: string;
  };
  request_id?: string;
}

export interface TranscriptionSummary {
  id: string;
  title?: string;
  language: string;
  duration_ms?: number;
  audio_available: boolean;
  created_at: string;
}

export interface TranscriptionsResponse {
  data: TranscriptionSummary[];
  next_cursor: string | null;
  request_id: string;
}

export interface EditorDocument {
  revision: number;
  title?: string;
  transcript?: string;
  segments?: Segment[];
  speakers?: Speaker[];
}

export class STTModule {
  constructor(private client: VoiceLabClient) {}

  async transcribeAudio(
    audio: Blob,
    language: string,
    idempotencyKey: string,
    includeSpeakers: boolean = false
  ): Promise<Transcription> {
    return this.client.uploadMultipart<Transcription>('/v1/stt', {
      audio,
      language,
      include_speakers: includeSpeakers.toString(),
    }, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  async listTranscriptions(limit: number = 10, cursor?: string): Promise<TranscriptionsResponse> {
    const query: Record<string, string> = { limit: limit.toString() };
    if (cursor) query.cursor = cursor;
    return this.client.request<TranscriptionsResponse>('GET', '/v1/stt/transcriptions', { query });
  }

  async getTranscription(transcriptionId: string): Promise<Transcription> {
    return this.client.request<Transcription>('GET', `/v1/stt/transcriptions/${transcriptionId}`);
  }

  async updateTitle(transcriptionId: string, title: string): Promise<Transcription> {
    return this.client.request<Transcription>('PATCH', `/v1/stt/transcriptions/${transcriptionId}`, {
      body: { title },
    });
  }

  async updateDocument(transcriptionId: string, document: EditorDocument): Promise<Transcription> {
    return this.client.request<Transcription>(
      'PUT',
      `/v1/stt/transcriptions/${transcriptionId}/editor`,
      { body: document }
    );
  }

  async deleteTranscription(transcriptionId: string): Promise<void> {
    return this.client.request<void>('DELETE', `/v1/stt/transcriptions/${transcriptionId}`);
  }

  async exportTranscription(
    transcriptionId: string,
    format: 'txt' | 'json' | 'srt' | 'vtt'
  ): Promise<ArrayBuffer> {
    return this.client.requestBinary('GET', `/v1/stt/transcriptions/${transcriptionId}/export`, {
      query: { format },
    });
  }
}
