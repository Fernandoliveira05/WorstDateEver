# Research / Decision Record — First Date VR

## Choice: Dual clients with shared content, not shared engine source
The existing browser version is A-Frame/WebXR. The planned native version uses Unity/OpenXR and its XR interaction systems. We share **contracts, personas, venue/event content, session IDs, turn sequencing, and behavioral golden tests**, but implement headset input, rendering, movement, microphone and asset import separately in JavaScript and C#. Do not promise that Unity consumes the A-Frame components.

## Why server-side STT and dialogue
Quest Browser's standard `getUserMedia({audio:true})` requires secure origin and explicit browser permission; Unity Android requires `RECORD_AUDIO` and its own microphone path. A shared server STT and LLM gateway avoids depending on vendor browser speech recognition, keeps provider credentials off the device and ensures equivalent NPC logic. **Real microphone capture during an immersive Quest Browser WebXR session is a hardware-validation risk; it is not certified by this spec.**

Sources: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia ; https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Permissions_and_security ; https://developers.meta.com/vr/documentation/web/webxr-overview/ ; https://docs.unity.com/en-us/engine/6000.7/manual/platform-specific/android/developing/device-features-and-permissions/permissions-in-unity

## Why push-to-talk before hands-free speech
PTT makes consent/voice transmission state explicit and reduces false inputs from the game's waiter, spatial audio, player breathing and background customers. Half-duplex input (quiet/duck NPC TTS when mic open) helps speech isolation. Hands-free VAD and interruptions are P1 after real Quest microphone measurements.

## Why deterministic events
The LLM runs the date's conversational personality, NOT physics/scene scripts. Random director chooses from authored events with cooldowns, state prerequisites, per-scene contexts, seed recording and bounded player choices. This enables game design control, consistency in both clients, QA reproduction and no bizarre unsafe runtime model commands.

## Why an independent generated model/prop evaluator
Generated meshes can look persuasive from one screenshot but be broken, huge, impossible to grab, unrigged or expensive on standalone Quest. A **vision model** detects visible style and rendering defects, using actual approved project exemplars, while deterministic mesh/property tests and Quest profiling gate functionality. Treat VLM as fallible reviewer, not sole authority. Baseline-preserving style fidelity outranks similarity to Job Simulator; that reference informs interaction affordance only. Provider selection should account for image reasoning, confidentiality, cost, structured output and version pinning; no provider assumed configured.

## Performance and UX risks to prove on hardware
- Test separately in Quest 3 Browser and Unity Quest 3 APK: 72 Hz target, stable seated eye height, controller/hand reach and mic permission.
- Test conversational latency p50/p95 in pt-BR with actual ambient NPC sounds.
- Measure animated NPC count, skinning cost, texture memory, transparency cost and baked-light quality.
- Profile actual imported/exported assets; synthetic mesh triangle counts alone cannot guarantee frame rate.

## Provider neutrality and licensing
No specific STT/LLM/TTS or visual-grading provider is baked into contracts. The implementation team may choose a hosted or local model as long as it supports the required formats and privacy terms. Reuse real project assets; clear exact license and attribution for any new third-party sources. Game inspiration is not permission to copy protected models, scripts or voices.
