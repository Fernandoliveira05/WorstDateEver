# Feature Specification: 001 — VR Bedroom Prologue

**Project:** Worst Date Ever  
**Stage:** First VR vertical slice; bedroom only  
**Primary hardware:** Meta Quest 3/3S class via WebXR-capable browser  
**Language:** pt-BR content; technical docs in English  
**Source:** User's initial narrative and 1-page plan PDF. The plan contains the opening bedroom → phone → dating app → match → venue flow, four principal archetypes, and later location-based events.

## Product intent
A player in a messy bedroom opens a fictional dating app, establishes their own playable identity and preferred date gender, browses four character archetypes, matches with one, experiences a two-hour time skip, and makes a pre-date choice. The scene ends at the date-scene handoff, except the DMT branch concludes in the bedroom. The overall genre is absurdist dating comedy that can later branch into horror.

## Revision intent (2026-11-18)
Replace the previous detached, world-locked phone panel with one physical phone prop. The same phone body and screen serve tracked hands, controllers, and the desktop mouse fallback. On Quest 3, the player can pinch the phone, carry it in the tracked hand, and tap its physical screen with the other hand's index finger. The bedroom is made more grounded and cartoonesque, with coherent furniture proportions, layered lighting, and hand/controller-usable props. The revision must not introduce head-lock, forced camera motion, camera shake, or a second presentation surface.

This revision also replaces the split A-Frame hand representations with one same-frame pose pipeline. The old built-in component put the wrist under the scene root, joint dots under the rig, and requested a second WebXR reference space, which made hand visuals and grabs disagree whenever the rig moved. `scene.frame` and `renderer.xr.getReferenceSpace()` are now sampled once and mapped through the actual XR camera parent. The room gains six locally served CC0 Poly Haven furniture models, and the physical phone and notebook gain Cannon-es rigid-body behavior: gravity, static room/desk collisions, prop-to-prop contacts, kinematic grabs and velocity-preserving throws.

## Scope
### Included
- Small first-person VR bedroom with authored low-poly blockout proportions and a cohesive cartoon palette.
- Head tracking and 6DoF controller ray + trigger selection.
- Meta Quest 3 tracked hands through WebXR hand input: wrist/joint pose following, pinch recognition, hand rendering as low-cost joint dots.
- One actual physical phone prop with one screen. No detached panel or duplicate UI surface.
- Pinch pickup of the phone; the phone follows the tracked hand while held.
- Index-finger tapping on the actual phone screen by the non-holding hand, with per-contact debouncing and cooldown/rearm behavior.
- Reliable release, recovery from tracking loss, and an in-world recover control.
- A seated-friendly reach option that raises/lowers the physical phone stand; no camera movement is involved.
- Controller/mouse fallback that moves the same physical phone to a readable world-space inspection pose on activation.
- Interactive room props usable by hands and fallback inputs: lamp switch, monitor power, drawer, reach control, recover control.
- Locally served bedroom furniture models with documented CC0 sources and optimized WebP textures.
- A single rig-aligned hand pose source for visuals, grabs and index taps.
- Rigid-body phone and notebook with gravity, static collisions, prop-to-prop contacts, kinematic grabs and release velocity.
- World-space phone interface: app open, character choice, preference, browsing, matching, time skip, pre-date choice.
- Two avatar gender selections (man/woman) with a separate dating-preference selection (men/women/all).
- Four fictional partner profiles: Esquerdomacho, Menzinho, Paty, Boiadeira; two men and two women.
- One deterministic guaranteed match upon pressing Like, with skip cycling through candidates.
- Five choices: none, cannabis, LSD, alcohol, DMT. These record a future effect tag but do not simulate intoxication here.
- DMT branch ends in the bedroom with non-graphic aftermath and restart.
- Local game-state persistence, restart, automated story-state and interaction tests.

### Explicitly excluded
- Restaurant / cinema / petrol-station / café / bar gameplay; police breathalyzer; actual departure travel.
- LLM dialogue and API integrations; voice recognition; network multiplayer.
- Drug-effect simulations, jump scares, emesis visuals, procedural horror, driving while intoxicated.
- Full-body IK, avatar body, finger skin deformation, general ragdoll/full-room dynamic physics, or tracked-hand locomotion.
- Detached phone panels, head-locked UI, gaze-following UI, or scripted camera movement.
- Final character art, final audio, teleportation, or production hardware certification.
- Claims of Quest headset performance or comfort validation from desktop testing.

## User stories and acceptance criteria

