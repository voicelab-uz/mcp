import { VERSION } from '../version.js';
import { BASE_CSS, BRIDGE_JS, jsonForScript } from './bridge.js';

/**
 * Phase 0 spike view (ui://voicelab/spike). Only served when MCP_ENABLE_SPIKE=1.
 *
 * Answers, per host (Claude, ChatGPT): does the handshake work, can the iframe open
 * a file picker / accept drops, can it PUT to a cross-origin HTTPS endpoint with a
 * custom header (CORS preflight + CSP connectDomains), does tool-result _meta reach
 * the view, and do tools/call (app-only tool), ui/message, ui/update-model-context
 * and ui/open-link work. Everything is shown in a diagnostics table and a JSON
 * report a human can screenshot or copy.
 */

export interface SpikeViewOptions {
  echoUrl: string;
}

const SPIKE_CSS = `
table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
td { border-top: 1px solid var(--vl-border); padding: 4px 6px; vertical-align: top; word-break: break-word; }
td:first-child { width: 38%; color: var(--vl-fg-2); }
td.ok { color: var(--vl-ok); }
td.fail { color: var(--vl-danger); }
.drop { display: block; border: 2px dashed var(--vl-border); border-radius: var(--vl-radius); padding: 16px; text-align: center; margin: 8px 0; background: var(--vl-bg-2); }
.drop.over { border-color: var(--vl-accent); }
.row { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
pre { background: var(--vl-bg-2); padding: 8px; border-radius: 6px; font-size: 11px; white-space: pre-wrap; word-break: break-word; max-height: 240px; overflow: auto; }
progress { width: 100%; }
`;

const ROWS: Array<[string, string]> = [
  ['handshake', 'ui/initialize'],
  ['host_info', 'hostInfo'],
  ['host_context', 'hostContext (platform / displayMode / theme)'],
  ['window_openai', 'window.openai present'],
  ['tool_input', 'tool-input received'],
  ['tool_result', 'tool-result received'],
  ['tool_result_meta', 'tool-result _meta["voicelab/spike"]'],
  ['picker_opened', 'file picker opened (click)'],
  ['file_selected', 'file selected / dropped'],
  ['file_size', 'file size / type'],
  ['put_status', 'PUT status (preflight + upload)'],
  ['put_progress', 'PUT upload progress events'],
  ['csp_violation', 'CSP violation event'],
  ['tools_call', 'tools/call upload_spike_done'],
  ['ui_message', 'ui/message result'],
  ['update_model_context', 'ui/update-model-context result'],
  ['open_link', 'ui/open-link result'],
];

