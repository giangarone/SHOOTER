// Worktree-safe item checks. New item mechanics get one fragment under
// test/items/{passive,active}/<id>.mjs; this suite discovers every fragment so
// adding one never edits a shared test registry or package script.
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser, ROOT, startServer } from './harness.mjs';
import { buildPages } from '../tools/build-pages.mjs';
import { DONATION_ITEMS } from '../js/items/donation/index.js';

const PORT = 8249;
const PAGES_PORT = 8250;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

function startPagesServer(root) {
  const types = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.m4a': 'audio/mp4',
    '.ttf': 'font/ttf',
  };
  return http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://local').pathname;
      if (!pathname.startsWith('/SHOOTER/')) throw new Error('outside mount');
      const relative = decodeURIComponent(pathname.slice('/SHOOTER/'.length)) || 'index.html';
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep)) throw new Error('outside root');
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  }).listen(PAGES_PORT);
}

let browser;
let pagesServer;
let fails = 0;
const check = (name, condition, extra = '') => {
  console.log((condition ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!condition) fails++;
};

async function fragments(parts, kind) {
  const dir = path.join(ROOT, 'test', 'items', ...parts);
  const files = await readdir(dir).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  return files
    .filter((file) => /^[A-Za-z_$][\w$]*\.mjs$/.test(file))
    .sort()
    .map((file) => ({ kind, id: file.slice(0, -4), file: path.join(dir, file) }));
}

try {
  check('Node discovers one shared donation catalogue',
    Object.keys(DONATION_ITEMS).length > 0,
    `donation=${Object.keys(DONATION_ITEMS).length}`);
  browser = await launchBrowser();
  const page = await browser.newPage();
  const errors = [];
  const directDefinitionRequests = [];
  const opaqueModuleRequests = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push('PAGEERROR: ' + error.message));
  page.on('request', (request) => {
    const url = request.url();
    if (/\/js\/items\/(?:passive|active|donation)\/definitions\//.test(url)) directDefinitionRequests.push(url);
    if (/\/js\/items\/(?:passive|active|donation)\/modules\/[a-f0-9]{64}\.js$/.test(url)) opaqueModuleRequests.push(url);
  });
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await sleep(1500);

  const catalogue = await page.evaluate(() => ({
    passive: Object.keys(window.__game.__passiveItemsForTest),
    active: Object.keys(window.__game.__activeItemsForTest),
    donation: Object.keys(window.__game.__donationItemsForTest),
  }));
  const catalogueTotal = Object.values(catalogue).reduce((n, ids) => n + ids.length, 0);
  check('the directory-driven item catalogues boot',
    catalogue.passive.length > 0 && catalogue.active.length > 0
      && catalogue.donation.length === Object.keys(DONATION_ITEMS).length,
    `${catalogue.passive.length} passive / ${catalogue.active.length} active / ${catalogueTotal - catalogue.passive.length - catalogue.active.length} donation`);
  check('browser item URLs are opaque to content blockers',
    directDefinitionRequests.length === 0
      && opaqueModuleRequests.length === catalogueTotal,
    `${directDefinitionRequests.length} named / ${opaqueModuleRequests.length} opaque`);
  check('Magpie loads without exposing magpie.js in a request URL',
    catalogue.passive.includes('magpie')
      && !opaqueModuleRequests.some((url) => url.toLowerCase().includes('magpie')));

  const all = [
    ...await fragments(['passive'], 'passive'),
    ...await fragments(['active'], 'active'),
    ...await fragments(['donation'], 'donation'),
  ];
  for (const fragment of all) {
    check(`${fragment.kind} fragment names a real item`,
      catalogue[fragment.kind].includes(fragment.id), fragment.id);
    const module = await import(pathToFileURL(fragment.file).href);
    if (typeof module.run !== 'function') {
      check(`${fragment.kind}/${fragment.id} exports run()`, false);
      continue;
    }
    await module.run({ page, check, id: fragment.id, kind: fragment.kind });
  }

  check('no console errors', errors.length === 0, errors.join(' | '));

  const built = await buildPages();
  pagesServer = startPagesServer(built.output);
  await sleep(300);
  const pagesPage = await browser.newPage();
  const pagesErrors = [];
  const pagesNamedRequests = [];
  const pagesOpaqueRequests = [];
  pagesPage.on('console', (message) => {
    if (message.type() === 'error') pagesErrors.push(message.text());
  });
  pagesPage.on('pageerror', (error) => pagesErrors.push('PAGEERROR: ' + error.message));
  pagesPage.on('request', (request) => {
    const url = request.url();
    if (/\/js\/items\/(?:passive|active|donation)\/definitions\//.test(url)) pagesNamedRequests.push(url);
    if (/\/js\/items\/(?:passive|active|donation)\/modules\/[a-f0-9]{64}\.js$/.test(url)) {
      pagesOpaqueRequests.push(url);
    }
  });
  await pagesPage.goto(`http://127.0.0.1:${PAGES_PORT}/SHOOTER/?autotest`, {
    waitUntil: 'load', timeout: 30000,
  });
  await sleep(1500);
  const pagesCatalogue = await pagesPage.evaluate(() => ({
    passive: Object.keys(window.__game.__passiveItemsForTest),
    active: Object.keys(window.__game.__activeItemsForTest),
    donation: Object.keys(window.__game.__donationItemsForTest),
  }));
  const pagesTotal = Object.values(pagesCatalogue).reduce((n, ids) => n + ids.length, 0);
  check('the generated GitHub Pages site boots below a project path',
    Object.keys(catalogue).every((kind) =>
      pagesCatalogue[kind].length === catalogue[kind].length
    ),
    `${pagesCatalogue.passive.length} passive / ${pagesCatalogue.active.length} active / ${pagesTotal - pagesCatalogue.passive.length - pagesCatalogue.active.length} donation`);
  check('the Pages artifact uses only opaque item module URLs',
    pagesNamedRequests.length === 0
      && pagesOpaqueRequests.length === pagesTotal,
    `${pagesNamedRequests.length} named / ${pagesOpaqueRequests.length} opaque`);
  check('the generated Pages site has no console errors',
    pagesErrors.length === 0, pagesErrors.join(' | '));
} finally {
  if (browser) await browser.close();
  if (pagesServer) pagesServer.close();
  server.kill();
}

console.log(fails ? 'ITEM MODULE TEST FAIL' : 'ITEM MODULE TEST PASS');
process.exit(fails ? 1 : 0);