### US1 — Enter a VR room (Priority P0)
As a seated or standing player, I want the bedroom to surround me and the phone to be reachable without losing natural head movement.

**Given** the page is opened on a compatible VR device, **when** the player enters immersive VR, **then** only the headset controls head orientation and position, and both controllers can raycast the phone and room props.  
**Given** tracked hands are available, **when** the player looks around, **then** the phone and room remain world-anchored and never follow the head.  
**Given** the player is seated and cannot comfortably reach a low desk, **when** the reach option is enabled, **then** the physical phone stand raises the phone into a near-chest/eye-level reach zone without moving the camera.  
**Given** the same page is opened on desktop, **when** the player clicks the phone, **then** the same phone body and screen are brought to a readable world-space inspection pose and remain usable with the mouse.

### US2 — Choose my playable character (Priority P0)
As a player, I want to select whether my character is male or female without changing the available orientation options.

**Given** the phone app is open, **when** I select HOMEM/MULHER, **then** avatarGender is saved.  
**Given** either gender choice, **when** I proceed, **then** preference offers men, women and everyone.

### US3 — Explore date profiles (Priority P0)
As a player, I want to browse potential dates and choose the one whose vibe I want to explore.

**Given** preference is 'all', **when** browsing begins, **then** four distinct fictional archetypes are available.  
**Given** preference is men or women, **when** browsing begins, **then** only the corresponding two profiles are shown.  
**Given** the currently shown profile, **when** I press PASSAR, **then** the next eligible profile appears, wrapping after the last.  
**Given** any shown profile, **when** I press CURTIR, **then** a match is created for exactly that profile and gameplay proceeds.

### US4 — Time skip and pre-date choice (Priority P0)
As a player, I want to experience anticipation before choosing whether to use something before leaving.

**Given** a confirmed match, **when** I choose the time skip, **then** the app indicates that two hours passed and the player is anxious.  
**Given** the preparation screen, **when** I choose none, cannabis, LSD or alcohol, **then** the selection is persisted and a next-scene placeholder appears.  
**Given** the preparation screen, **when** I choose DMT, **then** the story instead ends in a non-graphic bedroom aftermath.  
**Given** an ending, **when** I press restart, **then** all run-specific state is reset.

### US5 — VR-safe and resumable (Priority P0)
As a player, I want readable controls, a stable camera, and my progress preserved if I close the browser.

**Given** the phone app is open, **when** the player turns their head, **then** neither the phone nor its screen follows the head.  
**Given** any state was saved, **when** the page reloads, **then** the app restores the last valid narrative state; malformed save data resets safely.  
**Given** the player uses a controller ray, **when** hovering over a button, **then** it highlights and trigger-selects without requiring physical contact.  
**Given** the player uses tracked hands, **when** they pinch the phone and then release, **then** the phone returns to a reachable dock instead of being lost.

### US6 — Pick up and hold the actual phone with tracked hands (Priority P0)
As a Quest 3 player using hand tracking, I want to pinch the physical phone and carry it naturally so the app feels embodied rather than panel-based.

**Given** the app is running with hand tracking, **when** the player pinches near the phone body, **then** the actual phone entity is attached to that hand's tracked wrist and follows its pose.  
**Given** the phone is held, **when** the player rotates or moves their hand, **then** the phone follows with no camera or head movement.  
**Given** the player pinches or releases outside a valid phone reach, **then** no pickup is created and the world remains unchanged.  
**Given** a second pinch occurs during the grab cooldown, **then** duplicate grabs are ignored.

### US7 — Tap the physical screen with the other index finger (Priority P0)
As a Quest 3 player, I want to use my free index finger to tap buttons on the phone screen while holding the phone in my other hand.

**Given** one hand holds the phone, **when** the other hand's index fingertip enters the front of the screen over a button, **then** that button activates once.  
**Given** the fingertip jitters or remains over the button, **when** further frames are processed, **then** no duplicate activation occurs.  
**Given** the fingertip leaves the screen and later returns after the rearm window, **then** a new tap is accepted.  
**Given** the fingertip approaches from behind the phone, **then** the tap is rejected.  
**Given** the phone is not held, **then** index proximity alone does not activate screen buttons.

### US8 — Reliable release and recovery (Priority P0)
As a player, I want a failed grab or hand-tracking loss to leave the phone available and the story intact.

