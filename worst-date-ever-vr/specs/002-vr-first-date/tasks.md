# Execution Tasks — 002 First Date VR

**Legend:** [ ] todo, [x] supporting specifications/reference helpers already authored, `P0` = first playable on Quest; `P1` = expansion. This checklist is written for the implementer. **Do not mark gameplay complete merely because this spec package exists.**

## Milestone A — Inspect existing art and wire scene 001 handoff
- [x] T001 [P0] Carry forward `caio|rafa|bia|luiza` and no-DMT handoff contract (`contracts/scene-handoff.schema.json`).
- [x] T002 [P0] Define four match-to-venue mappings (`content/shared/venues.json`).
- [ ] T003 [P0][BLOCKER FOR ART APPROVAL] Inspect ACTUAL current project assets/models, material/texture presets and prefabs; capture existing in-game renders. Produce complete `assets/style-baseline.json` from real approved assets. **Do not invent visual style.**
- [x] T004 [P0] Inventory and hash all reusable/current approved props in `assets/asset-inventory.csv`; identify what is already available before generating new assets.
- [x] T005 [P0] Integrate bedroom exit flow into `DateSceneCoordinator`: scene switch beneath comfort fade with validation, save migration and recoverable failed state.
- [ ] T006 [P0] Rig seating calibration for real seated/standing players without driving XR camera; add recenter and accessibility ray interaction.

## Milestone B — Living venue and arrival
- [ ] T007 [P0] Create `VenueConfig` scenes with the existing project's art. Implement sushi venue in full, matched café/bistro/bar in temporary style-consistent blockouts until final art passes.
- [x] T008 [P0] Author semantic stations `door_main`, `service_counter`, `guest_table_02`, `restroom`, `player_seat`, `date_seat`, and paths avoiding seated interaction zone.
- [ ] T009 [P0] Create 4–8 ambient customers with finite state behavior `idle_chat`, `eat`, `walk_restroom`, `use_restroom`, `return_table`, `leave`; animate restroom door/cues.
- [ ] T010 [P0] Add at least 1 waiter servicing OTHER clients, picking up orders and returning to counter; ensure loops and route priority.
- [ ] T011 [P0] Implement date actor states `enter -> approach -> greet -> sit -> conversation` with path fallback after obstruction; use canonical persona IDs and world-space seat anchors.
- [ ] T012 [P0] Add 3D spatial ambience: tableware, chatter, footsteps, door chime, low-VO nonverbal loops; avoid competing speech audio in STT.
- [ ] T013 [P0] Keep background NPC logic deterministic and independent of LLM/network; throttle distant animations and path queries.

## Milestone C — Preserve style, generate missing props, evaluate quality
- [ ] T014 [P0] For each missing prop/model, reuse/modify approved in-project exemplars first; prompt generators for **OUR current style**, not for generic Job Simulator 3D aesthetic. Job Simulator influence should be on interaction feel/readability only.
- [x] T015 [P0] Define `AssetEvaluator` rubric, required 6+ views, baseline comparison and human-review pathway (`asset-evaluator.md`, evaluation JSON schema).
- [x] T016 [P0] Implement reference policy gate and tests (`tools/asset-quality-gate.mjs`, `tests/date-feature.test.mjs`).
- [x] T017 [P0] Implement Blender/offline render worker: consistent turntable (front/back/left/right/top/three-quarter), in-venue comparison and mesh audit outputs.
- [ ] T018 [P0] Connect an approved multimodal vision model to `server/src/asset-eval/visual-judge.mjs` with pinned model/version, actual approved exemplar images and JSON schema validation.
- [ ] T019 [P0] Implement deterministic GLB/FBX/prefab audit, provenance/license validation, colliders, pivots/anchors, rigging and actual platform budgets. Never let model judge infer hidden geometry.
- [ ] T020 [P0] Calibrate visual thresholds on approved/poor assets; add false-pass sampling, report persistence keyed by mesh hash/baseline/version and art-lead signoff for hero models.
- [ ] T021 [P0] Instrument Quest 3 WebXR + Unity runtime asset staging, link measured performance results to gate, and reject unproven perf claims.

