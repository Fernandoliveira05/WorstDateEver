// QA-only registry for internet-sourced benchmark models.
// These entries are deliberately scene:'qa' so they are NOT loaded into any
// date. They are reachable only through the development fixture:
//   /?assetQA=<id>
// Sourced from Grab3D (CC0-1.0); not Tripo outputs, not production-approved.

const axis = [1, 0, 0];
const up = [0, 1, 0];
const depth = [0, 0, 1];
const zone = (zone_id, bone_or_mesh, type, local_position_m, local_normal,
  local_tangent, finger_pose, two_hand_role = 'none', approach_half_angle_deg = 110,
  extras = {}) => ({
  zone_id, bone_or_mesh, type, left_hand_allowed: true, right_hand_allowed: true,
  local_position_m, local_normal, local_tangent, approach_half_angle_deg,
  finger_pose, two_hand_role, ...extras
});
const box = (size, position) => ({ size, position, rotation: [0, 0, 0, 1], friction: .62, bounce: .03 });
const radial = (mesh, y, radius, count, finger_pose, type = 'surface', extras = {}) =>
  Array.from({ length: count }, (_, i) => {
    const angle = i * Math.PI * 2 / count;
    const x = Math.cos(angle), z = Math.sin(angle);
    return zone('body-' + i, mesh, type, [radius * x, y, radius * z],
      [x, 0, z], [-z, 0, x], finger_pose, 'none', 110, extras);
  });

