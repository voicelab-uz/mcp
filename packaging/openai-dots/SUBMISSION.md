# OpenAI Agent Plugins Submission Guide

Complete submission checklist and guide for VoiceLab MCP plugin.

## Pre-Submission Checklist

### Required (Blocking)

- [ ] **MCP Server Live**
  - URL: `https://mcp.voicelab.uz/mcp`
  - Test: `curl -X POST https://mcp.voicelab.uz/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`
  - Status: ✅ Deployed (verify before submission)

- [ ] **Real Logo Assets**
  - Replace `plugin/assets/PLACEHOLDER_NOTICE.txt` with:
    - `logo.png` (512x512px square PNG)
    - `icon.png` (256x256px square PNG)
  - Sources:
    - Fetch from https://mcp.voicelab.uz/logo.png (if hosted)
    - Extract from https://voicelab.uz
    - Request from elzodxon@gmail.com
  - Status: ⚠️ **PLACEHOLDER - MUST REPLACE**

- [ ] **Legal URLs Live**
  - Privacy: https://voicelab.uz/privacy
  - Terms: https://voicelab.uz/terms
  - Support: https://docs.voicelab.uz
  - Status: ✅ (verify all return 200)

- [ ] **Domain Control**
  - You can host files at `https://mcp.voicelab.uz/.well-known/`
  - Access to web server or nginx config
  - Status: ✅ (required for verification step)

### Recommended (Improves Approval)

- [ ] **Demo Video**
  - 1-2 minute walkthrough showing:
    - User asks to generate Uzbek speech → agent calls `list_voices`, `text_to_speech`
    - User uploads audio for transcription → agent calls `speech_to_text`, `get_transcription`
    - User requests noise removal → agent calls `isolate_voice`, `get_isolation`
  - Host publicly: YouTube (unlisted), Loom, or Vimeo
  - Add URL below after recording
  - Status: ⚠️ **TODO - Strongly recommended**
  - Demo URL: `_________________` (fill in after recording)

- [ ] **Test API Key for Reviewers**
  - Create restricted VoiceLab API key for OpenAI reviewers
  - Permissions: Read + limited TTS/STT/LLM quotas
  - No billing or account management access
  - Expires: 30 days after submission
  - Status: ⚠️ **TODO - Create before submission**
  - Reviewer key: `vlk_____________________` (fill in)

## Submission Steps

### Step 1: Build Plugin ZIP

```bash
cd packaging/openai-dots
chmod +x build-plugin.sh
./build-plugin.sh
```

Expected output:
```
Building VoiceLab OpenAI plugin package...
Verifying required files...
✓ plugin.json found
✓ mcp.json found
✓ skills/get-started/SKILL.md found
⚠ WARNING: plugin/assets/logo.png not found or is placeholder
⚠ WARNING: plugin/assets/icon.png not found or is placeholder
Creating voicelab-openai-plugin.zip...
✓ Package created: voicelab-openai-plugin.zip (XX KB)

Next steps:
1. Replace placeholder assets in plugin/assets/
2. Rebuild this ZIP
3. Submit at https://platform.openai.com/plugins
```

⚠️ **Do not submit** until asset warnings are resolved.

### Step 2: Upload to OpenAI Portal

1. Go to https://platform.openai.com/plugins
2. Sign in with OpenAI account (VoiceLab team account or authorized developer)
3. Click **"Upload Plugin ZIP"** or **"New Plugin"**
4. Choose `voicelab-openai-plugin.zip`
5. OpenAI extracts and validates:
   - `plugin.json` schema
   - `mcp.json` format
   - Required fields (name, description, legal URLs, test cases)
   - Assets existence (logo.png, icon.png)

### Step 3: Connect MCP Server

1. OpenAI displays: **"Connect MCP Server"**
2. Shows extracted MCP URL: `https://mcp.voicelab.uz/mcp`
3. Click **"Test Connection"**
4. OpenAI sends `initialize` and `tools/list` requests
5. Verify tools appear correctly:
   - `list_models`, `chat_completions`, `get_llm_request`
   - `list_tts_languages`, `list_voices`, `text_to_speech`, etc.
   - 27 total tools expected

**If connection fails:**
- Check MCP server logs
- Verify `MCP_AUTH_TOKEN` is NOT set (or is optional)
- Test manually: `curl -X POST https://mcp.voicelab.uz/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`

### Step 4: Domain Verification

1. OpenAI generates verification token (e.g., `openai_verify_abc123def456...`)
2. Copy token from portal
3. Host as plain text file:

   **Primary domain (required):**
   ```
   https://mcp.voicelab.uz/.well-known/openai-apps-challenge
   ```

   **Parent domain (optional but recommended):**
   ```
   https://voicelab.uz/.well-known/openai-apps-challenge
   ```

4. Example nginx config snippet:

   ```nginx
   server {
       server_name mcp.voicelab.uz;
       
       location /.well-known/openai-apps-challenge {
           alias /var/www/voicelab/openai-verify.txt;
           default_type text/plain;
           add_header Cache-Control "no-store";
       }
       
       # ... rest of MCP config ...
   }
   ```

5. Or create static file:
   ```bash
   echo "openai_verify_YOUR_TOKEN_HERE" > /var/www/voicelab/.well-known/openai-apps-challenge
   chmod 644 /var/www/voicelab/.well-known/openai-apps-challenge
   ```

