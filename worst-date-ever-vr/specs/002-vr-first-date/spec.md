# Feature Specification 002 — First Date: Living Venue + Voice-Driven NPC

**Game:** Worst Date Ever VR | **Status:** SPECIFIED, NOT IMPLEMENTED | **Updated:** 2026-11-24
**Depends on:** `specs/001-vr-bedroom` | **Platforms:** Quest 3 standalone Unity/OpenXR and Quest Browser WebXR/A-Frame | **Content language:** pt-BR

## Product goal
After the bedroom prologue, hard-cut directly to the selected match's establishment. The player is **already seated**, waiting at a table. The world is active: customers talk and cross the room, a waiter serves other guests, people use the bathroom, and small comedic incidents occur. The date enters through the door, approaches and sits opposite the player, then engages in spontaneous, personality-consistent **spoken** conversation. The Quest 3 microphone is used to obtain voice input in both native Unity and browser editions; speech is transcribed before being sent to the date's LLM controller. The player must feel physically present in an absurd, stylized VR comedy, not inside a static chat UI.

## Non-negotiable style inheritance and asset-quality gate
**The project ALREADY has an established art style, model types, props, scale rules and material conventions. Preserve them.** The executor MUST inspect the CURRENT repository and build an approved style baseline from the project's existing models, props, screenshots, textures, rigs, materials and prefabs before generating or importing anything for the venue. The available bedroom prototype contains procedural stand-ins, and **must not be treated as the definitive style bible** if the user's working repository has evolved.

*Job Simulator* is a **secondary approximation target** for tactile VR interaction, oversized readable affordances, clear silhouettes and comic physical feedback, **not permission to replace our current asset aesthetic, palette, topology, rig design, shading, proportions or prop families**. *Accounting+* is a comedy/timing reference only. The asset generator should generate or adapt **more of our existing style**, with modest Job Simulator-like readability; never change the game's visual identity to match either reference. Do not copy protected game assets.

**Every generated or sourced model/prop MUST pass a dedicated AI-assisted Model/Prop Evaluator BEFORE merging to production.** A vision-capable judge compares multi-view renders to approved in-project exemplars and explains style/readability defects. Independent mesh/rig/scale/collider/license checks and Quest 3 profiling provide objective evidence. This is a gate, not a fully autonomous final authority: borderline/high-impact assets require human sign-off. See `art-direction.md`, `asset-evaluator.md`, `asset-sourcing.md` and `contracts/asset-evaluation.schema.json`.

## Entry contract from scene 001
`phase == "exit"`, `matchId` is one of `caio|rafa|bia|luiza`, `substance` one of `none|weed|lsd|alcohol`. `dmt` is an ending in scene 001: **must not start a date**. Carry `avatarGender` and `preference` unchanged. Invalid state returns to a recoverable prologue screen, not a blank venue. Each client maps `matchId` to an identical `venueId` and `personaId`. No avatar gender restrictions on matches or scripted dialogue.

## Venue mapping — keep bedroom catalog IDs
| Match | Archetype | Venue preset | In-world setting | Opening flavor |
|---|---|---|---|---|
| `caio` | Esquerdomacho | `cafe` | Bright neighborhood café, morning | Books, kombucha, verbose earnestness |
| `rafa` | Menzinho | `sushi` | Stylized Japanese restaurant, night | Cars, finance, dating bravado, unresolved ex |
| `bia` | Paty | `bistro` | Satirical upscale bistro inspired by the plan's Paris 6 note | Social media, gossip, trends |
| `luiza` | Boiadeira | `bar` | Country-flavored casual bar | Rodeo, horses, sertanejo, extroversion |

The original plan uses the specific location “Paris 6” for the Paty. For the MVP, use a **fictional bistro identity** rather than reproducing third-party branding or venue trade dress without clearance. Build the same modular establishment shell first, swapping decor, food, signage, lighting and ambient audio by preset. The selected venue MUST match the selected NPC.

