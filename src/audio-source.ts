/**
 * Audio input for endpoints that accept exactly one of three multipart sources
 * (POST /v1/meetings, POST /v1/stt):
 *   - `audio`     — the file bytes
 *   - `audio_url` — public HTTPS URL the backend downloads
 *   - `upload_id` — a ready upload session (POST /v1/uploads + PUT content)
 */
export type AudioSource =
  | { kind: 'file'; blob: Blob; filename?: string }
  | { kind: 'url'; url: string }
  | { kind: 'upload'; id: string };

export function isAudioSource(value: unknown): value is AudioSource {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Blob) &&
    typeof (value as { kind?: unknown }).kind === 'string'
  );
}

/** Normalise legacy `Blob` callers to an AudioSource. */
export function toAudioSource(audio: AudioSource | Blob, filename?: string): AudioSource {
  if (isAudioSource(audio)) return audio;
  return { kind: 'file', blob: audio, filename };
}

/** Multipart field(s) for the given source: exactly one of audio | audio_url | upload_id. */
export function audioSourceFields(source: AudioSource): Record<string, string | Blob> {
  switch (source.kind) {
    case 'file':
      return {
        audio: source.filename ? new File([source.blob], source.filename) : source.blob,
      };
    case 'url':
      return { audio_url: source.url };
    case 'upload':
      return { upload_id: source.id };
  }
}
