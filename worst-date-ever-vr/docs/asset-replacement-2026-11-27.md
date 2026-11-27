# Asset replacement and visual audit — 2026-11-27

This is the first mandatory asset-replacement pass. It records what was inspected,
what was actually downloaded, what was integrated, and what is still rejected or
unverified. Nothing below is marked “visually approved”.

## Audit: current placeholders and gaps

| Environment | Object (before) | Problem | Candidate searched | Status |
| --- | --- | --- | --- | --- |
| Bedroom | Old low cabinet/procedural sideboard; no 2-door wardrobe | Recognizable wardrobe missing; no hinged doors | Quaternius **Closet** (Poly Pizza `BHEVb1DIuH`), Quaternius **Short Closet** (`ND4Z53Ne4C`), existing 3dassets `wardrobe_2door.glb` | Quaternius Closet selected for Unity; existing validated 3dassets wardrobe remains in A-Frame |
| Picnic | Procedural striped kiosk (boxes) | Simplified geometry, no real structure/counter | Quaternius **Market Stand** (`DGIM5HGISb`), Quaternius **Market Stalls Compact** (`fmHUuX9AS3`) | Market Stand integrated both engines; review still open (see below) |
| Picnic | Trees, benches, lamp, flower patches | Already replaced by sourced 3dassets GLBs | — | Keep |
| Picnic | Path/lawn/flower stems | Architectural/ground primitives | Nature packs not yet downloaded | Open |
| Sushi | Wave mural, counter, noren, lanterns | Combined primitive mural/counter; lanterns already a material | Quaternius Sushi Restaurant Kit (CC0, not yet downloaded) | Open |
| Sushi | Tables/chairs/sushi/sake/soy | Already sourced 3dassets | — | Keep |
| Bistro | Near window/valance/curtains, wall menu | Architectural primitives | KayKit/Kenney restaurant/furniture packs (not downloaded) | Open |
| Bistro | Tables/chairs/cake/coffee | Already sourced | — | Keep |
| Bar | Shelf bottles | Identical primitives, no label/silhouette variation | Quaternius **Bottle** (`FAHsHFXfTf`), MiniPoly Old Bottle (`NxbygmpVwR`) | Quaternius Bottle integrated both engines |
| Bar | Jukebox | Existing GLB reads as an architectural arch at close range | No suitable CC0 jukebox found; CC-BY boomboxes rejected for licensing/attribution overhead | Keep old model hidden; open |
| Bar | Shelves, neon sign, bunting | Structural/decorative primitives | No structural pack downloaded yet | Open |
| City/outdoor | Bedroom window neighbourhood | Imported low-detail backdrop; not audited in depth | Kenney City Kits (download blocked, see below) | Open |

## Downloaded candidates (actual files)

| ID | Title | Creator | Licence | Source | Bytes | SHA-256 | Use |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| `DGIM5HGISb` | Market Stand | Quaternius | CC0 1.0 | https://poly.pizza/m/DGIM5HGISb | 84,992 | `19b9b99c…48d75` | Picnic kiosk (both) |
| `BHEVb1DIuH` | Closet | Quaternius | CC0 1.0 | https://poly.pizza/m/BHEVb1DIuH | 162,868 | `20c69ab0…00e84` | Unity wardrobe |
| `ND4Z53Ne4C` | Short Closet | Quaternius | CC0 1.0 | https://poly.pizza/m/ND4Z53Ne4C | 223,944 | `bdb15544…00740` | Rejected alternative |
| `fmHUuX9AS3` | Market Stalls Compact | Quaternius | CC0 1.0 | https://poly.pizza/m/fmHUuX9AS3 | 987,996 | `ceb40dec…b9e04` | Rejected: four stalls in one mesh |
| `FAHsHFXfTf` | Bottle | Quaternius | CC0 1.0 | https://poly.pizza/m/FAHsHFXfTf | 15,376 | `7245e262…181f6` | Bar shelf bottles |
| — | Kenney Furniture Kit | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit | 0 | — | Download returned 403; documented, not used |
| — | Quaternius Sushi Restaurant Kit | Quaternius | CC0 1.0 | https://quaternius.com/packs/sushirestaurantkit.html | 0 | — | Google Drive link only; not downloaded |

