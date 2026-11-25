/**
 * End-to-end scenarios against the real backend, driven through the UI in Chrome.
 *
 * Needs: the backend running (infra\scripts\start-all.cmd in the backend repo) and
 * the UI dev server (npm run dev). Then: npm run test:e2e [-- scenario-name ...]
 *
 * Env: BASE_URL (default http://localhost:5173), CHROME_PATH, HEADED=1.
 * Screenshots of each scenario's final state go to e2e/screenshots/.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === 'win32'
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : '/usr/bin/google-chrome');
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Check extends Error {}
function expect(cond, msg) {
  if (!cond) throw new Check(msg);
}

async function mock(method, path, body) {
  const res = await fetch(`${BASE}/mock-admin${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`mock-admin ${method} ${path} -> ${res.status}`);
}

/** Page helpers. Waits poll on an interval: rAF polling stalls in background headless tabs. */
function helpers(page) {
  const text = (sel) => page.$eval(sel, (e) => e.textContent?.trim() ?? '').catch(() => '');
  const waitFor = (fn, arg, timeout = 15000) => page.waitForFunction(fn, { polling: 250, timeout }, arg);
  const waitText = (sel, re, timeout) =>
    waitFor(
      ([s, src]) => new RegExp(src, 'i').test(document.querySelector(s)?.textContent ?? ''),
      [sel, re.source],
      timeout,
    ).catch(async () => {
      throw new Check(`timed out waiting for ${sel} to match ${re}; it says: "${await text(sel)}"`);
    });
  /** Clicks the first visible element matching `sel` whose text contains `label`. */
  const clickText = async (sel, label, timeout = 15000) => {
    const handle = await waitFor(
      ([s, l]) =>
        [...document.querySelectorAll(s)].find(
          (e) => e.textContent?.includes(l) && e.getClientRects().length > 0 && !e.disabled,
        ),
      [sel, label],
      timeout,
    ).catch(() => {
      throw new Check(`no clickable ${sel} with text "${label}"`);
    });
    await handle.asElement().click();
  };
  const exists = async (sel, label) =>
    page.evaluate(([s, l]) => [...document.querySelectorAll(s)].some((e) => !l || e.textContent?.includes(l)), [sel, label]);
  return { text, waitFor, waitText, clickText, exists };
}

/** Issues a card through the New card page and returns the request URL. */
async function issue(page, h, { tenant = 'bank-a', scenario = 'approved' } = {}) {
  await page.goto(`${BASE}/${tenant}/new?scenario=${scenario}`, { waitUntil: 'networkidle0' });
  await page.click('button[type=submit]');
  await h.waitFor(() => location.pathname.includes('/requests/'), null, 10000);
  return page.url();
}

