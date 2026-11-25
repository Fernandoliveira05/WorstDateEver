# Quickstart — VR Bedroom (rig-aligned hands, Poly Haven room, rigid props)

## Requirements
- Node.js >= 20.19 and npm.
- For desktop debugging: a recent Chromium-based browser with mouse/keyboard.
- For immersive testing: Quest 3/3S with WebXR-capable Browser, hand tracking enabled as desired, and a trusted HTTPS hosting origin.
- No physical headset validation is claimed by this document or the current build.

## Install and test
```bash
npm install
npm test
npm run dev
```
Open `http://localhost:5173` on desktop.

## Desktop fallback flow
1. The actual phone starts on the nightstand stand. Click its body or screen background to bring the same physical phone to a readable world-space inspection pose.
2. Click the 3D screen buttons: avatar → preference → profile → time skip → pre-date choice.
3. The phone remains world-anchored; click the nightstand `RECUPERAR` control (or press `R`) to return it to its dock.
4. Keyboard fallback: `L` lamp, `M` monitor, `O` drawer, `H` reach height, `R` recover phone, `N` reset notebook.

There is no detached panel. The only dating-app surface is the phone's screen.

## Quest controller flow
```bash
npm run build
```
Serve `dist/` via a trusted HTTPS domain, open that address in the headset browser, select Enter VR, and use controller rays + triggers. Aim at the phone/props; `.interactable` geometry is whitelisted for rays.

- Trigger-click the phone body/screen background to bring the actual phone to a fixed world-space inspection pose.
- Trigger-click screen buttons directly.
- The `ALCANCE` and `RECUPERAR` controls are on the nightstand front. `ALCANCE` raises/lowers the physical stand without moving the camera.

For LAN development, use a trusted HTTPS tunnel or server certificate. Headset WebXR will not reliably work from raw `http://192.168.x.x`.

## Quest 3 tracked-hand flow
1. Enable hand tracking on the headset and enter immersive VR. The scene requests the WebXR `hand-tracking` optional feature.
2. Reach toward the physical phone or the notebook on the desk and pinch (index + thumb). The grabbed prop becomes kinematic and follows the same rig-aligned world pose used to draw your hand.
3. Bring the phone in front of you. With the **other** hand, use the index fingertip to tap the physical screen. Taps activate only from the front of the screen and are debounced.
4. End the pinch to release. The prop becomes dynamic with your last hand velocity: it falls, collides with the room, desk, phone/notebook and other static furniture, and settles under gravity. A short cooldown prevents an accidental double grab.
5. Hand tracking loss, XR exit, page hide, out-of-bounds, or a phone stuck under the bed triggers recovery. Use `RECUPERAR` or press `R` on desktop if the phone is not where expected.

The hand visualization uses one instanced joint-dot mesh per hand with radii from `XRFrame.fillJointRadii`, so the core flow does not depend on a remote hand GLB. Visual dots, pinch volumes and index taps all consume one `scene.frame` + `renderer.xr.getReferenceSpace()` sample mapped through the XR camera parent/rig. The phone screen and story are identical across hands, controllers and mouse.

### Optional hand alignment diagnostic
Append `?handDebug=1` to the HTTPS URL, then enter VR. The scene draws a small yellow or blue target-ray dot and 12 cm ray at each tracked hand's independent XR target-ray origin. These markers come from `XRFrame.getPose(inputSource.targetRaySpace, referenceSpace)` and do not use the joint-pose pipeline or any calibration offset.

Use them only to gather feedback:
1. Hold one hand still and compare the real hand, the joint dots and the target-ray marker.
2. Rotate the wrist and open/close the pinch; the marker and dots should move together without a persistent shift or twist.
3. Walk/recenter the XR rig if available and repeat. A one-frame drag while moving fast is different from a fixed offset at rest.
4. Report which side, whether the error is translation or rotation, and whether it appears only while moving. Do not tune or persist a user offset from this diagnostic.

Remove `?handDebug=1` for normal play.

## Local furniture assets
Six CC0 Poly Haven models are copied under `public/assets/models/`: day bed, metal desk, painted chair, desk lamp, notebook and drawer cabinet. Their 1K JPEG textures are resized to 512 px WebP and the glTF files declare `EXT_texture_webp`. Exact source pages and the CC0 license are documented in `public/assets/models/ATTRIBUTION.md`. No network fetch is required at runtime. The large potted-plant asset is staged but intentionally not shipped.

## Seated-friendly reach
- `ALCANCE` toggles the nightstand phone stand between a natural low pose and a raised chest/eye-level reach pose.
- Default is reach-assist on. The option is persisted separately from the narrative save under `worst-date-ever-vr-comfort-v1`.
- The player camera is never moved by the reach control.

## Reset progress
Use the in-world `RECOMECAR` button at an ending. For a fresh debug start, clear the app origin's local site storage. Clearing storage resets both the v1 narrative save and the separate reach preference.

## Tests
`npm test` validates:
- story guards, match flow, DMT branch, save validation;
- tap debounce/rearm behavior, front-face rejection, tap-target hit-testing, pinch-volume testing;
- rig/reference-space hand alignment, joint-radii pinch thresholds and frame caching;
- gravity, static desk/floor collision, prop-to-prop contact, kinematic release velocity and bounds recovery;
- local glTF/WebP dependency presence, scene asset paths, Poly Haven attribution and the copied model tree in `dist/` when it has been built.

Run `npm run build` to produce the static `dist/`. These checks do **not** prove immersive VR, hand tracking, readability or performance on hardware.

## Manual headset checklist (not yet completed)
- Enter VR with controllers and with hand tracking enabled.
- Verify controller rays hit the physical phone and all props.
- Pinch and carry the actual phone; confirm it follows hand pose and never follows the head.
- Confirm hand dots, pinch volume and index-tip contact visually land on the same physical point.
- With `?handDebug=1`, compare the joint dots with the independent target-ray marker while still and while rotating the wrist.
- Throw the phone and notebook; confirm gravity, desk/room collisions, prop-to-prop contact and release velocity.
- Tap every screen button with the other index finger; test deliberate presses and jitter.
- Release, occlude a hand, exit VR and reconnect; confirm recovery keeps the phone reachable and the save unchanged.
- Toggle `ALCANCE` from a seated position and confirm the camera does not move.
- Operate lamp, monitor and drawer with hands and controller.
- Measure frame time/FPS and review comfort on device.

## Known limitations
- The room mixes six local scanned Poly Haven furniture models with procedural props; no final characters, voice or music.
- Hand tracking, pinch/tap thresholds, seated reach and performance have not been tested on physical Quest 3 hardware here.
- Index tapping is a depth/bounds heuristic, not a physical finger collider; false positives and text legibility need device tuning.
- No teleportation, full-body avatar/IK, finger haptics, LLM dialogue or venue gameplay.
- Substance branches do not implement perception effects; non-DMT branches end at a placeholder.
- No tunnel or deployment changes are part of this revision.
