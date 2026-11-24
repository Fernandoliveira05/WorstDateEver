# Art Direction — INHERIT Existing Style; Approach Job Simulator Interactions

**Status:** binding requirements for feature 002. The project's **existing/approved style is source of truth**; this document does NOT establish a new style. If the current repository has more recent props, models, materials and characters than the provided bedroom starter, inventory THOSE, not the starter's placeholders.

## Executor instruction (MUST)
1. Inspect the current repository, existing in-game models, project screenshots, material library, prop types, rigs, textures, prefab conventions, and assets already approved for the bedroom. Do NOT replace them with an imported pack, an invented palette, or a copied visual from another game.
2. Create `assets/style-baseline.json` with version, 3+ representative approved props (if present), 1+ approved NPC/rig (if present), at least one approved scene screenshot (if present), observed geometry/shader/color conventions, unit scale, collider conventions and source hashes. If the reference assets do not exist in the provided repository, mark the baseline **incomplete** and require the actual game assets from the maintainer before claiming quality approval.
3. Reuse existing props and models whenever reasonable. For a missing table, glass, chair, server, food prop, etc., generate/adapt to **our established** shape/material/palette/model style. Source external assets only when clearly needed and licensable; they must be transformed into our conventions.
4. Approximate **Job Simulator** only in interaction design and perceptual affordances: a prop reads instantly from the table; grab handles, click targets and colliders are forgiving; physical interactions communicate state with playful sounds and animations; table clutter remains usable in VR. Do not change the original stylization just to look more like Job Simulator.
5. Approximate **Accounting+** only in comic pacing, overreaction, awkward speech and reactive environment, without copying copyrighted characters or voice performances. Preserve existing character stylization and proportions.
6. Submit every newly generated or downloaded asset to `asset-evaluator.md`. Generated art is not integrated unless the evaluator and technical gates approve it.

## Inheritance precedence
`existing approved in-game assets + documented artistic choices` > `existing playable art direction` > `art team's specific new approval` > `Job Simulator interaction reference` > `any external suggested asset collection`.

**Never infer that our style is low-poly, a particular fixed color palette, flat-shaded, PS1, anime, or photorealistic unless actual approved assets demonstrate it.** Preserve unknown properties until baseline review. This avoids silent art-direction drift.

## Visual and gameplay acceptance checks
- A new prop beside 3 existing in-project props is visibly part of the same game (silhouette, scale, topology treatment, roughness/shading, texture density and saturation).
- The new prop's use is as obvious as a Job Simulator object **without changing its visual family**.
- A generated waiter/date is consistent with approved player/NPC art and rigging (if available).
- Grab origin, collision bounds, labels, motion and controller targets work for seated Quest use.
- Background density, lighting and animation do not degrade Quest 3 framerate; measure on device.

## Handling missing style evidence
No guessed mood board, fabricated palette, or invented reference pack counts as the established style. The executor can build **placeholder graybox interaction logic** while marking style-dependent models as pending, then replace them after the baseline arrives. This is an explicit blocker for final art acceptance, not for implementing pathing or speech.

## Reference boundaries
*Job Simulator* and *Accounting+* are inspirational examples. Do not extract or ship their models, materials, audio, voices, screenshots as textures, brand UI or distinctive character likenesses.
