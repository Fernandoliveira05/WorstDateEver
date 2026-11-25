export function buildCorridorCreature(THREE, group, skin) {
  const cloth = skin(0x18101c, .87);
  const fold = skin(0x21121d, .91);
  const head = skin(0x130e18, .82);
  const sockets = skin(0x080508, .20);
  const iris = skin(0xeab33f, .08);
  const eyeRim = skin(0xa86320, .20);
  const enamel = skin(0xc78a2e, .15);
  const pupil = skin(0x130912, .12);

  function piece(name, geometry, material, position, angle = 0, order = 1) {
    geometry.rotateZ(angle);
    geometry.translate(...position);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.renderOrder = order;
    group.add(mesh);
  }

  function oval(name, size, position, material, angle = 0, order = 1) {
    piece(name, new THREE.SphereGeometry(1, 24, 16).scale(...size), material, position, angle, order);
  }

  const hem = new THREE.LatheGeometry([
    [.16, .035], [.24, .13], [.20, .60], [.155, .96], [.215, 1.24],
    [.264, 1.47], [.247, 1.57], [.159, 1.66], [.08, 1.70], [0, 1.71]
  ].map(point => new THREE.Vector2(...point)), 28);
  hem.scale(1, 1, .62);
  const vertices = hem.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
    const t = Math.atan2(z / .62, x);
    const folds = Math.sin(t * 5 + y * 1.2) * .12 + Math.sin(t * 8 - y * 3) * .07;
    vertices.setXYZ(i, x * (1 + folds), y + Math.max(0, .4 - y) * folds, z * (1 + folds));
  }
  hem.computeVertexNormals();
  piece('Manto com dobras', hem, cloth, [0, 0, 0]);
  for (const side of [-1, 1]) {
    oval('Ombro', [.115, .16, .109], [side * .214, 1.43, .015], fold, side * .32);
    oval('Braço comprido', [.080, .291, .086], [side * .286, 1.23, .007], cloth, side * .18);
    oval('Antebraço', [.059, .239, .070], [side * .327, .88, .043], cloth, side * .1);
    oval('Mão no escuro', [.058, .105, .040], [side * .343, .66, .077], fold, side * .14);
    oval('Pé', [.095, .066, .15], [side * .115, .06, .036], cloth, side * .07);
  }

  oval('Capuz', [.240, .249, .168], [0, 1.84, -.011], fold, -.04);
  oval('Cabeça redonda', [.206, .213, .158], [0, 1.85, .041], head, -.02);
  for (const [x, y, radius] of [[-.100, 1.914, .053], [.100, 1.927, .049]]) {
    oval('Órbita escura', [radius + .014, radius + .012, .027], [x, y, .177], sockets, 0, 3);
    oval('Borda âmbar do olho', [radius, radius, .025], [x, y, .196], eyeRim, 0, 4);
    oval('Olho redondo', [radius * .81, radius * .81, .022], [x, y, .207], iris, 0, 5);
    oval('Pupila', [radius * .32, radius * .34, .009], [x + .003, y + .002, .226], pupil, 0, 6);
  }

  const grin = new THREE.Shape();
  grin.moveTo(-.163, .042);
  grin.bezierCurveTo(-.071, -.024, .071, -.026, .163, .045);
  grin.bezierCurveTo(.144, -.030, .083, -.082, .004, -.085);
  grin.bezierCurveTo(-.073, -.083, -.141, -.030, -.163, .042);
  const mouth = new THREE.ShapeGeometry(grin, 22);
  // Wrap the smile and teeth around the cheeks so they hold from side angles.
  function wrap(geometry) {
    const vertices = geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) vertices.setZ(i, -.98 * vertices.getX(i) ** 2);
    geometry.computeVertexNormals();
    return geometry;
  }
  piece('Sorriso em crescente', wrap(mouth), sockets, [0, 1.768, .210], 0, 7);

  for (let i = 0; i < 10; i++) {
    const x = -.131 + i * .0291;
    const edge = Math.abs(x) / .138;
    const y = .040 * edge ** 2 - .016;
    const w = .010 + (1 - edge) * .002;
    const tooth = new THREE.Shape();
    tooth.moveTo(x - w, y);
    tooth.quadraticCurveTo(x, y + .005, x + w, y + .004);
    tooth.lineTo(x + w * .38, y - .022 - (1 - edge) * .004);
    tooth.quadraticCurveTo(x - w * .42, y - .026, x - w * .52, y - .018);
    tooth.closePath();
    piece('Dente de cima', wrap(new THREE.ShapeGeometry(tooth, 5)), enamel, [0, 1.768, .214], 0, 8);
  }

  for (let i = 0; i < 7; i++) {
    const x = -.096 + i * .032;
    const y = -.069 + .027 * (x / .096) ** 2;
    const tooth = new THREE.Shape();
    tooth.moveTo(x - .009, y);
    tooth.lineTo(x - .003, y + .015);
    tooth.quadraticCurveTo(x + .003, y + .018, x + .010, y + .003);
    tooth.lineTo(x + .009, y);
    tooth.closePath();
    piece('Dente de baixo', wrap(new THREE.ShapeGeometry(tooth, 5)), enamel, [0, 1.768, .214], 0, 8);
  }
}
