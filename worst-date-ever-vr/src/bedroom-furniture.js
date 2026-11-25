// The scene export batches the chair and monitor housing by material.
// Split their triangles out of those batches so the existing art can move.
export function extractFurniture(THREE, root, monitor) {
  const specifications = [
    { id: 'desk-chair', name: 'Cadeira', mass: 8, center: [1.27, .44, 2.14],
      min: [1.005, -.015, 1.86], max: [1.535, .891, 2.45],
      material: /^room_(black(?:_\d+)?$|Surface-Weave-C5C7CB)/,
      boxes: [
        [[1.27, .44, 2.14], [.46, .09, .44]],
        [[1.27, .663, 1.925], [.425, .38, .06]],
        [[1.27, .207, 2.14], [.105, .414, .11]],
        [[1.27, .075, 2.14], [.44, .092, .42]]
      ] },
    { id: 'desk-monitor', name: 'Monitor', mass: 4.5, center: [.87, 1.09, 3.002],
      min: [.59, .896, 2.938], max: [1.15, 1.379, 3.139],
      material: /^room_(Paint-(3B404A|24262B|131618|85BA66)(?:_\d+)?$|Surface-Powdercoat-3B404A)/,
      boxes: [
        [[.87, 1.205, 3.002], [.527, .326, .073]],
        [[.87, 1.018, 3.055], [.047, .20, .047]],
        [[.87, .913, 3.055], [.225, .026, .153]]
      ] }
  ];
  root.updateWorldMatrix(true, true);
  const meshes = [];
  root.traverse(mesh => { if (mesh.isMesh && mesh.name.startsWith('room_')) meshes.push(mesh); });
  return specifications.flatMap(spec => {
    const group = new THREE.Group();
    group.name = spec.id;
    group.position.copy(root.worldToLocal(new THREE.Vector3(...spec.center)));
    root.add(group);
    const bounds = new THREE.Box3(new THREE.Vector3(...spec.min), new THREE.Vector3(...spec.max));
    const point = new THREE.Vector3();
    for (const mesh of meshes) {
      if (!spec.material.test(mesh.name)) continue;
      const { index, attributes } = mesh.geometry;
      if (!index) continue;
      const kept = [], moved = [];
      for (let i = 0; i < index.count; i += 3) {
        const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
        const selected = triangle.every(vertex => bounds.containsPoint(
          point.fromBufferAttribute(attributes.position, vertex).applyMatrix4(mesh.matrixWorld)));
        (selected ? moved : kept).push(...triangle);
      }
      if (!moved.length) continue;
      const geometry = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(attributes)) geometry.setAttribute(name, attribute);
      geometry.setIndex(moved);
      const part = new THREE.Mesh(geometry, mesh.material);
      part.castShadow = mesh.castShadow;
      part.receiveShadow = mesh.receiveShadow;
      mesh.add(part);
      group.attach(part);
      mesh.geometry.setIndex(kept);
    }
    if (!group.children.length) { group.removeFromParent(); return []; }
    if (spec.id === 'desk-monitor' && monitor) group.attach(monitor);
    const shapes = spec.boxes.map(([position, size]) => ({
      position: position.map((value, axis) => value - spec.center[axis]),
      rotation: [0, 0, 0, 1], size, friction: .65, bounce: .035
    }));
    return [{ object: group, def: { id: spec.id, name: spec.name, mass: spec.mass, shapes, heavy: true } }];
  });
}
