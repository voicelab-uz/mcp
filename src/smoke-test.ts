#!/usr/bin/env node

/**
 * Smoke test: Verify the MCP server can be imported and list tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { VERSION } from './version.js';
import packageJson from '../package.json' with { type: 'json' };

console.log('Smoke test: Verifying VoiceLab MCP server structure...\n');

// Test 1: Verify version matches package.json
if (VERSION !== packageJson.version) {
  console.error(`❌ Version mismatch: VERSION (${VERSION}) !== package.json (${packageJson.version})`);
  process.exit(1);
}
console.log(`✓ Version matches package.json: ${VERSION}`);

// Test 2: Verify no hard-coded version strings in src files
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const srcDir = new URL('.', import.meta.url).pathname;
const srcFiles = readdirSync(srcDir).filter(f => f.endsWith('.ts') && f !== 'smoke-test.ts');

for (const file of srcFiles) {
  const content = readFileSync(join(srcDir, file), 'utf-8');
  const hardcodedVersionPattern = /(?:const|let|var)\s+VERSION\s*=\s*['"][^'"]+['"]|version:\s*['"][0-9]+\.[0-9]+\.[0-9]+['"]/g;
  const matches = content.match(hardcodedVersionPattern);
  if (matches) {
    console.error(`❌ Hard-coded version found in ${file}: ${matches.join(', ')}`);
    console.error('   All version references must use VERSION from ./version.js');
    process.exit(1);
  }
}
console.log('✓ No hard-coded version strings in src files');

// Test 3: Create a mock server
const server = new Server(
  {
    name: 'voicelab-mcp-test',
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

console.log('✓ Server created successfully');

// Test 4: Define tools list
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
  'edit_transcription_document',
  'delete_transcription',
  'export_transcription',
  'isolate_voice',
  'isolate_voice_batch',
  'get_isolation',
  'list_isolations',
  'create_isolation_export',
  'get_isolation_export',
  'hide_isolation',
  'create_realtime_ticket',
  'list_meeting_capabilities',
  'create_meeting',
  'list_meetings',
  'get_meeting',
  'rename_meeting',
  'delete_meeting',
  'regenerate_meeting_notes',
  'get_meeting_translations',
];

console.log(`✓ Expected ${expectedTools.length} tools defined (plus get_profile = 33 total)\n`);

// Test 5: Verify modules can be imported
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

  const { MeetingsModule, meetingTools } = await import('./meetings.js');
  console.log('✓ MeetingsModule imported');

  const meetingToolNames = meetingTools.map((tool) => tool.name);
  const missingMeetingTools = expectedTools.filter(
    (name) => name.startsWith('list_meeting') || name.includes('meeting')
  ).filter((name) => !meetingToolNames.includes(name));
  if (missingMeetingTools.length > 0) {
    console.error(`❌ Missing Meeting AI tools: ${missingMeetingTools.join(', ')}`);
    process.exit(1);
  }
  const destructiveDeletes = meetingTools.filter((tool) => tool.name.startsWith('delete_'));
  if (destructiveDeletes.some((tool) => tool.annotations?.destructiveHint !== true)) {
    console.error('❌ delete_meeting must set destructiveHint: true');
    process.exit(1);
  }
  console.log(`✓ Meeting AI tools registered (${meetingTools.length})`);
  
  console.log('\n✅ All smoke tests passed!');
  console.log('\nNote: To run the full server, set VOICELAB_API_KEY and run:');
  console.log('  npm start');
  
  process.exit(0);
} catch (error) {
  console.error('\n❌ Smoke test failed:', error);
  process.exit(1);
}
