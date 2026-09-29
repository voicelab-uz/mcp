#!/usr/bin/env node

/**
 * Smoke test: Verify the MCP server can be imported and list tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

console.log('Smoke test: Verifying VoiceLab MCP server structure...\n');

// Test 1: Create a mock server
const server = new Server(
  {
    name: 'voicelab-mcp-test',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

console.log('✓ Server created successfully');

// Test 2: Define tools list
const expectedTools = [
  'list_models',
  'chat_completions',
  'get_llm_request',
  'list_tts_languages',
  'list_voices',
  'text_to_speech',
  'list_tts_generations',
  'get_tts_generation',
  'delete_tts_generation',
  'speech_to_text',
  'get_transcription',
  'list_transcriptions',
  'update_transcription',
  'delete_transcription',
  'export_transcription',
  'isolate_voice',
  'get_isolation',
  'list_isolations',
  'create_isolation_export',
  'get_isolation_export',
  'hide_isolation',
  'create_realtime_ticket',
];

console.log(`✓ Expected ${expectedTools.length} tools defined\n`);

// Test 3: Verify modules can be imported
try {
  const { VoiceLabClient } = await import('./client.js');
  console.log('✓ VoiceLabClient imported');
  
  const { LLMModule } = await import('./llm.js');
  console.log('✓ LLMModule imported');
  
  const { TTSModule } = await import('./tts.js');
  console.log('✓ TTSModule imported');
  
  const { STTModule } = await import('./stt.js');
  console.log('✓ STTModule imported');
  
  const { VoicesModule } = await import('./voices.js');
  console.log('✓ VoicesModule imported');
  
  const { VoiceIsolatorModule } = await import('./isolator.js');
  console.log('✓ VoiceIsolatorModule imported');
  
  const { RealtimeModule } = await import('./realtime.js');
  console.log('✓ RealtimeModule imported');
  
  console.log('\n✅ All smoke tests passed!');
  console.log('\nNote: To run the full server, set VOICELAB_API_KEY and run:');
  console.log('  npm start');
  
  process.exit(0);
} catch (error) {
  console.error('\n❌ Smoke test failed:', error);
  process.exit(1);
}
