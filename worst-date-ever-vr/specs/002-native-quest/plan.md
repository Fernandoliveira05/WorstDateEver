# 002 — Native Quest implementation plan

## Project and input

Create the Unity project through Meta's Unity setup MCP. Use Meta XR Core with
OpenXR and floor-level tracking. Use Meta XR Interaction SDK for the hand and
controller rig, near grabs, and screen pokes. Add ray interactions to the same
actions where players need a distance or seated option.

Keep the WebXR project as a reference implementation. Port the deterministic
story state and profile data into C#. Both physical interactions and accessible
controls dispatch into the same state. Persist appearance, dating choices, and
progress locally.

## First playable bedroom

1. Build the room around a readable path between the starting spot, phone,
   mirror, and prep station. Restyle suitable existing assets and author
   bespoke hero props.
2. Use Unity colliders and rigid bodies for portable props. Give drawers
   constrained travel and an obvious handle. Tune the bed as a soft landing
   surface for the handset and give the player a way to retrieve it.
3. Mount the dating UI to the handset. Measure swipes in screen-local space
   and resolve each gesture as either a swipe or a tap. Connect the mirror and
   prep station to the same story state.
4. Add a small set of prop reactions, notification interruptions, and
   character responses. Rate-limit repeat reactions. Keep horror effects
   configurable and stage them through the original room and its props.
5. Add explicit push-to-talk in pt-BR. Ask for microphone access on first use,
   show the listening state, and allow cancel. Prefer local speech recognition
   if the device supports it. Route transcripts or button choices to the same
   scripted dialogue; keep audio and transcripts out of persistent saves.

## Verification

Review the scene in Unity and test story transitions, swipe versus tap,
permission failures, and repeatable prop interactions before packaging. On
Quest 3, verify both hands, controller fallback, seated reach, throw behavior,
pt-BR speech, comfort, and frame time.