## Player experience / story beats
1. At the end of bedroom phase 001, fade world to black, switch scenes while black, spawn a seated XR-origin at the table; fade in. **No simulated vehicle ride or moving camera**.
2. The player can glance around and touch reachable props, while guests walk, a waiter delivers food at another table, and one background patron travels to/from the bathroom. The date's seat is empty.
3. A diegetic clock / server line conveys brief waiting time. After a controlled delay, the front-door cue signals the date's arrival. The date follows a path to the player's table, performs a greeting animation, **sits opposite**, or gracefully teleports into place behind a brief occlusion if pathing is blocked.
4. After sitting, the date says an opening line in pt-BR. The first mic-use prompt explains voice transmission and offers **Enable microphone / Play with text choices**. No recording begins without explicit action and system permission.
5. Press-to-talk is the P0 voice control: hold assigned controller button, speak naturally, release; transcript finalizes; server feeds the NPC persona, relational state, recent events and context to the LLM. Caption shows what was heard and the NPC's reply. The NPC answers with generated text + optional TTS and expressive animation.
6. Waiter/background events occur as deterministic or seeded-random authored beats. The player can react physically (e.g. move a glass, catch a dropped menu), verbally, or choose from accessible options. Events can affect dialogue, trust and embarrassment. The date remembers *approved event summaries*.
7. Finish with a brief date outcome (`good|awkward|disaster`), preserving scene-003 handoff hook; the police/breathalyzer, later horror sequences and locomotion to another venue are out of scope.

## User stories and acceptance scenarios
### US1 P0 — Seated arrival
- Given a valid scene-001 exit, when the scene is loaded, then the player appears **already seated** at the chosen venue with an empty chair opposite; no moving-camera transition.
- Given a standing or seated real-world user, when comfort mode is selected, then table, objects and NPC eye level are correctly aligned via XR origin adjustment, not forced tracking-camera pose.
- Given `dmt` or missing match ID, when transition is attempted, then it is rejected with a recoverable state.

### US2 P0 — Lively establishment
- Within the first 30 seconds after fade-in, at least one waiter and three other patrons are visible/audible in natural, non-repeating behaviors.
- One waiter services a **different** table and returns to a service point; one guest travels to the bathroom and returns, opening/closing the bathroom door appropriately.
- Ambient NPC movement uses reserved paths, avoids clipping through the player's table/date chair, respects event interruption locks and works without server connectivity.
- From the seated viewpoint, there are at least three readable background behavior types: eating/talking, walking, and serving.

### US3 P0 — Date arrival, seating and personality
- While waiting, NPC arrives at the entrance and proceeds to the correct seat, pauses, greets, sits, and turns toward player's tracked head position (with restrained eye/neck motion).
- Selected NPC identity, pronouns, venue, biography, voice style and opening line are loaded from a versioned persona catalog.
- Date arrival occurs once; reentering/reloading must not duplicate the NPC or restart an already active conversation unless restarted intentionally.

### US4 P0 — Microphone → STT → AI → response on BOTH clients
- Browser: HTTPS Quest Browser uses `navigator.mediaDevices.getUserMedia({audio:true})` **only after an explicit user action**, subject to browser permission/support. Unity Android Quest uses `RECORD_AUDIO` runtime permission and Unity microphone capture. Real headset compatibility is an acceptance test, not an assumed guarantee.
- Both clients use one canonical `VoiceTurn` protocol and game-session ID. P0 supports push-to-talk, silence detection on release, recognition for pt-BR, captions, and text/choice fallback.
- No provider secrets are embedded in Unity APK, browser JS or assets. STT → bounded dialogue gateway → structured LLM reply → optional TTS runs through authenticated server adapters.
- The date talks as its persona, recalls selected events, but never directly commands arbitrary scene transformations. Server validates allowed dialogue intents and game actions.
- Permission denied, offline, speech timeout, empty transcription, malformed model output and service throttling produce friendly **in-world** fallback; date interaction remains completable without microphone.

