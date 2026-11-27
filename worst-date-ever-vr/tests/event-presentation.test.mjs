import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_PRESENTATION, eventCueState } from '../src/date/event-presentation.mjs';
import { readFileSync } from 'node:fs';

const events = JSON.parse(readFileSync(new URL('../content/shared/events.json', import.meta.url))).events;

test('every authored random event has a distinct, placed visual cue', () => {
  for (const event of events) {
    const presentation = EVENT_PRESENTATION[event.visual];
    assert.ok(presentation, event.id);
    assert.ok(presentation.title.length > 4);
    assert.equal(presentation.anchor.length, 3);
    assert.ok(presentation.anchor.every(Number.isFinite));
  }
  assert.equal(new Set(events.map(event => EVENT_PRESENTATION[event.visual].title)).size, events.length);
});

test('event cue enters once, counts down during the choice, and leaves on resolution', () => {
  const beat = { definition: events[0], phase: 'announce', at: 20 };
  assert.equal(eventCueState(beat, 20).opacity, 0);
  assert.equal(eventCueState(beat, 20.4).opacity, 1);
  beat.phase = 'choice_window'; beat.closesAt = 32;
  assert.equal(eventCueState(beat, 29.4).remaining, 3);
  beat.phase = 'resolve'; beat.resolvedAt = 30;
  assert.ok(eventCueState(beat, 30.16).opacity < 1);
  assert.equal(eventCueState(beat, 30.5).opacity, 0);
  beat.phase = 'cooldown';
  assert.equal(eventCueState(beat, 31), null);
  assert.equal(eventCueState(null, 31), null);
});
