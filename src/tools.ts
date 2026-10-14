import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { LLMModule } from './llm.js';
import { TTSModule } from './tts.js';
import { STTModule } from './stt.js';
import { VoicesModule } from './voices.js';
import { VoiceIsolatorModule } from './isolator.js';
import { RealtimeModule } from './realtime.js';
import { MeetingsModule, meetingTools } from './meetings.js';
import { UploadsModule, UPLOAD_ID_PATTERN, isUploadPurpose, type UploadSessionResponse, type UploadPurpose } from './uploads.js';
import { type AudioSource } from './audio-source.js';
import { type AppsConfig, DEFAULT_API_ORIGIN, DEFAULT_WIDGET_DOMAIN } from './apps-config.js';
import { uploadTools, fileParamTools, spikeTools } from './ingestion-tools.js';
import { generateUUID, base64Encode, base64Decode, uuidV5 } from './utils.js';
import { type VerifiedOAuthUser, hasRequiredScope } from './oauth.js';

export interface Modules {
  llm: LLMModule;
  tts: TTSModule;
  stt: STTModule;
  voices: VoicesModule;
  isolator: VoiceIsolatorModule;
  realtime: RealtimeModule;
  meetings: MeetingsModule;
  /** Optional so legacy callers (src/worker.ts) keep compiling; upload tools error without it. */
  uploads?: UploadsModule;
}

export interface ToolsOptions {
  apps: AppsConfig;
}

const DEFAULT_TOOLS_OPTIONS: ToolsOptions = {
  apps: { apiOrigin: DEFAULT_API_ORIGIN, widgetDomain: DEFAULT_WIDGET_DOMAIN },
};

/** Thrown for invalid tool arguments; serialized like VoiceLab API errors. */
export class ToolInputError extends Error {
  statusCode = 400;
  constructor(message: string, public code: string = 'validation_error') {
    super(message);
    this.name = 'ToolInputError';
  }
}

export const MAX_AUDIO_URL_LENGTH = 4096;

/** Validate a public HTTPS audio URL. Error messages never echo the URL. */
export function validateAudioUrl(raw: unknown, field = 'audio_url'): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ToolInputError(`${field} must be a non-empty string`, 'invalid_audio_source');
  }
  const value = raw.trim();
  if (value.length > MAX_AUDIO_URL_LENGTH) {
    throw new ToolInputError(`${field} must be at most ${MAX_AUDIO_URL_LENGTH} characters`, 'invalid_audio_source');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ToolInputError(`${field} must be a valid URL`, 'invalid_audio_source');
  }
  if (url.protocol !== 'https:') {
    throw new ToolInputError(`${field} must use https`, 'invalid_audio_source');
  }
  if (url.username || url.password) {
    throw new ToolInputError(`${field} must not contain credentials`, 'invalid_audio_source');
  }
  return value;
}

const AUDIO_SOURCE_KEYS = ['upload_id', 'audio_url', 'audio_base64'] as const;

/**
 * Resolve exactly one audio source from tool arguments:
 * upload_id (upl_...), audio_url (https, <= 4096 chars) or audio_base64.
 */
export function resolveAudioSource(
  args: Record<string, unknown>,
  options: { filename?: string } = {}
): AudioSource {
  const provided = AUDIO_SOURCE_KEYS.filter(
    (key) => args[key] !== undefined && args[key] !== null && args[key] !== ''
  );
  if (provided.length !== 1) {
    throw new ToolInputError(
      provided.length === 0
        ? 'Provide one audio source: upload_id, audio_url, or audio_base64'
        : `Provide exactly one audio source; got ${provided.join(', ')}`,
      'invalid_audio_source'
    );
  }
  const key = provided[0];
  const value = args[key];
  switch (key) {
    case 'upload_id': {
      if (typeof value !== 'string' || !UPLOAD_ID_PATTERN.test(value)) {
        throw new ToolInputError('upload_id must match upl_[A-Za-z0-9]{20,40}', 'invalid_audio_source');
      }
      return { kind: 'upload', id: value };
    }
    case 'audio_url':
      return { kind: 'url', url: validateAudioUrl(value) };
    case 'audio_base64': {
      if (typeof value !== 'string') {
        throw new ToolInputError('audio_base64 must be a string', 'invalid_audio_source');
      }
      const bytes = base64Decode(value);
      if (bytes.length === 0) {
        throw new ToolInputError('audio_base64 decoded to an empty file', 'invalid_audio_source');
      }
      return { kind: 'file', blob: new Blob([bytes]), filename: options.filename };
    }
  }
}

