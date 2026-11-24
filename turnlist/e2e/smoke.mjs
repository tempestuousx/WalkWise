// End-to-end smoke test of the core marketplace loop in demo mode, in a real
// browser at phone and desktop sizes. Run against `npm run preview`:
//   npm run build:demo && npx vite preview --port 4173 & npm run test:e2e
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const errors = [];
let step = 0;
const ok = (msg) => console.log(`  ✓ ${++step}. ${msg}`);
function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

const browser = await chromium.launch();
try {
  for (const [label, viewport] of [['desktop', { width: 1366, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    console.log(`\n${label}`);
    step = 0;
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
    page.on('dialog', (d) => d.accept());
    const signInAs = async (who) => {
      await page.goto(`${BASE}/signin`);
      await page.getByRole('button', { name: new RegExp(who) }).first().click();
      await page.waitForURL((u) => !u.pathname.startsWith('/signin'));
    };
    const noOverflow = async (where) => assert(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `no horizontal overflow on ${where}`);

    await page.goto(`${BASE}/demo-reset-check`);
    await page.evaluate(() => localStorage.clear());

    // Demo bar: one compact line, dismissible, restorable from the footer
    await page.goto(BASE);
    const bar = page.getByRole('region', { name: 'Demo controls' });
    const box = await bar.boundingBox();
    assert(box && box.height <= 44, `demo bar is one line (${box?.height}px)`);
    await page.getByRole('button', { name: 'Hide demo bar' }).click();
    await page.reload();
    assert((await bar.count()) === 0, 'demo bar stays hidden after reload');
    await page.getByRole('button', { name: 'Show demo controls' }).click();
    await bar.waitFor();
    ok('demo bar is compact, dismissible, and restorable');

    // Public discovery
    await page.goto(BASE);
    await page.getByRole('heading', { name: 'Local jobs. Real opportunities.' }).waitFor();
    await noOverflow('home');
    await page.getByRole('button', { name: /^Painting/ }).click();
    await page.getByRole('heading', { name: 'Painting jobs' }).waitFor();
    ok('category strip filters the home feed');
    await page.getByPlaceholder('What kind of work?').first().fill('cleaning');
    await page.getByPlaceholder('Location or ZIP code').first().fill('Henderson');
    await page.getByRole('button', { name: 'Search Jobs' }).first().click();
    await page.waitForURL(/\/jobs\?q=cleaning&loc=Henderson/);
    const count = await page.locator('#results-heading').innerText();
    assert(/\d+ jobs? accepting applications/.test(count), 'result count shown');
    assert(await page.getByRole('button', { name: /Remove filter: Henderson/ }).isVisible(), 'active filter chip shown');
    await noOverflow('find work');
    ok(`search with location (${count.trim()})`);

    // Availability and freshness on the job page
    await page.goto(`${BASE}/jobs/job_1`);
    await page.getByText('Accepting applications', { exact: true }).first().waitFor();
    await page.getByText(/Applications close at the end of/).waitFor();
    await page.getByText(/^Posted .* ago, /).waitFor();
    await page.goto(`${BASE}/jobs/job_15`);
    await page.getByText(/Not accepting applications: filled/).waitFor();
    ok('job page states whether it is accepting applications, when it closes, and when it was posted');

    // Employer: quick post
    await signInAs('Property manager');
    await page.goto(`${BASE}/employer/post`);
    await page.getByRole('button', { name: 'Post Job' }).click();
    await page.getByText(/Fix the \d+ highlighted fields/).waitFor();
    ok('empty quick post shows validation');
    const title = `E2E turnover clean ${label}`;
    await page.getByLabel('Job title').fill(title);
    await page.getByLabel('Category').selectOption({ label: 'Apartment turnover cleaning' });
    await page.getByLabel('ZIP code').fill('89117');
    await page.getByLabel('Description').fill('One bedroom turnover, standard clean, unit is empty and ready.');
    await page.getByPlaceholder('Amount').fill('160');
    await page.getByRole('button', { name: 'Post Job' }).click();
    await page.waitForURL(/\/employer\/listings\/job_/);
    const jobUrl = page.url();
    const jobId = jobUrl.split('/').pop();
    await page.getByRole('heading', { name: title }).waitFor();
    ok('quick post publishes and opens the listing');

    // Contractor: matches come before everything else
    await signInAs('Contractor');
    await page.goto(`${BASE}/jobs`);
    const matchesH = page.getByRole('heading', { name: /^Matches for you/ });
    const othersH = page.getByRole('heading', { name: /^Other available jobs/ });
    await matchesH.waitFor();
    assert((await matchesH.boundingBox()).y < (await othersH.boundingBox()).y, 'matches are listed above other jobs');
    await page.goto(`${BASE}/jobs?matches=1`);
    await matchesH.waitFor();
    assert((await othersH.count()) === 0, 'matches-only hides other jobs');
    await page.goto(BASE);
    await page.getByRole('heading', { name: 'Matches for you' }).waitFor();
    ok('contractor sees profile matches first on Find Work and home');

    // Contractor: find, apply
    await page.goto(`${BASE}/jobs/${jobId}`);
    await page.getByRole('button', { name: 'Apply for Job' }).click();
    await page.getByRole('button', { name: 'Send application' }).click();
    await page.getByText(/20\+ characters/).waitFor();
    ok('application validates the message');
    await page.getByLabel('Message to the business').fill('I can do this tomorrow morning and bring all of my own supplies.');
    await page.getByRole('button', { name: 'Send application' }).click();
    await page.getByText('Sent. The business has not opened it yet.').waitFor();
    ok('contractor applies and sees status "Submitted"');

    // Employer: review and select
    await signInAs('Property manager');
    await page.goto(jobUrl);
    await page.getByRole('heading', { name: /Applicants/ }).waitFor();
    await page.getByRole('button', { name: 'Shortlist' }).first().click();
    await page.getByText('Marco Ruiz shortlisted').waitFor();
    await page.getByRole('button', { name: 'Select', exact: true }).first().click();
    await page.getByRole('button', { name: 'Select and fill job' }).click();
    await page.getByText(/selected\. The job is now filled/).waitFor();
    await page.getByRole('button', { name: 'Mark completed' }).waitFor();
    ok('employer shortlists and selects; job shows as filled');

    // Contractor sees selection and notification
    await signInAs('Contractor');
    await page.goto(`${BASE}/contractor/applications`);
    await page.getByRole('tab', { name: /Selected/ }).click();
    await page.getByRole('link', { name: title }).waitFor();
    await page.getByRole('button', { name: /Notifications, \d+ unread/ }).click();
    await page.getByText('You were selected').first().waitFor();
    await noOverflow('applications');
    ok('contractor sees "Selected" and a notification');

    // Employer completes; job leaves the public feed
    await signInAs('Property manager');
    await page.goto(jobUrl);
    await page.getByRole('button', { name: 'Mark completed' }).click();
    await page.getByRole('button', { name: /Review contractor/ }).waitFor();
    await page.goto(`${BASE}/jobs?q=${encodeURIComponent(title)}`);
    await page.getByText('No jobs match these filters').waitFor();
    ok('completed job is no longer listed as available');

    // Admin approves a pending listing
    await signInAs('Administrator');
    await page.goto(`${BASE}/admin/listings`);
    await page.getByRole('button', { name: 'Approve' }).first().click();
    await page.getByText('Listing approved and published').waitFor();
    ok('admin approves a listing from the review queue');

    await ctx.close();
  }
  if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`);
  console.log('\nall e2e checks passed');
} finally {
  await browser.close();
}
