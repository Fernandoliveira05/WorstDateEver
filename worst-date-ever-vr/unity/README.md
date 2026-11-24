# Worst Date Ever VR for Unity — Prototype

This project targets Unity 6000.0.85f2. The full-length mirror reflects your avatar and outfit. The phone and preparation props are physical objects. The first playable
scene leads to the selected first date or the bedroom aftermath. The [relatório de testes de interação](../../TESTES-DE-INTERACAO.md) records the object interaction checks run in Unity Play Mode.

## Desktop preview

Open this folder in Unity 6000.0.85f2 and load
`Assets/WorstDateEver/Scenes/BedroomDesktop.unity`. Press Play to try the scene.
Use **Worst Date Ever > Create Desktop Bedroom** to regenerate it.

- WASD moves. Hold the middle mouse button and drag to look.
- Right-click a prop to carry or release it. Press Space while holding it to throw.
- Pick up the iClona and tap **Deu Ruim** on its home screen. Drag the profile
  card to swipe or tap **Passar** and **Curtir**. The phone stores the story
  locally. Press **R** to recall the phone.
- Open the lower clothing drawer and pick up a folded garment to change your outfit. During
  preparation, put an item in the recessed tray.
- Press **N**, or use **Janela** on the phone's home screen, to switch between
  golden hour, day, and night. With the default setting, the story switches to
  night after the time skip.
- Narration and prop feedback appear as temporary screen subtitles. The
  bedroom combines imported furniture with original props and controls.
- See [furniture attribution](Assets/WorstDateEver/Models/FurnishedBedroom/ATTRIBUTION.md)
  and [surface texture attribution](Assets/WorstDateEver/Textures/ATTRIBUTION.md).
  The window uses soft spotlight shadows and light shafts calculated when the
  scene is generated. Across the street, two storefronts have transparent
  glass and furnished interiors. Two cars share a loop around the block, and
  pedestrians make one-way trips along wide sidewalks. At night, the street
  lamps use baked visibility rays for their pools of light, plus live
  shadows from the two front fixtures.
  See [vehicle attribution](Assets/WorstDateEver/Models/Traffic/ATTRIBUTION.md)
  and [mountain attribution](Assets/WorstDateEver/Models/Horizon/ATTRIBUTION.md).

The **Create** menu rebuilds its generated scene. Work in a differently named
scene if you want to keep hand-edited changes.

## Physical materials

The presets live in `Assets/WorstDateEver/Materials/Physical`. Each stores the
surface friction, bounce and mass, plus bend or break settings as applicable.
The scene generator uses `MakeFlexible` for cloth and soft rubber and
`SetPhysicalMaterial` for rigid objects. Regenerate the scene after editing a
preset to apply its joint and mass settings.

| Preset | Example |
| --- | --- |
| Filled Linen | Bed pillows |
| Cotton Jersey | Folded shirts |
| Heavy Knit | Folded hoodie |
| Soft Rubber | Desk caterpillar |
| Bouncy Rubber | Drawer balls |
| Glazed Ceramic | Mug and plate |

## Native build

Complete Meta's Simplified VR Setup once with Android Build Support installed
for this Editor version. The generated `BedroomQuest.unity` scene is registered
for builds. **Worst Date Ever > Create Quest Bedroom** regenerates it with the
Meta OVR interaction rig, near grabs, world-space poke and ray controls, and
physics release settings. The desktop controls are Editor-only.

In the match conversation, **Toque para falar** requests microphone permission
on first use and starts one Brazilian Portuguese listening turn. Speech uses
Android's on-device recognizer when available. The app stores neither audio nor
transcripts. If recognition or permission is unavailable, the two dialogue
buttons still work. The recognizer and language support on Quest 3 need hardware
verification.

The desktop scene has been rendered and inspected in Play mode through Unity
MCP. The Quest scene was generated in the Editor. Android packaging and
on-device acceptance are pending.
See [the native spec](../specs/002-native-quest/spec.md) and
[the attribution for the earlier reference models](Assets/WorstDateEver/Models/ATTRIBUTION.md).
