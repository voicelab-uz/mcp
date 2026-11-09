import { VERSION } from '../version.js';
import { BASE_CSS, BRIDGE_JS, jsonForScript } from './bridge.js';

/** Inline player for TTS creation and generation detail. Signed URLs stay in memory only. */
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
  var state = { generationId: null, expiresAt: 0, refreshing: false, refreshedAfterError: false,
    started: false, pollTimer: null, pollCount: 0, lastAppliedUrl: null };
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
    if (detail.status === 'queued' || detail.status === 'processing') {
      setStatus('Generating audio…', false);
      schedulePoll();
      return;
    }
    if (detail.status === 'failed') {
      setStatus('Audio generation failed.', true);
      return;
    }
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
    state.pollCount = 0;
    if (state.lastAppliedUrl === detail.audio_url) {
      if (state.refreshedAfterError) setStatus('Playback failed. Try refreshing the audio link.', true);
      else setStatus('Audio ready.', false);
      return;
    }
    // Use the backend's signed URL verbatim; never reconstruct its path or query.
    audio.setAttribute('src', detail.audio_url);
    state.lastAppliedUrl = detail.audio_url;
    audio.load();
    setStatus('Audio ready.', false);
  }

  function schedulePoll() {
    if (state.pollTimer) return;
    if (state.pollCount >= 60) {
      setStatus('Audio is still processing. Use Refresh audio link to check again.', false);
      return;
    }
    state.pollCount++;
    state.pollTimer = setTimeout(function () {
      state.pollTimer = null;
      refreshAudio();
    }, 3000);
  }

  function refreshAudio() {
    if (state.refreshing || !state.generationId) return;
    if (state.pollTimer) { clearTimeout(state.pollTimer); state.pollTimer = null; }
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

  function onToolResult(result) {
    var output = result && result.structuredContent;
    if (output && GENERATION_ID.test(output.generation_id)) {
      if (state.started && state.generationId === output.generation_id) return;
      state.generationId = output.generation_id;
      state.started = true;
      refreshButton.hidden = false;
      setStatus('Loading generated audio…', false);
      refreshAudio();
      return;
    }
    if (output && output.status === 'completed' && !output.id) {
      setStatus('Audio was generated, but its playback ID is unavailable.', true);
      return;
    }
    applyResult(result);
  }

  function readOpenAiGlobals() {
    var oa = window.openai;
    if (!oa) return;
    if (oa.toolInput && GENERATION_ID.test(oa.toolInput.generation_id)) {
      state.generationId = oa.toolInput.generation_id;
    }
    if (oa.toolOutput) onToolResult({ structuredContent: oa.toolOutput });
  }

  Bridge.on('ui/notifications/tool-input', function (params) {
    var id = params && params.arguments && params.arguments.generation_id;
    if (GENERATION_ID.test(id)) state.generationId = id;
  });
  Bridge.on('ui/notifications/tool-result', onToolResult);
  Bridge.on('ui/notifications/host-context-changed', Bridge.applyHostContext);
  Bridge.on('ui/notifications/tool-cancelled', function () { setStatus('Audio request cancelled.', true); });
  Bridge.on('ui/resource-teardown', function () {
    if (state.pollTimer) clearTimeout(state.pollTimer);
    audio.pause(); audio.removeAttribute('src');
  });
  window.addEventListener('openai:set_globals', readOpenAiGlobals);
  refreshButton.addEventListener('click', function () {
    state.refreshedAfterError = false; state.pollCount = 0; refreshAudio();
  });
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
