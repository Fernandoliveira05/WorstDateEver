# Worst Date Ever — implementation and parity audit (2026-11-27)

Scope of this pass: lighting/atmosphere, a shared sky palette, the first physical
wardrobe-door implementation (A-Frame), shared sourced assets, breakage for
date tableware, and a first transfer of sourced furniture/props into the
A-Frame date maps.

Hardware validation: **not performed**. No Quest 3 was connected and the Unity
Android Build Support module is still absent. Everything below was checked on
the Linux desktop player and in headless Chromium (SwiftShader).

## Verification commands

```bash
# A-Frame/Three.js
npm test                 # 132/132 passing after this pass
npm run build            # Vite production build succeeds
npm run dev              # then open http://localhost:5173/?venue=sushi (dev hook)

# Unity Linux player
Unity -batchmode -nographics -quit -projectPath unity \
  -executeMethod WorstDateEver.Editor.BuildLinux.Build
unity/Builds/Linux/WorstDateEver.x86_64 -venue caio|rafa|bia|luiza
```

## Feature matrix

| Area | Unity | A-Frame/WebXR | Notes |
| --- | --- | --- | --- |
| Bedroom physical room door | yes (hand push + latch) | yes | Existing systems retained |
| Wardrobe doors | no 2-door wardrobe asset in the Unity room | **physical drag implemented** (no click-toggle) | Web doors follow hand X, clamp 0–95°, hold partial angles, support both hands through the shared pointer/hand paths. Unity still needs the wardrobe asset + hinge grab. |
| Wardrobe bottom drawer | existing cabinet drawers | physical slide (pre-existing) | Not unified |
| Shared sky palette | `SkyPalette.cs` used by picnic and bedroom window | `content/shared/sky.json` used by picnic and bedroom sky shader | Same day/golden/night colours |
| Picnic sky/sun/clouds | yes (procedural skybox + sun + clouds) | yes (gradient skydome + sun + clouds) | Web park now also uses sourced trees/benches/lamp/flower patches |
| Sushi lighting | warm amber key, ambient and pendant profile | warm amber hemisphere/key + pendant point lights | Bar is deliberately low-key |
| Bistro lighting | warm key/pendants | warm key/pendants; pink tablecloths | |
| Bar lighting | low ambient, warm pendant, red/orange neon spill | low ambient, neon point lights, illuminated shelves | Web still lacks the near-backdrop intimacy |
| Date maps use sourced GLBs | yes (60 models, `Sourced.asset`) | **partial**: tables/chairs, main food props and park trees/benches/lamp now use the same GLBs | A-Frame still builds walls/counters/backdrop primitives |
| Shared asset manifest | `Sourced.asset` + model folders | `content/shared/sourced-assets.json` + `public/assets/sourced` | Same 60 CC0 files, same IDs |
| Breakable mugs/plates/bottles | **new** `BreakableProp` on date tableware (7–9 shards, spill decal, synth shatter, 4–6 s cleanup) | bedroom breakage already existed; **date venue food props now shatter** on impact with fragments and cleanup | No per-object pre-fractured authored meshes yet; NPC reaction hooks are minimal |
| Hand poses / grip validation | new sourced props reuse existing generic grab colliders; no new evidence capture | sourced props use existing physics/grip path; no new per-model grip anchors | Not yet evaluated with the 8-angle hand QA packet |
| A-Frame date gameplay systems | yes | yes (director, events, voice, seat IK, physical actions) | Unchanged by this pass |
| Physical date actions | no | yes | Still the largest gameplay gap |
| Candy machine / new 3D wardrobe / café | corridor cabinet only; no candy machine; no new wardrobe; café not reachable | corridor candy shop exists; wardrobe exists | |
| Quest build | blocked (Android module missing) | WebXR path exists | No hardware test |

## What changed in code

### A-Frame
- `src/bedroom-wardrobe.js` — replaced click animation with independent physical
  hinge drag for `door-left` and `door-right` (95° limit, partial positions,
  velocity-aware release, both hands via the shared input path).
- `src/main.js` — wardrobe pointer/hand drag plumbing, debug venue hook
  (`?venue=sushi|bistro|bar|picnic`) and DEV `window.__wde` QA handle.
- `src/date/sourced.js` — cached GLB loader/fitter, scene model table.
- `src/date/venue.js` — sourced tables/chairs/food props, venue lighting
  profiles, bar neon, bistro tablecloths/valance/curtains, sushi wave
  mural/counter/lanterns, bar bunting/shelves/neon.
- `src/date/picnic.js` — sourced park trees/benches/lamp/flowers/mushrooms and
  shared sky/sun/clouds.
- `src/bedroom-scenery.js` — sky shader now consumes `content/shared/sky.json`.
- `content/shared/sky.json`, `content/shared/sourced-assets.json`.
- `public/assets/sourced/` — 60 shared CC0 GLBs.

### Unity
- `SkyPalette.cs` — shared sky colours for the bedroom window and picnic.
- `BedroomWindowView.cs` — uses the shared palette for sun, clouds and ambient.
- `FirstDatePicnic.cs` — palette sky/sun/clouds; sourced park models; breakable
  props.
- `FirstDateVenue.cs` — per-venue ambient/key/pendant lighting; bar neon spill;
  `NotifyBreak`.
- `BreakableProp.cs` — impact threshold, shard fragments, spill decal, shatter
  audio, controlled lifetimes.
- Date props attach `BreakableProp` from both layout and sourced prop paths.

## Evidence

Unity: [picnic](evidence/unity-picnic.png), [sushi](evidence/unity-sushi.png),
[bistro](evidence/unity-bistro.png), [bar](evidence/unity-bar.png).

A-Frame: [picnic](evidence/web-picnic.png), [sushi](evidence/web-sushi.png),
[bistro](evidence/web-bistro.png), [bar](evidence/web-bar.png),
[bedroom](evidence/web-wardrobe.png).

The screenshots include the host's “Consumo Excessivo” system monitor toast; it
is not part of the game.

## Known issues / not yet done

1. **Unity wardrobe**: the Quaternius Closet is now imported and placed, with
   hand-contact hinge doors. It still needs a clean visual re-capture and a
   tracked-hand test; the old cabinet remains in the scene as extra furniture.
2. **A-Frame map fidelity**: sourced furniture/props/bottles are in, but walls,
   counters, sushi/bistro structural decor and the near venue backdrops are still
   primitive; the web date scenes do not yet match the Unity close-backdrop composition.
3. **Hand-grip evidence**: the new sourced props need per-model grip anchors and
   the required multi-angle held screenshots. They currently reuse generic
   collider grabbing.
4. **Breakage**: no authored pre-fractured variants; Unity breakage uses runtime
   shards. Date-venue NPC reactions are limited to the impact sound.
5. **Quest performance/validation**: not tested on hardware.
6. **Physical date actions** remain web-only; the Unity date still lacks the six
   actions and QTE/skill flow.
7. **Density pass**: both engines now add back-wall decor, park extras, kiosk
   counter and venue staff. Evidence and remaining limits are in
   `docs/environment-density-2026-11-27.md`.
7. **Café** environment remains unreachable; the current four personas map to
   picnic/sushi/bistro/bar.
