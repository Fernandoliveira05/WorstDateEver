# Worst Date Ever — Bedroom VR prop & interaction guide (v2)

## Visual direction: keep the original cozy room

This revision uses the **earlier soft, lived-in bedroom as the main visual reference**: lavender walls, cream trim, warm wood, softened teal furniture, generous bedding, plants, warm lighting and small pink accents. **Neutral does not mean monochrome, masculine, or sterile.** Reduce the repeated heart/floral motifs, but keep a few playful touches; add interests and objects that can belong to any protagonist, not stereotypically gendered replacements.

The player may be **male or female**; bedroom layout, gameplay functionality, core asset library and interaction affordances stay the same. Player appearance/outfit and optional personal decorations are separate configurable layers. Do not infer personality, sexual orientation or dating preferences from gender.

**Art references:** existing approved project props are the source of truth. Adopt *Job Simulator*'s direct, tactile VR interactions and readable silhouettes **without overwriting the game's established meshes/materials**. Use the images as a concept guide, not a demand to replace already-approved assets.

### Color and material direction

- Dusty lavender walls and cream trim; honey-colored wood surfaces.
- Muted teal furniture, soft plum, dusty rose accents, tarnished brass details.
- Rounded toy-like proportions; mostly matte materials; soft contact shadows.
- Keep posters, photos, books, plants, headphones, stationery and clothing varied; a few hearts/flowers are okay, but no room-wide gender signaling.
- Day: bright, safe and cozy. Night: the *same* recognizable bedroom with more ominous shadows and a dark corridor beyond the door.

### Quest 3 interaction contract

- **Grab & Throw:** direct controller/hand grip, release velocity, lightweight rigidbodies; optional ray-grab for seated play.
- **Press & Toggle:** large target surfaces with haptic/audio confirmation, accessible controller-ray fallback.
- **Pull & Open:** hinge/slider/cord constraints instead of unconstrained rigidbodies.
- **Rotate & Adjust:** fan angle, lamp aim, sound level, mirror rotation, etc.
- **Inspect & Use:** close-up readable UI/text, stable anchored interactions, physical reach without excessive leaning.
- **Scripted reaction:** audio, lighting, animation and LLM/story event cues; never force head rotation or camera shake.

**Priority:** P0 = opening sequence critical; P1 = enriches the playable room; P2 = polish. A few supplemental props are **optional additions** inspired by the neutral room concept and are not claims that those objects appeared in all three original renders.

## Complete bedroom inventory

### Furniture & set pieces (12)

| ID | Object | How it works in VR | Gameplay reaction / purpose | Priority |
|---|---|---|---|---|
| PROP-001 | Wooden bed | Sit/lie; grab nearby bedding; use bedside phone | Player spawn and resting interaction | P0 |
| PROP-002 | Teal nightstand | Pull drawer; store/retrieve small items | Hidden object or comedy prop reveal | P0 |
| PROP-003 | Two-door teal wardrobe | Open both doors; slide bottom drawer; pick outfit | Changes avatar outfit before date | P0 |
| PROP-004 | Wooden/teal desk | Place items; knock objects; read notes | Main date-preparation workspace | P0 |
| PROP-005 | Three-drawer teal dresser | Pull drawers; rummage and inspect contents | Uncovers outfit or silly keepsake | P1 |
| PROP-006 | Teal chair | Grab to move; sit; bump against desk | Comfort and physical comedy | P1 |
| PROP-007 | Cream bedroom door | Press handle; open/close (night only) | Night horror corridor reveal | P0 |
| PROP-008 | Wood-framed window | Lean/look out; optionally crack window | Shows Brazilian city and day/night | P1 |
| PROP-009 | Cream curtains with brass rod | Grab fabric edge; pull open or shut; brush | Light control, tactile reaction | P0 |
| PROP-010 | Floral shag rug | Walk over; nudge light objects on it | Footstep ambience and hidden clutter | P2 |
| PROP-011 | Honey-wood wall shelf | Grab books or objects off; knock down an item | Environmental storytelling | P1 |
| PROP-012 | Pink laundry basket | Grab, carry, drop clothing into basket | Dress-up cleanup gag | P1 |

### Electronics & lighting (15)

