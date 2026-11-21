// Run with: node --test docs/preview/behavior-core.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./behavior-core.js');

const ev = (id, key, t, extra = {}) => ({ id, key, t, xy: [100, 100], dogs: ['juno'], trigger: null, ...extra });
const walkOf = (events, extra = {}) => ({ id: 'w1', startMs: Date.UTC(2026, 10, 20), dogs: ['juno'], events, episodes: [], reviews: {}, ...extra });
const snapshot = o => JSON.parse(JSON.stringify(o));

test('1. existing users keep Professional; Beginner is recommended for new users', () => {
  assert.equal(C.resolveMode(undefined), 'professional');
  assert.equal(C.resolveMode({}), 'professional');
  assert.equal(C.resolveMode({ loggingMode: 'beginner' }), 'beginner');
  assert.equal(C.RECOMMENDED_MODE_NEW_USER, 'beginner');
  assert.deepEqual(C.behaviorsForMode('professional'), ['pulling', 'reactivity', 'guarding', 'fear', 'aggression', 'barking']);
});

test('Beginner mode lists observable actions and never classifies them as aggression', () => {
  const b = C.behaviorsForMode('beginner').map(k => C.BEHAVIORS[k].name);
  assert.deepEqual(b, ['Barking', 'Growling', 'Lunging', 'Pulling', 'Freezing', 'Retreating', 'Snapping', 'Showing Teeth', 'Trembling', 'Other behavior', 'Calm pass']);
  ['growling', 'barking', 'lunging'].forEach(k => assert.notEqual(C.BEHAVIORS[k].family, 'aggression'));
  assert.ok(!C.behaviorsForMode('beginner').includes('aggression'));
  assert.ok(C.isSuccess('calm'));
});

test('2. switching modes does not alter historical records', () => {
  const w = walkOf([ev('a', 'reactivity', 10, { trigger: 'Dog' }), ev('b', 'growling', 20)]);
  const before = snapshot(w);
  ['beginner', 'professional', 'beginner'].forEach(m => C.behaviorsForMode(m));
  assert.deepEqual(w, before);
  // Both modes share one event system: every logged key still resolves to a name.
  w.events.forEach(e => assert.ok(C.BEHAVIORS[e.key].name));
});

test('4. timed log records start, end, duration and both GPS points', () => {
  const e = C.startTimed(ev('t1', 'growling', 0), 100, [1, 2]);
  assert.equal(e.timerStatus, 'running');
  assert.equal(e.duration, null);
  C.endTimed(e, 128, [3, 4]);
  assert.equal(e.duration, 28);
  assert.deepEqual([e.t, e.end, e.xy, e.endXy, e.durationSource], [100, 128, [1, 2], [3, 4], 'timer']);
  assert.throws(() => C.endTimed(e, 140, [0, 0]), /not running/);
});

test('5. an unfinished timer never produces a fabricated duration, and can be corrected later', () => {
  const running = C.startTimed(ev('t2', 'barking', 0), 50, [0, 0]);
  const done = C.endTimed(C.startTimed(ev('t3', 'barking', 0), 60, [0, 0]), 65, [0, 0]);
  const changed = C.finalizeTimers([running, done]);
  assert.deepEqual(changed.map(e => e.id), ['t2']);
  assert.equal(running.timerStatus, 'not_ended');
  assert.equal(running.duration, null);
  assert.equal(C.durationKnown(running), false);
  assert.equal(done.duration, 5);
  assert.throws(() => C.correctDuration(running, -3));
  C.correctDuration(running, 20);
  assert.equal(running.duration, 20);
  assert.equal(running.durationSource, 'corrected');
  assert.equal(running.timerStatus, 'not_ended', 'the fact that the timer was not ended is preserved');
});

