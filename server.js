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
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
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
        const st = await stat(file);
        // A directory stats perfectly happily, and createReadStream on one
        // fails ASYNCHRONOUSLY with EISDIR - which, with no 'error' listener,
        // is a fatal unhandled event that takes the whole server down. The old
        // readFile path threw inside the try and 404ed; this restores that.
        if (!st.isFile()) {
          res.writeHead(404);
          res.end('not found');
          return;
        }
        const size = st.size;
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
        // Long-lived and content-addressed by name, unlike the source under
        // /js which is no-store so edits show up on reload.
        const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=604800' };

        // pipe() does not forward stream errors, and an unhandled 'error' on a
        // stream is fatal in node. Everything below goes through here.
        const send = (stream) => {
          stream.on('error', () => {
            if (!res.headersSent) res.writeHead(500);
            res.end();
          });
          res.on('close', () => stream.destroy());
          stream.pipe(res);
        };

        // `bytes=-` on its own is malformed; treat it as no range at all.
        if (!m || (!m[1] && !m[2])) {
          res.writeHead(200, { ...headers, 'content-length': size });
          send(createReadStream(file));
          return;
        }

        let start;
        let end;
        if (m[1]) {
          // `bytes=N-` asks for everything from N on, which is what a media
          // element sends first. `bytes=N-M` is the closed form.
          start = Number(m[1]);
          end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
        } else {
          // SUFFIX form `bytes=-N`: the LAST n bytes, per RFC 7233 - NOT the
          // first n. Reading it as a prefix silently served the wrong part of
          // the file with a 206, which a client has no way to detect. Media
          // stacks use this to grab a trailing MP4 index.
          const n = Number(m[2]);
          if (n === 0) {
            res.writeHead(416, { 'content-range': `bytes */${size}` });
            res.end();
            return;
          }
          start = Math.max(0, size - n);
          end = size - 1;
        }

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
        send(createReadStream(file, { start, end }));
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