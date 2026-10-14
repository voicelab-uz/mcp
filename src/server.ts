import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { VoiceLabClient } from './client.js';
import { LLMModule } from './llm.js';
import { TTSModule } from './tts.js';
import { STTModule } from './stt.js';
import { VoicesModule } from './voices.js';
import { VoiceIsolatorModule } from './isolator.js';
import { RealtimeModule } from './realtime.js';
import { MeetingsModule } from './meetings.js';
import { UploadsModule } from './uploads.js';
import { registerTools } from './tools.js';
import { registerResources } from './resources.js';
import { type AppsConfig } from './apps-config.js';
import { type VerifiedOAuthUser } from './oauth.js';
import { VERSION } from './version.js';

/** Capabilities advertised by the VoiceLab MCP server. */
export const SERVER_CAPABILITIES = {
  tools: {},
  resources: {},
} as const;

export interface CreateServerOptions {
  apiKey: string;
  baseUrl: string;
  apps: AppsConfig;
  verifiedUser?: VerifiedOAuthUser | 'legacy';
}

/**
 * Build a per-request MCP server (stateless HTTP) or the stdio server.
 * Hosts that do not support MCP Apps simply ignore ui:// resources and tool `_meta.ui`.
 */
export function createMcpServer(options: CreateServerOptions): Server {
  const client = new VoiceLabClient({ apiKey: options.apiKey, baseUrl: options.baseUrl });
  const modules = {
    llm: new LLMModule(client),
    tts: new TTSModule(client),
    stt: new STTModule(client),
    voices: new VoicesModule(client),
    isolator: new VoiceIsolatorModule(client),
    realtime: new RealtimeModule(client),
    meetings: new MeetingsModule(client),
    uploads: new UploadsModule(client),
  };

  const server = new Server(
    {
      name: 'voicelab-mcp',
      version: VERSION,
    },
    {
      capabilities: { ...SERVER_CAPABILITIES },
    }
  );
  registerTools(server, modules, options.verifiedUser, { apps: options.apps });
  registerResources(server, options.apps);
  return server;
}
