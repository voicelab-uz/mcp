Source: https://docs.voicelab.uz/api/stt

# Speech-to-Text (STT)

Upload audio for transcription, speaker labels, timing data, history, editing, and export.

## Transcribe audio

**POST https://api.voicelab.uz/v1/stt**

Upload an audio file for speech-to-text transcription.

Authentication: `Bearer vlk_...`.

Content-Type: `multipart/form-data`.

### Headers

| Header | Required | Value |
| --- | --- | --- |
| `Authorization` | yes | `Bearer <VOICELAB_API_KEY>` |
| `Idempotency-Key` | yes | A UUID in standard 36-character form |
| `Content-Type` | yes | `multipart/form-data` with the generated boundary |

Example idempotency key: `550e8400-e29b-41d4-a716-446655440000`.

### Multipart fields

| Field | Required | Value |
| --- | --- | --- |
| `audio` | yes | One audio file |
| `language` | yes | `uz`, `en`, or `ru` |
| `include_speakers` | no | `true` or `false`; default: `false` |

### Upload limits

| Limit | Value |
| --- | --- |
| Formats | MP3, WAV, M4A/AAC, OGG/Opus, WebM/Opus, or FLAC |
| Minimum audio duration | 0.5 seconds |
| Upload size | 500 MiB maximum |
| Submission | `202 Accepted` for all newly accepted files, including short clips |

The API inspects the actual container and codec. A filename or browser MIME type does not prove that a file is valid.

### Request examples

All examples send `meeting.mp3` with `language=en` and `include_speakers=false`.
Submission requires `stt:write`; polling requires `stt:read` on the same account.
Generate and persist a new UUID for each logical upload; reuse it for identical
retries. The upload acknowledgement is not the transcript. Python and TypeScript
below poll automatically; the cURL and Java examples print the accepted job ID,
which you then retrieve using the polling endpoint below.



```bash
curl -fS 'https://api.voicelab.uz/v1/stt' \
  -H "Authorization: Bearer $VOICELAB_API_KEY" \
  -H 'Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000' \
  -F 'audio=@meeting.mp3;type=audio/mpeg' \
  -F 'language=en' \
  -F 'include_speakers=false'
```

```python
import os
import time
import uuid
import requests

base = "https://api.voicelab.uz"
headers = {"Authorization": f"Bearer {os.environ['VOICELAB_API_KEY']}"}
request_key = str(uuid.uuid4())  # Save for retries of this exact file/options.
with open("meeting.mp3", "rb") as audio_file:
    response = requests.post(
        "https://api.voicelab.uz/v1/stt",
        headers={
            **headers,
            "Idempotency-Key": request_key,
        },
        files={"audio": ("meeting.mp3", audio_file, "audio/mpeg")},
        data={"language": "en", "include_speakers": "false"},
        timeout=120,
    )

response.raise_for_status()
job_id = response.json()["id"]  # Persist this ID to resume polling later.
deadline = time.monotonic() + 900
while time.monotonic() < deadline:
    poll = requests.get(f"{base}/v1/stt/transcriptions/{job_id}", headers=headers, timeout=30)
    poll.raise_for_status()
    result = poll.json()
    if result["status"] == "completed":
        print(result["transcript"])
        break
    if result["status"] == "failed":
        raise RuntimeError(result.get("error", "Transcription failed"))
    time.sleep(max(1, min(10, int(poll.headers.get("Retry-After", "1")))))
else:
    raise TimeoutError(f"Still pending: {job_id}; resume polling this ID, do not resubmit.")
```

