# OpenAI ChatGPT Plugins Submission

## Pre-Submission Checklist

- [x] MCP server deployed at https://mcp.voicelab.uz/mcp
- [ ] Domain verification file in place
- [ ] Logo (512x512) at https://mcp.voicelab.uz/logo.png
- [ ] Privacy policy at https://voicelab.uz/privacy
- [ ] Terms of service at https://voicelab.uz/terms

## Files to Host

### 1. ai-plugin.json
Host at: `https://mcp.voicelab.uz/.well-known/ai-plugin.json`

```bash
# Copy to server
cp packaging/openai-dots/ai-plugin.json /path/to/server/.well-known/
```

### 2. Domain Verification
Create file at: `https://mcp.voicelab.uz/.well-known/openai-apps-challenge`

Content: `{VERIFICATION_TOKEN_FROM_OPENAI}`

OpenAI provides this token during submission.

### 3. Logo
Upload 512x512 PNG to: `https://mcp.voicelab.uz/logo.png`

## Test Cases

### Positive Tests
1. **Generate TTS**: "Generate Uzbek speech for 'Assalomu alaykum'"
2. **Transcribe with speakers**: Upload audio, "Transcribe with speaker labels"
3. **List voices**: "Show available Uzbek voices"
4. **LLM completion**: "Use Aisha model to answer: What is Uzbekistan?"
5. **Voice isolation**: "Remove background noise from this recording"

### Negative Tests
1. **Missing API key**: Should return clear authentication error
2. **Invalid voice**: "Use voice_invalid123" → Should list available voices
3. **Wrong language**: "Generate speech in Klingon" → Should show supported languages

## Submission Steps

1. Go to https://platform.openai.com/plugins
2. Click "Develop your own plugin"
3. Enter: `https://mcp.voicelab.uz`
4. Complete verification challenge
5. Upload test cases
6. Provide demo video URL
7. Give reviewer access credentials:
   - Test API key: `vlk_reviewer_test_key` (create in dashboard)
   - No MFA required

## Review Timeline

- Initial review: 3-5 business days
- Revisions (if needed): 2-3 days per iteration
- Approval: Plugin goes live immediately

## Post-Approval

- Monitor usage in OpenAI dashboard
- Update plugin by resubmitting
- Auto-scans detect endpoint changes daily
