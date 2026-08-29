import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
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
  '.m4a': 'audio/mp4',
};

// Files served as a byte range rather than read whole. The soundtrack is
// ~80MB: without this the browser has to hold the entire file before the
// <audio> element can play, and seeking within it does not work at all.
const RANGED = new Set(['.m4a']);

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
      const ext = path.extname(file);
      const type = TYPES[ext] ?? 'application/octet-stream';

      if (RANGED.has(ext)) {
        const { size } = await stat(file);
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
        // Long-lived and content-addressed by name, unlike the source under
        // /js which is no-store so edits show up on reload.
        const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=604800' };
        if (!m) {
          res.writeHead(200, { ...headers, 'content-length': size });
          createReadStream(file).pipe(res);
          return;
        }
        // An open-ended `bytes=N-` asks for everything from N on, which is
        // what a media element sends first.
        const start = m[1] ? Number(m[1]) : 0;
        const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
        if (start >= size || start > end) {
          res.writeHead(416, { 'content-range': `bytes */${size}` });
          res.end();
          return;
        }
        res.writeHead(206, {
          ...headers,
          'content-range': `bytes ${start}-${end}/${size}`,
          'content-length': end - start + 1,
        });
        createReadStream(file, { start, end }).pipe(res);
        return;
      }

      const data = await readFile(file);
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  })
  .listen(port, () => {
    console.log(`VOID ARENA running at http://localhost:${port}`);
  });