```ts
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const base = "https://api.voicelab.uz";
const headers = { Authorization: `Bearer ${process.env.VOICELAB_API_KEY}` };
const requestKey = randomUUID(); // Save for retries of this exact file/options.
const form = new FormData();
const audio = new Uint8Array(await readFile("meeting.mp3"));
form.append("audio", new Blob([audio], { type: "audio/mpeg" }), "meeting.mp3");
form.append("language", "en");
form.append("include_speakers", "false");

const response = await fetch("https://api.voicelab.uz/v1/stt", {
  method: "POST",
  headers: {
    ...headers,
    "Idempotency-Key": requestKey,
  },
  body: form,
  signal: AbortSignal.timeout(120_000),
});

if (!response.ok) throw new Error(await response.text());
const { id } = await response.json(); // Persist to resume polling later.
const deadline = Date.now() + 900_000;
let completed = false;
while (Date.now() < deadline) {
  const poll = await fetch(`${base}/v1/stt/transcriptions/${encodeURIComponent(id)}`, {
    headers, signal: AbortSignal.timeout(30_000),
  });
  if (!poll.ok) throw new Error(await poll.text());
  const result = await poll.json();
  if (result.status === "completed") {
    console.log(result.transcript);
    completed = true;
    break;
  }
  if (result.status === "failed") throw new Error(JSON.stringify(result.error ?? result));
  const retryAfter = Number(poll.headers.get("Retry-After") ?? "1");
  const seconds = Number.isFinite(retryAfter) ? Math.max(1, Math.min(10, retryAfter)) : 1;
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
}
if (!completed) throw new Error(`Still pending: ${id}; resume polling this ID, do not resubmit.`);
```

```java
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.UUID;

public final class Main {
  private static void addField(
      ByteArrayOutputStream body, String boundary, String name, String value
  ) throws Exception {
    body.write(("--" + boundary + "\r\n"
        + "Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n"
        + value + "\r\n").getBytes(StandardCharsets.UTF_8));
  }

  public static void main(String[] args) throws Exception {
    String boundary = "VoiceLabBoundary" + System.currentTimeMillis();
    ByteArrayOutputStream body = new ByteArrayOutputStream();

    body.write(("--" + boundary + "\r\n"
        + "Content-Disposition: form-data; name=\"audio\"; filename=\"meeting.mp3\"\r\n"
        + "Content-Type: audio/mpeg\r\n\r\n").getBytes(StandardCharsets.UTF_8));
    body.write(Files.readAllBytes(Path.of("meeting.mp3")));
    body.write("\r\n".getBytes(StandardCharsets.UTF_8));
    addField(body, boundary, "language", "en");
    addField(body, boundary, "include_speakers", "false");
    body.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));

    HttpRequest request = HttpRequest.newBuilder()
        .uri(URI.create("https://api.voicelab.uz/v1/stt"))
        .header("Authorization", "Bearer " + System.getenv("VOICELAB_API_KEY"))
        .header("Idempotency-Key", UUID.randomUUID().toString()) // Persist for retries.
        .header("Content-Type", "multipart/form-data; boundary=" + boundary)
        .timeout(Duration.ofSeconds(120))
        .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()))
        .build();

    HttpResponse<String> response = HttpClient.newHttpClient().send(
        request, HttpResponse.BodyHandlers.ofString()
    );
    if (response.statusCode() >= 400) throw new RuntimeException(response.body());
    System.out.println(response.body()); // 202 acknowledgement: poll its id, not transcript.
  }
}
```



### Submission response

Both short and long recordings return `202 Accepted` with a job acknowledgement:

```json
{"id":"stt_01J...","status":"queued","request_id":"req_01J..."}
```

Poll `GET /v1/stt/transcriptions/{id}` using the same account's `stt:read` key.
Respect `Retry-After` when present; otherwise poll about once per second with a
bounded client deadline. A polling `200 OK` can still mean `queued` or
`processing`. Only read `transcript` after `status=completed`; handle
`status=failed` as a job failure, even when the polling HTTP status is `200`.

```bash
curl -fS "https://api.voicelab.uz/v1/stt/transcriptions/$STT_JOB_ID" \
  -H "Authorization: Bearer $VOICELAB_API_KEY"
```

Persist `id` before polling. If your client deadline expires, resume polling
that same ID later instead of submitting duplicate work. Processing time
depends on duration, diarization and queue/provider load, not only file size.

### Completed polling response

