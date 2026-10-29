// Checks the "Ask Bob" box inside the preview pop-up.
//
//   Prereqs: API running with BOBSHELL_API_KEY + BOB_CLI_PATH pointing at a stand-in script (never the real
//            Bob), sample drive seeded, and `npm run dev` here. Needs: npm install --no-save puppeteer-core
//   Run:     node e2e/ask-bob.mjs

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
const settle = (ms = 700) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

const clickText = async (sel, label) => {
  const h = await page.evaluateHandle((s, l) => [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(l)), sel, label);
  const el = h.asElement();
  if (!el) throw new Error(`no ${sel} containing "${label}"`);
  await el.click();
};

try {
  await page.goto(`${BASE}/search`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });

  await page.type('input[placeholder^="Search"]', 'Northwind');
  await page.keyboard.press('Enter');
  await settle();
  await clickText('table button', 'Northwind_Bank_Account_Plan');
  await settle(300);
  await clickText('button', 'Preview file');
  await page.waitForSelector('[data-testid="preview-body"]', { timeout: 5000 });
  await settle(300);

  check('Ask Bob section is in the pop-up', (await page.$('dialog [aria-label="Ask Bob"]')) !== null);
  const relateLabel = await page.$$eval('dialog [aria-label="Ask Bob"] button', (b) => b.map((x) => x.textContent.trim()));
  check('search-aware button is offered after a search', relateLabel.includes('Relate to my search'), relateLabel.join(' | '));

  await clickText('dialog [aria-label="Ask Bob"] button', 'Relate to my search');
  await page.waitForSelector('[data-testid="bob-answer"]', { timeout: 15000 });
  const answer = await page.$eval('[data-testid="bob-answer"]', (e) => e.innerText);
  check('answer is shown in the pop-up', answer.includes('Stand-in answer'), answer.slice(0, 40));
  check('the search query reached the server', answer.includes('Northwind'), answer.replace(/\n/g, ' | ').slice(0, 120));
  await page.screenshot({ path: `${OUT}/ask-bob-summary.png` });

  await page.type('dialog input[aria-label="Question for Bob"]', 'What is the contract value?');
  await page.keyboard.press('Enter');
  await settle(1500);
  check('typed question gets an answer', (await page.$('[data-testid="bob-answer"]')) !== null);

  const noScripts = await page.$$eval('[data-testid="bob-answer"] script, [data-testid="bob-answer"] *', (n) => n.filter((x) => x.tagName === 'SCRIPT').length);
  check('answer is rendered as text only', noScripts === 0);
} catch (e) {
  check('script error', false, e.message);
  await page.screenshot({ path: `${OUT}/ask-bob-error.png` });
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
