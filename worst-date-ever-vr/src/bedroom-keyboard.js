const rows = [
  ['Esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', ['Back', 2]],
  [['Tab', 1.5], 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', ['\\', 1.5]],
  [['Caps', 1.75], 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", ['Enter', 2.25]],
  [['Shift', 2.25], 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', ['Shift', 2.75]],
  [['Ctrl', 1.25], ['Win', 1.25], ['Alt', 1.25], ['Space', 6.25],
    ['Alt', 1.25], ['Fn', 1.25], ['Menu', 1.25], ['Ctrl', 1.25]]
];

export function buildKeyboard(THREE, keyboard) {
  const originals = keyboard.children.filter(key => /^Tecla(?:_|$)|^Barra[ _]de[ _]espaço/i.test(key.name));
  if (!originals.length) return [];
  const light = new THREE.MeshStandardMaterial({ color: 0xc5b5a3, roughness: .66 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x42434d, roughness: .67 });
  const tops = [light, dark];
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
  if (canvas) {
    canvas.width = canvas.height = 512;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const letters = new THREE.MeshStandardMaterial({ map: texture, roughness: .67 });
    tops.fill(letters);
  }
  const ctx = canvas?.getContext('2d');
  for (const key of originals) key.removeFromParent();
  let index = 0;
  return rows.flatMap((row, y) => {
    let x = .1665;
    return row.map(entry => {
      const [label, units] = typeof entry === 'string' ? [entry, 1] : entry;
      const width = units * .0222;
      const size = [width - .0024, .009, .0186];
      const modifier = Number(label.length > 1);
      const sides = modifier ? dark : light;
      const materials = [sides, sides, tops[modifier], sides, sides, sides];
      const geometry = new THREE.BoxGeometry(...size);
      if (ctx) {
        const tileX = index % 8, tileY = Math.floor(index / 8);
        ctx.fillStyle = modifier ? '#42434d' : '#c5b5a3';
        ctx.fillRect(tileX * 64, tileY * 64, 64, 64);
        ctx.fillStyle = modifier ? '#e9e1d6' : '#282636';
        ctx.font = label.length > 1 ? 'bold 18px sans-serif' : 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label === 'Space' ? '—' : label, tileX * 64 + 32, tileY * 64 + 32, 56);
        const uv = geometry.attributes.uv;
        for (let i = 8; i < 12; i++) {
          const u = 1 - uv.getX(i), v = 1 - uv.getY(i);
          uv.setXY(i, (tileX * 64 + 2 + u * 60) / 512, 1 - (tileY * 64 + 2 + v * 60) / 512);
        }
      }
      index++;
      const mesh = new THREE.Mesh(geometry, materials);
      mesh.name = label === 'Space' ? 'Barra_de_espaço' : 'Tecla_' + label;
      mesh.position.set(x - width / 2, .017, .043 - y * .021);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.layers.enable(27);
      keyboard.add(mesh);
      x -= width;
      return { mesh, size, height: mesh.position.y, pressed: 0 };
    });
  });
}
