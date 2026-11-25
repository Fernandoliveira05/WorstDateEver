const cream = '#f7efdf';
const dark = '#271836';
const rose = '#c77c93';
const teal = '#476f73';
const amber = '#a97f43';
const distance = 1.45;

function logoOutline(canvas) {
  const { width, height } = canvas;
  const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const stride = width + 1;
  const edges = new Map();
  const solid = (x, y) => x >= 0 && y >= 0 && x < width && y < height &&
    pixels[(y * width + x) * 4 + 3] > 127;

  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!solid(x, y)) continue;
    const a = y * stride + x;
    if (!solid(x, y - 1)) edges.set(a, a + 1);
    if (!solid(x + 1, y)) edges.set(a + 1, a + stride + 1);
    if (!solid(x, y + 1)) edges.set(a + stride + 1, a + stride);
    if (!solid(x - 1, y)) edges.set(a + stride, a);
  }

  let outline = [];
  while (edges.size) {
    const start = edges.keys().next().value;
    const path = [];
    let point = start;
    while (edges.has(point)) {
      path.push([point % stride, Math.floor(point / stride)]);
      const next = edges.get(point);
      edges.delete(point);
      point = next;
    }
    if (point === start && path.length > outline.length) outline = path;
  }
  return outline;
}

export function createGameMenu(THREE, scene, artwork, options) {
  const group = new THREE.Group();
  group.name = 'Menu 3D';
  group.visible = false;
  scene.object3D.add(group);

  const logo = new THREE.Group();
  logo.name = 'Worst Date Ever · logo';
  logo.position.set(0, .185, 0);
  logo.rotation.set(.08, -.14, 0);
  group.add(logo);
  const status = document.getElementById('menu-status');
  const openButton = document.getElementById('open-game-menu');
  const viewPosition = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const viewRotation = new THREE.Quaternion();
  const gazeAnchor = new THREE.Quaternion();
  const gazeRay = new THREE.Raycaster();
  const gazeDirection = new THREE.Vector3();
  let gazeMode = false, untracked = 0, dwell = 0, gazeIndex = -1;
  const width = .69;
  let view = 'main', selected = -1, hovered = -1, keyboard = false;
  let rows = [];
  let preferences = { windowTime: 0, reducedIntensity: false };

  function surface(w, h, texture, order) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthTest: false, depthWrite: false }));
    mesh.renderOrder = order;
    return mesh;
  }

  function labelSurface(w, h, px, py, order) {
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = py;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { mesh: surface(w, h, texture, order), canvas, ctx, texture };
  }

  function label(layer, name, fill, ink, focus) {
    const { ctx, canvas, texture } = layer;
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);
    if (fill) {
      ctx.beginPath();
      ctx.roundRect(4, 4, w - 8, h - 8, h / 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = focus ? 5 : 2;
      ctx.strokeStyle = focus || fill === dark ? cream : '#f7efdf50';
      ctx.stroke();
    }
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `750 ${Math.round(h * .49)}px system-ui, sans-serif`;
    ctx.fillText(name, w / 2, h / 2, w - 24);
    texture.needsUpdate = true;
  }

  const placeholder = labelSurface(width, .14, 640, 128, 102);
  label(placeholder, 'Worst Date Ever', dark, cream, false);
  logo.add(placeholder.mesh);
  artwork.then(({ logo: canvas }) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const scale = width / canvas.width;
    const height = canvas.height * scale;
    const front = surface(width, height, texture, 102);
    const points = logoOutline(canvas).filter((_, i) => i % 3 === 0);
    if (points.length >= 3) {
      const shape = new THREE.Shape(points.map(([x, y]) =>
        new THREE.Vector2(x * scale - width / 2, height / 2 - y * scale)));
      const sides = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .06, bevelEnabled: false }),
        new THREE.MeshBasicMaterial({ color: '#512f4d', toneMapped: false, depthTest: false, depthWrite: false }));
      sides.position.z = -.062;
      sides.renderOrder = 101;
      logo.add(sides);
    }
    placeholder.mesh.removeFromParent();
    placeholder.mesh.geometry.dispose();
    placeholder.mesh.material.dispose();
    placeholder.texture.dispose();
    logo.add(front);
  }).catch(console.warn);

  const heading = labelSurface(.38, .063, 510, 84, 103);
  heading.mesh.position.y = -.085;
  group.add(heading.mesh);
  const buttons = Array.from({ length: 3 }, (_, index) => {
    const layer = labelSurface(.39, .075, 520, 100, 103);
    layer.mesh.position.set(0, -.116 - .083 * index, .018);
    layer.mesh.userData.menuIndex = index;
    group.add(layer.mesh);
    return layer;
  });

  const gazeHint = labelSurface(.59, .048, 676, 58, 103);
  gazeHint.mesh.position.set(0, -.391, .025);
  gazeHint.mesh.visible = false;
  label(gazeHint, 'Olhe para uma opção e mantenha o olhar', dark, cream, false);
  group.add(gazeHint.mesh);
  const reticle = new THREE.Mesh(new THREE.RingGeometry(.004, .007, 24),
    new THREE.MeshBasicMaterial({ color: cream, transparent: true, depthTest: false, depthWrite: false }));
  reticle.renderOrder = 106;
  reticle.visible = false;
  group.add(reticle);

  function draw() {
    let title = '';
    if (view === 'settings') {
      title = 'Configurações';
      rows = [
        ['Janela · ' + ['Entardecer', 'Dia', 'Noite'][preferences.windowTime], teal, cream, options.cycleWindow],
        ['Efeitos · ' + (preferences.reducedIntensity ? 'Suaves' : 'Padrão'), rose, dark, options.toggleEffects],
        ['Voltar', dark, cream, () => show('main')]
      ];
    } else if (view === 'exited') {
      title = 'Jogo encerrado';
      rows = [['Voltar ao menu', cream, dark, () => show('main')]];
    } else {
      rows = [
        ['Continuar', cream, dark, close],
        ['Configurações', teal, cream, () => show('settings')],
        ['Sair', dark, cream, () => { show('exited'); options.quit(); }]
      ];
    }
    heading.mesh.visible = Boolean(title);
    if (title) label(heading, title, dark, cream, false);
    buttons.forEach((button, i) => {
      button.mesh.visible = Boolean(rows[i]);
      button.mesh.position.y = (title ? -.167 : -.107) - i * .083;
      if (!rows[i]) return;
      const [name, fill, ink] = rows[i];
      const focus = hovered === i || (keyboard && selected === i);
      label(button, name, focus ? amber : fill, focus ? dark : ink, focus);
    });
  }

  function resetGaze() {
    gazeHint.mesh.visible = reticle.visible = gazeMode = false;
    dwell = untracked = 0;
    gazeIndex = -1;
  }

  function close() {
    resetGaze();
    group.visible = false;
    document.body.classList.remove('menu-open');
    status.textContent = '';
  }

  function show(name = 'main') {
    view = name;
    hovered = -1;
    keyboard = false;
    selected = 0;
    dwell = 0;
    gazeIndex = -1;
    group.visible = true;
    document.body.classList.add('menu-open');
    draw();
    status.textContent = rows.map(row => row[0]).join(', ');
  }

  function follow(camera, immersive) {
    if (!group.visible || !camera) return;
    camera.getWorldPosition(viewPosition);
    camera.getWorldQuaternion(viewRotation);
    group.quaternion.copy(viewRotation);
    if (immersive && gazeMode) {
      if (gazeAnchor.angleTo(viewRotation) > .48) gazeAnchor.copy(viewRotation);
      group.quaternion.copy(gazeAnchor).slerp(viewRotation, .40);
    }
    group.position.copy(viewPosition).add(offset.set(0, 0, -distance).applyQuaternion(group.quaternion));
    const aspect = scene.camera?.aspect ?? 1;
    group.scale.setScalar(immersive ? 1 : Math.min(1.43, aspect * 2.3));
    group.updateMatrixWorld(true);
  }

  function hit(ray) {
    if (!group.visible) return null;
    return ray.intersectObjects(buttons.slice(0, rows.length).map(button => button.mesh))[0] ?? null;
  }

  function hover(hit) {
    if (!group.visible) return;
    const next = hit?.object.userData.menuIndex ?? -1;
    if (next === hovered && !keyboard) return;
    keyboard = false;
    hovered = next;
    draw();
  }

  function gaze(camera, hasPointer, delta) {
    if (!group.visible) return null;
    if (hasPointer) {
      if (gazeMode) resetGaze();
      untracked = 0;
      return null;
    }
    if ((untracked += delta) < .45) return null;
    if (!gazeMode) {
      camera.getWorldQuaternion(gazeAnchor);
      gazeMode = gazeHint.mesh.visible = reticle.visible = true;
    }
    camera.getWorldPosition(viewPosition);
    camera.getWorldDirection(gazeDirection);
    gazeRay.set(viewPosition, gazeDirection);
    const target = hit(gazeRay);
    const index = target?.object.userData.menuIndex ?? -1;
    if (index !== gazeIndex || index < 0) dwell = 0;
    else dwell += delta;
    gazeIndex = index;
    const end = gazeRay.ray.at((target?.distance ?? distance) - .025, offset);
    reticle.position.copy(group.worldToLocal(end));
    reticle.scale.setScalar(1 + dwell * .65);
    reticle.material.color.set(index >= 0 ? amber : cream);
    if (dwell > 1.15 && activate(target)) return null;
    return target;
  }

  function activate(hit) {
    if (!hit || !group.visible) return false;
    rows[hit.object.userData.menuIndex]?.[3]();
    return true;
  }

  openButton.addEventListener('click', () => group.visible ? close() : show());
  window.addEventListener('keydown', event => {
    if (event.repeat) return;
    if (event.key === 'Escape') {
      if (!group.visible) show();
      else if (view === 'main') close();
      else show('main');
    } else if (group.visible && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      keyboard = true;
      selected = (selected + rows.length + (event.key === 'ArrowUp' ? -1 : 1)) % rows.length;
      draw();
      status.textContent = rows[selected][0];
    } else if (group.visible && event.key === 'Enter' && event.target.tagName !== 'BUTTON') {
      rows[selected]?.[3]();
    } else return;
    event.preventDefault();
  });

  return { show, close, follow, hit, hover, activate, gaze, resetGaze, get visible() { return group.visible; },
    settings(value) { preferences = value; if (group.visible) draw(); } };
}
