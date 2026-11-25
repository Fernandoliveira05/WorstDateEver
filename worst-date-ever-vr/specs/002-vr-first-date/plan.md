# Implementation Plan 002 — First Date VR

**Implementation status:** Planned. **Single source of gameplay content:** JSON catalogs in `content/`. **First implementation target:** sushi, then shared presets café/bistro/bar. **Art mandate:** inherit existing project style and asset families; Job Simulator is a readability/interaction influence, never a replacement art direction.

## Architectural decision
Keep BOTH a native **Unity 6 (Quest 3 Android/OpenXR)** build and a **WebXR/A-Frame (Quest Browser HTTPS)** build, but avoid duplicated dialogue business logic. Their rendering, input, navigation and microphone capture are platform-specific. Their content IDs, event definitions, persona constraints, game-session contract, dialogue gateway and contract tests are shared. The backend is authoritative for conversation turn ordering and event/action validation; the client remains authoritative for local physical interaction rendering and comfort.

```text
Bedroom 001 EXIT  ──> validated scene-handoff contract
                              |
                         Scene coordinator
                      /                     \
   WebXR (A-Frame/Three.js)             Unity (Android/OpenXR)
   • WebXR XR origin/rays/grabs         • XR Origin/Interaction Toolkit
   • GLB/glTF + AnimationMixer         • Prefabs/Animator/NavMesh agents
   • getUserMedia + AudioWorklet        • RECORD_AUDIO + Microphone.Start
   • WebAudio positional sound         • Unity spatial AudioSource
                      \                     /
                       Shared content + schema
                        (persona/venue/events)
                                |
                  HTTPS/WSS Voice Session Gateway
                       |        |           |
                   Audio STT  Dialogue LLM    TTS (optional)
                       |        |           |
                    turn text + safe intents + audio reference
                                |
                  in-game captions, NPC gestures, event effects
```

**Avoid a false promise of code-sharing between C# and JS:** domain state and policies live as versioned JSON, server logic and conformance fixtures; client adapters implement common behavior contract, not a cross-engine executable game library. Gameplay event seeds and event IDs are synchronized via authoritative session record.

## Asset generation, evaluation and approval architecture

Before implementation, inspect the **actual working project** and register at least three approved baseline props, one character, and one environment screenshot (when available), together with their material, scale, rig and interaction conventions. Existing baseline assets outrank any external style reference. Do not set a new global palette or replace existing model types. The bedroom starter repository may not contain the team's latest meshes; if baseline evidence is missing, mark asset generation **blocked awaiting baseline**, not style-approved.

```text
Approved in-project assets/screenshots ──> versioned StyleBaseline
                                               |
  Existing asset / generated model ──> staging + 6-view renders + in-scene sample
                                               |
                     +-------------------------+----------------------+
                     |                                                |
             Visual Judge (VLM)                              Mesh/rig/licensing audit
             • match OUR style                                • scale, mesh health, collider
             • VR silhouette/readability                      • materials/rig/anchors, metadata
             • visible rendering defects                      • platform budget and provenance
             • Job Simulator feel = minor guidance            • separate Quest-device perf proof
                     |                                                |
                     +-------------------------+----------------------+
                                               |
                                      Quality Gate / Report
                              reject | revise | human review | approve
                                               |
                              approved asset registry -> Web GLB / Unity prefab
```

The visual judge is a server/offline build-step model, NOT an in-game Quest runtime model. It receives only authorized previews, pinned baseline references and rubric; a `VisualJudge` adapter allows changing providers. Do not ask the model to infer invisible topology or Quest framerate from screenshots. Those belong to deterministic tools and on-device measurements. See `asset-evaluator.md` and `contracts/asset-evaluation.schema.json`.

## Core modules and responsibilities
| Module | WebXR path | Unity path | Shared behavior |
|---|---|---|---|
| `DateSceneCoordinator` | `src/date/scene-coordinator.mjs` | `Assets/Scripts/Date/DateSceneCoordinator.cs` | Validates `SceneHandoff`; fade/cut/restore, phase guards |
| `VenueFactory` | A-Frame template + glTF extras | Scene prefab + additive decor prefabs | Load `content/venues.json`; matched venue identity |
| `AmbientDirector` | Lightweight waypoint FSM, pooled glTF | NavMesh agents + animation pooling | Daily loop timeline, budgets, seating/doors/restroom behavior |
| `DateActor` | glTF skinned mesh + animation states | Animator + head-look rig | enter/approach/greet/sit/talk; animation IDs |
| `PropInteractions` | 6DoF near grab adapter + ray fallback | XR Interaction Toolkit Interactables | Stable interactable IDs and typed game actions |
| `EventDirector` | Client effect presentation | Client effect presentation | Deterministic event scheduling and consequences |
| `VoiceInputAdapter` | `getUserMedia` + AudioWorklet | Android permission + `Microphone` | PTT → audio frames; negotiated PCM16 mono; cancel/retry |
| `DialogueClient` | `WebSocket` | C# WebSocket or transport library | Same `voice-session-v1` wire contract and turn IDs |
| `NpcOutput` | on-screen 3D captions + positional audio | TMPro world captions + AudioSource | validated reply, gestures, optional TTS, failover |
| `PrivacyUI` | in-world consent/mute panel | in-world consent/mute panel | never transmit before consent, visible indicator |
| `AssetEvaluator` (offline CI/build tool) | reviews GLB/scene previews | reviews prefab/FBX/scene previews | compares EXISTING approved style, checks mesh/colliders/rights/performance, blocks unapproved merges |

