# Acceptance Checklist — Feature 002, Physical Quest 3

**Not executed.** Fill in device/browser/Unity build version, tester, date, evidence location and fail/pass for every numbered test. Do not mark complete until both clients meet all P0 gates.

## Entry and venue
- [ ] A01 Valid `001` exit cuts directly to matching venue, seated; there is no fade-induced moving camera; headset pose remains native tracking.
- [ ] A02 `dmt` and malformed state never load date; show recoverable fallback.
- [ ] A03 Both male/female player choices and men/women/all matching work independently.
- [ ] A04 Date seat is initially empty; match enters, navigates to player, greets, sits **once**, then dialogue begins.
- [ ] A05 Standing/seated calibration and controller ray alternative work without mandatory leaning/locomotion.

## Ambient
- [ ] B01 A waiter visibly serves other people, then returns to service station.
- [ ] B02 At least one other patron enters restroom path, uses bathroom and returns to table, without clipping.
- [ ] B03 Eating/chatting, walking, serving loops are readable from player seat, with multiple visitors and spatial sound.
- [ ] B04 Date arrival/event not blocked by wandering background people; simulation continues if disconnected.

## Microphone / dialogue — both headsets and clients
- [ ] C01 Quest 3 WebXR HTTPS: explicit mic activation works when appropriate (including immersive VR); indicator and stop control clear.
- [ ] C02 Unity APK: Android `RECORD_AUDIO` grant/deny/revoke path works; start/stop and app pause behavior verified.
- [ ] C03 Push-to-talk captures speech, finalizes pt-BR STT, displays recognized transcript then NPC caption/spatial TTS as allowed.
- [ ] C04 Correct persona and venue, short expressive response, approved emotion/gesture, causal event recall, no invented scene changes.
- [ ] C05 Permission denied, network offline, STT timeout, silence, malformed reply, service failure and cancellation fall back to a completable text/choice path.
- [ ] C06 No microphone capture before consent or after stop; no secret client key, no default raw audio retention.
- [ ] C07 Measure p50/p95 time between PTT release and NPC visible response under real Quest noise and network conditions; record measurements (target p50 < 4s, not promised).

## Props / events
- [ ] D01 Player can pick up/put down at least 3 props, interact from seat and by accessible ray, with understandable comic feedback.
- [ ] D02 Water spill, wrong order, dropped menu, loud guest, bathroom mishap and awkward acquaintance events have valid triggers, responses and cooldowns.
- [ ] D03 One major beat at a time, no event while date enters/sits, no script deadlock or repeated event after replay.
- [ ] D04 Player choices influence relationship state within bounded ranges; LLM does not own event physics.

## Art and independent generated-model QA
- [ ] E01 Executor inventories ACTUAL current project props/models/materials/screenshots; `assets/style-baseline.json` approved by art owner. Never invent a new palette as 'the current style'.
- [ ] E02 New props maintain our existing art style; Job Simulator is only an interaction/legibility target and Accounting+ an absurd-comedy reference.
- [ ] E03 Every new/generated asset has approved source/license record; images: front/back/left/right/top/three-quarter/in-scene; actual authorized exemplar images.
- [ ] E04 Visual model grader produces rubric scores, confidence and evidence; no generic 'looks good' self-approval. Review version is logged.
- [ ] E05 Static mesh/scale/rig/grab/collider/export checks and Quest 3 WebXR + Unity device metrics pass, independent of model opinion.
- [ ] E06 Asset report final verdict approved; hero/date NPCs have human sign-off; ambiguous or missing evidence is never auto-approved.

## Performance and release
- [ ] F01 Frame pacing measured on standalone Quest 3 for WebXR and Unity, targeting 72 Hz (13.9ms frame); recorded real CPU/GPU frametimes.
- [ ] F02 All important text legible at intended physical distances, no forced camera shake/motion or unsafe flicker.
- [ ] F03 001 bedroom tests pass and full 002 unit/contract/integration suite passes.
- [ ] F04 At least one full first-date session can end in a result with mic allowed AND with mic unavailable, on both clients.

### QA signoff template
Date: ______   Quest OS/firmware: ______   Quest Browser: ______   Unity build: ______   Backend build: ______
WebXR pass/failed tests: ______   Unity pass/failed tests: ______   Art lead: ______   Tech lead: ______
Evidence links: ______   Known blockers: ______   Release decision: ______
