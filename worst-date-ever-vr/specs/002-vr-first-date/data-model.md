# Data Model — First Date VR (Shared Contract)

## Cross-scene `SceneHandoff`
Keep bedroom state schema version 1, require `phase:"exit"` and selected `matchId`. Preserve player `avatarGender` and `preference` without changing match logic. Do not advance for `substance:"dmt"` or absent match. See `contracts/scene-handoff.schema.json`.

## `DateSession`
`sessionId` is unique and server-authenticated. `matchId` maps one-to-one to venue ID: `caio:cafe`, `rafa:sushi`, `bia:bistro`, `luiza:bar`. `phase` = `waiting|arriving|greeting|seating|dialogue|ending|completed`. `arrivalState` is separate to avoid duplicate date spawning. `relationship` owns bounded interest, awkwardness, patience, safety integers 0–100. `eventSeed`, completed IDs and `turnSequence` enable deterministic replay. See `contracts/date-session.schema.json`.

## `VenueConfig`
`id`, `matchId`, `daypart`, `sceneVariant`, `ambientTheme`, `entranceStation`, `bathroomStation`, `seatAnchor`, `dateSeatAnchor`. Source `content/shared/venues.json`. Semantic station names are shared; Three.js/A-Frame and Unity can use DIFFERENT native pathfinding/navmeshes and world coordinates.

## `Persona`
`id`, `archetype`, `bio`, `contradiction`, `openingLine`, `allowedGestures`, `voiceDirection`. Fictional original composite, not real-person impersonation. Language `pt-BR`. Source `content/shared/personas.json`. The persona system prompt composes this with player transcript and approved recent world events; server owns context.

## `VoiceTurn` and `NpcReply`
Client captures push-to-talk audio only after explicit user choice + platform permission. `audio.start`, binary PCM frames, `audio.end` and optional `audio.cancel`. Server sends transcript (`transcript.final`) then schema-validated `NpcReply`: persona ID, response text, `emotion`, `gesture`, `intent`, bounded relationship deltas and optional TTS reference. Every message uses session/turn ID. See `contracts/voice-turn.schema.json` and `contracts/npc-reply.schema.json`.

## `WorldEvent`
Authored definitions only. Fields include `id`, `category`, supported venues, `weight`, cooldown, prerequisites, player choices, their deltas, approved pt-BR action summaries and event summary template. Never let a model generate raw scene-mutating code, spawn instructions or arbitrary event IDs. See `contracts/world-event.schema.json` and `content/shared/events.json`.

## `StyleBaseline` and `AssetEvaluation`
`StyleBaseline` must be CREATED from ACTUAL CURRENT project art by the executioner; starter template is incomplete and not approval evidence. Asset evaluation stores SHA256, role, baseline version, judge model version, 7 views, visual scores/evidence, deterministic check statuses for rights/geometry/scale/collider/rig/compatibility/Quest proof and human sign-off. See `assets/style-baseline.template.json` and `contracts/asset-evaluation.schema.json`.

## Runtime persistence and privacy
Store minimal selected match/session progress and event outcomes locally; server stores bounded recent dialogue text and session consent state only as needed. Voice capture is transient and not persisted by default. Never persist raw headset mic data, identity documents or XR pose history. On restart/reconnect, use last completed session turn ID, not stale in-flight audio chunks; consent revalidation may be required.
