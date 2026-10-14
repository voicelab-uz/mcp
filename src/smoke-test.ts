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
  'create_meeting_from_file',
  'transcribe_file',
];

// Only listed with MCP_ENABLE_UPLOAD_SESSIONS=1 (backend /v1/uploads not deployed yet).
const uploadSessionTools = ['upload_audio', 'create_upload_session', 'get_upload'];

console.log(`✓ Expected ${expectedTools.length} tools defined (plus get_profile = ${expectedTools.length + 1} total; +${uploadSessionTools.length} with MCP_ENABLE_UPLOAD_SESSIONS=1; spike tools only with MCP_ENABLE_SPIKE=1)\n`);

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
    (name) => (name.startsWith('list_meeting') || name.includes('meeting')) && name !== 'create_meeting_from_file'
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

  // MCP Apps: capabilities.resources, tool list, and ui:// resource
  const { SERVER_CAPABILITIES } = await import('./server.js');
  if (!('resources' in SERVER_CAPABILITIES) || !('tools' in SERVER_CAPABILITIES)) {
    console.error('❌ Server capabilities must include tools and resources');
    process.exit(1);
  }
  console.log('✓ Server capabilities include tools and resources');

  const { listTools } = await import('./tools.js');
  const { loadAppsConfig } = await import('./apps-config.js');
  const defaultConfig = loadAppsConfig({});
  const listed = listTools({ apps: defaultConfig }).map((tool) => tool.name);
  const missing = expectedTools.filter((name) => !listed.includes(name));
  if (missing.length > 0 || !listed.includes('get_profile')) {
    console.error(`❌ Missing tools: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (listed.includes('upload_spike') || listed.includes('upload_spike_done')) {
    console.error('❌ Spike tools must not be listed without MCP_ENABLE_SPIKE=1');
    process.exit(1);
  }
  if (uploadSessionTools.some((name) => listed.includes(name))) {
    console.error('❌ Upload-session tools must not be listed without MCP_ENABLE_UPLOAD_SESSIONS=1');
    process.exit(1);
  }
  console.log(`✓ All ${listed.length} tools listed; upload-session and spike tools hidden by default`);

  const uploadsConfig = loadAppsConfig({ MCP_ENABLE_UPLOAD_SESSIONS: '1' });
  const listedWithUploads = listTools({ apps: uploadsConfig }).map((tool) => tool.name);
  const missingUploadTools = uploadSessionTools.filter((name) => !listedWithUploads.includes(name));
  if (missingUploadTools.length > 0) {
    console.error(`❌ Missing upload-session tools with MCP_ENABLE_UPLOAD_SESSIONS=1: ${missingUploadTools.join(', ')}`);
    process.exit(1);
  }
  console.log(`✓ ${listedWithUploads.length} tools listed with MCP_ENABLE_UPLOAD_SESSIONS=1`);

  const { listResourcesResult, readResourceResult, UPLOAD_RESOURCE_URI, MCP_APP_MIME_TYPE } = await import('./resources.js');
  if (listResourcesResult(defaultConfig).resources.length !== 0) {
    console.error('❌ No ui:// resources may be listed by default');
    process.exit(1);
  }
  const resourceUris = listResourcesResult(uploadsConfig).resources.map((r) => r.uri);
  const uploadView = readResourceResult(uploadsConfig, UPLOAD_RESOURCE_URI).contents[0];
  if (
    resourceUris.join(',') !== UPLOAD_RESOURCE_URI ||
    uploadView.mimeType !== MCP_APP_MIME_TYPE ||
    !uploadView.text.includes('ui/initialize')
  ) {
    console.error('❌ ui://voicelab/upload resource is missing or malformed');
    process.exit(1);
  }
  console.log('✓ ui://voicelab/upload served as text/html;profile=mcp-app only with MCP_ENABLE_UPLOAD_SESSIONS=1');
  
  console.log('\n✅ All smoke tests passed!');
  console.log('\nNote: To run the full server, set VOICELAB_API_KEY and run:');
  console.log('  npm start');
  
  process.exit(0);
} catch (error) {
  console.error('\n❌ Smoke test failed:', error);
  process.exit(1);
}