export const qaAssets = {

  'beer-mug': {
    scene: 'qa', name: 'Enamel beer mug (Grab3D)', source: 'grab3d/props/camping-mug',
    modelUrl: new URL('../../assets/hand-qa/candidates/beer-mug.glb', import.meta.url).href,
    mass: .42,
    states: ['rest', 'held', 'released', 'regrip'],
    captureAimZone: 'handle',
    shapes: [
      ...Array.from({ length: 6 }, (_, i) => {
        const halfAngle = i * Math.PI / 12;
        return { ...box([.038, .083, .085], [-.012, .043, .016]),
          rotation: [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)] };
      }),
      ...[[.038, .021], [.046, .029], [.049, .043], [.046, .055], [.038, .064]].map(([x, y]) =>
        ({ ...box([.011, .011, .011], [x, y, .033]), sphere: true }))
    ],
    grip_zones: [
      zone('handle', 'camping-mug_body', 'handle', [.051, .043, .033], axis, up, 'handle_hook', 'primary', 75,
        { reach_m: .139, clearance_m: .052, lateral_m: -.032, priority: .001 }),
      ...radial('camping-mug_body', .043, .046, 8, 'power').map(entry => ({
        ...entry, local_position_m: entry.local_position_m.map((value, axis) => value + [-.012, 0, .016][axis])
      }))
    ]
  },
  'hot-sauce': {
    scene: 'qa', name: 'Hot sauce bottle (Grab3D)', source: 'grab3d/food/condiment-bottles',
    modelUrl: new URL('../../assets/hand-qa/candidates/hot-sauce.glb', import.meta.url).href,
    mass: .35,
    states: ['rest', 'held', 'released', 'regrip'],
    shapes: [box([.060, .214, .060], [0, .107, 0])],
    grip_zones: [
      ...radial('condiment-bottles_body', .085, .027, 8, 'precision'),
      ...radial('condiment-bottles_body', .170, .018, 6, 'precision', 'neck')
    ]
  },
  'beer-bucket': {
    scene: 'qa', name: 'Bucketed ice (Grab3D)', source: 'grab3d/props/bucket',
    modelUrl: new URL('../../assets/hand-qa/candidates/beer-bucket.glb', import.meta.url).href,
    mass: 1.4,
    states: ['rest', 'held', 'released', 'regrip'],
    shapes: [box([.323, .320, .372], [0, .160, 0])],
    grip_zones: [
      zone('bail-handle', 'bucket_body', 'handle', [0, .318, 0], up, axis, 'handle_hook', 'primary', 130),
      ...radial('bucket_body', .165, .160, 8, 'power'),
      ...radial('bucket_body', .300, .160, 6, 'precision', 'rim')
    ]
  },
  'bedside-lamp': {
    scene: 'qa', name: 'Bedside table lamp (Grab3D)', source: 'grab3d/furniture/table-lamp',
    modelUrl: new URL('../../assets/hand-qa/candidates/bedside-lamp.glb', import.meta.url).href,
    mass: 1.0,
    states: ['rest', 'held', 'released', 'regrip'],
    shapes: [box([.348, .627, .450], [0, .313, 0])],
    grip_zones: [
      ...radial('table-lamp_body', .220, .070, 6, 'power'),
      ...radial('table-lamp_body', .420, .105, 6, 'precision', 'shade')
    ]
  },
  'floor-cushion': {
    scene: 'qa', captureAimType: 'surface', name: 'Floor pouf (Grab3D)', source: 'grab3d/furniture/pouf',
    modelUrl: new URL('../../assets/hand-qa/candidates/floor-cushion.glb', import.meta.url).href,
    mass: 1.1,
    states: ['rest', 'held', 'released', 'regrip'],
    shapes: Array.from({ length: 8 }, (_, i) => {
      // The crossed bars follow the knitted cylinder without empty box corners.
      const halfAngle = i * Math.PI / 16;
      return { ...box([.191, .376, .482], [0, .193, 0]),
        rotation: [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)] };
    }),
    grip_zones: Array.from({ length: 8 }, (_, i) => {
      const angle = i * Math.PI / 4;
      const x = Math.cos(angle), z = Math.sin(angle);
      return zone('knit-shoulder-' + i, 'pouf_body', 'surface',
        [.253 * x, .300, .253 * z], [x, .22, z], up,
        'power', 'none', 115, { reach_m: .105, clearance_m: .054, fixed_wrist_tangent: true });
    })
  },
  'hardcover-book': {
    scene: 'qa', name: 'Hardcover book (Grab3D)', source: 'grab3d/props/book',
    modelUrl: new URL('../../assets/hand-qa/candidates/hardcover-book.glb', import.meta.url).href,
    mass: .62,
    states: ['rest', 'held', 'released', 'regrip'],
    shapes: [box([.182, .062, .277], [0, .031, 0])],
    grip_zones: [
      zone('left-edge', 'book_body', 'edge', [-.090, .031, 0], [-1, 0, 0], depth, 'precision'),
      zone('right-edge', 'book_body', 'edge', [.090, .031, 0], [1, 0, 0], depth, 'precision'),
      zone('front-edge', 'book_body', 'edge', [0, .031, .138], depth, axis, 'precision'),
      zone('back-edge', 'book_body', 'edge', [0, .031, -.138], [-0, 0, -1], axis, 'precision')
    ]
  },
  'sushi-platter': {
    scene: 'qa', name: 'Sushi geta platter (Grab3D)', source: 'grab3d/food/sushi-set',
    modelUrl: new URL('../../assets/hand-qa/candidates/sushi-platter.glb', import.meta.url).href,
    mass: .85,
    states: ['rest', 'held', 'released', 'regrip'],
    shapes: [box([.300, .063, .140], [0, .031, 0])],
    grip_zones: [
      zone('left-edge', 'sushi-set_body', 'edge', [-.150, .031, 0], [-1, 0, 0], depth, 'flat_edge'),
      zone('right-edge', 'sushi-set_body', 'edge', [.150, .031, 0], [1, 0, 0], depth, 'flat_edge'),
      zone('front-edge', 'sushi-set_body', 'edge', [0, .031, .070], depth, axis, 'flat_edge'),
      zone('back-edge', 'sushi-set_body', 'edge', [0, .031, -.070], [0, 0, -1], axis, 'flat_edge')
    ]
  },
  'cake-slice': {
    scene: 'qa', name: 'Cake slice (Grab3D)', source: 'grab3d/food/cake-slice',
    modelUrl: new URL('../../assets/hand-qa/candidates/cake-slice.glb', import.meta.url).href,
    mass: .35,
    states: ['rest', 'held', 'released', 'regrip'],
    shapes: [box([.196, .133, .193], [0, .066, 0])],
    grip_zones: radial('cake-slice_body', .012, .094, 8, 'precision', 'rim')
  },

  'fruit-bowl': {
    scene: 'qa', name: 'Cherry bowl (Grab3D)', source: 'grab3d/food/cherry-bowl',
    modelUrl: new URL('../../assets/hand-qa/candidates/fruit-bowl.glb', import.meta.url).href,
    mass: .55,
    states: ['rest', 'held', 'released', 'regrip'],
    shapes: [box([.138, .124, .175], [0, .062, 0])],
    grip_zones: radial('cherry-bowl_body', .112, .083, 8, 'precision', 'rim')
  },
  'flower-vase': {
    scene: 'qa', name: 'Flower vase (Grab3D)', source: 'grab3d/furniture/vase',
    modelUrl: new URL('../../assets/hand-qa/candidates/flower-vase.glb', import.meta.url).href,
    mass: .8,
    states: ['rest', 'held', 'released', 'regrip'],
    shapes: [box([.243, .494, .216], [0, .247, 0])],
    grip_zones: [
      ...radial('vase_body', .120, .075, 8, 'precision'),
      ...radial('vase_body', .290, .045, 6, 'precision', 'neck')
    ]
  },
  'menu': {
    scene: 'qa', name: 'Open menu book (Grab3D)', source: 'grab3d/props/open-book',
    modelUrl: new URL('../../assets/hand-qa/candidates/menu.glb', import.meta.url).href,
    mass: .55,
    states: ['rest', 'held', 'released', 'regrip'],
    shapes: [box([.302, .021, .242], [0, .010, 0])],
    grip_zones: [
      zone('left-edge', 'open-book_body', 'edge', [-.151, .010, 0], [-1, 0, 0], depth, 'precision'),
      zone('right-edge', 'open-book_body', 'edge', [.151, .010, 0], [1, 0, 0], depth, 'precision'),
      zone('front-edge', 'open-book_body', 'edge', [0, .010, .121], depth, axis, 'precision'),
      zone('back-edge', 'open-book_body', 'edge', [0, .010, -.121], [0, 0, -1], axis, 'precision')
    ]
  },
  'petiscos-bowl': {
    scene: 'qa', name: 'Snack bowl (Grab3D)', source: 'grab3d/food/mixing-bowl',
    modelUrl: new URL('../../assets/hand-qa/candidates/petiscos-bowl.glb', import.meta.url).href,
    mass: .6,
    states: ['rest', 'held', 'released', 'regrip'],
    shapes: [box([.277, .118, .260], [0, .059, 0])],
    grip_zones: radial('mixing-bowl_body', .105, .132, 8, 'precision', 'rim')
  },
  'coffee-cup': {
    scene: 'qa', name: 'Cup and saucer (Grab3D)', source: 'grab3d/food/tea-cup',
    modelUrl: new URL('../../assets/hand-qa/candidates/coffee-cup.glb', import.meta.url).href,
    mass: .28,
    states: ['rest', 'held', 'released', 'regrip'],
    shapes: [box([.147, .069, .147], [0, .034, 0])],
    grip_zones: [
      zone('handle', 'tea-cup_body', 'handle', [.070, .040, 0], [1, 0, 0], up, 'handle_hook', 'primary'),
      ...radial('tea-cup_body', .045, .044, 6, 'power'),
      ...radial('tea-cup_body', .010, .072, 6, 'precision', 'rim')
    ]
  }
};
