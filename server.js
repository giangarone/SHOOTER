import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] ?? 8123);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

http
  .createServer(async (req, res) => {
    try {
      let p = new URL(req.url, 'http://local').pathname;
      if (p === '/') p = '/index.html';
      const file = path.normalize(path.join(root, p));
      if (!file.startsWith(root)) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      const data = await readFile(file);
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  })
  .listen(port, () => {
    console.log(`VOID ARENA running at http://localhost:${port}`);
  });