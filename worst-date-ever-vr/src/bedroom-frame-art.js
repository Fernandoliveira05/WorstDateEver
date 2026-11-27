export function createFrameArt(THREE, subject) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  function fill(color, path) {
    ctx.fillStyle = color;
    ctx.beginPath();
    path();
    ctx.fill();
  }
  function oval(color, x, y, width, height) {
    fill(color, () => ctx.ellipse(x, y, width, height, 0, 0, Math.PI * 2));
  }
  function silhouette(color, points) {
    fill(color, () => {
      ctx.moveTo(...points[0]);
      for (const point of points.slice(1)) ctx.lineTo(...point);
      ctx.closePath();
    });
  }

  const bg = ctx.createLinearGradient(0, 0, 0, 400);
  const tones = {
    coast: ['#b7abbc', '#f7c98f'],
    rio: ['#9d526a', '#f6ae73'],
    cat: ['#d29885', '#f5d5a5']
  };
  bg.addColorStop(0, tones[subject][0]);
  bg.addColorStop(1, tones[subject][1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 320, 400);
  if (subject === 'cat') {
    oval('#f1bd7e', 160, 188, 127, 143);
    oval('#51434e', 165, 367, 97, 139);
    silhouette('#51434e', [[78, 154], [87, 91], [145, 136], [185, 135], [236, 96], [244, 175]]);
    oval('#51434e', 160, 204, 87, 75);
    oval('#e8cc94', 128, 196, 14, 13);
    oval('#e8cc94', 194, 196, 14, 13);
    oval('#444047', 131, 196, 4, 10);
    oval('#444047', 191, 196, 4, 10);
    silhouette('#d18d91', [[149, 217], [173, 217], [161, 228]]);
    ctx.strokeStyle = '#f2d6b4';
    ctx.lineWidth = 2;
    for (const side of [-1, 1]) for (const dy of [-11, 0, 11]) {
      ctx.beginPath();
      ctx.moveTo(160 + side * 42, 226 + dy * .45);
      ctx.lineTo(160 + side * 79, 226 + dy);
      ctx.stroke();
    }
  } else {
    const rio = subject === 'rio';
    oval('#ffd49a', rio ? 153 : 225, rio ? 157 : 126, rio ? 62 : 39, rio ? 62 : 39);
    silhouette(rio ? '#ab667a' : '#8888a2',
      [[0, 251], [33, 226], [74, 237], [129, 211], [186, 231], [235, 197], [273, 191], [320, 237], [320, 400], [0, 400]]);
    if (rio) {
      fill('#785363', () => {
        ctx.moveTo(0, 276);
        ctx.bezierCurveTo(45, 249, 86, 255, 132, 268);
        ctx.bezierCurveTo(172, 272, 183, 224, 200, 211);
        ctx.bezierCurveTo(225, 193, 243, 228, 247, 256);
        ctx.lineTo(320, 273);
        ctx.lineTo(320, 400);
        ctx.lineTo(0, 400);
        ctx.closePath();
      });
    }
    silhouette(rio ? '#59676e' : '#638786',
      [[0, 298], [73, 292], [119, 305], [177, 292], [236, 299], [320, 281], [320, 400], [0, 400]]);
    ctx.fillStyle = '#ebaf9a70';
    for (let i = 0; i < 9; i++) ctx.fillRect((i * 83 + 36) % 297, 301 + i * 8, 15 + (i % 5) * 5, 2);
    fill(rio ? '#42434e' : '#d8ae84', () => {
      ctx.moveTo(0, 388);
      ctx.quadraticCurveTo(116, 364, 193, 381);
      ctx.quadraticCurveTo(251, 384, 320, 335);
      ctx.lineTo(320, 400);
      ctx.lineTo(0, 400);
      ctx.closePath();
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
