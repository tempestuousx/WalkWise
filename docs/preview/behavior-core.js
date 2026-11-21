/*
 * WalkWise behavior core: pure logic shared by the design preview and its tests.
 * No DOM access. Intended to become src/domain/behavior/* in the real app.
 *
 * Conventions
 *   - Event times (t, end) are seconds since the walk started (walk clock, keeps running while paused).
 *   - Unanswered review questions are absent (undefined). "I'm not sure" is the explicit value 'not_sure'.
 *   - Body-language responses are 'yes' | 'no' | 'unsure'; a missing key means "not answered".
 *   - Nothing here deletes or rewrites an observation silently. Grouping only links events to an episode.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WWCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ───────────── Logging modes and behavior taxonomy ───────────── */

  const MODES = ['beginner', 'professional'];
  // Existing users keep Professional unless they choose otherwise; new users are recommended Beginner.
  const DEFAULT_MODE_EXISTING_USER = 'professional';
  const RECOMMENDED_MODE_NEW_USER = 'beginner';
  function resolveMode(prefs) {
    return prefs && MODES.includes(prefs.loggingMode) ? prefs.loggingMode : DEFAULT_MODE_EXISTING_USER;
  }

  // family drives which review questions and body-language indicators are relevant.
  // serious: show guidance about veterinary / qualified behavioral assessment.
  const BEHAVIORS = {
    pulling:    { name: 'Pulling', short: 'Pulling', modes: ['professional', 'beginner'], trigger: false, family: 'pulling' },
    barking:    { name: 'Barking', short: 'Barking', modes: ['professional', 'beginner'], trigger: true, family: 'vocal' },
    reactivity: { name: 'Reactivity', short: 'Reactivity', modes: ['professional'], trigger: true, family: 'reactive' },
    guarding:   { name: 'Resource Guarding', short: 'Guarding', modes: ['professional'], trigger: true, family: 'guarding' },
    fear:       { name: 'Fear / Anxiety', short: 'Fear', modes: ['professional'], trigger: true, family: 'fear' },
    aggression: { name: 'Aggression', short: 'Aggression', modes: ['professional'], trigger: true, family: 'threat', serious: true },
    growling:   { name: 'Growling', short: 'Growl', modes: ['beginner'], trigger: true, family: 'threat' },
    lunging:    { name: 'Lunging', short: 'Lunge', modes: ['beginner'], trigger: true, family: 'reactive' },
    freezing:   { name: 'Freezing', short: 'Freeze', modes: ['beginner'], trigger: true, family: 'fear' },
    retreating: { name: 'Retreating', short: 'Retreat', modes: ['beginner'], trigger: true, family: 'fear' },
    snapping:   { name: 'Snapping', short: 'Snap', modes: ['beginner'], trigger: true, family: 'threat', serious: true },
    teeth:      { name: 'Showing Teeth', short: 'Teeth', modes: ['beginner'], trigger: true, family: 'threat' },
    trembling:  { name: 'Trembling', short: 'Tremble', modes: ['beginner'], trigger: true, family: 'fear' },
    'b-other':  { name: 'Other behavior', short: 'Other', modes: ['beginner'], trigger: true, family: 'other', describe: 'What did your dog do?' },
    calm:       { name: 'Calm pass', short: 'Calm pass', modes: ['beginner'], trigger: true, family: 'success', success: true },
  };
  const MODE_ORDER = {
    professional: ['pulling', 'reactivity', 'guarding', 'fear', 'aggression', 'barking'],
    beginner: ['barking', 'growling', 'lunging', 'pulling', 'freezing', 'retreating', 'snapping', 'teeth', 'trembling', 'b-other', 'calm'],
  };
  function behaviorsForMode(mode) { return MODE_ORDER[resolveMode({ loggingMode: mode })].slice(); }
  const isBehavior = key => Object.prototype.hasOwnProperty.call(BEHAVIORS, key);
  const isSuccess = key => isBehavior(key) && !!BEHAVIORS[key].success;
  // Reviewable in "Understand My Dog": reactions and concerns. Pulling and calm passes are tracked but not reviewed.
  const isReviewable = key => isBehavior(key) && !BEHAVIORS[key].success && key !== 'pulling';
  const isSerious = key => isBehavior(key) && !!BEHAVIORS[key].serious;

  /* ───────────── Timed events ───────────── */

  function startTimed(event, clockS, xy) {
    return Object.assign(event, { timed: true, t: clockS, xy, end: null, endXy: null, timerStatus: 'running', duration: null, durationSource: null });
  }
  function endTimed(event, clockS, xy) {
    if (!event.timed || event.timerStatus !== 'running') throw new Error('Timer is not running');
    if (clockS < event.t) throw new Error('End is before start');
    event.end = clockS; event.endXy = xy; event.timerStatus = 'ended';
    event.duration = clockS - event.t; event.durationSource = 'timer';
    return event;
  }
  // Called when a walk ends: running timers become "not ended" with an unknown duration. Never invents a value.
  function finalizeTimers(events) {
    const changed = [];
    events.forEach(e => { if (e.timed && e.timerStatus === 'running') { e.timerStatus = 'not_ended'; e.end = null; e.duration = null; e.durationSource = null; changed.push(e); } });
    return changed;
  }
  function correctDuration(event, seconds) {
    if (!event.timed) throw new Error('Not a timed event');
    if (!(typeof seconds === 'number' && isFinite(seconds) && seconds > 0)) throw new Error('Duration must be a positive number of seconds');
    event.duration = Math.round(seconds); event.durationSource = 'corrected';
    return event; // timerStatus stays as recorded ('not_ended' or 'ended') so the original fact is preserved
  }
  const durationKnown = e => e.timed && e.duration != null && (e.durationSource === 'timer' || e.durationSource === 'corrected');

  /* ───────────── Episodes ───────────── */

  const dogKey = e => (e.dogs || []).slice().sort().join(',');
  function eventEndS(e) { return e.timed && e.end != null ? e.end : e.t; }
  function distM(a, b, mPerUnit) { return Math.hypot(a[0] - b[0], a[1] - b[1]) * (mPerUnit || 1); }

  /**
   * Suggest groups of reviewable behavior events that happened close together.
   * Never groups events for different dogs, never touches events already in an episode, never returns singletons.
   */
  function suggestEpisodes(events, opts = {}) {
    const maxGapS = opts.maxGapS ?? 90, maxDistM = opts.maxDistM ?? 40, dismissed = opts.dismissed || new Set();
    const cands = events.filter(e => isReviewable(e.key) && !e.episodeId && e.xy).sort((a, b) => a.t - b.t);
    const groups = [];
    for (const e of cands) {
      const g = groups[groups.length - 1];
      const last = g && g[g.length - 1];
      if (g && dogKey(e) === dogKey(g[0]) && (e.dogs || []).length > 0 &&
          e.t - eventEndS(last) <= maxGapS && distM(e.xy, last.xy, opts.mPerUnit) <= maxDistM) g.push(e);
      else groups.push([e]);
    }
    return groups.filter(g => g.length > 1).map(g => g.map(e => e.id)).filter(ids => !dismissed.has(ids.join('|')));
  }
  const suggestionKey = ids => ids.join('|');

  // Which single dog could an episode with these events belong to?
  function candidateDogs(evs) {
    if (!evs.length) return [];
    let set = new Set(evs[0].dogs || []);
    evs.slice(1).forEach(e => { set = new Set([...set].filter(d => (e.dogs || []).includes(d))); });
    return [...set];
  }
  function assertCompatible(e, dog) {
    const dogs = e.dogs || [];
    if (!dogs.includes(dog)) throw new Error(`Event ${e.id} is not attributed to ${dog}; episodes never mix dogs`);
  }
  // Narrow an event attributed to several dogs down to the episode's dog. This is an explicit user correction.
  function narrowToDog(e, dog) { if ((e.dogs || []).length > 1) { e.dogsBefore = e.dogs.slice(); e.dogs = [dog]; e.dogCorrected = true; } }

  function confirmEpisode(walk, eventIds, dog, meta = {}) {
    const evs = eventIds.map(id => walk.events.find(e => e.id === id));
    if (evs.some(e => !e)) throw new Error('Unknown event');
    if (evs.some(e => e.episodeId)) throw new Error('Event already belongs to an episode');
    if (!dog) { const c = candidateDogs(evs); if (c.length !== 1) throw new Error('Choose which dog this episode is for'); dog = c[0]; }
    evs.forEach(e => assertCompatible(e, dog));
    evs.forEach(e => narrowToDog(e, dog));
    const ep = { id: meta.id || 'ep' + Math.random().toString(36).slice(2, 9), walkId: walk.id, dog, origin: meta.origin || 'suggested',
      trigger: null, triggerSource: null, notes: '', createdAt: meta.createdAt ?? null };
    walk.episodes = walk.episodes || []; walk.episodes.push(ep);
    evs.forEach(e => { e.episodeId = ep.id; });
    return ep;
  }
  function episodeEvents(walk, epId) { return walk.events.filter(e => e.episodeId === epId).sort((a, b) => a.t - b.t); }
  function removeFromEpisode(walk, eventId) {
    const e = walk.events.find(x => x.id === eventId); if (!e || !e.episodeId) return null;
    const epId = e.episodeId; e.episodeId = null;
    if (!episodeEvents(walk, epId).length) walk.episodes = walk.episodes.filter(x => x.id !== epId);
    return e;
  }
  function addToEpisode(walk, eventId, epId) {
    const e = walk.events.find(x => x.id === eventId), ep = (walk.episodes || []).find(x => x.id === epId);
    if (!e || !ep) throw new Error('Unknown event or episode');
    if (e.episodeId) throw new Error('Remove it from its current episode first');
    assertCompatible(e, ep.dog); narrowToDog(e, ep.dog); e.episodeId = ep.id; return ep;
  }
  function ungroupEpisode(walk, epId) {
    walk.events.forEach(e => { if (e.episodeId === epId) e.episodeId = null; });
    walk.episodes = (walk.episodes || []).filter(x => x.id !== epId);
    if (walk.reviews) delete walk.reviews['ep:' + epId];
  }
  function episodeSpan(walk, epId) {
    const evs = episodeEvents(walk, epId); if (!evs.length) return null;
    return { start: Math.min(...evs.map(e => e.t)), end: Math.max(...evs.map(eventEndS)), startXy: evs[0].xy, endXy: (evs[evs.length - 1].endXy || evs[evs.length - 1].xy) };
  }
  // Episode trigger: reuse what was logged only when every event logged the same trigger. Never copies onto events.
  function episodeTrigger(walk, ep) {
    if (ep.trigger) return { value: ep.trigger, source: ep.triggerSource || 'reviewed' };
    const ts = episodeEvents(walk, ep.id).map(e => e.trigger || null);
    if (ts.length && ts.every(t => t && t === ts[0])) return { value: ts[0], source: 'logged' };
    return { value: null, source: ts.some(Boolean) ? 'mixed' : 'unknown' };
  }
  function eventSummary(evs) {
    const by = {};
    evs.forEach(e => { const b = by[e.key] || (by[e.key] = { key: e.key, count: 0, known: 0, unknown: 0, seconds: 0 });
      b.count++; if (e.timed) { if (durationKnown(e)) { b.known++; b.seconds += e.duration; } else if (e.timerStatus !== 'running') b.unknown++; } });
    return Object.values(by);
  }

  /* ───────────── Body-language library ───────────── */
  // Illustrations are supplied separately and linked by indicator key; text always works without them.
  const INDICATORS = [
    { key: 'stiff_body', name: 'Stiff body', desc: 'The body looks rigid or tense, often very still, instead of loose and wiggly.' },
    { key: 'whale_eye', name: 'Whale eye', desc: 'You can see the whites of the eyes, often while the head is turned a little away.' },
    { key: 'lip_lick', name: 'Lip licking', desc: 'A quick flick of the tongue over the lips or nose that is not about food or water.' },
    { key: 'weight_back', name: 'Weight shifting backward', desc: 'Leaning back or shifting weight onto the back legs, away from something.' },
    { key: 'fixed_stare', name: 'Fixed staring', desc: 'Eyes locked on something without looking away.' },
    { key: 'ears_back', name: 'Ears pinned back', desc: 'Ears pulled back flat against the head.' },
    { key: 'tail_tucked', name: 'Tail tucked', desc: 'Tail held low or tucked between the back legs.' },
    { key: 'head_turn', name: 'Head turning away', desc: 'Turning the head or body away from something.' },
    { key: 'lowered_posture', name: 'Lowered body posture', desc: 'The body is crouched or lower to the ground than usual.' },
    { key: 'hackles', name: 'Raised hackles', desc: 'Fur standing up along the shoulders, back, or base of the tail.' },
  ];
  const INDICATOR = Object.fromEntries(INDICATORS.map(i => [i.key, i]));
  const FAMILY_INDICATORS = {
    threat: ['stiff_body', 'fixed_stare', 'hackles', 'whale_eye', 'lip_lick'],
    reactive: ['stiff_body', 'fixed_stare', 'hackles', 'weight_back', 'ears_back'],
    vocal: ['stiff_body', 'fixed_stare', 'hackles', 'ears_back', 'weight_back'],
    fear: ['weight_back', 'tail_tucked', 'lowered_posture', 'ears_back', 'head_turn', 'whale_eye'],
    guarding: ['stiff_body', 'whale_eye', 'fixed_stare', 'lowered_posture', 'lip_lick'],
    other: ['stiff_body', 'lip_lick', 'head_turn', 'weight_back', 'ears_back'],
  };
  function indicatorsFor(behaviorKeys, max = 5) {
    const ordered = [];
    behaviorKeys.forEach(k => (FAMILY_INDICATORS[(BEHAVIORS[k] || {}).family] || FAMILY_INDICATORS.other).forEach(i => { if (!ordered.includes(i)) ordered.push(i); }));
    const primary = ordered.slice(0, max);
    return { primary, more: INDICATORS.map(i => i.key).filter(k => !primary.includes(k)) };
  }

  /* ───────────── Review questions (conditional) ───────────── */

  const NOT_SURE = ['not_sure', "I'm not sure"];
  const OTHER = ['other', 'Other'];
  const TRIGGER_Q = { id: 'trigger', prompt: 'What was your dog reacting to?', options: [['Dog', 'A dog'], ['Human', 'A human'], ['Other', 'Something else'], NOT_SURE] };
  const BEFORE = {
    Dog: [['dog_approached', 'Another dog approached'], ['dog_passed', 'Another dog walked past'], ['dog_nearby', 'Another dog stood nearby'], ['dog_left', 'Another dog moved away'], OTHER, NOT_SURE],
    Human: [['human_approached', 'A human approached'], ['human_passed', 'A human walked past'], ['human_nearby', 'A human stood nearby'], ['human_reached', 'A human reached toward my dog'], ['human_left', 'A human moved away'], OTHER, NOT_SURE],
    Other: [['thing_approached', 'Something came toward us'], ['thing_passed', 'Something moved past'], ['sudden', 'A sudden noise or movement'], ['none_noticed', 'Nothing I noticed'], OTHER, NOT_SURE],
    guarding: [['item_dog', 'Another dog came near something my dog had'], ['item_human', 'A human came near something my dog had'], ['item_reach', 'A human reached for it'], OTHER, NOT_SURE],
  };
  const DISTANCE = [['far', 'Far away'], ['across_street', 'Across the street'], ['few_feet', 'A few feet away'], ['very_close', 'Very close'], NOT_SURE];
  const AFTER = {
    social: [['settled_distance', 'My dog settled after we increased distance'], ['continued', 'My dog continued reacting'], ['settled_changed', 'My dog settled after the situation changed'], ['other_left', 'The other dog or human moved away'], OTHER, NOT_SURE],
    fear: [['settled_distance', 'My dog settled after we moved away'], ['settled_passed', 'My dog settled once it passed'], ['stayed_worried', 'My dog stayed worried for the rest of the walk'], OTHER, NOT_SURE],
    guarding: [['left_item', 'My dog dropped or left the item'], ['other_left', 'The other dog or human moved away'], ['continued', 'My dog kept guarding'], OTHER, NOT_SURE],
  };
  const SETTLED = new Set(['settled_distance', 'settled_changed', 'settled_passed', 'left_item', 'other_left']);
  const RECOVERY = [['under_10s', 'Under 10 seconds'], ['s10_30', '10 to 30 seconds'], ['s30_120', '30 seconds to 2 minutes'], ['over_2m', 'More than 2 minutes'], NOT_SURE];

  function familiesOf(keys) { return [...new Set(keys.map(k => (BEHAVIORS[k] || {}).family).filter(Boolean))]; }
  function dominantFamily(keys) {
    const f = familiesOf(keys);
    if (f.includes('guarding')) return 'guarding';
    if (f.length && f.every(x => x === 'fear')) return 'fear';
    return 'social';
  }

  /**
   * Build the questionnaire for a subject. ctx = { behaviorKeys, trigger: {value, source} }.
   * Questions already answered reliably at logging time are not asked again.
   */
  function reviewQuestions(ctx, answers = {}) {
    const fam = dominantFamily(ctx.behaviorKeys);
    const qs = [];
    const knownTrigger = ctx.trigger && ctx.trigger.value;
    if (!knownTrigger && fam !== 'guarding') qs.push(TRIGGER_Q);
    const trig = knownTrigger || (answers.trigger && answers.trigger !== 'not_sure' ? answers.trigger : 'Other');
    const beforeOpts = fam === 'guarding' ? BEFORE.guarding : BEFORE[trig] || BEFORE.Other;
    qs.push({ id: 'before', prompt: 'What happened immediately before?', options: beforeOpts });
    if (answers.before !== 'none_noticed') qs.push({ id: 'distance', prompt: 'How close was it?', help: 'Your best estimate. This is not measured by GPS.', options: DISTANCE });
    qs.push({ id: 'body', prompt: 'What body language did you notice?', help: 'Optional. Answer only what you saw. "Not sure" is a fine answer.', type: 'indicators', ...indicatorsFor(ctx.behaviorKeys) });
    qs.push({ id: 'after', prompt: 'What happened afterward?', options: AFTER[fam] || AFTER.social });
    if (SETTLED.has(answers.after)) qs.push({ id: 'recovery', prompt: 'About how long did your dog take to settle?', help: 'Separate from how long the behavior itself lasted.', options: RECOVERY });
    qs.push({ id: 'notes', prompt: 'Anything else you want to remember?', type: 'text' });
    return qs;
  }
  function reviewStatus(review, questions) {
    if (!review) return 'not_started';
    if (review.status === 'skipped') return 'skipped';
    const required = questions.filter(q => q.type !== 'text' && q.type !== 'indicators');
    const answered = required.filter(q => review.answers && review.answers[q.id] != null).length;
    if (!answered && !Object.keys(review.indicators || {}).length && !review.notes) return 'not_started';
    return answered === required.length ? 'complete' : 'partial';
  }

  /* ───────────── Educational interpretation ───────────── */
  // Content is versioned so professionally reviewed wording can replace this draft later.
  const CONTENT_VERSION = 'edu-2026.11-draft';
  const UNEASY = ['weight_back', 'ears_back', 'tail_tucked', 'lowered_posture', 'head_turn', 'lip_lick', 'whale_eye'];
  const AROUSAL = ['stiff_body', 'fixed_stare', 'hackles'];
  const label = (opts, v) => { const o = (opts || []).find(x => x[0] === v); return o ? o[1] : v; };
  const listNames = keys => keys.map(k => INDICATOR[k].name.toLowerCase()).join(', ');
  const fmtDur = s => s < 60 ? `${s} seconds` : `${Math.floor(s / 60)} min ${s % 60} s`;

  function interpret(ctx, review) {
    const a = (review && review.answers) || {}, ind = (review && review.indicators) || {};
    const fam = dominantFamily(ctx.behaviorKeys);
    const trig = (ctx.trigger && ctx.trigger.value) || (a.trigger && a.trigger !== 'not_sure' ? a.trigger : null);
    const out = { facts: [], context: [], possible: [], missing: [], watch: [], safety: [], contentVersion: CONTENT_VERSION, reviewedByProfessional: false };

    // 1. Observed facts (what was logged or reported)
    eventSummary(ctx.events).forEach(b => {
      const n = BEHAVIORS[b.key] ? BEHAVIORS[b.key].name : b.key;
      let s = `${n}: ${b.count} time${b.count === 1 ? '' : 's'}`;
      if (b.known) s += `, ${fmtDur(b.seconds)} timed`;
      if (b.unknown) s += `, ${b.unknown} timer${b.unknown === 1 ? '' : 's'} not ended (duration unknown)`;
      out.facts.push(s);
    });
    const yes = Object.keys(ind).filter(k => ind[k] === 'yes'), no = Object.keys(ind).filter(k => ind[k] === 'no'), unsure = Object.keys(ind).filter(k => ind[k] === 'unsure');
    if (yes.length) out.facts.push(`You saw: ${listNames(yes)}.`);
    if (no.length) out.facts.push(`You did not see: ${listNames(no)}.`);

    // 2. Context
    const allBefore = [...BEFORE.Dog, ...BEFORE.Human, ...BEFORE.Other, ...BEFORE.guarding];
    const allAfter = [...AFTER.social, ...AFTER.fear, ...AFTER.guarding];
    if (trig) out.context.push(`Trigger: ${trig === 'Dog' ? 'a dog' : trig === 'Human' ? 'a human' : 'something else'}${ctx.trigger && ctx.trigger.source === 'logged' ? ' (as logged)' : ''}.`);
    if (a.before && a.before !== 'not_sure') out.context.push(`Just before: ${label(allBefore, a.before)}.`);
    if (a.distance && a.distance !== 'not_sure') out.context.push(`Distance (your estimate): ${label(DISTANCE, a.distance).toLowerCase()}.`);
    if (a.after && a.after !== 'not_sure') out.context.push(`Afterward: ${label(allAfter, a.after)}.`);
    if (a.recovery && a.recovery !== 'not_sure') out.context.push(`Time to settle: ${label(RECOVERY, a.recovery).toLowerCase()}.`);

    // 3. Possible explanations: only when the key context is actually known.
    const knowsBefore = a.before && a.before !== 'not_sure';
    const knowsAfter = a.after && a.after !== 'not_sure';
    const uneasyYes = yes.filter(k => UNEASY.includes(k)), arousalYes = yes.filter(k => AROUSAL.includes(k));
    if (knowsBefore && knowsAfter) {
      if (a.after === 'settled_distance') out.possible.push('Your dog settled once there was more distance. That is consistent with the situation being easier for your dog with more space. It does not show why: discomfort, frustration, and excitement can all look like this.');
      if (a.after === 'other_left') out.possible.push('Your dog settled when the other dog or human moved away, which also suggests that space made the situation easier.');
      if (a.after === 'continued' || a.after === 'stayed_worried') out.possible.push('Your dog kept reacting afterward. That can happen when the situation is still too close or too intense at that moment.');
      if (uneasyYes.length >= 2) out.possible.push(`You noticed more than one sign often linked to a dog feeling uneasy (${listNames(uneasyYes)}). Together they may point toward discomfort, but no single sign means fear on its own.`);
      if (arousalYes.length >= 2) out.possible.push(`Signs like ${listNames(arousalYes)} are often seen when a dog is very focused or aroused. That can happen with excitement, frustration, or discomfort, so these signs alone cannot tell them apart.`);
      if (fam === 'guarding' && /^item_/.test(a.before || '')) out.possible.push('This happened around something your dog had. Dogs sometimes try to keep hold of things they value. How your dog behaves around food, toys, or found items over several situations tells you more than one event.');
      if (!out.possible.length) out.possible.push('Your answers do not point clearly toward one explanation. That is common, and more observations over time will help.');
    }
    if (uneasyYes.length + arousalYes.length === 1) out.missing.push('You noted one body-language sign. One sign on its own is not enough to suggest a reason.');

    // 4. Missing information (unanswered and "not sure" stay distinct)
    if (!trig) out.missing.push(a.trigger === 'not_sure' ? 'You were not sure what your dog was reacting to.' : 'What your dog was reacting to was not recorded.');
    if (!a.before) out.missing.push('What happened just before was not answered.'); else if (a.before === 'not_sure') out.missing.push('You were not sure what happened just before.');
    if (a.before !== 'none_noticed') { if (!a.distance) out.missing.push('How close it was was not answered.'); else if (a.distance === 'not_sure') out.missing.push('You were not sure how close it was.'); }
    if (!a.after) out.missing.push('What happened afterward was not answered.'); else if (a.after === 'not_sure') out.missing.push('You were not sure what happened afterward.');
    if (!yes.length && !no.length && !unsure.length) out.missing.push('Body language was not recorded.');
    if (unsure.length) out.missing.push(`Not sure about: ${listNames(unsure)}.`);
    if (SETTLED.has(a.after) && (!a.recovery || a.recovery === 'not_sure')) out.missing.push('How long your dog took to settle is not known.');
    if (!knowsBefore || !knowsAfter) out.missing.unshift('Possible explanations need to know what happened before and afterward.');

    // 5. What to watch for next time
    if (!a.distance || a.distance === 'not_sure') out.watch.push('Notice how far away the dog, human, or object is when your dog first reacts.');
    if (!knowsBefore) out.watch.push('Notice what the other dog or human was doing just before.');
    if (!yes.length && !no.length) out.watch.push('Watch for early signs such as a stiff body, lip licking, or turning away before a reaction.');
    if (SETTLED.has(a.after) && (!a.recovery || a.recovery === 'not_sure')) out.watch.push('Notice roughly how long your dog takes to settle afterward.');
    out.watch.push('Note the distance at which your dog can notice a trigger and still stay relaxed.');
    if (familiesOf(ctx.behaviorKeys).includes('threat')) out.watch.push('Growling and other warnings are useful communication. Rather than correcting them, create more distance.');

    // Safety guidance
    if (ctx.behaviorKeys.some(isSerious)) out.safety.push('Snapping or aggression is worth discussing with a qualified behavior professional. Ask your veterinarian to check for pain or illness too, especially if this is new or getting worse.');
    else out.safety.push('If this behavior is new, getting worse, or your dog seems to be in pain, talk to your veterinarian. A qualified behavior professional can help with ongoing reactions.');
    return out;
  }

  /* ───────────── Analytics ───────────── */
  // walks: [{ id, startMs, dogs, events, episodes, reviews }]. filters: { dog, behavior, trigger, fromMs, toMs }.
  function analytics(walks, f = {}) {
    const dog = f.dog || 'all', beh = f.behavior || 'all', trig = f.trigger || 'all';
    const inRange = w => (f.fromMs == null || w.startMs >= f.fromMs) && (f.toMs == null || w.startMs <= f.toMs);
    const ws = walks.filter(w => inRange(w) && (dog === 'all' || (w.dogs || []).includes(dog)));
    const evOk = e => isBehavior(e.key) && (dog === 'all' || (e.dogs || []).includes(dog)) && (trig === 'all' || (trig === 'none' ? !e.trigger : e.trigger === trig));
    const res = {
      walks: ws.length, encounters: 0, episodes: 0, standaloneEncounters: 0, calmPasses: 0, behaviorEvents: 0, byBehavior: {},
      durations: { known: 0, unknown: 0, totalS: 0, byBehavior: {} },
      recovery: { reported: {}, notSure: 0, notReported: 0 },
      triggers: { Dog: 0, Human: 0, Other: 0, none: 0 },
      distance: { reported: {}, notSure: 0, notReported: 0 },
      managed: { settled: 0, calmPasses: 0, continued: 0, afterUnknown: 0 },
      weekly: {},
    };
    const wk = ms => Math.floor(ms / (7 * 864e5));
    ws.forEach(w => {
      const W = res.weekly[wk(w.startMs)] || (res.weekly[wk(w.startMs)] = { walks: 0, encounters: 0, events: 0 });
      W.walks++;
      const events = (w.events || []).filter(evOk);
      const behEvents = events.filter(e => !isSuccess(e.key) && (beh === 'all' || e.key === beh));
      behEvents.forEach(e => {
        res.behaviorEvents++; W.events++;
        res.byBehavior[e.key] = (res.byBehavior[e.key] || 0) + 1;
        res.triggers[e.trigger || 'none']++;
        if (e.timed && e.timerStatus !== 'running') {
          const d = res.durations.byBehavior[e.key] || (res.durations.byBehavior[e.key] = { known: 0, unknown: 0, totalS: 0 });
          if (durationKnown(e)) { res.durations.known++; res.durations.totalS += e.duration; d.known++; d.totalS += e.duration; }
          else { res.durations.unknown++; d.unknown++; }
        }
      });
      const reviews = w.reviews || {};
      const subjects = [];
      (w.episodes || []).forEach(ep => {
        if (dog !== 'all' && ep.dog !== dog) return;
        const evs = (w.events || []).filter(e => e.episodeId === ep.id);
        if (beh !== 'all' && !evs.some(e => e.key === beh)) return;
        if (trig !== 'all') { const t = ep.trigger || (evs.length && evs.every(e => e.trigger === evs[0].trigger) ? evs[0].trigger : null); if ((trig === 'none' ? t : t !== trig)) return; }
        res.episodes++; subjects.push(reviews['ep:' + ep.id]);
      });
      events.filter(e => isReviewable(e.key) && !e.episodeId && (beh === 'all' || e.key === beh)).forEach(e => { res.standaloneEncounters++; subjects.push(reviews['ev:' + e.id]); });
      const calm = events.filter(e => isSuccess(e.key) && (beh === 'all' || e.key === beh)).length;
      res.calmPasses += calm; res.managed.calmPasses += calm;
      W.encounters += subjects.length + calm;
      subjects.forEach(r => {
        const a = (r && r.answers) || {};
        if (!a.after || a.after === 'not_sure') res.managed.afterUnknown++;
        else if (SETTLED.has(a.after)) res.managed.settled++;
        else if (a.after === 'continued' || a.after === 'stayed_worried') res.managed.continued++;
        else res.managed.afterUnknown++;
        if (!a.recovery) { if (SETTLED.has(a.after)) res.recovery.notReported++; } else if (a.recovery === 'not_sure') res.recovery.notSure++; else res.recovery.reported[a.recovery] = (res.recovery.reported[a.recovery] || 0) + 1;
        if (!a.distance) res.distance.notReported++; else if (a.distance === 'not_sure') res.distance.notSure++; else res.distance.reported[a.distance] = (res.distance.reported[a.distance] || 0) + 1;
      });
    });
    res.encounters = res.episodes + res.standaloneEncounters + res.calmPasses;
    return res;
  }

  /* ───────────── Training ideas (report card) ───────────── */
  // No ideas for guarding, fear, aggression, growling, snapping, showing teeth, trembling, freezing or retreating.
  const TRAIN_RULES = { pulling: ['heel', 'loose-practice'], reactivity: ['redirect', 'leaveit'], barking: ['redirect', 'leaveit'], lunging: ['redirect', 'leaveit'] };

  return {
    MODES, DEFAULT_MODE_EXISTING_USER, RECOMMENDED_MODE_NEW_USER, resolveMode, BEHAVIORS, MODE_ORDER, behaviorsForMode,
    isBehavior, isSuccess, isReviewable, isSerious,
    startTimed, endTimed, finalizeTimers, correctDuration, durationKnown,
    suggestEpisodes, suggestionKey, candidateDogs, confirmEpisode, episodeEvents, removeFromEpisode, addToEpisode, ungroupEpisode,
    episodeSpan, episodeTrigger, eventSummary,
    INDICATORS, INDICATOR, indicatorsFor,
    reviewQuestions, reviewStatus, SETTLED, RECOVERY, DISTANCE,
    interpret, CONTENT_VERSION, analytics, TRAIN_RULES,
  };
});
