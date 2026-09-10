// Shared rig for the browser tests. Everything in here exists because a test
// that only runs on one laptop is not a test - these suites now run on CI,
// where none of the three things below can be assumed.
//
//   ROOT          the repo, found from THIS file rather than from cwd. The
//                 tests used to spawn a bare relative 'server.js', which
//                 resolves against whatever directory node was launched from,
//                 so `node test/boss.mjs` worked from the repo root and
//                 nowhere else. boss.mjs papered over it with an absolute path
//                 to one particular Desktop.
//   CHROME        puppeteer-core ships no browser, so somebody has to say
//                 where one is. The old fallback was a macOS-only path.
//   startServer   one spawn, one cwd, one place to change.
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Checked in order. The env vars come first so any machine with Chrome
// somewhere unusual - or a CI action that installs it and reports the path -
// can say so without editing this list. CHROME is ours; the other two are the
// names puppeteer itself honours, and a runner that sets them should not have
// to set a third.
const ENV_KEYS = ['CHROME', 'CHROME_PATH', 'PUPPETEER_EXECUTABLE_PATH'];

const CANDIDATES = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
};

function resolveChrome() {
  for (const key of ENV_KEYS) {
    const v = process.env[key];
    // An env var is taken at its word even if the file is missing: the point
    // of an override is to work in cases this file cannot predict, and
    // puppeteer's own launch error names the path better than a guess here.
    if (v) return v;
  }
  const list = CANDIDATES[process.platform] ?? CANDIDATES.linux;
  for (const p of list) if (existsSync(p)) return p;
  throw new Error(
    `No Chrome found for platform "${process.platform}". Looked at:\n` +
      list.map((p) => `  ${p}`).join('\n') +
      `\nSet CHROME=/path/to/chrome (or CHROME_PATH / PUPPETEER_EXECUTABLE_PATH).`,
  );
}

export const CHROME = resolveChrome();

// Absolute script path AND an explicit cwd. Either alone would do for finding
// server.js, but the cwd is what a test would need if it ever read a file
// relative to the repo, so both are pinned.
export function startServer(port, { stdio = 'ignore' } = {}) {
  return spawn(process.execPath, [path.join(ROOT, 'server.js'), String(port)], {
    cwd: ROOT,
    stdio,
  });
}

// Every suite launches the same browser the same way, so it is launched here.
//
// protocolTimeout is the one that matters. It caps how long puppeteer will
// wait for a SINGLE CDP call - one page.evaluate - and it defaults to 180s.
// These suites drive a real game through software GL, and on a two-core CI
// runner a long evaluate can sit past three minutes and be killed mid-call,
// which surfaces as a ProtocolError rather than as a failed assertion. The
// per-suite cap in test/all.mjs is the real backstop; this just stops a slow
// host from being reported as a broken test.
// Twenty minutes. brine and versus both died on the old ten, and tempest
// PASSED at 582s of it - seventeen seconds of headroom, which is not headroom.
// The number is not a performance budget and should not be read as one: these
// suites take 84s and 107s on a developer machine, and the runner is five to
// seven times slower than that with no GPU. What actually stops a hung suite
// is the per-suite cap in test/all.mjs, which is deliberately set above this
// so a genuinely stuck evaluate reports a ProtocolError naming itself rather
// than being SIGKILLed anonymously.
export const PROTOCOL_TIMEOUT = Number(process.env.PROTOCOL_TIMEOUT || 1200) * 1000;

// A CI runner has no GPU: the game rasterizes every frame on a shared vCPU
// through swiftshader, so the FIRST page load - shaders, geometry, the whole
// scene graph - can sit well past puppeteer's 30s navigation default. That is
// a separate clock from protocolTimeout and has to be set on the page.
export const NAV_TIMEOUT = Number(process.env.NAV_TIMEOUT || 120) * 1000;

export async function launchBrowser(extra = {}) {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME,
    protocolTimeout: PROTOCOL_TIMEOUT,
    // swiftshader because CI runners have no GPU; the sandbox and /dev/shm
    // flags because they have no user namespaces and a small shared memory.
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
    ],
    ...extra,
  });
  // Every suite makes its page the same way, so the timeouts are applied here
  // rather than asking 28 files to remember.
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...a) => {
    const page = await newPage(...a);
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    page.setDefaultTimeout(NAV_TIMEOUT);
    return page;
  };
  return browser;
}
