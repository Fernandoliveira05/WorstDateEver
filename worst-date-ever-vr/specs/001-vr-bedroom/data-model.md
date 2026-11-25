# Data Model — Bedroom Vertical Slice

## `GameState` (persisted)
| Field | Type | Default | Meaning |
|---|---|---|---|
| `schemaVersion` | integer (1) | 1 | State contract version |
| `phase` | enum | `intro` | Current story state |
| `avatarGender` | `male` / `female` / null | null | Player-selected avatar identity |
| `preference` | `men` / `women` / `all` / null | null | Date candidates to display |
| `profileIndex` | nonnegative integer | 0 | Current index in the filtered candidate list |
| `matchId` | one of `caio`, `rafa`, `bia`, `luiza` / null | null | Chosen candidate |
| `substance` | `none`, `weed`, `lsd`, `alcohol`, `dmt` / null | null | Narrative branching flag |

## `DateProfile` (read-only data)
`id`, `name`, `gender`, `age`, `archetype`, `location`, `color`, `bio`.

`gender` filters the cards, never derives avatarGender. `location` is a forward-compatible hook for the later date scene; location gameplay is not implemented.

## Actions
`START`, `CHOOSE_AVATAR`, `CHOOSE_PREFERENCE`, `SKIP_PROFILE`, `LIKE_PROFILE`, `ADVANCE_TIME`, `FEEL_ANXIOUS`, `CHOOSE_SUBSTANCE`, `RESET`.

A disallowed action returns the existing state object and has no side effects.

## Non-persisted interaction state (revision)
These values live only in the running scene and never change narrative validation:

| Field | Meaning |
|---|---|
| `phonePlacement` | `dock`, `reading`, `held` or `physics` |
| `heldGrab` | `{ hand, prop, offset, linearVelocity, angularVelocity }` or `null` |
| `grabCooldownUntil` | duplicate-grab guard timestamp |
| `tapGate[left/right]` | per-hand contact debounce/rearm state |
| `reachAssist` | comfort preference, stored separately under `worst-date-ever-vr-comfort-v1` |
| `lampOn` / `monitorOn` / `drawerOpen` | room prop presentation state |
| `phoneBody` / `notebookBody` | runtime Cannon bodies; never persisted |
| `phoneRecoveryPendingAt` / `phoneStuckSince` | tracking-loss and under-furniture recovery timers |

## Physics props (runtime only)
| Prop | Body type | Shape | Notes |
|---|---|---|---|
| `#phonePickup` | static at dock/reading, kinematic while held, dynamic when thrown | 0.18 × 0.30 × 0.023 m box | Keeps its one 3D screen/UI as children |
| `#notebookPickup` | dynamic on desk, kinematic while held | 0.36 × 0.04 × 0.20 m box | Poly Haven notebook glTF |
| Room/furniture | static | floor, walls, ceiling, bed, desk top/legs, nightstand, cabinet, chair | Same Cannon world as props |

## Persistence invariants
- No match can exist until a profile is selected and liked.
- A current profile index must fit the filtered candidate deck while browsing.
- Every phase after browsing requires a valid `matchId`.
- DMT always routes to `aftermath`; the other choices route to `exit`.
- Saves of a different schema version are ignored (future versions need migrations).
