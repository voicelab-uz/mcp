import { VERSION } from '../version.js';
import { BASE_CSS, BRIDGE_JS, jsonForScript } from './bridge.js';

/**
 * MCP Apps view for ui://voicelab/audio — inline player for text_to_speech results.
 *
 * Lifecycle:
 *  1. ui/initialize handshake; host sends tool-input (text/language/voice_id/speed) and
 *     tool-result (structuredContent metadata + _meta["voicelab/audio"].audio_base64).
 *     ChatGPT also exposes the same data on window.openai.
 *  2. If the host did not deliver the audio bytes with the result, pressing Play re-calls
 *     text_to_speech with the same idempotency key (the API replays the stored WAV).
 *  3. Playback uses the Web Audio API on decoded bytes, so it needs no media/connect CSP
 *     allowance and no network access from the view.
 *
 * The view never logs, never uses innerHTML, and never talks to any origin directly.
 */

const AUDIO_VIEW_CSS = `
.player { display: flex; align-items: center; gap: 12px; }
#play { flex: 0 0 auto; width: 40px; height: 40px; padding: 0; border-radius: 50%; font-size: 15px; line-height: 1; }
.track { flex: 1 1 auto; min-width: 0; }
#seek { display: block; width: 100%; margin: 0; accent-color: var(--vl-accent); }
.times { display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; }
#status { margin-top: 8px; word-break: break-word; }
#status.error { color: var(--vl-danger); }
`;