/** Namespace for deterministic idempotency keys derived from ChatGPT file ids. */
export const FILE_IDEMPOTENCY_NAMESPACE = '6f1c2a8e-4b7d-5e3f-9a10-7c2d4e5f6a7b';

export interface OpenAIFileParam {
  download_url: string;
  file_id: string;
  mime_type?: string;
  file_name?: string;
}

export function parseOpenAIFile(raw: unknown): OpenAIFileParam {
  if (!raw || typeof raw !== 'object') {
    throw new ToolInputError('file must be an object with download_url and file_id');
  }
  const file = raw as Record<string, unknown>;
  const downloadUrl = validateAudioUrl(file.download_url, 'file.download_url');
  if (typeof file.file_id !== 'string' || !file.file_id.trim() || file.file_id.length > 512) {
    throw new ToolInputError('file.file_id must be a non-empty string');
  }
  return {
    download_url: downloadUrl,
    file_id: file.file_id.trim(),
    mime_type: typeof file.mime_type === 'string' ? file.mime_type : undefined,
    file_name: typeof file.file_name === 'string' ? file.file_name : undefined,
  };
}

/** Default meeting title from a filename: strip extension/control chars, single line, <= 160 chars. */
export function titleFromFilename(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const stem = name.replace(/\.[A-Za-z0-9]{1,8}$/, '');
  const clean = stem.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160).trim();
  return clean || undefined;
}

/** Deep-replace any string that contains a secret (e.g. a signed download URL). */
export function redactSecrets<T>(value: T, secrets: string[]): T {
  const needles = secrets.filter((s) => s.length >= 8);
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      return needles.some((n) => v.includes(n)) ? '[redacted]' : v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(value) as T;
}

function urlSecrets(url: string): string[] {
  try {
    const parsed = new URL(url);
    return [url, `${parsed.origin}${parsed.pathname}`, parsed.search.slice(1)].filter(Boolean);
  } catch {
    return [url];
  }
}

export function buildBrowserUploadUrl(
  pageUrl: string,
  token: string,
  uploadId: string,
  purpose: UploadPurpose
): string {
  const fragment = new URLSearchParams({ t: token, id: uploadId, p: purpose }).toString();
  return `${pageUrl}#${fragment}`;
}

function uploadSessionResult(
  session: UploadSessionResponse,
  purpose: UploadPurpose,
  apps: AppsConfig,
  mode: 'model' | 'app'
) {
  const upload = session?.upload;
  if (!upload?.id || !session.upload_url || !session.upload_token) {
    throw new Error('VoiceLab returned an incomplete upload session');
  }
  const browserUploadUrl = apps.uploadPageUrl
    ? buildBrowserUploadUrl(apps.uploadPageUrl, session.upload_token, upload.id, purpose)
    : undefined;
  const structuredContent: Record<string, unknown> = {
    upload_id: upload.id,
    purpose,
    status: upload.status,
    expires_at: upload.expires_at,
    ...(browserUploadUrl ? { browser_upload_url: browserUploadUrl } : {}),
  };
  const followUp = purpose === 'meeting' ? 'create_meeting' : 'speech_to_text';
  let text: string;
  if (mode === 'app') {
    text = `Upload session ${upload.id} created (expires ${upload.expires_at ?? 'soon'}).`;
  } else {
    text =
      `Upload session ${upload.id} is ready for a ${purpose === 'meeting' ? 'meeting recording' : 'transcription'} ` +
      `(expires ${upload.expires_at ?? 'in about 15 minutes'}). If the VoiceLab upload widget is shown, ` +
      `the user can pick or drop the audio file there; it uploads directly to VoiceLab and starts processing automatically, ` +
      `then the widget reports the resulting id.`;
    if (browserUploadUrl) {
      text +=
        ` If no widget is shown, give the user this link to upload in their browser: ${browserUploadUrl} — ` +
        `after they confirm, call get_upload with upload_id ${upload.id} and, once status is ready, ${followUp} with upload_id.`;
    } else {
      text +=
        ` If no widget is shown, this client cannot upload local files directly: ask the user for a public HTTPS link ` +
        `to the recording and call ${followUp} with audio_url (or audio_base64 for files under ~7 MB).`;
    }
  }
  return {
    content: [{ type: 'text', text }],
    structuredContent,
    _meta: {
      'voicelab/upload': {
        upload_url: session.upload_url,
        upload_token: session.upload_token,
        max_bytes: upload.max_bytes,
        expires_at: upload.expires_at,
      },
    },
  };
}

