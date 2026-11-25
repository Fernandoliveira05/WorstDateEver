"""Brazilian Portuguese character voices for the first-date preview."""
import argparse
import io
import json
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock

import numpy as np
import onnxruntime as ort
from kokoro_onnx import Kokoro
from piper import PiperVoice, SynthesisConfig


def serve():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--voices", type=Path, required=True)
    parser.add_argument("--port", type=int, default=8784)
    args = parser.parse_args()
    folder = args.voices
    piper_voices = {
        "caio": (PiperVoice.load(folder / "pt_BR-cadu-medium.onnx"), 1.10),
        "rafa": (PiperVoice.load(folder / "pt_BR-faber-medium.onnx"), .92),
    }
    options = ort.SessionOptions()
    options.intra_op_num_threads = 3
    options.inter_op_num_threads = 1
    engine = Kokoro.from_session(
        ort.InferenceSession(str(folder / "kokoro-v1.0.int8.onnx"), sess_options=options,
                             providers=["CPUExecutionProvider"]),
        str(folder / "voices-v1.0.bin"),
    )
    dora = engine.get_voice_style("pf_dora")
    kokoro_voices = {
        "bia": (dora, 1.05),
        "luiza": (dora * .68 + engine.get_voice_style("af_sarah") * .32, .92),
    }
    active = Lock()

    def synthesize(persona, text):
        output = io.BytesIO()
        with wave.open(output, "wb") as wav:
            if persona in piper_voices:
                voice, length = piper_voices[persona]
                voice.synthesize_wav(text, wav, syn_config=SynthesisConfig(length_scale=length))
            else:
                style, speed = kokoro_voices[persona]
                samples, rate = engine.create(text, style, speed=speed, lang="pt-br")
                wav.setparams((1, 2, rate, 0, "NONE", "not compressed"))
                wav.writeframes((np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())
        return output.getvalue()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/health":
                self.send_response(204)
                self.end_headers()
            else:
                self.send_error(404)

        def do_POST(self):
            if self.path != "/synthesize":
                self.send_error(404)
                return
            try:
                length = int(self.headers.get("Content-Length", 0))
                if not 0 < length <= 4096:
                    raise ValueError("request length")
                query = json.loads(self.rfile.read(length))
                persona, text = query["persona"], query["text"].strip()
                if persona not in piper_voices and persona not in kokoro_voices or not 0 < len(text) <= 650:
                    raise ValueError("voice or line")
            except (KeyError, TypeError, ValueError, AttributeError):
                self.send_error(400)
                return
            if not active.acquire(timeout=6):
                self.send_error(503)
                return
            try:
                audio = synthesize(persona, text)
            except Exception as error:
                self.log_error("Synthesis failed: %s", type(error).__name__)
                self.send_error(422)
                return
            finally:
                active.release()
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(audio)))
            self.end_headers()
            self.wfile.write(audio)

    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    serve()
