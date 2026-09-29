# VoiceLab official connectors — launch plan

**Goal:** One hosted VoiceLab MCP → official listings for **Grok**, **Muse**, **ChatGPT Dots (OpenAI Plugins)**, **Cursor**, and other agents.

**Shared prerequisite (blocks every catalog):**  
Public HTTPS MCP, streamable HTTP, e.g. `https://mcp.voicelab.uz/mcp`  
Auth: developer API key `vlk_...` and/or OAuth 2.1 where required.  
Docs: https://docs.voicelab.uz · Privacy + ToS · square icons ≥48px · support URL · verified publisher org.

---

## 1. Host the MCP (blocker)

- Tools per `TOOL_SPEC.md` (TTS/STT first → LLM + Voice Isolator).
- Streamable HTTP at stable `/mcp`.
- Server `instructions` for TTS→voices→generate and STT upload→poll flows.
- Tool annotations: `readOnlyHint` / `destructiveHint` / `openWorldHint`.
- Test with MCP Inspector + ChatGPT developer mode + Cursor before any submission.

---

## 2. ChatGPT Dots (OpenAI Plugins Directory)

**What “Dots” means here:** ChatGPT / Codex universal Plugins Directory (OpenAI).

**Docs:** https://developers.openai.com/plugins/deploy/submission  
**Dev test:** ChatGPT → Developer mode → Plugins → add MCP URL  
**Public:** Upload plugin ZIP → connect MCP → domain verify → review → publish

| Requirement | Detail |
|-------------|--------|
| Endpoint | Public HTTPS only (no Secure MCP Tunnel / ngrok for public) |
| Domain verify | `https://<host>/.well-known/openai-apps-challenge` with exact token |
| Package | Agent Plugins `plugin.json` + `mcp.json` (streamable-http URL) + skills + icons |
| Listing | displayName ≤30, shortDescription ≤30, longDescription, category, privacy/ToS/support/website HTTPS |
| Review | 5 positive + 3 negative test cases, demo video URL, reviewer test account (no MFA) |
| Updates | Hosted tool changes: daily auto-scan / Rescan; package metadata: new ZIP |

---

## 3. Grok (xAI)

| Layer | Path |
|-------|------|
| Immediate | Custom: grok.com/connectors → Custom → MCP URL |
| Official catalog | Plugin under **VoiceLab GitHub org** + PR to [xai-org/plugin-marketplace](https://github.com/xai-org/plugin-marketplace) |

Marketplace: SHA-pin remote source, regenerate `plugin-index.json`, brand keywords (`voicelab`, `aisha`), domains `voicelab.uz` / `docs.voicelab.uz`.  
CLI: `grok mcp add --transport http voicelab https://mcp.voicelab.uz/mcp`

---

## 4. Muse

**Path:** muse.ai/platform → Submit a connector → Connection type **Existing MCP**  
Hosted endpoint + docs + API key auth + 512×512 icon + example prompts + privacy/ToS/support.

---

## 5. Cursor Marketplace

**Path:** https://cursor.com/marketplace/publish  

Public repo: `.cursor-plugin/plugin.json` + `mcp.json` with `${VOICELAB_API_KEY}` variable, skills for TTS/STT, open source, local test under `~/.cursor/plugins/local`.

---

## 6. Listing copy (draft)

**Display name:** VoiceLab  
**Short:** Speech AI for agents  
**Long:** Connect agents to VoiceLab: text-to-speech, speech-to-text with timing, voice isolation, and LLM completions. Uzbek, Russian, and English. Authenticate with a `vlk_` developer API key from voicelab.uz.  
**Prompts:**
1. Generate Uzbek TTS for this script with a natural voice  
2. Transcribe this meeting WAV with speaker labels  
3. Remove background noise from this call recording  

**Keywords/domains:** voicelab, aisha, voicelab.uz, docs.voicelab.uz  

---

## 7. Order

1. Ship MCP (TTS+STT min)  
2. **ChatGPT Dots** (ZIP + domain verify + review pack)  
3. **Cursor** marketplace plugin  
4. **Grok** custom docs + marketplace PR  
5. **Muse** connector submission  
6. Update https://docs.voicelab.uz/libraries/for-agents with per-platform install

---

## Blockers (VoiceLab)

- [ ] MCP hostname (`mcp.voicelab.uz`?)
- [ ] GitHub org for open plugin repo
- [ ] Privacy / ToS / support / website URLs
- [ ] Icons (light/dark) + screenshots
- [ ] OAuth vs API-key-only for ChatGPT review
- [ ] OpenAI / Muse / Cursor / xAI submission accounts
- [ ] Reviewer test `vlk_` key + demo video
