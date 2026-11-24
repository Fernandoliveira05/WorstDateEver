import { advanceDatePhase, applyApprovedDelta, createDateSession } from './session-core.mjs';
import { chooseEligibleEvent, resolveEvent, seededRandom } from './event-core.mjs';

const dimensions = ['interest', 'awkwardness', 'patience', 'safety'];
const arrival = [
  [1, 'DATE_ENTERS'], [5, 'DATE_REACHES_TABLE'], [6.5, 'DATE_STARTS_SITTING'], [7.4, 'DATE_SEATED']
];

export function dateOutcome({ interest, awkwardness, patience, safety }) {
  if (interest <= 38 || awkwardness >= 48 || patience < 40 || safety < 60) return 'disaster';
  if (interest >= 63 && awkwardness <= 26) return 'good';
  return 'awkward';
}

export function createDateDirector(handoff, { sessionId, seed, catalog, persona, dialogue, reactions = [], checkpoint }) {
  let session = createDateSession(handoff, sessionId, seed);
  const rand = seededRandom(seed);
  const lines = dialogue.lines.find(line => line.id === persona.id);
  let time = 0;
  let nextBeat = 10;
  let arrivalCursor = 0;
  let beat;
  let result;
  let caption = 'Seu encontro já vem.';
  let gesture = 'none';
  let summary = '';
  let endingAt = 0;
  let talkTurns = 0;
  let reaction;
  let speechRef;
  let revision = 0;
  const actions = [];
  if (checkpoint) {
    const saved = checkpoint.session;
    const event = catalog.find(definition => definition.id === checkpoint.beatId);
    const validPhase = ['waiting','arriving','greeting','seating','dialogue','ending','completed'].includes(saved?.phase);
    if (validPhase && saved.matchId === session.matchId && saved.venueId === session.venueId &&
      saved.schemaVersion === 1 && saved.eventSeed === seed &&
      Number.isFinite(checkpoint.time) && checkpoint.time >= 0 && checkpoint.time < 86400 &&
      Array.isArray(saved.completedEventIds) && saved.completedEventIds.length <= catalog.length &&
      saved.completedEventIds.every(id => catalog.some(definition => definition.id === id)) &&
      Number.isInteger(saved.turnSequence) && saved.turnSequence >= 0 &&
      dimensions.every(key => Number.isInteger(saved.relationship?.[key]) && saved.relationship[key] >= 0 && saved.relationship[key] <= 100) &&
      Array.isArray(checkpoint.actions) && checkpoint.actions.length <= 64 &&
      Number.isInteger(checkpoint.talkTurns) && checkpoint.talkTurns >= 0) {
      session = saved;
      time = checkpoint.time;
      arrivalCursor = arrival.filter(([at]) => at <= time).length;
      nextBeat = Number.isFinite(checkpoint.nextBeat) ? checkpoint.nextBeat : time;
      endingAt = Number.isFinite(checkpoint.endingAt) ? checkpoint.endingAt : time;
      result = checkpoint.result;
      caption = typeof checkpoint.caption === 'string' ? checkpoint.caption.slice(0,500) : caption;
      gesture = persona.allowedGestures.includes(checkpoint.gesture) ? checkpoint.gesture : gesture;
      talkTurns = checkpoint.talkTurns;
      summary = typeof checkpoint.summary === 'string' ? checkpoint.summary.slice(0,500) : '';
      actions.push(...checkpoint.actions);
      if (event) beat = { definition: event, presentation: dialogue.beats.find(item => item.id === event.id),
        phase: checkpoint.beatPhase, at: checkpoint.beatAt, resolvedAt: checkpoint.resolvedAt,
        closesAt: checkpoint.closesAt ?? checkpoint.beatAt + 18 };
      // Completed events account for their original scheduler draws. An active event has consumed one more.
      for (let i = 0; i < saved.completedEventIds.length + Number(Boolean(saved.activeEventId)); i++) rand();
    }
  }

  function tick(seconds, allowBeat = true) {
    time += seconds;
    while (arrivalCursor < arrival.length && time >= arrival[arrivalCursor][0]) {
      session = advanceDatePhase(session, arrival[arrivalCursor++][1]);
      if (session.phase === 'greeting') {
        speechRef = null;
        caption = persona.openingLine;
        gesture = 'wave';
      }
    }
    if (session.phase === 'ending' && time >= endingAt) session = advanceDatePhase(session, 'END_COMPLETE');
    if (session.phase !== 'dialogue') return;

    if (beat?.phase === 'announce' && time >= beat.at + .6) beat.phase = 'animate';
    if (beat?.phase === 'animate' && time >= beat.at + 1.45) {
      beat.phase = 'choice_window';
      beat.closesAt = time + (beat.definition.category === 'major' ? 19 : 13);
    }
    if (beat?.phase === 'choice_window') {
      if (!allowBeat) beat.closesAt += seconds;
      if (time >= beat.closesAt) choose(beat.definition.choices.find(choice => choice.id === 'ignore')?.id ??
        beat.definition.choices.at(-1).id);
    }
    if (beat?.phase === 'resolve' && time >= beat.resolvedAt + 1.4) beat.phase = 'cooldown';
    if (beat?.phase === 'cooldown' && time >= nextBeat) beat = undefined;
    if (beat || time < nextBeat || !allowBeat) return;
    const definition = chooseEligibleEvent({ catalog, venueId: session.venueId,
      completed: session.completedEventIds, phase: session.phase, rand });
    if (!definition) { nextBeat = 86400; return; }
    const presentation = dialogue.beats.find(entry => entry.id === definition.id);
    beat = { definition, presentation, phase: 'announce', at: time };
    session = { ...session, activeEventId: definition.id };
    speechRef = null;
    caption = presentation.line;
    gesture = 'look_away';
  }

  function choose(id) {
    if (session.phase !== 'dialogue') return false;
    if (id === 'middle_finger') return react(id);
    if (beat?.phase === 'choice_window') {
      if (!beat.definition.choices.some(choice => choice.id === id)) return false;
      const resolved = resolveEvent(session, beat.definition, id);
      session = resolved.session;
      summary = resolved.contextSummary;
      if (actions.length < 64) actions.push({ eventId: beat.definition.id, choiceId: id });
      beat.phase = 'resolve';
      beat.resolvedAt = time;
      nextBeat = time + beat.definition.cooldownSeconds;
      speechRef = null;
      caption = beat.presentation.cue;
      gesture = 'shrug';
      return true;
    }
    if (beat && beat.phase !== 'cooldown') return false;
    if (id === 'finish' && talkTurns >= 3 && session.completedEventIds.length) {
      result = dateOutcome(session.relationship);
      speechRef = null;
      caption = dialogue.outcomes.find(outcome => outcome.id === result).line;
      session = advanceDatePhase(session, 'DATE_FINISHES');
      endingAt = time + 1.2;
      return true;
    }
    const choice = dialogue.choices.find(choice => choice.id === id);
    if (!choice) return false;
    const delta = Object.fromEntries(dimensions.map((key, i) => [key, choice.delta[i]]));
    session = { ...applyApprovedDelta(session, delta), turnSequence: session.turnSequence + 1 };
    talkTurns++;
    if (actions.length < 64) actions.push({ eventId: '', choiceId: id });
    speechRef = null;
    caption = lines[id];
    gesture = choice.gesture;
    return true;
  }

  function react(id, speed = 0, direction = 0) {
    if (session.phase !== 'dialogue' || reaction && time - reaction.at < .65) return false;
    const item = reactions.find(entry => entry.id === id);
    if (!item) return false;
    const delta = Object.fromEntries(dimensions.map((key, index) => [key, item.delta[index]]));
    session = applyApprovedDelta(session, delta);
    if (actions.length < 64) actions.push({ eventId: '', choiceId: id });
    reaction = { id, speed, direction, at: time };
    revision++;
    speechRef = null;
    caption = item.line;
    gesture = item.gesture;
    summary = item.context;
    if (session.relationship.safety <= 40) {
      result = 'disaster';
      caption = 'Chega. Eu vou embora.';
      session = advanceDatePhase(session, 'DATE_FINISHES');
      endingAt = time + 2.5;
    }
    return true;
  }

  function remote(turn, reply) {
    if (session.phase !== 'dialogue' ||
      turn !== session.turnSequence || typeof reply?.text !== 'string' ||
      !persona.allowedGestures.includes(reply.gesture)) return false;
    const line = reply.text.trim().slice(0, 500);
    if (!line) return false;
    caption = line;
    speechRef = reply.ttsRef ?? null;
    gesture = reply.gesture;
    session = { ...session, turnSequence: turn + 1 };
    talkTurns++;
    return true;
  }

  function view() {
    let choices = [];
    if (session.phase === 'dialogue') {
      if (beat?.phase === 'choice_window') choices = beat.definition.choices;
      else if (!beat || beat.phase === 'cooldown') {
        choices = dialogue.choices;
        if (talkTurns >= 3 && session.completedEventIds.length)
          choices = [...choices, { id: 'finish', label: 'Encerrar o encontro' }];
      }
    }
    if (session.phase === 'dialogue' && reactions.some(item => item.id === 'middle_finger'))
      choices = [...choices, reactions.find(item => item.id === 'middle_finger')];
    return { session, time, beat, caption, gesture, result, summary, choices, actions: actions.slice(),
      canSpeak: session.phase === 'dialogue', reaction, revision, speechRef };
  }

  function snapshot() {
    return { session, time, nextBeat, endingAt, result, caption, gesture, talkTurns, summary, actions: actions.slice(),
      beatId: beat?.definition.id, beatPhase: beat?.phase, beatAt: beat?.at, resolvedAt: beat?.resolvedAt, closesAt: beat?.closesAt };
  }

  return { tick, choose, react, remote, view, snapshot };
}
