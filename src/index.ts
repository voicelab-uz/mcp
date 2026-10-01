#!/usr/bin/env node

import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { VoiceLabClient } from './client.js';
import { LLMModule } from './llm.js';
import { TTSModule } from './tts.js';
import { STTModule } from './stt.js';
import { VoicesModule } from './voices.js';
import { VoiceIsolatorModule } from './isolator.js';
import { RealtimeModule } from './realtime.js';
import { registerTools } from './tools.js';
import { 
  type AuthConfig, 
  type VerifiedToken,
  getOAuthMetadata, 
  getWWWAuthenticateHeader, 
  verifyRequest,
} from './auth.js';

const VERSION = '1.0.0';
const API_KEY = process.env.VOICELAB_API_KEY;
const BASE_URL = process.env.VOICELAB_BASE_URL || 'https://api.voicelab.uz';
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || '';
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || '';
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE || '';
const AUTH0_ISSUER = process.env.AUTH0_ISSUER || '';
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 10 * 1024 * 1024);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 120_000);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 120);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!API_KEY) {
  console.error('Error: VOICELAB_API_KEY environment variable is required');
  process.exit(1);
}

function createMcpServer(verifiedUser?: VerifiedToken | 'legacy'): Server {
  const client = new VoiceLabClient({ apiKey: API_KEY!, baseUrl: BASE_URL });
  const modules = {
    llm: new LLMModule(client),
    tts: new TTSModule(client),
    stt: new STTModule(client),
    voices: new VoicesModule(client),
    isolator: new VoiceIsolatorModule(client),
    realtime: new RealtimeModule(client),
  };

  const server = new Server(
    {
      name: 'voicelab-mcp',
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );
  registerTools(server, modules, verifiedUser);
  return server;
}

function applySecurityHeaders(res: ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('Cache-Control', 'no-store');
  // Harmless behind TLS-terminating nginx; nginx also sets HSTS on the edge.
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (!origin) {
    return true;
  }
  if (ALLOWED_ORIGINS.length === 0) {
    // No CORS allowlist configured: do not reflect arbitrary origins.
    return true;
  }
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, mcp-session-id, Accept, Last-Event-ID'
    );
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
    res.setHeader('Access-Control-Max-Age', '86400');
    return true;
  }
  return false;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  applySecurityHeaders(res);
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendApiError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string
): void {
  sendJson(res, status, { error: { code, message } });
}

function getAuthConfig(): AuthConfig {
  return {
    auth0Domain: AUTH0_DOMAIN || undefined,
    auth0Audience: AUTH0_AUDIENCE || undefined,
    auth0Issuer: AUTH0_ISSUER || undefined,
    legacyToken: MCP_AUTH_TOKEN || undefined,
  };
}

function clientIp(req: IncomingMessage): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) {
    return xf.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  // Opportunistic cleanup
  if (rateBuckets.size > 10_000) {
    for (const [key, value] of rateBuckets) {
      if (now >= value.resetAt) rateBuckets.delete(key);
    }
  }
  return bucket.count <= RATE_LIMIT_MAX;
}

function contentLengthTooLarge(req: IncomingMessage): boolean {
  const raw = req.headers['content-length'];
  if (!raw) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n > MAX_BODY_BYTES;
}

function healthBody() {
  return {
    status: 'healthy',
    version: VERSION,
    links: {
      self: '/',
      health: '/health',
      discovery: '/v1',
      mcp: '/mcp',
      well_known: '/.well-known/mcp.json',
      documentation: 'https://docs.voicelab.uz',
      repository: 'https://github.com/voicelab-uz/mcp',
    },
  };
}

function discoveryBody() {
  const config = getAuthConfig();
  const oauthMeta = getOAuthMetadata(config);

  let authInfo: any;
  if (oauthMeta) {
    authInfo = {
      type: 'oauth2',
      scheme: 'bearer',
      header: 'Authorization',
      format: 'Bearer <access_token>',
      note: 'OAuth 2.1 via Auth0. Legacy Bearer tokens also accepted for non-OpenAI clients.',
      oauth: {
        authorization_servers: oauthMeta.authorization_servers,
        scopes: oauthMeta.scopes_supported,
        resource: oauthMeta.resource,
      },
    };
  } else if (MCP_AUTH_TOKEN) {
    authInfo = {
      type: 'http',
      scheme: 'bearer',
      header: 'Authorization',
      format: 'Bearer <token>',
      note: 'Required for /mcp. Obtain token from the VoiceLab MCP operator.',
    };
  } else {
    authInfo = {
      type: 'none',
      note: 'MCP_AUTH_TOKEN is not configured; /mcp is open to the network path that reaches this process.',
    };
  }

  return {
    name: 'voicelab-mcp',
    version: VERSION,
    description: 'VoiceLab Model Context Protocol server',
    protocol: 'mcp',
    transport: 'streamable-http',
    links: {
      mcp: '/mcp',
      health: '/health',
      documentation: 'https://docs.voicelab.uz',
      repository: 'https://github.com/voicelab-uz/mcp',
      ...(oauthMeta ? { oauth_resource_metadata: '/.well-known/oauth-protected-resource' } : {}),
    },
    auth: authInfo,
    endpoints: {
      mcp: {
        path: '/mcp',
        methods: ['POST', 'GET', 'DELETE'],
        accept: ['application/json', 'text/event-stream'],
      },
      health: { path: '/health', methods: ['GET'] },
      ...(oauthMeta ? {
        oauth_metadata: {
          path: '/.well-known/oauth-protected-resource',
          methods: ['GET'],
        },
      } : {}),
    },
  };
}

