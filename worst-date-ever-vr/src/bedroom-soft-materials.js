// Angular response in radians per second. Mass and surface friction come from the scene.
const materials = {
  'Filled Linen': { rate: 26, damping: 1.05, twist: .42, drape: .04, drag: .42 },
  'Cotton Jersey': { rate: 5.3, damping: .98, twist: .26, drape: .40, drag: .66 },
  'Heavy Knit': { rate: 11.2, damping: 1.14, twist: .34, drape: .23, drag: .60 },
  'Soft Rubber': { rate: 34, damping: .78, twist: .57, drape: .015, drag: .37 }
};

export function softMaterial(name) {
  return materials[name] ?? materials['Cotton Jersey'];
}
