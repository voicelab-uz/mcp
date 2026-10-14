import { type Tool } from '@modelcontextprotocol/sdk/types.js';
import { VoiceLabClient } from './client.js';
import { type AudioSource, audioSourceFields, toAudioSource } from './audio-source.js';

/**
 * Meeting AI types follow https://docs.voicelab.uz/api/meetings.
 * Unknown fields may appear (especially on capabilities); callers should tolerate extras.
 */

export type MeetingStatus = 'queued' | 'running' | 'transcribed' | 'ready' | 'failed';

export type MeetingStageStatus = 'waiting' | 'queued' | 'running' | 'ready' | 'failed';

export interface MeetingFailure {
  code: string;
  message?: string;
}

export interface MeetingStage {
  status: MeetingStageStatus | string;
  retryable: boolean;
  failure?: MeetingFailure;
}

export interface MeetingAudio {
  filename: string;
  content_type: string;
  size_bytes: number;
  duration_ms: number;
}

export interface MeetingTranscriptWord {
  text?: string;
  start_ms?: number;
  end_ms?: number;
  [key: string]: unknown;
}

export interface MeetingTranscriptSegment {
  speaker_id?: string;
  speaker?: string;
  text?: string;
  words?: MeetingTranscriptWord[];
  [key: string]: unknown;
}

export interface MeetingTranscript {
  text: string;
  language: string;
  language_probability: number;
  segments: MeetingTranscriptSegment[];
}

export interface MeetingEvidence {
  segment_ids?: string[] | number[];
  [key: string]: unknown;
}

export interface MeetingDecision {
  evidence?: MeetingEvidence;
  [key: string]: unknown;
}

export interface MeetingActionItem {
  owner?: string;
  evidence?: MeetingEvidence;
  [key: string]: unknown;
}

export interface MeetingNotes {
  version: number;
  summary: string;
  decisions: MeetingDecision[];
  action_items: MeetingActionItem[];
}

export interface MeetingProcessing {
  transcription: MeetingStage;
  notes: MeetingStage;
}

export interface Meeting {
  id: string;
  title: string;
  status: MeetingStatus | string;
  capture_source: string;
  created_at: string;
  updated_at: string;
  audio: MeetingAudio;
  transcript: MeetingTranscript;
  notes: MeetingNotes;
  versions: unknown[];
  processing: MeetingProcessing;
  failure?: MeetingFailure;
  [key: string]: unknown;
}

export interface MeetingEnvelope {
  meeting: Meeting;
  async?: boolean;
  request_id?: string;
}

export interface MeetingsListResponse {
  meetings: Meeting[];
  next_cursor?: string | null;
  request_id?: string;
}

export interface MeetingLanguage {
  code: string;
  name: string;
  native_name: string;
  [key: string]: unknown;
}

export interface MeetingCapabilitiesResponse {
  data: MeetingLanguage[];
  [key: string]: unknown;
}

export interface ListMeetingsOptions {
  limit?: number;
  cursor?: string;
  /** Comma-separated meeting IDs (up to 50). Sent instead of cursor when present. */
  ids?: string;
}

export interface CreateMeetingOptions {
  title?: string;
  language?: string;
  filename?: string;
}

export class MeetingsModule {
  constructor(private client: VoiceLabClient) {}

  /** GET /v1/meetings/capabilities — meetings:read */
  async getCapabilities(): Promise<MeetingCapabilitiesResponse> {
    return this.client.request<MeetingCapabilitiesResponse>('GET', '/v1/meetings/capabilities');
  }

