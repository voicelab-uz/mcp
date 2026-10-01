/**
 * VoiceLab OAuth 2.1 Resource Server
 * 
 * Verifies VoiceLab-issued JWT access tokens and extracts per-user API keys.
 * 
 * Architecture:
 * - VoiceLab backend is the OAuth Authorization Server (AS)
 * - This MCP server is the OAuth Resource Server (RS)
 * - JWTs contain user's VoiceLab API key for per-user billing
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { type IncomingMessage } from 'node:http';

export interface OAuthConfig {
  /** VoiceLab OAuth issuer (e.g., https://auth.voicelab.uz) */
  issuer?: string;
  /** This MCP server's resource identifier (audience) */
  audience?: string;
  /** Legacy static Bearer token for non-OAuth clients */
  legacyToken?: string;
}

export interface VerifiedOAuthUser {
  /** User ID from 'sub' claim (e.g., voicelab|user_12345) */
  sub: string;
  /** User's email from JWT */
  email?: string;
  /** User's display name from JWT */
  name?: string;
  /** OAuth scopes granted */
  scopes: string[];
  /** PER-USER VoiceLab API key from JWT (critical for billing) */
  voicelab_api_key: string;
}

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS(issuer: string): ReturnType<typeof createRemoteJWKSet> {
  if (!jwksCache) {
    const jwksUrl = new URL('/.well-known/jwks.json', issuer);
    jwksCache = createRemoteJWKSet(jwksUrl);
  }
  return jwksCache;
}

/**
 * Get OAuth 2.1 Protected Resource Metadata (RFC 9068)
 * 
 * OpenAI discovers this endpoint to initiate OAuth flow.
 */
export function getOAuthResourceMetadata(config: OAuthConfig) {
  if (!config.issuer || !config.audience) {
    return null;
  }

  return {
    resource: config.audience,
    authorization_servers: [config.issuer],
    scopes_supported: ['openid', 'email', 'profile', 'mcp:tools'],
    resource_documentation: 'https://docs.voicelab.uz',
    resource_policy_uri: 'https://voicelab.uz/privacy',
    resource_tos_uri: 'https://voicelab.uz/terms',
  };
}

/**
 * Generate WWW-Authenticate header for 401 responses
 * 
 * Tells OpenAI where to find OAuth metadata for user linking.
 */
export function getWWWAuthenticateHeader(config: OAuthConfig): string {
  if (!config.issuer || !config.audience) {
    return 'Bearer';
  }

  // Point to this resource server's metadata endpoint
  const metadataUrl = new URL('/.well-known/oauth-protected-resource', config.audience);
  return `Bearer realm="VoiceLab MCP", resource_metadata="${metadataUrl.toString()}"`;
}

/**
 * Verify VoiceLab-issued JWT access token
 * 
 * Validates:
 * - Signature via JWKS
 * - Issuer (iss claim)
 * - Audience (aud claim)
 * - Expiration (exp claim)
 * - Required scopes
 * - Presence of voicelab_api_key claim (critical for per-user billing)
 */
async function verifyVoiceLabToken(
  token: string,
  config: OAuthConfig
): Promise<VerifiedOAuthUser | null> {
  if (!config.issuer || !config.audience) {
    return null;
  }

  try {
    const jwks = getJWKS(config.issuer);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.issuer,
      audience: config.audience,
    });

    // Extract user's VoiceLab API key from JWT (critical for per-user billing)
    const voicelab_api_key = payload.voicelab_api_key as string | undefined;
    if (!voicelab_api_key) {
      console.error('JWT missing voicelab_api_key claim (per-user billing requires this)');
      return null;
    }

    const scopes = extractScopes(payload);

    return {
      sub: payload.sub || '',
      email: payload.email as string | undefined,
      name: payload.name as string | undefined,
      scopes,
      voicelab_api_key,
    };
  } catch (error) {
    console.error('JWT verification failed:', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

/**
 * Extract OAuth scopes from JWT payload
 * 
 * VoiceLab AS may put scopes in 'scope' (string) or 'scopes' (array).
 */
function extractScopes(payload: JWTPayload): string[] {
  if (typeof payload.scope === 'string') {
    return payload.scope.split(' ').filter(Boolean);
  }
  if (Array.isArray(payload.scopes)) {
    return payload.scopes.filter((s): s is string => typeof s === 'string');
  }
  return [];
}

/**
 * Verify legacy static Bearer token (for non-OpenAI clients like Cursor, Claude, Grok)
 * 
 * Constant-time comparison to prevent timing attacks.
 */
function verifyLegacyToken(token: string, config: OAuthConfig): boolean {
  if (!config.legacyToken) {
    return false;
  }

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

/**
 * Verify incoming MCP request authorization
 * 
 * Tries OAuth JWT first, falls back to legacy token.
 * Returns VerifiedOAuthUser with per-user API key, or 'legacy', or null.
 */
export async function verifyRequest(
  req: IncomingMessage,
  config: OAuthConfig
): Promise<VerifiedOAuthUser | 'legacy' | null> {
  // If no auth configured, allow everything
  if (!config.issuer && !config.legacyToken) {
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

  // Try OAuth JWT first (OpenAI clients)
  if (config.issuer && config.audience) {
    const verified = await verifyVoiceLabToken(token, config);
    if (verified) {
      return verified;
    }
  }

  // Fall back to legacy token (Cursor, Claude, Grok)
  if (config.legacyToken && verifyLegacyToken(token, config)) {
    return 'legacy';
  }

  return null;
}

/**
 * Check if user has required OAuth scope
 */
export function hasRequiredScope(
  verified: VerifiedOAuthUser | 'legacy' | null,
  requiredScope: string
): boolean {
  if (verified === 'legacy') {
    return true; // Legacy tokens have full access
  }
  if (!verified) {
    return false;
  }
  return verified.scopes.includes(requiredScope) || verified.scopes.includes('mcp:tools');
}
