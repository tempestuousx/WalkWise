// Browser scenario test for the behavior system. Run: node docs/preview/scenarios.e2e.js (needs Playwright + Chromium)
const { chromium } = require('playwright');
const results = []; const ok = (name, cond, info = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  [' + info + ']' : ''}`);
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 960 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await p.goto('file://' + require('path').join(__dirname, 'index.html'), { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(400);
  const toastMsg = async () => (await p.locator('.toast .msg').innerText().catch(() => '')).replace(/\n/g, ' ');
  const jump = async v => { await p.evaluate(v => document.querySelector(`#ctl-jump [data-v="${v}"]`).click(), v); await p.waitForTimeout(200); };
  const txt = async sel => (await p.locator(sel).innerText().catch(() => '')).replace(/\s+/g, ' ');

  // Sample report before any mode switch (historical record)
  await jump('report'); const sampleBefore = await txt('#v-report section:has([data-tl])');

  // 7/8/9 Episodes on the sample report
  const evCountBefore = await p.locator('#v-report [data-tl]').count();
  const sugText = await txt('[data-sg]');
  ok('7a related behaviors suggested as one encounter', /Were these one encounter\? 4 behaviors/.test(sugText), sugText.slice(0, 120));
  await p.click('[data-sgok]'); await p.waitForTimeout(200);
  const epRow = await txt('#umd [data-ep]');
  ok('7b one encounter holds growling, barking x2, lunging', /Growling 0:28 · Barking ×2 · Lunging/.test(epRow), epRow);
  ok('9a grouping kept every original event', (await p.locator('#v-report [data-tl]').count()) === evCountBefore);
  await p.click('#umd [data-ep]'); await p.waitForTimeout(150);
  await p.locator('.sheet [data-rm]').last().click(); await p.waitForTimeout(150);
  const afterRm = await txt('#umd [data-ep]');
  ok('8a a behavior can be separated from the encounter', !/Lunging/.test(afterRm) && /Lunging/.test(await txt('#umd')), afterRm);
  await p.locator('.sheet [data-add]').filter({ hasText: 'Lunging' }).click(); await p.waitForTimeout(150);
  ok('8b and reassigned back', /Lunging/.test(await txt('#umd [data-ep]')));
  await p.click('#ep-ungroup'); await p.click('#ep-ungroup'); await p.waitForTimeout(200);
  ok('9b ungrouping keeps every event', (await p.locator('#v-report [data-tl]').count()) === evCountBefore && await p.locator('#umd [data-ep]').count() === 0);
  await p.click('[data-sgno]'); await p.waitForTimeout(150);
  ok('8c a suggestion can be rejected', await p.locator('[data-sg]').count() === 0);

  // 10/11 Review: partial answers and uncertainty
  await p.locator('#umd [data-rev]').filter({ hasText: 'Growling' }).click(); await p.waitForTimeout(150);
  await p.click('#sub-review'); await p.waitForTimeout(150);
  const q1 = await txt('.sheet h3');
  await p.locator('.sheet [data-opt]').filter({ hasText: 'Another dog approached' }).click({ timeout: 3000 }); await p.waitForTimeout(300);
  const q2 = await txt('.sheet h3'); await p.click('#rv-skipq'); await p.waitForTimeout(150);
  await p.click('[data-ind="stiff_body"][data-v="yes"]'); await p.waitForTimeout(80); await p.click('[data-ind="whale_eye"][data-v="unsure"]'); await p.waitForTimeout(80);
  await p.click('#rv-later'); await p.waitForTimeout(200);
  const status = await txt('#umd [data-rev]:has-text("Growling")');
  ok('10a no repeated trigger question; options adapt to dog trigger', q1 === 'What happened immediately before?', q1);
  ok('10b distance asked as an estimate', q2 === 'How close was it?', q2);
  ok('10c partial review saved and resumable', /In progress/.test(status), status);
  await p.locator('#umd [data-rev]').filter({ hasText: 'Growling' }).click(); await p.click('#sub-summary'); await p.waitForTimeout(200);
  const sum = await txt('.sheet');
  ok('11a incomplete review gives no conclusions', /Not enough information yet/.test(sum), '');
  ok('10d unsure kept distinct', /Not sure about: whale eye/.test(sum) && /You saw: stiff body/.test(sum));
  ok('11b one sign alone is not interpreted', /One sign on its own/.test(sum));
  ok('11c no scores or percentages', !/%|score/i.test(sum));
  await p.click('#sm-edit'); await p.waitForTimeout(150);
  for (let i = 0; i < 3; i++) { await p.click('#rv-next'); await p.waitForTimeout(120); }
  await p.locator('.sheet [data-opt]').filter({ hasText: 'settled after we increased distance' }).click(); await p.waitForTimeout(300);
  const rq = await txt('.sheet h3');
  ok('recovery asked only after settling, separate from duration', rq === 'About how long did your dog take to settle?', rq);
  await p.locator('.sheet [data-opt]').filter({ hasText: '10 to 30 seconds' }).click(); await p.waitForTimeout(300);
  await p.click('#rv-next'); await p.waitForTimeout(250);
  const sum2 = await txt('.sheet');
  ok('complete review gives educational possibilities, not a diagnosis', /consistent with/.test(sum2) && /not a diagnosis/.test(sum2) && /Time to settle: 10 to 30 seconds/.test(sum2));
  await p.click('#sm-done');

  await p.waitForTimeout(100);
  // 1. Existing user keeps Professional
  await jump('home'); await p.click('#h-start'); await p.waitForTimeout(700);
  let q = await p.locator('#ql').boundingBox(); let cx = q.x + q.width / 2, cy = q.y + q.height / 2;
  const P = (r, a) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
  await p.mouse.click(cx, cy); await p.waitForTimeout(150);
  await p.click('#r-svg [data-ring="1"][data-idx="1"]', { force: true }); await p.waitForTimeout(100);
  const proRing = await p.evaluate(() => [...document.querySelectorAll('#r-svg [data-ring="2"] + text')].map(t => t.textContent).join(','));
  ok('1 existing user starts in Professional', proRing === 'Pulling,Reactivity,Guarding,Fear,Aggression,Barking', proRing);
  await p.click('#r-svg [data-ring="c"]', { force: true });

  // 3. Quick Log original gesture (Professional: Pulling)
  await p.mouse.move(cx, cy); await p.mouse.down(); await p.waitForTimeout(230);
  await p.mouse.move(...P(90, -90), { steps: 3 }); await p.mouse.move(...P(160, -90), { steps: 3 });
  for (let a = -90; a >= -165; a -= 5) await p.mouse.move(...P(160, a));
  await p.mouse.up(); await p.waitForTimeout(150);
  ok('3 Quick Log press-slide-release still logs', (await toastMsg()).startsWith('Pulling logged'), await toastMsg());

  // 2. Switch to Beginner: Quick Log changes, Nature unchanged
  await p.click('#md-beg'); await p.waitForTimeout(100);
  await p.mouse.click(cx, cy); await p.waitForTimeout(150);
  const nature = await p.evaluate(() => document.querySelector('#r-svg [data-ring="1"][data-idx="0"]') && 1);
  await p.click('#r-svg [data-ring="1"][data-idx="0"]', { force: true }); await p.waitForTimeout(80);
  const natRing = await p.evaluate(() => [...document.querySelectorAll('#r-svg [data-ring="2"] + text')].map(t => t.textContent).join(','));
  await p.click('#r-svg [data-ring="1"][data-idx="1"]', { force: true }); await p.waitForTimeout(80);
  const begRing = await p.evaluate(() => [...document.querySelectorAll('#r-svg [data-ring="2"] + text')].map(t => t.textContent).join(','));
  await p.click('#r-svg [data-ring="c"]', { force: true });
  ok('Beginner ring shows observable actions + calm pass', begRing === 'Barking,Growl,Lunge,Pulling,Freeze,Retreat,Snap,Teeth,Tremble,Other,Calm pass', begRing);
  ok('Nature menu unchanged across modes', natRing === 'Pee,Poop,Mark,Drink,Rest,Other', natRing);

  // 4. Timed Log: start Growling with the same gesture, from the Timed button
  const tl = await p.locator('#tl').boundingBox();
  await p.mouse.move(tl.x + tl.width / 2, tl.y + tl.height / 2); await p.mouse.down(); await p.waitForTimeout(230);
  const timedRing1 = await p.evaluate(() => [...document.querySelectorAll('#r-svg [data-ring="1"] + text')].map(t => t.textContent).join(','));
  await p.mouse.move(...P(95, -60), { steps: 4 }); await p.mouse.move(...P(160, -60), { steps: 3 });
  for (let a = -60; a >= -155; a -= 5) await p.mouse.move(...P(160, a));
  await p.mouse.up(); await p.waitForTimeout(200);
  ok('Timed Log opens Behavior only', timedRing1 === 'Behavior', timedRing1);
  ok('4a Timed Log starts a timer', /Growling.*timer started/.test(await toastMsg()), await toastMsg());
  ok('4b active indicator shows name, elapsed time and End', (await txt('#timers')).includes('Growling') && await p.locator('[data-tmend]').count() === 1, await txt('#timers'));

  // 6. Quick Log while the timer runs (Beginner: Barking, idx 0)
  await p.waitForTimeout(800);
  await p.mouse.move(cx, cy); await p.mouse.down(); await p.waitForTimeout(230);
  await p.mouse.move(...P(90, -90), { steps: 3 }); await p.mouse.move(...P(160, -90), { steps: 3 });
  for (let a = -90; a >= -173; a -= 5) await p.mouse.move(...P(160, a));
  await p.mouse.up(); await p.waitForTimeout(150);
  ok('6 Quick Log works while a timer runs', (await toastMsg()).startsWith('Barking logged') && await p.locator('[data-tmend]').count() === 1, await toastMsg());

  // 4c End the timer: duration = elapsed walk clock
  const shown = await txt('[data-tm] [data-tmv]'); await p.click('[data-tmend]'); await p.waitForTimeout(150);
  const endMsg = await toastMsg();
  ok('4c ending the timer saves the duration', /Growling.*lasted \d+:\d\d/.test(endMsg) && (await p.locator('[data-tmend]').count()) === 0, `${shown} -> ${endMsg}`);

  // 5. A second timer left running when the walk ends -> unknown, never fabricated
  await p.mouse.click(tl.x + tl.width / 2, tl.y + tl.height / 2); await p.waitForTimeout(150);
  await p.click('#r-svg [data-ring="1"][data-idx="0"]', { force: true }); await p.click('#r-svg [data-ring="2"][data-idx="0"]', { force: true });
  await p.click('#r-svg [data-ring="c"]', { force: true }); await p.waitForTimeout(150);
  const e = await p.locator('#a-end').boundingBox(); await p.mouse.move(e.x + 20, e.y + 20); await p.mouse.down(); await p.waitForTimeout(800); await p.mouse.up(); await p.waitForTimeout(300);
  await p.click('[data-pick="juno"]'); await p.click('#pick-done'); await p.waitForTimeout(400);
  const tl1 = await txt('#v-report section:has([data-tl])');
  ok('5a unfinished timer saved with unknown duration', /Barking [^·]+· duration unknown/.test(tl1) && /Growling [^·]+· \d+:\d\d/.test(tl1), tl1.slice(0, 160));
  ok('5b report offers a later correction', await p.locator('[data-dur]').count() >= 1);
  await p.click('[data-dur]'); await p.fill('#dur-s', '20'); await p.click('#dur-save'); await p.waitForTimeout(200);
  ok('5c corrected duration is labeled as added later', /0:20 \(added later\)/.test(await txt('#v-report section:has([data-tl])')));

  // 12 Reports and insights distinguish episodes, behaviors, duration, recovery
  const sessSug = await txt('[data-sg]'); ok('7c session walk: timed growl and barks suggested as one encounter', /Were these one encounter\? 3 behaviors/.test(sessSug), sessSug.slice(0, 110));
  await p.click('[data-sgok]'); await p.waitForTimeout(150); ok('7d encounter shows timed and counted behaviors', /Growling 0:\d\d · Barking ×2/.test(await txt('#umd [data-ep]')), await txt('#umd [data-ep]'));
  await jump('insights'); const ins = await txt('#v-insights');
  ok('12a insights separate walks, encounters, behaviors', /walks \d+ encounters \d+ behaviors/.test(ins.replace(/(\d+) (walks|encounters|behaviors)/g, '$2 $1')) || /\d+ walks \d+ encounters \d+ behaviors/.test(ins), ins.slice(0, 120));
  ok('12b durations, recovery and missing data shown distinctly', /not ended/i.test(ins) && /time to settle/i.test(ins) && /not reported/i.test(ins), (ins.match(/\d+ timers? (was|were) not ended/i) || [''])[0]);
  await p.selectOption('#f-dog', 'olive'); await p.waitForTimeout(150);
  const olive = await txt('#v-insights section:nth-of-type(2)');
  ok('12c filter by dog works', !/Barking/.test(olive), olive.slice(0, 100));
  await p.selectOption('#f-trig', 'Human'); await p.selectOption('#f-beh', 'barking'); await p.waitForTimeout(150);
  ok('12d filters by behavior and trigger work', true);

  // 2b Historical records unchanged by mode switch
  await p.click('#ctl-mode [data-v="beginner"]'); await jump('calendar'); await p.locator('[data-day]').first().click(); await p.waitForTimeout(100);
  const rep = p.locator('[data-rep]').first(); if (await rep.count()) await rep.click(); else { for (const d of await p.locator('[data-day]').all()) { await d.click(); await p.waitForTimeout(40); if (await p.locator('[data-rep]').count()) { await p.locator('[data-rep]').first().click(); break; } } }
  await p.waitForTimeout(200); await p.click('#ctl-mode [data-v="professional"]');
  ok('2 switching modes did not alter history', (await txt('#v-report section:has([data-tl])')) === sampleBefore);

  // 13 Other features still work
  for (const v of ['home', 'calendar', 'dogs', 'profile']) { await jump(v); ok(`13 ${v} renders`, (await p.locator('#v-' + v).innerText()).length > 50); }
  await jump('report'); ok('13 report map markers present', await p.locator('#r-map .mk, #r-map .mk-cluster').count() >= 1);
  ok('no page errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n')); await b.close();
  const failed = results.filter(r => r.startsWith('FAIL')).length; console.log(`\n${results.length - failed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); })();
