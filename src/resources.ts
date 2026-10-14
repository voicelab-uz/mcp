import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { type AppsConfig, originOf } from './apps-config.js';
import { renderUploadViewHtml } from './ui/upload-view.js';
import { renderSpikeViewHtml } from './ui/spike-view.js';

/** MCP Apps (spec 2026-01-26) UI resources served by this server. */

export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';
export const UPLOAD_RESOURCE_URI = 'ui://voicelab/upload';
export const SPIKE_RESOURCE_URI = 'ui://voicelab/spike';

/** JSON-RPC error code for an unknown resource (MCP spec). */
export const RESOURCE_NOT_FOUND = -32002;

export interface UiResource {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: typeof MCP_APP_MIME_TYPE;
  _meta: Record<string, unknown>;
  render: () => string;
}

function cspMeta(
  connectDomains: string[],
  widgetDomain: string,
  description: string,
  redirectDomains: string[] = []
): Record<string, unknown> {
  return {
    ui: {
      csp: { connectDomains, resourceDomains: [] },
      prefersBorder: true,
    },
    // ChatGPT compatibility aliases (legacy keys still read by ChatGPT).
    'openai/widgetCSP': {
      connect_domains: connectDomains,
      resource_domains: [],
      ...(redirectDomains.length ? { redirect_domains: redirectDomains } : {}),
    },
    'openai/widgetDomain': widgetDomain,
    'openai/widgetDescription': description,
    'openai/widgetPrefersBorder': true,
  };
}

export function uiResources(config: AppsConfig): UiResource[] {
  const pageOrigin = originOf(config.uploadPageUrl);
  const resources: UiResource[] = [];
  if (config.uploadSessions) {
    resources.push({
      uri: UPLOAD_RESOURCE_URI,
      name: 'voicelab-upload',
      title: 'Upload audio to VoiceLab',
      description: 'Upload an audio file to VoiceLab',
      mimeType: MCP_APP_MIME_TYPE,
      _meta: cspMeta(
        [config.apiOrigin],
        config.widgetDomain,
        'Upload an audio file to VoiceLab',
        pageOrigin ? [pageOrigin] : []
      ),
      render: () => renderUploadViewHtml({ apiOrigin: config.apiOrigin }),
    });
  }
  if (config.spike) {
    const spike = config.spike;
    resources.push({
      uri: SPIKE_RESOURCE_URI,
      name: 'voicelab-spike',
      title: 'VoiceLab MCP Apps spike',
      description: 'Diagnostics view for MCP Apps file upload capabilities (staging only)',
      mimeType: MCP_APP_MIME_TYPE,
      _meta: cspMeta(
        [spike.echoOrigin],
        config.widgetDomain,
        'Diagnostics view for MCP Apps upload capabilities',
        ['https://voicelab.uz']
      ),
      render: () => renderSpikeViewHtml({ echoUrl: spike.echoUrl }),
    });
  }
  return resources;
}

export function listResourcesResult(config: AppsConfig) {
  return {
    resources: uiResources(config).map(({ uri, name, title, description, mimeType, _meta }) => ({
      uri,
      name,
      title,
      description,
      mimeType,
      _meta,
    })),
  };
}

export function readResourceResult(config: AppsConfig, uri: string) {
  const resource = uiResources(config).find((r) => r.uri === uri);
  if (!resource) {
    throw new McpError(RESOURCE_NOT_FOUND, 'Resource not found');
  }
  return {
    contents: [
      {
        uri: resource.uri,
        mimeType: resource.mimeType,
        text: resource.render(),
        _meta: resource._meta,
      },
    ],
  };
}

export function registerResources(server: Server, config: AppsConfig): void {
  server.setRequestHandler(ListResourcesRequestSchema, async () => listResourcesResult(config));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: [] }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) =>
    readResourceResult(config, request.params.uri)
  );
}
