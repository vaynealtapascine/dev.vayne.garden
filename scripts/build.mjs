// Assembles the whole site into out/: the static pages in site/, plus fresh builds of the two web apps.
//   node scripts/build.mjs            build everything
//   node scripts/build.mjs --no-apps  only copy site/ (for working on the pages)
// Each app is cloned at a ref and built with its own npm scripts. Override with env vars:
//   DSCRIBE_REPO, DSCRIBE_REF, EO3_REPO, EO3_REF, DISCLOSURE_REPO, DISCLOSURE_REF (refs default to main)
// A repo may also be a local path, which is handy for trying an unpushed branch.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { buildEo3Gallery } from './eo3-gallery.mjs';
import { renderDunReleases } from './dun-releases.mjs';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'out');
const work = path.join(root, '.work');
const withApps = !process.argv.includes('--no-apps');
let eo3ExamplesDir = process.env.EO3_EXAMPLES_DIR || path.join(work, 'eo3/dist/workskin-examples');

const apps = [
  {
    name: 'dscribe',
    repo: process.env.DSCRIBE_REPO || 'https://github.com/vaynealtapascine/dScribe.git',
    ref: process.env.DSCRIBE_REF || 'main',
  },
  {
    name: 'eo3',
    repo: process.env.EO3_REPO || 'https://github.com/vaynealtapascine/eo3.git',
    ref: process.env.EO3_REF || 'main',
    // Source maps roughly double eo3's upload and aren't needed on the live copy.
    prune: (dir) => removeWhere(dir, (f) => f.endsWith('.map')),
  },
  {
    name: 'disclosure',
    repo: process.env.DISCLOSURE_REPO || 'https://github.com/vaynealtapascine/DisclosureStudio.git',
    ref: process.env.DISCLOSURE_REF || 'main',
    // Its PWA manifest pins scope and start_url to the domain root; here it lives under /disclosure/.
    prune: (dir) => {
      const file = path.join(dir, 'manifest.webmanifest');
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
      fs.writeFileSync(file, JSON.stringify({ ...manifest, scope: './', start_url: './' }));
    },
  },
];

// A small way home, added to each hosted app's page. The apps' own repos stay unchanged.
// It sits above dScribe's phone tab bar (--nav-height) and under the apps' own floating bars and toasts.
const backlink = `
<a class="vg-home" href="/" title="More tools at dev.vayne.garden">&larr; dev.vayne.garden</a>
<style>
  .vg-home { position: fixed; left: 10px; z-index: 25;
    bottom: calc(10px + var(--nav-height, 0px) + env(safe-area-inset-bottom, 0px)); padding: 3px 10px; border-radius: 999px;
    font: 500 12px/1.6 system-ui, -apple-system, 'Segoe UI', sans-serif; text-decoration: none;
    color: #3c5436; background: rgb(246 241 231 / 0.92); border: 1px solid rgb(77 106 71 / 0.25);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.12); opacity: 0.8; }
  .vg-home:hover, .vg-home:focus-visible { opacity: 1; text-decoration: underline; }
  @media print { .vg-home { display: none; } }
</style>
`;
function addBacklink(dir) {
  const file = path.join(dir, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes('</body>')) throw new Error(`${file} has no </body> to add the back link before`);
  fs.writeFileSync(file, html.replace('</body>', `${backlink}</body>`));
}

// npm is a .cmd shim on Windows and needs a shell; git doesn't, and a shell would mangle paths like D:\!!Self.
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: cmd === 'npm' && process.platform === 'win32' });
const capture = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();

function removeWhere(dir, test) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) removeWhere(full, test);
    else if (test(full)) fs.rmSync(full);
  }
}

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'site'), out, { recursive: true });
renderDunReleases(out);

const manifest = { built: new Date().toISOString(), apps: {} };

if (withApps) {
  fs.mkdirSync(work, { recursive: true });
  for (const app of apps) {
    const dir = path.join(work, app.name);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`\n== ${app.name}: ${app.repo} @ ${app.ref}`);
    run('git', ['clone', '--quiet', '--depth', '1', '--branch', app.ref, app.repo, dir]);
    const commit = capture('git', ['rev-parse', 'HEAD'], dir);
    run('npm', ['ci', '--no-audit', '--no-fund'], dir);
    run('npm', ['run', 'build'], dir);
    const dist = path.join(dir, 'dist');
    app.prune?.(dist);
    addBacklink(dist);
    fs.cpSync(dist, path.join(out, app.name), { recursive: true });
    if (app.name === 'eo3') eo3ExamplesDir = path.join(dist, 'workskin-examples');
    manifest.apps[app.name] = { repo: app.repo.startsWith('http') ? app.repo : 'local', ref: app.ref, commit };
  }
}

buildEo3Gallery(eo3ExamplesDir, out);
fs.writeFileSync(path.join(out, 'build.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\nbuilt ${path.relative(root, out)}/`, JSON.stringify(manifest.apps));
