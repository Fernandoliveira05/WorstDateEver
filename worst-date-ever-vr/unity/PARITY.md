# Web → Unity parity

Last audited: 2026-11-27. Details and evidence: `../docs/wde-parity-2026-11-27.md`. Web is the source of truth for gameplay.

## Bedroom

| Feature | Web | Unity |
| --- | --- | --- |
| Story phases / phone match / prep / exit | yes | yes |
| Phone starts the date | yes | yes |
| Phone window/effects/reset | yes | yes |
| Wardrobe doors, bottom drawer, outfit | yes | yes (older custom cabinet) |
| New 3dassets wardrobe + base drawer | yes, physical hinge doors | no (A-Frame physical drag implemented; Unity still old cabinet) |
| Mirror, frames, curtains, monitor, fan cord | yes | yes |
| Corridor + locked side doors + candy machine | yes | corridor + cabinet; candy machine no |
| Sourced wardrobe/room assets / round rug | yes | partial (shared sourced manifest, no Unity 2-door wardrobe import) |
| Desktop + Quest scene generators | web/WebXR | desktop yes; Quest generator yes, Android build module missing |

## First date

| Feature | Web | Unity |
| --- | --- | --- |
| Café / sushi / bistro / bar rooms | yes | yes |
| Caio picnic park | yes | yes (park + sky/sun/clouds/pedestrians) |
| Director, relationship stats, events, checkpoints | yes | yes |
| Voice / captions / speech | yes | yes |
| Table props, menu, cup, plate | yes | yes |
| Spill / wrong-order / social event visuals | yes | yes |
| Physical actions: toast, balance, juggle, offer food, eat, dance | yes | no |
| Skill tutorials, QTEs, social outcomes, repeat penalty | yes | no |
| Park sourced trees/bench/kiosk/street props | yes | yes (models + procedural fallbacks) |
| Sourced 54-model library | staged + web | yes (60 GLBs imported to `Sourced.asset` and reused by A-Frame) |

## Breakage / lighting (2026-11-27 pass)

| Feature | Unity | A-Frame |
| --- | --- | --- |
| Shared sky palette (day/golden/night) | yes (`SkyPalette.cs`) | yes (`content/shared/sky.json`) |
| Venue-specific lighting | yes (bar low/neon, sushi amber, bistro warm) | yes (profiles + pendant/neon lights) |
| Breakable mugs/plates/bottles | yes (runtime shards, spill, cleanup) | yes for date tableware (fragments + cleanup); bedroom breakage pre-existing |
| Physical wardrobe hinge doors | no | yes (drag, partial, both hands) |

## Builds

- Linux desktop player: **working** (`Builds/Linux/WorstDateEver.x86_64`).
- Quest/Android player: generator exists, but the Android Build Support module is not installed.

## Highest-impact gaps

1. The six physical date actions and their skill/social results.
2. The 3dassets wardrobe and base drawer in the bedroom.
3. Corridor candy machine and candy-aware date handoff.
4. Remaining venue art gaps: sushi chef(s), a usable jukebox model in the bar, and the café visual pass (built but not reachable from the current four personas).
