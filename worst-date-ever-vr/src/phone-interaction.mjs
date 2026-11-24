// Pure interaction helpers shared by the A-Frame scene and unit tests.
// These functions contain no DOM or WebXR dependencies.

export const TAP_DEBOUNCE_MS = 320;
export const TAP_REARM_MS = 140;
export const GRAB_COOLDOWN_MS = 380;
export const HAND_LOSS_GRACE_MS = 650;

export const SCREEN_WIDTH_M = 0.154;
export const SCREEN_HEIGHT_M = 0.272;
export const TAP_FRONT_LIMIT_M = 0.022;
export const TAP_BACK_LIMIT_M = -0.006;

export function createTapGate() {
  return { armed: true, latchedUntil: 0, clearSince: 0 };
}

export function resetTapGate(gate) {
  gate.armed = true;
  gate.latchedUntil = 0;
  gate.clearSince = 0;
  return gate;
}

/**
 * Debounce index-finger contacts against a screen.
 *
 * `contact` should be true only when the fingertip is inside the screen plane
 * and in front of it. A tap is emitted once per contact edge, then the gate
 * stays closed until the finger has been clear for `rearmMs` and the debounce
 * interval has elapsed. This tolerates tracking jitter without rapid repeats.
 */
export function updateTapGate(gate, now, contact, options = {}) {
  const debounceMs = options.debounceMs ?? TAP_DEBOUNCE_MS;
  const rearmMs = options.rearmMs ?? TAP_REARM_MS;

  if (contact) {
    gate.clearSince = 0;
    if (!gate.armed || now < gate.latchedUntil) { return false; }
    gate.armed = false;
    gate.latchedUntil = now + debounceMs;
    return true;
  }

  if (!gate.armed) {
    if (!gate.clearSince) { gate.clearSince = now; }
    if (now - gate.clearSince >= rearmMs && now >= gate.latchedUntil) {
      gate.armed = true;
      gate.clearSince = 0;
    }
  }
  return false;
}

/**
 * Return the last (topmost) UI target containing a screen-local point.
 */
export function hitTestTapTargets(x, y, targets) {
  for (let i = targets.length - 1; i >= 0; i--) {
    const target = targets[i];
    if (
      x >= target.x - target.width / 2 &&
      x <= target.x + target.width / 2 &&
      y >= target.y - target.height / 2 &&
      y <= target.y + target.height / 2
    ) {
      return target;
    }
  }
  return null;
}

export function isPointInsideBox(point, size, margin = 0) {
  return (
    Math.abs(point.x) <= size.width / 2 + margin &&
    Math.abs(point.y) <= size.height / 2 + margin &&
    Math.abs(point.z) <= size.depth / 2 + margin
  );
}

export function isTapContact(localPoint) {
  return (
    Math.abs(localPoint.x) <= SCREEN_WIDTH_M / 2 &&
    Math.abs(localPoint.y) <= SCREEN_HEIGHT_M / 2 &&
    localPoint.z >= TAP_BACK_LIMIT_M &&
    localPoint.z <= TAP_FRONT_LIMIT_M
  );
}

export function nearestPinchTarget(point, candidates) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = point.distanceTo(candidate.position);
    if (distance <= candidate.radius && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
