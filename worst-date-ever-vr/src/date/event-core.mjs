// Reference deterministic scheduler and event resolution. No physics or LLM code here.
// An actual director owns visual scheduling, animation/event queues and spatial safety.
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525,s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
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
