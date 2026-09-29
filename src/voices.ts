import { VoiceLabClient } from './client.js';

export interface Voice {
  id: string;
  display_name: string;
  description?: string;
  language: string;
  kind: 'system' | 'custom';
  visibility: 'public' | 'private';
  short_description?: string;
  orb_palette?: string;
}

export interface VoicesResponse {
  data: Voice[];
  request_id: string;
}

export class VoicesModule {
  constructor(private client: VoiceLabClient) {}

  async listVoices(language?: string): Promise<VoicesResponse> {
    const query: Record<string, string> = {};
    if (language) query.language = language;
    return this.client.request<VoicesResponse>('GET', '/v1/voices', { query });
  }
}