**Given** the phone is held, **when** the player ends the pinch, **then** the phone returns to its dock and can be grabbed again after a short cooldown.  
**Given** the holding hand loses tracking for longer than the grace period, **then** the phone returns to the dock automatically.  
**Given** tracking ends, the XR session ends, or the page is hidden, **when** the phone is held, **then** the phone is detached and recovered.  
**Given** the phone is out of reach, **when** the player uses the in-world RECUPERAR control or the R shortcut, **then** the phone returns to the current dock.  
**Given** a recovery occurs, **then** narrative phase, choices and save data are unchanged.

### US9 — Grounded, usable bedroom props (Priority P1)
As a player, I want the room to read as a believable cartoon bedroom and contain things I can operate with hands or fallback input.

**Given** the lamp switch, **when** activated by pinch, controller or mouse, **then** the practical lamp and its light toggle.  
**Given** the monitor power control, **when** activated by pinch, controller or mouse, **then** the monitor screen toggles its powered appearance.  
**Given** the drawer handle, **when** activated by pinch, controller or mouse, **then** the drawer opens or closes with a short cartoon slide.  
**Given** the reach control, **when** activated, **then** the phone stand changes height without moving the player.  
**Given** the player looks around the room, **then** furniture, props and lighting use coherent relative scale and no detached floating interface.

### US10 — Preserve story, save data and pt-BR content (Priority P0)
As a returning player, I want the revision to keep the original narrative and save behavior intact.

**Given** an existing valid v1 save, **when** the revised build loads, **then** the same phase, avatar identity, preference, profile index, match and substance are restored.  
**Given** the phone UI, **when** any story page is shown, **then** the original fictional dating app and Portuguese profile/story content remain.  
**Given** the revision runs, **then** no additional personal data is persisted; reach-assist is stored separately as a non-narrative comfort preference.

## Functional requirements
- **FR-001:** VR session uses WebXR headset tracking; controller ray works without external input hardware.
- **FR-002:** Exactly one physical phone prop exists and is the sole presentation of the dating-app UI.
- **FR-003:** All core phone choices are 3D world-space interactive geometry on that phone screen.
- **FR-004:** Narrative flow is a finite-state machine with guarded transitions.
- **FR-005:** `avatarGender` and `preference` are separate fields.
- **FR-006:** Four fictional partner definitions have unique IDs, genders, archetypes, biographies and future venue hooks.
- **FR-007:** Browsing must be filterable by preference with deterministic cycling.
- **FR-008:** A Like action must save one selected `matchId` and advance to a Match state.
- **FR-009:** A two-hour narrative skip must be explicit.
- **FR-010:** Five pre-date choices must be presented; a DMT choice results in bedroom aftermath, others in a handoff placeholder.
- **FR-011:** On reset, all run-state fields return to defaults.
- **FR-012:** Save data must be validated and versioned before loading.
- **FR-013:** The first scene must not call any external LLM or expose any model secrets.
- **FR-014:** No camera shake, artificial forced head rotation, head-lock, or flashing sequences in the bedroom MVP.
- **FR-015:** Text and interactive targets must remain legible and usable in a real headset; production acceptance requires headset testing.
- **FR-016:** The app must declare and use `hand-tracking` as a WebXR optional feature while keeping controllers functional.
- **FR-017:** A pinching tracked hand near the physical phone must attach that exact phone entity to the hand's wrist pose.
- **FR-018:** While held, the phone must follow the tracked hand transform; no camera or UI follow may be introduced.
- **FR-019:** The non-holding hand's index fingertip must be able to activate screen buttons from the screen's front side only.
- **FR-020:** Screen taps must debounce duplicate contacts and rearm only after a clear interval, using deterministic testable logic.
- **FR-021:** Pinch release, tracking loss, session exit and page hide must detach the phone and return it to a reachable dock.
- **FR-022:** The phone must expose an in-world recovery action and be constrained against falling out of reach.
- **FR-023:** A seated-friendly reach control must raise/lower the physical phone stand and dock without altering the camera.
- **FR-024:** Controller and desktop mouse fallback must use the same phone model, screen and app pages as the hand path.
- **FR-025:** Fallback activation may move the same phone to a fixed world-space inspection pose; that pose must not follow the head.
- **FR-026:** A lamp switch, monitor power control, drawer and reach/recover controls must be operable by hand pinch and fallback ray/mouse input.
- **FR-027:** The room must use coherent furniture proportions, limited active lights and low-poly placeholder geometry.
- **FR-028:** No save-schema fields from v1 may be removed or reinterpreted by this revision.
- **FR-029:** The reach-assist preference must persist separately from narrative save data.
- **FR-030:** The phone must never be rendered simultaneously as a detached panel and a physical prop.
- **FR-031:** Hand visuals, pinch volumes and index-tip taps must consume one cached pose sample from `scene.frame` and `renderer.xr.getReferenceSpace()` mapped through the XR camera parent/rig.
- **FR-032:** Joint-dot sizes must use the radii returned by `XRFrame.fillJointRadii`; grab offsets must be captured from real world transforms rather than authored constants.
- **FR-033:** The phone and at least one other prop (the notebook) must have dynamic rigid bodies with gravity.
- **FR-034:** Dynamic props must collide with static room/desk furniture and with each other.
- **FR-035:** A tracked pinch must make the grabbed body kinematic and follow the shared hand world pose; release must restore dynamic simulation with a velocity derived from the last hand poses.
- **FR-036:** The phone must recover from tracking loss, session exit, page hide, out-of-bounds, or being stuck under furniture to a reachable dock.
- **FR-037:** Six Poly Haven CC0 models must be served locally with exact source/license documentation; texture optimization must remain Quest-compatible.
- **FR-038:** The functional lamp, monitor, drawer, reach and recover controls and the v1 pt-BR narrative/save flow must remain intact alongside physics.

