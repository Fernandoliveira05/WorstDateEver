export const QTE_CONFIG = Object.freeze({
  water_spill: Object.freeze({ duration: 5, worldSpeed: .15, recovery: .65,
    dim: .38, desaturate: .48, focus: [-.32, 1.18, -.24], color: 0x91d5e8 }),
  dropped_menu: Object.freeze({ duration: 5, worldSpeed: .15, recovery: .65,
    dim: .38, desaturate: .48, focus: [0, .82, .12], color: 0xffbd91 }),
  bathroom_mishap: Object.freeze({ duration: 5, worldSpeed: .15, recovery: .65,
    dim: .38, desaturate: .48, focus: [-5.08, 1.72, -6.12], color: 0xf472b6 })
});

export const QTE_MENU = Object.freeze({ distance: 1.58, eyeDrop: .49,
  sideX: .64, centerY: .14, sideY: .06, tilt: .065 });

export function qteConfig(eventId) { return QTE_CONFIG[eventId] ?? null; }

export function qteMenuAnchor(focus, viewer, forward = [0, 0, -1]) {
  const face = [forward[0], forward[2]];
  const faceLength = Math.hypot(...face) || 1;
  const event = [focus[0] - viewer[0], focus[2] - viewer[2]];
  const eventLength = Math.hypot(...event) || 1;
  const direction = [face[0] / faceLength * .76 + event[0] / eventLength * .24,
    face[1] / faceLength * .76 + event[1] / eventLength * .24];
  const length = Math.hypot(...direction) || 1;
  return [viewer[0] + direction[0] / length * QTE_MENU.distance,
    viewer[1] - QTE_MENU.eyeDrop,
    viewer[2] + direction[1] / length * QTE_MENU.distance];
}

export function qteMenuSlots(count) {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 0, y: QTE_MENU.centerY, depth: 0, tilt: 0 }];
  return Array.from({ length: count }, (_, index) => {
    const normalized = index / (count - 1) * 2 - 1;
    return { x: normalized * QTE_MENU.sideX,
      y: QTE_MENU.centerY - (QTE_MENU.centerY - QTE_MENU.sideY) * normalized ** 2,
      depth: 0, tilt: -normalized * QTE_MENU.tilt };
  });
}

export function qteWorldSpeed(beat, recoveryRemaining = 0) {
  const config = qteConfig(beat?.definition?.id);
  if (!config) return 1;
  if (beat.phase === 'qte') return config.worldSpeed;
  if (beat.phase === 'resolve' && recoveryRemaining > 0)
    return 1 - (1 - config.worldSpeed) * Math.min(1, recoveryRemaining / config.recovery);
  return 1;
}

export function qteWorldDelta(beat, recoveryRemaining, realSeconds) {
  const config = qteConfig(beat?.definition?.id);
  if (!config) return realSeconds;
  if (beat.phase === 'qte') return realSeconds * config.worldSpeed;
  if (beat.phase !== 'resolve' || recoveryRemaining <= 0) return realSeconds;
  const recovering = Math.min(realSeconds, recoveryRemaining);
  const averageRemaining = recoveryRemaining - recovering / 2;
  const averageSpeed = 1 - (1 - config.worldSpeed) * averageRemaining / config.recovery;
  return recovering * averageSpeed + (realSeconds - recovering);
}
