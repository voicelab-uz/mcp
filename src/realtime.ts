import { VoiceLabClient } from './client.js';

export interface TicketRequest {
  transport: 'websocket';
  service: 'tts' | 'stt';
}

export interface TicketResponse {
  ticket: string;
  service: string;
  transport: string;
  scope: string;
  expires_at: string;
  websocket_url: string;
  request_id: string;
}

export class RealtimeModule {
  constructor(private client: VoiceLabClient) {}

  async createTicket(service: 'tts' | 'stt'): Promise<TicketResponse> {
    return this.client.request<TicketResponse>('POST', '/v1/ticket', {
      body: {
        transport: 'websocket',
        service,
      },
    });
  }
}
