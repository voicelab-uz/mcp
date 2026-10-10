/**
 * Single source of truth for VoiceLab MCP server version.
 * Imports package.json as a JSON module (works in both Node.js and Cloudflare Workers).
 */

import packageJson from '../package.json' with { type: 'json' };

/**
 * Server version - imported from package.json at build time
 */
export const VERSION: string = packageJson.version;
