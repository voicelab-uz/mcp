Source: https://docs.voicelab.uz/api/realtime-stt

# Realtime STT over WebSocket

Realtime STT accepts raw PCM audio and returns one final transcript per commit.
For browsers, have your backend mint a short-lived ticket. Trusted server-side
clients may instead send `xvl-api-key` on the WebSocket handshake. Both STT and
TTS support these same two methods; never send both together. Never put a
long-lived API key or user JWT in the WebSocket URL or browser bundle.

## 1. Create an STT ticket

**POST https://api.voicelab.uz/v1/ticket**

Mint a short-lived ticket for one realtime STT connection.

Authentication: `Bearer vlk_...`.

Content-Type: `application/json`.

```json
{"transport":"websocket","service":"stt"}
```

The API key needs `stt:realtime`. `stt:write` alone does not grant realtime
access. Both `transport` and `service` are required. Tickets are service-bound:
an STT ticket cannot authorize TTS and a TTS ticket cannot authorize STT.

`201 Created` returns the ticket and WebSocket URL:

```json
{
  "ticket": "eyJhbGciOiJIUzI1NiIs...",
  "service": "stt",
  "transport": "websocket",
  "scope": "stt:realtime",
  "expires_at": "2026-08-16T12:02:00Z",
  "websocket_url": "wss://api.voicelab.uz/v1/stt/stream",
  "request_id": "req_01J..."
}
```

Use the ticket immediately and keep it out of logs and storage.

## 2. Connect

**WSS wss://api.voicelab.uz/v1/stt/stream?ticket=<short-lived-ticket>**

Open one realtime STT connection with the short-lived ticket.

The server sends `ready` after the connection opens:

```json
{"event":"ready","audio_format":"pcm_s16le","sample_rate":16000,"channels":1}
```

The examples transcribe `audio.pcm`, a headerless 16 kHz mono PCM16 file.
Python uses `requests` and `websocket-client`. TypeScript uses `ws`. The Java
example uses Java 17+ and Jackson databind. An interactive `wscat` session is
not useful here because the client must send binary PCM chunks.



```python
import json
import os
from pathlib import Path
from urllib.parse import urlencode

import requests
import websocket

response = requests.post(
    "https://api.voicelab.uz/v1/ticket",
    headers={
        "Authorization": f"Bearer {os.environ['VOICELAB_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={"transport": "websocket", "service": "stt"},
    timeout=15,
)
response.raise_for_status()
ticket = response.json()

url = f"{ticket['websocket_url']}?{urlencode({'ticket': ticket['ticket']})}"
ws = websocket.create_connection(url, timeout=45)
print(json.loads(ws.recv()))  # ready

ws.send(json.dumps({
    "type": "start",
    "language": "uz",
    "audio_format": "pcm_s16le",
    "sample_rate": 16000,
    "channels": 1,
    "word_timestamps": True,
}))

audio = Path("audio.pcm").read_bytes()
for offset in range(0, len(audio), 3200):
    ws.send_binary(audio[offset:offset + 3200])

ws.send(json.dumps({"type": "commit"}))
result = json.loads(ws.recv())
print(result)
ws.close()
```

```ts
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import WebSocket from "ws";

const response = await fetch("https://api.voicelab.uz/v1/ticket", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.VOICELAB_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ transport: "websocket", service: "stt" }),
});
if (!response.ok) throw new Error(await response.text());

const ticket = await response.json() as {
  ticket: string;
  websocket_url: string;
};
const url = new URL(ticket.websocket_url);
url.searchParams.set("ticket", ticket.ticket);

const socket = new WebSocket(url);
const readyMessage = once(socket, "message");
await once(socket, "open");
const [ready] = await readyMessage;
console.log(JSON.parse(ready.toString()));

socket.send(JSON.stringify({
  type: "start",
  language: "uz",
  audio_format: "pcm_s16le",
  sample_rate: 16000,
  channels: 1,
  word_timestamps: true,
}));

const audio = await readFile("audio.pcm");
for (let offset = 0; offset < audio.length; offset += 3200) {
  socket.send(audio.subarray(offset, offset + 3200), { binary: true });
}

const finalMessage = once(socket, "message");
socket.send(JSON.stringify({ type: "commit" }));
const [result] = await finalMessage;
console.log(JSON.parse(result.toString()));
socket.close();
```