*Hashes above are abbreviated for display; full values are in `/tmp/asset-hashes.txt`
on the build host.*

Preview evidence:
[closet](./evidence/closet-preview.png),
[short closet](./evidence/short-closet-preview.webp),
[market stand](./evidence/market-stand-preview.webp),
[market stalls compact](./evidence/market-stalls-compact-preview.png).

## Candidate comparison

### Wardrobe
- **Quaternius Closet** — 2,988 tris, 3 materials, separate `Closet_LeftDoor` /
  `Closet_RightDoor` pivots, no rig, no textures; straightforward to import and
  fit. **Selected** for Unity because the door meshes are individually named.
- **Quaternius Short Closet** — 4,040 tris, two doors + two drawers; more complex
  than needed and the drawer geometry duplicates the existing bedroom drawer
  system. Rejected for this pass.
- **3dassets `wardrobe_2door.glb`** — already used in A-Frame and validated for
  hinge drag; adopted as the web source of truth rather than replacing it with a
  second wardrobe model.

### Picnic kiosk
- **Market Stand** — 1,548 tris, single stall, roof/wood; integrated. In the
  first in-game capture the camera saw the open side (reads as a pergola); the
  model was rotated 180° and the build repeated, but a clean in-game re-capture
  was blocked by the host compositor. Not approved yet.
- **Market Stalls Compact** — 14,164 tris but all four stalls are a single mesh;
  would require Blender separation. Rejected for this pass.
- **Procedural striped kiosk** — still retained as fallback and as the better
  visual match until the Market Stand’s service side is verified.

## Integration status

| Asset | Unity | A-Frame | Notes |
| --- | --- | --- | --- |
| Market Stand | `Sourced/market-stand.glb`, 61-entry registry | `public/assets/sourced/market-stand.glb` | Replaced kiosk model; rotation/review open |
| Quaternius Closet | `Models/Bedroom/Closet.glb`, scene instance, `BedroomWardrobe` + `BedroomWardrobeDoor` | Existing `wardrobe_2door.glb` | Unity doors use hand-contact hinge; rest-rotation fix applied. Re-capture pending. |
| Bottle | `Sourced/bar-bottle.glb`, 62-entry registry | `public/assets/sourced/bar-bottle.glb` | Used on bar shelves |
| Short Closet / Market Stalls | Not imported | Not imported | Rejected |

## Active interaction testing

- A-Frame wardrobe: physically dragged `door-left` through the real drag API;
  result progress `1.0`, door angle `-1.658 rad` (~95°), then a second drag was
  used for closing. This is not a click toggle. See `src/bedroom-wardrobe.js`.
- Unity wardrobe: `BedroomWardrobeDoor` tracks both hand tips through
  `BedroomHandContacts`, uses the door’s real hinge transform, clamps to 96°, and
  preserves the imported rest rotation. No Quest hardware was available to run
  the full controller/hand test; the desktop build cannot exercise tracked hands.
- Breakables: Unity `BreakableProp` and the A-Frame venue shatter path were
  compiled and exercised through the normal build, but no automated drop/thrown
  impact test has been recorded yet.

## Current evidence

Before: [Unity picnic with procedural kiosk](./evidence/unity-picnic-before-kiosk.png),
[Unity wardrobe before rest-rotation fix](./evidence/unity-wardrobe-before-rest-fix.png).

After: [Unity picnic with Market Stand](./evidence/unity-picnic-market-stand.png).

The “Consumo Excessivo” overlay is the host system monitor, not the game.

## Remaining limitations

1. Market Stand service side/rotation not approved; procedural kiosk remains the
   fallback.
2. Unity wardrobe rest-rotation fix needs a clean screenshot and a tracked-hand
   test; no Quest hardware.
3. Sushi Restaurant Kit, KayKit/Kenney restaurant and city packs, and structural
   bar/sushi/bistro decor were not downloaded; those environment primitives
   remain open.
4. No LODs, collider decimation, or texture re-authoring has been done for the
   new models.
5. No formal independent vision evaluation report has been produced for these
   candidates; the previews and in-game captures are the raw evidence.
6. Kenney’s direct ZIP is blocked from this host; the Poly Pizza mirror was used
   where a single CC0 model was enough.