## Protocol sequence — P0 press-to-talk
1. Player selects in-world **Use Microphone**; browser requests permission, or Unity requests Android `RECORD_AUDIO`; denied/unsupported => text/choice mode.
2. Client obtains ephemeral server session credential over HTTPS (not a provider API key), then opens WSS to `/v1/voice/session/{sessionId}`.
3. Player holds PTT; client emits `audio.start` with `turnId` and negotiated format (e.g. mono PCM signed 16-bit, 16 kHz target), buffers/captures headset mic. A device may expose 48 kHz: resample safely; do not assume requested sample rate is honored.
4. Client sends bounded `audio.chunk` binary messages and releases button ⇒ `audio.end`. UI displays **transcribing**. A short silent clip returns retry without LLM call.
5. Server performs STT; sends `transcript.final` with recognized pt-BR text (may emit partial caption before final). Server synthesizes minimal approved context: matched persona, latest player utterance, game phase, relationship metrics, last few dialogue turns, recent event summaries and substance effect tag.
6. Server calls dialogue model with strict schema and time/budget limits. Server validates returned `npc.text`, `emotion`, `animation`, `intent`, `relationshipDelta`, `suggestedEventId` against allowlists. Invalid commands are discarded; fallback line is provided.
7. `npc.reply` returns immediately when text is ready; client displays subtitles, plays optional TTS stream/clip, starts restrained gestures; date actor enters `speaking` then `listening`.
8. Cancellation increments turn epoch. Late STT/LLM/TTS results carry older `turnId` and are ignored. Speaker lock prevents ambient event from stealing center stage during opening line or transition.

Use backend STT rather than Web Speech API, which is not a reliable cross-platform production API. P1 hands-free VAD and interruption should not block P0 launch. Choose provider by cost/locale/latency after on-device evaluation. Server may optionally use realtime transcription APIs; vendor-specific field names are isolated to adapters.

## Local VR comfort and blocking
- Spawn uses anchored table position with a seating calibration widget. **Tracking camera must remain controlled exclusively by HMD.** Configure XR origin to place player at seat height depending on player seated/standing mode. Do not parent HMD to an NPC chair animation or tween the camera.
- Scene transition: full-screen comfort fade (100–250 ms configurable) → switch world/origin → fade up. Date NPC is animated, player isn't.
- Avoid forcing player to stand or reach far. Interactable objects 0.25–0.65 m from seated center where feasible; ray/reposition alternative for anything farther.
- No autopilot locomotion or moving-camera cutscene. If emergency navigation needed, offer discrete teleport, not smooth forced movement.

## Ambient world implementation
World has a **foreground zone** (player table/date) and **background zones** (entrance, cashier, service counter, other tables, bathroom corridor). Designer-authored waypoint graph/Unity NavMesh share **semantic station names** rather than identical coordinates. Ambient schedule examples: `waiter_01: kitchen → guest_table_02 → service_counter`, `guest_03: table_03 → restroom → table_03`. At least one meaningful loop during player wait phase; continue quieter during conversation. Keep agents from entering 1.2m clearance in front of player unless event targets table. Separate light-weight head-look and idle animation from path solver; limit concurrent path updates and expensive skin meshes.

## Arrival choreography
`WAITING` (2–8 s scripted; ambient in progress) → entrance cue → `APPROACHING` (walking + soft obstacle avoidance) → `GREETING` (line/gesture) → `SITTING` (stop navigation, align to chair anchor, play animation) → `ACTIVE_DIALOGUE` (auto opening line after seated). A timed recovery route is needed if entrance path is obstructed; after 8 s timeout, complete a fade/occlusion-safe position swap so scene doesn't deadlock.

## Event director and AI relationship
`EventDirector` draws from venue whitelist at cooldown ≥45 s, at most one major event active; it may create a **reaction prompt** but scene mutations stay deterministic. An event state machine must support `announce → animate → choice_window → resolve → cooldown` with interruption queue. NPC dialogue includes the active event summary (e.g. `"waiter spilled water on menu; player helped"`), never arbitrary game object references. `suggestedEventId` from LLM is only a request, validated against eligibility and queued by director. Serialize event RNG seed and completed IDs to support replay/test reproduction.

## Persona/AI implementation
Each fictional persona has ID, bio, limits, desires, contradiction, topic list, conversational attitude, voice performance tags, allowed relationship thresholds and 3 approved openings. LLM persona prompt (`npc-prompt.md`) constrains output to pt-BR, 1–3 concise spoken sentences, responsive follow-up, no out-of-character model mention. Character is intentionally flawed but not unlimited toxicity. Player can direct topic changes, praise/criticize, order food or comment on events. Date may react with snark, discomfort, warmth, embarrassment or decide to end date. **No direct motor commands generated by model**; clients interpret only enums, e.g. `gesture=shrug`.

