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
import { generateUUID, base64Encode, base64Decode } from './utils.js';

export interface Modules {
  llm: LLMModule;
  tts: TTSModule;
  stt: STTModule;
  voices: VoicesModule;
  isolator: VoiceIsolatorModule;
  realtime: RealtimeModule;
}

const tools: Tool[] = [
  {
    name: 'list_models',
    description: 'List available LLM models with pricing and limits',
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'chat_completions',
    description: 'Create an LLM chat completion. Returns completion ID and text. Generates unique idempotency key if not provided.',
    annotations: {
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model ID from list_models' },
        messages: {
          type: 'array',
          description: 'Conversation messages',
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
        max_tokens: { type: 'number', description: 'Maximum output tokens (1-4096)' },
        temperature: { type: 'number', description: 'Sampling temperature (0-2)' },
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
      openWorldHint: false,
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
      openWorldHint: false,
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
      openWorldHint: false,
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
      openWorldHint: false,
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
      openWorldHint: false,
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
      openWorldHint: false,
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
      destructiveHint: true,
      openWorldHint: false,
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
    description: 'Transcribe audio file. Accepts audio as base64-encoded data. Returns transcription ID for polling. Generates unique idempotency key if not provided.',
    annotations: {
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        audio_base64: { type: 'string', description: 'Base64-encoded audio file (MP3, WAV, M4A, OGG, WebM, FLAC)' },
        language: { type: 'string', description: 'Language code (uz, en, ru)' },
        include_speakers: { type: 'boolean', description: 'Enable speaker diarization (default false)' },
        idempotency_key: { type: 'string', description: 'Optional UUID idempotency key (auto-generated if omitted)' },
      },
      required: ['audio_base64', 'language'],
    },
  },
  {
    name: 'get_transcription',
    description: 'Get transcription status and results. Poll this after speech_to_text until status is completed.',
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
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
      openWorldHint: false,
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
      openWorldHint: false,
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
    name: 'delete_transcription',
    description: 'Delete a transcription and its audio (destructive)',
    annotations: {
      destructiveHint: true,
      openWorldHint: false,
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
      openWorldHint: false,
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
      openWorldHint: false,
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
    name: 'get_isolation',
    description: 'Get voice isolation job status and audio URLs. Poll this after isolate_voice until status is completed.',
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
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
      openWorldHint: false,
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
      openWorldHint: false,
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
      openWorldHint: false,
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
      openWorldHint: false,
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
    description: 'Create a short-lived WebSocket ticket for realtime TTS or STT',
    annotations: {
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', enum: ['tts', 'stt'], description: 'Service type' },
      },
      required: ['service'],
    },
  }
];

export function registerTools(server: Server, modules: Modules) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return await handleToolCall(request.params.name, request.params.arguments, modules);
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

export async function handleToolCall(name: string, args: unknown, modules: Modules) {
  const toolArgs = (args || {}) as Record<string, any>;
  const { llm, tts, stt, voices, isolator, realtime } = modules;

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
      const idempotencyKey = toolArgs.idempotency_key || generateUUID();
      const audioBuffer = base64Decode(toolArgs.audio_base64 as string);
      const audioBlob = new Blob([audioBuffer]);
      const result = await stt.transcribeAudio(
        audioBlob,
        toolArgs.language as string,
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

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
}
