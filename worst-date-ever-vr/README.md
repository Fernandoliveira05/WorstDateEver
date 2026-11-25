# Worst Date Ever VR — Prototype

The A-Frame edition runs in a browser. The Unity edition lives in [unity/](unity/) as a separate project. The browser assets come from the furnished Unity bedroom and its surrounding neighborhood.

## Run the browser edition

```sh
npm install --allow-git=all
npm run dev
npm test
npm run build
```

Vite serves the development edition at `http://localhost:5173`. For Quest Browser, serve the generated `dist/` over HTTPS and select **Enter VR**. The browser needs WebXR and hand tracking or compatible controllers. The bedroom dating app’s microphone uses the browser’s Portuguese speech recognition when available, with question buttons as a fallback.

| Action | Desktop | Headset |
| --- | --- | --- |
| Look and move | Drag and use WASD | Look around and use the left thumbstick when using controllers |
| Pick up or throw | Hold and release right click | Pinch or use the controller grip |
| Tap or swipe the phone | Left click or drag | Touch with the index finger or use the trigger and ray |
| Read the phone at close range | **Ler celular** or Q | Pick up the phone |
| Change the window time | **Mudar horário** or N | **Janela** on the iClona home screen |
| Find a misplaced phone | R | Phone automatically returns after falling outside the room |

The iClona launcher opens **Deu Ruim**. Matching, the time skip, outfit selection, and the ending use browser-local saves. The original game’s dialogue, props, and scenery are in Portuguese.

When you finish preparing, **Partir** opens the first date. The [relatório de testes de interação](../docs/testes-de-interacao.md) records the checks for grabbing, releasing and colliding with objects. See the [First Date preview guide](specs/002-vr-first-date/implementation.md) for the voice service.

During the date, free pt-BR voice conversation is the primary interaction. The server keeps a bounded summary of facts, topics and contradictions, and the character can initiate a short conversational move after a natural pause. Authored choices remain available for concrete world actions and as an offline microphone fallback. The Event Director checks rare, contextual opportunities after the opening conversation; it validates persona, venue, elapsed time, cooldown, prior events and relationship state before starting any implemented scene event. Manual acceptance coverage is in [testes de conversa livre e eventos](../docs/testes-conversa-livre-eventos.md).

### Local voice setup

```sh
cp .env.example .env
# Edit .env and replace GEMINI_API_KEY with the key from Google AI Studio.
npm run date:voice
```

Keep that terminal open, then run `npm run dev` in a second terminal. Vite proxies `/v1` and its WebSocket upgrade to the date service on port `8787`. Check `http://localhost:5173/health`: `{"ok":true}` means the provider is configured. The first press of **Falar livremente** records consent; press it again to start and once more to send. The key must stay server-side and must never use a `VITE_` prefix.

## Browser scene assets

- `public/assets/bedroom/scene.glb.gz` and `scene.json` contain the exported models, materials, colliders, and motion paths. Artwork and character models are included locally beside them.
- `src/` contains the A-Frame entry point, WebXR inputs, Cannon physics, handset UI, scenery shaders, and avatar. The Unity light pools are baked into the scene; live shadows are rendered by Three.js.
- `tools/ExportWebBedroom.cs` is a Unity Pipeline script outside the Unity project. It can regenerate the browser assets from the saved desktop bedroom in Edit Mode. It leaves the saved Unity scenes and source assets intact.
- Model and texture credits are in [public/assets/bedroom](public/assets/bedroom). Feature specs are in [specs](specs/).

Desktop Chromium is used for automated smoke tests. The physical Quest 3 is needed to verify hand input, microphone support, and frame rate in the headset.