## Milestone D — Quest 3 microphone, STT, AI and dialogue
- [ ] T022 [P0] Browser microphone compatibility spike ON PHYSICAL QUEST 3, before and during immersive WebXR; permission denied/revoked/path tested; HTTPS origin.
- [ ] T023 [P0] Unity Quest Android microphone permission (`RECORD_AUDIO`), start/stop, audio ring buffer and app-pause recovery; proof on headset.
- [ ] T024 [P0] Build equivalent in-world consent controls, push-to-talk mapped to controller, speech activity indicator, privacy notice and mute indicator for both clients.
- [x] T025 [P0] Normalize captured audio to a negotiated PCM16 mono format; implement max duration, backpressure, resampling where needed, server binary WSS handling, session auth and anti-abuse budgets.
- [x] T026 [P0] Backend pluggable STT in pt-BR with transcription error handling, empty speech detection, timeouts and test audio assets; no raw recording persistence by default.
- [x] T027 [P0] Backend LLM persona gateway, schema-validated NPC reply, authoritative relationship state, bounded session context and server-side prompt injection safeguards.
- [ ] T028 [P0] Date NPC displays response caption, triggers allowed gestures and optional TTS/spatial voice; never allow arbitrary LLM-generated engine commands.
- [x] T029 [P0] Add text/choice fallback for mic denial/no network/STT failure, with one full conversation path playable without voice.
- [x] T030 [P0] Implement turn ID ordering, cancellation, no microphone capture when app paused/consent revoked, bounded contexts, provider key isolation and failover.

## Milestone E — Authored comedy, event director and outcomes
- [x] T031 [P0] Define initial six authored events and approved per-choice relationship outcomes (`content/shared/events.json`).
- [x] T032 [P0] Reference pure seeded scheduler and event resolver (`src/date/event-core.mjs`) with unit tests.
- [x] T033 [P0] Implement event FSM `announce -> animate -> choice_window -> resolve -> cooldown` with no duplicate major events, route interruptions or date actor conflicts.
- [ ] T034 [P0] Implement water spill, wrong order and dropped menu with object grabbing plus accessible controller ray actions and exaggerated comic reactions.
- [ ] T035 [P0] Implement restroom mishap, loud customer and awkward acquaintance; keep background customers independently active.
- [x] T036 [P0] Feed only whitelisted short event summaries into NPC context, and map player physical/choice/speech actions to bounded social consequences.
- [x] T037 [P0] Implement outcomes `good|awkward|disaster` and next scene handoff stub; do NOT implement robbery/driving/breathalyzer in this feature.

## Milestone F — Cross-client integration and release gates
- [x] T038 [P0] Integrate A-Frame/WebXR scene in current web build with actual controller direct grabbing and ray fallback. No HTML-only gameplay control.
- [ ] T039 [P0] Implement Unity Quest 3 scene/prefabs with XR Origin + XR Interaction Toolkit equivalent behavior and the exact shared protocol.
- [x] T040 [P0] Write cross-client golden fixture tests for handoff/session/voice/reply/events and failure cases.
- [x] T041 [P0] Run existing Node pure logic tests (15 passing at package authoring time).
- [ ] T042 [P0] Measure Quest 3 72 Hz performance, controller use, NPC lip/gesture UX, STT latency and permission controls separately for both builds.
- [ ] T043 [P0] Art review on actual scene with approved project models; every new/generated asset has a quality report and no hard gate failures.
- [ ] T044 [P0] Execute `checklists/acceptance.md` and sign off on-device evidence before marking first-date scene done.

## P1 follow-ups after first playable
- [ ] T045 [P1] Full themed venue variants for all four matches using existing style and evaluated generated models.
- [ ] T046 [P1] Optional VAD/barge-in + low-latency TTS voice performance and lip sync.
- [ ] T047 [P1] More authored safe absurd events, event weighting, emotional effects and optional mild drug-story tags (VR comfort review).
- [ ] T048 [P1] Content QA, localization, accessibility improvements, telemetry opt-in, creator/moderation tools and advanced LLM evaluation.

## Deliverable declaration
This ZIP delivers **specification, schemas, shared JSON content, evaluator interface, reference policy helpers and unit tests**. It does **not** deliver a fully built first-date Unity scene, a working Quest browser microphone capture implementation, pre-generated models, a connected vision provider, or validated device performance.

## Implementation evidence

The [preview guide](implementation.md) records what is available in the current A-Frame and Unity workspaces. The local preview contains the sushi venue, three themed blockouts, existing assets and the shared offline story. The asset baseline, live provider validation and Quest acceptance still need their recorded sign-offs. Optional TTS and finishing art for the alternate venues remain follow-up work.
