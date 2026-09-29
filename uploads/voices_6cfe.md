Source: https://docs.voicelab.uz/api/voices

# Voices and TTS capabilities

Discover supported voices, languages, models, formats, and sample rates before generating speech.

## List voices

**GET https://api.voicelab.uz/v1/voices?language=en**

List voices available for a supported language.

Authentication: `Bearer vlk_...`.

Requires `voices:read`. `language` is optional; if supplied it must be a code
returned by `GET /v1/tts/languages`.

Use `/v1/voices` as the canonical route. `GET /v1/tts/voices` is a compatibility
alias with identical authentication, visibility, filters and pagination.

Example response:

```json
{
  "data": [
    {
      "id": "voice_01J9NEUTRAL0000000000000001",
      "display_name": "Lison Neutral",
      "description": "A clear, balanced voice for everyday narration.",
      "language": "en",
      "kind": "system",
      "visibility": "public",
      "short_description": "Tiniq · muvozanatli",
      "orb_palette": "calm"
    }
  ],
  "request_id": "req_01J..."
}
```

Use the returned opaque `id` as `voice_id` in TTS requests. Do not use a
display name or an internal provider/model identifier.

The catalog is account-scoped. Unrestricted system voices are available to all
authenticated accounts; restricted system voices appear only for allowed users.
Private custom voices are returned only to their owner. Approved public custom
voices may also appear, subject to language and availability rules. A voice ID
does not bypass authorization for synthesis.

## List languages and model metadata

**GET https://api.voicelab.uz/v1/tts/languages**

List supported languages and public TTS model metadata.

Authentication: `Bearer vlk_...`.

Requires `tts:read`. The response contains:

- `provider`: public product name, currently `Lison-VoiceLab`.
- `sample_rate`: current default output rate, currently `24000`.
- `data`: enabled language codes and names.
- `models`: public model cards and output formats.

The public response never exposes internal provider names such as OmniVoice or
Triton model names. The current public model is presented as `VoiceLab Lison`
with the `Studio Quality` badge.

Example model output metadata:

```json
{
  "id": "lison",
  "name": "VoiceLab Lison",
  "badge": "Studio Quality",
  "description": "Natural, expressive multilingual speech for voiceovers, audiobooks, narration, and content creation.",
  "recommended": true,
  "languages": ["en", "uz", "ru"],
  "outputs": [
    {
      "format": "wav",
      "label": "WAV 24 kHz (Lossless)",
      "content_type": "audio/wav",
      "sample_rate": 24000,
      "streaming": false
    }
  ]
}
```

Use `models[].id` only as a display/catalog identifier. The TTS request does
not currently accept a model field; VoiceLab selects the configured model.

## Language selection in a client

A safe client flow is:

1. Call `/v1/tts/languages` with a key that has `tts:read`.
2. Render `data[].name` and `data[].native_name`.
3. Store `data[].code` when the user selects a language.
4. Call `/v1/voices?language={code}` with a key that has `voices:read`.
5. Store `voices[].id` and send it as `voice_id` to `/v1/tts`.

Do not hardcode a list of languages or assume every voice supports every
language. The catalog can change without changing the API version.

## Current output limitations

The current product output is:

- WAV only;
- 24,000 Hz;
- mono;
- 16-bit PCM;
- complete output after generation.

MP3, selectable bitrate, selectable sample rate, and streaming encoded audio
should be enabled only when they appear in the `outputs` array. A client must
not show an MP3 option merely because another provider supports it.
