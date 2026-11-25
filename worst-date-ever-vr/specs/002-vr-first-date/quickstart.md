# Implementation Quickstart for Executor — Feature 002

## First read
1. `specs/001-vr-bedroom/{spec,plan,data-model}.md` + current `src/game-machine.mjs` and `src/profiles.mjs`.
2. `specs/002-vr-first-date/{spec,plan,tasks,art-direction,asset-evaluator,asset-sourcing}.md`.
3. **Inspect the actual working repo's current models, prefabs, materials, props and screenshots.** The included 001 source may be outdated and is NOT proof of your established art style. If there is no real approved asset baseline, hold new art approval but continue graybox gameplay.

## Commands — current reference helpers only
```bash
npm test
node tools/asset-quality-gate.mjs specs/002-vr-first-date/content/example-asset-evaluation.json
```
The example asset-quality verdict intentionally fails (baseline pending). This is expected; the command exits nonzero. No VR first-date scene or real vision judge has been integrated into the web build yet.

## Recommended implementation order
1. Build `assets/style-baseline.json` with real approved exemplar paths/hashes and measured art style. Reuse props. No new style, no automatic sourcing.
2. Add `DateSceneCoordinator` to WebXR and Unity. Preserve `001` save schema. Validate `001 phase=exit`, then cut under a comfort fade into matched seated venue with vacant date chair.
3. Implement ambient NPC station graph, toilet route, waiter servicing other guests and deterministic enter/greet/sit choreography. Use real available models or graybox placeholders.
4. Wire generated-asset turntable/mesh audit + vision model adapter. Score **against our actual style**. Prevent unapproved or pending assets from entering production.
5. Spike microphone capture on physical Quest 3 in WebXR and Unity. Consent + PTT + pt-BR STT + server LLM gateway + captions; fallback text choices mandatory.
6. Connect scripted event director, physical props and outcome. Run acceptance checklist.

## Shared protocol
- `contracts/scene-handoff.schema.json`: validated bedroom save.
- `contracts/date-session.schema.json`: state/arrival/event timeline.
- `contracts/voice-turn.schema.json`: PTT binary audio + JSON control messages.
- `contracts/npc-reply.schema.json`: only allowed model actions.
- `contracts/world-event.schema.json`: allowed authored events.
- `contracts/asset-evaluation.schema.json`: quality-model report and static/device proof.

## Runtime notes
- Browser on Quest: HTTPS WebXR, user-gesture microphone permission via `getUserMedia`, actual immersive permission tests, AudioWorklet PCM or validated alternative; no provider key in JS.
- Unity Android Quest: OpenXR, XR Interaction Toolkit, `Microphone` capture, Android runtime `RECORD_AUDIO`, audio resample/encode; no provider key in APK.
- Backend receives ephemeral authenticated session and PTT audio, STT -> schema-constrained character reply -> optional TTS. Server validates game changes. Do not store raw voice by default.
- Asset evaluator is a backend/CI tool; it needs an independently configured vision-capable provider, standardized render worker, geometry audit and real Quest profilers. **This package contains interface and gate policy, not a preconfigured vision API.**

## How to import this package into existing repo
Merge `specs/002-vr-first-date/`, `content/shared/`, `src/date/`, `server/src/asset-eval/`, `tools/`, `assets/*.template.*` and `tests/date-feature.test.mjs`. Do not overwrite modified 001 scene files in your current local repo. If copying the full ZIP, review differences before merge.
