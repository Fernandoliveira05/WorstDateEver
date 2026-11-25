// Reference deterministic scheduler and event resolution. No physics or LLM code here.
// An actual director owns visual scheduling, animation/event queues and spatial safety.
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525,s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const DEFAULT_EVENT_CONFIG = Object.freeze({
  firstEventMinSeconds: 60,
  firstEventMaxSeconds: 90,
  minimumGapSeconds: 90,
  maximumGapSeconds: 150,
  checkMinSeconds: 12,
  checkMaxSeconds: 24,
  opportunityChance: .34,
  maximumEvents: 4
});

export function eligibleEvents({ catalog, venueId, personaId, completed = [], time = 0,
  talkTurns = 0, relationship = {}, recentActions = [] }) {
  return catalog.filter(event => {
    if (!event.venueIds.includes(venueId) || completed.includes(event.id)) return false;
    if (event.personaIds?.length && !event.personaIds.includes(personaId)) return false;
    if (time < (event.minElapsedSeconds ?? 0) || talkTurns < (event.minConversationTurns ?? 0)) return false;
    const condition = event.relationshipCondition;
    if (condition && Object.entries(condition).some(([key, range]) =>
      relationship[key] == null || relationship[key] < (range.min ?? 0) || relationship[key] > (range.max ?? 100))) return false;
    if (event.blockedAfterActions?.some(id => recentActions.slice(-4).some(action => action.choiceId === id))) return false;
    return true;
  });
}

export function evaluateEventOpportunity({ catalog, venueId, personaId, completed = [], phase = 'dialogue',
  time = 0, talkTurns = 0, relationship = {}, recentActions = [], lastEventAt = -Infinity,
  suggestedEventId, rand, config = DEFAULT_EVENT_CONFIG }) {
  if (phase !== 'dialogue' || completed.length >= config.maximumEvents ||
    time - lastEventAt < config.minimumGapSeconds) return null;
  const candidates = eligibleEvents({ catalog, venueId, personaId, completed, time, talkTurns, relationship, recentActions });
  if (!candidates.length || rand() > config.opportunityChance) return null;
  const weighted = candidates.map(event => ({ event,
    weight: event.weight * (event.id === suggestedEventId ? 2.75 : 1) }));
  let sample = rand() * weighted.reduce((sum, item) => sum + item.weight, 0);
  for (const item of weighted) {
    sample -= item.weight;
    if (sample < 0) return item.event;
  }
  return weighted.at(-1).event;
}

export function nextEventCheck(rand, config = DEFAULT_EVENT_CONFIG, first = false) {
  const min = first ? config.firstEventMinSeconds : config.checkMinSeconds;
  const max = first ? config.firstEventMaxSeconds : config.checkMaxSeconds;
  return min + rand() * Math.max(0, max - min);
}

export function chooseEligibleEvent({catalog, venueId, completed = [], phase = 'dialogue', majorActive = false, rand}) {
  if (phase !== 'dialogue' || majorActive) return null;
  const candidates = catalog.filter(e => e.venueIds.includes(venueId) && !completed.includes(e.id));
  if (!candidates.length) return null;
  const total = candidates.reduce((sum,e) => sum + e.weight,0);
  let sample = rand() * total;
  for (const candidate of candidates) {
    sample -= candidate.weight;
    if (sample < 0) return candidate;
  }
  return candidates.at(-1);
}

export function resolveEvent(session, definition, choiceId) {
  if (session.phase !== 'dialogue') throw new Error('Events require seated dialogue phase');
  if (session.completedEventIds.includes(definition.id)) throw new Error('Event already completed');
  if (!definition.venueIds.includes(session.venueId)) throw new Error('Invalid venue');
  const choice = definition.choices.find(c => c.id === choiceId);
  if (!choice) throw new Error('Not an approved event choice');
  const relationship = {...session.relationship};
  for (const [key, raw] of Object.entries(choice.relationshipDelta)) {
    if (!(key in relationship) || !Number.isInteger(raw) || raw < -10 || raw > 10) throw new Error('Invalid event delta');
    relationship[key] = Math.max(0, Math.min(100, relationship[key] + raw));
  }
  return {
    session:{...session, relationship, completedEventIds:[...session.completedEventIds,definition.id],activeEventId:null},
    contextSummary:definition.summaryTemplate.replace('{choice}', choice.contextSummary ?? choiceId)
  };
}