```json
{
  "id": "stt_01J...",
  "status": "completed",
  "transcript": "Hello world.",
  "language": "en",
  "duration_ms": 1420,
  "audio_available": true,
  "audio_url": "https://storage.example/signed-url...",
  "segments": [
    {
      "ordinal": 1,
      "start_ms": 120,
      "end_ms": 1320,
      "text": "Hello world.",
      "words": [
        {"ordinal": 1, "start_ms": 120, "end_ms": 520, "text": "Hello"},
        {"ordinal": 2, "start_ms": 540, "end_ms": 1320, "text": "world."}
      ]
    }
  ],
  "speakers": [],
  "speakers_available": false,
  "request_id": "req_01J..."
}
```

`audio_url` is optional and short-lived. The API returns it only when private source-audio storage is configured.

The API returns word timing when the provider supplies valid alignment. If `words` is absent, use the segment's `start_ms` and `end_ms`. Do not calculate word timing by dividing a segment.

With `include_speakers=true`, segments can contain labels such as `speaker_1`, and `speakers` contains local display metadata. Labels apply only to that transcription and do not identify people across recordings.

## Retry safely with idempotency

- Use a new UUID for different audio, language, or fields.
- After an upload timeout, retry the same file and fields with the same UUID. The API identifies the existing job without processing or charging again. Even a completed POST replay is an acknowledgement; GET the result by ID.
- Reusing a UUID with different audio or fields returns `409 idempotency_key_reused`.

```json
{
  "message": "Use a new Idempotency-Key for a different request.",
  "error": {"code": "idempotency_key_reused"},
  "request_id": "req_01J..."
}
```

## Read transcription history

### List transcriptions

**GET https://api.voicelab.uz/v1/stt/transcriptions?limit=10&cursor=<opaque>**

List saved transcriptions with cursor pagination.

Authentication: `Bearer vlk_...`.

Requires `stt:read`. The list limit is `10`. Treat `next_cursor` as opaque and send it unchanged.



```bash
curl -fS 'https://api.voicelab.uz/v1/stt/transcriptions?limit=10&cursor=NEXT_CURSOR' \
  -H "Authorization: Bearer $VOICELAB_API_KEY"
```

```python
import os
import requests

response = requests.get(
    "https://api.voicelab.uz/v1/stt/transcriptions",
    headers={"Authorization": f"Bearer {os.environ['VOICELAB_API_KEY']}"},
    params={"limit": 10, "cursor": "NEXT_CURSOR"},
    timeout=30,
)
response.raise_for_status()
print(response.json())
```

```ts
const url = new URL("https://api.voicelab.uz/v1/stt/transcriptions");
url.searchParams.set("limit", "10");
url.searchParams.set("cursor", "NEXT_CURSOR");

const response = await fetch(url, {
  headers: { Authorization: `Bearer ${process.env.VOICELAB_API_KEY}` },
});
if (!response.ok) throw new Error(await response.text());
console.log(await response.json());
```

```java
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

public final class Main {
  public static void main(String[] args) throws Exception {
    String cursor = URLEncoder.encode("NEXT_CURSOR", StandardCharsets.UTF_8);
    var request = HttpRequest.newBuilder(URI.create(
        "https://api.voicelab.uz/v1/stt/transcriptions?limit=10&cursor=" + cursor))
        .header("Authorization", "Bearer " + System.getenv("VOICELAB_API_KEY"))
        .GET()
        .build();
    var response = HttpClient.newHttpClient().send(
        request, HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() >= 400) throw new RuntimeException(response.body());
    System.out.println(response.body());
  }
}
```



```json
{
  "data": [
    {
      "id": "stt_01J...",
      "title": "meeting",
      "language": "en",
      "duration_ms": 1420,
      "audio_available": true,
      "created_at": "2026-08-16T12:00:00Z"
    }
  ],
  "next_cursor": null,
  "request_id": "req_01J..."
}
```

### Get a transcription

**GET https://api.voicelab.uz/v1/stt/transcriptions/{transcription_id}**

Read a complete transcription and its metadata.

Authentication: `Bearer vlk_...`.

