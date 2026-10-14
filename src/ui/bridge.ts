/**
 * Minimal MCP Apps (SEP-1865, spec 2026-01-26) view-side bridge, inlined into
 * every ui:// HTML resource. No framework, no external scripts.
 *
 * Security rules enforced here:
 *  - only messages whose `source` is `window.parent` are accepted;
 *  - only JSON-RPC 2.0 envelopes are processed;
 *  - nothing is ever logged to the console (tokens may flow through results).
 */

export const MCP_APPS_PROTOCOL_VERSION = '2026-01-26';

/** Serialize a value for safe embedding inside an inline <script>. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Defines a global `Bridge` object:
 *   Bridge.request(method, params, timeoutMs) -> Promise<result>
 *   Bridge.notify(method, params)
 *   Bridge.on(method, handler(params, msg))
 *   Bridge.initialize(clientInfo) -> Promise<McpUiInitializeResult>
 *   Bridge.autoResize()
 */
export const BRIDGE_JS = `
var Bridge = (function () {
  'use strict';
  var PROTOCOL_VERSION = ${JSON.stringify(MCP_APPS_PROTOCOL_VERSION)};
  var nextId = 1;
  var pending = {};
  var handlers = {};

  function post(msg) {
    // The host/sandbox origin is not known to the view; payloads never carry secrets.
    window.parent.postMessage(msg, '*');
  }
  function respond(id, result) {
    post({ jsonrpc: '2.0', id: id, result: result || {} });
  }
  function respondError(id, code, message) {
    post({ jsonrpc: '2.0', id: id, error: { code: code, message: message } });
  }
  function request(method, params, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var id = nextId++;
      var timer = setTimeout(function () {
        delete pending[id];
        reject({ code: -32001, message: 'Request timed out: ' + method });
      }, timeoutMs || 30000);
      pending[id] = {
        resolve: function (r) { clearTimeout(timer); resolve(r); },
        reject: function (e) { clearTimeout(timer); reject(e); }
      };
      post({ jsonrpc: '2.0', id: id, method: method, params: params || {} });
    });
  }
  function notify(method, params) {
    post({ jsonrpc: '2.0', method: method, params: params || {} });
  }
  function on(method, fn) {
    handlers[method] = fn;
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    var msg = event.data;
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') return;
    var hasId = typeof msg.id === 'number' || typeof msg.id === 'string';

    if (typeof msg.method !== 'string') {
      if (!hasId) return;
      var p = pending[msg.id];
      if (!p) return;
      delete pending[msg.id];
      if (msg.error) p.reject(msg.error);
      else p.resolve(msg.result);
      return;
    }

    var fn = handlers[msg.method];
    var params = msg.params && typeof msg.params === 'object' ? msg.params : {};
    if (fn) {
      try { fn(params, msg); } catch (e) { /* never let a handler break the bridge */ }
    }
    if (hasId) {
      if (msg.method === 'ui/resource-teardown' || msg.method === 'ping' || fn) respond(msg.id, {});
      else respondError(msg.id, -32601, 'Method not found');
    }
  });

  function initialize(clientInfo) {
    return request('ui/initialize', {
      protocolVersion: PROTOCOL_VERSION,
      appCapabilities: { availableDisplayModes: ['inline'] },
      clientInfo: clientInfo
    }, 15000).then(function (result) {
      notify('ui/notifications/initialized', {});
      return result || {};
    });
  }

  function autoResize() {
    var last = '';
    function report() {
      // Report content size (body), not the iframe viewport.
      var rect = document.body.getBoundingClientRect();
      var w = Math.ceil(rect.width);
      var h = Math.ceil(rect.height);
      var key = w + 'x' + h;
      if (key === last) return;
      last = key;
      notify('ui/notifications/size-changed', { width: w, height: h });
    }
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(report).observe(document.body);
    }
    report();
  }

  function applyHostContext(ctx) {
    if (!ctx || typeof ctx !== 'object') return;
    if (ctx.theme === 'light' || ctx.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', ctx.theme);
    }
    var vars = ctx.styles && ctx.styles.variables;
    if (vars && typeof vars === 'object') {
      Object.keys(vars).forEach(function (k) {
        if (k.indexOf('--') === 0 && typeof vars[k] === 'string') {
          document.documentElement.style.setProperty(k, vars[k]);
        }
      });
    }
  }

  return {
    request: request,
    notify: notify,
    on: on,
    initialize: initialize,
    autoResize: autoResize,
    applyHostContext: applyHostContext
  };
})();
`;

/** Shared base styles; uses MCP Apps host CSS variables with fallbacks. */
export const BASE_CSS = `
:root {
  color-scheme: light dark;
  --vl-bg: var(--color-background-primary, #ffffff);
  --vl-bg-2: var(--color-background-secondary, #f4f4f5);
  --vl-fg: var(--color-text-primary, #18181b);
  --vl-fg-2: var(--color-text-secondary, #52525b);
  --vl-border: var(--color-border-primary, #d4d4d8);
  --vl-accent: #2563eb;
  --vl-danger: #dc2626;
  --vl-ok: #16a34a;
  --vl-radius: var(--border-radius-md, 10px);
  --vl-font: var(--font-sans, system-ui, -apple-system, "Segoe UI", sans-serif);
}
:root[data-theme="dark"] {
  --vl-bg: var(--color-background-primary, #18181b);
  --vl-bg-2: var(--color-background-secondary, #27272a);
  --vl-fg: var(--color-text-primary, #fafafa);
  --vl-fg-2: var(--color-text-secondary, #a1a1aa);
  --vl-border: var(--color-border-primary, #3f3f46);
  --vl-accent: #60a5fa;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--vl-bg); color: var(--vl-fg); font-family: var(--vl-font); font-size: 14px; line-height: 1.45; }
main { padding: 16px; max-width: 640px; margin: 0 auto; }
h1 { font-size: 16px; margin: 0 0 4px; }
p { margin: 0 0 8px; }
.muted { color: var(--vl-fg-2); font-size: 12px; }
button { font: inherit; border-radius: var(--vl-radius); border: 1px solid var(--vl-border); background: var(--vl-bg-2); color: var(--vl-fg); padding: 6px 12px; cursor: pointer; }
button.primary { background: var(--vl-accent); border-color: var(--vl-accent); color: #fff; }
button:disabled { opacity: .5; cursor: default; }
.hidden { display: none !important; }
`;