### US5 P0 — Random authored comedy and player actions
- The event director schedules a first harmless beat and then seeded-weighted events; never fires two major beats simultaneously, never fires while date is moving to chair, and never overrides essential dialogue.
- MVP event pool includes waiter spills water near table, mistaken order/food, loud guest interruption, bathroom-door mishap, dropped menu, awkward friend recognition. Venue-specific events extend it.
- Objects with gameplay meaning are grabbable with near-hand controllers; distant pointer/trigger accessibility remains available. The waiter visibly reacts to a spill, NPC comments on it, and the player can choose a response.
- If a player behaves aggressively, the game produces stylized non-graphic reactions and possible social consequences; violence is neither required nor rewarded as the only route.
- The event director owns physics/spawn/event consequences; LLM only supplies constrained reactions, never originates unchecked physics instructions.

### US6 P1 — More nuanced conversation
- Optional hands-free VAD, interruptions/barge-in, synchronized mouth animation and spatial TTS after push-to-talk pipeline is stable.
- Speech pace and facial expressions vary with `interest`, `awkwardness`, `patience`, `safety` in bounded state.
- TTS disabled, accessibility captions enabled and all controls stay playable.

### US7 P0 — Existing-style continuity and model/prop evaluation
- All scene assets are matched to the CURRENT project art baseline, not a newly invented palette, style or asset pack. A repository inventory identifies reusable existing props/models before any new asset is made.
- Generated/sourced objects submit source metadata, scale, collider/anchors, poly/material/texture metrics, multi-view preview images, and in-scene Quest-context renders to the `AssetEvaluator`.
- Vision-based style judge compares against **approved existing project exemplars**. Deterministic validation independently checks technical and licensing constraints. The asset is blocked on hard failures; marginal assets are escalated to human review; no unreviewed generated asset silently ships.
- Single base venue is fully functional for P0. All four matched venue presets, décor and menu themes are P1 and must still maintain the established shared visual language. No copied Job Simulator/Accounting+ assets or likenesses.

## Functional requirements
- **FR-001** Scene transition is an instantaneous cut under a comfort fade; seated origin is stable, no artificial camera motion.
- **FR-002** Venue selection is **data-driven by matched profile**, immutable for session.
- **FR-003** Four venue presets share an interchangeable modular shell and a `VenueConfig` manifest.
- **FR-004** Background agents have deterministic schedules (`serviceTable`, `bathroom`, `idleChat`, `exit`) with navigation/pathing constraints and animation LOD.
- **FR-005** Date NPC has distinct enter → approach → greet → sit → speak states; always sit before sustained dialogue.
- **FR-006** Browser/Unity implement `IAudioCapture`, `IInteractionInput`, `INpcPresentation`, `IWorldEvents` platform adapters; remote backend contract is shared.
- **FR-007** Press-to-talk is default. Mic consent + OS permission are mandatory, with onscreen/world-space transmission indicator and mute/stop control.
- **FR-008** Player voice is captured as PCM audio (negotiated stream format), transmitted over protected channel and transcribed server-side to pt-BR text; never rely solely on browser-native speech recognition.
- **FR-009** AI reply is JSON-schema-validated, persona-grounded, length-bounded, content-filtered and mapped to whitelisted animation/intent enums.
- **FR-010** Single audio turn can be cancelled; stale response IDs must never overwrite a later turn.
- **FR-011** Conversation transcript and game state are scoped to session, bounded, saved under privacy rules; raw mic audio is not stored by default.
- **FR-012** Each major event has trigger, cooldown, presentation, player choices, NPC response, consequence and testable resolver.
- **FR-013** Audio and text fallbacks enable completion with mic denial/no Internet/LLM failure.
- **FR-014** Maintain the existing project's art/prop/model/rig/material style. The executor must first produce a versioned `StyleBaseline` referencing ACTUAL approved project assets. Only improve Job Simulator-like VR readability/interactability within that style; do not impose a different default palette or pack.
- **FR-014A** Every generated or sourced prop/model requires a model-assisted quality evaluation (multi-view comparison against baseline) PLUS deterministic geometry/collider/performance/provenance checks. Gate outcomes: `approved`, `needs_revision`, `human_review`, `rejected`; shipping requires `approved` and applicable human sign-off.
- **FR-015** Outputs must be platform-parity tested on Quest 3 WebXR and Quest 3 Unity Android builds.
- **FR-016** Scene effects based on bedroom substance choice are optional, VR-comfort-safe and not a simulation of pharmacological dosing or guidance. P0 can use only benign dialogue/interaction tags.
- **FR-017** Optional safety/content warning and accessible skip/quit controls remain functional during every event.