6. Test before clicking "Verify":
   ```bash
   curl https://mcp.voicelab.uz/.well-known/openai-apps-challenge
   # Should return: openai_verify_YOUR_TOKEN_HERE
   ```

7. Click **"Verify Domain"** in OpenAI portal

### Step 5: Review Submission Materials

OpenAI displays plugin details for review:

**Confirm:**
- [ ] Display name: "VoiceLab"
- [ ] Short description: "Speech AI for Uzbek/Russian/English"
- [ ] Long description mentions TTS, STT, voice isolation, LLM
- [ ] Category: "Productivity"
- [ ] 6 capabilities listed
- [ ] 3 default prompts shown
- [ ] 5 positive test cases
- [ ] 3 negative test cases
- [ ] All test cases reference real tool names
- [ ] Logo and icon render correctly (not placeholder)

**Add in portal (if fields exist):**
- Test credentials: `vlk_reviewer_key_here` (the restricted key from checklist)
- Demo video URL: `https://youtube.com/watch?v=...` (if recorded)
- Additional notes for reviewer:
  ```
  VoiceLab MCP provides speech AI for Uzbek, Russian, and English.
  
  Test account credentials: Bearer token in Authorization header.
  API key: vlk_[PROVIDED_IN_FIELD]
  
  Key capabilities to test:
  1. TTS: "Generate Uzbek speech for: Salom"
  2. STT: Upload sample audio (Uzbek/Russian/English)
  3. Voice isolation: Upload noisy audio
  
  All async operations (STT, isolation) require polling get_* tools.
  Audio is base64-encoded for I/O.
  ```

### Step 6: Submit for Review

1. Click **"Submit for Review"**
2. OpenAI queues plugin for human review
3. Estimated review time: **3-5 business days**

## After Submission

### During Review

You'll receive email updates:
- "Submission received"
- "Under review"
- "Changes requested" (if issues found)
- "Approved" or "Rejected"

**Common feedback:**
- Test cases don't match actual tool behavior
- Descriptions too technical or unclear
- Legal URLs return errors
- MCP connection unstable
- Assets (logo/icon) low quality or wrong format

**Response time:**
- Respond to feedback within 7 days
- Make requested changes
- Re-upload plugin ZIP if needed
- Click "Resubmit"

### After Approval

- Plugin goes live in OpenAI marketplace immediately
- Users can discover via search: "VoiceLab", "Uzbek speech", "transcription"
- Plugin appears in ChatGPT plugin store
- Monitor usage via OpenAI developer dashboard

**Updates:**
- To update plugin: Upload new ZIP with incremented version
- Update `plugin.json` → `version: "1.0.1"`, add release notes
- Minor updates (docs, descriptions) may auto-approve
- Major updates (new tools, auth changes) trigger re-review

### Monitoring

Track in OpenAI dashboard:
- Active users
- Tool call volume
- Error rates
- User ratings and reviews

### Promotion

Once live:
- Announce on https://voicelab.uz
- Add badge: "Available on OpenAI Plugins"
- Update docs: https://docs.voicelab.uz
- Share on social media

## Troubleshooting

### "Domain verification failed"

**Cause:** OpenAI can't fetch or token doesn't match

**Fix:**
```bash
# Check file is accessible
curl https://mcp.voicelab.uz/.well-known/openai-apps-challenge

# Check file content exactly matches portal token (no whitespace)
cat /path/to/openai-verify.txt | xxd

# Check nginx logs
tail -f /var/log/nginx/access.log | grep openai-apps-challenge
```

### "MCP connection failed"

**Cause:** Server unreachable or returns errors

**Fix:**
```bash
# Test MCP initialize
curl -X POST https://mcp.voicelab.uz/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'

# Test tools/list
curl -X POST https://mcp.voicelab.uz/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Check server logs
# (depends on your deployment - Cloudflare Workers logs, VPS systemd logs, etc.)
```

### "Assets not found or invalid format"

**Cause:** logo.png or icon.png missing, wrong dimensions, or not PNG

**Fix:**
1. Verify files exist: `ls -lh plugin/assets/`
2. Check format: `file plugin/assets/logo.png` (should say "PNG image data")
3. Check dimensions: `identify plugin/assets/logo.png` (ImageMagick) or open in image viewer
4. Ensure square and minimum sizes (512x512 for logo, 256x256 for icon)
5. Rebuild ZIP and re-upload

### "Test case failed"

**Cause:** Agent didn't call expected tools or behavior mismatched

**Fix:**
1. Review failed test case in OpenAI feedback
2. Test manually in ChatGPT with same prompt
3. Check MCP logs for actual tools called
4. Update test case description to match actual behavior, or
5. Fix MCP tool behavior if incorrect

## Support & Questions

- **OpenAI submission issues**: https://help.openai.com/plugins
- **VoiceLab MCP issues**: https://github.com/voicelab-uz/mcp/issues
- **Direct contact**: elzodxon@gmail.com

## Checklist Summary

Before clicking "Submit":

- [ ] Plugin ZIP built successfully
- [ ] Real logo and icon assets included (not placeholders)
- [ ] MCP server accessible at https://mcp.voicelab.uz/mcp
- [ ] Domain verification file hosted at /.well-known/openai-apps-challenge
- [ ] All legal URLs (privacy, terms, support) return 200
- [ ] Test credentials prepared for reviewers
- [ ] Demo video recorded and URL added (recommended)
- [ ] All 8 test cases verified against actual MCP tools

**After all items checked → Proceed with Step 1: Build Plugin ZIP** ✅
