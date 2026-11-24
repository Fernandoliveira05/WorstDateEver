# Poly Haven furniture assets

The bedroom uses locally served, optimized copies of six CC0 assets. The staged
`potted_plant_01` source is intentionally not shipped or requested at runtime:
its 5.1 MB leaf geometry would triple the initial furniture download for a
decorative prop.

License for every asset: **CC0 1.0 Universal**,
<https://polyhaven.com/license>.

| Local folder | Poly Haven source page | Used in scene |
|---|---|---|
| `metal_office_desk/` | <https://polyhaven.com/a/metal_office_desk> | Desk |
| `painted_wooden_chair_02/` | <https://polyhaven.com/a/painted_wooden_chair_02> | Chair |
| `vintage_day_bed/` | <https://polyhaven.com/a/vintage_day_bed> | Bed |
| `desk_lamp_arm_01/` | <https://polyhaven.com/a/desk_lamp_arm_01> | Functional lamp |
| `binder_notebook/` | <https://polyhaven.com/a/binder_notebook> | Grabbable notebook |
| `potted_plant_01/` | <https://polyhaven.com/a/potted_plant_01> | Staged, not shipped |
| `drawer_cabinet/` | <https://polyhaven.com/a/drawer_cabinet> | Cabinet |

## Optimization

The supplied 1K JPEG textures were resized to 512x512 and encoded as WebP
(quality 84) with ImageMagick. The glTF files declare `EXT_texture_webp`, which
Three.js/GLTFLoader and Meta Quest Browser support. The original CC0 `.bin`
geometry was kept, except the large potted-plant geometry is left out of the
runtime asset set.

The `binder_notebook` glTF contains an open binder plus a separate closed
binder offset beside it. The scene renders only the open binder as the
grabbable prop so its visible bounds match the 0.36 x 0.04 x 0.20 m Cannon
body; the closed companion mesh is hidden after load.

No network request is required to load these files. The scene resolves them
from `./assets/models/...` after Vite copies `public/` into `dist/`.
