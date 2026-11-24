# First Date preview

Finish preparation and choose **Partir** on the phone, or open the bedroom door. A valid saved exit resumes at the corresponding venue. The DMT branch still uses the bedroom aftermath. The date begins once the match reaches the empty chair.

| Match | Venue |
| --- | --- |
| Caio | Filtro & Prosa café |
| Rafa | Koi Torto sushi restaurant |
| Bia | A Mesa É Nossa bistro |
| Luiza | Último Pedido bar |

Rafa’s sushi venue has the initial table setting, pendants, noren and ceramic details. The other venues are themed blockouts using the same shell. The four dates reuse the existing character models and all venues reuse the bedroom’s mug, plate, notebook and material references. The game supports Portuguese choices throughout. After three conversation turns and one resolved comedy beat, **Encerrar o encontro** becomes available. Date progress and the final result are saved separately from the bedroom. A reload restores the last committed gameplay phase. Voice credentials stay in memory.

## Run

- Web preview. Run `npm install --allow-git=all` and `npm run dev`, or run `npm run build` and serve `dist/`. Mouse clicks select world-space controls and grab table props. In immersive mode, use controller grip for nearby props, the trigger ray for accessible interaction, or tracked-hand pinch and poke.
- Unity. Scene `Assets/WorstDateEver/Scenes/BedroomDesktop.unity` for Editor Play Mode and `BedroomQuest.unity` for the Quest build. The handoff preserves the existing Meta camera rig and builds the date set under a new scene root. In **Worst Date Ever**, **Refresh First Date Art** updates the references to existing models and shaders, and **Verify First Date Fixtures** runs the shared scenarios.
- In either client, use **Centralizar assento** to align the table to your current head pose. Desktop recenter is **R**.
- Update Unity’s copy of the shared catalogs with `node tools/sync-date-content.mjs` after editing `content/shared/`. Run `npm test` after changing gameplay data.

## Voice

The choice path is available without a backend. For voice, start `npm run date:voice` and set server-side `OPENAI_API_KEY`, `DATE_STT_MODEL`, `DATE_DIALOGUE_MODEL` and the comma-separated `DATE_ALLOWED_ORIGINS`. Voice uses pt-BR transcription and the shared reply allowlists. Browser builds can use `VITE_DATE_VOICE_URL` to point at the service. A same-origin reverse proxy can forward **/v1/date/session** and **/v1/voice/session/** to the service and preserve the WebSocket upgrade. Unity accepts an HTTPS URL in `Assets/WorstDateEver/Resources/FirstDate/VoiceEndpoint.json` with a single `url` field. The client configuration contains the service URL only.

The in-world microphone option shows the consent text before it starts recording. After consent, use the microphone control to start and stop, or press **A** on the right controller to start and again to send. **V** toggles recording on desktop. The browser panel shows the live microphone level. A turn is capped at ten seconds and the service holds PCM only while processing the request. Disable the microphone from the same world-space panel.

For a local voice test, install `faster-whisper` in a Python environment and run `python tools/local-date-whisper.py --port 8788`. Start the date service with `DATE_WHISPER_URL=http://127.0.0.1:8788` and either `DEEPSEEK_API_KEY` for DeepSeek Flash or `DATE_GEMMA_URL` for a llama.cpp server running Gemma. DeepSeek receives the transcript and date context after transcription runs locally. Keep the API key in the server environment.

The browser can read the dates' lines aloud. Tap the dialogue caption or press **T** to replay it. To run the speech synthesizer, install `piper-tts` and `kokoro-onnx` in a local Python environment and run `python tools/local-date-tts.py --voices /path/to/models`. Set `DATE_TTS_URL=http://127.0.0.1:8784` on the date service. Caio uses Piper Cadu, Rafa uses Piper Faber, and Bia and Luiza use two pt-BR Kokoro styles built from Dora. The directory needs the two Piper ONNX files and their companion JSON files plus `kokoro-v1.0.int8.onnx` and `voices-v1.0.bin`.

DeepSeek Flash receives a validated snapshot of the current timed event, nearby NPC activities and needs, and objects the player is holding. The game supplies relationship changes and recent interaction history. Model replies remain dialogue.

## Art evidence

`assets/style-baseline.json`, `assets/asset-inventory.csv` and `assets/provenance.csv` reference the working project and the views captured from the bedroom. The baseline awaits art-owner sign-off. The optional render worker takes GLB, glTF or FBX and generates six studio views and a geometry audit. For an in-scene comparison, pass a reviewed .blend venue with an active camera and an empty named **DateAssetAnchor**.

```sh
blender -b -t 4 --python-exit-code 1 -P tools/render-date-asset.py -- \
  --asset public/assets/bedroom/Characters/Rafa.glb --output /tmp/rafa-review
```

The vision runner accepts a manifest containing `assetId`, `assetRole`, `assetPath`, `baseline`, `audit`, a `views` map and optional `humanReview`. An approved baseline and a dated `DATE_VISION_MODEL` snapshot are required before the runner attaches images. Run `node server/src/asset-eval/evaluate.mjs review.json reports/` to validate and persist a report.

## Verification

See the [relatório de testes de interação](../../docs/interaction-tests.md) for the completed checks on picking up and releasing the table props.

The browser preview accepts **?venueMetrics** and exposes `firstDateMetrics()` while the venue is active. It reports observed frame intervals and render counts. The Unity venue contains **FirstDateFrameMetrics**. Enable its **Sample** field with Unity Frame Timing Stats enabled to inspect CPU and GPU timing through the component. Quest standalone perf, hardware recording and art-owner approval remain open in the physical acceptance checklist.
