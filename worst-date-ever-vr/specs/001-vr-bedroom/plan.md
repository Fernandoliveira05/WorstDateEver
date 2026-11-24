# Technical Plan: 001 — VR Bedroom (rig-aligned hands, Poly Haven room, rigid props)

## Architecture decision
**Use A-Frame 1.8.0 / WebXR, Vite, one shared XR hand-pose pipeline and Cannon-es rigid bodies, with a deterministic ES-module narrative state machine plus testable interaction helpers.** The phone is one physical A-Frame entity with one world-space screen. There is no detached panel. Tracked hands and controllers/mouse all operate that same entity.

A-Frame's built-in `hand-tracking-controls` is deliberately **not** used for the scene hand state. Its source creates the wrist `Object3D` directly under the scene root, while its joint visuals are under the rig, and it requests its own reference space. When the rig moves, those two representations disagree. Instead, `src/hand-pose.mjs` reads `scene.frame` and `renderer.xr.getReferenceSpace()` once per XR frame, fills all 25 joint poses and radii, and maps them into world space through the actual XR camera parent (the rig). Joint visuals, pinch positions, grab offsets and index-tip taps all consume the same cached frame. Controller lasers and mouse raycasting remain A-Frame-native.

## Runtime components
```text
User headset / Quest Browser
   ├── WebXR tracking (HMD, controllers, tracked hands)
   ├── A-Frame scene (room, desk, nightstand, actual phone, props)
   ├── Controller/mouse ray adapter (.interactable => click)
   ├── Shared tracked-hand pipeline
   │      ├── scene.frame + renderer.xr.getReferenceSpace()
   │      ├── rig.matrixWorld * XR joint pose => one world transform
   │      ├── XRFrame.fillPoses + fillJointRadii => visuals and pinch distance
   │      ├── pinch edges => kinematic grab / throw
   │      └── index-tip joint => screen hit-test + debounced tap
   ├── Cannon-es world
   │      ├── static room, bed, desk, nightstand, cabinet and chair
   │      ├── dynamic phone + notebook (prop-to-prop contacts)
   │      ├── kinematic held pose with derived release velocity
   │      └── stuck/out-of-bounds recovery
   ├── One world-space phone screen
   │      └── dispatch(action) to the pure narrative machine
   ├── Pure narrative state machine (guards, branching, preferences)
   │      └── profile catalog (4 original fictional candidates)
   └── localStorage: versioned narrative state + separate comfort preference

Phase 2 only:
   └── Backend dialogue gateway -> LLM provider
```

## Implementation modules
| Module | Responsibility | Owner |
|---|---|---|
| `index.html` | A-Frame room, rig, controller lasers, tracked hand entities, single physical phone/screen, interactive props, lighting | Scene |
| `src/main.js` | Phone UI on the physical screen, grab/tap manager, controller fallback, recovery/reach, room prop behavior, persistence wiring | UI / Input |
| `src/hand-pose.mjs` | Shared XR frame/reference-space pipeline, rig-world joint mapping, joint radii, pinch edges | XR / Hands |
| `src/physics-world.mjs` | Cannon world, static bedroom colliders, dynamic/kinematic helpers, release velocity, bounds predicates | Physics |
| `wde-hand-tracking` component in `src/main.js` | One instanced joint-dot mesh per hand from the shared pipeline | Rendering |
| `src/phone-interaction.mjs` | Pure tap debounce/rearm gate, tap-target hit test, pinch-volume test, nearest-prop selection | Interaction logic |
| `src/game-machine.mjs` | Pure guarded story transitions and schema validation | Game logic |
| `src/profiles.mjs` | Original fictional archetypes and preference filtering | Narrative data |
| `tests/game-machine.test.mjs` | Deterministic story flow and regression tests | QA |
| `tests/phone-interaction.test.mjs` | Debounce, rearm, front-face rejection, hit-test and pinch-volume tests | QA |
| `tests/hand-pose.test.mjs` | Reference-space/rig transform alignment and frame-cache tests | QA |
| `tests/physics-world.test.mjs` | Gravity, static collision, prop-to-prop contact and throw-velocity tests | QA |
| `tests/assets.test.mjs` | Local glTF/WebP dependency and attribution checks | QA |

## State transitions (unchanged)
```text
INTRO --phone app START--> IDENTITY
  --choose avatar: male|female--> PREFERENCE
  --choose date preference: men|women|all--> BROWSE
  --skip--> BROWSE (next eligible, wrap)
  --like--> MATCH --two hours--> WAIT --continue--> PREP
  --none|weed|lsd|alcohol--> EXIT (Phase 2 handoff stub)
  --dmt--> AFTERMATH (bedroom alternate ending)
  --reset from ending--> INTRO
```
Phone pickup, carrying, tapping, release, reach adjustment and prop interaction are presentation/input events. They do not mutate story phase by themselves. Screen buttons dispatch the same narrative actions as before.

