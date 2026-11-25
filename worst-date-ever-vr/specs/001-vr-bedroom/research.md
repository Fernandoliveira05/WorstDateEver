# Research Notes & Decisions (2026-11-18, revised hands/physics)

## A-Frame / WebXR
- A-Frame supports WebXR rendering and 3DoF/6DoF controller interactions; `laser-controls` and the A-Frame `raycaster` remain the controller fallback: https://aframe.io/docs/1.8.0/introduction/interactions-and-controllers.html
- Importing A-Frame via npm in a Vite project is supported: https://aframe.io/docs/1.8.0/introduction/installation.html
- WebXR reference space options include `local-floor`: https://aframe.io/docs/1.8.0/components/webxr.html
- Quest browser supports WebXR immersive VR: https://developers.meta.com/vr/documentation/web/port-vr-xr/

## Verified installed A-Frame 1.8 hand/controller source
- `hand-tracking-controls` is shipped in A-Frame 1.8 (`node_modules/aframe/src/components/hand-tracking-controls.js`).
  - It appends `hand-tracking` to the session's optional features.
  - It creates a scene-root `wristObject3D` and fills 25 joint poses using `XRFrame.fillPoses` / `fillJointRadii`.
  - Joint order includes wrist index 0, thumb tip index 4 and index-finger tip index 9.
  - It emits `pinchstarted`, `pinchmoved` and `pinchended` with a world-space midpoint between thumb and index tips.
  - Its wrist object is added to `sceneEl.object3D`, while joint dot entities remain under the rig. Those spaces diverge when the rig transform is non-identity.
  - It requests its own reference space in `updateReferenceSpace`, separate from `renderer.xr.getReferenceSpace()`.
  - Because of those two mismatches this revision does **not** instantiate the built-in component for scene hands. `src/hand-pose.mjs` owns the sampled poses.
- Three.js `WebXRManager.updateCamera` composes the XR camera as `parent.matrixWorld * XR pose`; therefore `rig.matrixWorld * jointPose` is the world transform matching the rendered XR camera. The shared pipeline uses that relationship rather than an offset constant.
- `src/hand-pose.mjs` caches `(scene.frame, renderer.xr.getReferenceSpace())` for the whole frame. Hand visuals, pinch volumes, wrist grab offsets and index-tip screen taps all read that cache.
- A-Frame ticks components in one global order, not scene-graph order. `phone-interaction-manager` is ordered `before: ['wde-hand-tracking']`, and the visual tick calls `sampleHand()` explicitly, so both paths publish the current `scene.frame` even if registration order changes.
- Joints are resolved by their `XRHand` names (`wrist`, `thumb-tip`, `index-finger-tip`, ...) and passed to `fillPoses`/`fillJointRadii` in that canonical order. The code does not assume `XRHand.values()` iteration order.
- The optional `?handDebug=1` marker reads `XRInputSource.targetRaySpace` through the current `XRFrame` as an independent system pose. It is diagnostic only; no offset, calibration or guessed wrist transform is applied.
- Joint radii from `XRFrame.fillJointRadii` drive both the instanced sphere scale and pinch start/end hysteresis. No hand-scale constant is authored.
- `laser-controls` configures `raycaster` and `cursor` when controllers connect. Because it can re-apply raycaster attributes, this revision re-applies `objects: .interactable` after `controllerconnected` and `controllermodelready`.
- Controllers and tracked hands can coexist; A-Frame matches hand input sources through `tracked-controls` with `handTrackingEnabled`.
- The `generic-tracked-controller-controls` fallback uses a `generic` profile prefix that can also match hand input profiles. Because Quest Touch controllers are handled by `meta-touch-controls`, this revision removes that fallback from the laser rigs so hand mode cannot leave a stray controller laser at the rig origin.
- The interaction manager and visual publisher both request an explicit sample from the frame cache; the visual publisher is ordered after the manager so rendering cannot consume the previous frame's dots.
## Meta / WebXR hand input
- Meta's WebXR hand-tracking guide documents `XRInputSource.hand`, `XRFrame` joint poses, the emulated hand ray and reserved system gestures: https://developers.meta.com/vr/documentation/web/webxr-hands
- This revision reads tracked joints and uses index-thumb pinch as an application grab gesture. It does not intercept or repurpose reserved system palm-pinch behavior.
- Tap detection deliberately uses a proximity/depth heuristic rather than a physics collider. This keeps the standalone-headset tick inexpensive and is testable in isolation.

## Poly Haven assets and license
- License page: <https://polyhaven.com/license>. All six shipped models are CC0; exact source pages are recorded in `public/assets/models/ATTRIBUTION.md`.
- Chosen subset: `vintage_day_bed`, `metal_office_desk`, `painted_wooden_chair_02`, `desk_lamp_arm_01`, `binder_notebook`, `drawer_cabinet`.
- The staged `potted_plant_01` is not shipped because its leaf geometry alone is 5.1 MB, disproportionate to its decorative role.
- The 1K texture sets were resized to 512 px and converted to WebP. glTF textures use `EXT_texture_webp`, supported by Three.js r184 GLTFLoader and Quest Browser's WebP decoder.
- Models are copied to `public/assets/models`, referenced with relative `./assets/models/...` paths, and verified in the Vite `dist/` output.

## Cannon-es rigid bodies
- Staged package: official `cannon-es@0.20.0` npm tarball; vendored under `vendor/cannon-es/` with its MIT license.
- Source API verified from the vendored module: `Body.KINEMATIC` bodies are integrated from velocity, so the held body is pinned to the sampled pose while its measured velocity is stored externally and re-applied only on release.
- Fixed 1/90 s stepping with a 50 ms clamp and four substeps keeps behavior stable across 72/90 Hz headsets.
- Static colliders cover floor, walls, ceiling, bed, desk top/legs, nightstand, cabinet and chair. Phone and notebook are dynamic boxes in the same `World`.

## Spec Kit
- Official workflow is constitution → specify → clarify → plan → checklist → tasks → analyze → implement → converge: https://github.github.com/spec-kit/quickstart
- This repository keeps the Spec Kit-style feature artifacts in `specs/001-vr-bedroom`; it does not claim any native CLI workflow was run.

## Decisions
1. WebXR + A-Frame for rapid headset-browser iteration.
2. One actual physical phone prop and one screen. No detached panel, head-lock, or second UI surface.
3. One `scene.frame` + `renderer.xr.getReferenceSpace()` pipeline drives rig-aligned hand visuals, pinch grabs and index taps.
4. Controller ray + trigger and desktop mouse remain first-class fallbacks using the same phone.
5. Controller/desktop activation may move the actual phone to a fixed world-space inspection pose for readability.
6. Seated-friendly reach changes the physical stand/dock height, never the camera.
7. Instanced joint-dot hands use measured XR radii; six local Poly Haven models use 512 px WebP textures.
8. Deterministic state machine and v1 save schema are preserved; comfort preference is stored separately.
9. Original fictional archetypes remain unchanged.
10. Phone and notebook use kinematic grabs with velocity-preserving dynamic release; recovery remains available if a prop becomes stuck.
