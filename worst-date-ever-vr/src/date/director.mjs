import { candyById, candyChoiceId, candyMoment, candyReply } from '../candies.mjs';
import { advanceDatePhase, applyApprovedDelta, createDateSession } from './session-core.mjs';
import { DEFAULT_EVENT_CONFIG, evaluateEventOpportunity, nextEventCheck, resolveEvent, seededRandom } from './event-core.mjs';
import { eventFeedback } from './event-feedback.mjs';
import { qteConfig, qteWorldDelta, qteWorldSpeed } from './qte.mjs';
import { FRIEND_VISIT } from './event-visitor.mjs';
import { actionById, physicalLine, physicalSocialResult, physicalSummary } from './physical-interactions.mjs';
import menuCatalog from '../../content/shared/menu-items.json' with { type: 'json' };

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

const GOOD_ENDINGS = [
  'Vocês ficaram juntos pelo resto da vida. Ainda discutem sobre quem pediu a sobremesa.',
  'Vocês namoraram por dez anos, até ela descobrir que você conversava com o jardineiro. O jardineiro era você.',
  'Dois anos juntos. O término veio quando ela descobriu seu vício em vídeos de unha do pé.',
  'Vocês se casaram numa terça-feira porque era o único dia livre no salão.',
  'Duraram para sempre. “Para sempre” foram 47 anos e uma reforma de cozinha.',
  'Ela disse sim. Você também. O padre perguntou de novo porque vocês estavam distraídos olhando o cardápio.',
  'Vocês abriram uma pousada romântica. Os hóspedes reclamavam mais do café que do romance.',
  'O amor venceu. O grupo da família dela levou mais seis meses para aprovar você.',
  'Ficaram juntos até os 90. A última briga foi sobre a senha do streaming.',
  'Vocês adotaram um cachorro que gostava mais do entregador. Mesmo assim, deu certo.',
  'Ela te amou por toda a vida. E implicou com sua playlist por quase toda ela.',
  'Um encontro perfeito, um pedido de casamento e uma sogra que ainda chama você pelo nome do ex.'
];
const BAD_ENDINGS = [
  'Vocês terminaram antes da sobremesa. O garçom perguntou se queria embalar o romance.',
  'Ela foi embora e virou crítica gastronômica. Deu uma estrela para o encontro e duas para o pão.',
  'Duraram onze dias. No décimo segundo, ela viu seu histórico de buscas por “como parecer normal”.',
  'O namoro acabou quando você chamou a mãe dela de “senhora do Uber”. Ela era a mãe dela.',
  'Ela terminou por mensagem. Você respondeu “quem é?”. Era o contato salvo como Date.',
  'Vocês ficaram juntos seis meses, até ela conhecer seu podcast sobre pombos de estacionamento.',
  'Foi um desastre tão grande que o restaurante ofereceu terapia ao garçom.',
  'Ela casou com outra pessoa. Você ainda tem o guardanapo com o número do pedido.',
  'O romance acabou quando você disse “eu também” para “eu te amo”. Ela tinha dito “eu te odeio”.',
  'Vocês tentaram de novo. O segundo encontro foi pior e entrou para o livro dos recordes local.',
  'Ela bloqueou você em tudo, inclusive no aplicativo de fidelidade do restaurante.',
  'O encontro terminou cedo. A sobremesa ficou e foi a relação mais duradoura da noite.'
];

