import { seededRandom } from './event-core.mjs';

const duties = [
  ['banheiro', 7, 16, 20],
  ['comida', 4, 12, 3],
  ['conversa', 5, 14, 4],
  ['espera', 12, 25, 18],
  ['pedidos', 3, 9, 16]
];

export function createNpcClocks(seed) {
  const clocks = duties.map(([need, min, max, work], index) => {
    const random = seededRandom(seed ^ Math.imul(index + 1, 2654435761));
    const interval = () => min + random() * (max - min);
    return { need, work, interval, start: 0, rest: index === 3 ? 0 : interval() };
  });
  return time => clocks.map(clock => {
    while (time >= clock.start + clock.rest + clock.work) {
      clock.start += clock.rest + clock.work;
      clock.rest = clock.interval();
    }
    const since = time - clock.start;
    const active = since >= clock.rest;
    const age = Math.max(0, since - clock.rest);
    return {
      need: clock.need, active, age,
      level: clock.rest === 0 ? 1 : active ? Math.max(0, 1 - age / clock.work) : since / clock.rest,
      remaining: active ? clock.work - age : clock.rest - since
    };
  });
}