function requireUploads(modules: Modules): UploadsModule {
  if (!modules.uploads) {
    throw new ToolInputError('Upload sessions are not available on this server', 'not_supported');
  }
  return modules.uploads;
}

function requirePurpose(value: unknown): UploadPurpose {
  if (!isUploadPurpose(value)) {
    throw new ToolInputError('purpose must be "meeting" or "stt"');
  }
  return value;
}

function requireLanguage(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ToolInputError('language is required (e.g. uz, en, ru)');
  }
  return value.trim();
}

/** Full tool list for the given configuration (spike tools only when enabled). */
export function listTools(options: ToolsOptions = DEFAULT_TOOLS_OPTIONS): Tool[] {
  return [
    ...tools,
    ...uploadTools,
    ...fileParamTools,
    ...(options.apps.spike ? spikeTools : []),
  ];
}

const oauthSecurityScheme = {
  type: 'oauth2' as const,
  scopes: ['openid', 'email', 'profile', 'mcp:tools'],
};

const tools: Tool[] = [
  {
    name: 'get_profile',
    description: 'Get authenticated user profile information (OpenAI profile tool)',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_models',
    description: 'List available LLM models with pricing and limits',
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
    name: 'chat_completions',
    description: 'Create an LLM chat completion with optional reasoning controls (thinking, reasoning.enabled/effort, or reasoning_effort). Returns completion ID and text. Generates unique idempotency key if not provided. Model support varies.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model ID from list_models' },
        messages: {
          type: 'array',
          description: 'Conversation messages (1-101)',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['system', 'user', 'assistant', 'tool'] },
              content: { type: 'string' },
              tool_call_id: { type: 'string' },
            },
            required: ['role', 'content'],
          },
        },
        max_tokens: { type: 'number', description: 'Maximum output tokens (1-4096, default 1024)' },
        temperature: { type: 'number', description: 'Sampling temperature (0-2, model-dependent)' },
        thinking: { type: 'boolean', description: 'Simple reasoning toggle (do not combine with reasoning or reasoning_effort)' },
        reasoning_effort: { type: 'string', enum: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'], description: 'Reasoning effort level (model-dependent)' },
        idempotency_key: { type: 'string', description: 'Optional idempotency key (auto-generated if omitted)' },
      },
      required: ['model', 'messages'],
    },
  },
  {
    name: 'get_llm_request',
    description: 'Get LLM request status, token usage, and credit details',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        request_id: { type: 'string', description: 'LLM request ID from chat_completions' },
      },
      required: ['request_id'],
    },
  },
  {
    name: 'list_tts_languages',
    description: 'List supported TTS languages and model capabilities',
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
    name: 'list_voices',
    description: 'List available voices, optionally filtered by language',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        language: { type: 'string', description: 'Optional language code filter (e.g., "en", "uz", "ru")' },
      },
    },
  },
  {
    name: 'text_to_speech',
    description: 'Generate speech from text. Returns audio as base64-encoded WAV. Generates unique idempotency key if not provided.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to synthesize (1-5000 characters)' },
        language: { type: 'string', description: 'Language code (e.g., "en", "uz", "ru")' },
        voice_id: { type: 'string', description: 'Voice ID from list_voices' },
        speed: { type: 'number', description: 'Speech speed (0.5-2.0, default 1)' },
        idempotency_key: { type: 'string', description: 'Optional idempotency key (auto-generated if omitted)' },
      },
      required: ['text', 'language', 'voice_id'],
    },
  },
  {
    name: 'list_tts_generations',
    description: 'List TTS generation history',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Results per page (1-100, default 30)' },
        cursor: { type: 'string', description: 'Pagination cursor from previous response' },
      },
    },
  },
  {
    name: 'get_tts_generation',
    description: 'Get TTS generation details with audio URL',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        generation_id: { type: 'string', description: 'Generation ID' },
      },
      required: ['generation_id'],
    },
  },
  {
    name: 'delete_tts_generation',
    description: 'Delete a TTS generation and its audio (destructive)',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        generation_id: { type: 'string', description: 'Generation ID to delete' },
      },
      required: ['generation_id'],
    },
  },
  {
    name: 'speech_to_text',
    description: 'Transcribe audio asynchronously. Provide exactly one audio source: upload_id (preferred for large local files: a ready upload from upload_audio), audio_url (public HTTPS URL the API downloads), or audio_base64 (small files only: the MCP request body is capped at 10 MiB, so base64 audio must be under ~7 MB). Returns 202 Accepted with job ID for polling (even for short clips). Poll get_transcription until status is completed. Generates unique idempotency key if not provided.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        upload_id: { type: 'string', description: 'ID of a ready upload (upl_...) from upload_audio with purpose stt. Single-use. Mutually exclusive with audio_url and audio_base64.' },
        audio_url: { type: 'string', description: 'Public HTTPS URL of the audio (max 4096 chars). Mutually exclusive with upload_id and audio_base64.' },
        audio_base64: { type: 'string', description: 'Base64-encoded audio file (MP3, WAV, M4A, OGG, WebM, FLAC). Keep under ~7 MB (10 MiB MCP request cap). Mutually exclusive with upload_id and audio_url.' },
        language: { type: 'string', description: 'Language code (uz, en, ru)' },
        include_speakers: { type: 'boolean', description: 'Enable speaker diarization (default false)' },
        idempotency_key: { type: 'string', description: 'Optional UUID idempotency key (auto-generated if omitted)' },
      },
      required: ['language'],
    },
    _meta: {
      ui: { visibility: ['model', 'app'] },
      'openai/widgetAccessible': true,
    },
  },
  {
    name: 'get_transcription',
    description: 'Get transcription status and results. Poll this after speech_to_text until status is completed.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        transcription_id: { type: 'string', description: 'Transcription ID from speech_to_text' },
      },
      required: ['transcription_id'],
    },
  },
  {
    name: 'list_transcriptions',
    description: 'List STT transcription history',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Results per page (1-100, default 10)' },
        cursor: { type: 'string', description: 'Pagination cursor' },
      },
    },
  },
  {
    name: 'update_transcription',
    description: 'Update transcription title',
    annotations: {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        transcription_id: { type: 'string', description: 'Transcription ID' },
        title: { type: 'string', description: 'New title' },
      },
      required: ['transcription_id', 'title'],
    },
  },
  {
    name: 'edit_transcription_document',
    description: 'Atomically replace the complete transcription document (segments, speakers, title). Requires current revision from GET response to prevent conflicts. Returns 409 stt_edit_conflict on stale revision.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        transcription_id: { type: 'string', description: 'Transcription ID' },
        revision: { type: 'number', description: 'Current revision number from GET response (required for conflict detection)' },
        title: { type: 'string', description: 'Document title' },
        segments: {
          type: 'array',
          description: 'Ordered transcript segments with timing',
          items: {
            type: 'object',
            properties: {
              ordinal: { type: 'number', description: 'Segment order (1-indexed)' },
              start_ms: { type: 'number', description: 'Start time in milliseconds' },
              end_ms: { type: 'number', description: 'End time in milliseconds' },
              text: { type: 'string', description: 'Segment text' },
              speaker: { type: 'string', description: 'Optional speaker ID (e.g., speaker_1)' },
            },
            required: ['ordinal', 'start_ms', 'end_ms', 'text'],
          },
        },
        speakers: {
          type: 'array',
          description: 'Speaker metadata for diarization',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Speaker ID (e.g., speaker_1)' },
              display_name: { type: 'string', description: 'Speaker display name' },
            },
            required: ['id', 'display_name'],
          },
        },
      },
      required: ['transcription_id', 'revision'],
    },
  },
  {
    name: 'delete_transcription',
    description: 'Delete a transcription and its audio (destructive)',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        transcription_id: { type: 'string', description: 'Transcription ID to delete' },
      },
      required: ['transcription_id'],
    },
  },
  {
    name: 'export_transcription',
    description: 'Export transcription as TXT, JSON, SRT, or VTT. Returns content as base64-encoded data.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        transcription_id: { type: 'string', description: 'Transcription ID' },
        format: { type: 'string', enum: ['txt', 'json', 'srt', 'vtt'], description: 'Export format' },
      },
      required: ['transcription_id', 'format'],
    },
  },
  {
    name: 'isolate_voice',
    description: 'Remove background noise from audio with optional speech restoration. Returns job ID for polling. Generates unique idempotency key if not provided.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        audio_base64: { type: 'string', description: 'Base64-encoded audio file (max 300 MiB)' },
        title: { type: 'string', description: 'Optional job title' },
        speech_restoration: { type: 'boolean', description: 'Enable Sidon speech restoration (default false)' },
        restoration_model: { type: 'string', description: 'Restoration model (sidon)' },
        idempotency_key: { type: 'string', description: 'Optional UUID idempotency key (auto-generated if omitted)' },
      },
      required: ['audio_base64'],
    },
  },
  {
    name: 'isolate_voice_batch',
    description: 'Submit 1-4 audio files for batch noise removal with atomic validation and credit reservation. Processing options apply to all files. Returns batch ID and individual job IDs. Generates unique idempotency key if not provided.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          description: 'Array of 1-4 audio files as base64-encoded data with filenames',
          items: {
            type: 'object',
            properties: {
              audio_base64: { type: 'string', description: 'Base64-encoded audio file' },
              filename: { type: 'string', description: 'Original filename (used as job title)' },
            },
            required: ['audio_base64', 'filename'],
          },
          minItems: 1,
          maxItems: 4,
        },
        speech_restoration: { type: 'boolean', description: 'Enable Sidon speech restoration for all files (default false)' },
        restoration_model: { type: 'string', description: 'Restoration model (sidon)' },
        idempotency_key: { type: 'string', description: 'Optional UUID idempotency key (auto-generated if omitted)' },
      },
      required: ['files'],
    },
  },
  {
    name: 'get_isolation',
    description: 'Get voice isolation job status, processing stage, and audio URLs. Poll until BOTH status=completed AND audio_status=completed for the default MP3. Job can complete while MP3 preparation is still running. Signed URLs expire after ~10 minutes.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        isolation_id: { type: 'string', description: 'Isolation job ID' },
      },
      required: ['isolation_id'],
    },
  },
  {
    name: 'list_isolations',
    description: 'List voice isolation history',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Results per page (1-50, default 20)' },
        cursor: { type: 'string', description: 'Pagination cursor' },
      },
    },
  },
  {
    name: 'create_isolation_export',
    description: 'Create an export of isolated audio in specified format',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        isolation_id: { type: 'string', description: 'Isolation job ID' },
        format: { type: 'string', enum: ['mp3', 'wav', 'flac', 'ogg', 'original'], description: 'Export format' },
      },
      required: ['isolation_id', 'format'],
    },
  },
  {
    name: 'get_isolation_export',
    description: 'Get export status and download URL',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        isolation_id: { type: 'string', description: 'Isolation job ID' },
        format: { type: 'string', description: 'Export format' },
      },
      required: ['isolation_id', 'format'],
    },
  },
  {
    name: 'hide_isolation',
    description: 'Hide isolation job from history (does not delete audio)',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        isolation_id: { type: 'string', description: 'Isolation job ID to hide' },
      },
      required: ['isolation_id'],
    },
  },
  {
    name: 'create_realtime_ticket',
    description: 'Create a short-lived WebSocket ticket for realtime TTS or STT. Tickets expire after ~2 minutes. For browser clients only; server clients can use xvl-api-key header directly on WebSocket handshake.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', enum: ['tts', 'stt'], description: 'Service type (stt or tts)' },
      },
      required: ['service'],
    },
  },
  ...meetingTools,
];