## Nonfunctional requirements / targets (verify on actual Quest 3)
- **Performance:** target stable ≥72 Hz and assess 90 Hz where feasible; measure GPU/CPU frametime, draw calls, animation count, memory, audio latency and thermal behavior per build. Targets are NOT claims of achieved performance.
- **Voice:** target under 4 seconds from PTT release to first visible NPC text response at median on a good network, with a conspicuous speaking/listening indicator; measure p50/p95 separately for both builds. No guarantee on cellular/congested networks.
- **Ambient:** 4–8 visible ambient patrons in initial module; 1–2 functional servers; animation/path/voice LOD, pooled agents and GPU-friendly materials. Do not overcommit a fixed density until profiling.
- **Comfort:** no forced head pose, scripted smooth locomotion, camera shake, high-frequency full-view flicker, or mandatory leaning. Keep important props within reachable/controller-rayed seated zone.
- **Accessibility:** subtitles for all date and event dialogue, visible microphone state, larger UI targets, selectable sitting/standing calibration, default no-mic mode.
- **Security/privacy:** TLS/WSS, ephemeral session tokens, request budgets, voice permissions, no raw voice retention by default, opt-in diagnostics; protect LLM prompt against user attempts to invoke unauthorized scene commands.

## Definition of done
All P0 scenarios above pass on both target runtimes; one complete venue can be played from bedroom handoff to outcome with spoken turns and fallbacks, remaining three presets show correct environment and date, random event deterministic tests pass, art/asset gates pass, on-device performance and consent QA results are recorded. **This package is a specification, not a claim that the scene has already been built.**

## Asset evaluator acceptance criteria (P0)
1. Given a model with inconsistent materials/silhouette compared with **approved in-project exemplars**, the visual judge returns evidence-bearing `needs_revision` or `human_review`; it must not pass simply because it looks like Job Simulator.
2. Given a visually good model with missing license provenance, invalid collider, broken mesh, unsafe draw-call cost or unattached rig, the deterministic hard gate blocks it irrespective of the vision judge's score.
3. Given 3–6 turntable images plus a photo of the model placed next to existing game props, the evaluator reports sub-scores for baseline fidelity, silhouette/VR readability, material match, semantic correctness and visible defects; missing image views do not count as a pass.
4. Given a repeated evaluation with the same asset hash, baseline version, judge model version and rubric version, results are reproducibly traced and stored. Model uncertainty produces `human_review`, not automatic acceptance.
5. Given Quest-specific GPU/memory budgets that have not yet been profiled, technical status is `pending_device_validation`, not `approved_for_shipping`.
6. A human can override a judgment with a written reason, reviewer ID, timestamp and evidence; automated content cannot self-approve.

## Scope exclusions
Police breathalyzer, driving, fully implemented LSD horror world or DMT ending, open-world travel, network multiplayer, face/body tracking, commercial licensed character likenesses, guaranteed free-form script generation of world events, and persistent user audio archives.
