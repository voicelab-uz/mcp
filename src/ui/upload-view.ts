import { VERSION } from '../version.js';
import { BASE_CSS, BRIDGE_JS, jsonForScript } from './bridge.js';

/**
 * MCP Apps view for ui://voicelab/upload.
 *
 * Lifecycle:
 *  1. ui/initialize handshake; host sends tool-input (purpose/title/language) and
 *     tool-result (structuredContent.upload_id + _meta["voicelab/upload"]).
 *  2. User picks or drops a file; client-side checks (type, size <= max_bytes).
 *  3. If there is no usable session (missing, used, expiring, wrong purpose) the
 *     view calls the app-only tool create_upload_session.
 *  4. XHR PUT to upload_url with X-Upload-Token (never Authorization), with progress.
 *  5. On 2xx: tools/call create_meeting | speech_to_text with { upload_id, ... }.
 *  6. ui/message to tell the model (fallback: ui/update-model-context).
 *
 * The upload token is held only in memory, never logged, never rendered, and only
 * sent to an https upload_url on the configured API origin.
 */

export interface UploadViewOptions {
  /** e.g. https://api.voicelab.uz — upload_url must be on this origin. */
  apiOrigin: string;
}

const UPLOAD_VIEW_CSS = `
.drop { display: block; border: 2px dashed var(--vl-border); border-radius: var(--vl-radius); padding: 24px 16px; text-align: center; cursor: pointer; margin: 12px 0; background: var(--vl-bg-2); }
.drop.over { border-color: var(--vl-accent); }
.drop input { display: block; margin: 8px auto 0; max-width: 100%; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 8px 0; }
progress { width: 100%; height: 10px; }
#status { margin-top: 8px; white-space: pre-wrap; word-break: break-word; }
#status.error { color: var(--vl-danger); }
#status.ok { color: var(--vl-ok); }
select { font: inherit; padding: 4px; border-radius: 6px; border: 1px solid var(--vl-border); background: var(--vl-bg); color: var(--vl-fg); }
`;

