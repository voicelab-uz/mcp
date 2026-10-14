import { type Tool } from '@modelcontextprotocol/sdk/types.js';
import { UPLOAD_RESOURCE_URI, SPIKE_RESOURCE_URI } from './resources.js';

/**
 * Tool descriptors for audio ingestion beyond inline base64:
 *  - MCP Apps upload view (upload_audio, create_upload_session [app-only], get_upload)
 *  - ChatGPT file params (create_meeting_from_file, transcribe_file)
 *  - Phase 0 spike (upload_spike, upload_spike_done [app-only]) — gated by MCP_ENABLE_SPIKE=1
 */

/** OpenAI Apps SDK file object: all four properties declared, only download_url + file_id required. */
export const OPENAI_FILE_DEF = {
  type: 'object',
  properties: {
    download_url: { type: 'string', description: 'Temporary download URL provided by ChatGPT' },
    file_id: { type: 'string', description: 'ChatGPT file ID' },
    mime_type: { type: 'string', description: 'MIME type, if known' },
    file_name: { type: 'string', description: 'Original filename, if known' },
  },
  required: ['download_url', 'file_id'],
} as const;

const purposeSchema = {
  type: 'string',
  enum: ['meeting', 'stt'],
  description: 'meeting = Meeting AI (transcript + summary, decisions, action items); stt = plain speech-to-text transcription',
} as const;

const APP_ONLY_META = {
  ui: { visibility: ['app'] },
  'openai/widgetAccessible': true,
  'openai/visibility': 'private',
} as const;

export const uploadTools: Tool[] = [
  {
    name: 'upload_audio',
    description:
      'Let the user upload an audio file (up to 500 MB) from their device to VoiceLab. Use this when the user wants to transcribe or create meeting notes from a local recording that is too large to send as base64 (over ~7 MB) or that you cannot read. Opens an upload widget in clients that support MCP Apps; the file goes directly to VoiceLab and processing starts automatically (create_meeting for purpose meeting, speech_to_text for purpose stt). The widget then posts a follow-up message with the meeting_id or transcription_id to poll. Clients without widgets get a text fallback.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        purpose: purposeSchema,
        title: { type: 'string', description: 'Optional meeting title (purpose meeting only), 1–160 characters' },
        language: {
          type: 'string',
          description: 'Language code. Optional for meeting (default auto); for stt use uz, en, or ru (the user can change it in the widget)',
        },
        include_speakers: { type: 'boolean', description: 'Speaker diarization for purpose stt (default false)' },
      },
      required: ['purpose'],
    },
    _meta: {
      ui: { resourceUri: UPLOAD_RESOURCE_URI, visibility: ['model', 'app'] },
      'openai/outputTemplate': UPLOAD_RESOURCE_URI,
      'openai/toolInvocation/invoking': 'Preparing upload…',
      'openai/toolInvocation/invoked': 'Upload ready',
    },
  },
  {
    name: 'create_upload_session',
    description:
      'App-only: create a fresh single-use upload session for the VoiceLab upload widget (e.g. after the previous token expired or was used). Not intended for the model; use upload_audio instead.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        purpose: purposeSchema,
        filename: { type: 'string', description: 'Original filename (max 255 characters)' },
        content_type: { type: 'string', description: 'MIME type reported by the browser' },
        size_bytes: { type: 'number', description: 'File size in bytes' },
      },
      required: ['purpose'],
    },
    _meta: { ...APP_ONLY_META },
  },
  {
    name: 'get_upload',
    description:
      'Get the status of an upload session (GET /v1/uploads/{id}): pending, ready, consumed, failed, or expired, with filename, size, duration and consumed_resource_id (the meeting or transcription created from it). Use after the user says they uploaded via the browser link, then call create_meeting or speech_to_text with upload_id once status is ready.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        upload_id: { type: 'string', description: 'Upload ID (upl_...)' },
      },
      required: ['upload_id'],
    },
    _meta: {
      ui: { visibility: ['model', 'app'] },
      'openai/widgetAccessible': true,
    },
  },
];

export const fileParamTools: Tool[] = [
  {
    name: 'create_meeting_from_file',
    description:
      'ChatGPT only: create a VoiceLab meeting (transcript + notes) from an audio file the user attached in ChatGPT. VoiceLab downloads the file directly; poll get_meeting with the returned meeting id until status is ready, transcribed, or failed. Other clients should use create_meeting with audio_url or audio_base64.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      $defs: { OpenAIFile: OPENAI_FILE_DEF },
      properties: {
        file: { $ref: '#/$defs/OpenAIFile' },
        title: { type: 'string', description: 'Optional title, 1–160 characters; defaults to the filename' },
        language: { type: 'string', description: 'auto or a code from list_meeting_capabilities (default auto)' },
        idempotency_key: {
          type: 'string',
          description: 'Optional UUID idempotency key (default: derived from the file id, so retries of the same file are deduplicated)',
        },
      },
      required: ['file'],
    },
    _meta: {
      'openai/fileParams': ['file'],
      'openai/toolInvocation/invoking': 'Sending recording to VoiceLab…',
      'openai/toolInvocation/invoked': 'Meeting queued',
    },
  },
  {
    name: 'transcribe_file',
    description:
      'ChatGPT only: transcribe an audio file the user attached in ChatGPT with VoiceLab speech-to-text. VoiceLab downloads the file directly; poll get_transcription with the returned id until status is completed. Other clients should use speech_to_text with audio_url or audio_base64.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      $defs: { OpenAIFile: OPENAI_FILE_DEF },
      properties: {
        file: { $ref: '#/$defs/OpenAIFile' },
        language: { type: 'string', description: 'Language code (uz, en, ru)' },
        include_speakers: { type: 'boolean', description: 'Enable speaker diarization (default false)' },
        idempotency_key: {
          type: 'string',
          description: 'Optional UUID idempotency key (default: derived from the file id)',
        },
      },
      required: ['file', 'language'],
    },
    _meta: {
      'openai/fileParams': ['file'],
      'openai/toolInvocation/invoking': 'Sending audio to VoiceLab…',
      'openai/toolInvocation/invoked': 'Transcription queued',
    },
  },
];

export const spikeTools: Tool[] = [
  {
    name: 'upload_spike',
    description:
      'STAGING DIAGNOSTICS ONLY: open the VoiceLab MCP Apps spike view to test file picking, cross-origin upload, tool-result metadata and ui/message in this client. Only call when the user explicitly asks to run the upload spike.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'Optional free-text label echoed to the view' },
      },
    },
    _meta: {
      ui: { resourceUri: SPIKE_RESOURCE_URI, visibility: ['model', 'app'] },
      'openai/outputTemplate': SPIKE_RESOURCE_URI,
      'openai/widgetAccessible': true,
      'openai/toolInvocation/invoking': 'Opening spike…',
      'openai/toolInvocation/invoked': 'Spike ready',
    },
  },
  {
    name: 'upload_spike_done',
    description: 'App-only: receives the spike diagnostics report from the spike view.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        report: { type: 'object', description: 'Diagnostics collected by the view' },
      },
    },
    _meta: { ...APP_ONLY_META },
  },
];