const AUDIO_VIEW_JS = `
(function () {
  'use strict';
  var META_KEY = 'voicelab/audio';
  var GLYPH_PLAY = '\\u25B6';
  var GLYPH_PAUSE = '\\u275A\\u275A';

  var state = {
    args: null,        // text_to_speech arguments (tool-input)
    info: {},          // structuredContent of the result
    bytes: null,       // Uint8Array WAV
    buffer: null,      // decoded AudioBuffer
    ctx: null,
    source: null,
    playing: false,
    busy: false,
    offset: 0,         // seconds
    startedAt: 0,
    duration: 0,       // seconds
    raf: 0,
    bridgeOk: false,
    failed: false
  };

  function el(id) { return document.getElementById(id); }
  function setStatus(text, kind) {
    var s = el('status');
    s.textContent = text || '';
    s.className = kind || 'muted';
  }
  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function decodeBase64(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function audioIn(result) {
    if (!result || typeof result !== 'object') return null;
    var meta = result._meta && result._meta[META_KEY];
    if (meta && typeof meta.audio_base64 === 'string' && meta.audio_base64) return meta.audio_base64;
    var direct = result[META_KEY];
    if (direct && typeof direct.audio_base64 === 'string' && direct.audio_base64) return direct.audio_base64;
    var sc = result.structuredContent;
    if (sc && typeof sc.audio_base64 === 'string' && sc.audio_base64) return sc.audio_base64;
    try {
      var parsed = JSON.parse(result.content[0].text);
      if (parsed && typeof parsed.audio_base64 === 'string' && parsed.audio_base64) return parsed.audio_base64;
    } catch (e) {}
    return null;
  }

  // Hosts wrap the MCP result differently (ChatGPT's toolResponseMetadata nests the full
  // result envelope), so look in the result itself and in the known wrappers.
  function audioFrom(result) {
    if (!result || typeof result !== 'object') return null;
    var candidates = [result, result._meta, result.mcp_tool_result, result.call_tool_result, result.result];
    if (result._meta && typeof result._meta === 'object') {
      candidates.push(result._meta.mcp_tool_result, result._meta.call_tool_result);
    }
    for (var i = 0; i < candidates.length; i++) {
      var found = audioIn(candidates[i]);
      if (found) return found;
    }
    return null;
  }

  function errorText(result) {
    try {
      var text = result.content[0].text;
      try {
        var parsed = JSON.parse(text);
        return String(parsed.message || parsed.error || text).slice(0, 300);
      } catch (e) { return String(text).slice(0, 300); }
    } catch (e) { return ''; }
  }

  function canRefetch() {
    var a = state.args;
    return !!(a && typeof a.text === 'string' && a.text && typeof a.voice_id === 'string' &&
      typeof state.info.idempotency_key === 'string' && state.info.idempotency_key);
  }

  function render() {
    var ready = !state.failed && (!!state.bytes || canRefetch());
    el('play').disabled = !ready || state.busy;
    el('play').textContent = state.playing ? GLYPH_PAUSE : GLYPH_PLAY;
    el('play').setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    el('seek').disabled = !ready || !state.duration;
    var now = current();
    el('seek').value = state.duration ? String(Math.round((now / state.duration) * 1000)) : '0';
    el('now').textContent = fmt(now);
    el('total').textContent = state.duration ? fmt(state.duration) : '--:--';
  }

  function current() {
    if (state.playing && state.ctx) return Math.min(state.duration, state.ctx.currentTime - state.startedAt);
    return state.offset;
  }

  function tick() {
    render();
    if (state.playing) state.raf = requestAnimationFrame(tick);
  }

  function setArgs(args) {
    if (args && typeof args === 'object') { state.args = args; render(); }
  }

  function setBytes(b64) {
    try {
      state.bytes = decodeBase64(b64);
      state.buffer = null;
      return true;
    } catch (e) { return false; }
  }

  function onToolResult(result) {
    if (!result || typeof result !== 'object') return;
    if (result.isError) {
      state.failed = true;
      setStatus(errorText(result) || 'VoiceLab could not generate the audio.', 'error');
      render();
      return;
    }
    state.failed = false;
    var sc = result.structuredContent;
    if (sc && typeof sc === 'object') state.info = sc;
    if (typeof state.info.duration_ms === 'number' && state.info.duration_ms > 0 && !state.buffer) {
      state.duration = state.info.duration_ms / 1000;
    }
    var b64 = audioFrom(result);
    if (b64) setBytes(b64);
    var parts = [];
    if (typeof state.info.language === 'string' && state.info.language) parts.push(state.info.language);
    if (typeof state.info.sample_rate === 'number') parts.push((state.info.sample_rate / 1000) + ' kHz WAV');
    el('detail').textContent = parts.join(' \\u00B7 ');
    if (state.bytes || canRefetch()) setStatus('');
    else setStatus('The audio is not available in this view. Ask the assistant to generate it again.', 'error');
    render();
  }

  function callTool(name, args) {
    var oa = window.openai;
    if (!state.bridgeOk && oa && typeof oa.callTool === 'function') return Promise.resolve(oa.callTool(name, args));
    return Bridge.request('tools/call', { name: name, arguments: args }, 120000);
  }

  // The API replays the stored WAV for the same idempotency key + body: no new generation.
  // Resend the original arguments unchanged (same keys, same order) so the body matches.
  function refetch() {
    var a = state.args;
    var args = {};
    Object.keys(a).forEach(function (k) { args[k] = a[k]; });
    args.idempotency_key = state.info.idempotency_key;
    args.include_audio_base64 = true;
    return callTool('text_to_speech', args).then(function (result) {
      if (!result || result.isError) throw new Error(errorText(result) || 'VoiceLab could not load the audio.');
      var b64 = audioFrom(result);
      if (!b64 || !setBytes(b64)) throw new Error('VoiceLab did not return the audio.');
    });
  }

  /** 16-bit PCM WAV -> AudioBuffer without relying on the host's media decoders. */
  function parsePcm16(bytes, ctx) {
    if (bytes.length < 44) return null;
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) return null;
    var pos = 12, fmtInfo = null, dataStart = -1, dataLen = 0;
    while (pos + 8 <= bytes.length) {
      var id = view.getUint32(pos, false);
      var size = view.getUint32(pos + 4, true);
      var body = pos + 8;
      if (id === 0x666d7420 && body + 16 <= bytes.length) {
        fmtInfo = {
          format: view.getUint16(body, true),
          channels: view.getUint16(body + 2, true),
          sampleRate: view.getUint32(body + 4, true),
          bits: view.getUint16(body + 14, true)
        };
      } else if (id === 0x64617461) {
        dataStart = body;
        dataLen = size;
        break;
      }
      pos = body + size + (size % 2);
    }
    if (!fmtInfo || dataStart < 0) return null;
    if (fmtInfo.format !== 1 || fmtInfo.bits !== 16 || fmtInfo.channels < 1 || fmtInfo.channels > 2) return null;
    if (!(fmtInfo.sampleRate >= 8000 && fmtInfo.sampleRate <= 96000)) return null;
    var avail = bytes.length - dataStart;
    if (dataLen === 0 || dataLen > avail) dataLen = avail; // streamed WAVs carry a placeholder size
    var frames = Math.floor(dataLen / (2 * fmtInfo.channels));
    if (frames < 1) return null;
    var buffer = ctx.createBuffer(fmtInfo.channels, frames, fmtInfo.sampleRate);
    for (var c = 0; c < fmtInfo.channels; c++) {
      var out = buffer.getChannelData(c);
      var p = dataStart + c * 2;
      var step = fmtInfo.channels * 2;
      for (var i = 0; i < frames; i++, p += step) out[i] = view.getInt16(p, true) / 32768;
    }
    return buffer;
  }

  function ensureBuffer() {
    if (state.buffer) return Promise.resolve(state.buffer);
    var parsed = null;
    try { parsed = parsePcm16(state.bytes, state.ctx); } catch (e) { parsed = null; }
    var ready = parsed ? Promise.resolve(parsed) : new Promise(function (resolve, reject) {
      var copy = state.bytes.buffer.slice(state.bytes.byteOffset, state.bytes.byteOffset + state.bytes.byteLength);
      state.ctx.decodeAudioData(copy, resolve, reject);
    });
    return ready.then(function (buffer) {
      state.buffer = buffer;
      state.duration = buffer.duration;
      if (state.offset >= state.duration) state.offset = 0;
      return buffer;
    });
  }

  function stopSource() {
    var src = state.source;
    state.source = null;
    if (src) { try { src.onended = null; src.stop(); } catch (e) {} }
  }

  function startAt(offset) {
    stopSource();
    var src = state.ctx.createBufferSource();
    src.buffer = state.buffer;
    src.connect(state.ctx.destination);
    src.onended = function () {
      if (state.source !== src) return;
      state.source = null;
      state.playing = false;
      state.offset = 0;
      render();
    };
    state.source = src;
    state.startedAt = state.ctx.currentTime - offset;
    state.playing = true;
    src.start(0, offset);
    cancelAnimationFrame(state.raf);
    tick();
  }

  function pause() {
    state.offset = current();
    state.playing = false;
    stopSource();
    render();
  }

  function play() {
    if (state.busy) return;
    if (state.playing) { pause(); return; }
    // Create/resume the context synchronously inside the user gesture.
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) { setStatus('This window cannot play audio.', 'error'); return; }
    try {
      // iOS: route Web Audio as media playback so the ringer/silent switch does not mute it.
      if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch (e) {} }
      if (!state.ctx) state.ctx = new Ctor();
      if (state.ctx.state === 'suspended') state.ctx.resume();
    } catch (e) { setStatus('This window cannot play audio.', 'error'); return; }

    if (!state.bytes) readOpenAiGlobals(); // the host may have delivered the audio late
    state.busy = true;
    setStatus(state.bytes ? '' : 'Loading audio\\u2026');
    render();
    (state.bytes ? Promise.resolve() : refetch())
      .then(ensureBuffer)
      .then(function () {
        setStatus('');
        state.busy = false;
        startAt(state.offset);
      })
      .catch(function (err) {
        state.busy = false;
        setStatus((err && err.message) || 'The audio could not be played.', 'error');
        render();
      });
  }

  function seek() {
    if (!state.duration) return;
    var target = (Number(el('seek').value) / 1000) * state.duration;
    target = Math.max(0, Math.min(state.duration - 0.01, target));
    if (state.playing && state.buffer) startAt(target);
    else { state.offset = target; render(); }
  }

  function teardown() {
    cancelAnimationFrame(state.raf);
    state.playing = false;
    stopSource();
    if (state.ctx) { try { state.ctx.close(); } catch (e) {} state.ctx = null; }
  }

  // ---- wiring ----
  el('play').addEventListener('click', play);
  el('seek').addEventListener('input', seek);

  Bridge.on('ui/notifications/tool-input', function (p) { setArgs(p.arguments); });
  Bridge.on('ui/notifications/tool-result', onToolResult);
  Bridge.on('ui/notifications/tool-cancelled', function () {
    state.failed = true;
    setStatus('The request was cancelled.', 'error');
    render();
  });
  Bridge.on('ui/notifications/host-context-changed', Bridge.applyHostContext);
  Bridge.on('ui/resource-teardown', teardown);

  // ChatGPT compatibility: window.openai exposes toolInput / toolOutput / toolResponseMetadata.
  function readOpenAiGlobals() {
    var oa = window.openai;
    if (!oa) return;
    if (oa.toolInput) setArgs(oa.toolInput);
    if (oa.toolOutput && !state.bytes) {
      onToolResult({ structuredContent: oa.toolOutput, _meta: oa.toolResponseMetadata || {} });
    }
  }
  window.addEventListener('openai:set_globals', readOpenAiGlobals);

  setStatus('Preparing audio\\u2026');
  render();
  readOpenAiGlobals();
  // Size the frame right away; the bridge handshake can take seconds or never answer.
  Bridge.reportOpenAiHeight();
  Bridge.initialize({ name: 'voicelab-audio', version: CONFIG.version })
    .then(function (res) { state.bridgeOk = true; Bridge.applyHostContext(res.hostContext); })
    .catch(function () { /* host may be ChatGPT-only; window.openai path */ })
    .then(function () { readOpenAiGlobals(); Bridge.autoResize(); });
})();
`;

export function renderAudioViewHtml(): string {
  const config = { version: VERSION };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VoiceLab audio</title>
<style>${BASE_CSS}${AUDIO_VIEW_CSS}</style>
</head>
<body>
<main>
  <h1>VoiceLab audio</h1>
  <p class="muted" id="detail"></p>
  <div class="player">
    <button type="button" id="play" class="primary" aria-label="Play" disabled></button>
    <div class="track">
      <input type="range" id="seek" min="0" max="1000" step="1" value="0" aria-label="Seek" disabled>
      <div class="times muted"><span id="now">0:00</span><span id="total">--:--</span></div>
    </div>
  </div>
  <div id="status" class="muted" role="status" aria-live="polite"></div>
</main>
<script>var CONFIG = ${jsonForScript(config)};</script>
<script>${BRIDGE_JS}</script>
<script>${AUDIO_VIEW_JS}</script>
</body>
</html>`;
}
