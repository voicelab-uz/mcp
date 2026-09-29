# VoiceLab Skills for Cursor

## TTS Workflow

**Trigger**: "Generate speech in [language]"

**Steps**:
1. Call `list_voices` with language filter
2. Show user available voices
3. Call `text_to_speech` with selected voice
4. Save base64 audio to file

## STT Workflow

**Trigger**: "Transcribe this audio"

**Steps**:
1. Encode audio file to base64
2. Call `speech_to_text` with base64 audio
3. Poll `get_transcription` every 2 seconds
4. Display transcript with timing when complete

## Voice Cleanup Workflow

**Trigger**: "Remove background noise"

**Steps**:
1. Encode audio to base64
2. Call `isolate_voice` with optional speech restoration
3. Poll `get_isolation` until complete
4. Retrieve cleaned audio URL