const scenarios = {
  async 'happy-path'(page, h) {
    await issue(page, h);
    await h.waitText('.hero-title', /card is active/);
    expect((await page.$$('.tl-state-done')).length === 7, 'all 7 steps should be done');
  },

  async 'review-approve'(page, h) {
    await issue(page, h, { scenario: 'review' });
    await h.waitText('.hero-title', /waiting for your decision/);
    expect(await h.exists('.timeline .badge', 'Waiting for decision'), 'KYC step should show it is waiting');
    await h.clickText('.review button', 'Approve');
    await h.waitText('.hero-title', /card is active/);
  },

  async 'review-reject'(page, h) {
    await issue(page, h, { scenario: 'review' });
    await h.waitText('.hero-title', /waiting for your decision/);
    await h.clickText('.review button', 'Reject');
    await h.waitText('.hero-title', /request rejected/);
    await h.waitText('.hero-text', /operator rejected/);
  },

  async 'kyc-rejected-try-again'(page, h) {
    await issue(page, h, { scenario: 'rejected' });
    await h.waitText('.hero-title', /request rejected/);
    await h.waitText('.hero-text', /failed the identity check/);
    await h.clickText('.hero-actions a', 'Try again with these details');
    await h.waitText('.pick.selected', /approved/);
    const ref = await page.$eval('#customerRef', (e) => e.value);
    expect(ref.startsWith('customer-'), `customer should be switched back to an approvable one, got ${ref}`);
  },

  async 'over-limit'(page, h) {
    await page.goto(`${BASE}/bank-a/new?scenario=over-limit`, { waitUntil: 'networkidle0' });
    await h.waitText('.expect', /limit is too high/);
    await page.click('button[type=submit]');
    await h.waitText('.hero-title', /request rejected/);
    await h.waitText('.hero-text', /outside what policy allows/);
  },

  async 'confirmation-timeout'(page, h) {
    await mock('PUT', '/callbacks/bank-a', { mode: 'NEVER' });
    await issue(page, h);
    await h.waitText('.hero-title', /waiting for your decision/, 25000);
    await h.waitText('.hero-text', /didn't confirm/);
    await h.clickText('.review button', 'Approve');
    await h.waitText('.hero-title', /card is active/);
  },

  async 'retries-exhausted-retry'(page, h) {
    await mock('PUT', '/failures/bank-a/processor/createCard', { mode: 'OFFLINE', times: -1 });
    await issue(page, h);
    await h.waitText('.hero-title', /waiting for your decision/, 90000);
    await h.waitText('.hero-text', /"Create card" kept failing/);
    await mock('POST', '/reset'); // processor back online
    await h.clickText('.review button', 'Retry the step');
    await h.waitText('.hero-title', /card is active/, 30000);
  },

  async 'retries-exhausted-cancel'(page, h) {
    await mock('PUT', '/failures/bank-a/processor/createCard', { mode: 'OFFLINE', times: -1 });
    await issue(page, h);
    await h.waitText('.hero-title', /waiting for your decision/, 90000);
    await h.clickText('.review button', 'Cancel and undo');
    await h.waitText('.hero-title', /request cancelled/, 20000);
  },

  async 'activation-declined-rollback'(page, h) {
    await mock('PUT', '/failures/bank-a/processor/activateCard', { mode: 'BUSINESS_ERROR', times: -1, code: 'ACTIVATION_DECLINED' });
    await issue(page, h);
    await h.waitText('.hero-title', /request rejected/);
    await h.waitText('.hero-text', /declined to activate.*undone/);
    expect(await h.exists('.tl-divider', 'Undoing'), 'timeline should show the rollback section');
    expect((await page.$$('.tl-state-compensated')).length >= 2, 'undo steps should be marked undone');
  },

  async 'compensation-failed'(page, h) {
    await mock('PUT', '/failures/bank-a/processor/activateCard', { mode: 'BUSINESS_ERROR', times: -1, code: 'ACTIVATION_DECLINED' });
    await mock('PUT', '/failures/bank-a/processor/resetLimits', { mode: 'BUSINESS_ERROR', times: -1, code: 'RESET_REFUSED' });
    await issue(page, h);
    await h.waitText('.hero-title', /needs manual cleanup/, 30000);
    await page.goto(`${BASE}/bank-a`, { waitUntil: 'networkidle0' });
    await h.waitText('[data-tour=attention]', /manual cleanup|Undoing the completed steps failed/);
  },

  async 'cancel-request'(page, h) {
    await mock('PUT', '/callbacks/bank-a', { mode: 'DELAY', delayMs: 15000 });
    await issue(page, h);
    await h.waitText('.hero-text', /waiting for the processor/);
    await h.clickText('[data-tour=actions] button', 'Cancel request');
    await h.clickText('.panel-danger button', 'Cancel request');
    await h.waitText('.hero-title', /request cancelled/, 20000);
    expect(await h.exists('.timeline .badge', 'Stopped'), 'the interrupted step should show as stopped');
    expect(!(await h.exists('.timeline .badge', 'Waiting for processor')), 'nothing should look live on a cancelled request');
  },

  async 'reissue-and-guard'(page, h) {
    const original = await issue(page, h);
    await h.waitText('.hero-title', /card is active/);
    await h.clickText('[data-tour=actions] button', 'Reissue this card');
    await h.clickText('.segmented button', 'Stolen');
    await h.clickText('form.panel button[type=submit]', 'Reissue card');
    await h.waitFor(() => location.pathname.includes('/reissues/'), null, 10000);
    await h.waitText('.hero-title', /replacement is active/, 20000);
    await page.goto(original, { waitUntil: 'networkidle0' });
    await h.waitText('.hero-title', /has been replaced/);
    expect(!(await h.exists('button', 'Reissue this card')), 'a replaced card must not offer another reissue');
  },

  async 'bank-b'(page, h) {
    await page.goto(`${BASE}/bank-a/new`, { waitUntil: 'networkidle0' });
    await page.select('[data-tour=bank] select', 'bank-b');
    await h.waitFor(() => location.pathname === '/bank-b/new');
    await page.click('button[type=submit]');
    await h.waitFor(() => location.pathname.startsWith('/bank-b/requests/'), null, 10000);
    await h.waitText('.hero-title', /card is active/);
  },

  async 'simulator-state'(page, h) {
    await page.goto(`${BASE}/bank-a/demo`, { waitUntil: 'networkidle0' });
    await h.waitText('[data-tour=sim-active]', /no scenarios are on/);
    await h.clickText('.scenario', 'Processor offline');
    await h.waitText('[data-tour=sim-active]', /Processor offline.*every call/);
    await page.reload({ waitUntil: 'networkidle0' });
    await h.waitText('[data-tour=sim-active]', /Processor offline/);
    await page.goto(`${BASE}/bank-a`, { waitUntil: 'networkidle0' });
    await h.waitText('.sim-banner', /Processor offline/);
    await page.goto(`${BASE}/bank-a/demo`, { waitUntil: 'networkidle0' });
    await h.clickText('.active-rules button', 'Switch off');
    await h.waitText('[data-tour=sim-active]', /no scenarios are on/);

    // A "fails twice" rule disappears by itself once used up.
    await h.clickText('.scenario', 'Fails twice');
    await h.waitText('[data-tour=sim-active]', /2 more call/);
    await issue(page, h);
    await h.waitText('.hero-title', /card is active/, 30000);
    // Counters are polled every 4 s, so allow a moment for the banner to clear.
    await h.waitFor(() => !document.querySelector('.sim-banner'), null, 12000).catch(() => {
      throw new Check('banner should clear once the rule is used up');
    });
  },

  async reconciliation(page, h) {
    await mock('POST', '/cards/bank-a/orphan');
    await page.goto(`${BASE}/bank-a/reconciliation`, { waitUntil: 'networkidle0' });
    await h.clickText('button', 'Start reconciliation');
    await h.waitFor(() => location.pathname.includes('/reconciliation/'), null, 10000);
    await h.waitText('.stats', /Discrepancies/, 20000);
    expect(await h.exists('.badge', 'Unknown to platform'), 'the orphan card should be reported');
  },
};

/** The guided tours run in a context without the "seen" flags. */
async function tours(page, h) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  for (let i = 0; i < 12; i++) {
    await page.waitForSelector('.tour-pop h3', { timeout: 8000 });
    await sleep(450);
    expect((await h.text('.tour-step')).includes(`${i + 1} of 12`), `main tour should be on step ${i + 1}`);
    await page.click('.tour-actions .btn-primary');
    await sleep(150);
  }
  await sleep(400);
  expect(!(await page.$('.tour')), 'main tour should close after the last step');
  await issue(page, h, { scenario: 'review' });
  // The request tour starts shortly after the page loads.
  await page.waitForSelector('.tour', { timeout: 8000 }).catch(() => {
    throw new Check('the request tour should start on the first request page');
  });
  let steps = 0;
  while (await page.$('.tour')) {
    await page.waitForSelector('.tour-pop h3', { timeout: 8000 });
    await sleep(450);
    steps++;
    await page.click('.tour-actions .btn-primary');
    await sleep(200);
  }
  expect(steps === 5, `request tour should have 5 steps with a review pending, had ${steps}`);
}