## Physical phone and fallback model
- One entity, `#phonePickup`, with the same low-poly body and emissive screen language as the original implementation.
- The app UI is generated as 3D geometry inside `#phoneScreen` / `#phoneUI`; there is no `phonePanel`, DOM overlay, or second screen.
- Docked state: the phone rests upright on a physical stand attached to a nightstand.
- Held state: pinch captures the real relative transform between the pipeline's world wrist matrix and the prop's world matrix. The prop stays in scene space as a kinematic Cannon body and is driven to `wristWorld * grabOffset` each frame. It never relies on A-Frame's scene-root wrist helper or a guessed offset.
- Reading state: controller/mouse activation moves the same phone to a fixed world-space pose about 0.58 m in front of the headset at activation time. It is then anchored in the world. It does not attach to the camera or head.
- Released state: the body becomes dynamic with the linear/angular velocity derived from the last hand poses, clamped to safe limits. Gravity and collisions take over.
- Recovered state: `RECUPERAR`, tracking loss, XR exit, page hide, out-of-bounds, or a phone sleeping under the bed returns it to the current dock.

## Tracked-hand interaction
### Grab
1. The shared pipeline fills joint poses from `scene.frame` using the same reference space Three.js uses for rendering, then maps them through `camera.parent.matrixWorld` (the rig).
2. A pinch edge is recognized with hysteresis based on the actual thumb-tip and index-tip radii returned by `XRFrame.fillJointRadii`.
3. Test the world pinch midpoint against the phone/notebook geometry with a margin derived from that measured pinch radius.
4. Capture `wristWorld^-1 * propWorld` at the grab instant. There is no authored attachment offset.
5. Make the prop body kinematic and drive it from `wristWorld * grabOffset`; reset tap gates and do not modify camera/rig transforms.

### Screen tap
1. While the phone is held by hand A, read hand B's world index-tip position from the same pipeline and frame.
2. Transform the tip into `#phoneScreen` local coordinates.
3. Reject points outside screen bounds, behind the screen, or farther than the front-contact threshold.
4. Hit-test the current UI targets (topmost first) and update a per-hand tap gate.
5. Emit exactly one activation per contact edge. The gate stays closed for `TAP_DEBOUNCE_MS`, then rearms only after the fingertip has been clear for `TAP_REARM_MS`.
6. Restrict to the non-holding hand. Index proximity alone never activates the screen when the phone is docked.

### Release and recovery
- A pinch-end edge releases the kinematic body to dynamic physics with the last hand-derived velocity; a short cooldown prevents immediate duplicate grabs.
- If the holding hand loses poses/input for `HAND_LOSS_GRACE_MS`, recover automatically.
- On XR exit, page hide, out-of-bounds position, or a phone sleeping under the bed, recover.
- Reset both tap gates and the grab cooldown after every recovery.
- Narrative state and save data are never modified by recovery.

## Physics model
- Vendored `cannon-es@0.20.0` (MIT) under `vendor/cannon-es/`; no runtime network request.
- Fixed 1/90 s sub-steps with a maximum of four catch-up steps and a 50 ms delta cap.
- Static bodies match the room shell, bed, desk top/legs, nightstand, dresser cabinet and chair.
- The phone and notebook are dynamic boxes with independent mass, damping and sleep. The notebook starts on the desk.
- While held, the body is kinematic and pinned to the sampled hand pose. Its pose delta is retained separately for release so Cannon does not integrate the desired velocity twice.
- Static fixtures and dynamic props share one world, so phone↔notebook and prop↔room contacts are resolved by the same solver.

### Seated-friendly reach
- Nightstand-mounted `ALCANCE` control toggles a raised phone-stand pose.
- The stand post and pad change height; the phone dock follows. The camera is never moved.
- Default is reach-assist on, so the phone starts at a seated-friendly chest/eye height. The switch can lower it to the natural nightstand height.
- Reach preference is persisted under `worst-date-ever-vr-comfort-v1`, separate from the story save.

