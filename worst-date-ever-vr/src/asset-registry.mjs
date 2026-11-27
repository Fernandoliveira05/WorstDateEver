// Model-space anchors in meters, measured from the staged GLBs.
const axis = [1, 0, 0];
const up = [0, 1, 0];
const depth = [0, 0, 1];
const zone = (zone_id, bone_or_mesh, type, local_position_m, local_normal, local_tangent, finger_pose, two_hand_role = 'none', approach_half_angle_deg = 100) => ({
  zone_id, bone_or_mesh, type, left_hand_allowed: true, right_hand_allowed: true,
  local_position_m, local_normal, local_tangent, approach_half_angle_deg, finger_pose, two_hand_role
});
const box = (size, position) => ({ size, position, rotation: [0, 0, 0, 1], friction: .62, bounce: .03 });
const radial = (mesh, y, radius) => Array.from({ length: 8 }, (_, i) => {
  const angle = i * Math.PI / 4;
  const x = Math.cos(angle), z = Math.sin(angle);
  return zone('body-' + i, mesh, 'surface', [radius * x, y, radius * z], [x, 0, z], [-z, 0, x], 'power');
});

export const assetRegistry = {
  'PROP-013': {
    scene: 'bedroom', name: 'iClona', source: null, runtime: 'wde_51',
    states: ['rest', 'held', 'guided_tap', 'swipe', 'turned', 'released', 'regrip'],
    grip_zones: [-1, 1].map(s => zone(s < 0 ? 'left-rail' : 'right-rail',
      'iClona shell', 'edge', [s * .054, -.02, .004], [s, 0, 0], up, 'flat_edge'))
  },
  picnic_basket: {
    scene: 'picnic', position: [-.50, .035, .20],
    hinges: ['picnic-basket_lid_back', 'picnic-basket_lid_front'],
    modelUrl: new URL('../assets/hand-qa/candidates/picnic_basket.glb', import.meta.url).href,
    name: 'Cesto de piquenique', source: 'food/picnic-basket', file: 'picnic-basket.glb', mass: .72,
    states: ['rest', 'held', 'open_0', 'open_50', 'open_100', 'released', 'regrip'],
    shapes: [
      box([.38,.024,.25],[0,.012,0]),
      ...[-1,1].flatMap(s => [box([.024,.18,.26],[s*.19,.11,0]), box([.40,.18,.022],[0,.11,s*.13]),
        box([.027,.19,.029],[s*.206,.225,-.008])]),
      box([.24,.028,.028],[0,.348,-.008])
    ],
    grip_zones: [
      zone('arched-handle', 'picnic-basket_body', 'handle', [0,.352,-.008], up, axis, 'handle_hook', 'primary'),
      ...[-1,1].map(s => zone(s < 0 ? 'left-base' : 'right-base', 'picnic-basket_body', 'palm_under',
        [s*.176,.018,0], [0,-1,0], depth, 'palm_support', 'either')),
      ...['back','front'].map((side,i) => zone(side + '-lid', 'picnic-basket_lid_' + side, 'edge',
        [0,.227,i===0?-.134:.135], up, axis, 'pinch'))
    ]
  },
  picnic_blanket: {
    scene: 'picnic', position: [0, .008, -.30],
    clothMesh: 'picnic-blanket_body',
    modelUrl: new URL('../assets/hand-qa/candidates/picnic_blanket.glb', import.meta.url).href,
    name: 'Toalha de piquenique', source: 'props/picnic-blanket', file: 'picnic-blanket.glb', mass: .32,
    states: ['rest', 'held', 'pull_50', 'pull_100', 'released', 'regrip'],
    shapes: [box([1.50,.018,1.50],[0,.009,0])],
    grip_zones: [['Front',[0,.011,.741],depth,axis],['Back',[0,.011,-.741],[0,0,-1],axis],
      ['Left',[-.741,.011,0],[-1,0,0],depth],['Right',[.741,.011,0],axis,depth]]
      .map(([name, anchor, normal, tangent]) => zone(name, 'picnic-blanket_body', 'edge',
        anchor, normal, tangent, 'soft_pinch', 'none', 145))
  },
  picnic_sandwich: {
    scene: 'picnic', position: [-.09, .034, .27],
    modelUrl: new URL('../assets/hand-qa/candidates/picnic_sandwich.glb', import.meta.url).href,
    name: 'Sanduíche vegano', source: 'food/sandwich', file: 'sandwich.glb', mass: .16,
    states: ['rest', 'held', 'rotated', 'released', 'regrip'],
    shapes: [box([.132,.050,.091],[0,.025,0])],
    grip_zones: [[-1,0],[1,0],[0,1],[0,-1]].map(([x,z], i) => zone('edge-' + i, 'Kraft sleeve',
      'edge', [x*.059,.027,z*.041], [x,0,z], up, 'precision'))
  },
  picnic_kombucha: {
    scene: 'picnic', position: [.25, .034, .27],
    modelUrl: new URL('../assets/hand-qa/candidates/picnic_kombucha.glb', import.meta.url).href,
    name: 'Kombucha', source: 'food/juice-bottle', file: 'juice-bottle.glb', mass: .38,
    states: ['rest', 'held', 'tilted', 'released', 'regrip'],
    shapes: [box([.080,.207,.080],[0,.104,0]),box([.040,.061,.040],[0,.239,0])],
    grip_zones: radial('juice-bottle_bottles_glass', .105, .041)
  }
};

