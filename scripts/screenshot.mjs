// Renders docs/demo.png (page with the extension running) and docs/popup.png.
// Run with: node scripts/screenshot.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(root, 'extension');
const demo = fs.readFileSync(path.join(root, 'test/fixtures/demo.html'));

const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(demo); });
await new Promise(r => server.listen(0, '127.0.0.1', r));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ssb-shot-'));
const ctx = await chromium.launchPersistentContext(profile, {
  headless: true, channel: 'chromium', viewport: { width: 900, height: 800 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = sw.url().split('/')[2];

fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForTimeout(500);
const hidden = await page.evaluate(() => document.querySelectorAll('[data-ssb="blur"]').length);
await page.screenshot({ path: path.join(root, 'docs/demo.png') });

// The popup reads its count from the active tab, which here is the popup itself,
// so fill in the real count from the demo page.
const pop = await ctx.newPage();
await pop.setViewportSize({ width: 320, height: 560 });
await pop.goto(`chrome-extension://${extId}/popup.html`);
await pop.waitForTimeout(400);
await pop.evaluate(n => { document.body.classList.remove('tab'); document.getElementById('status').innerHTML = `<b>${n}</b> items hidden on this page.`; }, hidden);
await pop.screenshot({ path: path.join(root, 'docs/popup.png'), fullPage: true });

await ctx.close();
server.close();
fs.rmSync(profile, { recursive: true, force: true });
console.log(`docs/demo.png (${hidden} blurred), docs/popup.png`);
// Compose with: python3 scripts/compose.py
