import fs from 'node:fs';
import path from 'node:path';

const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

/** Render the gallery from the EO3 build, keeping its documents and downloads in sync. */
export function buildEo3Gallery(examplesDir, out) {
  if (!fs.existsSync(path.join(examplesDir, 'catalog.json'))) {
    throw new Error('EO3 example exports are missing. Build the current EO3 app first, or set EO3_EXAMPLES_DIR to its dist/workskin-examples directory.');
  }
  const catalog = JSON.parse(fs.readFileSync(path.join(examplesDir, 'catalog.json'), 'utf8'));
  const about = path.join(out, 'eo3/about');
  fs.cpSync(examplesDir, path.join(about, 'examples'), { recursive: true });
  const cards = catalog.map((item, index) => {
    const id = escape(item.id), title = escape(item.title), file = escape(item.file);
    return `<article class="eo3-example" data-category="${escape(item.category)}">
  <div class="eo3-example-top"><span>${String(index + 1).padStart(2, '0')} / ${escape(item.category)}</span><span>Plain text → workskin</span></div>
  <iframe src="/eo3/about/examples/${id}-preview.html" title="${title} example preview" sandbox="allow-same-origin" loading="lazy" data-example-preview></iframe>
  <div class="eo3-example-info"><h3>${title}</h3><p>${escape(item.description)}</p><p class="eo3-writing-syntax"><code>${escape(item.syntax)}</code></p>
    <div class="eo3-example-links"><a class="eo3-open-example" href="/eo3/?example=${file}">Open in EO3 ↗</a><a href="/eo3/about/examples/${file}" download>Document ↓</a><a href="/eo3/about/examples/${id}-preview.html" target="_blank" rel="noopener">Full preview ↗</a></div>
    <details class="eo3-writing-guide"><summary>What you type</summary><p>${escape(item.writingGuide)}</p><pre><code>${escape(item.writing)}</code></pre><p><a href="/eo3/about/examples/writing-lab.html?example=${id}" target="_blank" rel="noopener">Try writing this example ↗</a></p></details>
    <details class="eo3-example-tip"><summary>Reuse &amp; download</summary><p>${escape(item.tip)}</p><p><a href="/eo3/about/examples/${id}.eo3group.json" download>Reusable group ↓</a> · <a href="/eo3/about/examples/${id}.txt" download>Writing input ↓</a><br><a href="/eo3/about/examples/${id}.html" download>Chapter HTML ↓</a> · <a href="/eo3/about/examples/${id}.css" download>Workskin CSS ↓</a></p></details>
  </div>
</article>`;
  }).join('\n');
  const file = path.join(about, 'index.html');
  const page = fs.readFileSync(file, 'utf8');
  if (!page.includes('<!-- EO3_GALLERY -->')) throw new Error('EO3 gallery placeholder is missing.');
  fs.writeFileSync(file, page.replace('<!-- EO3_GALLERY -->', cards));
  console.log(`Added EO3 about page with ${catalog.length} live examples and downloads.`);
}
