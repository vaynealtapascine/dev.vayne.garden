// Exercise actual Svelte workers under slow startup and a lost bundle response.
// Run against a built EO3 app served locally, or pass the deployed origin.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = process.argv[2] || 'http://127.0.0.1:5270';
const executablePath = process.env.CHROME || 'C:/Users/pcuser/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath });
const errors = [];

async function editor({ delayStartup = false, dropReplies = 0 } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ dropReplies }) => {
    const NativeWorker = window.Worker;
    window.svelteWorkerChecks = [];
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        if (!String(url).includes('svelte-worker')) return;
        const index = window.svelteWorkerChecks.length;
        this.check = { created: performance.now(), ready: null, bundles: [], replies: 0, terminated: false };
        window.svelteWorkerChecks.push(this.check);
        super.addEventListener('message', event => {
          if (event.data?.type === 'ready') this.check.ready = performance.now();
          else {
            this.check.replies++;
            // Simulate a hung compiler without replacing the real worker or compiler.
            if (index < dropReplies) event.stopImmediatePropagation();
          }
        }, true);
      }
      postMessage(...args) {
        if (args[0]?.type === 'bundle') this.check?.bundles.push(performance.now());
        return super.postMessage(...args);
      }
      terminate() {
        if (this.check) this.check.terminated = true;
        return super.terminate();
      }
    };
  }, { dropReplies });
  if (delayStartup) {
    await page.route('**/svelte-worker-*.js', async route => {
      await new Promise(resolve => setTimeout(resolve, 6500));
      await route.continue().catch(() => {});
    });
  }
  await page.goto(`${origin}/eo3/?example=ao3-text-messages.toml`);
  return page;
}

async function rendered(page, timeout = 30000) {
  try {
    await page.locator('#workskin .fic-message').first().waitFor({ state: 'attached', timeout });
  } catch (error) {
    console.log('Failed render:', await page.evaluate(() => ({
      workers: window.svelteWorkerChecks,
      scripts: [...document.scripts].map(script => script.src).filter(Boolean),
      page: document.body.innerText.slice(-2500),
    })));
    throw error;
  }
  await page.locator('.render-indicator.is-rendering').waitFor({ state: 'hidden', timeout });
  assert.equal(await page.locator('.is-error').count(), 0);
  assert.ok((await page.locator('#workskin').first().innerText()).includes('Lorem ipsum'));
}

try {
  const cold = await editor({ delayStartup: true });
  await rendered(cold, 45000);
  let workers = await cold.evaluate(() => window.svelteWorkerChecks);
  assert.equal(workers.length, 1);
  assert.ok(workers[0].ready - workers[0].created >= 6500);
  assert.ok(workers[0].bundles[0] >= workers[0].ready);
  assert.equal(workers[0].terminated, false);
  console.log(`Slow startup passed: worker ready after ${Math.round(workers[0].ready - workers[0].created)}ms, one worker, no rerender needed.`);

  const compose = cold.locator('.module-item').nth(2);
  await compose.getByRole('button', { name: 'show contents', exact: true }).click();
  for (const version of ['legacy', 'v5', 'v4']) {
    const replies = workers[0].replies;
    await compose.getByLabel('Svelte version:', { exact: true }).selectOption(version);
    await cold.waitForFunction(previous => window.svelteWorkerChecks[0].replies > previous, replies);
    await rendered(cold);
    workers = await cold.evaluate(() => window.svelteWorkerChecks);
    assert.equal(workers.length, 1);
  }
  console.log('Warm worker passed: Svelte 3, 5 and 4 compile and render using the same worker.');
  await cold.close();

  const retry = await editor({ dropReplies: 1 });
  await rendered(retry, 35000);
  workers = await retry.evaluate(() => window.svelteWorkerChecks);
  assert.equal(workers.length, 2);
  assert.equal(workers[0].terminated, true);
  assert.equal(workers[1].terminated, false);
  assert.equal(workers[0].bundles.length, 1);
  assert.equal(workers[1].bundles.length, 1);
  assert.ok(workers[1].created - workers[0].bundles[0] >= 15000);
  console.log('Timeout recovery passed: first worker retired, automatic retry rendered successfully, Live Update stayed on.');
  assert.equal(await retry.getByLabel('Live Update', { exact: true }).isChecked(), true);
  await retry.close();
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
