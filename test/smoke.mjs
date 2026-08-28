import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const PORT = 8199;
const CHROME =
  process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!existsSync(CHROME)) {
  console.error('No Chrome found. Set CHROME env to a Chrome/Chromium binary.');
  process.exit(2);
}

const server = spawn(process.execPath, ['server.js', String(PORT)], { stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 800));

let browser;
try {
  browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 22000));

  const rep = await page.evaluate(() => window.__report());
  await page.screenshot({ path: 'test/shot.png' });

  console.log('REPORT', JSON.stringify(rep, null, 2));
  console.log('CONSOLE ERRORS', JSON.stringify(errors, null, 2));

  const benign = (e) =>
    /AudioContext|swiftshader|WebGL|GpuChannel|passthrough|GPU stall|font/i.test(e);
  const fatal = errors.filter((e) => !benign(e));

  const ok =
    rep &&
    (rep.state === 'playing' || rep.state === 'gameover') &&
    rep.spawned > 0 &&
    rep.shots > 0 &&
    rep.hits > 0 &&
    fatal.length === 0;

  console.log(ok ? 'SMOKE TEST PASS' : 'SMOKE TEST FAIL');
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  console.error('TEST RUNNER ERROR', e);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
}