The response contains the transcript, ordered segments, word timing, local speaker labels, revision, and optional signed source-audio URL.



```bash
curl -fS 'https://api.voicelab.uz/v1/stt/transcriptions/stt_01J...' \
  -H "Authorization: Bearer $VOICELAB_API_KEY"
```

```python
import os
import requests

response = requests.get(
    "https://api.voicelab.uz/v1/stt/transcriptions/stt_01J...",
    headers={"Authorization": f"Bearer {os.environ['VOICELAB_API_KEY']}"},
    timeout=30,
)
response.raise_for_status()
print(response.json())
```

```ts
const response = await fetch(
  "https://api.voicelab.uz/v1/stt/transcriptions/stt_01J...",
  { headers: { Authorization: `Bearer ${process.env.VOICELAB_API_KEY}` } },
);
if (!response.ok) throw new Error(await response.text());
console.log(await response.json());
```

```java
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public final class Main {
  public static void main(String[] args) throws Exception {
    var request = HttpRequest.newBuilder(URI.create(
        "https://api.voicelab.uz/v1/stt/transcriptions/stt_01J..."))
        .header("Authorization", "Bearer " + System.getenv("VOICELAB_API_KEY"))
        .GET()
        .build();
    var response = HttpClient.newHttpClient().send(
        request, HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() >= 400) throw new RuntimeException(response.body());
    System.out.println(response.body());
  }
}
```



## Rename, edit, and delete

### Rename a transcription

**PATCH https://api.voicelab.uz/v1/stt/transcriptions/{transcription_id}**

Rename a saved transcription.

Authentication: `Bearer vlk_...`.

Content-Type: `application/json`.

Requires `stt:write`.

```json
{"title":"Customer interview"}
```



```bash
curl -fS -X PATCH 'https://api.voicelab.uz/v1/stt/transcriptions/stt_01J...' \
  -H "Authorization: Bearer $VOICELAB_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Customer interview"}'
```

```python
import os
import requests

response = requests.patch(
    "https://api.voicelab.uz/v1/stt/transcriptions/stt_01J...",
    headers={"Authorization": f"Bearer {os.environ['VOICELAB_API_KEY']}"},
    json={"title": "Customer interview"},
    timeout=30,
)
response.raise_for_status()
print(response.json())
```

```ts
const response = await fetch(
  "https://api.voicelab.uz/v1/stt/transcriptions/stt_01J...",
  {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.VOICELAB_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: "Customer interview" }),
  },
);
if (!response.ok) throw new Error(await response.text());
console.log(await response.json());
```

```java
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public final class Main {
  public static void main(String[] args) throws Exception {
    var request = HttpRequest.newBuilder(URI.create(
        "https://api.voicelab.uz/v1/stt/transcriptions/stt_01J..."))
        .header("Authorization", "Bearer " + System.getenv("VOICELAB_API_KEY"))
        .header("Content-Type", "application/json")
        .method("PATCH", HttpRequest.BodyPublishers.ofString(
            "{\"title\":\"Customer interview\"}"))
        .build();
    var response = HttpClient.newHttpClient().send(
        request, HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() >= 400) throw new RuntimeException(response.body());
    System.out.println(response.body());
  }
}
```



`200 OK`:

```json
{
  "id": "stt_01J...",
  "title": "Customer interview",
  "updated_at": "2026-08-16T12:05:00Z",
  "request_id": "req_01J..."
}
```

### Edit a transcription

**PUT https://api.voicelab.uz/v1/stt/transcriptions/{transcription_id}/editor**

Atomically replace the editable transcript document.

Authentication: `Bearer vlk_...`.

Content-Type: `application/json`.

Send the current `revision` from the `GET` response:

```json
{
  "revision": 1,
  "title": "Customer interview",
  "segments": [
    {
      "ordinal": 1,
      "start_ms": 120,
      "end_ms": 1320,
      "text": "Hello world.",
      "speaker": "speaker_1"
    }
  ],
  "speakers": [
    {"id": "speaker_1", "display_name": "Speaker 1"}
  ]
}
```



