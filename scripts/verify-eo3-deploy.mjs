// Check the published entry page as well as the upload: a stale CDN page can
// reference deleted chunks even when Neocities reports a successful deployment.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const origin = process.argv[2] || 'https://dev.vayne.garden';
const expected = await readFile('out/eo3/index.html');
const sha1 = body => createHash('sha1').update(body).digest('hex');
const expectedHash = sha1(expected);
const key = process.env.NEOCITIES_API_KEY;

if (key) {
  const response = await fetch('https://neocities.org/api/list?path=eo3', {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30_000),
  });
  assert.ok(response.ok, `Neocities file listing returned ${response.status}`);
  const listing = await response.json();
  assert.equal(listing.result, 'success', 'Neocities file listing failed');
  const entry = listing.files.find(file => file.path === 'eo3/index.html');
  assert.equal(entry?.sha1_hash, expectedHash, 'Uploaded EO3 entry page does not match the build');
  console.log(`Uploaded EO3 entry verified: ${expectedHash}, updated ${entry.updated_at}`);
}

for (let attempt = 0; attempt < 6; attempt++) {
  if (attempt) await delay(15_000);
  const response = await fetch(`${origin}/eo3/`, {
    headers: { 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(30_000),
  });
  const actualHash = sha1(Buffer.from(await response.arrayBuffer()));
  if (response.ok && actualHash === expectedHash) {
    console.log(`Live EO3 entry verified at ${origin}/eo3/`);
    process.exit(0);
  }
  console.log(`Live EO3 entry attempt ${attempt + 1}: HTTP ${response.status}, SHA-1 ${actualHash}, modified ${response.headers.get('last-modified')}, CDN ${response.headers.get('x-neocities-cdn')}, cache ${response.headers.get('x-cached')}`);
}
throw new Error('The uploaded EO3 entry is current, but the public entry page is still stale. Check the Neocities CDN cache before treating this deployment as live.');
