import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const bedroomPalette = Object.freeze({
  lavender: 0xa08aaa, plum: 0x594255, cream: 0xe9d7b9, flax: 0xd4b18a,
  honey: 0xb57c45, oak: 0x9a6239, teal: 0x4c7370, deepTeal: 0x395954,
  rose: 0xbc7584, brass: 0xb59058, clay: 0xba7356, olive: 0x647b40
});

function bedroomTextures(root) {
  return {
    wood: root.getObjectByName('room_Surface-Walnut-FADEBA-10-13-062-024-Projected')?.material.map,
    weave: root.getObjectByName('room_Surface-Weave-95ADC5-60-60-039-012-Projected')?.material.map,
    powdercoat: root.getObjectByName('room_Surface-Powdercoat-A3969E-14-14-025-010-Projected')?.material.map
  };
}

export function applySurfaceTexture(material, texture, strength) {
  if (!texture) return;
  material.map = texture;
  material.customProgramCacheKey = () => 'bedroomSurfaceFinish:' + strength;
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      vec4 detail = texture2D(map, vMapUv);
      diffuseColor *= mix(vec4(1.), detail, ${strength.toFixed(2)});
    `);
  };
}

export function styleBedroom(THREE, root, data, node) {
  const p = bedroomPalette;
  const surfaces = bedroomTextures(root);
  const finishes = new Map();
  function tint(mesh, color, roughness = .82, terrain = '') {
    if (!mesh?.isMesh || Array.isArray(mesh.material)) return;
    const original = mesh.material;
    if (!finishes.has(original)) finishes.set(original, new Map());
    const variants = finishes.get(original);
    const key = color + ':' + roughness + ':' + terrain;
    if (!variants.has(key)) {
      const material = original.clone();
      material.color.setHex(color);
      material.roughness = roughness;
      material.onBeforeCompile = original.onBeforeCompile;
      material.customProgramCacheKey = original.customProgramCacheKey;
      const strength = { wood: .82, weave: .77, wall: .57, painted: .34, floor: 1 };
      const map = original.map ?? surfaces[terrain === 'wall' || terrain === 'painted' ? 'powdercoat' : terrain];
      if (terrain) applySurfaceTexture(material, map, strength[terrain]);
      variants.set(key, material);
    }
    mesh.material = variants.get(key);
  }

  // The export batches static meshes by material. Style each batch once, with
  // spatial masks for shared surfaces such as the window frame and baseboards.
  const wallBatches = {
    A3969E: p.lavender, '8B8086': 0x947d9d, '93878E': 0xa28aac, DBCCB2: 0xeee0c8
  };
  root.traverse(mesh => {
    const name = mesh.name;
    if (!mesh.isMesh || !name.startsWith('room_')) return;
    const wall = /^room_Surface-Powdercoat-([\dA-F]{6})-14-14/.exec(name);
    if (wall && wallBatches[wall[1]]) tint(mesh, wallBatches[wall[1]], .96, 'wall');
    else if (name.includes('Floorboards-FFFFFF')) tint(mesh, 0xf1c694, .9, 'floor');
    else if (/^room_Surface-Walnut-(CCAB8A|FADEBA|B59178)/.test(name)) tint(mesh, p.honey, .82, 'wood');
    else if (name.includes('Walnut-D6BDA6')) tint(mesh, p.honey, .82, 'wood');
    else if (name === 'room_Paint-DBCCB2') {
      const geometry = mesh.geometry;
      const positions = geometry.attributes.position;
      const world = new THREE.Vector3();
      const colors = new Float32Array(positions.count * 3);
      const wood = new THREE.Color(p.honey), cream = new THREE.Color(p.cream);
      for (let i = 0; i < positions.count; i++) {
        world.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
        (world.x > .30 && world.y > .9 ? wood : cream).toArray(colors, i * 3);
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      tint(mesh, 0xffffff, .87, 'wood');
      mesh.material.vertexColors = true;
    } else if (/^room_carcass(?:_\d+)?$/.test(name)) tint(mesh, p.deepTeal, .83, 'painted');
    else if (name === 'room_Paint-477073' || name === 'room_Paint-80A694') tint(mesh, p.teal, .85, 'painted');
    else if (name === 'room_Paint-AB824A') tint(mesh, p.brass, .56);
    else if (name === 'room_Surface-Powdercoat-3B404A-30-30-030-029-Projected') tint(mesh, p.plum);
    else if (name.includes('Weave-95ADC5')) tint(mesh, p.flax, .91, 'weave');
    else if (name.includes('Weave-C5C7CB')) tint(mesh, p.oak, .85, 'wood');
    else if (name === 'room_clay_1') tint(mesh, p.rose, .92, 'weave');
    else if (name === 'room_sage') tint(mesh, p.teal, .91, 'weave');
    else if (name === 'room_clay') tint(mesh, p.flax, .92, 'weave');
  });

  const chair = root.getObjectByName('desk-chair');
  chair?.traverse(mesh => {
    if (mesh.material?.name.includes('Weave-C5C7CB')) tint(mesh, p.teal, .9, 'weave');
    else if (mesh.isMesh) tint(mesh, p.plum);
  });

  for (const item of data.drawers) {
    node(item.id)?.traverse(mesh => {
      if (/^drawer-\dcarcass|^Frente_de_nogueira/.test(mesh.name)) tint(mesh, p.teal, .85, 'wood');
      else if (/^Fundo_forrado/.test(mesh.name)) tint(mesh, p.flax, .91, 'weave');
    });
  }
  for (const item of data.pulls) {
    if (!item.cord) node(item.id)?.traverse(mesh => tint(mesh, p.brass, .52));
  }
  node(data.door.id)?.traverse(mesh => {
    if (mesh.name === 'Folha_da_porta') tint(mesh, p.cream, .86, 'painted');
    if (/^Painel_da_porta/.test(mesh.name)) tint(mesh, 0xd2a775, .82, 'wood');
    if (mesh.name.includes('fechadura')) tint(mesh, p.brass, .48);
  });
  for (const id of data.curtains) node(id)?.traverse(mesh => {
    if (!mesh.isMesh) return;
    // The approved concept uses muted plum curtains, not the neutral cream
    // linen of the source room.
    tint(mesh, 0x9b7aa8, .98, 'weave');
  });

  // Retain separate upholstery, stitches and outfit parts for the existing soft bodies.
  for (const [id, color, thread] of [
    ['wde_37', 0x688482, p.deepTeal], ['wde_40', p.cream, p.flax],
    ['wde_43', p.teal, p.flax], ['wde_140', p.cream, p.flax],
    ['wde_143', p.plum, p.rose], ['wde_146', p.deepTeal, p.flax]
  ]) {
    node(id)?.traverse(mesh => {
      if (/^(Modelo|Manga|Capuz|Bolso_canguru)/.test(mesh.name)) tint(mesh, color, .9, 'weave');
      else if (/Costura|Cordão|Canelada|Pesponto/.test(mesh.name)) tint(mesh, thread);
    });
  }
  node('wde_131')?.traverse(mesh => {
    if (mesh.name.includes('Capa_de_tecido')) tint(mesh, p.rose, .91, 'weave');
    else if (mesh.name.includes('Elástico')) tint(mesh, p.plum);
  });
  node('wde_78')?.traverse(mesh => tint(mesh, 0xe9d5b3, .44));
}

export function addBedAndShelf(THREE, root, data) {
  const p = bedroomPalette;
  const surfaces = bedroomTextures(root);
  const objects = [];
  const dressing = new THREE.Group();
  dressing.name = 'Acabamentos do quarto';
  root.add(dressing);
  const bed = new THREE.Group();
  bed.name = 'Costuras e madeira da cama';
  dressing.add(bed);
  const shelf = new THREE.Group();
  shelf.name = 'Prateleira de madeira e livros';
  shelf.position.set(.36, 2.25, -2.075);
  dressing.add(shelf);
  const materials = new Map();
  const material = color => {
    if (!materials.has(color)) {
      const finish = new THREE.MeshStandardMaterial({ color, roughness: .85 });
      if (color === p.honey || color === p.oak) applySurfaceTexture(finish, surfaces.wood, .82);
      materials.set(color, finish);
    }
    return materials.get(color);
  };

  function add(parent, geometry, position, color) {
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.position.fromArray(position);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.layers.enable(27);
    parent.add(mesh);
    return mesh;
  }

  const rounded = (parent, size, at, color, radius = .012) =>
    add(parent, new RoundedBoxGeometry(...size, 2, radius), at, color);
  rounded(bed, [1.54, .063, .105], [-.94, .995, -2.012], p.honey, .027);
  for (const x of [-1.66, -.22]) {
    rounded(bed, [.072, .48, .104], [x, .795, -1.998], p.honey);
    add(bed, new THREE.SphereGeometry(.049, 12, 8), [x, 1.043, -1.998], p.honey);
  }

  // Drape along the mattress and wrap the edges of the existing bed.
  // The horizontal sleeping and pickup surface stays at its authored height.
  function fabricPoint(across, length, offset = 0) {
    const x = across * .766;
    const edge = THREE.MathUtils.smoothstep(Math.abs(across), .942, 1);
    const foot = THREE.MathUtils.smoothstep(length, .965, 1);
    const fold = Math.sin(across * 27 + length * 3) * .007 * (.25 + length * .75);
    return new THREE.Vector3(x, .651 + offset + fold - Math.max(edge * .162, foot * .157), -1.385 + length * 1.374);
  }

  function cover(name, yStart, color, offset) {
    const geometry = new THREE.PlaneGeometry(1, 1, 42, 28);
    const positions = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < positions.count; i++) {
      const across = uv.getX(i) * 2 - 1;
      const length = THREE.MathUtils.lerp(yStart, 1, 1 - uv.getY(i));
      const point = fabricPoint(across, length, offset);
      positions.setXYZ(i, point.x, point.y, point.z);
    }
    geometry.computeVertexNormals();
    const textile = add(bed, geometry, [-.94, 0, 0], color);
    textile.name = name;
    textile.material = textile.material.clone();
    textile.material.side = THREE.DoubleSide;
    applySurfaceTexture(textile.material, surfaces.weave, .88);
  }
  cover('Colcha acolchoada', 0, p.teal, 0);
  cover('Manta rosa', .76, p.rose, .006);
  for (let i = 1; i <= 9; i++) {
    const across = (i - 5) * .188;
    const points = Array.from({ length: 13 }, (_, k) => fabricPoint(across, .020 + k * .058, .0025));
    add(bed, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, .0013, 4, false),
      [-.94, 0, 0], 0x5e8882);
  }

  rounded(shelf, [.79, .055, .253], [0, 0, 0], p.honey);
  const collider = (size, position = [0, 0, 0]) =>
    ({ size, position, rotation: [0, 0, 0, 1], friction: .64, bounce: .04 });
  data.colliders.push({ position: shelf.position.toArray(), rotation: [0, 0, 0, 1],
    shape: collider([.79, .055, .253]) });
  function loose(object, id, name, mass, shape) {
    object.name = id;
    objects.push([id, object]);
    data.props.push({ id, name, mass, shapes: [shape] });
  }
  for (const x of [-.28, .28]) rounded(shelf, [.040, .115, .112], [x, -.08, -.055], p.oak);
  [p.plum, p.rose, p.teal, p.flax, p.clay].forEach((color, i) => {
    const w = .04 + (i % 2) * .008, h = .134 + (i % 3) * .035;
    const book = new THREE.Group();
    book.position.set(-.29 + i * .057, .03 + h / 2, .034);
    if (i === 4) book.rotation.z = -.12;
    shelf.add(book);
    rounded(book, [w, h, .105], [0, 0, 0], color, .005);
    rounded(book, [w * .67, h * .86, .016], [0, 0, .052], p.cream, .003);
    for (const y of [-.032, .041]) rounded(book, [w * .64, .004, .002], [0, y, -.053], p.brass, .001);
    loose(book, 'shelf-book-' + (i + 1), 'Livro da prateleira', .14 + .025 * i, collider([w, h, .111], [0, 0, .003]));
  });

  const plant = new THREE.Group();
  plant.position.set(.265, .028, .014);
  shelf.add(plant);
  loose(plant, 'shelf-plant', 'Vaso de planta', .37, collider([.133, .109, .133], [0, .0545, 0]));
  add(plant, new THREE.CylinderGeometry(.072, .053, .104, 20), [0, .052, 0], p.clay);
  const rim = add(plant, new THREE.TorusGeometry(.068, .006, 6, 20), [0, .102, 0], 0xce8d67);
  rim.rotation.x = Math.PI / 2;
  add(plant, new THREE.CylinderGeometry(.063, .063, .008, 20), [0, .1, 0], p.oak);
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, -.045);
  leafShape.bezierCurveTo(-.064, .004, -.037, .072, 0, .03);
  leafShape.bezierCurveTo(.037, .072, .064, .004, 0, -.045);
  const leafGeometry = new THREE.ShapeGeometry(leafShape, 6);
  for (const color of [p.olive, 0x899645, 0xa4a554]) material(color).side = THREE.DoubleSide;
  for (let stem = 0; stem < 4; stem++) {
    const angle = stem * 2 * Math.PI / 4;
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(0, .104, 0), new THREE.Vector3(Math.sin(angle) * .105, .277, Math.cos(angle) * .123),
      new THREE.Vector3(Math.sin(angle) * .128, .225, Math.cos(angle) * .125),
      new THREE.Vector3(Math.sin(angle) * .156, Math.sin(angle) > .8 ? -.14 : .14, Math.cos(angle) * .14));
    add(plant, new THREE.TubeGeometry(curve, 8, .0025, 4, false), [0, 0, 0], p.olive);
    for (let i = 0; i < 4; i++) {
      const v = curve.getPoint(.34 + i * .207);
      const leaf = add(plant, leafGeometry, v.toArray(), [p.olive, 0x899645, 0xa4a554][(i + stem) % 3]);
      leaf.rotation.set((i % 2 ? -.46 : .38), angle + .36, i % 2 ? .62 : -.59);
      leaf.scale.setScalar(1.04 - i * .095);
    }
  }
  return objects;
}
