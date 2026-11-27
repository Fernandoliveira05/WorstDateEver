// These rectangles are the primary lockup and standalone icon on the supplied brand board.
const crops = {
  logo: [60, 697, 365, 250],
  heart: [478, 719, 236, 217]
};

function cutout(board, [x, y, width, height]) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(board, x, y, width, height, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const pixels = image.data;
  const seen = new Uint8Array(width * height);
  const queue = [];
  function visit(index) {
    if (seen[index]) return;
    seen[index] = 1;
    const i = index * 4;
    // Only remove cream pixels connected to the border, preserving the lettering and teeth.
    if (pixels[i] < 179 || pixels[i + 1] < 153 || pixels[i + 2] < 126 ||
        pixels[i] - pixels[i + 1] > 52 || pixels[i + 1] - pixels[i + 2] > 39) return;
    pixels[i + 3] = 0;
    queue.push(index);
  }
  for (let col = 0; col < width; col++) {
    visit(col);
    visit((height - 1) * width + col);
  }
  for (let row = 0; row < height; row++) {
    visit(row * width);
    visit(row * width + width - 1);
  }
  for (let i = 0; i < queue.length; i++) {
    const index = queue[i];
    if (index % width > 0) visit(index - 1);
    if (index % width < width - 1) visit(index + 1);
    if (index >= width) visit(index - width);
    if (index + width < seen.length) visit(index + width);
  }
  // Trim the few matte-contaminated pixels along the cutout, then soften its new edge.
  const exterior = new Uint8Array(width * height);
  for (const index of queue) exterior[index] = 1;
  for (let row = 2; row < height - 2; row++) {
    for (let col = 2; col < width - 2; col++) {
      const index = row * width + col;
      if (exterior[index]) continue;
      if (exterior[index - 1] || exterior[index + 1] ||
          exterior[index - width] || exterior[index + width]) pixels[index * 4 + 3] = 0;
      else if (exterior[index - 2] || exterior[index + 2] || exterior[index - 2 * width] ||
          exterior[index + 2 * width] || exterior[index - width - 1] || exterior[index - width + 1] ||
          exterior[index + width - 1] || exterior[index + width + 1]) pixels[index * 4 + 3] = 112;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function loadBrandArt(url) {
  const board = new Image();
  board.src = url;
  return board.decode().then(() => ({
    logo: cutout(board, crops.logo),
    heart: cutout(board, crops.heart)
  }));
}
