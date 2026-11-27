export const FRIEND_VISIT = Object.freeze({
  arrivalSeconds: 5.8,
  decisionSeconds: 6,
  introductionHoldSeconds: .7,
  exitSeconds: 3.7,
  route: Object.freeze([
    [3.95, 0, -6.45],
    [1.1, 0, -6.45],
    [1.1, 0, -4.7],
    [1.1, 0, -2.25],
    [.98, 0, -1.38]
  ])
});

export function friendVisitMotion(beat, time) {
  if (beat?.definition?.id !== 'awkward_friend') return { visible: false, arriving: false, progress: 0 };
  if (beat.phase === 'announce' || beat.phase === 'animate' || beat.phase === 'choice_window') {
    const progress = Math.min(1, Math.max(0, (time - beat.at) / FRIEND_VISIT.arrivalSeconds));
    return { visible: true, arriving: progress < 1, progress };
  }
  if (beat.phase === 'resolve' || beat.phase === 'cooldown') {
    const wait = beat.choiceId === 'introduce' ? FRIEND_VISIT.introductionHoldSeconds : .15;
    const progress = Math.min(1, Math.max(0,
      (time - beat.resolvedAt - wait) / FRIEND_VISIT.exitSeconds));
    return { visible: progress < 1, arriving: false, leaving: true, progress };
  }
  return { visible: false, arriving: false, progress: 0 };
}
