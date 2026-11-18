// End-to-end test: loads the unpacked extension in Chromium and checks real pages.
// Run with: npm test
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(here, '..', 'extension');
const FIXTURES = path.join(here, 'fixtures');

// Tiny static server for the fixture pages.
const server = http.createServer((req, res) => {
  const file = path.join(FIXTURES, path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(FIXTURES) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ssb-test-'));
const ctx = await chromium.launchPersistentContext(profile, {
  headless: true,
  channel: 'chromium', // the new headless mode, which supports extensions
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
});

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`); }
}

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/index.html`);
  await page.waitForTimeout(400);
  const state = id => page.evaluate(id => document.getElementById(id)?.getAttribute('data-ssb') ?? null, id);

  console.log('matching');
  await check('blurs a card whose headline mentions GTA 6', async () => assert.equal(await state('c1'), 'blur'));
  await check('catches "GTA6" written without a space', async () => assert.equal(await state('c4'), 'blur'));
  await check('catches a keyword in image alt text', async () => assert.equal(await state('c3'), 'blur'));
  await check('catches a keyword split across <b> tags', async () => assert.equal(await state('c5'), 'blur'));
  await check('catches a list item right after another item', async () => assert.equal(await state('nav2'), 'blur'));
  await check('catches "#GTA6" glued to an inline <small> line', async () => assert.equal(await state('t1'), 'blur'));
  await check('catches a word split by a highlight tag', async () => assert.equal(await state('t2'), 'blur'));
  await check('leaves a neighbouring harmless trend alone', async () => assert.equal(await state('t3'), null));
  await check('leaves unrelated cards alone', async () => assert.equal(await state('c2'), null));
  await check('no false positives on gtag / regatta / GTAs', async () => assert.equal(await state('fp1'), null));
  await check('"rockstar" alone does not match "rockstar games"', async () => assert.equal(await state('fp2'), null));
  await check('never touches input fields', async () => assert.equal(await state('search'), null));

  console.log('dynamic content');
  await page.waitForFunction(() => window.__mutated);
  await page.waitForTimeout(200);
  await check('blurs items added after load', async () => {
    assert.equal(await state('d1'), 'blur');
    assert.equal(await state('d3'), 'blur');
    assert.equal(await state('d2'), null);
  });
  await check('unblurs a recycled card that now has harmless text', async () => assert.equal(await state('c4'), null));
  await check('blurs a card whose text changes into a spoiler', async () => assert.equal(await state('c2'), 'blur'));

  console.log('click to reveal');
  const linkPage = await ctx.newPage();
  await linkPage.goto(`${BASE}/link.html`);
  await linkPage.waitForTimeout(400);
  const box = await linkPage.locator('#a1').boundingBox();
  await linkPage.mouse.click(box.x + 5, box.y + 5);
  await linkPage.waitForTimeout(300);
  await check('first click reveals instead of following the link', async () => {
    assert.match(linkPage.url(), /link\.html$/);
    assert.equal(await linkPage.getAttribute('#L1', 'data-ssb'), 'revealed');
  });
  await linkPage.mouse.click(box.x + 5, box.y + 5);
  await linkPage.waitForTimeout(400);
  await check('second click works like normal', async () => assert.match(linkPage.url(), /gta\.html$/));

  console.log('page warning');
  const guardPage = await ctx.newPage();
  await guardPage.goto(`${BASE}/gta.html`);
  await guardPage.waitForTimeout(300);
  await check('shows a full-page warning when the title is about a keyword', async () =>
    assert.ok(await guardPage.evaluate(() => !!document.querySelector('ssb-guard'))));

  console.log('settings');
  await sw.evaluate(() => chrome.storage.sync.set({ keywords: [...self.SSB_DEFAULTS.keywords, 'energy drink'], mode: 'hide' }));
  await page.waitForTimeout(400);
  await check('picks up new keywords and hide mode live', async () => {
    assert.equal(await state('c1'), 'hide');
    assert.equal(await state('fp2'), 'hide');
  });
  await sw.evaluate(() => chrome.storage.sync.set({ disabledSites: ['127.0.0.1'] }));
  await page.waitForTimeout(400);
  await check('pausing a site removes everything', async () =>
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-ssb]').length), 0));
  await sw.evaluate(() => chrome.storage.sync.set({ ...self.SSB_DEFAULTS }));

  console.log('performance');
  const perf = await ctx.newPage();
  await perf.goto(`${BASE}/perf.html`);
  await perf.waitForTimeout(300);
  const result = await perf.evaluate(() => window.runPerf());
  await check(`catches all 50 of 5000 streamed items (${result.ms} ms)`, async () => assert.equal(result.hidden, 50));

  await check('no page errors', async () => assert.deepEqual(errors, []));
} finally {
  await ctx.close();
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