async function main() {
  const only = process.argv.slice(2);
  const all = { tours, ...scenarios };
  const names = only.length ? only : Object.keys(all);
  const unknown = names.filter((n) => !all[n]);
  if (unknown.length) {
    console.error(`Unknown scenario(s): ${unknown.join(', ')}\nAvailable: ${Object.keys(all).join(', ')}`);
    process.exit(2);
  }

  try {
    await fetch(`${BASE}/mock-admin/counters/bank-a`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
    });
  } catch {
    console.error(`Can't reach the UI and mock admin at ${BASE}. Start the backend and \`npm run dev\` first.`);
    process.exit(2);
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: !process.env.HEADED,
    args: ['--window-size=1366,900'],
  });
  const results = [];
  for (const name of names) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    if (name !== 'tours') {
      await page.evaluateOnNewDocument(() => {
        localStorage.setItem('card-console.pref.tour.main.seen', '1');
        localStorage.setItem('card-console.pref.tour.request.seen', '1');
      });
    }
    const h = helpers(page);
    const started = Date.now();
    process.stdout.write(`  ${name} … `);
    try {
      await mock('POST', '/reset');
      await all[name](page, h);
      expect(errors.length === 0, `page errors: ${errors.join('; ')}`);
      results.push({ name, ok: true });
      console.log(`ok (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    } catch (e) {
      results.push({ name, ok: false });
      console.log(`FAILED\n      ${e instanceof Check ? e.message : e.stack}`);
    } finally {
      await page.screenshot({ path: join(SHOTS, `${name}.png`) }).catch(() => {});
      await context.close();
    }
  }
  await mock('POST', '/reset').catch(() => {});
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Screenshots: ${SHOTS}`);
  process.exit(failed.length ? 1 : 0);
}

main();