```bash
curl -fS -X PUT 'https://api.voicelab.uz/v1/stt/transcriptions/stt_01J.../editor' \
  -H "Authorization: Bearer $VOICELAB_API_KEY" \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "revision": 1,
  "title": "Customer interview",
  "segments": [
    {"ordinal": 1, "start_ms": 120, "end_ms": 1320, "text": "Hello world.", "speaker": "speaker_1"}
  ],
  "speakers": [{"id": "speaker_1", "display_name": "Speaker 1"}]
}
JSON
```

```python
import os
import requests

document = {
    "revision": 1,
    "title": "Customer interview",
    "segments": [{
        "ordinal": 1,
        "start_ms": 120,
        "end_ms": 1320,
        "text": "Hello world.",
        "speaker": "speaker_1",
    }],
    "speakers": [{"id": "speaker_1", "display_name": "Speaker 1"}],
}
response = requests.put(
    "https://api.voicelab.uz/v1/stt/transcriptions/stt_01J.../editor",
    headers={"Authorization": f"Bearer {os.environ['VOICELAB_API_KEY']}"},
    json=document,
    timeout=30,
)
response.raise_for_status()
print(response.json())
```

```ts
const document = {
  revision: 1,
  title: "Customer interview",
  segments: [{
    ordinal: 1,
    start_ms: 120,
    end_ms: 1320,
    text: "Hello world.",
    speaker: "speaker_1",
  }],
  speakers: [{ id: "speaker_1", display_name: "Speaker 1" }],
};

const response = await fetch(
  "https://api.voicelab.uz/v1/stt/transcriptions/stt_01J.../editor",
  {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${process.env.VOICELAB_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(document),
  },
);
if (!response.ok) throw new Error(await response.text());
console.log(await response.json());
```

```java
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public final class Main {
  public static void main(String[] args) throws Exception {
    String document = """
        {
          "revision": 1,
          "title": "Customer interview",
          "segments": [
            {"ordinal": 1, "start_ms": 120, "end_ms": 1320,
             "text": "Hello world.", "speaker": "speaker_1"}
          ],
          "speakers": [{"id": "speaker_1", "display_name": "Speaker 1"}]
        }
        """;
    var request = HttpRequest.newBuilder(URI.create(
        "https://api.voicelab.uz/v1/stt/transcriptions/stt_01J.../editor"))
        .header("Authorization", "Bearer " + System.getenv("VOICELAB_API_KEY"))
        .header("Content-Type", "application/json")
        .PUT(HttpRequest.BodyPublishers.ofString(document))
        .build();
    var response = HttpClient.newHttpClient().send(
        request, HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() >= 400) throw new RuntimeException(response.body());
    System.out.println(response.body());
  }
}
```



A stale revision returns `409 stt_edit_conflict`. Reload and merge before retrying. For a historical result without timing segments, send `transcript` instead of `segments` and `speakers`.

### Delete a transcription

**DELETE https://api.voicelab.uz/v1/stt/transcriptions/{transcription_id}**

Delete a transcription and retained source audio.

Authentication: `Bearer vlk_...`.



```bash
curl -fS -X DELETE 'https://api.voicelab.uz/v1/stt/transcriptions/stt_01J...' \
  -H "Authorization: Bearer $VOICELAB_API_KEY"
```

```python
import os
import requests

response = requests.delete(
    "https://api.voicelab.uz/v1/stt/transcriptions/stt_01J...",
    headers={"Authorization": f"Bearer {os.environ['VOICELAB_API_KEY']}"},
    timeout=30,
)
response.raise_for_status()
```

```ts
const response = await fetch(
  "https://api.voicelab.uz/v1/stt/transcriptions/stt_01J...",
  {
    method: "DELETE",
    headers: { Authorization: `Bearer ${process.env.VOICELAB_API_KEY}` },
  },
);
if (!response.ok) throw new Error(await response.text());
```

