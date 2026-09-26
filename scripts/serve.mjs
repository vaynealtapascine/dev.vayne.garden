// Tiny static server for looking at a build locally: `node scripts/serve.mjs [dir] [port]`.
// Mirrors Neocities closely enough: `/foo/` serves `/foo/index.html`, unknown paths get not_found.html.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'out');
const port = Number(process.argv[3] ?? 5270);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
  '.toml': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  let file = path.join(root, clean);
  if (!file.startsWith(root)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  return fs.existsSync(file) ? file : null;
}

http
  .createServer((req, res) => {
    const file = resolve(req.url);
    if (!file) {
      const missing = path.join(root, 'not_found.html');
      res.writeHead(404, { 'content-type': types['.html'] });
      res.end(fs.existsSync(missing) ? fs.readFileSync(missing) : 'not found');
      return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, '127.0.0.1', () => console.log(`serving ${root} at http://127.0.0.1:${port}/`));
