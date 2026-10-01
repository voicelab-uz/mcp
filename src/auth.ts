import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { type IncomingMessage } from 'node:http';

export interface AuthConfig {
  auth0Domain?: string;
  auth0Audience?: string;
  auth0Issuer?: string;
  legacyToken?: string;
}

export interface VerifiedToken {
  sub: string;
  email?: string;
  name?: string;
  nickname?: string;
  scopes: string[];
}

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS(issuer: string): ReturnType<typeof createRemoteJWKSet> {
  if (!jwksCache) {
    const jwksUrl = new URL('/.well-known/jwks.json', issuer);
    jwksCache = createRemoteJWKSet(jwksUrl);
  }
  return jwksCache;
}

export function getOAuthMetadata(config: AuthConfig) {
  if (!config.auth0Domain || !config.auth0Audience) {
    return null;
  }

  const issuer = config.auth0Issuer || `https://${config.auth0Domain}`;
  
  return {
    resource: config.auth0Audience,
    authorization_servers: [issuer],
    scopes_supported: ['mcp:tools', 'openid', 'email', 'profile'],
    resource_documentation: 'https://docs.voicelab.uz',
    resource_policy_uri: 'https://voicelab.uz/privacy',
    resource_tos_uri: 'https://voicelab.uz/terms',
  };
}

export function getWWWAuthenticateHeader(config: AuthConfig): string {
  if (!config.auth0Domain || !config.auth0Audience) {
    return 'Bearer';
  }

  const resourceUrl = config.auth0Audience.includes('://')
    ? new URL('/.well-known/oauth-protected-resource', config.auth0Audience).toString()
    : `https://${config.auth0Audience}/.well-known/oauth-protected-resource`;

  return `Bearer resource_metadata="${resourceUrl}"`;
}

async function verifyAuth0Token(
  token: string,
  config: AuthConfig
): Promise<VerifiedToken | null> {
  if (!config.auth0Domain || !config.auth0Audience) {
    return null;
  }

  const issuer = config.auth0Issuer || `https://${config.auth0Domain}`;

  try {
    const jwks = getJWKS(issuer);
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: config.auth0Audience,
    });

    const scopes = extractScopes(payload);
    
    return {
      sub: payload.sub || '',
      email: payload.email as string | undefined,
      name: payload.name as string | undefined,
      nickname: payload.nickname as string | undefined,
      scopes,
    };
  } catch (error) {
    console.error('JWT verification failed:', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

function extractScopes(payload: JWTPayload): string[] {
  // Auth0 can put scopes in 'scope' (string) or 'permissions' (array)
  if (typeof payload.scope === 'string') {
    return payload.scope.split(' ').filter(Boolean);
  }
  if (Array.isArray(payload.permissions)) {
    return payload.permissions.filter((s): s is string => typeof s === 'string');
  }
  if (Array.isArray(payload.scope)) {
    return payload.scope.filter((s): s is string => typeof s === 'string');
  }
  return [];
}

function verifyLegacyToken(token: string, config: AuthConfig): boolean {
  if (!config.legacyToken) {
    return false;
  }

  // Constant-time compare via buffer equality
  const tokenBuf = Buffer.from(token, 'utf-8');
  const expectedBuf = Buffer.from(config.legacyToken, 'utf-8');

  if (tokenBuf.length !== expectedBuf.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < tokenBuf.length; i++) {
    mismatch |= tokenBuf[i] ^ expectedBuf[i];
  }

  return mismatch === 0;
}

export async function verifyRequest(
  req: IncomingMessage,
  config: AuthConfig
): Promise<VerifiedToken | 'legacy' | null> {
  // If no auth configured at all, allow everything
  if (!config.auth0Domain && !config.legacyToken) {
    return 'legacy';
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) {
    return null;
  }

  const token = match[1];

  // Try OAuth first if configured
  if (config.auth0Domain && config.auth0Audience) {
    const verified = await verifyAuth0Token(token, config);
    if (verified) {
      return verified;
    }
  }

  // Fall back to legacy token
  if (config.legacyToken && verifyLegacyToken(token, config)) {
    return 'legacy';
  }

  return null;
}

export function hasRequiredScope(verified: VerifiedToken | 'legacy' | null, requiredScope: string): boolean {
  if (verified === 'legacy') {
    return true; // Legacy tokens have full access
  }
  if (!verified) {
    return false;
  }
  return verified.scopes.includes(requiredScope) || verified.scopes.includes('mcp:tools');
}
