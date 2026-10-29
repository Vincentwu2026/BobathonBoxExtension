// End-to-end check of the web UI in a real (headless) Chrome.
//
//   Prereqs: API running (npm run web-api in the repo root) and `npm run dev` here.
//   Run:     node e2e/e2e.mjs
//
// Needs puppeteer-core, which is intentionally NOT a dependency of the app:
//   npm install --no-save puppeteer-core
//
// Set CHROME_PATH if Chrome is not in the default macOS location.

import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.UI_URL || 'http://127.0.0.1:5173';
const OUT = fileURLToPath(new URL('./screenshots', import.meta.url));

const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + e.message));

const text = () => page.evaluate(() => document.body.innerText);
const clickText = async (sel, label) => {
  const handle = await page.evaluateHandle((s, l) => [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(l)), sel, label);
  const el = handle.asElement();
  if (!el) throw new Error(`no ${sel} containing "${label}"`);
  await el.click();
};
const settle = (ms = 700) => new Promise((r) => setTimeout(r, ms));
const run = async (name, fn) => {
  try { await fn(); } catch (e) { check(`${name} (script error)`, false, e.message); }
};

// ---------- Search (demo)
await page.goto(`${BASE}/search`, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
let t = await text();
check('header + title render', t.includes('Box Productivity Suite'));
check('defaults to DEMO mode (works with no credentials)', await page.$eval('[aria-pressed="true"]', (e) => e.textContent.includes('DEMO')));
check('all 5 nav items', ['Search', 'Folder Explorer', 'Retention Center', 'Audit Logs', 'System Status'].every((n) => t.includes(n)));

for (const [q, expectName] of [['revenue', 'Revenue'], ['ARR', 'ARR_Waterfall'], ['mainframe', 'Mainframe'], ['compliance', 'Compliance'], ['AI', 'AI_Governance'], ['customer escalation', 'Customer_Escalation']]) {
  await run(`search ${q}`, async () => {
    await clickText('button', q); await settle();
    t = await text();
    const rows = await page.$$eval('tbody tr', (r) => r.length);
    check(`search "${q}"`, rows > 0 && t.includes(expectName), `${rows} rows`);
  });
}
await page.screenshot({ path: `${OUT}/1-search.png` });

await run('detail panel', async () => {
  await clickText('table button', 'Customer_Escalation_Log'); await settle(300);
  t = await text();
  check('document panel: owner / collaborators / retention', t.includes('sofia.alvarez@') && t.toLowerCase().includes('collaborators (2)') && t.includes('Retention:'));
  const marks = await page.$$eval('mark', (m) => m.length);
  check('snippet highlighting is real <mark> elements', marks > 0, `${marks} marks`);
  await page.screenshot({ path: `${OUT}/2-search-detail.png` });
});

// ---------- Explorer (demo)
await run('explorer demo', async () => {
  await clickText('a', 'Folder Explorer'); await settle(300);
  check('Connect Folder disabled in demo mode', await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Connect Folder')).disabled));
  await clickText('button', 'Load Demo Folder'); await settle();
  t = await text();
  check('demo tree shows all six departments', ['Finance', 'HR', 'Sales', 'Mainframe Modernization', 'Customer Success', 'AI Governance'].every((d) => t.includes(d)));
  check('tree reports 17 files', t.includes('17 files'));
  await page.screenshot({ path: `${OUT}/3-explorer.png` });
});

// ---------- Retention (demo)
await run('retention', async () => {
  await clickText('a', 'Retention Center'); await settle();
  await clickText('li button', 'FY26_Q4_Revenue'); await settle(300);
  t = await text();
  check('retention: Protected TRUE + active collaborators reason', t.includes('TRUE') && t.includes('Active collaborators'));
  await clickText('button', 'Attempt Delete'); await settle();
  t = await text();
  check('delete blocked banner', t.includes('Deletion Blocked') && t.includes('Active collaborators detected'));
  await page.screenshot({ path: `${OUT}/4-retention-blocked.png` });
  await clickText('li button', 'Scratch_Pipeline'); await settle(300);
  await clickText('button', 'Attempt Delete'); await settle();
  t = await text();
  check('delete allowed banner (unprotected file)', t.includes('Deletion Allowed') && t.includes('not deleted'));
  await clickText('li button', 'Board_Minutes'); await settle(300);
  t = await text();
  check('do_not_delete marker file shows tag reason', t.includes('do_not_delete tag') && t.includes('Yes'));
});

// ---------- Audit
await run('audit', async () => {
  await clickText('a', 'Audit Logs'); await settle(900);
  t = await text();
  check('audit shows attempts just made', t.includes('Scratch_Pipeline_Sync_Notes.txt') && t.includes('Allowed'));
  await clickText('button', 'Blocked'); await settle(300);
  const rowsB = await page.$$eval('tbody tr', (r) => r.map((x) => x.textContent));
  check('filter "blocked" shows only blocked', rowsB.length > 0 && rowsB.every((r) => r.includes('Blocked')), `${rowsB.length} rows`);
  await clickText('button', 'Allowed'); await settle(300);
  const rowsA = await page.$$eval('tbody tr', (r) => r.map((x) => x.textContent));
  check('filter "allowed" shows only allowed', rowsA.length > 0 && rowsA.every((r) => r.includes('Allowed')), `${rowsA.length} rows`);
  await clickText('button', 'All'); await settle(300);
  await page.screenshot({ path: `${OUT}/5-audit.png` });
});

// ---------- Status
await run('status', async () => {
  await clickText('a', 'System Status'); await settle(1500);
  t = await text();
  check('status: MCP / Box pending / index / DB / retention', t.includes('MCP tools registered') && t.includes('Box authentication pending') && t.includes('Search index online') && t.includes('SQLite database online') && t.includes('Retention engine active'));
  await page.screenshot({ path: `${OUT}/6-status.png` });
});

// ---------- LIVE mode graceful failure
await run('live', async () => {
  await clickText('button', 'LIVE BOX'); await settle(300);
  await clickText('a', 'Folder Explorer'); await settle(300);
  await page.type('#folder-id', '414969397645');
  await clickText('button', 'Connect Folder'); await settle(1500);
  t = await text();
  check('live: unavailable message shown, no crash', t.includes('Live Box connection unavailable.') && t.includes('Please switch to Demo Mode.'));
  await page.screenshot({ path: `${OUT}/7-live-unavailable.png` });
  await clickText('button', 'Switch to Demo Mode'); await settle(400);
  check('"Switch to Demo Mode" flips the mode', await page.$eval('[aria-pressed="true"]', (e) => e.textContent.includes('DEMO')));

  await clickText('button', 'LIVE BOX'); await settle(200);
  await page.$eval('#folder-id', (e) => { e.value = ''; });
  await page.type('#folder-id', 'abc');
  await clickText('button', 'Connect Folder'); await settle(300);
  check('invalid folder id rejected client-side', (await text()).includes('Folder ID must be numeric'));

  await clickText('a', 'Search'); await settle(300);
  await page.type('input[aria-label="Search query"]', 'revenue'); await page.keyboard.press('Enter'); await settle(1500);
  check('live search: unavailable message', (await text()).includes('Live Box connection unavailable.'));

  // ---- Connect to Box (token entered on the website)
  check('connect bar visible in LIVE mode', !!(await page.$('[data-testid="connect-bar"]')));
  check('token field is a password input', (await page.$eval('#box-token', (e) => e.type)) === 'password');
  await clickText('button', 'Connect to Box'); await settle(300);
  check('empty token rejected client-side', (await text()).includes('Paste the full developer token'));
  await page.type('#box-token', 'FAKE_E2E_TOKEN_1234567890');
  await clickText('button', 'Connect to Box'); await settle(2500);
  t = await text();
  check('rejected token: clear message, still disconnected', t.includes('Box did not accept that token') && !t.includes('Connected to Box as'));
  check('token is never echoed back into the page text', !t.includes('FAKE_E2E_TOKEN_1234567890'));
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie);
  check('token never written to browser storage or cookies', !stored.includes('FAKE_E2E_TOKEN'));
  await page.screenshot({ path: `${OUT}/10-connect-rejected.png` });
  await clickText('button', 'DEMO MODE'); await settle(200);
  check('connect bar hidden in DEMO mode', !(await page.$('[data-testid="connect-bar"]')));

});

// ---------- API down => demo still works from bundled data
await run('api down', async () => {
  await page.setRequestInterception(true);
  page.on('request', (r) => (r.url().includes('/api/') ? r.abort() : r.continue()));
  await clickText('button', 'DEMO MODE'); await settle(200);
  await page.$eval('input[aria-label="Search query"]', (e) => { e.value = ''; });
  await page.type('input[aria-label="Search query"]', 'mainframe'); await page.keyboard.press('Enter'); await settle(1500);
  t = await text();
  check('API down: demo search works from bundled data', t.includes('Mainframe_') && t.includes('Backend API not running'));
  await clickText('a', 'Retention Center'); await settle(900);
  await clickText('li button', 'FY26_Q4_Revenue'); await settle(300);
  await clickText('button', 'Attempt Delete'); await settle(600);
  check('API down: simulated delete still blocked', (await text()).includes('Deletion Blocked'));
  await clickText('a', 'System Status'); await settle(500);
  // The status query is cached for 15s, so force a refetch to exercise the API-down path.
  await clickText('button', 'Refresh'); await settle(1500);
  check('API down: status page degrades gracefully', (await text()).includes('Backend API not reachable'));
  await page.screenshot({ path: `${OUT}/8-api-down-status.png` });
  await page.setRequestInterception(false);
});

// ---------- responsive
await run('mobile', async () => {
  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844 });
  await mobile.goto(`${BASE}/search`, { waitUntil: 'networkidle0' });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('mobile 390px: no horizontal page overflow', !overflow);
  await mobile.screenshot({ path: `${OUT}/9-mobile.png` });
});

const realErrors = consoleErrors.filter((e) => !/Failed to load resource|net::ERR_FAILED|503|ERR_BLOCKED/i.test(e));
check('no unexpected console/page errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