const SPIKE_JS = `
(function () {
  'use strict';
  var report = { view_version: CONFIG.version, echo_origin: '', started_at: new Date().toISOString() };
  try { report.echo_origin = new URL(CONFIG.echoUrl).origin; } catch (e) {}

  function cell(key) { return document.getElementById('v-' + key); }
  function set(key, value, ok) {
    report[key] = value;
    var c = cell(key);
    if (c) {
      c.textContent = typeof value === 'string' ? value : JSON.stringify(value);
      c.className = ok === true ? 'ok' : ok === false ? 'fail' : '';
    }
    document.getElementById('report').textContent = JSON.stringify(report, null, 2);
  }
  function errMsg(e) {
    if (!e) return 'unknown error';
    if (typeof e === 'string') return e;
    return (e.code !== undefined ? '[' + e.code + '] ' : '') + (e.message || JSON.stringify(e));
  }

  // ---- host messages ----
  Bridge.on('ui/notifications/tool-input', function (p) {
    set('tool_input', 'yes: ' + JSON.stringify(p.arguments || {}).slice(0, 200), true);
  });
  Bridge.on('ui/notifications/tool-result', function (r) {
    set('tool_result', 'yes (isError=' + !!(r && r.isError) + ', structuredContent=' + !!(r && r.structuredContent) + ')', true);
    var meta = r && r._meta && r._meta['voicelab/spike'];
    if (meta) set('tool_result_meta', 'yes: nonce=' + String(meta.nonce || '').slice(0, 12), true);
    else set('tool_result_meta', 'NO _meta["voicelab/spike"] in tool-result (keys: ' + Object.keys((r && r._meta) || {}).join(',') + ')', false);
  });
  Bridge.on('ui/notifications/host-context-changed', Bridge.applyHostContext);

  document.addEventListener('securitypolicyviolation', function (e) {
    set('csp_violation', e.violatedDirective + ' blocked ' + e.blockedURI, false);
  });

  // ---- file picker / drop ----
  var input = document.getElementById('file');
  var drop = document.getElementById('drop');
  input.addEventListener('click', function () { set('picker_opened', 'yes (click fired)', true); });
  input.addEventListener('change', function () {
    if (input.files && input.files[0]) onFile(input.files[0], 'picker');
    else set('file_selected', 'change fired but no file', false);
  });
  ['dragenter', 'dragover'].forEach(function (t) {
    drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); });
  });
  drop.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) onFile(f, 'drop'); else set('file_selected', 'drop event without file', false);
  });

  function onFile(file, via) {
    set('file_selected', 'yes via ' + via, true);
    set('file_size', file.size + ' bytes, type=' + (file.type || '(empty)'), file.size > 0);
    var started = Date.now();
    var events = 0;
    var xhr = new XMLHttpRequest();
    try {
      xhr.open('PUT', CONFIG.echoUrl, true);
      xhr.setRequestHeader('X-Upload-Token', 'spike-not-a-secret');
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    } catch (e) {
      set('put_status', 'open() threw: ' + errMsg(e), false);
      return;
    }
    set('put_status', 'sending…');
    xhr.upload.onprogress = function (e) {
      events++;
      if (e.lengthComputable) {
        document.getElementById('progress').value = Math.round((e.loaded / e.total) * 100);
        set('put_progress', events + ' events, ' + e.loaded + '/' + e.total + ' bytes', true);
      }
    };
    xhr.onload = function () {
      var ok = xhr.status >= 200 && xhr.status < 300;
      set('put_status', 'HTTP ' + xhr.status + ' in ' + (Date.now() - started) + ' ms, response ' + (xhr.responseText || '').length + ' chars', ok);
      if (!events) set('put_progress', 'no progress events', false);
      finish();
    };
    xhr.onerror = function () {
      set('put_status', 'network error after ' + (Date.now() - started) + ' ms (CORS preflight failure or CSP block; see CSP row)', false);
      finish();
    };
    xhr.send(file);
  }

  function finish() {
    var summary = {};
    Object.keys(report).forEach(function (k) { summary[k] = report[k]; });
    Bridge.request('tools/call', { name: 'upload_spike_done', arguments: { report: summary } }, 30000)
      .then(function (r) {
        set('tools_call', r && r.isError ? 'isError: ' + JSON.stringify(r.content || '').slice(0, 200) : 'ok', !(r && r.isError));
      })
      .catch(function (e) { set('tools_call', 'error: ' + errMsg(e), false); })
      .then(function () {
        var text = 'VoiceLab MCP Apps spike finished. PUT: ' + (report.put_status || 'n/a') +
          '. tool-result _meta: ' + (report.tool_result_meta || 'n/a') + '.';
        return Bridge.request('ui/message', { role: 'user', content: { type: 'text', text: text } }, 15000)
          .then(function () { set('ui_message', 'ok', true); })
          .catch(function (e) { set('ui_message', 'error: ' + errMsg(e), false); });
      });
  }

  document.getElementById('btn-context').addEventListener('click', function () {
    Bridge.request('ui/update-model-context', { content: [{ type: 'text', text: 'VoiceLab spike context update at ' + new Date().toISOString() }] }, 15000)
      .then(function () { set('update_model_context', 'ok', true); })
      .catch(function (e) { set('update_model_context', 'error: ' + errMsg(e), false); });
  });
  document.getElementById('btn-link').addEventListener('click', function () {
    Bridge.request('ui/open-link', { url: 'https://voicelab.uz/' }, 15000)
      .then(function () { set('open_link', 'ok', true); })
      .catch(function (e) { set('open_link', 'error: ' + errMsg(e), false); });
  });

  var oa = window.openai;
  set('window_openai', oa ? 'yes (uploadFile=' + (typeof oa.uploadFile) + ', toolResponseMetadata=' + !!oa.toolResponseMetadata + ')' : 'no');
  if (oa && oa.toolResponseMetadata && oa.toolResponseMetadata['voicelab/spike']) {
    set('tool_result_meta', 'yes via window.openai.toolResponseMetadata', true);
  }

  set('handshake', 'pending…');
  Bridge.initialize({ name: 'voicelab-spike', version: CONFIG.version })
    .then(function (res) {
      set('handshake', 'ok (protocolVersion ' + (res.protocolVersion || '?') + ')', true);
      set('host_info', res.hostInfo ? (res.hostInfo.name + ' ' + (res.hostInfo.version || '')) : '(none)');
      var ctx = res.hostContext || {};
      set('host_context', [ctx.platform, ctx.displayMode, ctx.theme, ctx.locale].filter(Boolean).join(' / ') || '(empty)');
      Bridge.applyHostContext(ctx);
    })
    .catch(function (e) { set('handshake', 'failed: ' + errMsg(e), false); })
    .then(function () { Bridge.autoResize(); });
})();
`;

export function renderSpikeViewHtml(options: SpikeViewOptions): string {
  const config = { echoUrl: options.echoUrl, version: VERSION };
  const rows = ROWS.map(
    ([key, label]) => `<tr><td>${label}</td><td id="v-${key}">—</td></tr>`
  ).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VoiceLab MCP Apps spike</title>
<style>${BASE_CSS}${SPIKE_CSS}</style>
</head>
<body>
<main>
  <h1>VoiceLab MCP Apps spike</h1>
  <p class="muted">Diagnostics only. Use a small test file; it is sent to the configured echo endpoint, not to VoiceLab.</p>
  <label class="drop" id="drop">Pick or drop a file<input type="file" id="file"></label>
  <progress id="progress" max="100" value="0"></progress>
  <div class="row">
    <button type="button" id="btn-context">Test ui/update-model-context</button>
    <button type="button" id="btn-link">Test ui/open-link</button>
  </div>
  <table><tbody>
${rows}
  </tbody></table>
  <p class="muted">Report (copy or screenshot this):</p>
  <pre id="report"></pre>
</main>
<script>var CONFIG = ${jsonForScript(config)};</script>
<script>${BRIDGE_JS}</script>
<script>${SPIKE_JS}</script>
</body>
</html>`;
}
