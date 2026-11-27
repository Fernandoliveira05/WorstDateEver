export const EVENT_PRESENTATION = Object.freeze({
  water_spill: { title: 'ÁGUA DERRAMADA', anchor: [-.34, 1.17, -.20], gesture: 'startle' },
  wrong_order: { title: 'PEDIDO ERRADO', anchor: [.23, 1.18, -.20], gesture: 'shrug' },
  loud_guest: { title: 'CLIENTE BARULHENTO', anchor: [-2.9, 1.95, -1.3], gesture: 'look_away' },
  bathroom_mishap: { title: 'PORTA EMPERRADA', anchor: [-5.08, 2.48, -6.12], gesture: 'look_away' },
  dropped_menu: { title: 'CARDÁPIO CAIU', anchor: [0, 1.13, .12], gesture: 'startle',
    arcDrop: .98, arcForward: .38 },
  awkward_friend: { title: 'VISITA INESPERADA', anchor: [1.18, 1.83, -2.7], gesture: 'look_away' }
});

export const EVENT_VISUAL_STYLE = Object.freeze({
  enterSeconds: .3, exitSeconds: .32, lift: .11,
  focusPulseSeconds: .55, pulseScale: 1.035,
  flashSeconds: .38, flashOpacity: .095,
  cueWidth: .72, cueHeight: .23
});

export function eventCueState(beat, time) {
  const style = EVENT_PRESENTATION[beat?.definition?.visual ?? beat?.definition?.id];
  if (!style || !['qte', 'announce', 'animate', 'choice_window', 'resolve'].includes(beat.phase)) return null;
  const elapsed = Math.max(0, time - beat.at);
  const remaining = beat.phase === 'choice_window' ? Math.max(0, Math.ceil(beat.closesAt - time)) : null;
  const exit = beat.phase === 'resolve' ? Math.max(0, 1 - (time - beat.resolvedAt) / EVENT_VISUAL_STYLE.exitSeconds) : 1;
  return { ...style, remaining, opacity: Math.min(1, elapsed / EVENT_VISUAL_STYLE.enterSeconds) * exit,
    lift: EVENT_VISUAL_STYLE.lift * (1 - Math.min(1, elapsed / EVENT_VISUAL_STYLE.enterSeconds)) };
}

export function eventArcPlacement(beat) {
  if (beat?.phase === 'qte') return { drop: 0, forward: 0 };
  if (!['qte', 'animate', 'choice_window'].includes(beat?.phase)) return { drop: 0, forward: 0 };
  const style = EVENT_PRESENTATION[beat.definition.visual ?? beat.definition.id];
  return { drop: style?.arcDrop ?? 0, forward: style?.arcForward ?? 0 };
}
