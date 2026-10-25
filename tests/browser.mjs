// Dependency-free browser smoke test, using an installed Chromium browser's DevTools protocol.
import { spawn } from 'node:child_process';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = path.join(root, '.qa');
await mkdir(artifacts, { recursive: true });
const candidates = [process.env.CHROME_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean);
let executable;
for (const candidate of candidates) { try { await access(candidate); executable = candidate; break; } catch {} }
if (!executable) throw new Error('Set CHROME_PATH to an installed Chrome, Edge, or Chromium executable.');
const port = 4174, debugPort = 9223;
const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root, windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: 'pipe' });
let serverLogs = '';
server.stdout.on('data', data => { serverLogs += data; });
server.stderr.on('data', data => { serverLogs += data; });
let browser, ws;
let browserLogs = '';
const errors = [];
const checks = [];
const pending = new Map();
let sequence = 0;
async function poll(fn, message, attempts = 100) {
  for (let i = 0; i < attempts; i++) { try { const result = await fn(); if (result) return result; } catch {} await delay(100); }
  throw new Error(`Timed out: ${message}. ${serverLogs} ${browserLogs.slice(-1500)}`);
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + JSON.stringify(result.exceptionDetails.exception));
  return result.result.value;
}
async function navigate(route = '/') {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}${route}` });
  await poll(() => evaluate(route === '/' ? `document.documentElement.dataset.ready === 'true'` : `document.readyState === 'complete' && location.pathname === ${JSON.stringify(route)}`), `load ${route}`);
}
async function setInput(id, value) {
  await evaluate(`(() => {const e=document.getElementById(${JSON.stringify(id)}); e.value=${JSON.stringify(String(value))}; e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const content = id => evaluate(`document.getElementById(${JSON.stringify(id)}).textContent`);
function check(name, condition) { assert.ok(condition, name); checks.push(name); console.log(`PASS ${name}`); }
async function viewport(width, height) { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }); }
async function screenshot(name, full = true) {
  const metrics = await send('Page.getLayoutMetrics');
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(full ? { clip: { x: 0, y: 0, width: metrics.cssContentSize.width, height: metrics.cssContentSize.height, scale: 1 } } : {}) });
  await writeFile(path.join(artifacts, name), Buffer.from(shot.data, 'base64'));
}
try {
  await poll(async () => (await fetch(`http://127.0.0.1:${port}`)).ok, 'preview server');
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(artifacts, 'browser-profile')}`, 'about:blank'], { windowsHide: true, stdio: 'pipe' });
  browser.stderr.on('data', data => { browserLogs += data; });
  browser.on('error', error => { browserLogs += error.message; });
  const targets = await poll(async () => { const data = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json(); return data.some(t => t.type === 'page') ? data : null; }, 'browser debugging');
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id); pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry);
    if (message.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
  });
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await viewport(1440, 1050);
  await navigate();
  await evaluate('localStorage.clear()');
  await navigate();
  check('Default result $63,000 and +$115.38 per paycheck', (await content('annual-result')) === '$63,000.00' && (await content('paycheck-result')) === '+$115.38');
  await screenshot('desktop.png');
  await screenshot('desktop-preview.png', false);
  await setInput('frequency', 'semimonthly');
  check('Twice-monthly result $125', (await content('paycheck-result')) === '+$125.00');
  await click('[data-mode="target"]');
  await setInput('raise', 72000);
  check('Reverse calculation yields 20%', (await content('percent-badge')).includes('+20%'));
  await click('#save-scenario');
  check('Save dialog opens', await evaluate('document.getElementById("save-dialog").open'));
  await setInput('scenario-name', 'Annual review');
  await click('#save-form button[type="submit"]');
  check('Named scenario saved and rendered', (await content('saved-count')) === '1' && (await content('saved-list')).includes('Annual review'));
  await delay(350);
  await navigate();
  check('Inputs and saved scenario survive reload', (await content('annual-result')) === '$72,000.00' && (await content('saved-count')) === '1');
  await click('[data-preset="8"]');
  await click('#save-scenario'); await setInput('scenario-name', 'Stretch goal'); await click('#save-form button[type="submit"]');
  check('Second scenario is independent', (await content('saved-count')) === '2' && (await content('saved-list')).includes('$72,000') && (await content('saved-list')).includes('$64,800'));
  await click('.scenario-load');
  check('Saved scenario loads original inputs', (await content('annual-result')) === '$72,000.00');
  await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: artifacts });
  await click('#export');
  await poll(async () => { try { await access(path.join(artifacts, 'raisewise-scenarios.csv')); return true; } catch { return false; } }, 'CSV download');
  check('CSV export downloads', true);
  await click('#remember');
  await setInput('pay', 90000);
  await delay(350);
  await navigate();
  check('Remember-off removes salary inputs while retaining scenarios', (await content('annual-result')) === '$63,000.00' && (await content('saved-count')) === '2' && !(await evaluate('document.getElementById("remember").checked')));
  await setInput('pay', '');
  check('Empty input displays validation and disables saving', await evaluate('document.getElementById("save-scenario").disabled && !document.getElementById("result-error").hidden && document.getElementById("pay").getAttribute("aria-invalid") === "true"'));
  await click('#reset');
  await click('[data-basis="hourly"]');
  await setInput('pay', 25); await setInput('hours', 30); await setInput('weeks', 48); await setInput('raise', 8);
  check('Hourly schedule produces $38,880', (await content('annual-result')) === '$38,880.00');
  await setInput('raise', -10);
  check('Negative raise has negative result and correct wording', (await content('paycheck-result')).startsWith('-$') && (await content('paycheck-label')) === 'Less in every paycheck');
  await click('#reset'); await click('#inflation-enabled');
  check('Inflation-adjusted calculation is visible', (await content('inflation-result')).includes('+1.94%'));
  await click('#reset');
  await evaluate('document.getElementById("toast").hidden = true');
  await screenshot('desktop-saved.png');
  for (const [width, height] of [[768, 1024], [390, 844], [320, 740]]) {
    await viewport(width, height);
    await evaluate('window.scrollTo(0,0)');
    await delay(100);
    const dimensions = await evaluate('({width: innerWidth, scroll: document.documentElement.scrollWidth})');
    check(`No horizontal overflow at ${width}px`, dimensions.scroll <= dimensions.width);
    if (width === 390) {
      check('Mobile shows a live result while editing inputs', await evaluate('!document.getElementById("mobile-result").hidden && getComputedStyle(document.getElementById("mobile-result")).display !== "none"'));
      await screenshot('mobile.png');
      await screenshot('mobile-preview.png', false);
      await click('#view-result');
      await delay(650);
      check('Mobile view-result button brings full result into view', await evaluate('document.getElementById("result-panel").getBoundingClientRect().top < 80 && document.getElementById("mobile-result").hidden'));
    }
  }
  await viewport(1440, 1050);
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  check('Print stylesheet hides controls', await evaluate('getComputedStyle(document.querySelector(".input-panel")).display === "none" && getComputedStyle(document.querySelector(".result-panel")).display !== "none"'));
  await screenshot('print.png');
  await send('Emulation.setEmulatedMedia', { media: '' });
  for (const route of ['/about/', '/methodology/', '/privacy/']) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`);
    check(`${route} returns HTML`, response.status === 200 && (await response.text()).includes('<h1>'));
  }
  const notFound = await fetch(`http://127.0.0.1:${port}/missing-page`);
  check('Missing route returns a real 404', notFound.status === 404);
  await evaluate('localStorage.setItem("raisewise.scenarios.v1", "broken json")');
  await navigate();
  check('Corrupt browser storage does not break calculator', (await content('saved-count')) === '0' && (await content('paycheck-result')) === '+$115.38');
  check('No browser JavaScript or CSP errors', errors.length === 0);
  await writeFile(path.join(artifacts, 'browser-report.json'), JSON.stringify({ checks, errors, browser: executable }, null, 2));
  console.log(`Browser QA passed: ${checks.length} checks. Screenshots: ${artifacts}`);
} finally {
  if (ws?.readyState === 1) { try { await send('Browser.close'); } catch {} ws.close(); }
  browser?.kill(); server.kill();
}
