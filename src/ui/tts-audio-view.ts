import { VERSION } from '../version.js';
import { BASE_CSS, BRIDGE_JS, jsonForScript } from './bridge.js';

/** Inline player for get_tts_generation. Signed URLs stay in memory only. */
export const TTS_AUDIO_ORIGIN = 'https://cdn.aisha.group';
const PLAYER_CSS = `
audio { display: block; width: 100%; margin: 12px 0; }
#status { min-height: 20px; }
#status.error { color: var(--vl-danger); }
.actions { display: flex; gap: 8px; align-items: center; }
`;

const PLAYER_JS = `
(function () {
  'use strict';
  var GENERATION_ID = /^gen_[A-Za-z0-9_-]{1,120}$/;
  var state = { generationId: null, expiresAt: 0, refreshing: false, refreshedAfterError: false };
  var audio = document.getElementById('audio');
  var status = document.getElementById('status');
  var refreshButton = document.getElementById('refresh');

  function setStatus(message, error) {
    status.textContent = message;
    status.className = error ? 'error' : 'muted';
  }

  function validAudioUrl(raw) {
    if (typeof raw !== 'string' || raw !== raw.trim() || raw.length > 4096) return false;
    try {
      var url = new URL(raw);
      return url.protocol === 'https:' && url.origin === CONFIG.audioOrigin &&
        !url.username && !url.password && !url.hash;
    } catch (e) { return false; }
  }

  function detailFrom(result) {
    if (!result || typeof result !== 'object' || result.isError) return null;
    var detail = result.structuredContent;
    if (!detail && result.content && result.content[0] && result.content[0].type === 'text') {
      try { detail = JSON.parse(result.content[0].text); } catch (e) { return null; }
    }
    if (!detail || typeof detail !== 'object' || !GENERATION_ID.test(detail.id)) return null;
    if (state.generationId && state.generationId !== detail.id) return null;
    return detail;
  }

  function applyResult(result) {
    var detail = detailFrom(result);
    if (!detail) { setStatus('Audio details could not be read.', true); return; }
    state.generationId = detail.id;
    refreshButton.hidden = false;
    if (detail.audio_available !== true) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      setStatus('This generation has no audio available.', true);
      return;
    }
    var expiresAt = typeof detail.audio_url_expires_at === 'string' ? Date.parse(detail.audio_url_expires_at) : NaN;
    if (!validAudioUrl(detail.audio_url) || !Number.isFinite(expiresAt)) {
      setStatus('The audio link is invalid.', true);
      return;
    }
    if (expiresAt <= Date.now() + 15000) {
      refreshAudio();
      return;
    }
    state.expiresAt = expiresAt;
    // Use the backend's signed URL verbatim; never reconstruct its path or query.
    audio.setAttribute('src', detail.audio_url);
    audio.load();
    setStatus('Audio ready.', false);
  }

  function refreshAudio() {
    if (state.refreshing || !state.generationId) return;
    state.refreshing = true;
    refreshButton.disabled = true;
    setStatus('Renewing audio link…', false);
    Bridge.request('tools/call', {
      name: 'get_tts_generation', arguments: { generation_id: state.generationId }
    }, 30000).then(function (result) {
      if (result && result.isError) throw new Error('refresh_failed');
      applyResult(result);
    }).catch(function () {
      setStatus('Could not renew the audio link. Try again.', true);
    }).then(function () {
      state.refreshing = false;
      refreshButton.disabled = false;
    });
  }

  function readOpenAiGlobals() {
    var oa = window.openai;
    if (!oa) return;
    if (oa.toolInput && GENERATION_ID.test(oa.toolInput.generation_id)) {
      state.generationId = oa.toolInput.generation_id;
    }
    if (oa.toolOutput) applyResult({ structuredContent: oa.toolOutput });
  }

  Bridge.on('ui/notifications/tool-input', function (params) {
    var id = params && params.arguments && params.arguments.generation_id;
    if (GENERATION_ID.test(id)) state.generationId = id;
  });
  Bridge.on('ui/notifications/tool-result', applyResult);
  Bridge.on('ui/notifications/host-context-changed', Bridge.applyHostContext);
  Bridge.on('ui/notifications/tool-cancelled', function () { setStatus('Audio request cancelled.', true); });
  Bridge.on('ui/resource-teardown', function () { audio.pause(); audio.removeAttribute('src'); });
  window.addEventListener('openai:set_globals', readOpenAiGlobals);
  refreshButton.addEventListener('click', function () { state.refreshedAfterError = false; refreshAudio(); });
  audio.addEventListener('error', function () {
    if (state.refreshedAfterError) { setStatus('Playback failed. Try refreshing the audio link.', true); return; }
    state.refreshedAfterError = true;
    refreshAudio();
  });
  audio.addEventListener('play', function () {
    if (state.expiresAt && state.expiresAt <= Date.now() + 15000) refreshAudio();
  });

  Bridge.initialize({ name: 'voicelab-tts-audio', version: CONFIG.version })
    .then(function (result) { Bridge.applyHostContext(result.hostContext); })
    .catch(function () { /* ChatGPT may use window.openai instead. */ })
    .then(function () { readOpenAiGlobals(); Bridge.autoResize(); });
})();
`;

export function renderTtsAudioViewHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VoiceLab audio</title>
<style>${BASE_CSS}${PLAYER_CSS}</style>
</head>
<body>
<main>
  <h1>VoiceLab audio</h1>
  <p id="status" class="muted" role="status" aria-live="polite">Loading audio…</p>
  <audio id="audio" controls preload="metadata"></audio>
  <div class="actions"><button id="refresh" type="button" hidden>Refresh audio link</button></div>
</main>
<script>var CONFIG = ${jsonForScript({ audioOrigin: TTS_AUDIO_ORIGIN, version: VERSION })};</script>
<script>${BRIDGE_JS}</script>
<script>${PLAYER_JS}</script>
</body>
</html>`;
}
