// Frames the raw screenshots in scripts/shots/raw/ for the site: a soft tinted backdrop, rounded corners and a
// gentle shadow. Writes site/shots/<name>.webp. Needs ImageMagick (`magick`) on PATH for the webp step.
//   node scripts/shots/frame.mjs [name ...]   (no names: every shot)
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../../site/shots');
const executablePath =
  process.env.CHROME ?? 'C:/Users/pcuser/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';

// width: the framed image's width in CSS px (rendered at 2x). tint: the backdrop, a pale wash of the tool's colour.
const shots = [
  { name: 'drycut', src: 'drycut.png', tint: '#f3e3c9', width: 900 },
  { name: 'soundoff', src: 'soundoff-light.png', tint: '#d7e5df', width: 900 },
  { name: 'soundoff-dark', src: 'soundoff-dark.png', tint: '#cfdcd6', width: 900 },
  { name: 'soundoff-start', src: 'soundoff-start.png', tint: '#cfdcd6', width: 640 },
  { name: 'arbor', src: 'arbor-desktop.png', tint: '#dde8d0', width: 900 },
  { name: 'arbor-phone', src: 'arbor-phone.png', tint: '#dde8d0', width: 420, radius: 28 },
  { name: 'dscribe', src: 'dscribe-editor.png', tint: '#dde0f2', width: 900 },
  { name: 'eo3', src: 'eo3.png', tint: '#efdad6', width: 900 },
  { name: 'disclosure', src: 'disclosure.png', tint: '#e5ddef', width: 900 },
];

const page = (shot) => `<!doctype html><html><head><style>
  html, body { margin: 0; background: transparent; }
  .stage {
    width: ${shot.width}px; box-sizing: border-box; padding: ${Math.round(shot.width * 0.055)}px;
    background: radial-gradient(120% 90% at 20% 0%, color-mix(in oklab, ${shot.tint}, white 45%), ${shot.tint});
  }
  img {
    display: block; width: 100%; height: auto; border-radius: ${shot.radius ?? 10}px;
    box-shadow: 0 1px 2px rgb(40 30 20 / 0.10), 0 10px 30px -8px rgb(40 30 20 / 0.28);
    outline: 1px solid rgb(40 30 20 / 0.08);
  }
</style></head><body><div class="stage"><img src="${url.pathToFileURL(path.join(here, 'raw', shot.src))}"></div></body></html>`;

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1000, height: 1000 } });
const tab = await context.newPage();
const only = process.argv.slice(2);
for (const shot of shots.filter((s) => only.length === 0 || only.includes(s.name))) {
  const html = path.join(here, 'raw', `.frame-${shot.name}.html`);
  fs.writeFileSync(html, page(shot));
  await tab.goto(url.pathToFileURL(html).href);
  await tab.waitForLoadState('load');
  const png = path.join(here, 'raw', `.frame-${shot.name}.png`);
  await tab.locator('.stage').screenshot({ path: png });
  const webp = path.join(outDir, `${shot.name}.webp`);
  execFileSync('magick', [png, '-quality', '84', '-define', 'webp:method=6', webp]);
  fs.rmSync(html);
  fs.rmSync(png);
  console.log(`${shot.name}.webp ${(fs.statSync(webp).size / 1024).toFixed(0)} KB`);
}
await browser.close();
