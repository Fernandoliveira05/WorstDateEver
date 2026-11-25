# Worst Date Ever — Project Constitution

Version 1.1.0 | Adopted 2026-11-18 | Native Quest port 2026-11-23

## 1. Immersion first
Every gameplay-critical action MUST be possible in immersive VR using 6DoF controllers. Native Unity on Quest is the production target. Direct manipulation is the default when reachable, with rays for distance and accessibility. Keep necessary UI in the game world. Desktop mouse and keyboard can support development.

## 2. VR comfort is a release gate
The game MUST never force head rotation, move the virtual camera independently of tracked head motion, deploy mandatory camera shake, or use unbounded flashing. Seated/standing accessibility and controller-reachable actions are required. Every non-tracked locomotion feature MUST be optional, tested, and comfort-reviewed.

## 3. Player identity is independent of date preference
A binary avatar choice for the first prototype MUST NOT constrain whom the player can match with. Store identity and preference separately; avoid gendered assumptions in scene logic. This prototype supports male/female avatar options and men/women/all matching; the data schema should be extensible.

## 4. Spec before implementation
All new scenes need a spec.md (what), plan.md (how), tasks.md (execution), and acceptance tests. Feature logic is expressed in a deterministic testable state machine. Engine components render that state and dispatch events.

## 5. Content and responsible handling
Drug and alcohol choices are fictional narrative mechanics. Do not provide preparation, dosing, procurement, or real-world substance-use guidance. Horror elements require warnings, intensity controls, and VR comfort checks before future implementation. No real likenesses of public figures are used as player-facing art without rights clearance.

## 6. Data minimization and LLM containment
Phase 1 works offline after locally served assets load and does not require a model provider. Third-party runtime code and models ship in-repo with their licenses; no asset CDN is required for the core flow. Store only the minimal local game state. Future LLM requests go through a server-side adapter with input/output validation, timeout, budget controls, and a deterministic fallback. Never ship a provider key in the client.

## 7. Device-performance discipline
Target standalone Quest-class devices first, with limited active lights, optimized local textures and a bounded physics budget. Measure frame rate and comfort on hardware before treating a feature as production-ready.

## 8. One tracking pose source
Tracked-hand visuals and interactions MUST consume the same tracked poses in a consistent tracking origin. Use the Meta XR rig and its input pipeline for the native build. The WebXR prototype uses the renderer's active XR reference space.