test('7. several behaviors can be associated with one episode (growl 28 s, bark x2, lunge x1)', () => {
  const growl = C.endTimed(C.startTimed(ev('g', 'growling', 0), 220, [100, 100]), 248, [102, 101]);
  const w = walkOf([growl, ev('b1', 'barking', 230), ev('b2', 'barking', 240), ev('l', 'lunging', 245)]);
  const groups = C.suggestEpisodes(w.events, { mPerUnit: 1 });
  assert.deepEqual(groups, [['g', 'b1', 'b2', 'l']]);
  const ep = C.confirmEpisode(w, groups[0], null);
  assert.equal(ep.dog, 'juno');
  assert.equal(ep.trigger, null, 'no trigger is assumed');
  const sum = Object.fromEntries(C.eventSummary(C.episodeEvents(w, ep.id)).map(b => [b.key, b]));
  assert.equal(sum.growling.seconds, 28);
  assert.equal(sum.barking.count, 2);
  assert.equal(sum.lunging.count, 1);
  assert.deepEqual(C.episodeSpan(w, ep.id), { start: 220, end: 248, startXy: [100, 100], endXy: [100, 100] });
});

test('grouping rules: never mixes dogs, respects time and distance, ignores pulling and calm passes', () => {
  const events = [
    ev('a', 'barking', 0), ev('b', 'growling', 30, { dogs: ['maple'] }),        // different dog
    ev('c', 'barking', 300), ev('d', 'lunging', 320, { xy: [500, 500] }),        // too far apart
    ev('e', 'pulling', 600), ev('f', 'calm', 610), ev('g', 'barking', 620),      // pulling/calm ignored
  ];
  assert.deepEqual(C.suggestEpisodes(events, { mPerUnit: 1 }), []);
  const w = walkOf([ev('x', 'barking', 0), ev('y', 'growling', 5, { dogs: ['maple'] })], { dogs: ['juno', 'maple'] });
  assert.throws(() => C.confirmEpisode(w, ['x', 'y'], 'juno'), /never mix dogs/);
  assert.equal(w.episodes.length, 0);
});

test('8. suggestions can be rejected, and events can be separated or reassigned', () => {
  const w = walkOf([ev('a', 'barking', 0), ev('b', 'growling', 10), ev('c', 'lunging', 20)]);
  const ids = C.suggestEpisodes(w.events)[0];
  const dismissed = new Set([C.suggestionKey(ids)]);
  assert.deepEqual(C.suggestEpisodes(w.events, { dismissed }), [], 'a rejected suggestion is not shown again');
  const ep = C.confirmEpisode(w, ['a', 'b'], 'juno', { origin: 'manual' });
  C.addToEpisode(w, 'c', ep.id);
  assert.equal(C.episodeEvents(w, ep.id).length, 3);
  C.removeFromEpisode(w, 'b');
  assert.deepEqual(C.episodeEvents(w, ep.id).map(e => e.id), ['a', 'c']);
  assert.equal(w.events.find(e => e.id === 'b').episodeId, null, 'removed event stays as a standalone event');
});

test('multi-dog events are only grouped after the user picks the dog, recorded as a correction', () => {
  const w = walkOf([ev('a', 'barking', 0, { dogs: ['juno', 'maple'] }), ev('b', 'growling', 5, { dogs: ['juno', 'maple'] })], { dogs: ['juno', 'maple'] });
  assert.throws(() => C.confirmEpisode(w, ['a', 'b'], null), /Choose which dog/);
  C.confirmEpisode(w, ['a', 'b'], 'maple');
  const a = w.events[0];
  assert.deepEqual([a.dogs, a.dogsBefore, a.dogCorrected], [['maple'], ['juno', 'maple'], true]);
});

test('9. grouping and ungrouping never delete or alter original observations', () => {
  const w = walkOf([ev('a', 'barking', 0, { trigger: 'Dog', note: 'n1' }), ev('b', 'growling', 10, { trigger: 'Human' })]);
  const observations = () => w.events.map(({ episodeId, ...rest }) => rest);
  const before = snapshot(observations());
  const ep = C.confirmEpisode(w, ['a', 'b'], 'juno');
  assert.deepEqual(C.episodeTrigger(w, ep), { value: null, source: 'mixed' }, 'mixed triggers are not merged');
  assert.equal(w.events[1].trigger, 'Human', 'triggers are never copied between events');
  C.ungroupEpisode(w, ep.id);
  assert.equal(w.events.length, 2);
  assert.deepEqual(observations(), before);
  assert.equal(w.episodes.length, 0);
});