export function assetsForScene(scene) {
  return Object.entries(assetRegistry).filter(([, asset]) => asset.scene === scene);
}

// These stations match the morph targets authored by adapt_picnic.py.
const clothEdges = {
  Front: { axis: 'z', along: 'x', border: .741, low: -.20 },
  Back: { axis: 'z', along: 'x', border: -.741, low: -.56 },
  Left: { axis: 'x', along: 'z', border: -.741, low: -.56 },
  Right: { axis: 'x', along: 'z', border: .741, low: -.56 }
};

export function blanketPull(THREE, body, grip, movement) {
  const edge = clothEdges[grip?.zone];
  if (!edge) return 0;
  const local = movement.clone().applyQuaternion(new THREE.Quaternion().copy(body.quaternion).invert());
  const outward = local[edge.axis] * Math.sign(edge.border);
  return THREE.MathUtils.clamp((local.y * .24 + outward * .05) / (.24 ** 2 + .05 ** 2), 0, 1);
}

export function assetMechanisms(model, asset) {
  const lids = (asset.hinges ?? []).map(name => model.getObjectByName(name));
  const rest = lids.map(lid => lid.rotation.x);
  const cloth = [];
  if (asset.clothMesh) {
    model.getObjectByName(asset.clothMesh)?.traverse(part => {
      if (part.morphTargetInfluences?.length) cloth.push(part);
    });
  }
  return {
    lids, cloth: cloth.length > 0,
    setOpen(fraction) {
      lids.forEach((lid, i) => { lid.rotation.x = rest[i] + (i ? -1 : 1) * .94 * fraction; });
    },
    setPull(edge, amount, blend = 1, anchor) {
      const section = clothEdges[edge];
      const along = anchor?.[section?.along] ?? 0;
      const share = Math.min(1, Math.abs(along) / (along < 0 ? -section.low : .56));
      for (const part of cloth) {
        const morphs = part.morphTargetInfluences;
        const targets = part.morphTargetDictionary;
        const center = targets?.['Pull' + edge];
        const outer = targets?.['Pull' + edge + (along < 0 ? 'Low' : 'High')];
        for (let i = 0; i < morphs.length; i++) {
          const desired = i === center ? amount * (outer === undefined ? 1 : 1 - share) :
            i === outer ? amount * share : 0;
          morphs[i] += (desired - morphs[i]) * blend;
        }
      }
    },
    displaceGrip(grip) {
      const edge = clothEdges[grip?.zone];
      const part = cloth[0];
      if (!edge || !part) return grip;

      const shift = grip.anchor.clone().set(0, 0, 0);
      for (const [name, section] of Object.entries(clothEdges)) {
        const { axis, along, border, low } = section;
        for (const [suffix, station] of [['Low', low], ['', 0], ['High', .56]]) {
          const weight = part.morphTargetInfluences[part.morphTargetDictionary?.['Pull' + name + suffix]];
          if (!weight) continue;
          const distance = Math.hypot(grip.anchor[axis] - border, grip.anchor[along] - station);
          const factor = weight * Math.max(0, 1 - distance / .48) ** 2;
          shift.y += .24 * factor;
          shift[axis] += .05 * Math.sign(border) * factor;
        }
      }
      return { ...grip, position: grip.position.clone().add(shift), anchor: grip.anchor.clone().add(shift) };
    }
  };
}
