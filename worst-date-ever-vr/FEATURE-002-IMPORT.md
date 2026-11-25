# Worst Date Ever VR — First Date Feature 002 Patch

This patch extends the prior bedroom feature without replacing your current art style or imported models. Merge the patch at the root of your **current** game repository. Never copy old scene-001 source over modified files in your working project.

## Included
- `specs/002-vr-first-date/`: feature spec, architecture plan, tasks, art inheritance rule, asset-generation quality evaluator, sourcing workflow, prompt contract, data model, research, quickstart, acceptance QA, JSON schemas, synthetic evaluator report.
- `content/shared/`: four match-to-venue config records, original fictional personas and authored random events.
- `src/date/`: platform-independent reference state machine/event director for browser and Unity parity tests.
- `server/src/asset-eval/`: injectable vision-model adapter (backend-only), **not a configured provider**.
- `tools/asset-quality-gate.mjs`: deterministic quality report gate; it cannot score image appearance by itself.
- `assets/*.template.*`: deliberately incomplete current-style baseline and provenance templates.
- `tests/date-feature.test.mjs`: reference unit tests. Run `node --test tests/*.test.mjs`.

## Mandatory interpretation
The actual newest project models and prop styles are not included in the earlier bedroom starter archive. An executor must examine your REAL current assets, build baseline evidence, reuse those shapes/materials, and only borrow Job Simulator's physical interaction readability. No unreviewed auto-generated prop/model may ship.

## Not implemented by this patch
Actual restaurant/café/bar Unity prefabs and browser A-Frame scene; NPC animations/models and venue meshes; Quest mic capturing; STT/LLM/TTS server; Blender turntable pipeline; deployed vision-model integration; Quest on-device QA. All have numbered tasks. This is a specification + reusable reference scaffolding, not a completed second game scene.
