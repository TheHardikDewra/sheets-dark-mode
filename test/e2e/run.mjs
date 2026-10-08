// End-to-end test of the packaged extension in Chrome for Testing against a local mock of Sheets.
// usage: node test/e2e/run.mjs <chrome-binary> <puppeteer-core-dir>
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const [chromeBin, ppDir] = process.argv.slice(2);
const require = createRequire(path.join(ppDir, 'package.json'));
const puppeteer = require('puppeteer-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// test build: same extension, plus permission to run on the local mock
const ext = mkdtempSync(path.join(tmpdir(), 'nightcell-ext-'));
cpSync(path.join(root, 'extension'), ext, { recursive: true });
const man = JSON.parse(readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
const LOCAL = 'http://127.0.0.1:8765/spreadsheets/*';
man.host_permissions.push(LOCAL);
man.content_scripts.forEach((cs) => cs.matches.push(LOCAL));
writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(man, null, 2));

const html = readFileSync(path.join(root, 'test/e2e/mock-sheet.html'));
const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); }).listen(8765, '127.0.0.1');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const rgb = async (page, id, x, y) => page.evaluate((id, x, y) => Array.from(document.getElementById(id).getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3), id, x, y);
const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); // WCAG relative luminance
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: chromeBin, headless: 'new',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--no-first-run', '--no-default-browser-check'],
  userDataDir: mkdtempSync(path.join(tmpdir(), 'nightcell-profile-')) });
try {
  const sw = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('src/background.js'), { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  check('service worker starts', !!extId, extId);
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 700 });
  await page.goto('http://127.0.0.1:8765/spreadsheets/d/TESTDOC/edit', { waitUntil: 'load' });
  await sleep(800);
  check('html marked on + graphite', (await page.evaluate(() => [document.documentElement.dataset.nightcell, document.documentElement.dataset.nightcellTheme].join())) === 'on,graphite');
  check('first paint already dark (no white flash)', lum((await page.evaluate(() => window.__firstPaintBg)).split(',').map(Number)) < 0.03, await page.evaluate(() => window.__firstPaintBg));
  const cell = await rgb(page, 'grid', 700, 200); check('default cell is dark', lum(cell) < 0.03, cell.join());
  const head = await rgb(page, 'grid', 300, 20); check('dark header band stays a distinct slate', lum(head) > lum(cell) && lum(head) < 0.1, head.join());
  const pastel = await rgb(page, 'grid', 300, 100); check('pastel fill becomes a dark tint (red > blue)', lum(pastel) < 0.05 && pastel[0] > pastel[2], pastel.join());
  const bar = await rgb(page, 'grid', 615, 150); check('sparkline-like bar is lifted (visible)', lum(bar) > 0.35, bar.join());
  const series = await rgb(page, 'chart', 60, 120); check('chart series colour kept', series.join() === '66,133,244', series.join());
  const cbg = await rgb(page, 'chart', 200, 20); check('chart background darkened', lum(cbg) < 0.03, cbg.join());
  const tb = await page.evaluate(() => getComputedStyle(document.getElementById('docs-toolbar-wrapper')).backgroundColor);
  check('toolbar CSS applied', tb === 'rgb(36, 36, 36)', tb);

  // safety net: a light pop-up the stylesheet has never seen is darkened, hairlines included
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = 'unknown-popup';
    d.style.cssText = 'position:fixed;top:40px;left:40px;width:200px;padding:8px;background:#fff;color:#202124';
    d.innerHTML = '<div id="unknown-row" style="border:1px solid #dadce0;padding:4px">Row</div>';
    document.body.appendChild(d);
  });
  await sleep(800);
  const net = await page.evaluate(() => {
    const cs = (id) => getComputedStyle(document.getElementById(id));
    return [cs('unknown-popup').backgroundColor, cs('unknown-row').color, cs('unknown-row').borderTopColor];
  });
  check('safety net darkens an unknown light pop-up', net[0] === 'rgb(36, 36, 36)' && net[1] === 'rgb(228, 228, 228)', net.slice(0, 2).join(' / '));
  check('safety net darkens its light hairlines', net[2] === 'rgb(58, 58, 58)', net[2]);
  await page.evaluate(() => document.getElementById('unknown-popup').remove());

  // popup: switch theme -> page follows and repaints (zoom nudge -> real resize)
  const paintsBefore = await page.evaluate(() => window.__paints);
  const popup = await browser.newPage();
  await popup.goto(`chrome-extension://${extId}/popup/popup.html`);
  await popup.waitForSelector('#themes [data-v="oled"]');
  await popup.click('#themes [data-v="oled"]');
  await page.bringToFront();   // the real popup overlays the active sheet; a hidden tab defers resize events
  await sleep(1500);
  check('popup -> page theme oled', (await page.evaluate(() => document.documentElement.dataset.nightcellTheme)) === 'oled');
  check('theme change triggered a repaint', (await page.evaluate(() => window.__paints)) > paintsBefore, `${paintsBefore} -> ${await page.evaluate(() => window.__paints)}`);
  const oled = await rgb(page, 'grid', 700, 200); check('cell now OLED black-ish', lum(oled) < lum(cell), oled.join());
  const zoom = await sw.worker().then((w) => w.evaluate(async () => { const [t] = await chrome.tabs.query({ url: 'http://127.0.0.1:8765/*' }); return chrome.tabs.getZoom(t.id); }));
  check('zoom restored after repaint', Math.abs(zoom - 1) < 0.001, String(zoom));

  // switch off -> light again, and a reload boots light synchronously
  await popup.bringToFront();
  await popup.click('#enabled');
  await page.bringToFront();
  await sleep(1500);
  check('off -> html marked off', (await page.evaluate(() => document.documentElement.dataset.nightcell)) === 'off');
  const offCell = await rgb(page, 'grid', 700, 200); check('off -> cell white again', offCell.join() === '255,255,255', offCell.join());
  await page.reload({ waitUntil: 'load' }); await sleep(600);
  check('reload while off boots light (mirror works)', (await page.evaluate(() => window.__firstPaintBg)) === '255,255,255', await page.evaluate(() => window.__firstPaintBg));
  const stored = await sw.worker().then((w) => w.evaluate(() => chrome.storage.sync.get(null)));
  check('settings persisted in chrome.storage.sync', stored.enabled === false && stored.theme === 'oled', JSON.stringify(stored));
} catch (e) { check('no exceptions', false, e.message); }
finally { await browser.close(); server.close(); }
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
