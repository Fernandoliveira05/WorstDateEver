function ease(time, from, to) {
  const t = Math.max(0, Math.min(1, (time - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

export function creatureMotion(age) {
  const end = .55;
  const retreat = ease(age, .22, end);
  const presence = ease(age, .03, .105) * (1 - retreat);
  return {
    presence,
    lean: .14 * ease(age, .035, .15) * (1 - retreat),
    turn: 0,
    breathing: Math.sin(age * 5.8) * presence,
    striking: age >= .085 && age < end,
    finished: age >= end
  };
}