## State, network and resilience
- Client retains minimal `DateSession` state locally; server knows authoritative `turnSequence`, moderated transcript excerpts and relationship metrics while session active.
- Client may always switch to deterministic authored text/choice mode if mic permission is refused, network fails, or budget exhausted. The date actor animates these fallback lines just like AI speech.
- On reconnect: restore active date from cached `DateSession`, query backend last committed turn, cancel in-flight turns, replay only completed event resolutions (not raw audio). Never replay TTS twice after reconnect.
- No raw audio persistent storage by default. Display privacy notice, provider processing disclosure, explicit consent and stop-mic toggle. Debug logs redact transcript/player IDs by default.
- Server injects persona facts and structured event context, but treats all player speech as untrusted input. Only signed session owner can submit audio/actions, with per-session caps.

## Proposed repository structure (create during implementation)
```text
content/shared/personas.json                 # canonical persona IDs and constraints
content/shared/venues.json                  # venue presets, scene maps
content/shared/events.json                  # event pool and resolver definitions
shared/contracts/*.json                     # portable schema copies
src/date/{scene,ambient,date-actor,event,props,voice,dialogue}.mjs
unity/WorstDateEver/Assets/Date/{Scenes,Prefabs,Materials,Models,Audio,Scripts}/
server/src/{session,voice,stt,dialogue,tts,policy,events}/
tests/contracts/ tests/simulation/ tests/web/ tests/unity/
assets/provenance.csv                        # license, source, transform, credit, approval
assets/style-baseline.json                   # extracted/pinned refs from ACTUAL project assets
assets/evaluations/{assetId}-{hash}.json     # VLM + static + device evidence
server/src/asset-eval/{visual-judge,mesh-audit,quality-gate}/
tools/render-asset-turntable.*               # 6 views + in-scene context
specs/002-vr-first-date/asset-evaluator.md  # rubric and judgment model contract
```

## Implementation phases
1. **P0 integration:** validate 001 handoff, construct one sushi venue blockout, seated cut, event FSM, scripted date arrival.
2. **P0 style baseline/evaluator:** inventory and reuse the team's CURRENT models/materials; pin approved exemplars, configure the VLM evaluator, static mesh checks and human-review gate, calibrate rubric before any new prop import.
3. **P0 visual shell:** reuse baseline assets, generate/modify only missing props in the SAME style (Job Simulator-inspired usability only), run evaluator gate, skin/render the scene, route 4 patrons + waiter + restroom; benchmark Quest.
4. **P0 voice:** build mic input adapters and permission UI independently; prove captured audio in Quest Browser immersive and Unity APK on physical Quest 3 before connecting LLM.
5. **P0 dialogue:** backend STT→validated LLM→captions (+ simple TTS), persona gateway, test loss/latency/perms; interactive conversation in both runtimes.
6. **P0 event integration:** waiter spill and other authored reactions, interactive props, NPC memory consequences; no LLM direct physics mutation.
7. **P1 presets and polish:** three venue variants, NPC expressions, additional events, soundscapes, partial gestures, optional VAD, profiling/accessibility/content review.

## Technical risks and explicit spikes
| Risk | Mitigation / required proof |
|---|---|
| Quest Browser mic capture **inside immersive WebXR** varies by browser version | Mandatory 1-day early spike: request mic before and inside immersive session, record/stop, verify audio, permission recovery. Do not claim proven until hardware test. |
| Unity audio clip capture may have high/variable latency | Ring buffer, sample conversion off render thread, verify timing on device. |
| Ambient density + skinned actors consumes Quest frametime | Low-poly optimized meshes, shared materials, baked lights, sprite/pose LOD, limited agents; profile both runtimes. |
| LLM response causes awkward silence | Captions immediately, low-latency/streamed gateway, one authored filler line and timeout fallback, measure p95. |
| AI loses persona/authorizes bad scene actions | Structured JSON output with server validator; deterministic event owner; transcript state tests. |
| Art direction drift despite an established style | Existing asset inventory and versioned project baseline take precedence; VLM comparison + technical gate + human review. No arbitrary new palette/pack. |
| Vision model approves unusable mesh | Deterministic mesh/rig/scale/collider/license/Quest gates override VLM and fail closed. |
| Network/STT costs | PTT limits, token caps, budget controls, mock backend, text-only mode. |

## Exit criteria / QA
Conformance tests for `SceneHandoff`, `VoiceTurn`, `NpcReply`, `WorldEvent`; simulated ambient visits; date sit anchor tests; mic permission denied path; background sound rejection; stop mic on app pause; network interruption; bilingual speech regressions; Quest 3 seated comfort and frametime; baseline-driven vision-model evaluation, auditable model/prop reports, and asset gate tests. See `checklists/acceptance.md`.
