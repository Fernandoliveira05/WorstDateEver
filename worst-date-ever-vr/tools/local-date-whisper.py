"""Local speech-to-text endpoint for the first-date server."""
import argparse
import io
import json
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

import numpy as np
from faster_whisper import WhisperModel


def serve():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default="base")
    parser.add_argument("--port", type=int, default=8788)
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    model = WhisperModel(args.model, device="cpu", compute_type="int8", cpu_threads=args.threads)
    busy = Lock()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != "/transcribe":
                self.send_error(404)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            if not 44 < length <= 1_100_000:
                self.send_error(413)
                return
            if not busy.acquire(blocking=False):
                self.send_error(429)
                return
            try:
                with wave.open(io.BytesIO(self.rfile.read(length)), "rb") as stream:
                    rate = stream.getframerate()
                    if stream.getnchannels() != 1 or stream.getsampwidth() != 2 or not 8000 <= rate <= 48000:
                        raise ValueError("Expected mono PCM16")
                    audio = np.frombuffer(stream.readframes(stream.getnframes()), dtype="<i2").astype(np.float32) / 32768
                if rate != 16000:
                    points = np.arange(round(len(audio) * 16000 / rate)) * rate / 16000
                    audio = np.interp(points, np.arange(len(audio)), audio).astype(np.float32)
                segments, _ = model.transcribe(audio, language="pt", beam_size=3,
                                               condition_on_previous_text=False, temperature=0)
                text = " ".join(segment.text.strip() for segment in segments).strip()
                payload = json.dumps({"text": text}, ensure_ascii=False).encode("utf-8")
            except Exception:
                self.send_error(422)
                return
            finally:
                busy.release()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    serve()
