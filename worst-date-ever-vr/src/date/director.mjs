import { candyById, candyChoiceId, candyMoment, candyReply } from '../candies.mjs';
import { advanceDatePhase, applyApprovedDelta, createDateSession } from './session-core.mjs';
import { DEFAULT_EVENT_CONFIG, evaluateEventOpportunity, nextEventCheck, resolveEvent, seededRandom } from './event-core.mjs';

const dimensions = ['interest', 'awkwardness', 'patience', 'safety'];
const RESPONSE_HOLD = 5.5;
const EVENT_RESOLUTION_HOLD = 2.5;
const arrival = [
  [1, 'DATE_ENTERS'], [5, 'DATE_REACHES_TABLE'], [6.5, 'DATE_STARTS_SITTING'], [7.4, 'DATE_SEATED']
];

export function dateOutcome({ interest, awkwardness, patience, safety }) {
  if (interest <= 38 || awkwardness >= 48 || patience < 40 || safety < 60) return 'disaster';
  if (interest >= 63 && awkwardness <= 26) return 'good';
  return 'awkward';
}

export function createDateDirector(handoff, { sessionId, seed, catalog, persona, dialogue, reactions = [], checkpoint,
  eventConfig: eventOverrides = {} }) {
  let session = createDateSession(handoff, sessionId, seed);
  const eventRandomSource = seededRandom(seed ^ 0x6d2b79f5);
  let eventRolls = 0;
  const eventRand = () => { eventRolls++; return eventRandomSource(); };
  const eventConfig = { ...DEFAULT_EVENT_CONFIG, ...eventOverrides };
  const conversation = dialogue.conversations?.find(item => item.id === persona.id);
  const presentationFor = id => dialogue.beats.find(item => item.id === id && item.personaId === persona.id) ??
    dialogue.beats.find(item => item.id === id && !item.personaId);
  let time = 0;
  let nextBeat = nextEventCheck(eventRand, eventConfig, true);
  let lastEventAt = -Infinity;
  let suggestedEventId;
  let conversationReadyAt = 0;
  let nextInitiativeAt = 22;
  let arrivalCursor = 0;
  let beat;
  let result;
  let caption = 'Seu encontro já vem.';
  let gesture = 'none';
  let summary = '';
  let endingAt = 0;
  let talkTurns = 0;
  let memorable = null;
  let candyConversation = false;
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
      (saved.candy ?? null) === (session.candy ?? null) &&
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
      lastEventAt = Number.isFinite(checkpoint.lastEventAt) ? checkpoint.lastEventAt : -Infinity;
      suggestedEventId = typeof checkpoint.suggestedEventId === 'string' ? checkpoint.suggestedEventId : undefined;
      while (eventRolls < (Number.isInteger(checkpoint.eventRolls) ? checkpoint.eventRolls : 1)) eventRand();
      conversationReadyAt = Number.isFinite(checkpoint.conversationReadyAt) ? checkpoint.conversationReadyAt : time;
      nextInitiativeAt = Number.isFinite(checkpoint.nextInitiativeAt) ? checkpoint.nextInitiativeAt : time + 20;
      endingAt = Number.isFinite(checkpoint.endingAt) ? checkpoint.endingAt : time;
      result = checkpoint.result;
      caption = typeof checkpoint.caption === 'string' ? checkpoint.caption.slice(0,500) : caption;
      gesture = persona.allowedGestures.includes(checkpoint.gesture) ? checkpoint.gesture : gesture;
      talkTurns = checkpoint.talkTurns;
      summary = typeof checkpoint.summary === 'string' ? checkpoint.summary.slice(0,500) : '';
      actions.push(...checkpoint.actions);
      memorable = typeof checkpoint.memorable === 'string' ? checkpoint.memorable.slice(0, 160) : null;
      candyConversation = Boolean(checkpoint.candyConversation);
      if (event) beat = { definition: event, presentation: presentationFor(event.id),
        phase: checkpoint.beatPhase, at: checkpoint.beatAt, resolvedAt: checkpoint.resolvedAt,
        closesAt: checkpoint.closesAt ?? checkpoint.beatAt + 25,
        cooldownUntil: checkpoint.cooldownUntil ?? checkpoint.resolvedAt + EVENT_RESOLUTION_HOLD + 2 };
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

    if (beat?.phase === 'announce' && time >= beat.at + 1.2) beat.phase = 'animate';
    if (beat?.phase === 'animate' && time >= beat.at + 3.2) {
      beat.phase = 'choice_window';
      // Brief reaction window: the date continues, but the player must choose
      // how to react (including the authored ignore/no-action consequence).
      beat.closesAt = time + (beat.definition.category === 'major' ? 12 : 9);
    }
    if (beat?.phase === 'choice_window') {
      if (!allowBeat) beat.closesAt += seconds;
      else if (time >= beat.closesAt) {
        const noAction = beat.definition.choices.find(choice => choice.id === 'ignore') ??
          beat.definition.choices.find(choice => choice.id === 'continue') ?? beat.definition.choices.at(-1);
        choose(noAction.id);
      }
    }
    if (beat?.phase === 'resolve' && time >= beat.resolvedAt + EVENT_RESOLUTION_HOLD) beat.phase = 'cooldown';
    if (beat?.phase === 'cooldown' && time >= beat.cooldownUntil) beat = undefined;
    if (beat || time < nextBeat || talkTurns < 1 || time < conversationReadyAt || !allowBeat) return;
    nextBeat = time + nextEventCheck(eventRand, eventConfig);
    const definition = evaluateEventOpportunity({ catalog, venueId: session.venueId, personaId: session.matchId,
      completed: session.completedEventIds, phase: session.phase, time, talkTurns,
      relationship: session.relationship, recentActions: actions, lastEventAt, suggestedEventId,
      rand: eventRand, config: eventConfig });
    if (!definition) return;
    const presentation = presentationFor(definition.id);
    beat = { definition, presentation, phase: 'announce', at: time };
    session = { ...session, activeEventId: definition.id };
    speechRef = null;
    gesture = 'look_away';
  }

  function choose(id) {
    if (session.phase !== 'dialogue') return false;
    if (id === 'middle_finger') return react(id);
    if (beat?.phase === 'choice_window' && beat.definition.choices.some(choice => choice.id === id)) {
      const resolved = resolveEvent(session, beat.definition, id);
      session = resolved.session;
      summary = resolved.contextSummary;
      if (actions.length < 64) actions.push({ eventId: beat.definition.id, choiceId: id });
      beat.phase = 'resolve';
      beat.resolvedAt = time;
      beat.cooldownUntil = time + EVENT_RESOLUTION_HOLD + 2;
      lastEventAt = time;
      nextBeat = Math.max(nextBeat, time + beat.definition.cooldownSeconds);
      suggestedEventId = undefined;
      speechRef = null;
      return true;
    }
    if (beat && beat.phase !== 'cooldown') return false;
    if (id === 'finish' && time >= conversationReadyAt && talkTurns >= 3 && session.completedEventIds.length) {
      result = dateOutcome(session.relationship);
      speechRef = null;
      caption = dialogue.outcomes.find(outcome => outcome.id === result).line;
      if (memorable) caption += ' Ainda vou lembrar ' + memorable + '.';
      gesture = memorable && persona.allowedGestures.includes('nod') ? 'nod' : gesture;
      session = advanceDatePhase(session, 'DATE_FINISHES');
      endingAt = time + 4.5;
      return true;
    }
    if (time < conversationReadyAt) return false;
    const extra = id === candyChoiceId && !candyConversation ? candyReply(session.candy, persona.id, session.relationship) : null;
    const choice = dialogue.choices.find(choice => choice.id === id);
    const turn = conversation?.turns[Math.min(talkTurns, conversation.turns.length - 1)];
    const option = turn?.options.find(item => item.id === id);
    if (!extra && (!choice || !option)) return false;
    const delta = extra?.delta ?? Object.fromEntries(dimensions.map((key, i) => [key, choice.delta[i]]));
    session = { ...applyApprovedDelta(session, delta), turnSequence: session.turnSequence + 1 };
    if (extra) {
      candyConversation = true;
      const name = candyById(session.candy).name;
      if (session.candy !== 'tamarindo' || extra.gesture === 'laugh')
        memorable = candyMoment(session.candy, candyById(session.candy).choice, extra.line) ?? ('um assunto que ' + name + ' trouxe à mesa');
    }
    talkTurns++;
    if (actions.length < 64) actions.push({ eventId: '', choiceId: id });
    speechRef = null;
    caption = extra?.line ?? option.reply;
    gesture = extra?.gesture ?? choice.gesture;
    conversationReadyAt = time + RESPONSE_HOLD;
    nextInitiativeAt = conversationReadyAt + 18 + eventRand() * 14;
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
    conversationReadyAt = time + RESPONSE_HOLD;
    nextInitiativeAt = conversationReadyAt + 18 + eventRand() * 14;
    if (session.relationship.safety <= 40) {
      result = 'disaster';
      caption = 'Chega. Eu vou embora.';
      session = advanceDatePhase(session, 'DATE_FINISHES');
      endingAt = time + 2.5;
    }
    return true;
  }

  function remote(turn, reply, playerSaid) {
    if (session.phase !== 'dialogue' ||
      turn !== session.turnSequence || typeof reply?.text !== 'string' ||
      time < conversationReadyAt || !persona.allowedGestures.includes(reply.gesture)) return false;
    const line = reply.text.trim().slice(0, 500);
    if (!line) return false;
    if (reply.eventActionId && beat?.phase === 'choice_window' &&
      beat.definition.choices.some(choice => choice.id === reply.eventActionId)) {
      const resolved = resolveEvent(session, beat.definition, reply.eventActionId);
      session = resolved.session;
      summary = resolved.contextSummary;
      if (actions.length < 64) actions.push({ eventId: beat.definition.id, choiceId: reply.eventActionId });
      beat.phase = 'resolve';
      beat.resolvedAt = time;
      beat.cooldownUntil = time + EVENT_RESOLUTION_HOLD + 2;
      lastEventAt = time;
      nextBeat = Math.max(nextBeat, time + beat.definition.cooldownSeconds);
    }
    if (reply.relationshipDelta) session = applyApprovedDelta(session, reply.relationshipDelta);
    memorable = candyMoment(session.candy, playerSaid, line) ?? memorable;
    caption = line;
    speechRef = reply.ttsRef ?? null;
    gesture = reply.gesture;
    session = { ...session, turnSequence: turn + 1 };
    talkTurns++;
    conversationReadyAt = time + RESPONSE_HOLD;
    nextInitiativeAt = conversationReadyAt + 18 + eventRand() * 14;
    if (typeof reply.suggestedEventId === 'string') suggestedEventId = reply.suggestedEventId;
    return true;
  }

  function view() {
    let choices = [];
    let fallbackChoices = [];
    if (session.phase === 'dialogue') {
      if (beat?.phase === 'choice_window') choices = beat.definition.choices;
      else if ((!beat || beat.phase === 'cooldown') && time >= conversationReadyAt) {
        const turn = conversation?.turns[Math.min(talkTurns, conversation.turns.length - 1)];
        if (talkTurns >= 3 && session.completedEventIds.length)
          choices = [{ id: 'finish', label: 'Pedir a conta' }];
        fallbackChoices = turn?.options.map(option => ({ ...option,
          gesture: dialogue.choices.find(choice => choice.id === option.id)?.gesture })) ?? dialogue.choices;
        const candy = candyById(session.candy);
        if (candy && !candyConversation) fallbackChoices = [...fallbackChoices, { id: candyChoiceId, label: candy.choice }];
      }
    }
    return { session, time, beat, caption, gesture, result, summary, memorable, choices, actions: actions.slice(),
      fallbackChoices,
      canSpeak: session.phase === 'dialogue' && time >= conversationReadyAt,
      reflecting: session.phase === 'dialogue' && time < conversationReadyAt,
      wantsInitiative: session.phase === 'dialogue' && !beat && time >= conversationReadyAt && time >= nextInitiativeAt,
      reaction, revision, speechRef };
  }

  function deferInitiative(seconds = 8) { nextInitiativeAt = Math.max(nextInitiativeAt, time + seconds); }

  function snapshot() {
    return { session, time, nextBeat, lastEventAt, suggestedEventId, eventRolls, conversationReadyAt, nextInitiativeAt,
      endingAt, result, caption, gesture, talkTurns, summary, memorable, candyConversation, actions: actions.slice(),
      beatId: beat?.definition.id, beatPhase: beat?.phase, beatAt: beat?.at, resolvedAt: beat?.resolvedAt,
      closesAt: beat?.closesAt, cooldownUntil: beat?.cooldownUntil };
  }

  return { tick, choose, react, remote, view, snapshot, deferInitiative };
}