test('episode trigger reuses a trigger only when every event logged the same one', () => {
  const w = walkOf([ev('a', 'barking', 0, { trigger: 'Dog' }), ev('b', 'lunging', 5, { trigger: 'Dog' })]);
  const ep = C.confirmEpisode(w, ['a', 'b'], 'juno');
  assert.deepEqual(C.episodeTrigger(w, ep), { value: 'Dog', source: 'logged' });
  const qs = C.reviewQuestions({ behaviorKeys: ['barking', 'lunging'], trigger: C.episodeTrigger(w, ep) });
  assert.ok(!qs.some(q => q.id === 'trigger'), 'a reliably logged trigger is not asked again');
  assert.ok(qs.find(q => q.id === 'before').options.some(o => o[1] === 'Another dog approached'));
});

test('questionnaire adapts to behavior and answers', () => {
  const unknown = C.reviewQuestions({ behaviorKeys: ['freezing'], trigger: { value: null } }, {});
  assert.equal(unknown[0].id, 'trigger');
  assert.ok(unknown.find(q => q.id === 'after').options.some(o => o[0] === 'stayed_worried'));
  const noneNoticed = C.reviewQuestions({ behaviorKeys: ['barking'], trigger: { value: 'Other' } }, { before: 'none_noticed' });
  assert.ok(!noneNoticed.some(q => q.id === 'distance'));
  const settled = C.reviewQuestions({ behaviorKeys: ['barking'], trigger: { value: 'Dog' } }, { after: 'settled_distance' });
  assert.ok(settled.some(q => q.id === 'recovery'));
  const guard = C.reviewQuestions({ behaviorKeys: ['guarding'], trigger: { value: null } }, {});
  assert.ok(guard.find(q => q.id === 'before').options.some(o => o[0] === 'item_reach'));
  const body = settled.find(q => q.id === 'body');
  assert.ok(body.primary.length <= 5 && body.primary.length + body.more.length === 10);
  // Every question offers a way out
  settled.filter(q => q.options).forEach(q => assert.ok(q.options.some(o => o[0] === 'not_sure'), q.id));
  // Uses "human", never "person"/"people" in options
  JSON.stringify([unknown, settled, guard]).toLowerCase().split('"').forEach(s => assert.ok(!/\bperson\b|\bpeople\b/.test(s), s));
});

test('10. reviews keep "not sure" distinct from "no" and from unanswered', () => {
  const ctx = { behaviorKeys: ['barking'], trigger: { value: 'Dog' }, events: [ev('a', 'barking', 0)] };
  const review = { answers: { before: 'not_sure' }, indicators: { stiff_body: 'no', whale_eye: 'unsure' } };
  const out = C.interpret(ctx, review);
  assert.ok(out.facts.some(s => /did not see: stiff body/.test(s)));
  assert.ok(out.missing.some(s => /Not sure about: whale eye/.test(s)));
  assert.ok(out.missing.some(s => /not sure what happened just before/.test(s)));
  assert.ok(out.missing.some(s => /afterward was not answered/.test(s)));
  assert.equal(C.reviewStatus(review, C.reviewQuestions(ctx, review.answers)), 'partial');
  assert.equal(C.reviewStatus({ status: 'skipped' }, []), 'skipped');
  assert.equal(C.reviewStatus(undefined, []), 'not_started');
});

test('11. incomplete or thin questionnaires do not produce behavioral conclusions', () => {
  const ctx = { behaviorKeys: ['lunging'], trigger: { value: 'Dog' }, events: [ev('a', 'lunging', 0)] };
  assert.deepEqual(C.interpret(ctx, undefined).possible, []);
  assert.deepEqual(C.interpret(ctx, { answers: { before: 'dog_approached' }, indicators: { stiff_body: 'yes', fixed_stare: 'yes' } }).possible, []);
  // One indicator alone never yields an explanation about motivation
  const one = C.interpret(ctx, { answers: { before: 'dog_approached', after: 'continued' }, indicators: { tail_tucked: 'yes' } });
  assert.ok(!one.possible.some(s => /uneasy|aroused/.test(s)));
  assert.ok(one.missing.some(s => /One sign on its own/.test(s)));
});