  /**
   * POST /v1/meetings — meetings:write, UUID Idempotency-Key.
   * Exactly one multipart source: `audio` (file), `audio_url`, or `upload_id`.
   * A bare Blob is accepted for backwards compatibility (treated as a file).
   */
  async createMeeting(
    audio: AudioSource | Blob,
    idempotencyKey: string,
    options: CreateMeetingOptions = {}
  ): Promise<MeetingEnvelope> {
    let source = toAudioSource(audio, options.filename);
    if (source.kind === 'file' && options.filename && !source.filename) {
      source = { ...source, filename: options.filename };
    }
    const fields: Record<string, string | Blob> = audioSourceFields(source);
    if (options.title) fields.title = options.title;
    if (options.language) fields.language = options.language;

    return this.client.uploadMultipart<MeetingEnvelope>('/v1/meetings', fields, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  /** GET /v1/meetings — meetings:read; limit 1–50 (default 20); cursor or ids */
  async listMeetings(options: ListMeetingsOptions = {}): Promise<MeetingsListResponse> {
    const query: Record<string, string> = {
      limit: String(options.limit ?? 20),
    };
    // Docs: send `ids` instead of `cursor` when refreshing specific meetings.
    if (options.ids) {
      query.ids = options.ids;
    } else if (options.cursor) {
      query.cursor = options.cursor;
    }
    return this.client.request<MeetingsListResponse>('GET', '/v1/meetings', { query });
  }

  /** GET /v1/meetings/{id} — meetings:read */
  async getMeeting(meetingId: string): Promise<MeetingEnvelope> {
    return this.client.request<MeetingEnvelope>('GET', `/v1/meetings/${meetingId}`);
  }

  /** PATCH /v1/meetings/{id} — meetings:write; body is `{ title }` only */
  async renameMeeting(meetingId: string, title: string): Promise<MeetingEnvelope> {
    return this.client.request<MeetingEnvelope>('PATCH', `/v1/meetings/${meetingId}`, {
      body: { title },
    });
  }

  /** DELETE /v1/meetings/{id} — meetings:write; 204 No Content */
  async deleteMeeting(meetingId: string): Promise<void> {
    return this.client.request<void>('DELETE', `/v1/meetings/${meetingId}`);
  }

  /** POST /v1/meetings/{id}/notes/generations — meetings:write; 202 when status is transcribed */
  async regenerateNotes(meetingId: string): Promise<MeetingEnvelope> {
    return this.client.request<MeetingEnvelope>(
      'POST',
      `/v1/meetings/${meetingId}/notes/generations`
    );
  }

  /**
   * GET /v1/meetings/{id}/translations
   *
   * Docs (https://docs.voicelab.uz/api/meetings): translations are not available
   * with API keys. The dashboard route is `/api/v1/meetings/{id}/translations`
   * (user JWT). This method uses the developer `/v1` prefix so the API-key
   * client stays on the documented route family. Expect 403/404.
   */
  async getTranslations(meetingId: string): Promise<unknown> {
    return this.client.request<unknown>('GET', `/v1/meetings/${meetingId}/translations`);
  }
}

export const meetingTools: Tool[] = [
  {
    name: 'list_meeting_capabilities',
    description:
      'List Meeting AI supported recording languages and feature flags (GET /v1/meetings/capabilities). Requires meetings:read. Response `data` items have code, name, and native_name; allow unknown fields. Send one code as language on create_meeting, or omit language for automatic detection. Personal workspace keys only; team keys return 403 workspace_product_unavailable.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'create_meeting',
    description:
      'Submit a meeting recording for asynchronous transcription and notes (POST /v1/meetings). Provide exactly one audio source: upload_id (preferred for large files: a ready upload from upload_audio), audio_url (public HTTPS URL the API downloads), or audio_base64 (small files only: the MCP request body is capped at 10 MiB, so base64 audio must be under ~7 MB). Returns 202 Accepted with meeting (status queued). Poll get_meeting until status is ready, transcribed, or failed — not queued or running. Requires meetings:write and a UUID Idempotency-Key (auto-generated if omitted). Optional title (1–160 chars, single line; defaults to filename) and language (`auto` or a capabilities code; default auto). Limits: 500 MiB, 0.5 seconds–24 hours, MP3/WAV/M4A/AAC/OGG/Opus/WebM/Opus/FLAC, 10 queued or running meetings per account. Personal workspace keys only. Developer responses never include audio playback URLs.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        upload_id: {
          type: 'string',
          description: 'ID of a ready upload (upl_...) from upload_audio. Single-use. Mutually exclusive with audio_url and audio_base64.',
        },
        audio_url: {
          type: 'string',
          description: 'Public HTTPS URL of the recording (max 4096 chars). Mutually exclusive with upload_id and audio_base64.',
        },
        audio_base64: {
          type: 'string',
          description: 'Base64-encoded audio (MP3, WAV, M4A/AAC, OGG/Opus, WebM/Opus, or FLAC). Only for small files: keep under ~7 MB because the MCP request body is capped at 10 MiB. Mutually exclusive with upload_id and audio_url.',
        },
        title: {
          type: 'string',
          description: 'Optional title, 1–160 characters on one line; defaults to the filename without its extension',
        },
        language: {
          type: 'string',
          description: 'auto or a code from list_meeting_capabilities (default auto)',
        },
        filename: {
          type: 'string',
          description: 'Original filename used as the multipart filename when sending audio_base64 (and default title if title is omitted)',
        },
        idempotency_key: {
          type: 'string',
          description: 'Optional UUID idempotency key (auto-generated if omitted). Reuse for retries of the same upload.',
        },
      },
    },
    _meta: {
      ui: { visibility: ['model', 'app'] },
      'openai/widgetAccessible': true,
    },
  },
  {
    name: 'list_meetings',
    description:
      'List the account\'s meetings, newest first (GET /v1/meetings). Requires meetings:read. Optional limit defaults to 20 (1–50). Pass next_cursor as cursor for the next page. To refresh specific meetings, send ids as a comma-separated list of up to 50 meeting IDs instead of cursor. IDs that do not belong to the account are omitted. Invalid limit, cursor, or ids return 400 invalid_meeting_query.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Results per page (1–50, default 20)' },
        cursor: { type: 'string', description: 'Opaque pagination cursor from the previous next_cursor' },
        ids: {
          type: 'string',
          description: 'Comma-separated list of up to 50 meeting IDs to refresh (sent instead of cursor)',
        },
      },
    },
  },
  {
    name: 'get_meeting',
    description:
      'Read meeting status, speaker-labelled transcript, summary, decisions, and action items (GET /v1/meetings/{id}). Requires meetings:read. Poll every two seconds or follow Retry-After while status is queued or running. Terminal statuses: ready (transcript and notes complete), transcribed (transcript saved; notes failed — optionally regenerate_meeting_notes), failed (inspect failure.code). processing.transcription and processing.notes each report waiting/queued/running/ready/failed with retryable. Unknown, deleted, or another account\'s meetings return 404 meeting_not_found. Developer responses never include audio playback URLs.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        meeting_id: { type: 'string', description: 'Meeting ID from create_meeting or list_meetings (e.g. mtg_...)' },
      },
      required: ['meeting_id'],
    },
  },
  {
    name: 'rename_meeting',
    description:
      'Change a meeting\'s title (PATCH /v1/meetings/{id}). Requires meetings:write. Send only title, 1–160 characters on one line. Unknown fields return 422 validation_error. Returns the updated meeting. Not charged.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        meeting_id: { type: 'string', description: 'Meeting ID to rename' },
        title: { type: 'string', description: 'New title (1–160 characters, single line)' },
      },
      required: ['meeting_id', 'title'],
    },
  },
  {
    name: 'delete_meeting',
    description:
      'Delete a meeting and its results (DELETE /v1/meetings/{id}). Destructive. Requires meetings:write. Returns 204 No Content. Deleting a queued or running meeting releases its credit hold. Deleted meetings also disappear from the web app.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        meeting_id: { type: 'string', description: 'Meeting ID to delete' },
      },
      required: ['meeting_id'],
    },
  },
  {
    name: 'regenerate_meeting_notes',
    description:
      'Retry notes for a meeting whose notes generation failed (POST /v1/meetings/{id}/notes/generations). Requires meetings:write. Only meetings with status transcribed qualify; others return 409 meeting_notes_not_retryable. Billed again at the meeting\'s full duration. Returns 202 Accepted with meeting; poll get_meeting until status is no longer queued or running.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        meeting_id: { type: 'string', description: 'Meeting ID with status transcribed' },
      },
      required: ['meeting_id'],
    },
  },
  {
    name: 'get_meeting_translations',
    description:
      'Attempt to read meeting translations (GET /v1/meetings/{id}/translations). Docs state translations are not available with API keys; the dashboard uses JWT /api/v1/meetings/{id}/translations. The developer contract does not document this endpoint. Expect 403 insufficient_scope or 404. Included so agents can attempt the call; do not treat success as guaranteed.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        meeting_id: { type: 'string', description: 'Meeting ID' },
      },
      required: ['meeting_id'],
    },
  },
];
