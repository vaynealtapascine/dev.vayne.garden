// Screenshots of the two web apps doing real work, for the site's framed shots.
//   node scripts/shots/capture-web.mjs <dscribe-url> <eo3-url> [disclosure-studio-url]   (pass "" to skip one)
// Serve each app's built dist/ first (scripts/serve.mjs works). dScribe downloads its model (~350 MB) from
// Hugging Face and describes the sample images on the CPU, so the alt text and extracted text are genuine output.
// Set CHROME to a Chromium executable if Playwright's default isn't installed.
import { chromium } from 'playwright-core';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const raw = (name) => path.join(here, 'raw', name);
const [dscribeUrl, eo3Url, disclosureUrl] = process.argv.slice(2);
const executablePath =
  process.env.CHROME ?? 'C:/Users/pcuser/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';

// A fresh in-memory context: a persistent profile's Cache Storage can fail inside sandboxed hosts.
const browser = await chromium.launch({ executablePath });

async function dscribe() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(dscribeUrl);
  await page.waitForTimeout(1500);

  const idle = async () => {
    for (let i = 0; i < 150; i++) {
      await page.waitForTimeout(4000);
      const cpu = page.getByRole('button', { name: /Use the CPU/i });
      if (await cpu.count()) await cpu.first().click();
      const text = await page.innerText('main');
      if (i > 2 && !/queued|processing|MB \/|Loading|Describing|Reading|Waiting/i.test(text)) return;
    }
    throw new Error('dScribe never went idle');
  };

  const input = page.locator('input[type=file]').first();
  await input.setInputFiles('C:/Windows/Web/Wallpaper/ThemeC/img28.jpg');
  await idle();
  await input.setInputFiles('C:/Windows/Web/Wallpaper/Spotlight/img50.jpg');
  await idle();
  await page.getByLabel(/Also read text/i).check();
  await input.setInputFiles(raw('garden-cafe-menu.jpg'));
  await idle();
  await page.getByLabel(/Also read text/i).uncheck();

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: raw('dscribe-list.png') });

  await page.locator('button[aria-label*="Open" i]').first().click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Detailed' }).click();
  await idle();
  await page.locator('textarea').first().blur();
  await page.waitForTimeout(800);
  console.log('dscribe alt text:', await page.locator('textarea').first().inputValue());
  await page.screenshot({ path: raw('dscribe-editor.png') });
  await ctx.close();
}

async function eo3() {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 820 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(eo3Url);
  await page.waitForTimeout(2000);

  // Open the sidebar and load the chat-log example.
  await page.locator('button').first().click();
  await page.waitForTimeout(800);
  const example = page
    .getByText('Svelte Chat Log', { exact: true })
    .locator('xpath=ancestor::*[.//button[normalize-space()="open"]][1]');
  await example.getByRole('button', { name: 'open' }).first().click();
  await page.waitForTimeout(2500);
  if (await page.getByText('Examples and Templates').isVisible()) await page.locator('button').first().click();

  // Swap the example's placeholder chat for a friendlier one; the graph re-renders it live.
  const editor = page.locator('.cm-content').first();
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(
    'eggbug: did anyone water the basil?\n' +
      'eggbug2: i did! it is thriving\n' +
      'eggbug: you are the best\n' +
      'eggbug2: bring the good mugs, i am making tea',
  );
  await editor.blur();
  await page.waitForTimeout(3000);

  // Put the module list back at its top, then scroll the AO3 preview down to the work itself.
  await page.evaluate(() => {
    const work = document.querySelector('#workskin');
    for (const el of document.querySelectorAll('*')) if (el.scrollTop > 0 && !el.contains(work)) el.scrollTop = 0;
    work?.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: raw('eo3.png') });
  await ctx.close();
}

async function disclosure() {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(disclosureUrl);
  await page.waitForTimeout(1500);
  await page.locator('input[name=rating][value="3"]').check({ force: true });
  const search = page.getByPlaceholder('Search name or provider…');
  for (const model of ['anthropic/claude-opus-5', 'openai/gpt-5.6-sol', 'anthropic/claude-sonnet-5']) {
    await search.fill(model);
    await page.waitForTimeout(400);
    await page.locator('label', { has: page.getByText(model, { exact: true }) }).locator('input[type=checkbox]').first().check();
  }
  await search.fill('');
  await page.waitForTimeout(400);
  await page.screenshot({ path: raw('disclosure.png') });
  await ctx.close();
}

if (dscribeUrl) await dscribe();
if (eo3Url) await eo3();
if (disclosureUrl) await disclosure();
await browser.close();
