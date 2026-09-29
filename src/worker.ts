import { VoiceLabClient } from './client.js';
import { LLMModule } from './llm.js';
import { TTSModule } from './tts.js';
import { STTModule } from './stt.js';
import { VoicesModule } from './voices.js';
import { VoiceIsolatorModule } from './isolator.js';
import { RealtimeModule } from './realtime.js';
import { handleToolCall } from './tools.js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

export interface Env {
  VOICELAB_API_KEY: string;
  VOICELAB_BASE_URL?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.get('/', (c) => {
  return c.json({
    name: 'VoiceLab MCP Server',
    version: '1.0.0',
    status: 'healthy',
    endpoints: {
      mcp: '/mcp',
      health: '/',
    },
    documentation: 'https://docs.voicelab.uz',
    repository: 'https://github.com/voicelab-uz/mcp',
  });
});

// Simple JSON-RPC handler for MCP
app.post('/mcp', async (c) => {
  const apiKey = c.env.VOICELAB_API_KEY;
  const baseUrl = c.env.VOICELAB_BASE_URL || 'https://api.voicelab.uz';

  if (!apiKey) {
    return c.json({ 
      jsonrpc: '2.0',
      error: { code: -32603, message: 'VOICELAB_API_KEY not configured' },
      id: null 
    }, 500);
  }

  try {
    const body = await c.req.json() as any;
    const { method, params, id } = body;

    const client = new VoiceLabClient({ apiKey, baseUrl });
    const llm = new LLMModule(client);
    const tts = new TTSModule(client);
    const stt = new STTModule(client);
    const voices = new VoicesModule(client);
    const isolator = new VoiceIsolatorModule(client);
    const realtime = new RealtimeModule(client);

    const modules = { llm, tts, stt, voices, isolator, realtime };

    if (method === 'tools/list') {
      // Return list of available tools
      const tools = [
        { name: 'list_models', description: 'List available LLM models with pricing and limits' },
        { name: 'chat_completions', description: 'Create an LLM chat completion' },
        { name: 'get_llm_request', description: 'Get LLM request status and usage' },
        { name: 'list_tts_languages', description: 'List supported TTS languages' },
        { name: 'list_voices', description: 'List available voices' },
        { name: 'text_to_speech', description: 'Generate speech from text' },
        { name: 'list_tts_generations', description: 'List TTS generation history' },
        { name: 'get_tts_generation', description: 'Get TTS generation details' },
        { name: 'delete_tts_generation', description: 'Delete a TTS generation' },
        { name: 'speech_to_text', description: 'Transcribe audio file' },
        { name: 'get_transcription', description: 'Get transcription status' },
        { name: 'list_transcriptions', description: 'List STT transcription history' },
        { name: 'update_transcription', description: 'Update transcription title' },
        { name: 'delete_transcription', description: 'Delete a transcription' },
        { name: 'export_transcription', description: 'Export transcription' },
        { name: 'isolate_voice', description: 'Remove background noise from audio' },
        { name: 'get_isolation', description: 'Get voice isolation job status' },
        { name: 'list_isolations', description: 'List voice isolation history' },
        { name: 'create_isolation_export', description: 'Create isolation export' },
        { name: 'get_isolation_export', description: 'Get isolation export' },
        { name: 'hide_isolation', description: 'Hide isolation job from history' },
        { name: 'create_realtime_ticket', description: 'Create realtime WebSocket ticket' },
      ];

      return c.json({
        jsonrpc: '2.0',
        result: { tools },
        id,
      });
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      const result = await handleToolCall(name, args, modules);
      
      return c.json({
        jsonrpc: '2.0',
        result,
        id,
      });
    }

    return c.json({
      jsonrpc: '2.0',
      error: { code: -32601, message: `Method not found: ${method}` },
      id,
    });

  } catch (error: any) {
    console.error('MCP error:', error);
    return c.json({
      jsonrpc: '2.0',
      error: { code: -32603, message: error.message || 'Internal server error' },
      id: null,
    }, 500);
  }
});

export default app;