| ID | Object | How it works in VR | Gameplay reaction / purpose | Priority |
|---|---|---|---|---|
| PROP-013 | Pink iClona phone | Grab, tilt, tap, swipe Deu Ruim profiles, receive match notification | Primary narrative and match progression | P0 |
| PROP-014 | Heart-sticker laptop | Open lid, tap keys, inspect browser | Extra jokes and story hints | P1 |
| PROP-015 | Pink headphones | Grab, wear, remove, throw | Audio gag and mood selection | P1 |
| PROP-016 | Standing fan | Toggle, rotate head, pull cord, adjust oscillation | Changes moving air, sound and curtains | P0 |
| PROP-017 | Fan pull cord | Pull to cycle fan speed | Comic jingle or abrupt gust | P0 |
| PROP-018 | Bedside mushroom lamp | Tap switch; pick up if unplugged | Warm/cold mood change | P0 |
| PROP-019 | Pink analog alarm clock | Grab, shake, push bell/button | Two-hours-later transition and alarm gag | P1 |
| PROP-020 | Purple heart water bottle | Grab, unscrew cap, pretend to drink, knock over | Anxiety and water spill gag | P1 |
| PROP-021 | Pink lava lamp | Flip switch; observe moving blobs | Light cue and spooky silhouettes | P1 |
| PROP-022 | Amber ceiling pendant lamp | Toggle wall switch; observe illumination | Day/night lighting mood | P1 |
| PROP-023 | Illuminated vanity mirror | Touch button; rotate mirror; inspect appearance | Dress-up / avatar appearance | P1 |
| PROP-024 | Adjustable desk lamp | Rotate head; tap power | Cast silhouettes / horror foreshadowing | P1 |
| PROP-025 | Retro CRT television | Press buttons, switch channels, static | Absurd background programming and jump cue | P2 |
| PROP-026 | Small wall light switch | Click on/off | Bedroom lights and corridor contrast | P0 |
| PROP-027 | Corridor amber bulb | Observe from threshold; flicker script | Nighttime suspense | P1 |

### Textiles & clothing (10)

| ID | Object | How it works in VR | Gameplay reaction / purpose | Priority |
|---|---|---|---|---|
| PROP-028 | Pink heart pillow | Grab, squeeze, throw, place on bed | Comedic pillow bonk | P1 |
| PROP-029 | White daisy cushion | Grab, squeeze, throw | Playful physics toy | P1 |
| PROP-030 | Teal hoodie / sweater | Grab, toss, wear via outfit socket | Outfit preparation | P0 |
| PROP-031 | Pink checkered bedspread | Tug corners, uncover objects | Phone discovery and room mess | P1 |
| PROP-032 | Floral duvet | Tug, fold, fluff, hide items | Casual comfort and physical chaos | P1 |
| PROP-033 | Dusty rose throw blanket | Grab, pull, drape over bed/chair | Outfit mess / comedy | P1 |
| PROP-034 | Flower-print tote bag | Unhook, carry, inspect inside | Random pre-date accessory | P1 |
| PROP-035 | Flip-flops / slippers | Grab, wear or throw | Packing gag and floor clutter | P2 |
| PROP-036 | Purple garment on chair | Grab, toss, equip | Outfit choice option | P1 |
| PROP-037 | Laundry pile in hamper | Move garments, drop into bin | Optional tidying gag | P2 |

### Decor & small props (21)

| ID | Object | How it works in VR | Gameplay reaction / purpose | Priority |
|---|---|---|---|---|
| PROP-038 | Trailing pothos houseplant | Touch leaves; grab pot; knock it over | Physical reactions and soil spill | P1 |
| PROP-039 | Wardrobe-top hanging plant | Brush leaves; tug a strand | Plant sways when fan activates | P2 |
| PROP-040 | Sunset Rio poster | Inspect; pull from frame or knock askew | Brazilian visual storytelling | P1 |
| PROP-041 | Cat portrait | Grab frame, rotate or knock off wall | Physical-comedy wall art | P1 |
| PROP-042 | Framed heart print | Remove from hook; rotate, inspect | Dating motif / minor hidden clue | P1 |
| PROP-043 | Photo-strip / Polaroids | Grab, flip, inspect close up | Clues and humor about the protagonist life | P1 |
| PROP-044 | Gold door hooks | Hang / remove bag and accessories | Physical storage interaction | P1 |
| PROP-045 | Pink storage basket on wardrobe | Lift down, open, rummage | Find silly forgotten objects | P1 |
| PROP-046 | Heart-pattern mug | Grab, tilt, place, spill | Coffee spill joke | P1 |
| PROP-047 | Makeup brush holder | Pick up brushes; use mirror | Date preparation | P1 |
| PROP-048 | Perfume and skincare bottles | Grab, twist cap, spray | Pre-date anxiety, reaction or joke | P1 |
| PROP-049 | Pen cup with markers | Pick up pens, scribble or knock cup over | Notes/physical comedy | P1 |
| PROP-050 | Yellow sticky note pad | Peel and stick notes | Reminders and hidden dialogue | P1 |
| PROP-051 | Stack of books | Pick up, stack, read cover, drop | Book-falling gag | P1 |
| PROP-052 | Wire memo / photo board | Rearrange notes/photos; inspect clues | Player history and foreshadowing | P1 |
| PROP-053 | Lucky cat figurine | Tap its paw, pick up, put on shelf | Absurd small animation | P1 |
| PROP-054 | Stickers on teal dresser | Inspect, peel / reposition | Personalization of room | P2 |
| PROP-055 | Rio landscape photo wall | Look close; remove frame / change angle | Local setting and environmental clues | P2 |
| PROP-056 | Little beach picture frame | Inspect, tilt, knock down | Room characterization | P2 |
| PROP-057 | Spiral notebook | Pick up, turn pages, write | Pre-date checklist or panic journal | P1 |
| PROP-058 | Wastepaper bin | Grab trash, drop items inside | Room cleanup, miss / hit gag | P2 |