function dateEndingLine(seed, outcome) {
  const pool = outcome === 'good' ? GOOD_ENDINGS : BAD_ENDINGS;
  let value = (seed ^ 0x45d9f3b) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  return pool[value % pool.length];
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
  let departureAt = null;
  let finalFeedback = '';
  let talkTurns = 0;
  let memorable = null;
  let candyConversation = false;
  let boundaryStreak = 0;
  let lastIntent = 'smalltalk';
  let lastEmotion = 'neutral';
  let reaction;
  let speechRef;
  let revision = 0;
  let qteRemaining = 0;
  let qteRecovery = 0;
  let lastQteReacted = null;
  let worldDelta = 0;
  const actions = [];
  const orders = [];
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
      departureAt = Number.isFinite(checkpoint.departureAt) ? checkpoint.departureAt :
        result === 'disaster' && saved.phase === 'ending' ? time + .7 : null;
      finalFeedback = typeof checkpoint.finalFeedback === 'string' ? checkpoint.finalFeedback.slice(0, 180) : '';
      caption = typeof checkpoint.caption === 'string' ? checkpoint.caption.slice(0,500) : caption;
      gesture = persona.allowedGestures.includes(checkpoint.gesture) ? checkpoint.gesture : gesture;
      talkTurns = checkpoint.talkTurns;
      boundaryStreak = Number.isInteger(checkpoint.boundaryStreak) ? Math.max(0, Math.min(3, checkpoint.boundaryStreak)) : 0;
      lastIntent = typeof checkpoint.lastIntent === 'string' ? checkpoint.lastIntent : lastIntent;
      lastEmotion = typeof checkpoint.lastEmotion === 'string' ? checkpoint.lastEmotion : lastEmotion;
      summary = typeof checkpoint.summary === 'string' ? checkpoint.summary.slice(0,500) : '';
      actions.push(...checkpoint.actions);
      memorable = typeof checkpoint.memorable === 'string' ? checkpoint.memorable.slice(0, 160) : null;
      candyConversation = Boolean(checkpoint.candyConversation);
      if (Array.isArray(checkpoint.orders)) orders.push(...checkpoint.orders.filter(order =>
        menuCatalog.venues[session.venueId]?.some(item => item.id === order.id)).slice(-8));
      if (event) beat = { definition: event, presentation: presentationFor(event.id),
        phase: checkpoint.beatPhase, at: checkpoint.beatAt, resolvedAt: checkpoint.resolvedAt,
        choiceId: checkpoint.beatChoiceId,
        closesAt: checkpoint.closesAt ?? checkpoint.beatAt + 25,
        cooldownUntil: checkpoint.cooldownUntil ?? checkpoint.resolvedAt + EVENT_RESOLUTION_HOLD + 2 };
      qteRemaining = beat?.phase === 'qte' ? Math.max(0, Math.min(qteConfig(event?.id)?.duration ?? 0,
        Number.isFinite(checkpoint.qteRemaining) ? checkpoint.qteRemaining : 0)) : 0;
      qteRecovery = Number.isFinite(checkpoint.qteRecovery) ?
        Math.max(0, Math.min(qteConfig(event?.id)?.recovery ?? 0, checkpoint.qteRecovery)) : 0;
      lastQteReacted = typeof checkpoint.lastQteReacted === 'string' ? checkpoint.lastQteReacted : null;
    }
  }

  function leaveDate(line, delay = 1.4, preserveSpeech = false) {
    result = 'disaster';
    caption = line;
    finalFeedback = line.trim().slice(0, 180) || 'O encontro terminou antes da hora.';
    if (!preserveSpeech) speechRef = null;
    gesture = 'look_away';
    beat = undefined;
    session = advanceDatePhase({ ...session, activeEventId: null }, 'DATE_FINISHES');
    departureAt = time + delay;
    endingAt = departureAt + 5.2;
  }

  function finishDate(outcome) {
    result = outcome;
    finalFeedback = outcome === 'awkward' ? dialogue.outcomes.find(ending => ending.id === outcome).line : dateEndingLine(seed, outcome);
    caption = outcome === 'good' ? 'Vocês deram certo!' : 'O encontro acabou.';
    if (memorable) {
      caption += ' Ainda vou lembrar ' + memorable + '.';
      finalFeedback = (finalFeedback + ' Ainda vou lembrar ' + memorable + '.').slice(0, 180);
    }
    speechRef = null;
    gesture = outcome === 'good' ? 'laugh' : 'look_away';
    beat = undefined;
    session = advanceDatePhase({ ...session, activeEventId: null }, 'DATE_FINISHES');
    departureAt = time + (outcome === 'good' ? 4.2 : 1.25);
    endingAt = departureAt + 5.2;
  }

  function tick(seconds, allowBeat = true) {
    if (beat?.phase === 'qte') {
      const activeSeconds = Math.min(seconds, qteRemaining);
      worldDelta = qteWorldDelta(beat, 0, activeSeconds);
      time += worldDelta;
      qteRemaining = Math.max(0, qteRemaining - activeSeconds);
      if (qteRemaining === 0) choose('ignore');
      const remainingSeconds = seconds - activeSeconds;
      if (remainingSeconds > 0) {
        const recoveryDelta = qteWorldDelta(beat, qteRecovery, remainingSeconds);
        worldDelta += recoveryDelta;
        time += recoveryDelta;
        qteRecovery = Math.max(0, qteRecovery - remainingSeconds);
      }
    } else {
      worldDelta = qteWorldDelta(beat, qteRecovery, seconds);
      time += worldDelta;
      qteRecovery = Math.max(0, qteRecovery - seconds);
    }
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
    if (beat?.phase === 'animate' && time >= beat.at +
      (beat.definition.id === 'awkward_friend' ? FRIEND_VISIT.decisionSeconds : 3.2)) {
      beat.phase = 'choice_window';
      // Brief reaction window: the date continues, but the player must choose
      // how to react (including the authored ignore/no-action consequence).
      beat.closesAt = time + (beat.definition.category === 'major' ? 18 : 15);
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
    const qte = qteConfig(definition.id);
    beat = { definition, presentation, phase: qte ? 'qte' : 'announce', at: time };
    qteRemaining = qte?.duration ?? 0;
    qteRecovery = 0;
    session = { ...session, activeEventId: definition.id };
    speechRef = null;
    gesture = 'look_away';
    if (definition.id === 'awkward_friend' && presentation?.line) caption = presentation.line;
  }

  function choose(id) {
    if (session.phase !== 'dialogue') return false;
    if (id === 'middle_finger') return react(id);
    if (beat && ['qte', 'animate', 'choice_window'].includes(beat.phase) &&
      (beat.definition.id !== 'awkward_friend' || beat.phase === 'choice_window') &&
      beat.definition.choices.some(choice => choice.id === id)) {
      const resolved = resolveEvent(session, beat.definition, id);
      session = resolved.session;
      summary = resolved.contextSummary;
      const response = eventFeedback(beat.definition.id, id, persona.id);
      if (response) {
        caption = response.line;
        gesture = response.gesture;
      }
      if (actions.length < 64) actions.push({ eventId: beat.definition.id, choiceId: id });
      beat.phase = 'resolve';
      beat.choiceId = id;
      beat.resolvedAt = time;
      beat.cooldownUntil = time + EVENT_RESOLUTION_HOLD + 2;
      if (qteConfig(beat.definition.id)) {
        qteRemaining = 0;
        qteRecovery = qteConfig(beat.definition.id).recovery;
      }
      lastEventAt = time;
      nextBeat = Math.max(nextBeat, time + beat.definition.cooldownSeconds);
      suggestedEventId = undefined;
      speechRef = null;
      return true;
    }
    if (beat && beat.phase !== 'cooldown') return false;
    if (id === 'finish' && time >= conversationReadyAt && talkTurns >= 3 && session.completedEventIds.length) {
      finishDate(dateOutcome(session.relationship));
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
    if (session.relationship.interest <= 0 || session.relationship.awkwardness >= 100 ||
      session.relationship.patience <= 0 || session.relationship.safety <= 0) {
      leaveDate('Acho melhor encerrar por aqui. Este encontro chegou ao limite.', 1.25);
      return true;
    }
    boundaryStreak = 0;
    lastIntent = 'smalltalk';
    lastEmotion = 'neutral';
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
      leaveDate('Chega. Eu vou embora.', 1.15);
    }
    return true;
  }

  function physical(actionId, mechanical) {
    if (session.phase !== 'dialogue' || beat && !['cooldown'].includes(beat.phase) ||
      !actionById(actionId) || !['complete', 'success', 'partial', 'failure'].includes(mechanical) ||
      actions.length >= 64) return null;
    const repeats = actions.filter(item => item.eventId === 'physical' && item.choiceId.startsWith(actionId + ':')).length;
    const social = physicalSocialResult(persona.id, actionId, mechanical, session.relationship, repeats);
    session = applyApprovedDelta(session, social.delta);
    actions.push({ eventId: 'physical', choiceId: actionId + ':' + mechanical + ':' + social.response });
    caption = physicalLine(persona.id, actionId, social.outcome, repeats);
    speechRef = null;
    summary = physicalSummary(actionId, mechanical, social.response, repeats, persona.id);
    gesture = social.response === 'enthusiastic' ? 'laugh' : social.response === 'refuse' ? 'look_away' :
      social.response === 'awkward' ? 'shrug' : 'nod';
    lastEmotion = social.response === 'enthusiastic' ? 'warm' : social.response === 'refuse' ? 'annoyed' :
      social.response === 'awkward' ? 'awkward' : 'neutral';
    revision++;
    nextInitiativeAt = time + 25;
    return { actionId, mechanical, ...social, repeats, summary };
  }

  function acceptOrder(turn, itemId, reference) {
    if (session.phase !== 'dialogue' || turn !== session.turnSequence ||
        orders.some(order => (order.reference ?? order.turn) === (reference ?? turn)))
      return false;
    if (!menuCatalog.venues[session.venueId]?.some(item => item.id === itemId)) return false;
    orders.push({ id: itemId, turn, reference, at: time });
    revision++;
    return true;
  }

  function remote(turn, reply, playerSaid) {
    if (session.phase !== 'dialogue' ||
      turn !== session.turnSequence || typeof reply?.text !== 'string' ||
      time < conversationReadyAt || !persona.allowedGestures.includes(reply.gesture)) return false;
    const line = reply.text.trim().slice(0, 500);
    if (!line) return false;
    if (reply.intent === 'order_food') acceptOrder(turn, reply.orderItemId,
      reply.sessionId && `${reply.sessionId}:${reply.turnId}`);
    if (reply.eventActionId && beat && ['qte', 'choice_window'].includes(beat.phase) &&
      beat.definition.choices.some(choice => choice.id === reply.eventActionId)) {
      const resolved = resolveEvent(session, beat.definition, reply.eventActionId);
      session = resolved.session;
      summary = resolved.contextSummary;
      if (actions.length < 64) actions.push({ eventId: beat.definition.id, choiceId: reply.eventActionId });
      beat.phase = 'resolve';
      beat.choiceId = reply.eventActionId;
      beat.resolvedAt = time;
      beat.cooldownUntil = time + EVENT_RESOLUTION_HOLD + 2;
      if (qteConfig(beat.definition.id)) {
        qteRemaining = 0;
        qteRecovery = qteConfig(beat.definition.id).recovery;
      }
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
    if (session.relationship.interest <= 0 || session.relationship.awkwardness >= 100 ||
      session.relationship.patience <= 0 || session.relationship.safety <= 0) {
      leaveDate('Eu perdi a vontade de continuar este encontro. Vou embora.', 1.35);
      return true;
    }
    if (session.relationship.interest >= 100) {
      finishDate('good');
      return true;
    }
    lastIntent = reply.intent ?? 'smalltalk';
    lastEmotion = reply.emotion ?? 'neutral';
    boundaryStreak = lastIntent === 'boundary' ? boundaryStreak + 1 : 0;
    if (lastIntent === 'end_date' || boundaryStreak >= 3 ||
      session.relationship.safety <= 40 || session.relationship.patience <= 25) {
      const farewell = lastIntent === 'end_date' ? line : 'Eu já pedi respeito. Vou embora.';
      leaveDate(farewell, Math.min(4.5, Math.max(1.5, farewell.length / 18)),
        lastIntent === 'end_date');
      return true;
    }
    conversationReadyAt = time + RESPONSE_HOLD;
    nextInitiativeAt = conversationReadyAt + 18 + eventRand() * 14;
    if (typeof reply.suggestedEventId === 'string') suggestedEventId = reply.suggestedEventId;
    return true;
  }

  function view() {
    let choices = [];
    let fallbackChoices = [];
    if (session.phase === 'dialogue') {
      if (beat && ['qte', 'animate', 'choice_window'].includes(beat.phase) &&
        (beat.definition.id !== 'awkward_friend' || beat.phase === 'choice_window'))
        choices = beat.definition.choices;
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
    const qteReactionKey = beat?.phase === 'resolve' && qteConfig(beat.definition.id) ?
      [beat.definition.id, beat.at, beat.resolvedAt].join(':') : null;
    return { session, time, worldDelta, timeScale: qteWorldSpeed(beat, qteRecovery),
      qte: beat?.phase === 'qte' ? { remaining: qteRemaining, duration: qteConfig(beat.definition.id).duration } : null,
      beat, caption, gesture, result, departureAt, finalFeedback,
      orders: orders.slice(),
      intent: lastIntent, emotion: lastEmotion,
      summary, memorable, choices, actions: actions.slice(),
      fallbackChoices,
      canSpeak: session.phase === 'dialogue' && beat?.phase !== 'qte' && time >= conversationReadyAt,
      reflecting: session.phase === 'dialogue' && time < conversationReadyAt,
      wantsInitiative: session.phase === 'dialogue' && !beat && time >= conversationReadyAt && time >= nextInitiativeAt,
      reaction, revision, speechRef, qteReactionPending: Boolean(qteReactionKey && qteReactionKey !== lastQteReacted) };
  }

  function markQteReacted() {
    if (beat?.phase !== 'resolve' || !qteConfig(beat.definition.id)) return false;
    lastQteReacted = [beat.definition.id, beat.at, beat.resolvedAt].join(':');
    revision++;
    return true;
  }

  function deferInitiative(seconds = 8) { nextInitiativeAt = Math.max(nextInitiativeAt, time + seconds); }

  function snapshot() {
    return { session, time, nextBeat, lastEventAt, suggestedEventId, eventRolls, conversationReadyAt, nextInitiativeAt,
      endingAt, departureAt, finalFeedback, result, caption, gesture, talkTurns,
      boundaryStreak, lastIntent, lastEmotion,
      summary, memorable, candyConversation, actions: actions.slice(), orders: orders.slice(),
      beatId: beat?.definition.id, beatPhase: beat?.phase, beatAt: beat?.at, beatChoiceId: beat?.choiceId,
      qteRemaining, qteRecovery, lastQteReacted, resolvedAt: beat?.resolvedAt,
      closesAt: beat?.closesAt, cooldownUntil: beat?.cooldownUntil };
  }

  return { tick, choose, react, physical, remote, acceptOrder, view, snapshot, deferInitiative, markQteReacted };
}