export function registerTools(
  server: Server,
  modules: Modules,
  verifiedUser?: VerifiedOAuthUser | 'legacy',
  options: ToolsOptions = DEFAULT_TOOLS_OPTIONS
) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: withSecuritySchemes(listTools(options)),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return await handleToolCall(
        request.params.name,
        request.params.arguments,
        modules,
        verifiedUser,
        options
      );
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: error.message,
                code: error.code,
                statusCode: error.statusCode,
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  });
}

/**
 * Add OAuth security schemes, merging (never replacing) each tool's own _meta.
 */
export function withSecuritySchemes(toolList: Tool[]): Tool[] {
  return toolList.map((tool) => {
    if (tool.name === 'get_profile') {
      // OpenAI profile tool marker
      return { ...tool, _meta: { ...(tool._meta ?? {}), 'openai/profile': true } };
    }
    return { ...tool, securitySchemes: [oauthSecurityScheme] };
  });
}

export async function handleToolCall(
  name: string,
  args: unknown,
  modules: Modules,
  verifiedUser?: VerifiedOAuthUser | 'legacy',
  options: ToolsOptions = DEFAULT_TOOLS_OPTIONS
) {
  const toolArgs = (args || {}) as Record<string, any>;
  const { llm, tts, stt, voices, isolator, realtime, meetings } = modules;

  // Handle get_profile (OpenAI profile tool)
  if (name === 'get_profile') {
    if (!verifiedUser || verifiedUser === 'legacy') {
      // For legacy tokens or no OAuth, we don't have detailed profile data
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              id: 'voicelab-user',
              name: 'VoiceLab User',
              note: 'Using legacy authentication (no OAuth profile)',
            }, null, 2),
          },
        ],
        _meta: {
          'openai/profile': true,
        },
      };
    }

    // For OAuth users, return their profile from the JWT
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            id: verifiedUser.sub,
            name: verifiedUser.name,
            email: verifiedUser.email,
          }, null, 2),
        },
      ],
      _meta: {
        'openai/profile': true,
      },
    };
  }

  // All other tools require authentication
  if (!verifiedUser) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Unauthorized',
            message: 'This tool requires authentication. Please authenticate via OAuth.',
          }, null, 2),
        },
      ],
      isError: true,
      _meta: {
        'mcp/www_authenticate': 'Bearer realm="VoiceLab MCP"',
      },
    };
  }

  // For OAuth users: enforce mcp:tools scope (P1-4 fix)
  if (verifiedUser !== 'legacy' && !hasRequiredScope(verifiedUser, 'mcp:tools')) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Forbidden',
            message: 'This tool requires the mcp:tools scope. Please re-authorize with the required scope.',
          }, null, 2),
        },
      ],
      isError: true,
      _meta: {
        'mcp/www_authenticate': 'Bearer realm="VoiceLab MCP"',
      },
    };
  }

  switch (name) {
    case 'list_models': {
      const result = await llm.listModels();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'chat_completions': {
      const idempotencyKey = toolArgs.idempotency_key || generateUUID();
      const result = await llm.createChatCompletion(toolArgs as any, idempotencyKey);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              request_id: result.id,
              completion: result.choices[0]?.message?.content,
              usage: result.usage,
              idempotency_key: idempotencyKey,
            }, null, 2),
          },
        ],
      };
    }

    case 'get_llm_request': {
      const result = await llm.getRequest(toolArgs.request_id as string);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'list_tts_languages': {
      const result = await tts.listLanguages();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'list_voices': {
      const result = await voices.listVoices(toolArgs.language as string | undefined);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'text_to_speech': {
      const idempotencyKey = toolArgs.idempotency_key || generateUUID();
      const audioBuffer = await tts.generateSpeech(toolArgs as any, idempotencyKey);
      const base64Audio = base64Encode(audioBuffer);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              audio_base64: base64Audio,
              format: 'wav',
              sample_rate: 24000,
              idempotency_key: idempotencyKey,
            }, null, 2),
          },
        ],
      };
    }

    case 'list_tts_generations': {
      const result = await tts.listGenerations(toolArgs.limit as number | undefined, toolArgs.cursor as string | undefined);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'get_tts_generation': {
      const result = await tts.getGeneration(toolArgs.generation_id as string);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'delete_tts_generation': {
      await tts.deleteGeneration(toolArgs.generation_id as string);
      return { content: [{ type: 'text', text: 'Generation deleted successfully' }] };
    }

    case 'speech_to_text': {
      const language = requireLanguage(toolArgs.language);
      const source = resolveAudioSource(toolArgs);
      const idempotencyKey = toolArgs.idempotency_key || generateUUID();
      const result = await stt.transcribeAudio(
        source,
        language,
        idempotencyKey,
        toolArgs.include_speakers as boolean | undefined
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ...result,
              idempotency_key: idempotencyKey,
            }, null, 2),
          },
        ],
      };
    }

    case 'get_transcription': {
      const result = await stt.getTranscription(toolArgs.transcription_id as string);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'list_transcriptions': {
      const result = await stt.listTranscriptions(toolArgs.limit as number | undefined, toolArgs.cursor as string | undefined);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'update_transcription': {
      const result = await stt.updateTitle(toolArgs.transcription_id as string, toolArgs.title as string);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'edit_transcription_document': {
      const document = {
        revision: toolArgs.revision as number,
        title: toolArgs.title as string | undefined,
        segments: toolArgs.segments as any[] | undefined,
        speakers: toolArgs.speakers as any[] | undefined,
      };
      const result = await stt.updateDocument(toolArgs.transcription_id as string, document);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'delete_transcription': {
      await stt.deleteTranscription(toolArgs.transcription_id as string);
      return { content: [{ type: 'text', text: 'Transcription deleted successfully' }] };
    }

    case 'export_transcription': {
      const exportBuffer = await stt.exportTranscription(toolArgs.transcription_id as string, toolArgs.format as any);
      const base64Export = base64Encode(exportBuffer);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              export_base64: base64Export,
              format: toolArgs.format,
            }, null, 2),
          },
        ],
      };
    }

    case 'isolate_voice': {
      const idempotencyKey = toolArgs.idempotency_key || generateUUID();
      const audioBuffer = base64Decode(toolArgs.audio_base64 as string);
      const audioBlob = new Blob([audioBuffer]);
      const result = await isolator.isolateVoice(
        audioBlob,
        idempotencyKey,
        toolArgs.title as string | undefined,
        toolArgs.speech_restoration as boolean | undefined,
        toolArgs.restoration_model as string | undefined
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ...result,
              idempotency_key: idempotencyKey,
            }, null, 2),
          },
        ],
      };
    }

    case 'isolate_voice_batch': {
      const idempotencyKey = toolArgs.idempotency_key || generateUUID();
      const filesInput = toolArgs.files as Array<{ audio_base64: string; filename: string }>;
      const files = filesInput.map(file => ({
        blob: new Blob([base64Decode(file.audio_base64)]),
        filename: file.filename,
      }));
      const result = await isolator.isolateVoiceBatch(
        files,
        idempotencyKey,
        toolArgs.speech_restoration as boolean | undefined,
        toolArgs.restoration_model as string | undefined
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ...result,
              idempotency_key: idempotencyKey,
            }, null, 2),
          },
        ],
      };
    }

    case 'get_isolation': {
      const result = await isolator.getIsolation(toolArgs.isolation_id as string);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'list_isolations': {
      const result = await isolator.listIsolations(toolArgs.limit as number | undefined, toolArgs.cursor as string | undefined);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'create_isolation_export': {
      const result = await isolator.createExport(toolArgs.isolation_id as string, toolArgs.format as string);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'get_isolation_export': {
      const result = await isolator.getExport(toolArgs.isolation_id as string, toolArgs.format as string);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'hide_isolation': {
      await isolator.hideIsolation(toolArgs.isolation_id as string);
      return { content: [{ type: 'text', text: 'Isolation job hidden successfully' }] };
    }

    case 'create_realtime_ticket': {
      const result = await realtime.createTicket(toolArgs.service as 'tts' | 'stt');
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'list_meeting_capabilities': {
      const result = await meetings.getCapabilities();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'create_meeting': {
      const filename = (toolArgs.filename as string | undefined) || 'meeting.audio';
      const source = resolveAudioSource(toolArgs, { filename });
      const idempotencyKey = toolArgs.idempotency_key || generateUUID();
      const result = await meetings.createMeeting(source, idempotencyKey, {
        title: toolArgs.title as string | undefined,
        language: toolArgs.language as string | undefined,
        filename: source.kind === 'file' ? filename : undefined,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ...result,
              idempotency_key: idempotencyKey,
            }, null, 2),
          },
        ],
      };
    }

    case 'create_meeting_from_file': {
      const file = parseOpenAIFile(toolArgs.file);
      const idempotencyKey =
        toolArgs.idempotency_key || (await uuidV5(`create_meeting_from_file:${file.file_id}`, FILE_IDEMPOTENCY_NAMESPACE));
      const title = (toolArgs.title as string | undefined) || titleFromFilename(file.file_name);
      const result = await meetings.createMeeting({ kind: 'url', url: file.download_url }, idempotencyKey, {
        title,
        language: toolArgs.language as string | undefined,
      });
      const body = redactSecrets(
        { ...result, idempotency_key: idempotencyKey, source: { file_id: file.file_id, file_name: file.file_name } },
        urlSecrets(file.download_url)
      );
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    case 'transcribe_file': {
      const file = parseOpenAIFile(toolArgs.file);
      const language = requireLanguage(toolArgs.language);
      const idempotencyKey =
        toolArgs.idempotency_key || (await uuidV5(`transcribe_file:${file.file_id}`, FILE_IDEMPOTENCY_NAMESPACE));
      const result = await stt.transcribeAudio(
        { kind: 'url', url: file.download_url },
        language,
        idempotencyKey,
        toolArgs.include_speakers as boolean | undefined
      );
      const body = redactSecrets(
        { ...result, idempotency_key: idempotencyKey, source: { file_id: file.file_id, file_name: file.file_name } },
        urlSecrets(file.download_url)
      );
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    case 'upload_audio': {
      const purpose = requirePurpose(toolArgs.purpose);
      const session = await requireUploads(modules).createSession(purpose);
      return uploadSessionResult(session, purpose, options.apps, 'model');
    }

    case 'create_upload_session': {
      const purpose = requirePurpose(toolArgs.purpose);
      const filename = typeof toolArgs.filename === 'string' ? toolArgs.filename.slice(0, 255) : undefined;
      const contentType = typeof toolArgs.content_type === 'string' ? toolArgs.content_type.slice(0, 255) : undefined;
      const size = typeof toolArgs.size_bytes === 'number' ? toolArgs.size_bytes : undefined;
      const session = await requireUploads(modules).createSession(purpose, {
        filename,
        content_type: contentType,
        size_bytes: size,
      });
      return uploadSessionResult(session, purpose, options.apps, 'app');
    }

    case 'get_upload': {
      const uploadId = toolArgs.upload_id;
      if (typeof uploadId !== 'string' || !UPLOAD_ID_PATTERN.test(uploadId)) {
        throw new ToolInputError('upload_id must match upl_[A-Za-z0-9]{20,40}');
      }
      const result = await requireUploads(modules).get(uploadId);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: { upload: result.upload },
      };
    }

    case 'upload_spike': {
      if (!options.apps.spike) return unknownTool(name);
      const nonce = generateUUID();
      return {
        content: [
          {
            type: 'text',
            text: 'Opened the VoiceLab MCP Apps spike view. If no view is shown, this client does not render MCP Apps for this server.',
          },
        ],
        structuredContent: { spike: true, echo_origin: options.apps.spike.echoOrigin, note: toolArgs.note ?? null },
        _meta: { 'voicelab/spike': { nonce, issued_at: new Date().toISOString() } },
      };
    }

    case 'upload_spike_done': {
      if (!options.apps.spike) return unknownTool(name);
      const report = toolArgs.report && typeof toolArgs.report === 'object' ? toolArgs.report : {};
      const text = JSON.stringify(report, null, 2).slice(0, 4000);
      return {
        content: [{ type: 'text', text: `Spike report received:\n${text}` }],
        structuredContent: { received: true },
      };
    }

    case 'list_meetings': {
      const result = await meetings.listMeetings({
        limit: toolArgs.limit as number | undefined,
        cursor: toolArgs.cursor as string | undefined,
        ids: toolArgs.ids as string | undefined,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'get_meeting': {
      const result = await meetings.getMeeting(toolArgs.meeting_id as string);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'rename_meeting': {
      const result = await meetings.renameMeeting(
        toolArgs.meeting_id as string,
        toolArgs.title as string
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'delete_meeting': {
      await meetings.deleteMeeting(toolArgs.meeting_id as string);
      return { content: [{ type: 'text', text: 'Meeting deleted successfully' }] };
    }

    case 'regenerate_meeting_notes': {
      const result = await meetings.regenerateNotes(toolArgs.meeting_id as string);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'get_meeting_translations': {
      const result = await meetings.getTranslations(toolArgs.meeting_id as string);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    default:
      return unknownTool(name);
  }
}

function unknownTool(name: string) {
  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true,
  };
}
