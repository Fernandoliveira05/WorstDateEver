// Small, reusable world-space effects for the three voluntary skill scenes.
// Geometry is shared, particles are pooled, and nothing moves the player's camera.
export function createMinigameVisuals(THREE, { parent, camera, fruits, date, audio }) {
  const root = new THREE.Group();
  root.name = 'Minigame stage';
  parent.add(root);
  const dance = new THREE.Group(), juggle = new THREE.Group(), balance = new THREE.Group();
  dance.name = 'Dance rhythm lanes';
  juggle.name = 'Juggle catch field';
  balance.name = 'Holographic balance gyroscope';
  root.add(juggle);
  camera.add(dance, balance);
  dance.position.set(0, -.28, -1.18);
  dance.quaternion.identity();
  balance.position.set(.50, -.27, -1.02);
  balance.scale.setScalar(.85);
  const palette = [0xf472b6, 0xb995ff];
  const mat = (color, opacity = 1, emissive = color, intensity = .7) => new THREE.MeshBasicMaterial({
    color, transparent: opacity < 1, opacity, depthWrite: false, depthTest: false,
    toneMapped: false, side: THREE.DoubleSide, blending: opacity < .7 ? THREE.AdditiveBlending : THREE.NormalBlending
  });
  const material = { pink: mat(palette[0], .8), violet: mat(palette[1], .8),
    faint: mat(0xd99bce, .19), white: mat(0xfff5fa, .95), red: mat(0xff8c9d, .9) };
  const ringGeometry = new THREE.TorusGeometry(1, .025, 5, 48);
  const circular = (host, radius, color, opacity, z = 0) => {
    const mesh = new THREE.Mesh(ringGeometry, mat(color, opacity));
    mesh.scale.setScalar(radius);
    mesh.position.z = z;
    mesh.renderOrder = 10009;
    host.add(mesh);
    return mesh;
  };
  function roundedBlock() {
    const s = new THREE.Shape();
    const w = .13, h = .11, r = .025;
    s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r);
    s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h);
    s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r);
    s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
    return new THREE.ExtrudeGeometry(s, { depth: .035, bevelEnabled: true,
      bevelThickness: .015, bevelSize: .012, bevelSegments: 1, steps: 1, curveSegments: 3 });
  }
  const blockGeometry = roundedBlock();
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(-.065,-.025); arrowShape.lineTo(-.005,-.025);
  arrowShape.lineTo(-.005,-.060); arrowShape.lineTo(.073,0);
  arrowShape.lineTo(-.005,.060); arrowShape.lineTo(-.005,.025);
  arrowShape.lineTo(-.065,.025); arrowShape.closePath();
  const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
  const lanes = [-1, 1].map((side, index) => {
    const lane = new THREE.Group();
    lane.position.x = side * .48;
    dance.add(lane);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(.34, 1.32), mat(palette[index], .065));
    glow.rotation.x = Math.PI / 2;
    glow.position.set(0, -.16, -.38);
    lane.add(glow);
    for (const railSide of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, 1.28, 6), mat(palette[index], .46));
      rail.rotation.x = Math.PI / 2;
      rail.position.set(railSide * .17, -.08, -.37);
      lane.add(rail);
    }
    for (let k = 0; k < 5; k++) {
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(.31, .006), mat(palette[index], .23));
      tick.position.set(0, -.07, -.95 + k * .27);
      lane.add(tick);
    }
    const portal = circular(lane, .18, palette[index], .84, -.57);
    const portalInner = circular(lane, .115, 0xfff5fa, .43, -.565);
    return { lane, portal, portalInner, side };
  });
  const danceHitline = new THREE.Mesh(new THREE.PlaneGeometry(1.12, .012), mat(0xfff5fa, .64));
  danceHitline.position.set(0, -.03, -.56);
  danceHitline.renderOrder = 10012;
  dance.add(danceHitline);
  const danceNotes = Array.from({ length: 9 }, (_, index) => {
    const group = new THREE.Group();
    group.name = 'rhythm-note-' + index;
    const side = index % 2;
    const core = new THREE.Mesh(blockGeometry, mat(palette[side], .89));
    core.renderOrder = 10010;
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(blockGeometry),
      new THREE.LineBasicMaterial({ color: 0xfff5fa, transparent: true, opacity: .72,
        depthTest: false, depthWrite: false, toneMapped: false }));
    rim.renderOrder = 10011;
    const arrow = new THREE.Mesh(arrowGeometry, mat(0xfff5fa, .94));
    arrow.position.z = .081;
    arrow.renderOrder = 10013;
    const trail = new THREE.Mesh(new THREE.BoxGeometry(.18,.12,.42), mat(palette[side], .13));
    trail.position.z = -.21;
    trail.renderOrder = 10009;
    group.add(trail, core, rim, arrow);
    dance.add(group);
    return group;
  });
  const catchRings = [-1, 1].map((side, index) => {
    const group = new THREE.Group();
    group.position.set(side * .23, .91, -.13);
    juggle.add(group);
    const outer = circular(group, .10, palette[index], .74);
    const inner = circular(group, .068, 0xfff5fa, .55, .005);
    for (let k = 0; k < 4; k++) {
      const dot = new THREE.Mesh(new THREE.BoxGeometry(.012, .012, .006), mat(palette[index], .65));
      dot.position.set(Math.sin(k * Math.PI / 2) * .145, Math.cos(k * Math.PI / 2) * .145, 0);
      group.add(dot);
    }
    return { group, outer, inner };
  });
  const arcMaterial = new THREE.LineBasicMaterial({ color: 0xf9a8d4, transparent: true,
    opacity: .24, depthWrite: false, depthTest: false, toneMapped: false });
  const arcs = [-1, 1].map((side, index) => {
    const points = Array.from({ length: 24 }, (_, k) => {
      const u = k / 23;
      return new THREE.Vector3(THREE.MathUtils.lerp(-side * .20, side * .23, u),
        .96 + Math.sin(Math.PI * u) * .34, -.14 - Math.sin(Math.PI * u) * .10);
    });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), arcMaterial);
    line.renderOrder = 10008;
    juggle.add(line);
    return line;
  });
  const trails = fruits.map((fruit, index) => {
    const positions = new Float32Array(30 * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
      color: [0xffb979, 0xffe291, 0xbfe89a][index], transparent: true, opacity: .62,
      depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending
    }));
    line.renderOrder = 10012;
    juggle.add(line);
    return { line, history: [] };
  });
  const gyro = new THREE.Group();
  balance.add(gyro);
  const gyroRings = [.10, .145, .19, .225].map((radius, index) => circular(gyro, radius,
    index === 1 ? 0xfff5fa : 0xf9a8d4, index === 1 ? .68 : .36, -.01));
  for (let k = 0; k < 24; k++) {
    const angle = k * Math.PI / 12;
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(k % 3 ? .004 : .009, k % 3 ? .013 : .028),
      mat(k % 3 ? 0xf9a8d4 : 0xfff5fa, .55));
    tick.position.set(Math.sin(angle) * .264, Math.cos(angle) * .264, .001);
    tick.rotation.z = -angle;
    gyro.add(tick);
  }
  const bubble = new THREE.Group();
  bubble.add(new THREE.Mesh(new THREE.SphereGeometry(.032, 12, 8), mat(0xfff5fa, .90)));
  circular(bubble, .055, 0xf472b6, .8, .001);
  bubble.position.z = .02;
  gyro.add(bubble);
  const progressGeometry = new THREE.BufferGeometry();
  progressGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(65 * 3), 3));
  const progress = new THREE.Line(progressGeometry, new THREE.LineBasicMaterial({
    color: 0xfff5fa, transparent: true, opacity: .95, depthTest: false,
    depthWrite: false, toneMapped: false
  }));
  gyro.add(progress);
  const particleGeometry = new THREE.IcosahedronGeometry(.012, 0);
  const particles = Array.from({ length: 72 }, (_, index) => {
    const mesh = new THREE.Mesh(particleGeometry, mat([0xf472b6,0xb995ff,0xffe291,0xfff5fa][index % 4], .84));
    mesh.visible = false;
    mesh.renderOrder = 10014;
    root.add(mesh);
    return { mesh, velocity: new THREE.Vector3(), life: 0 };
  });
  const cameraPosition = new THREE.Vector3(), cameraForward = new THREE.Vector3();
  const unitZ = new THREE.Vector3(0, 0, 1), worldUp = new THREE.Vector3(0, 1, 0);
  let activeId = null, particlesCursor = 0, visualAge = 0, seenTaps = 0, seenMisses = 0;
  let lastFeedback = null;
  const stageLight = new THREE.PointLight(0xec4899, 0, 2.1, 2);
  root.add(stageLight);

  function burst(point, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const particle = particles[particlesCursor++ % particles.length];
      const a = i * 2.39996;
      particle.mesh.position.copy(point);
      particle.mesh.material.color.setHex(color);
      particle.mesh.visible = true;
      particle.mesh.scale.setScalar(.75 + (i % 4) * .18);
      particle.velocity.set(Math.cos(a) * (.20 + (i % 3) * .07),
        Math.sin(a) * .25 + .10, (i % 2 ? 1 : -1) * .10);
      particle.life = .42 + (i % 4) * .05;
    }
  }
  function start(id) {
    activeId = id;
    visualAge = 0; seenTaps = 0; seenMisses = 0; lastFeedback = null;
    camera.getWorldPosition(cameraPosition);
    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    if (cameraForward.lengthSq() < .01) cameraForward.set(0,0,-1);
    cameraForward.normalize();
    juggle.position.set(0,0,0);
    dance.visible = id === 'dance';
    juggle.visible = id === 'juggle';
    balance.visible = id === 'balance';
    for (const trail of trails) trail.history.length = 0;
  }
  function stop() {
    activeId = null;
    dance.visible = juggle.visible = balance.visible = false;
    stageLight.intensity = 0;
    for (const particle of particles) { particle.life = 0; particle.mesh.visible = false; }
  }
  function update(state, stage, dt) {
    if (!activeId) return;
    visualAge += dt;
    const preview = stage !== 'playing' && stage !== 'result';
    const time = preview ? .95 + Math.sin(visualAge * 1.5) * .21 : state.elapsed;
    if (activeId === 'dance') {
      stageLight.color.setHex(visualAge % 1.38 < .69 ? 0xec4899 : 0xa678e6);
      stageLight.position.copy(dance.position);
      stageLight.intensity = .22 + Math.max(0, Math.sin(time * Math.PI * 2 / .60)) *
        (.30 + Math.min(.65, state.combo * .09));
      lanes.forEach(({ portal, portalInner }, index) => {
        const nearest = state.beats.find((beat, beatIndex) => beatIndex >= state.beat &&
          beat.side === (index ? 'right' : 'left'));
        const pulse = nearest ? Math.max(0, 1 - Math.abs(nearest.at - time) / .30) : 0;
        portal.scale.setScalar(.18 + pulse * .075);
        portalInner.material.opacity = .32 + pulse * .62;
      });
      danceNotes.forEach((note, index) => {
        const beat = state.beats[index];
        const ahead = beat.at - time;
        note.visible = ahead > -.22 && ahead < 1.05 && (preview || index >= state.beat);
        note.children[0].material.color.setHex(beat.side === 'left' ? palette[0] : palette[1]);
        note.children[1].material.color.setHex(beat.side === 'left' ? palette[0] : palette[1]);
        note.children[3].rotation.z = ({ up: Math.PI / 2, down: -Math.PI / 2,
          left: Math.PI, right: 0 })[beat.cut] ?? 0;
        const approach = THREE.MathUtils.clamp(ahead / 1.05, 0, 1);
        note.position.set((beat.side === 'left' ? -1 : 1) * .48, -.03,
          -.57 - approach * 1.40);
        note.scale.setScalar(.82 + (1 - approach) * .24);
      });
    } else if (activeId === 'juggle') {
      const next = state.beats[state.beat];
      catchRings.forEach(({ group, outer, inner }, index) => {
        const isNext = next?.side === (index ? 'right' : 'left');
        const approach = isNext ? Math.max(0, 1 - Math.abs(next.at - time) / .82) : 0;
        group.visible = preview || Boolean(next);
        outer.scale.setScalar(.13 - approach * .045);
        inner.scale.setScalar(.065 + approach * .02);
        group.children.forEach(child => { if (child.material?.opacity != null) child.material.opacity =
          isNext ? .48 + approach * .5 : .20; });
      });
      arcs.forEach((arc, index) => { arc.material.opacity = .14 + .13 *
        Math.sin(visualAge * 2 + index) ** 2; });
      trails.forEach((trail, index) => {
        const fruit = fruits[index];
        trail.line.visible = fruit.mesh.visible && !fruit.fallen;
        if (!trail.line.visible) { trail.history.length = 0; return; }
        trail.history.push(fruit.mesh.position.clone());
        if (trail.history.length > 30) trail.history.shift();
        const attr = trail.line.geometry.attributes.position;
        for (let k = 0; k < 30; k++) {
          const point = trail.history[Math.max(0, trail.history.length - 30 + k)] ?? fruit.mesh.position;
          attr.setXYZ(k, point.x, point.y, point.z);
        }
        attr.needsUpdate = true;
      });
      stageLight.position.set(0,1.12,-.15);
      stageLight.intensity = .32 + Math.min(.55, state.combo * .11);
    } else if (activeId === 'balance') {
      const risk = Math.min(1, Math.hypot(state.tilt, state.tiltY) / .68);
      const color = new THREE.Color(0xf9a8d4).lerp(new THREE.Color(0xff8296), risk);
      for (const ring of gyroRings) ring.material.color.copy(color);
      bubble.position.set(state.tilt * .23, -state.tiltY * .23, .02);
      bubble.children[0].material.color.copy(color);
      gyro.rotation.z = Math.sin(visualAge * .36) * .025;
      const points = progressGeometry.attributes.position;
      const ratio = Math.min(1, state.stableTime / 3.8);
      for (let k = 0; k < 65; k++) {
        const a = -Math.PI / 2 + Math.PI * 2 * ratio * k / 64;
        points.setXYZ(k, Math.cos(a) * .31, Math.sin(a) * .31, .015);
      }
      points.needsUpdate = true;
      progressGeometry.setDrawRange(0, Math.max(2, Math.round(65 * ratio)));
      gyro.scale.setScalar(1 + (risk > .7 ? Math.sin(visualAge * 11) * .018 * risk : 0));
      stageLight.position.copy(cameraPosition).addScaledVector(cameraForward, .8);
      stageLight.intensity = .15 + risk * .35;
      if (risk > .80 && Math.floor(visualAge * 3) !== Math.floor((visualAge - dt) * 3))
        audio('interaction_warning', cameraPosition);
    }
    if (state.taps.length > seenTaps) {
      const tap = state.taps.at(-1);
      const point = activeId === 'juggle' ? fruits[tap.fruit].mesh.position :
        dance.localToWorld(new THREE.Vector3(tap.side === 'left' ? -.48 : .48, -.03, -.57));
      burst(point, tap.grade === 'perfect' ? 0xfff5fa : 0xf472b6, tap.grade === 'perfect' ? 18 : 11);
      audio(tap.grade === 'perfect' ? 'interaction_perfect' : 'interaction_hit', point);
      if (state.combo > 1 && state.combo % 3 === 0) audio('interaction_combo', point);
      lastFeedback = { text: tap.grade === 'perfect' ? 'PERFEITO!' : 'BOA!',
        combo: state.combo, age: 0, side: tap.side };
      seenTaps = state.taps.length;
    }
    if (state.failures.length > seenMisses) {
      lastFeedback = { text: activeId === 'juggle' ? 'ESCAPOU!' : 'FORA DO RITMO',
        combo: 0, age: 0 };
      seenMisses = state.failures.length;
    }
    if (lastFeedback) lastFeedback.age += dt;
    for (const particle of particles) if (particle.life > 0) {
      particle.life -= dt;
      particle.velocity.y -= dt * .66;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.mesh.scale.multiplyScalar(Math.max(.82, 1 - dt * 2.6));
      particle.mesh.visible = particle.life > 0;
    }
  }
  function dispose() {
    stop();
    camera.remove(dance, balance);
    root.removeFromParent();
    for (const host of [root, balance]) host.traverse(object => {
      object.geometry?.dispose();
      if (object.material) for (const item of Array.isArray(object.material) ? object.material : [object.material])
        if (![...Object.values(material), arcMaterial].includes(item)) item.dispose();
    });
    for (const item of Object.values(material)) item.dispose();
    arcMaterial.dispose();
  }
  stop();
  return { start, stop, update, dispose, feedback: () => lastFeedback };
}
