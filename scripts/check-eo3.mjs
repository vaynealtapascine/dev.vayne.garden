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

async function checkGraph(page, title, expanded) {
  // Node and viewport transitions last 300ms; inspect their settled visible bounds.
  await page.waitForTimeout(500);
  const nodes = await page.locator('.react-flow__node').evaluateAll(elements => elements.map(el => ({
    id: el.getAttribute('data-id'),
    type: el.className,
    label: el.innerText,
    rect: el.getBoundingClientRect().toJSON(),
  })));
  const overlaps = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
  const leaves = nodes.filter(node => !node.type.includes('node-groupFrame'));
  for (let i = 0; i < leaves.length; i++) {
    for (const other of leaves.slice(i + 1)) {
      assert.equal(overlaps(leaves[i].rect, other.rect), false, `${title}: ${leaves[i].label} overlaps ${other.label}`);
    }
  }
  const pane = await page.locator('.module-graph').boundingBox();
  for (const node of nodes) {
    assert.ok(node.rect.left >= pane.x - 1 && node.rect.right <= pane.x + pane.width + 1 && node.rect.top >= pane.y - 1 && node.rect.bottom <= pane.y + pane.height + 1, `${title}: ${node.label} is outside the graph view`);
  }
  const modules = leaves.filter(node => node.type.includes('node-module'));
  const writer = modules[0].rect;
  const stylesheet = modules[1].rect;
  const renderer = nodes.find(node => node.type.includes(expanded ? 'node-groupFrame' : 'node-groupCard')).rect;
  const output = nodes.find(node => node.type.includes('node-modOutput')).rect;
  assert.ok(writer.right < renderer.left, `${title}: writer must be left of the renderer`);
  assert.ok(renderer.right < output.left, `${title}: renderer must be left of the output and logo`);
  assert.ok(stylesheet.top > renderer.bottom, `${title}: stylesheet must stay below the renderer`);
  if (expanded) {
    for (const node of leaves.filter(node => !modules.slice(2).includes(node))) {
      assert.equal(overlaps(renderer, node.rect), false, `${title}: ${node.label} is inside the renderer frame`);
    }
  }
}

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
    for (const extension of ['html', 'css', 'txt', 'eo3group.json']) {
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
    await editor.locator('#workskin .fic-' + ({ 'text-messages': 'message', 'group-chat': 'group', email: 'email', letter: 'letter', journal: 'journal', newspaper: 'news', 'case-file': 'case', 'social-thread': 'feed', transcript: 'transcript', terminal: 'terminal', poetry: 'verse', 'chapter-opening': 'chapter', footnotes: 'notes', 'collapsible-notes': 'extras' }[item.id])).first().waitFor({ timeout: 20000 });
    assert.ok((await editor.locator('#workskin').innerText()).includes('Lorem ipsum'));
    assert.ok((await editor.locator('.application-tabs').innerText()).includes(item.title.replace(' & ', ' and ')) || (await editor.locator('.application-tabs').innerText()).includes(item.title));
    assert.equal(await editor.locator('.is-error').count(), 0);
    assert.equal(await editor.locator('.module-item').count(), 6);
    assert.equal(await editor.locator('.module-item.is-collapsed').count(), 4);
    assert.equal(await editor.locator('.module-item').first().locator('.cm-content').isVisible(), true);
    await editor.locator('.react-flow__node-groupCard').waitFor();
    await checkGraph(editor, item.title, false);
    await editor.getByRole('button', { name: `Show the modules in ${item.title} · reusable renderer`, exact: true }).click();
    await editor.locator('.react-flow__node-groupFrame').waitFor();
    await checkGraph(editor, item.title, true);
    if (item.id === 'text-messages') {
      const input = editor.locator('.module-item').first().locator('.cm-content');
      await input.click();
      await editor.keyboard.press('Control+A');
      await editor.keyboard.insertText('Ada: Lorem ipsum.\nBo: **Dolor sit amet.**\n! End');
      await editor.locator('#workskin .fic-message strong').waitFor();
      assert.equal(await editor.locator('#workskin .fic-message strong').innerText(), 'Dolor sit amet.');
      assert.equal(await editor.locator('#workskin .fic-message-in').count(), 1);
      assert.equal(await editor.locator('#workskin .fic-message-out').count(), 1);
    }
    await editorContext.close();
  }
  const bundle = await page.request.get(`${origin}/eo3/about/examples/eo3-workskin-examples.zip`);
  assert.equal(bundle.status(), 200);
  assert.equal((await bundle.body()).readUInt32LE(0), 0x04034b50);
  const lab = await context.newPage();
  lab.on('pageerror', (error) => errors.push(`Writing preview: ${error.message}`));
  await lab.goto(`${origin}/eo3/about/examples/writing-lab.html`);
  for (const item of catalog) {
    await lab.locator('select').selectOption(item.id);
    assert.ok((await lab.locator('#workskin').innerText()).includes('Lorem ipsum'));
    await lab.getByRole('button', { name: 'Workskin on', exact: true }).click();
    assert.equal(await lab.locator('#creator-style').evaluate((style) => style.sheet.disabled), true);
    await lab.getByRole('button', { name: 'Workskin off', exact: true }).click();
  }
  await lab.locator('select').selectOption('text-messages');
  await lab.locator('#writing-input').fill('Ada: Lorem ipsum.\nBo: **Dolor sit amet.**\n! End');
  assert.equal(await lab.locator('#workskin strong').innerText(), 'Dolor sit amet.');
  for (const width of [320, 390, 768, 1440]) {
    await lab.setViewportSize({ width, height: 900 });
    assert.equal(await lab.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Writing preview overflow at ${width}px`);
  }
  const groupContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const groupEditor = await groupContext.newPage();
  groupEditor.on('pageerror', (error) => errors.push(`Imported group: ${error.message}`));
  await groupEditor.goto(`${origin}/eo3/?example=ao3-letter.toml`);
  await groupEditor.locator('#workskin .fic-letter').waitFor({ timeout: 20000 });
  await groupEditor.getByRole('button', { name: 'add node', exact: true }).click();
  await groupEditor.getByRole('button', { name: 'Show Groups', exact: true }).click();
  await groupEditor.getByRole('button', { name: 'Select AO3 · Text messages', exact: true }).click();
  assert.equal(await groupEditor.locator('.module-item').count(), 12);
  assert.equal(await groupEditor.locator('.module-item').nth(6).locator('.cm-content').isVisible(), true);
  const importedCompose = groupEditor.locator('.module-item').nth(8);
  await importedCompose.getByRole('button', { name: 'show contents', exact: true }).click();
  await importedCompose.getByRole('group', { name: 'Connections', exact: true }).locator('select').first().selectOption('output');
  await groupEditor.locator('.module-item').nth(7).getByRole('group', { name: 'Connections', exact: true }).locator('select').first().selectOption('output');
  await groupEditor.locator('#workskin .fic-message').waitFor({ timeout: 20000 });
  assert.equal(await groupEditor.locator('#workskin .fic-message').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(248, 250, 249)');
  assert.equal(await groupEditor.locator('.is-error').count(), 0);
  await groupContext.close();
  await context.close();

  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noScript.newPage();
  await staticPage.goto(`${origin}/eo3/about`);
  assert.equal(await staticPage.locator('.eo3-example').count(), catalog.length);
  assert.equal(await staticPage.locator('.eo3-open-example').first().isVisible(), true);
  await noScript.close();
  assert.deepEqual(errors, []);
  console.log(`Passed: ${catalog.length} editor links and clean collapsed/expanded node layouts, live writing inputs, reusable group import and connections, previews, downloads, filters, skin comparison, keyboard disclosures, footnotes, mobile widths, dark theme, and no-script content.`);
} finally {
  await browser.close();
}