test('interpretation separates facts, context, possibilities, gaps and next steps without scores', () => {
  const ctx = { behaviorKeys: ['lunging'], trigger: { value: 'Dog', source: 'logged' }, events: [ev('a', 'lunging', 0)] };
  const out = C.interpret(ctx, { answers: { before: 'dog_approached', distance: 'few_feet', after: 'settled_distance', recovery: 's10_30' }, indicators: { stiff_body: 'yes', fixed_stare: 'yes' } });
  assert.ok(out.facts[0].startsWith('Lunging: 1 time'));
  assert.ok(out.context.some(s => /Another dog approached/.test(s)));
  assert.ok(out.context.some(s => /your estimate/.test(s)));
  assert.ok(out.possible.some(s => /consistent with/.test(s)));
  assert.ok(out.possible.some(s => /cannot tell them apart/.test(s)));
  const all = JSON.stringify(out);
  assert.ok(!/%|\bscore\b|\bdiagnos/i.test(all), 'no percentages, scores or diagnoses');
  assert.ok(!/punish|correct(ion)? (the|your) dog|intimidat/i.test(all), 'no aversive advice');
  assert.equal(out.reviewedByProfessional, false);
});

test('serious behaviors add veterinary and professional guidance', () => {
  const out = C.interpret({ behaviorKeys: ['snapping'], trigger: { value: 'Human' }, events: [ev('a', 'snapping', 0)] }, undefined);
  assert.ok(/qualified behavior professional/.test(out.safety[0]) && /veterinarian/.test(out.safety[0]));
});

test('12. analytics count one episode as one encounter and keep behaviors, durations and recovery separate', () => {
  const growl = C.endTimed(C.startTimed(ev('g', 'growling', 0, { trigger: 'Dog' }), 0, [100, 100]), 28, [100, 100]);
  const unended = C.startTimed(ev('u', 'barking', 0), 400, [300, 300]); C.finalizeTimers([unended]);
  const w = walkOf([growl, ev('b1', 'barking', 5, { trigger: 'Dog' }), ev('b2', 'barking', 9, { trigger: 'Dog' }), ev('l', 'lunging', 12, { trigger: 'Dog' }),
    unended, ev('c', 'calm', 900, { trigger: 'Dog' }), ev('p', 'pulling', 1000)]);
  const ep = C.confirmEpisode(w, ['g', 'b1', 'b2', 'l'], 'juno');
  w.reviews['ep:' + ep.id] = { answers: { after: 'settled_distance', recovery: 's10_30', distance: 'across_street' } };
  const r = C.analytics([w, walkOf([], { id: 'w2' })]);
  assert.equal(r.walks, 2);
  assert.equal(r.episodes, 1);
  assert.equal(r.standaloneEncounters, 1, 'the unended barking timer is its own encounter');
  assert.equal(r.calmPasses, 1);
  assert.equal(r.encounters, 3);
  assert.equal(r.behaviorEvents, 6, 'growl, bark x3, lunge, pull (calm pass is not a behavior event)');
  assert.deepEqual(r.byBehavior, { growling: 1, barking: 3, lunging: 1, pulling: 1 });
  assert.deepEqual([r.durations.known, r.durations.unknown, r.durations.totalS], [1, 1, 28]);
  assert.deepEqual(r.recovery.reported, { s10_30: 1 });
  assert.equal(r.managed.settled, 1);
  assert.equal(r.managed.afterUnknown, 1, 'unreviewed encounter counts as unknown, not as zero');
  assert.deepEqual(r.distance, { reported: { across_street: 1 }, notSure: 0, notReported: 1 });
  assert.deepEqual(r.triggers, { Dog: 4, Human: 0, Other: 0, none: 2 });
});

test('analytics filters by dog, behavior, trigger and date', () => {
  const day = 864e5;
  const w1 = walkOf([ev('a', 'barking', 0, { trigger: 'Human' })], { startMs: 10 * day });
  const w2 = walkOf([ev('b', 'growling', 0, { dogs: ['maple'], trigger: 'Dog' })], { id: 'w2', dogs: ['maple'], startMs: 40 * day });
  assert.equal(C.analytics([w1, w2], { dog: 'maple' }).behaviorEvents, 1);
  assert.equal(C.analytics([w1, w2], { behavior: 'barking' }).behaviorEvents, 1);
  assert.equal(C.analytics([w1, w2], { trigger: 'Dog' }).behaviorEvents, 1);
  assert.equal(C.analytics([w1, w2], { fromMs: 30 * day }).walks, 1);
  assert.equal(C.analytics([w1, w2], { trigger: 'none' }).behaviorEvents, 0);
});
