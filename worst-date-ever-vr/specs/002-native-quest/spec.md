# 002 — Native Quest port

## Scope

Port the bedroom prologue to Unity and Meta XR for Quest 3. Retain the original
game's Brazilian Portuguese story, playable character and dating preferences,
physical phone, and interactive room. The WebXR prototype remains a reference
for layout, assets, and story behavior.

The game is an absurd VR interaction sandbox with a dating storyline. The
player wakes up in the bedroom in control, with the phone, mirror, and props
available immediately. Use notifications and environmental cues to draw
attention to the date while leaving time for experimentation.

## Design pillars

1. **Physical comedy first.** Grabbing, throwing, pressing, and opening should
   be satisfying on their own. Use weight, motion, impact sounds, and reactions
   to turn ordinary actions into jokes.
2. **Absurd personalities.** Dates have distinct voices, exaggerated reactions,
   and a talent for making everyday exchanges awkward. Let player actions,
   interruptions, and dialogue choices set up the punchlines.
3. **Comedy becomes horror.** Keep the same readable room and familiar props as
   their behavior becomes uncanny. The shift can come from sound, lighting,
   dialogue, and a prop breaking its established routine. Keep camera control
   with the player and provide a reduced-intensity option for horror effects.

## Art direction

- [Job Simulator](https://jobsimulatorgame.com/) is the reference for direct
  interaction and readable objects. Use rounded silhouettes, distinct color blocks,
  and visible handles or switches. Important props should read at arm's length
  and respond to actions the player can infer from their shape.
- [Accounting+](https://accountingpl.us/) is the reference for surreal comedy.
  Use slightly exaggerated proportions and small sight gags in an otherwise
  believable room. The bedroom should feel lived in, like someone is trying to
  get ready for an awkward date in a hurry.
- Use rounded silhouettes and immediately readable controls with the materials
  of an adult's apartment: walnut, linen, clay, and muted blue-green. Keep the
  pink phone as a focal accent. Use furnishing from a cohesive licensed set
  and place it to support both the room composition and physical interaction.
- Show a layered neighborhood at golden hour through the open curtains. Low
  sunlight should throw shadows across the furnishings and appear as faint
  shafts in the room. Moving clouds and flapping birds cross the daylight sky.
  The day, golden-hour and night looks share the same neighborhood. At night,
  the moon and stars rise over layered mountain models, and softly lit street
  lamps cast shadows and a subtle color fringe around the fixtures. Keep the
  neighborhood scenic and free of storefront signs. Two cars circulate around
  a single block with a signal-controlled crossing and a rear access road. Wide sidewalks support
  separate pedestrian trips, and the storefront glass shows furnished
  interiors. Unity shadows and visibility rays preserve the golden-hour
  light shafts.
- Communicate interaction through raised controls, pull handles, prop shapes,
  and feedback. Keep narration and interaction feedback in short subtitles.
  The phone retains the text that belongs to its dating app.
- Keep the phone at a plausible handheld size. Enlarge its buttons, simplify
  the typography, and use color and shape to distinguish touch targets. Limit
  visual clutter around the phone stand.

## Bedroom interactions

| Area | Primary behavior | Completion evidence |
| --- | --- | --- |
| Phone | Pick up the iClona, open Deu Ruim, and browse profiles on the phone. | The handset starts on its home screen. Profile cards respond to swipe and pass/like buttons, with a back action that preserves dating progress. |
| Mirror | See the room and the player avatar in a live reflection. Pick up folded clothing to switch between three outfits for either avatar. | The avatar follows the headset pose, tracks controller wrists with bent arms, and drives feet and leg joints when the player moves. Changing outfits preserves the character's face and saves the selection. |
| Companions | Show Caio, Rafa, Bia, and Luiza as distinct characters with their own outfits and portraits. | Every dating profile displays its matching portrait; the source models are rigged and licensed for use in future date scenes. |
| Room | Pull the lamp cord, release the door latch with the handle, push the door by hand, and slide drawers, and pick up desk objects, clothes, and pillows. Brush either curtain panel and watch it settle. | The cord toggles once per pull, the door hinges from its frame, drawers slide on one axis, and jointed pillow ends bend independently, and curtains rebound after contact. Grip points match visible hardware. |
| Drawer surprises | Make the desk, nightstand, and cabinet drawers into boxes with usable interiors. Stock them with bouncing balls, joke props, and a spring frog. | All drawer contents start as loose bodies on collidable floors. Drawer fronts, backs and sides retain items during rapid opening and closing. Loose balls roll and rebound inside the drawer while it opens and closes. The drawer accelerates and brakes progressively. The spring frog jumps from a physical impulse on partial opening. Its reset requires placing it back in the drawer. |
| Flexible materials | Apply reusable material profiles to pillows, shirts, knitwear, and soft rubber. Grab either edge or the middle. | The other sections hang and bend at stable seam anchors. Different profiles change mass, friction, rebound and bending. |
| Breakable ceramics | Use the mug and plate like regular props. | A light drop leaves them intact. A hard impact scatters persistent physical shards that cannot be grabbed. |
| Comedy | Let player actions trigger prop reactions, awkward remarks, and dating-app notifications. | The opening has at least one optional action-driven joke, and repeated actions cannot flood audio or block the date. |
| Date prep | Pick up a preparation item from the room and use it at a visible station. | The selected item updates the date state; the player can swap it before leaving. At least one preparation choice works without the phone menu. |

Track hands and controllers for near grabbing, pressing, pulling, and swiping
where practical. Use controller rays for distance, seated reach, and
accessibility. Critical phone, appearance, and preparation choices need an
accessible path that does not depend on throwing accuracy or physical walking.

## Acceptance criteria

- From the starting position, the pink phone and its stand are easy to find.
  The screen is readable while held, and the player can tap it with their
  other index finger.
- The phone and notebook visibly respond to pickup and release. They collide
  with the floor and nearby furniture. The lamp cord, monitor control, door lever,
  and drawer handles are distinguishable and usable.
- The player can opt in to speaking to date characters in Brazilian Portuguese
  using the Quest microphone. Show when the microphone is listening and provide
  a button-based dialogue option when speech is unavailable or declined.
- Review silhouettes, material cohesion and the phone UI in Unity before
  deployment. Hands, microphone, reach and physical comfort require a separate
  Quest 3 pass when hardware is available.
