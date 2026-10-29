// End-to-end check of the simplified UI in a real (headless) Chrome: two tabs, 8 demo files,
// search, pop-up preview with deletion status, and Ask Bob.
//
//   Prereqs: API running (npm run web-api in the repo root) and `npm run dev` here.
//            Needs: npm install --no-save puppeteer-core
//   Run:     node e2e/e2e.mjs            (add ASK_BOB=1 to also make one real Bob call, ~$0.01-0.06)

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
const settle = (ms = 500) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 900 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

const clickText = async (sel, label) => {
  const h = await page.evaluateHandle((s, l) => [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(l)), sel, label);
  const el = h.asElement();
  if (!el) throw new Error(`no ${sel} containing "${label}"`);
  await el.click();
};
const bodyText = () => page.evaluate(() => document.body.innerText);

try {
  await page.goto(BASE, { waitUntil: 'networkidle0' });

  const tabs = await page.$$eval('[role="tab"]', (t) => t.map((x) => x.textContent.trim()));
  check('exactly two sections', tabs.length === 2 && tabs.includes('Demo files') && tabs.includes('My Box'), tabs.join(' | '));
  check('no side menu or mode switch', (await page.$('nav')) === null && !/LIVE BOX|DEMO MODE/.test(await bodyText()));

  // Demo files tab is the default.
  const rows = await page.$$eval('main ul li', (l) => l.length);
  check('demo tab lists 8 files', rows === 8, `${rows} files`);
  const names = await page.$$eval('main ul li button', (b) => b.map((x) => x.innerText));
  const protectedCount = names.filter((n) => /\bProtected\b/.test(n)).length;
  check('each file shows a Protected / Unprotected badge', names.every((n) => /Protected|Unprotected/.test(n)) && protectedCount > 0 && protectedCount < 8, `${protectedCount} protected`);
  await page.screenshot({ path: `${OUT}/ui-demo.png` });

  // Search inside files.
  await page.type('input[aria-label="Search files"]', 'renewal');
  await page.keyboard.press('Enter');
  await settle(800);
  const found = await page.$$eval('main ul li', (l) => l.length);
  check('search finds words inside files', found === 2, `${found} results`);
  check('matched words are highlighted', (await page.$$('main ul li mark')).length > 0);
  await page.screenshot({ path: `${OUT}/ui-search.png` });

  // Open a file in the pop-up.
  await clickText('main ul li button', 'Northwind_Account_Plan');
  await page.waitForSelector('[data-testid="preview-body"]', { timeout: 5000 });
  await settle(600);
  const dlg = await page.$eval('dialog', (d) => ({ modal: d.open && d.matches(':modal'), text: d.innerText }));
  check('file opens as a pop-up', dlg.modal);
  check('pop-up shows the whole file', dlg.text.includes('Total contract value') && dlg.text.includes('At risk'));
  check('pop-up shows owner and deletion status', dlg.text.includes('priya.nair@example.com') && /Protected/.test(dlg.text) && /blocked/i.test(dlg.text));
  check('pop-up has an Ask Bob box', (await page.$('dialog [aria-label="Ask Bob"]')) !== null);
  await page.screenshot({ path: `${OUT}/ui-popup.png` });

  if (process.env.ASK_BOB) {
    await clickText('dialog [aria-label="Ask Bob"] button', 'Relate to my search');
    await page.waitForSelector('[data-testid="bob-answer"]', { timeout: 150000 });
    const answer = await page.$eval('[data-testid="bob-answer"]', (e) => e.innerText);
    check('Ask Bob answers in the pop-up', answer.trim().length > 20, answer.replace(/\n/g, ' ').slice(0, 100));
    await page.screenshot({ path: `${OUT}/ui-ask-bob.png` });
  }

  await page.keyboard.press('Escape');
  await settle(200);
  check('Escape closes the pop-up', await page.$eval('dialog', (d) => !d.open));

  // The other file types open too.
  for (const [name, expect] of [['Product_Roadmap', 'Product Roadmap FY27'], ['Q4_Revenue_Forecast', 'EMEA'], ['Q4_Planning_Meeting', 'Action items'], ['Team_Offsite', 'Escape room']]) {
    // "Show all" only exists while a search is active.
    if (await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Show all')))) {
      await clickText('button', 'Show all');
      await settle(600);
    }
    await clickText('main ul li button', name);
    await page.waitForSelector('[data-testid="preview-body"]', { timeout: 5000 });
    await settle(500);
    const t = await page.$eval('[data-testid="preview-body"]', (e) => e.innerText);
    check(`${name} opens`, t.includes(expect), t.slice(0, 40).replace(/\n/g, ' '));
    await page.keyboard.press('Escape');
    await settle(200);
  }

  // My Box tab.
  await clickText('[role="tab"]', 'My Box');
  await settle(300);
  const box = await bodyText();
  check('My Box explains it is waiting for approval', /waiting for approval/i.test(box));
  check('My Box has no token field', (await page.$('input[type="password"]')) === null);
  await page.screenshot({ path: `${OUT}/ui-mybox.png` });
  await clickText('main button', 'Open the demo files');
  await settle(500);
  check('button returns to the demo files', (await page.$$eval('main ul li', (l) => l.length)) === 8);
} catch (e) {
  check('script error', false, e.message);
  await page.screenshot({ path: `${OUT}/ui-error.png` });
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
