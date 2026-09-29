# Muse.ai Connector Submission

## Submission Portal

https://muse.ai/platform → Connectors → Submit Connector

## Required Assets

### 1. Icons
- **512x512 PNG**: Primary icon (logo-512.png)
- **1024x1024 PNG**: High-res icon (logo-1024.png)
- Transparent background preferred

### 2. Screenshots (1280x720 or 1920x1080)
Create and host at mcp.voicelab.uz:
1. `screenshots/tts-generation.png` - Show TTS being generated
2. `screenshots/stt-transcription.png` - Show transcription with timing
3. `screenshots/voice-isolation.png` - Show noise removal

### 3. Demo Video (Optional but Recommended)
- 1-3 minutes
- Show key features in action
- Host at: `https://mcp.voicelab.uz/demo.mp4`
- Or upload to YouTube/Vimeo

## Submission Form Fields

### Basic Information
**Name**: VoiceLab

**Short Description** (50 chars):
```
Speech AI for agents
```

**Long Description** (500 chars):
```
Connect Muse agents to VoiceLab for natural speech generation, accurate transcription with timing and speaker labels, voice isolation with noise removal, and LLM completions. 

Features:
• Text-to-Speech: Generate natural voice in Uzbek, Russian, English
• Speech-to-Text: Transcribe with word timing and speaker labels
• Voice Isolation: Remove background noise, restore speech quality
• LLM: Chat completions with Aisha models

Perfect for audiobook creation, meeting transcription, podcast cleanup, and multilingual content.
```

**Category**: AI Tools / Speech Processing

**Author**: Elzodxon Sharofaddinov

**Contact Email**: elzodxon@gmail.com

**Website**: https://voicelab.uz

**Documentation**: https://docs.voicelab.uz

**Source Code**: https://github.com/voicelab-uz/mcp

### Integration Details

**Integration Type**: Existing MCP Server

**MCP Endpoint URL**:
```
https://mcp.voicelab.uz/mcp
```

**Authentication Method**: API Key (Bearer Token)

**API Key Instructions**:
```
1. Sign up at voicelab.uz
2. Go to Settings → API Keys
3. Click "Create New Key"
4. Grant required permissions (TTS, STT, Voices, LLM)
5. Copy the key (starts with vlk_)
6. Paste into Muse connector settings
```

**Environment Variable Name**: `VOICELAB_API_KEY`

### Example Prompts

1. "Generate Uzbek TTS for this product description with a natural voice"
2. "Transcribe this meeting audio with speaker labels and word timing"
3. "Remove background noise from this call recording"
4. "List available Uzbek voices for narration"
5. "Create an LLM completion using Aisha model"

### Pricing

**Free Tier**: Available (sign up required)

**Paid Plans**: Pay-as-you-go with credits

**Pricing URL**: https://voicelab.uz/pricing

### Legal

**Privacy Policy URL**: https://voicelab.uz/privacy

**Terms of Service URL**: https://voicelab.uz/terms

**Support URL**: https://voicelab.uz/support

**License**: MIT

### Tags

voicelab, speech, tts, stt, uzbek, russian, transcription, audio, ai

## Testing Before Submission

Test the connector in Muse preview:

1. Get test API key from voicelab.uz
2. Use Muse sandbox environment
3. Try all 5 example prompts
4. Verify responses are correct
5. Check error handling (try invalid voice ID)

## Submission Checklist

- [ ] connector.json filled out completely
- [ ] Icons uploaded (512x512 and 1024x1024)
- [ ] Screenshots created and hosted
- [ ] Demo video created (optional)
- [ ] Test API key ready for reviewers
- [ ] MCP endpoint tested and responding
- [ ] All URLs in connector.json are live
- [ ] Privacy policy and terms accessible

## Review Process

1. **Submission**: Fill out form, upload assets
2. **Initial Review**: 2-3 business days
3. **Testing**: Muse team tests with your test key
4. **Feedback**: Revisions if needed (1-2 day turnaround)
5. **Approval**: Connector goes live in catalog
6. **Indexing**: Appears in search within 24 hours

Total timeline: 5-10 business days

## Post-Approval

### Monitoring
- Check connector analytics in Muse dashboard
- Monitor API usage in VoiceLab dashboard
- Watch for user feedback

### Updates
- Resubmit through same portal
- Changes reviewed faster (1-2 days)
- No downtime during updates

### Support
For issues:
- Muse platform: support@muse.ai
- VoiceLab API: elzodxon@gmail.com
- GitHub issues: https://github.com/voicelab-uz/mcp/issues

## Marketing

After approval, promote:
- Tweet announcement with @MuseAI mention
- Blog post on voicelab.uz
- Add "Available on Muse" badge to site
- Demo video on YouTube
- Share in relevant Slack/Discord communities
