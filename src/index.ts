#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { VoiceLabClient } from './client.js';
import { LLMModule } from './llm.js';
import { TTSModule } from './tts.js';
import { STTModule } from './stt.js';
import { VoicesModule } from './voices.js';
import { VoiceIsolatorModule } from './isolator.js';
import { RealtimeModule } from './realtime.js';
import { registerTools } from './tools.js';

const API_KEY = process.env.VOICELAB_API_KEY;
const BASE_URL = process.env.VOICELAB_BASE_URL || 'https://api.voicelab.uz';

if (!API_KEY) {
  console.error('Error: VOICELAB_API_KEY environment variable is required');
  process.exit(1);
}

const client = new VoiceLabClient({ apiKey: API_KEY, baseUrl: BASE_URL });
const llm = new LLMModule(client);
const tts = new TTSModule(client);
const stt = new STTModule(client);
const voices = new VoicesModule(client);
const isolator = new VoiceIsolatorModule(client);
const realtime = new RealtimeModule(client);

const modules = { llm, tts, stt, voices, isolator, realtime };

const server = new Server(
  {
    name: 'voicelab-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);
registerTools(server, modules);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('VoiceLab MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
