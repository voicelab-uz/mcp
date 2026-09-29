#!/usr/bin/env node

/**
 * End-to-end tests against live VoiceLab API
 * 
 * Requires VOICELAB_API_KEY environment variable.
 * Tests are skipped if the key is not set.
 * 
 * Usage:
 *   VOICELAB_API_KEY=vlk_... npm run test:e2e
 */

import { VoiceLabClient } from './client.js';
import { LLMModule } from './llm.js';
import { TTSModule } from './tts.js';
import { VoicesModule } from './voices.js';

const API_KEY = process.env.VOICELAB_API_KEY;
const BASE_URL = process.env.VOICELAB_BASE_URL || 'https://api.voicelab.uz';

async function main() {
  console.log('VoiceLab MCP End-to-End Tests\n');

  if (!API_KEY) {
    console.log('⚠️  VOICELAB_API_KEY not set - skipping e2e tests');
    console.log('   Set the environment variable to run live API tests.\n');
    process.exit(0);
  }

  console.log('✓ API key found');
  console.log(`✓ Base URL: ${BASE_URL}\n`);

  const client = new VoiceLabClient({ apiKey: API_KEY, baseUrl: BASE_URL });
  const llm = new LLMModule(client);
  const tts = new TTSModule(client);
  const voices = new VoicesModule(client);

  let passed = 0;
  let failed = 0;

  // Test 1: List LLM models
  try {
    console.log('Test 1: List LLM models...');
    const models = await llm.listModels();
    if (models.object === 'list' && models.data.length > 0) {
      console.log(`✓ Found ${models.data.length} models`);
      console.log(`  Example: ${models.data[0].id}\n`);
      passed++;
    } else {
      throw new Error('No models returned');
    }
  } catch (error: any) {
    console.error(`✗ Failed: ${error.message}\n`);
    failed++;
  }

  // Test 2: List voices
  try {
    console.log('Test 2: List voices...');
    const voicesResult = await voices.listVoices();
    if (voicesResult.data && voicesResult.data.length > 0) {
      console.log(`✓ Found ${voicesResult.data.length} voices`);
      const uzVoices = voicesResult.data.filter(v => v.language === 'uz');
      console.log(`  Uzbek voices: ${uzVoices.length}\n`);
      passed++;
    } else {
      throw new Error('No voices returned');
    }
  } catch (error: any) {
    console.error(`✗ Failed: ${error.message}\n`);
    failed++;
  }

  // Test 3: List TTS languages
  try {
    console.log('Test 3: List TTS languages...');
    const languages = await tts.listLanguages();
    if (languages.data && languages.data.length > 0) {
      console.log(`✓ Found ${languages.data.length} languages`);
      const langCodes = languages.data.map(l => l.code).join(', ');
      console.log(`  Languages: ${langCodes}\n`);
      passed++;
    } else {
      throw new Error('No languages returned');
    }
  } catch (error: any) {
    console.error(`✗ Failed: ${error.message}\n`);
    failed++;
  }

  // Test 4: Cheap LLM completion (single short message)
  try {
    console.log('Test 4: LLM completion (minimal tokens)...');
    const modelsResult = await llm.listModels();
    const cheapestModel = modelsResult.data[0]?.id;
    
    if (!cheapestModel) {
      throw new Error('No models available');
    }

    const completion = await llm.createChatCompletion({
      model: cheapestModel,
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5,
    }, `e2e-test-${Date.now()}`);

    if (completion.choices && completion.choices.length > 0) {
      console.log(`✓ Completion successful`);
      console.log(`  Model: ${completion.model}`);
      console.log(`  Tokens: ${completion.usage?.total_tokens || 'N/A'}\n`);
      passed++;
    } else {
      throw new Error('No completion returned');
    }
  } catch (error: any) {
    console.error(`✗ Failed: ${error.message}\n`);
    failed++;
  }

  // Summary
  console.log('─'.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