const UPLOAD_VIEW_JS = `
(function () {
  'use strict';
  var PURPOSE_LABEL = { meeting: 'meeting recording (transcript + notes)', stt: 'transcription' };
  var AUDIO_EXT = /\\.(mp3|wav|m4a|aac|ogg|oga|opus|webm|flac|mp4)$/i;
  var DEFAULT_MAX_BYTES = 500 * 1024 * 1024;
  var UPLOAD_PATH = /^\\/v1\\/uploads\\/upl_[A-Za-z0-9]{20,40}\\/content$/;
  var UPLOAD_ID = /^upl_[A-Za-z0-9]{20,40}$/;

  var state = {
    args: {},
    purpose: 'meeting',
    session: null,       // { id, purpose, url, token, maxBytes, expiresAt, used }
    fallbackUrl: null,   // browser_upload_url from structuredContent (if the server has one)
    busy: false,
    xhr: null
  };

  function el(id) { return document.getElementById(id); }
  function setText(id, text) { el(id).textContent = text; }
  function show(id, visible) { el(id).classList.toggle('hidden', !visible); }
  function setStatus(text, kind) {
    var s = el('status');
    s.textContent = text || '';
    s.className = kind || '';
  }
  function formatBytes(n) {
    if (!(n >= 0)) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }
  function cleanName(name) {
    return String(name || 'audio').replace(/[\\u0000-\\u001f\\u007f]/g, ' ').slice(0, 120);
  }

  function setArgs(args) {
    if (!args || typeof args !== 'object') return;
    state.args = args;
    if (args.purpose === 'meeting' || args.purpose === 'stt') state.purpose = args.purpose;
    if (typeof args.language === 'string' && args.language) {
      var sel = el('language');
      var exists = false;
      for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === args.language) exists = true;
      if (!exists) {
        var opt = document.createElement('option');
        opt.value = args.language;
        opt.textContent = args.language;
        sel.appendChild(opt);
      }
      sel.value = args.language;
    }
    renderPurpose();
  }

  function renderPurpose() {
    setText('purpose', 'Purpose: ' + (PURPOSE_LABEL[state.purpose] || state.purpose));
    show('language-row', state.purpose === 'stt');
  }

  function validUploadUrl(raw) {
    try {
      var u = new URL(raw);
      return u.protocol === 'https:' && u.origin === CONFIG.apiOrigin && UPLOAD_PATH.test(u.pathname) && !u.username && !u.password;
    } catch (e) { return false; }
  }

  function readSession(result) {
    if (!result || typeof result !== 'object') return null;
    var sc = result.structuredContent || {};
    var meta = (result._meta && result._meta['voicelab/upload']) || null;
    if (typeof sc.browser_upload_url === 'string' && sc.browser_upload_url.indexOf('https://') === 0) {
      state.fallbackUrl = sc.browser_upload_url;
    }
    if (!meta || typeof sc.upload_id !== 'string' || !UPLOAD_ID.test(sc.upload_id)) return null;
    if (typeof meta.upload_token !== 'string' || !meta.upload_token) return null;
    if (!validUploadUrl(meta.upload_url)) return null;
    return {
      id: sc.upload_id,
      purpose: sc.purpose === 'stt' ? 'stt' : 'meeting',
      url: meta.upload_url,
      token: meta.upload_token,
      maxBytes: typeof meta.max_bytes === 'number' && meta.max_bytes > 0 ? meta.max_bytes : DEFAULT_MAX_BYTES,
      expiresAt: Date.parse(meta.expires_at || sc.expires_at || '') || 0,
      used: false
    };
  }

  function onToolResult(result) {
    if (result && result.isError) {
      setStatus(errorText(result) || 'VoiceLab could not prepare the upload.', 'error');
      return;
    }
    var s = readSession(result);
    if (s) {
      state.session = s;
      if (!state.args.purpose) { state.purpose = s.purpose; renderPurpose(); }
      setText('limit', 'Max size ' + formatBytes(s.maxBytes) + '. MP3, WAV, M4A, AAC, OGG, Opus, WebM or FLAC.');
    }
  }

  function sessionUsable(file) {
    var s = state.session;
    if (!s || s.used || s.purpose !== state.purpose) return false;
    if (s.expiresAt && s.expiresAt - Date.now() < 60000) return false;
    return !file || file.size <= s.maxBytes;
  }

  function errorText(result) {
    try {
      var text = result && result.content && result.content[0] && result.content[0].text;
      if (!text) return '';
      try {
        var parsed = JSON.parse(text);
        return String(parsed.message || parsed.error || text).slice(0, 300);
      } catch (e) { return String(text).slice(0, 300); }
    } catch (e) { return ''; }
  }

  function callTool(name, args, timeoutMs) {
    return Bridge.request('tools/call', { name: name, arguments: args }, timeoutMs || 60000).then(function (result) {
      if (result && result.isError) {
        var err = new Error(errorText(result) || (name + ' failed'));
        err.toolResult = result;
        throw err;
      }
      return result || {};
    });
  }

  function ensureSession(file) {
    if (sessionUsable(file)) return Promise.resolve(state.session);
    setStatus('Preparing upload…');
    return callTool('create_upload_session', {
      purpose: state.purpose,
      filename: cleanName(file.name),
      content_type: file.type || undefined,
      size_bytes: file.size
    }).then(function (result) {
      var s = readSession(result);
      if (!s) throw new Error('VoiceLab did not return a usable upload session.');
      state.session = s;
      return s;
    });
  }

  function put(session, file) {
    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      state.xhr = xhr;
      xhr.open('PUT', session.url, true);
      xhr.setRequestHeader('X-Upload-Token', session.token);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
          el('progress').value = Math.round((e.loaded / e.total) * 100);
          setText('progress-label', formatBytes(e.loaded) + ' / ' + formatBytes(e.total));
        }
      };
      xhr.onload = function () {
        var code = '';
        try { var body = JSON.parse(xhr.responseText || '{}'); code = (body.error && body.error.code) || ''; } catch (e) {}
        resolve({ status: xhr.status, code: code });
      };
      xhr.onerror = function () { resolve({ status: 0, code: 'network_error' }); };
      xhr.onabort = function () { resolve({ status: 0, code: 'aborted' }); };
      xhr.send(file);
    }).then(function (r) { state.xhr = null; return r; });
  }

  var RETRYABLE = { invalid_upload_token: 1, upload_already_used: 1, upload_expired: 1 };

  function uploadMessage(r, session) {
    switch (r.code) {
      case 'audio_too_large': return 'The file is larger than the allowed limit (' + formatBytes(session.maxBytes) + ').';
      case 'unsupported_audio_format': return 'Unsupported format. Use MP3, WAV, M4A, AAC, OGG, Opus, WebM or FLAC.';
      case 'invalid_audio': return 'The file could not be read as audio. Try exporting it again or choose another file.';
      case 'upload_expired': return 'The upload link expired. Please choose the file again.';
      case 'upload_already_used':
      case 'invalid_upload_token': return 'The upload link is no longer valid. Please choose the file again.';
      case 'aborted': return 'Upload cancelled.';
    }
    if (r.status === 0) return 'The upload could not reach VoiceLab from this window (the host may block direct uploads).';
    return 'Upload failed (HTTP ' + r.status + ').';
  }

  function validateFile(file) {
    if (!file) return 'No file selected.';
    if (file.size === 0) return 'The file is empty.';
    var typeOk = /^audio\\//.test(file.type) || file.type === 'video/webm' || file.type === 'video/mp4' || AUDIO_EXT.test(file.name || '');
    if (!typeOk) return 'This does not look like an audio file. Use MP3, WAV, M4A, AAC, OGG, Opus, WebM or FLAC.';
    var max = state.session ? state.session.maxBytes : DEFAULT_MAX_BYTES;
    if (file.size > max) return 'The file is ' + formatBytes(file.size) + '; the limit is ' + formatBytes(max) + '.';
    return '';
  }

  function submitArgs(uploadId) {
    var a = state.args || {};
    if (state.purpose === 'stt') {
      var out = { upload_id: uploadId, language: el('language').value };
      if (typeof a.include_speakers === 'boolean') out.include_speakers = a.include_speakers;
      return { tool: 'speech_to_text', args: out };
    }
    var m = { upload_id: uploadId };
    if (typeof a.title === 'string' && a.title) m.title = a.title;
    if (typeof a.language === 'string' && a.language) m.language = a.language;
    return { tool: 'create_meeting', args: m };
  }

  function describeSubmission(tool, result, filename) {
    var data = {};
    try { data = JSON.parse(result.content[0].text); } catch (e) {}
    if (tool === 'create_meeting') {
      var id = data.meeting && data.meeting.id;
      return 'I uploaded "' + filename + '" to VoiceLab Meeting AI' + (id ? ' (meeting_id ' + id + ')' : '') +
        '. Please poll get_meeting until it is ready, then summarize the transcript, decisions and action items.';
    }
    var tid = data.id;
    return 'I uploaded "' + filename + '" to VoiceLab speech-to-text' + (tid ? ' (transcription_id ' + tid + ')' : '') +
      '. Please poll get_transcription until it is completed and show me the transcript.';
  }

  function tellModel(text) {
    return Bridge.request('ui/message', { role: 'user', content: { type: 'text', text: text } }, 15000)
      .catch(function () {
        return Bridge.request('ui/update-model-context', { content: [{ type: 'text', text: text }] }, 15000);
      });
  }

  function offerFallback() {
    if (state.fallbackUrl) {
      show('open-page', true);
    } else {
      setStatus(el('status').textContent + '\\nAsk the assistant to use a public HTTPS link to the recording instead (audio_url).', 'error');
    }
  }

  function attemptUpload(file, attempt) {
    return ensureSession(file).then(function (session) {
      setStatus(attempt ? 'Retrying upload…' : 'Uploading…');
      show('progress-wrap', true);
      el('progress').value = 0;
      return put(session, file).then(function (r) {
        session.used = true; // a token is never reused after any attempt
        if (r.status >= 200 && r.status < 300) return session;
        if (RETRYABLE[r.code] && !attempt) return attemptUpload(file, 1);
        var err = new Error(uploadMessage(r, session));
        err.network = r.status === 0 && r.code === 'network_error';
        throw err;
      });
    });
  }

  function handleFile(file) {
    if (state.busy) return;
    var problem = validateFile(file);
    if (problem) { setStatus(problem, 'error'); return; }
    state.busy = true;
    el('file').disabled = true;
    show('open-page', false);
    show('again', false);
    var filename = cleanName(file.name);
    setText('file-info', filename + ' · ' + formatBytes(file.size));

    attemptUpload(file, 0).then(function (session) {
      setStatus('Uploaded. Starting VoiceLab processing…');
      var sub = submitArgs(session.id);
      return callTool(sub.tool, sub.args, 120000).then(function (result) {
        var text = describeSubmission(sub.tool, result, filename);
        setStatus('Done — VoiceLab is processing "' + filename + '".', 'ok');
        show('again', true);
        return tellModel(text).catch(function () {
          setStatus('Done — VoiceLab is processing "' + filename + '". Tell the assistant: ' + text, 'ok');
        });
      });
    }).catch(function (err) {
      setStatus((err && err.message) || 'Something went wrong.', 'error');
      if (err && err.network) offerFallback();
      show('again', true);
    }).then(function () {
      state.busy = false;
      el('file').disabled = false;
      el('file').value = '';
    });
  }

  function openFallbackPage() {
    // Mint a fresh single-use session so the link carries an unused token.
    callTool('create_upload_session', { purpose: state.purpose }).then(function (result) {
      var s = readSession(result);
      if (s) state.session = s;
      if (!state.fallbackUrl) throw new Error('No browser upload page is configured.');
      return Bridge.request('ui/open-link', { url: state.fallbackUrl }, 15000);
    }).catch(function (err) {
      setStatus((err && err.message) || 'Could not open the upload page.', 'error');
    });
  }

  function abortUpload() {
    if (state.xhr) { try { state.xhr.abort(); } catch (e) {} }
  }

  // ---- wiring ----
  var drop = el('drop');
  el('file').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) handleFile(f);
  });
  ['dragenter', 'dragover'].forEach(function (t) {
    drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); });
  });
  drop.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  el('again').addEventListener('click', function () { setStatus(''); show('again', false); show('progress-wrap', false); el('file').click(); });
  el('open-page').addEventListener('click', openFallbackPage);

  Bridge.on('ui/notifications/tool-input', function (p) { setArgs(p.arguments); });
  Bridge.on('ui/notifications/tool-result', onToolResult);
  Bridge.on('ui/notifications/tool-cancelled', function () { setStatus('The request was cancelled.', 'error'); });
  Bridge.on('ui/notifications/host-context-changed', Bridge.applyHostContext);
  Bridge.on('ui/resource-teardown', abortUpload);

  // ChatGPT compatibility: window.openai exposes toolInput / toolOutput / toolResponseMetadata.
  function readOpenAiGlobals() {
    var oa = window.openai;
    if (!oa) return;
    if (oa.toolInput) setArgs(oa.toolInput);
    if (oa.toolOutput && oa.toolResponseMetadata && !state.session) {
      onToolResult({ structuredContent: oa.toolOutput, _meta: oa.toolResponseMetadata });
    }
  }
  window.addEventListener('openai:set_globals', readOpenAiGlobals);

  renderPurpose();
  Bridge.initialize({ name: 'voicelab-upload', version: CONFIG.version })
    .then(function (res) { Bridge.applyHostContext(res.hostContext); })
    .catch(function () { /* host may be ChatGPT-only; window.openai path below */ })
    .then(function () { readOpenAiGlobals(); Bridge.autoResize(); });
})();
`;