async function handleMcpRequest(
  req: IncomingMessage, 
  res: ServerResponse,
  verifiedUser?: VerifiedToken | 'legacy'
): Promise<void> {
  applySecurityHeaders(res);
  const server = createMcpServer(verifiedUser);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  try {
    await transport.handleRequest(req, res);
  } finally {
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
  }
}

async function startHttp(): Promise<void> {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3100);
  const authConfig = getAuthConfig();

  if (AUTH0_DOMAIN && AUTH0_AUDIENCE) {
    console.error('OAuth 2.1: enabled via Auth0 (OpenAI-compatible)');
    console.error(`  Issuer: ${AUTH0_ISSUER || `https://${AUTH0_DOMAIN}`}`);
    console.error(`  Audience: ${AUTH0_AUDIENCE}`);
  }
  if (MCP_AUTH_TOKEN) {
    console.error('MCP Bearer auth: legacy token enabled for fallback');
  }
  if (!AUTH0_DOMAIN && !MCP_AUTH_TOKEN) {
    console.error('Auth: disabled (set AUTH0_DOMAIN+AUTH0_AUDIENCE or MCP_AUTH_TOKEN to enable)');
  }
  if (ALLOWED_ORIGINS.length > 0) {
    console.error(`CORS allowlist: ${ALLOWED_ORIGINS.length} origin(s)`);
  } else {
    console.error('CORS: no ALLOWED_ORIGINS (wildcard disabled; browser cross-origin blocked)');
  }

  const httpServer = createServer(async (req, res) => {
    try {
      applySecurityHeaders(res);

      if (!checkRateLimit(clientIp(req))) {
        res.setHeader('Retry-After', '60');
        sendApiError(res, 429, 'rate_limited', 'Too many requests');
        return;
      }

      const corsOk = applyCors(req, res);
      if (!corsOk) {
        sendApiError(res, 403, 'origin_forbidden', 'Origin not allowed');
        return;
      }

      if (req.method === 'OPTIONS') {
        if (ALLOWED_ORIGINS.length === 0) {
          // No CORS configured — nothing to preflight for browsers.
          sendApiError(res, 403, 'cors_disabled', 'CORS is not enabled');
          return;
        }
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (path === '/' || path === '/health') {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.setHeader('Allow', 'GET, HEAD');
          sendApiError(res, 405, 'method_not_allowed', 'Method not allowed');
          return;
        }
        sendJson(res, 200, healthBody());
        return;
      }

      if (path === '/v1' || path === '/.well-known/mcp.json') {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.setHeader('Allow', 'GET, HEAD');
          sendApiError(res, 405, 'method_not_allowed', 'Method not allowed');
          return;
        }
        sendJson(res, 200, discoveryBody());
        return;
      }

      if (path === '/.well-known/oauth-protected-resource') {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.setHeader('Allow', 'GET, HEAD');
          sendApiError(res, 405, 'method_not_allowed', 'Method not allowed');
          return;
        }
        const metadata = getOAuthMetadata(authConfig);
        if (!metadata) {
          sendApiError(res, 404, 'not_found', 'OAuth not configured');
          return;
        }
        sendJson(res, 200, metadata);
        return;
      }

      if (path === '/mcp') {
        const method = req.method || 'GET';
        if (method !== 'POST' && method !== 'GET' && method !== 'DELETE') {
          res.setHeader('Allow', 'GET, POST, DELETE');
          sendApiError(res, 405, 'method_not_allowed', 'Method not allowed');
          return;
        }

        const verified = await verifyRequest(req, authConfig);
        if (!verified) {
          res.setHeader('WWW-Authenticate', getWWWAuthenticateHeader(authConfig));
          sendApiError(res, 401, 'unauthorized', 'Unauthorized');
          return;
        }

        if ((method === 'POST' || method === 'DELETE') && contentLengthTooLarge(req)) {
          sendApiError(res, 413, 'payload_too_large', 'Request body too large');
          req.resume();
          return;
        }

        try {
          await handleMcpRequest(req, res, verified);
        } catch (error) {
          const err = error as Error;
          console.error('MCP error:', err?.name || 'Error', err?.message || 'unknown');
          if (!res.headersSent) {
            sendJson(res, 500, {
              jsonrpc: '2.0',
              error: { code: -32603, message: 'Internal server error' },
              id: null,
            });
          }
        }
        return;
      }

      sendApiError(res, 404, 'not_found', 'Not found');
    } catch (error) {
      const err = error as Error;
      console.error('Request handler error:', err?.name || 'Error', err?.message || 'unknown');
      if (!res.headersSent) {
        sendApiError(res, 500, 'internal_error', 'Internal server error');
      }
    }
  });

  httpServer.requestTimeout = REQUEST_TIMEOUT_MS;
  httpServer.headersTimeout = Math.min(60_000, REQUEST_TIMEOUT_MS);
  httpServer.keepAliveTimeout = 10_000;
  httpServer.maxHeadersCount = 50;

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      console.error(`VoiceLab MCP HTTP server listening on http://${host}:${port}`);
      console.error(`Health: http://${host}:${port}/health`);
      console.error(`MCP:    http://${host}:${port}/mcp`);
      resolve();
    });
  });
}

async function startStdio(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('VoiceLab MCP server running on stdio');
}

async function main(): Promise<void> {
  if (process.argv.includes('--http')) {
    await startHttp();
  } else {
    await startStdio();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error instanceof Error ? error.message : 'unknown');
  process.exit(1);
});
