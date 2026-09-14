// Worktree-safe item checks. New item mechanics get one fragment under
// test/items/{passive,active}/<id>.mjs; this suite discovers every fragment so
// adding one never edits a shared test registry or package script.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser, ROOT, startServer } from './harness.mjs';

const PORT = 8249;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const check = (name, condition, extra = '') => {
  console.log((condition ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!condition) fails++;
};

async function fragments(kind) {
  const dir = path.join(ROOT, 'test', 'items', kind);
  return (await readdir(dir))
    .filter((file) => /^[A-Za-z_$][\w$]*\.mjs$/.test(file))
    .sort()
    .map((file) => ({ kind, id: file.slice(0, -4), file: path.join(dir, file) }));
}

try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  const errors = [];
  const directDefinitionRequests = [];
  const opaqueModuleRequests = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push('PAGEERROR: ' + error.message));
  page.on('request', (request) => {
    const url = request.url();
    if (/\/js\/items\/(passive|active)\/definitions\//.test(url)) directDefinitionRequests.push(url);
    if (/\/js\/items\/(passive|active)\/modules\/[a-f0-9]{64}\.js$/.test(url)) opaqueModuleRequests.push(url);
  });
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await sleep(1500);

  const catalogue = await page.evaluate(() => ({
    passive: Object.keys(window.__game.__passiveItemsForTest),
    active: Object.keys(window.__game.__activeItemsForTest),
  }));
  check('the directory-driven item catalogues boot',
    catalogue.passive.length > 0 && catalogue.active.length > 0,
    `${catalogue.passive.length} passive / ${catalogue.active.length} active`);
  check('browser item URLs are opaque to content blockers',
    directDefinitionRequests.length === 0
      && opaqueModuleRequests.length === catalogue.passive.length + catalogue.active.length,
    `${directDefinitionRequests.length} named / ${opaqueModuleRequests.length} opaque`);
  check('Magpie loads without exposing magpie.js in a request URL',
    catalogue.passive.includes('magpie')
      && !opaqueModuleRequests.some((url) => url.toLowerCase().includes('magpie')));

  const all = [...await fragments('passive'), ...await fragments('active')];
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
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(fails ? 'ITEM MODULE TEST FAIL' : 'ITEM MODULE TEST PASS');
process.exit(fails ? 1 : 0);