export function renderUploadViewHtml(options: UploadViewOptions): string {
  const config = { apiOrigin: options.apiOrigin, version: VERSION };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Upload audio to VoiceLab</title>
<style>${BASE_CSS}${UPLOAD_VIEW_CSS}</style>
</head>
<body>
<main>
  <h1>Upload audio to VoiceLab</h1>
  <p class="muted" id="purpose"></p>
  <label class="drop" id="drop">
    <strong>Choose an audio file</strong> or drop it here
    <input type="file" id="file" accept="audio/*,video/webm,video/mp4,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.webm,.flac">
  </label>
  <p class="muted" id="limit">Up to 500 MB. MP3, WAV, M4A, AAC, OGG, Opus, WebM or FLAC.</p>
  <div class="row hidden" id="language-row">
    <label for="language">Language</label>
    <select id="language">
      <option value="uz">Uzbek (uz)</option>
      <option value="ru">Russian (ru)</option>
      <option value="en">English (en)</option>
    </select>
  </div>
  <p id="file-info" class="muted"></p>
  <div id="progress-wrap" class="hidden">
    <progress id="progress" max="100" value="0"></progress>
    <span class="muted" id="progress-label"></span>
  </div>
  <div id="status" role="status" aria-live="polite"></div>
  <div class="row">
    <button type="button" id="again" class="hidden">Upload another file</button>
    <button type="button" id="open-page" class="primary hidden">Open upload page in browser</button>
  </div>
  <p class="muted">The file goes directly to VoiceLab over HTTPS; it is not sent to the chat.</p>
</main>
<script>var CONFIG = ${jsonForScript(config)};</script>
<script>${BRIDGE_JS}</script>
<script>${UPLOAD_VIEW_JS}</script>
</body>
</html>`;
}
