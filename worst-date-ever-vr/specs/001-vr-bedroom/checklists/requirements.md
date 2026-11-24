# Requirements Quality Checklist

- [x] Feature scope excludes restaurant scenes, driving and LLM runtime.
- [x] VR hand and controller input are described independently of desktop fallback.
- [x] Pinch-pickup, index-tap debouncing and tracking-loss recovery are specified.
- [x] Phone interface is one physical world-space prop/screen; no detached panel or head-lock.
- [x] Gender and date preference are modeled independently.
- [x] Player flows have observable acceptance criteria.
- [x] Drug decisions are fictional flags, not real-life drug instructions.
- [x] Out-of-scope items are documented.
- [x] State storage and reset behavior are specified.
- [x] Hardware-dependent acceptance criteria are explicitly not yet validated.
- [x] Hand visuals, grabs and index taps share one XR frame/reference-space pipeline mapped through the rig.
- [x] Phone and notebook have gravity, static room/desk collisions, prop-to-prop contacts and kinematic release velocity.
- [x] Six CC0 Poly Haven models are locally served with exact attribution and Quest-compatible WebP glTF textures.
- [ ] Quest in-headset hardware tests are actually performed.
- [ ] Quest hand tracking, pinch/tap thresholds and seated reach are actually tested on device.
- [ ] Rig-aligned hand/contact alignment and rigid-body feel are actually tested on device.
- [ ] Comfort and frame-rate budget is confirmed on device.
