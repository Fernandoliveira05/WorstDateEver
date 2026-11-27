# Environment density and NPC role pass — 2026-11-27

This pass responds to the "complete map from every angle" review. It adds
population and role fixes, but it is not a claim of final visual acceptance.

## Picnic
- Removed the restaurant waiter role from the park. `actors[5]` is now the
  kiosk vendor behind the counter; `actors[4]` idles beside the benches.
- Added the Quaternius Market Stand as the covered kiosk, plus a service counter,
  counter top and bottles in both Unity and A-Frame.
- Added park density behind and beside the spawn: extra trees, bushes, hedge,
  benches, trash bin, bike rack, park sign, tree planter, grass clumps and
  flower patches.
- Unity and web keep pedestrians on the path; no tray/service animation in the
  picnic.

## Restaurants and bar
- Added a dressed back wall to both engines: framed art, shelf with bottles,
  coat rail/hooks, plants, wall sconces and venue-specific furniture.
- Sushi: bar stools at the counter and a chef/staff actor behind it.
- Bistro: sideboard and flower vases.
- Bar: visible jukebox block, extra bottles, bartender behind the counter and
  stronger neon/bunting density.
- Existing validated tableware, tables, chairs and breakables remain in use.

## Evidence
- [Unity picnic after density](./evidence/unity-picnic-dense.png)
- [Web picnic after density](./evidence/web-picnic-dense.png)
- [Web bar after density](./evidence/web-bar-dense.png)
- [Web bistro after density](./evidence/web-bistro-dense.png)
- [Unity picnic before this pass](./evidence/unity-picnic.png)

## Limitations
- The web date still waits behind its "Seu encontro já vem" gesture/voice gate in
  headless captures; screenshots show the populated venue, not the seated date.
- Unity bar capture through the host compositor was unstable; the web density
  capture is the evidence used here.
- No Quest 3 hardware run, no hand-tracking test for the new kiosk counter, and
  no formal vision-model score.
- The kiosk model still reads as a covered market shelter from some angles; the
  service counter and sign were added to make its role legible.