## Nonfunctional requirements / target budgets
- **NFR-001:** Target 72fps minimum on Quest-class hardware, with a stretch target of 90fps; these are targets, not current measured results.
- **NFR-002:** Use simple placeholder geometry, no real-time shadows, flat/standard low-cost materials, and a small active-light budget while profiling the scene.
- **NFR-003:** App must support headset WebXR over trusted HTTPS; desktop localhost works for nonimmersive testing.
- **NFR-004:** All state transitions, branching logic, tap debouncing, tap hit-testing, rig/reference-space mapping and physics invariants covered by deterministic automated tests.
- **NFR-005:** No phone UI is head-locked; the physical phone appears at its dock and fallback inspection is world-anchored.
- **NFR-006:** Primary choices must be possible without thumbstick movement or real walking.
- **NFR-007:** Hand rendering must use the low-cost joint-dot style by default; no remote hand-model fetch is required for the core flow.
- **NFR-008:** Interaction checks must avoid per-frame DOM queries and unbounded allocations in the hand tick; hand visuals use instancing and one cached XR frame sample.
- **NFR-009:** Hardware comfort, hand-tracking reliability and frame time remain unverified until tested on a Quest 3.

## Success metrics
- 100% of happy-path interactions are possible with a Quest controller in immersive mode.
- With tracked hands, a tester can pinch the phone, carry it, tap every screen choice with the other index finger, release, recover and repeat.
- A tester can start at the physical phone, make a match, select a pre-date choice, and reach an ending without keyboard or mouse.
- No invalid sequence can enter a later state without matching first.
- A reloaded, valid save restores the same selection and phase.
- All critical animations and effects avoid induced camera motion.
- The lamp, monitor, drawer and reach controls respond to both hand-pinch and fallback ray input.
- A thrown phone/notebook falls, contacts the room and other dynamic props, and can be recovered if it becomes unreachable.
- A tester observes hands, pinch contact and index-tap contact at the same physical location within one WebXR frame.

## Hardware and verification gaps
- No physical Quest 3/3S test is claimed by this revision.
- WebXR hand-tracking availability, pinch thresholds, occlusion behavior, seated reach, text legibility and frame time must be validated on device.
- The index-tap heuristic is a proximity/depth test, not a physical collision model; comfort and false-positive rates need headset tuning.
- Rigid-body feel, throw velocity, prop settling and WebP glTF loading must be checked on Quest 3; desktop unit tests do not prove headset behavior.
- The staged Poly Haven potted plant is intentionally not shipped because its 5.1 MB geometry is disproportionate for a decorative prop.
- Desktop build success is not evidence of headset performance.

## Open production questions (nonblocking prototype assumptions)
- Final visual art style (low-poly psychological horror vs stylized cartoon realism).
- Exact avatar customization beyond the MVP binary selection and inclusive options.
- Whether players want a separate comfort menu in addition to the in-world reach switch.
- Exact pinch/tap thresholds and haptic feedback after on-device calibration.
- Whether future date dialogue is free-form voice, choice buttons, or hybrid.

## Assumptions
- Single-player, age-rated adult comedy/horror context.
- Portuguese dialogue/localization; English documentation.
- No real dating-service trademarks, logos, or scraped real profiles are required for MVP.
- Future substances are story tags, not pharmacological simulation.
- The phone may be oversized for readability and cartoon proportions; it remains one physical prop.