```java
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;

public final class RealtimeStt {
public static void main(String[] args) throws Exception {
var mapper = new ObjectMapper();
var http = HttpClient.newHttpClient();
var ticketRequest = HttpRequest.newBuilder(URI.create("https://api.voicelab.uz/v1/ticket"))
    .header("Authorization", "Bearer " + System.getenv("VOICELAB_API_KEY"))
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(
        "{\"transport\":\"websocket\",\"service\":\"stt\"}"))
    .build();
var ticketResponse = http.send(ticketRequest, HttpResponse.BodyHandlers.ofString());
if (ticketResponse.statusCode() != 201) throw new IllegalStateException(ticketResponse.body());

JsonNode ticket = mapper.readTree(ticketResponse.body());
String socketUrl = ticket.get("websocket_url").asText() + "?ticket="
    + URLEncoder.encode(ticket.get("ticket").asText(), StandardCharsets.UTF_8);
var events = new LinkedBlockingQueue<String>();

WebSocket.Listener listener = new WebSocket.Listener() {
  private final StringBuilder text = new StringBuilder();

  @Override public void onOpen(WebSocket socket) { socket.request(1); }

  @Override public CompletionStage<?> onText(
      WebSocket socket, CharSequence data, boolean last) {
    text.append(data);
    if (last) {
      events.add(text.toString());
      text.setLength(0);
    }
    socket.request(1);
    return null;
  }
};

WebSocket socket = http.newWebSocketBuilder()
    .buildAsync(URI.create(socketUrl), listener).join();
System.out.println(mapper.readTree(events.take())); // ready

socket.sendText("""
    {"type":"start","language":"uz","audio_format":"pcm_s16le",
     "sample_rate":16000,"channels":1,"word_timestamps":true}
    """, true).join();

byte[] audio = Files.readAllBytes(Path.of("audio.pcm"));
for (int offset = 0; offset < audio.length; offset += 3200) {
  int length = Math.min(3200, audio.length - offset);
  socket.sendBinary(ByteBuffer.wrap(audio, offset, length), true).join();
}

socket.sendText("{\"type\":\"commit\"}", true).join();
System.out.println(mapper.readTree(events.take())); // final or error
socket.sendClose(WebSocket.NORMAL_CLOSURE, "done").join();
}
}
```



For browser clients, let your backend mint the ticket. Redact ticket query
strings in reverse-proxy access logs.

## 3. Start an utterance

```json
{
  "type": "start",
  "language": "uz",
  "audio_format": "pcm_s16le",
  "sample_rate": 16000,
  "channels": 1,
  "word_timestamps": true
}
```

Realtime STT supports `uz`, `en`, and `ru`. Audio must be signed 16-bit
little-endian PCM, mono, and 16,000 Hz. Each commit must contain at least 100
ms and at most 35 seconds of audio.

Browser `MediaRecorder` WebM/Opus frames are not accepted. Decode them to
PCM16 with an `AudioWorklet` before sending.

## 4. Send audio and commit

Send one or more binary WebSocket frames containing raw PCM bytes, then send:

```json
{"type":"commit"}
```

`{"action":"stop"}` is an alias for commit. Cancel or clear the active
utterance with:

```json
{"action":"interrupt"}
```

## Final response

The server returns one final result. It does not send interim transcripts.

```json
{
  "event": "final",
  "text": "Salom dunyo",
  "language": "uz",
  "duration_ms": 1420,
  "segments": [
    {
      "ordinal": 1,
      "start_ms": 120,
      "end_ms": 1320,
      "text": "Salom dunyo",
      "words": [
        {"ordinal": 1, "start_ms": 120, "end_ms": 500, "text": "Salom"},
        {"ordinal": 2, "start_ms": 520, "end_ms": 1320, "text": "dunyo"}
      ]
    }
  ]
}
```

Realtime results do not enter STT history. Use `POST /v1/stt` for saved
transcriptions, source audio, editing, or SRT/VTT export.

## Error events

```json
{
  "event": "error",
  "code": "invalid_audio",
  "message": "Send at least 100 ms of PCM audio before commit."
}
```

WebSocket error codes include `invalid_message`, `validation_error`,
`not_started`, `busy`, `invalid_audio`, `audio_too_long`,
`no_speech_detected`, `insufficient_credits`, `overloaded`, `timeout`, and
`service_unavailable`.

Errors before the WebSocket upgrade use HTTP JSON:

| Status | Code |
| ---: | --- |
| `401` | `invalid_realtime_ticket` |
| `403` | `origin_forbidden` |
| `404` | `not_found` when realtime is disabled |

After the upgrade, validation and processing errors are WebSocket JSON events,
not HTTP responses.
