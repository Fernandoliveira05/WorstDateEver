# Tasks — 001 VR Bedroom (rig-aligned hands, Poly Haven room, rigid props)

Tasks are ordered for execution. `[x]` means code/spec is present, **not** hardware-certified. Hardware and comfort checks remain open.

## P0 — Foundation and revised interaction
- [x] **T001** Create Vite + A-Frame project shell and dependencies.
- [x] **T002** Establish project constitution for VR comfort, original character assets and LLM boundaries.
- [x] **T003** Document state transitions and acceptance tests in Spec Kit style.
- [x] **T004** Build a low-poly bedroom blockout with bed, clutter, desk, phone, door and lights.
- [x] **T005** Configure tracked camera and both controller laser pointers.
- [x] **T006** Implement a selectable physical phone and world-locked phone panel. *(Superseded by T024: panel removed; physical phone retained.)*
- [x] **T007** Build two avatar selections, three preferences, and fictional profile deck.
- [x] **T008** Implement guarded match/time-skip/preparation/DMT-ending branches.
- [x] **T009** Persist and validate versioned local game state.
- [x] **T010** Add pure narrative logic unit tests.
- [x] **T024** Replace the detached panel with one actual phone entity whose screen renders the existing app UI.
- [x] **T025** Rebuild the bedroom with coherent metric proportions, cartoon palette, grounded furniture and layered lighting.
- [x] **T026** Add Meta Quest 3 tracked-hand entities with WebXR `hand-tracking` optional feature and low-cost joint-dot rendering.
- [x] **T027** Implement pinch pickup using a captured real wrist-to-prop transform and grab cooldown.
- [x] **T028** Implement hand pose following while the phone is held, without camera/head coupling or A-Frame's scene-root wrist object.
- [x] **T029** Implement other-hand index-finger screen hit-testing, front-face rejection, and per-contact debounce/rearm.
- [x] **T030** Implement pinch release, tracking-loss grace recovery, XR exit/page-hide recovery, out-of-bounds guard and in-world RECUPERAR.
- [x] **T031** Implement the seated-friendly ALCANCE height option with a separate comfort preference; no camera movement.
- [x] **T032** Keep controller and desktop mouse fallback on the same phone body/screen; world-anchor the readable inspection pose.
- [x] **T033** Add hand-pinch + ray/mouse operable lamp switch, monitor power, drawer and reach/recover controls.
- [x] **T034** Add deterministic tests for tap debouncing, rearm, front-face rejection, hit-testing and pinch-volume logic.
- [x] **T035** Preserve the v1 narrative save schema, original fictional app and pt-BR story/profile content.
- [x] **T036** Re-run existing tests and production build. *(Desktop build only; not hardware evidence.)*
- [x] **T047** Replace built-in hand-tracking controls with one cached `scene.frame` + `renderer.xr.getReferenceSpace()` pipeline mapped through the XR camera parent/rig.
- [x] **T048** Render hand joints with instanced spheres using actual `fillJointRadii` values and derive pinch hysteresis from the same radii.
- [x] **T049** Route hand visuals, grab offsets and other-index taps through the same per-frame world transforms.
- [x] **T050** Vendor official `cannon-es@0.20.0` with its MIT license and add static floor/walls/bed/desk/nightstand/cabinet/chair colliders.
- [x] **T051** Add dynamic phone and notebook bodies with gravity, sleep, prop-to-prop contacts and kinematic grab/release velocity.
- [x] **T052** Import, tint and locally serve six CC0 Poly Haven furniture models with 512 px WebP glTF textures and exact attribution.
- [x] **T053** Add stuck/out-of-bounds/tracking-loss recovery plus hand-pose and physics unit tests; rebuild `dist/` and verify local model inclusion (checked automatically when `dist/` exists).

## P1 — Hardware validation (must complete before calling the VR slice done)
- [ ] **T011** Open the HTTPS build in Quest 3 and Quest 3S (or document supported hardware) and confirm enter-VR works.
- [ ] **T012** Verify both controller trigger raycasts hit the physical phone, screen buttons and every prop control.
- [ ] **T013** Validate seated and standing viewpoints, UI readability, world-anchored phone/screen and recenter behavior.
- [ ] **T014** Measure and record real device FPS / frame time; optimize lighting and draw calls as needed.
- [ ] **T015** Run a discomfort test with volunteers: no forced movement, camera shake, head-lock or accidental flashes.
- [ ] **T016** Validate that quitting and reloading preserves choices on the actual headset.
- [ ] **T037** Enable Quest hand tracking and verify both tracked hands render without breaking controller lasers.
- [ ] **T038** Verify pinch pickup attaches and releases the exact phone prop; test pinch outside the phone, repeated pinches and grab cooldown.
- [ ] **T039** Verify the phone follows hand rotation/translation naturally and remains readable in the held pose.
- [ ] **T040** Verify other-index-finger tapping on every button; tune contact depth, debounce/rearm and false-positive rate.
- [ ] **T041** Verify release, hand occlusion, tracking loss, XR exit and RECUPERAR all leave the phone reachable and the save unchanged.
- [ ] **T042** Verify the seated reach option from a seated position, including access to the ALCANCE switch and screen reading height.
- [ ] **T043** Verify lamp, monitor, drawer, reach and recover props with both hand pinch and controller rays.
- [ ] **T044** Record the unresolved hardware gaps and any comfort or tracking issues in the release notes.
- [ ] **T054** Verify hand dots, pinch contact and index-tap contact visually agree with the real hands while moving the rig/recentering.
- [ ] **T055** Verify the phone and notebook fall, collide with desk/furniture and each other, and preserve throw velocity on release.
- [ ] **T056** Verify WebP glTF furniture loads, palette/tints remain coherent and six assets stay within the frame/download budget on Quest 3.
- [ ] **T057** Verify recovery from tracking loss, under-bed stuck phone, out-of-bounds throw, XR exit and page hide.
- [ ] **T058** Tune masses, damping, throw clamps and pinch/tap margins from headset observations.

## P2 — Art/audio polish (not required for architecture prototype)
- [ ] **T017** Replace primitive phone/profile portraits with authored assets and ensure legible 3D type.
- [ ] **T018** Add notification sound / room ambience, with mute and volume controls.
- [ ] **T019** Add comfort / content advisory and VR-safe reset/recenter UX.
- [ ] **T020** Design visual feedback for approaching departure without implementing venue gameplay.
- [ ] **T045** Add hand-tap haptic-like visual/audio feedback and per-finger highlight after on-device tuning.
- [ ] **T046** Add authored low-poly cartoon furniture and baked/VR-friendly lighting after profiling.

## Future features — Out of scope
- [ ] **T021** Create Phase 2 venue scene(s), dialogue LLM adapter, memory and per-archetype personality scripts.
- [ ] **T022** Create effect visual language with comfort controls, and independent content review.
- [ ] **T023** Create later restaurant random events, escape/police breathalyzer and ending branches.