### Set dressing & horror (5)

| ID | Object | How it works in VR | Gameplay reaction / purpose | Priority |
|---|---|---|---|---|
| PROP-059 | Wallpaper or wall trim | Observe; respond to light and time shift | Bedroom mood; consistent style | P2 |
| PROP-060 | Honey wood floorboards | Walk and listen for creaks | Footstep texture / location cue | P2 |
| PROP-061 | Doorway into dark corridor | Open from bedroom at night; peek or step closer | Horror transition without forcing headset | P0 |
| PROP-062 | Dark corridor runner | Walk on; hear changing footsteps | Directional suspense | P1 |
| PROP-063 | Big-eyed grinning creature | Look toward it; it vanishes; piano sting | Optional scare event, no forced camera motion | P0 |

### Electronics & devices (2)

| ID | Object | How it works in VR | Gameplay reaction / purpose | Priority |
|---|---|---|---|---|
| PROP-064 | Game controller | Pick up; press buttons; drop on bed | Optional microgame, dialogue joke and tactile button testing | P1 |
| PROP-070 | Small speaker | Toggle, change volume, pick up | Ambient music and dialogue interruptions | P1 |

### Clothing & personal items (7)

| ID | Object | How it works in VR | Gameplay reaction / purpose | Priority |
|---|---|---|---|---|
| PROP-065 | Backpack | Pick up; open zip; stash objects | Before-date packing, hidden prop reveal | P1 |
| PROP-066 | Sneakers | Pick up; pair; equip at closet | Outfit selection and physical comedy | P1 |
| PROP-067 | Cap | Wear, remove, throw, inspect in mirror | Gender-neutral outfit customization | P2 |
| PROP-068 | Glasses | Pick up, wear, clean, inspect | Date prep and visual gag | P2 |
| PROP-071 | Folded shirts | Unfold, throw, equip, store in drawer | Alternative outfits available to any avatar | P1 |
| PROP-072 | Toiletry pouch | Unzip, open, put items in/out | Grooming and pre-date preparation | P1 |
| PROP-073 | Wristwatch | Wear, tap, check time | Two-hours-later time cue, anxiety gag | P2 |

### Décor & small props (1)

| ID | Object | How it works in VR | Gameplay reaction / purpose | Priority |
|---|---|---|---|---|
| PROP-069 | Skateboard | Pick up, spin wheels, knock against wall | Humorous physical feedback; environmental character | P2 |

## Production / interaction implementation notes

1. Keep every prop's visual identity consistent with existing approved models; reuse and tweak models before generating new ones.
2. Prefab schema per prop: `id`, `prefabKey`, `scaleMeters`, `interactionTypes`, `grabAnchor`, `grabDistance`, `rigidbodyPolicy`, `colliderPreset`, `handPose`, `soundCue`, `hapticCue`, `storyEvent`, `questLOD`, `referenceImage`.
3. Shared event names between A-Frame/WebXR and Unity: `prop.grabbed`, `prop.released`, `prop.activated`, `prop.opened`, `prop.closed`, `outfit.changed`, `phone.deu_ruim.opened`, `scene.night_started`, `corridor.creature_spotted`.
4. Avoid physics on static architectural shells and inactive prop piles; use sleeping bodies, constrained joints, instancing, occlusion, baked lighting and pooled effects where appropriate. Confirm performance on actual Quest 3; do not invent polygon budgets before profiling.
5. **Asset approval gate:** render candidate front/back/sides/top + scene context; evaluate against *approved current in-project assets* for style; run deterministic technical checks (topology, scale, pivot, collider, material count, texture limits, license). Vision evaluation supports the decision but does not replace a human reviewer for ambiguous cases.
6. Do not use flashing, aggressive perspective warps or involuntary HMD motion for scares. The night creature is an optional world event visible in the doorway, with a quick exit and piano cue.

## First playable milestone (P0)

Bedroom spawn; iClona pickup; Deu Ruim phone UI; wardrobe outfit change; drawers; fan + pull cord; curtains; bedside and wall lights; bedroom door/night corridor; optional creature appear/vanish; seated/standing and ray-fallback tests on Quest 3.

## Image provenance

`bedroom-guide-v2.png` is a new conceptual style/interaction board, **not** game-ready geometry. `assets/` contains 63 prior per-object visual references: 12 extracted from an isolated-prop sheet, 51 cropped from room illustrations; they are **not 3D meshes**. Items 064–073 are optional extensions without an isolated image.