```java
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public final class Main {
  public static void main(String[] args) throws Exception {
    var request = HttpRequest.newBuilder(URI.create(
        "https://api.voicelab.uz/v1/stt/transcriptions/stt_01J..."))
        .header("Authorization", "Bearer " + System.getenv("VOICELAB_API_KEY"))
        .DELETE()
        .build();
    var response = HttpClient.newHttpClient().send(
        request, HttpResponse.BodyHandlers.discarding());
    if (response.statusCode() >= 400) {
      throw new RuntimeException("HTTP " + response.statusCode());
    }
  }
}
```



Requires `stt:write`. A successful deletion returns `204 No Content`.

## Export TXT, JSON, SRT, or VTT

**GET https://api.voicelab.uz/v1/stt/transcriptions/{transcription_id}/export?format=json**

Export a transcript as TXT, JSON, SRT, or VTT.

Authentication: `Bearer vlk_...`.

The response includes `Content-Disposition: attachment`.

| Format | Contents |
| --- | --- |
| `txt` | Plain transcript |
| `json` | Transcript, language, duration, speakers, and segments |
| `srt` | SubRip captions |
| `vtt` | WebVTT captions |

SRT and VTT require stored timing segments. Without them, the API returns `409 stt_timestamps_not_available` and does not fabricate timestamps.



```bash
curl -fS 'https://api.voicelab.uz/v1/stt/transcriptions/stt_01J.../export?format=vtt' \
  -H "Authorization: Bearer $VOICELAB_API_KEY" \
  -o meeting.vtt
```

```python
import os
from pathlib import Path
import requests

response = requests.get(
    "https://api.voicelab.uz/v1/stt/transcriptions/stt_01J.../export",
    headers={"Authorization": f"Bearer {os.environ['VOICELAB_API_KEY']}"},
    params={"format": "vtt"},
    timeout=30,
)
response.raise_for_status()
Path("meeting.vtt").write_bytes(response.content)
```

```ts
import { writeFile } from "node:fs/promises";

const response = await fetch(
  "https://api.voicelab.uz/v1/stt/transcriptions/stt_01J.../export?format=vtt",
  { headers: { Authorization: `Bearer ${process.env.VOICELAB_API_KEY}` } },
);
if (!response.ok) throw new Error(await response.text());
await writeFile("meeting.vtt", Buffer.from(await response.arrayBuffer()));
```

```java
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;

public final class Main {
  public static void main(String[] args) throws Exception {
    var request = HttpRequest.newBuilder(URI.create(
        "https://api.voicelab.uz/v1/stt/transcriptions/stt_01J.../export?format=vtt"))
        .header("Authorization", "Bearer " + System.getenv("VOICELAB_API_KEY"))
        .GET()
        .build();
    var response = HttpClient.newHttpClient().send(
        request, HttpResponse.BodyHandlers.ofByteArray());
    if (response.statusCode() >= 400) {
      throw new RuntimeException(new String(response.body()));
    }
    Files.write(Path.of("meeting.vtt"), response.body());
  }
}
```



## STT errors

| Status | Code | Meaning |
| ---: | --- | --- |
| `400` | `invalid_multipart`, `invalid_idempotency_key`, `invalid_pagination` | Fix fields or cursor |
| `401` | `invalid_api_key` | API key is missing, expired, disabled, or invalid |
| `402` | `insufficient_credits` | Account does not have enough credits |
| `403` | `insufficient_scope` | Key permissions or allowed IP policy blocks the operation |
| `404` | `stt_transcription_not_found` | ID is unknown or belongs to another account |
| `409` | `idempotency_key_reused`, `stt_edit_conflict`, `stt_timestamps_not_available` | Resolve the state conflict |
| `413` | `audio_too_large` | Use a smaller file |
| `415` | `unsupported_audio_format` | Use a supported audio format |
| `422` | `invalid_audio`, `unsupported_language`, `no_speech_detected`, `validation_error` | Correct the request |
| `429` | `rate_limited` | Wait for `Retry-After` |
| `503` | `stt_unavailable` | Retry later with the same idempotency key |
