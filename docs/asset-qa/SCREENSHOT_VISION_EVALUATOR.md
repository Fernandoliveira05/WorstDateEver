# Screenshot-driven multimodal asset evaluator

## Mandatory distinction

There are TWO independent approvals per asset:

- `visual_model_approval`: isolated model screenshot fidelity + geometry/material quality + licensing and geometry audit
- `interaction_approval`: screenshots and runtime evidence of fingers/palm contacting the object across grips, angles, states and engines

`production_approved` requires both passes where interaction applies, technical QA and a human review. If it is world-static, interaction approval is `N/A` with explicit reason, not false.

## Ingest a candidate

One `asset_id` from `inventories/catalog.csv`, original source URL/license, downloaded model hash, rigged/unrigged flag, reference art from `references/` plus existing project approved assets, and its interaction profile from `qa/HAND_INTERACTION_MATRIX.csv`.

Never evaluate only on the source provider's marketing preview. Render the **actual downloaded file** in our viewer, Blender and target engine. If an image isn't available, mark `MISSING_EVIDENCE` instead of hallucinating a score.

## Capture plan

1. **Blender turntable**: `front.png`, `back.png`, `left.png`, `right.png`, `top.png`, `bottom.png`, `three_quarter_left.png`, `three_quarter_right.png`; preserve material and normal visibility, use consistent lighting and controlled camera coordinates.
2. **In-scene**: `vr_30cm.png`, `vr_60cm.png`, `vr_100cm.png`, `vr_low_light.png`, `wireframe.png`, `collider.png`; capture native Quest 3 when practical.
3. **Mechanics**: `open_0.png`, `open_50.png`, `open_100.png`, or equivalent specific manipulation phases, if applicable.
4. **Hand poses**: `left/right__az{0,45,...,315}__pitch{minus30,0,plus30}__grip.png` for grabbable objects, plus `held_front.png`, `held_back.png`, `held_side.png`, `released.png`. For very many assets, generated deterministic synthetic rigs provide exhaustive angle evidence; P0 hero props additionally require actual captured controller and tracked-hand interaction evidence on Quest.
5. **Comparison montage**: reference vs candidate; with at least one image at correct use scale. Do not feed the evaluator a collage with unreadably small tiles: pass individual screenshots and labeled comparison groups.

For each screenshot record `timestamp`, engine, renderer, actual file hash, camera pose, object pose, hand pose/input source, grip profile, physical units, light preset and scene ID.

## What the vision evaluator must assess

**Model itself:** recognizable silhouette, faithful rounded/toy-like details, material color and softness, real close-up detail, actual object interior/underside, visible defects (z-fighting, clipping, reversed normals, seams, texture stretching, duplicate surfaces, flickering). Flag visual mismatches to the specific original concept, not to some imagined new style.

**Object while gripped:** Does the hand contact the intended affordance surface? Do individual fingers wrap/oppose naturally? Are fingers passing through handles or rims? Does the wrist over-twist? Is the object oriented usefully without hiding the UI? Does the object float away from palm or collapse into fist? Are state-change parts in sensible positions? Are materials stable under different lighting and perspective? Are left and right symmetric when expected?

**Video/frame sequence:** screenshot-by-screenshot contact consistency isn't enough; a short clip of pickup → rotate → use → re-grab → release must pass jitter, teleports, transitions and haptics/physics sanity via engine logs and human headset QA. The vision model may review extracted sequence frames but cannot infer haptics or unobserved movement.

## Vision evaluation prompt (use with a DIFFERENT model than the generator if possible)

> You are an independent VR game technical-art reviewer. You have reference artwork, verified project-approved in-game style examples, the actual candidate's screenshots from multiple angles, and screenshots showing left/right virtual and tracked hands gripping it. Judge THIS asset, not the quality of the marketing photo. For each submitted angle identify visible defects with filename and approximate image location. Determine whether the model visually matches the rounded, warm, matte Worst Date Ever style and whether the hand's fingers and palm contact its intended grip region naturally. Look for clipping, z-fighting, inverted faces, floating connections, handle thickness errors, grip pose misalignment, wrist contortion and inability to read/operate the object. Distinguish true failures, uncertainty and camera occlusion. Give actionable mesh/grip changes; do not approve missing views or claim that a screenshot proves real VR performance. Return JSON conforming exactly to `qa/vision_review.schema.json`.

## Scoring and decisions

Each axis uses integer 1–5 (1 unusable, 3 provisional, 4 good enough for current style, 5 excellent): `silhouette`, `materials`, `detail`, `vr_readability`, `visible_integrity`, plus `grip_alignment`, `finger_contact`, `handedness`, `pose_stability`, `functional_states` when grabbable. Require **at least 4 on every applicable axis** and no blocking defect; do not average away one bad hand angle.

Decision enum: `REJECT`, `REWORK`, `MISSING_EVIDENCE`, `VISION_PASS_PENDING_HUMAN`, `APPROVED_BY_HUMAN`. The vision model may emit no higher than `VISION_PASS_PENDING_HUMAN`. Licenses, source integrity and headset measurements are separate technical/human inputs, never made up by the model.

If multiple angles contradict each other, flag both and request reproduction; don't select only the flattering front render.

## Must report

- A list of every failing screenshot with exact filename, defect, severity and fix suggestion.
- Views that are missing, blurred, too small or otherwise impossible to review.
- Changes to model geometry, UV/materials, collider, handedness, grip anchor or finger pose that would resolve failures.
- Release decision and verified human reviewer identifier, with date and evidence paths.
- A re-render loop after every fix; retain old/failing screenshots for audit.

## Coverage metrics

Define **evidence coverage** = submitted required screenshots / applicable required screenshots. `PASS` requires 100% for P0 assets, and 100% of *defined applicable* required views for P1/P2; exemptions must name a non-applicable state/direction and reason. For untestable angles due to mesh occlusion, choose nearest feasible approach and record the limitation.

Do not claim `ANGLE_PASS` from a model's isolated renders without the hand visibly holding it. Do not claim Quest interaction approval from synthetic hand animations alone.
