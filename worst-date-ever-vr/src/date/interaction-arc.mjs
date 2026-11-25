export const INTERACTION_STYLE = Object.freeze({
  fill: '#38162D', outline: '#F9A8D4', accent: '#EC4899',
  highlight: '#F472B6', text: '#FFF5FA', opacity: 0.88,
  depth: 0.16, arcHeight: 0.69, sideDrop: 0.41,
  sideRadius: 1.40, singleSide: -0.62, cardGap: 0.045,
  cardHeight: 0.18, enterSeconds: 0.24, moveSpeed: 11,
  gazeHideDot: 0.52, gazeShowDot: 0.69, gazeAwaySeconds: 0.12,
  gazeRise: 0.065, gazeEnterSeconds: 0.28, gazeExitSeconds: 0.16,
  focusScale: 1.055, tilt: 0.09
});

export function cardWidth(count) {
  return count <= 3 ? 0.55 : count <= 5 ? 0.47 : count <= 7 ? 0.42 : 0.39;
}

export function arcSlots(count) {
  if (!count) return [];
  if (count === 1) return [{ x: INTERACTION_STYLE.singleSide, y: 0.32, depth: INTERACTION_STYLE.depth, tilt: -INTERACTION_STYLE.tilt }];
  const radius = Math.max(0.64, (count - 1) * (cardWidth(count) + INTERACTION_STYLE.cardGap) / 2,
    count >= 8 ? INTERACTION_STYLE.sideRadius : 0);
  return Array.from({ length: count }, (_, index) => {
    const normalized = index / (count - 1) * 2 - 1;
    return {
      x: normalized * radius,
      y: INTERACTION_STYLE.arcHeight - INTERACTION_STYLE.sideDrop * normalized ** 2,
      depth: INTERACTION_STYLE.depth + 0.05 * (1 - normalized ** 2),
      tilt: -normalized * INTERACTION_STYLE.tilt
    };
  });
}

export function gazeShowsMenu(alignment, currentlyVisible) {
  return alignment >= (currentlyVisible ? INTERACTION_STYLE.gazeHideDot : INTERACTION_STYLE.gazeShowDot);
}

export function cardCorners(key, width, height = INTERACTION_STYLE.cardHeight) {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const n = shift => ((hash >>> shift) & 15) / 15 - 0.5;
  const x = width / 2, y = height / 2;
  return [
    [-x + n(0) * 0.045, y + n(4) * 0.028],
    [x + n(8) * 0.035, y + n(12) * 0.025],
    [x + n(16) * 0.047, -y + n(20) * 0.025],
    [-x + n(24) * 0.038, -y + n(28) * 0.027]
  ];
}
