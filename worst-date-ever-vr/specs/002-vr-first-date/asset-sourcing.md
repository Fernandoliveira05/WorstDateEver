# Asset Reuse / Generation Workflow — Existing Project Style First

## Hard rule
**Do NOT choose a new style or swap the project's existing props/model families for an arbitrary model pack.** The user already has a game aesthetic and types of props/models in development. This feature must extend those established assets. Job Simulator is only a benchmark for how **legible and fun-to-handle** the props feel in VR.

## Priority order
1. **Reuse** exact existing project props, models, materials, prefabs and rigged characters where appropriate.
2. **Variant**: generate additional colorways, scaled variants or animation variants from approved assets while preserving same material/topology/rig conventions.
3. **Generate** a missing model from an approved project exemplar and a textual spec (e.g., 'restaurant chair in the same established style'), using authorized references.
4. **Acquire/adapt** an external model with verified license, then reshape/retexture/re-rig to match our existing style; never import as-is without evaluation.
5. **Graybox** missing items only until approved assets are available.

## Required inventory before searching
Create `assets/style-baseline.json` and `assets/asset-inventory.csv` by examining the working repo. Identify candidates for table, chair, mug, plate, menu, character, door, glass, service tray, props, existing ambience and materials. Include a repository-relative path, asset SHA256, original material references, usage restrictions, reuse decisions and approved examples.

## Prop generation input contract
For every generated prop, feed generator: `assetId`, function/interaction description, target dimensions in meters, **approved project exemplar IDs**, allowed material/texture/rig families, required grab pivots, collision needs, and platform export targets. Add 'match our current approved project style' as a mandatory direction. 'Increase Job Simulator-like readable affordances' is only an optional secondary qualifier. Generate an original asset, never clone another game's model.

## Mandatory review sequence
- Capture 6 consistent turntable angles, wireframe/mesh-stats export, scale/units, and a scene image with at least two approved in-project props for context.
- Run `AssetEvaluator` vision model with approved in-project exemplars and rubric. Save structured per-dimension scores and evidence, not just pass/fail.
- Run deterministic mesh audit: geometry integrity, UV/textures/materials, applied transforms, triangle/texture/material budgets **relative to the project's actual budgets**, collision, grip pivot, rig/animations where required, and source/license/attribution.
- For assets that enter a Quest build, validate actual runtime metrics and collider/grab ergonomics in both WebXR and Unity.
- Store evaluator version, baseline version, generated model hash, input source and decision. `approved` is the only shippable state; `needs_revision`, `rejected`, `human_review` and `pending_device_validation` remain staged. Human sign-off for key hero assets and any model override.

## Venue-specific needs, filled from baseline first
- Shared: table, chair, glasses, napkins, plates, waiter/service tray, 3–5 background customers, restaurant facade, bathroom door, serving counter, safe comedic spill effect.
- Café (`caio`): coffee/teacup, pastry, decorative books, kombucha-style fictional bottle.
- Sushi (`rafa`): generic restaurant props, chopsticks, stylized menu, sushi counter, original signs.
- Bistro (`bia`): stylish menu, plated food, dessert, decorative lighting; use fictional branding.
- Bar (`luiza`): snack plates, counter, jukebox/props, themed signage with original imagery.

**No downloaded source pack is assumed to be installed, licensed or approved.** If a new candidate is discovered, record exact license and creator, then evaluate against real project exemplars.
