// Browser checks for the landing gallery and its direct links to the real editor.
// Run after the site build, with scripts/serve.mjs running on the selected origin.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const origin = process.argv[2] || 'http://127.0.0.1:5270';
const catalog = JSON.parse(fs.readFileSync('out/eo3/about/examples/catalog.json', 'utf8'));
const executablePath = process.env.CHROME || 'C:/Users/pcuser/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath });
const errors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(`${origin}/eo3/about`);
  await page.locator('#gallery-controls').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.eo3-example').count(), catalog.length);

  for (const category of ['Conversations', 'Documents', 'Reading', 'All']) {
    await page.locator(`[data-filter="${category}"]`).click();
    assert.equal(await page.locator('.eo3-example:visible').count(), catalog.filter((item) => category === 'All' || item.category === category).length);
  }
  const firstCard = page.locator('.eo3-example').first();
  await firstCard.scrollIntoViewIfNeeded();
  const chat = page.frameLocator('.eo3-example iframe').first();
  await chat.locator('.fic-message').waitFor();
  const styled = await chat.locator('.fic-message').evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.locator('#skin-toggle').click();
  assert.equal(await chat.locator('.fic-message').evaluate((el) => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  // A newly loaded lazy preview must inherit the skin-off choice.
  const lastCard = page.locator('.eo3-example').last();
  await lastCard.scrollIntoViewIfNeeded();
  const extras = page.frameLocator('.eo3-example iframe').last();
  await extras.locator('.fic-extras-panel').first().waitFor();
  assert.equal(await extras.locator('.fic-extras-panel').first().evaluate((el) => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  await page.locator('#skin-toggle').click();
  assert.equal(await chat.locator('.fic-message').evaluate((el) => getComputedStyle(el).backgroundColor), styled);
  const panel = extras.locator('details').first();
  await panel.locator('summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await panel.getAttribute('open'), '');
  await page.keyboard.press('Space');
  assert.equal(await panel.getAttribute('open'), null);

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Landing overflow at ${width}px`);
  }
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  for (const item of catalog) {
    const previewPage = await context.newPage();
    await previewPage.setViewportSize({ width: 320, height: 800 });
    await previewPage.goto(`${origin}/eo3/about/examples/${item.id}-preview.html`);
    assert.equal(await previewPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${item.title} preview overflow`);
    for (const extension of ['html', 'css']) {
      const response = await page.request.get(`${origin}/eo3/about/examples/${item.id}.${extension}`);
      assert.equal(response.status(), 200);
      assert.ok((await response.text()).length > 100);
    }
    if (item.id === 'footnotes') {
      await previewPage.locator('a[href="#fic-notes-note-1"]').click();
      assert.equal(new URL(previewPage.url()).hash, '#fic-notes-note-1');
      await previewPage.locator('a[href="#fic-notes-ref-1"]').click();
      assert.equal(new URL(previewPage.url()).hash, '#fic-notes-ref-1');
    }
    await previewPage.close();

    // Fresh storage per route tests opening all documents and avoids the editor's
    // rapid-reload safeguard, which intentionally waits for a render click.
    const editorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const editor = await editorContext.newPage();
    editor.on('pageerror', (error) => errors.push(`${item.title}: ${error.message}`));
    await editor.goto(`${origin}/eo3/?example=${item.file}`);
    await editor.locator('#workskin').waitFor({ timeout: 20000 });
    assert.ok((await editor.locator('#workskin').innerText()).includes('Lorem ipsum'));
    assert.ok((await editor.locator('.application-tabs').innerText()).includes(item.title.replace(' & ', ' and ')) || (await editor.locator('.application-tabs').innerText()).includes(item.title));
    assert.equal(await editor.locator('.is-error').count(), 0);
    await editorContext.close();
  }
  const bundle = await page.request.get(`${origin}/eo3/about/examples/eo3-workskin-examples.zip`);
  assert.equal(bundle.status(), 200);
  assert.equal((await bundle.body()).readUInt32LE(0), 0x04034b50);
  await context.close();

  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noScript.newPage();
  await staticPage.goto(`${origin}/eo3/about`);
  assert.equal(await staticPage.locator('.eo3-example').count(), catalog.length);
  assert.equal(await staticPage.locator('.eo3-open-example').first().isVisible(), true);
  await noScript.close();
  assert.deepEqual(errors, []);
  console.log(`Passed: ${catalog.length} editor links, previews, downloads, filters, skin comparison, keyboard disclosures, footnotes, mobile widths, dark theme, and no-script content.`);
} finally {
  await browser.close();
}