## Controller / desktop fallback
- Controller lasers target `.interactable`; trigger clicks are unchanged.
- The laser raycaster is re-applied with `objects: .interactable` after A-Frame's controller connection/model-ready events so the controller component cannot overwrite the whitelist.
- Mouse uses the existing camera-attached cursor raycaster.
- Clicking the phone body/screen background moves the same phone to the readable world-space inspection pose. Screen buttons stop propagation and dispatch directly.
- Fallback never creates a second UI surface and never head-locks the phone.
- Keyboard fallback shortcuts: `L` lamp, `M` monitor, `O` drawer, `H` reach, `R` recover, `N` reset notebook.

## Bedroom art and prop plan
- Coherent metric blockout: 4.8 × 5.4 × 2.72 m room; 0.79 m Poly Haven desk; 0.56 m nightstand; local day bed; oversized cartoon phone.
- Six local CC0 Poly Haven models: `vintage_day_bed`, `metal_office_desk`, `painted_wooden_chair_02`, `desk_lamp_arm_01`, `binder_notebook`, `drawer_cabinet`. Textures are 512 px WebP in glTF `EXT_texture_webp`; source pages and license are recorded in `public/assets/models/ATTRIBUTION.md`.
- Gentle material tints plus warm lamp / cool window fill keep the scanned furniture inside the lavender-pink palette.
- Layered lighting: low cool ambient, warm practical lamp point light, cool window/directional fill; emissive phone and monitor materials without extra lights. No real-time shadows.
- Interactive props:
  - lamp switch toggles `#lampLight` and switch material.
  - monitor power toggles the monitor screen/text material.
  - drawer handle slides the drawer with a short exponential ease.
  - reach and recover controls are on the nightstand front.
- All prop controls carry `.interactable .pinchable`; hand pinch uses a nearest-target radius, while ray/mouse uses normal click dispatch.

## Performance / comfort plan
- Six optimized local furniture assets (~3 MB total); no remote model or hand-mesh dependency for the core flow.
- Hand visualization uses one instanced joint-dot mesh per hand and the measured XR joint radii; no CDN GLB or skinned-mesh cost.
- `renderer` requests `foveationLevel: 2`, antialiasing and color management; no shadows.
- Limit dynamic lights to ambient + lamp + fill/directional; monitor and phone use emissive materials.
- Preallocate vectors/matrices used by the hand tick; avoid querying the DOM per frame except at infrequent pinch starts.
- Physics is limited to two dynamic props plus static furniture boxes at a fixed 90 Hz step; no full-body IK or continuous collision simulation.
- Target 72fps minimum / 90fps stretch, but treat all values as targets until measured on Quest 3 hardware.
- No forced camera movement, camera shake, head-lock, flashing or animated focal-distance effects.
- Verify text readability, pinch thresholds, tap false-positive rate and seated reach on device.

## Persistence contract
- Narrative key remains `worst-date-ever-vr-bedroom-v1` and schema v1 in `contracts/game-state.schema.json`.
- Existing v1 saves load unchanged; malformed/unsupported saves reset safely.
- No new story fields are added by this revision.
- Comfort key `worst-date-ever-vr-comfort-v1` stores only `{ "reachAssist": boolean }`.
- No biometric, voice, eye, hand-geometry or headset tracking data is persisted.

## Build / deployment
- `npm install && npm run dev` for desktop testing at `http://localhost:5173`.
- Headset testing requires a trusted HTTPS origin; raw LAN HTTP is not sufficient for immersive WebXR.
- `npm test` checks story, interaction, hand-pose alignment and physics invariants; `npm run build` bundles static `dist/` including the local glTF/WebP model tree.
- Do not add a tunnel or change deployment configuration as part of this revision.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| Hand input not enabled by Quest | Declare `hand-tracking` optional feature; keep controller fallback fully functional |
| Phone lost/dropped after tracking loss or under furniture | Grace-period release, dock recovery, out-of-bounds/under-bed guards, in-world RECUPERAR and R shortcut |
| Accidental repeated taps | Contact-edge gate + debounce + clear/rearm interval + per-hand gates |
| Phone screen hard to read while held | Oversized cartoon prop, concise pt-BR pages, close-range hand holding, fallback inspection pose |
| Seated player cannot reach nightstand | Default raised reach pose and an in-world height toggle; no camera movement |
| Raycaster whitelist overwritten by laser-controls | Re-apply `.interactable` after controller connect/model-ready events |
| Controller ray accidentally hits world geometry | `.interactable` whitelist, clear labels and intentional prop controls |
| Quest GPU overload | Instanced joint dots, 512 px WebP textures, limited lights, two dynamic bodies, preallocated tick math |
| UI illegible in headset | On-device text/target readability test remains a release gate |
| Apparent gender restrictions | Independent preference field; test all identity/preference combinations |
