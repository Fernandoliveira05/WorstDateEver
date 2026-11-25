import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createDateDirector } from '../src/date/director.mjs';
import { createNpcClocks } from '../src/date/npc-clock.js';
import { impactClass, sweptContact } from '../src/date/impact.js';
const content = file => JSON.parse(readFileSync(new URL('../content/shared/' + file + '.json', import.meta.url)));
function setup() {
  return createDateDirector({ schemaVersion:1, phase:'exit', avatarGender:'female',
    preference:'all', matchId:'rafa', substance:'none' }, {
    sessionId:'test', seed:1, catalog:content('events').events,
    persona:content('personas').personas.find(person=>person.id==='rafa'),
    dialogue:content('dialogue'), reactions:content('date-reactions')
  });
}

test('event clock pauses for speech and times out into a bounded response', () => {
  const date = setup();
  date.tick(10);
  date.tick(1.5);
  const before = date.view();
  assert.equal(before.beat.phase,'choice_window');
  assert.ok(before.canSpeak);
  date.tick(20,false);
  assert.equal(date.view().beat.phase,'choice_window');
  date.tick(20);
  assert.ok(date.view().session.completedEventIds.length);
});
test('impact strength, cooldown and boundaries affect the date result', () => {
  assert.equal(impactClass(.3),null);
  assert.equal(impactClass(2.1),'impact_light');
  assert.equal(impactClass(5),'impact_hard');
  const from = new THREE.Vector3(-.4,0,.06);
  const to = new THREE.Vector3(.4,0,.06);
  assert.ok(sweptContact(THREE,from,to,new THREE.Vector3(),.1));
  const date = setup();
  date.tick(7.5);
  assert.ok(date.choose('middle_finger'));
  assert.equal(date.view().session.relationship.interest,45);
  assert.equal(date.react('impact_hard',5,1),false);
  for (let i=0;i<6;i++) {
    date.tick(.75,false);
    date.react('impact_hard',5,1);
  }
  assert.equal(date.view().result,'disaster');
  assert.equal(date.view().session.phase,'ending');
});
test('NPC needs and clocks vary by role and stay reproducible', () => {
  const one = createNpcClocks(919), two = createNpcClocks(919);
  for (let time=0;time<80;time++) {
    const a=one(time), b=two(time);
    assert.deepEqual(a,b);
    assert.equal(new Set(a.map(x=>x.need)).size,5);
    assert.ok(a.every(x=>x.level>=0&&x.level<=1&&x.remaining>=0));
  }
  assert.notDeepEqual(createNpcClocks(1)(8),createNpcClocks(2)(8));
});
