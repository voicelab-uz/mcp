/**
 * Runtime configuration for MCP Apps (UI resources) and audio ingestion.
 *
 * Pure (no `process` access) so it can be unit-tested and imported from code
 * that is also type-checked for the legacy worker build. `index.ts` / `server.ts`
 * pass `process.env` in.
 */

export interface SpikeConfig {
  /** HTTPS endpoint that accepts PUT with permissive CORS (Phase 0 spike only). */
  echoUrl: string;
  /** Origin of echoUrl, used for the spike resource CSP connectDomains. */
  echoOrigin: string;
}

export interface AppsConfig {
  /** Origin of the VoiceLab API (upload_url host). Used for upload view CSP connectDomains. */
  apiOrigin: string;
  /**
   * Optional browser upload page (frontend). When set, upload_audio returns
   * `${uploadPageUrl}#t=<token>&id=<upload_id>&p=<purpose>` as a fallback link.
   */
  uploadPageUrl?: string;
  /** ChatGPT widget domain (openai/widgetDomain). */
  widgetDomain: string;
  /**
   * Upload sessions (POST /v1/uploads) are available on the backend. Gates upload_audio,
   * create_upload_session, get_upload, ui://voicelab/upload and the upload_id source.
   * MCP_ENABLE_UPLOAD_SESSIONS=1; default off.
   */
  uploadSessions: boolean;
  /** Phase 0 spike: present only when MCP_ENABLE_SPIKE=1 and SPIKE_ECHO_URL is a valid https URL. */
  spike?: SpikeConfig;
}

export const DEFAULT_API_ORIGIN = 'https://api.voicelab.uz';
export const DEFAULT_WIDGET_DOMAIN = 'https://mcp.voicelab.uz';

function httpsUrl(raw: string | undefined): URL | undefined {
  if (!raw || !raw.trim()) return undefined;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

export interface AppsConfigWarnings {
  warnings: string[];
}

/**
 * Build AppsConfig from an env-like record. Invalid optional values are dropped
 * (with a warning) instead of crashing the server.
 */
export function loadAppsConfig(
  env: Record<string, string | undefined>,
  apiBaseUrl: string = DEFAULT_API_ORIGIN
): AppsConfig & AppsConfigWarnings {
  const warnings: string[] = [];

  let apiOrigin = DEFAULT_API_ORIGIN;
  const api = httpsUrl(apiBaseUrl);
  if (api) apiOrigin = api.origin;
  else warnings.push('API base URL is not https; upload view CSP falls back to the default API origin');

  let uploadPageUrl: string | undefined;
  if (env.UPLOAD_PAGE_URL) {
    const page = httpsUrl(env.UPLOAD_PAGE_URL);
    if (page && !page.hash) {
      uploadPageUrl = `${page.origin}${page.pathname}${page.search}`;
    } else {
      warnings.push('UPLOAD_PAGE_URL ignored (must be an https URL without a #fragment)');
    }
  }

  const widget = httpsUrl(env.MCP_WIDGET_DOMAIN);
  const widgetDomain = widget ? widget.origin : DEFAULT_WIDGET_DOMAIN;

  let spike: SpikeConfig | undefined;
  if (env.MCP_ENABLE_SPIKE === '1') {
    const echo = httpsUrl(env.SPIKE_ECHO_URL);
    if (echo) {
      spike = { echoUrl: echo.toString(), echoOrigin: echo.origin };
    } else {
      warnings.push('MCP_ENABLE_SPIKE=1 but SPIKE_ECHO_URL is missing or not https; spike disabled');
    }
  }

  const uploadSessions = env.MCP_ENABLE_UPLOAD_SESSIONS === '1';
  if (uploadPageUrl && !uploadSessions) {
    warnings.push('UPLOAD_PAGE_URL has no effect while MCP_ENABLE_UPLOAD_SESSIONS is off');
  }

  return { apiOrigin, uploadPageUrl, widgetDomain, uploadSessions, spike, warnings };
}

/** Origin of a URL string, or undefined. */
export function originOf(url: string | undefined): string | undefined {
  return httpsUrl(url)?.origin;
}
