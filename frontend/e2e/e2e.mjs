// End-to-end check of the simplified UI in a real (headless) Chrome: two tabs, 8 demo files,
// search, pop-up preview with deletion status, upload / permissions / delete, and Ask Bob.
//
//   Prereqs: API running (npm run web-api in the repo root) and `npm run dev` here.
//            Needs: npm install --no-save puppeteer-core
//   Run:     node e2e/e2e.mjs            (the search step makes one real Bob call, ~$0.01-0.06;
//                                         add ASK_BOB=1 for a second one in the pop-up)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
// The browser logs the deliberate 409 (delete of a protected file) as a console error; that one is expected.
page.on('console', (m) => { if (m.type() === 'error' && !/status of 409/.test(m.text())) errors.push(m.text()); });
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

  // Search goes through Bob (a real call, ~$0.01-0.06). "deals" and "close" appear in no file's wording
  // the way the query does, so only a reader who understands the files can answer it.
  await page.type('input[aria-label="Search files"]', 'which deals might not close this quarter');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.innerText.includes('Bob is reading the files'), { timeout: 5000 }).catch(() => {});
  check('shows that Bob is working', (await bodyText()).includes('Bob is reading the files') || (await page.$$('[data-testid="bob-reason"]')).length > 0);
  await page.waitForSelector('[data-testid="bob-reason"]', { timeout: 150000 });
  const found = await page.$$eval('main ul li', (l) => l.map((x) => x.innerText));
  check('Bob picks the file that mentions the at-risk quarter', found.length >= 1 && found.some((t) => t.includes('Northwind_Account_Plan')), `${found.length} result(s)`);
  check('Bob does not return unrelated files', !found.some((t) => t.includes('Team_Offsite')));
  check('each result says why it matched', (await page.$$('[data-testid="bob-reason"]')).length === found.length);
  check('result count mentions Bob', /Bob found/.test(await bodyText()));
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

  // Upload, change permissions, delete (no Bob calls). Uses a throwaway text file and removes it again.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bps-e2e-'));
  const upFile = path.join(tmp, 'E2E_Upload_Test.txt');
  fs.writeFileSync(upFile, 'Uploaded by the end-to-end check. Kiwi budget notes.');
  const openRowCount = () => page.$$eval('main ul li', (l) => l.length);
  // Remove anything a previous failed run left behind, so the upload below starts from the 8 bundled files.
  await page.evaluate(async () => {
    const post = (url, body) => fetch(url, { method: 'POST', headers: { 'x-bps-client': 'web', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    for (const d of (await (await fetch('/api/demo/documents')).json()).documents) {
      if (d.name !== 'E2E_Upload_Test.txt') continue;
      await post(`/api/demo/documents/${d.id}/permissions`, { collaborators: [], doNotDelete: false });
      await post(`/api/demo/documents/${d.id}/delete`, {});
    }
  });
  await page.reload({ waitUntil: 'networkidle0' });
  try {
    if (await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Show all')))) {
      await clickText('button', 'Show all');
      await settle(600);
    }
    const input = await page.$('[data-testid="upload-input"]');
    await input.uploadFile(upFile);
    await page.waitForFunction(() => document.querySelector('dialog')?.innerText.includes('E2E_Upload_Test.txt') && document.querySelector('dialog')?.open, { timeout: 8000 });
    await settle(500);
    check('upload adds the file and opens it', (await page.$eval('dialog', (d) => d.innerText)).includes('Kiwi budget notes'));
    check('new upload is Unprotected', /Unprotected/.test(await page.$eval('[data-testid="retention-line"]', (e) => e.innerText)));
    await page.evaluate(() => { document.querySelector('[data-testid="manage-file"]').open = true; });
    check('delete is allowed for an unprotected file', await page.evaluate(() => ![...document.querySelectorAll('dialog button')].find((b) => b.textContent.includes('Delete file')).disabled));

    // Share it: it becomes protected and delete is disabled.
    await page.type('input[aria-label="Add a collaborator by email"]', 'teammate@example.com');
    await page.keyboard.press('Enter');
    await clickText('dialog button', 'Save permissions');
    await page.waitForFunction(() => /Protected/.test(document.querySelector('[data-testid="retention-line"]')?.innerText ?? '') && !/Unprotected/.test(document.querySelector('[data-testid="retention-line"]').innerText), { timeout: 8000 });
    check('adding a collaborator protects the file', true);
    check('delete is disabled with an explanation while protected', await page.evaluate(() => [...document.querySelectorAll('dialog button')].find((b) => b.textContent.includes('Delete file')).disabled && !!document.querySelector('[data-testid="delete-hint"]')));
    await page.screenshot({ path: `${OUT}/ui-permissions.png` });

    // Invalid email is explained, not sent.
    await page.type('input[aria-label="Add a collaborator by email"]', 'not-an-email');
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog [role="alert"]', { timeout: 3000 }).catch(() => {});
    check('an invalid email is explained', (await bodyText()).includes('name@company.com'));
    // Save with the invalid text still in the box: it must explain, not save.
    await clickText('dialog button', 'Save permissions');
    check('saving with an invalid email in the box does not save', /name@company.com/.test(await bodyText()) && /Protected/.test(await page.$eval('[data-testid="retention-line"]', (e) => e.innerText)));
    await page.$eval('input[aria-label="Add a collaborator by email"]', (e) => e.select());
    await page.keyboard.press('Backspace');

    // Unshare it and try the delete flow.
    await page.click('button[aria-label="Remove teammate@example.com"]');
    await clickText('dialog button', 'Save permissions');
    await page.waitForFunction(() => /Unprotected/.test(document.querySelector('[data-testid="retention-line"]')?.innerText ?? ''), { timeout: 8000 });
    check('removing the collaborator unprotects the file', true);
    await clickText('dialog button', 'Delete file');
    check('delete asks for confirmation', (await page.$eval('dialog', (d) => d.innerText)).includes('This cannot be undone'));
    await clickText('dialog button', 'Cancel');
    check('cancel keeps the file', (await page.$eval('dialog', (d) => d.open)) && (await page.$eval('dialog', (d) => d.innerText)).includes('E2E_Upload_Test.txt'));
    await clickText('dialog button', 'Delete file');
    await clickText('dialog button', 'Yes, delete');
    await page.waitForFunction(() => !document.querySelector('dialog')?.open, { timeout: 8000 });
    await settle(700);
    check('deleting closes the pop-up and removes the file', !(await bodyText()).includes('E2E_Upload_Test.txt') && (await openRowCount()) === 8);

    // The server, not the page, enforces protection: a bundled protected file cannot be deleted by a direct call.
    const status = await page.evaluate(async () => {
      const docs = (await (await fetch('/api/demo/documents')).json()).documents;
      const prot = docs.find((d) => d.retention.status === 'protected');
      const r = await fetch(`/api/demo/documents/${prot.id}/delete`, { method: 'POST', headers: { 'x-bps-client': 'web', 'Content-Type': 'application/json' }, body: '{}' });
      return r.status;
    });
    check('the server refuses to delete a protected file', status === 409, `HTTP ${status}`);
    check('protected file is still listed', (await openRowCount()) === 8);

    // Bad uploads get a plain-words message.
    const badFile = path.join(tmp, 'program.exe');
    fs.writeFileSync(badFile, 'MZ');
    await (await page.$('[data-testid="upload-input"]')).uploadFile(badFile);
    await page.waitForSelector('[data-testid="upload-error"]', { timeout: 5000 });
    check('an unsupported file type is explained', /not supported/.test(await page.$eval('[data-testid="upload-error"]', (e) => e.innerText)));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
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
