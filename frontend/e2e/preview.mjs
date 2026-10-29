// Screenshots + checks for the file preview panel (demo mode, sample drive).
//
//   Prereqs: API running with BOX_SAMPLE_DRIVE set and `npm run seed-sample-drive -- <folder>` done,
//            plus `npm run dev` here. Needs: npm install --no-save puppeteer-core
//   Run:     node e2e/preview.mjs

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
let dialogs = 0;
page.on('dialog', async (d) => { dialogs++; await d.dismiss(); });

const text = () => page.evaluate(() => document.body.innerText);
const clickText = async (sel, label) => {
  const h = await page.evaluateHandle((s, l) => [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(l)), sel, label);
  const el = h.asElement();
  if (!el) throw new Error(`no ${sel} containing "${label}"`);
  await el.click();
};

const files = [
  ['Q4_Planning_Sync', 'boxnote', ['Q4']],
  ['Northwind_Bank_Account_Plan', 'docx', ['Northwind']],
  ['Mainframe_Hybrid_Cloud_Roadmap', 'pptx', ['Mainframe']],
  ['FY26_Q4_Revenue_Forecast', 'xlsx', ['Region', 'EMEA']],
  ['Scratch_Notes', 'txt', []],
];

await page.goto(`${BASE}/search`, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });

for (const [name, tag, expect] of files) {
  try {
    await page.goto(`${BASE}/search`, { waitUntil: 'networkidle0' });
    await page.type('input[placeholder^="Search"]', name.split('_')[0]);
    await page.keyboard.press('Enter');
    await settle();
    await clickText('table button', name);
    await settle(300);
    await clickText('button', 'Preview file');
    await page.waitForSelector('[data-testid="preview-body"]', { timeout: 5000 });
    await settle(300);
    const body = await page.$eval('[data-testid="preview-body"]', (e) => e.innerText);
    check(`${tag}: preview renders`, body.length > 20 && expect.every((s) => body.includes(s)), `${body.length} chars`);
    await page.screenshot({ path: `${OUT}/preview-${tag}.png` });

    if (tag === 'pptx') {
      const before = await page.$eval('[data-testid="preview-body"]', (e) => e.innerText);
      await page.click('[aria-label="Next slide"]');
      await settle(200);
      const after = await page.$eval('[data-testid="preview-body"]', (e) => e.innerText);
      check('pptx: next slide changes content', before !== after);
      await page.screenshot({ path: `${OUT}/preview-pptx-2.png` });
    }
    if (tag === 'xlsx') {
      const tabs = await page.$$eval('[role="tablist"] [role="tab"], [role="tablist"] button', (b) => b.length);
      check('xlsx: sheet tabs shown', tabs >= 2, `${tabs} tabs`);
      check('xlsx: <script> row rendered literally', body.includes('<script>alert(1)</script>'));
      await page.$eval('[data-testid="preview-body"]', (e) => e.scrollIntoView());
      const injected = await page.$$eval('[data-testid="preview-body"] script', (s) => s.length);
      check('xlsx: no script element injected', injected === 0);
    }
  } catch (e) {
    check(`${tag} (script error)`, false, e.message);
    await page.screenshot({ path: `${OUT}/preview-${tag}-error.png` });
  }
}

check('no alert dialogs fired', dialogs === 0);
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
