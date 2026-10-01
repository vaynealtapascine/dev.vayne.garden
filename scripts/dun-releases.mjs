// Generate ordinary HTML so every download works without browser JavaScript.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = value => {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') throw new Error('Dun download links must use HTTPS');
  return escape(value);
};

export function renderDunReleases(directory) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'site/dun/releases.json'), 'utf8'));
  if (!config.downloads.length) throw new Error('Dun needs at least one published download');
  const metadata = item => {
    for (const field of ['platform', 'architecture', 'version', 'published', 'size', 'format']) {
      if (!item[field]) throw new Error(`Missing Dun release field: ${field}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.published) || Number.isNaN(Date.parse(item.published))) throw new Error('Invalid Dun release date');
    const date = new Date(`${item.published}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return `${escape(item.architecture)} · v${escape(item.version)} · <time datetime="${escape(item.published)}">${date}</time> · ${escape(item.size)} · ${escape(item.format)}`;
  };
  const primary = config.downloads[0];
  const primaryMeta = metadata(primary);
  const sections = {
    PRIMARY: `<div class="actions"><a class="button" href="${safeUrl(primary.url)}">Download for ${escape(primary.platform)}</a><a href="#downloads">Other downloads &amp; releases</a></div>\n      <p class="release-meta">${primaryMeta}</p>`,
    DOWNLOADS: `<ul class="downloads">${config.downloads.map(item => `<li><a href="${safeUrl(item.url)}">Download for ${escape(item.platform)}</a><span class="note">${metadata(item)}<br><a href="${safeUrl(item.releaseUrl)}">Release notes</a></span></li>`).join('')}</ul>${config.downloads.some(item => item.platform === 'Android') ? '' : '<p><strong>Android:</strong> no Android download is included in the currently listed release.</p>'}`,
    ALL: `<p><a href="${safeUrl(config.allReleasesUrl)}">Browse all releases on GitHub</a> for earlier versions and release notes. On a release page, open <strong>Assets</strong> to see its downloads.</p>`,
  };
  const file = path.join(directory, 'dun/index.html');
  let html = fs.readFileSync(file, 'utf8');
  for (const [name, content] of Object.entries(sections)) {
    const pattern = new RegExp(`<!-- DUN_${name}_START -->[\\s\\S]*?<!-- DUN_${name}_END -->`);
    if (!pattern.test(html)) throw new Error(`Missing Dun template section: ${name}`);
    html = html.replace(pattern, `<!-- DUN_${name}_START -->\n      ${content}\n      <!-- DUN_${name}_END -->`);
  }
  fs.writeFileSync(file, html);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) renderDunReleases(path.join(root, 'site'));
