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
  // while scrolling, Sheets repaints only the frozen rows, so a tall white title row is painted
  // far more often than normal rows; a dark cell fill at normal row height must still stay a fill
  await page.evaluate(() => {
    const g = document.getElementById('grid').getContext('2d');
    for (let i = 0; i < 300; i++) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 800, 50); }
    g.fillStyle = '#2563eb'; g.fillRect(0, 127, 300, 40);
  });
  const fill = await rgb(page, 'grid', 150, 150);
  check('dark cell fill stays dark after frozen-row repaints', lum(fill) < 0.05 && fill[2] > fill[0], fill.join());
  await page.evaluate(() => dispatchEvent(new Event('resize'))); // repaint the mock as it was
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

  // a sidebar shaped like the chart editor: thousands of hidden nodes, a white tab bar, a tinted
  // chip, and a row that only turns light grey while "hovered" (a class), like Closure controls
  await page.evaluate(() => {
    const css = document.createElement('style');
    css.textContent = '.t-row.t-hot { background: #e8eaed } .t-head { color: #fff; transition: color .5s } .t-head.t-open { color: #1f1f1f }';
    document.head.appendChild(css);
    const side = document.createElement('div');
    side.className = 'test-sidebar-container';
    side.setAttribute('role', 'complementary');
    side.style.cssText = 'position:fixed;top:60px;right:0;width:300px;height:400px;background:#fff;color:#1f1f1f';
    const hidden = document.createElement('div');
    hidden.style.display = 'none';
    hidden.innerHTML = '<div><span>x</span></div>'.repeat(2500);
    side.innerHTML = '<div id="t-tabs" style="background:#fff;padding:6px"><span id="t-tab-label" style="color:#444746">Customize</span></div>'
      + '<div id="t-chip" style="background:#f0f4f9;border-radius:12px;padding:6px">A4:A16</div>'
      + '<div id="t-row" class="t-row" style="padding:6px">Legend</div>'
      + '<div id="t-head" class="t-head" style="padding:6px">Gridlines and ticks</div>';
    side.appendChild(hidden);
    document.body.appendChild(side);
  });
  await sleep(2500); // adoption runs every 1.5 s
  const big = await page.evaluate(() => {
    const cs = (id) => getComputedStyle(document.getElementById(id));
    return { nodes: document.querySelector('.test-sidebar-container').querySelectorAll('*').length,
      tabs: cs('t-tabs').backgroundColor, label: cs('t-tab-label').color, chip: cs('t-chip').backgroundColor };
  });
  const chip = big.chip.match(/\d+/g).map(Number);
  check('sidebar with 5,000+ mostly hidden nodes is still darkened', big.nodes > 4000 && big.tabs === 'rgb(36, 36, 36)' && big.label === 'rgb(180, 180, 180)', `${big.nodes} nodes, ${big.tabs}, ${big.label}`);
  check('tinted chip keeps its hue as a dark surface', lum(chip) < 0.04 && chip[2] > chip[0] && big.chip !== 'rgb(36, 36, 36)', big.chip);
  await page.evaluate(() => document.getElementById('t-row').classList.add('t-hot'));
  await sleep(100);
  const hot = await page.evaluate(() => getComputedStyle(document.getElementById('t-row')).backgroundColor);
  await page.evaluate(() => document.getElementById('t-row').classList.remove('t-hot'));
  await sleep(100);
  const cold = await page.evaluate(() => getComputedStyle(document.getElementById('t-row')).backgroundColor);
  check('hover state darkens while on, then lets go', hot === 'rgb(42, 42, 42)' && cold === 'rgba(0, 0, 0, 0)', `${hot} -> ${cold}`);
  await page.evaluate(() => document.getElementById('t-head').classList.add('t-open'));
  await sleep(900); // longer than the 0.5 s fade
  const faded = await page.evaluate(() => getComputedStyle(document.getElementById('t-head')).color);
  check('text that fades to dark is read where it lands', faded === 'rgb(228, 228, 228)', faded);
  await page.evaluate(() => document.querySelector('.test-sidebar-container').remove());

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

  // font: a font installed on this computer takes over canvas text and the interface
  const measure = () => page.evaluate(() => {
    const c = document.createElement('canvas').getContext('2d');
    const w = (f) => { c.font = f; return +c.measureText('Hamburgefonstiv 0123').width.toFixed(2); };
    const span = (fam) => { const s = document.createElement('span'); s.textContent = 'Hamburgefonstiv 0123'; s.style.cssText = `position:absolute;left:-9999px;font:400 20px ${fam};white-space:nowrap`; document.body.appendChild(s); const r = s.getBoundingClientRect().width; s.remove(); return +r.toFixed(2); };
    return { arial: w('20px Arial'), georgia: w('20px Georgia'), courier: w('20px "Courier New"'), uiRoboto: span('Roboto'), uiGeorgia: span('Georgia'),
      attr: document.documentElement.hasAttribute('data-nc-font'), fontVar: document.documentElement.style.getPropertyValue('--nc-font') };
  });
  const fontBase = await measure();
  await popup.bringToFront();
  await popup.type('#font', 'Georgia');
  await sleep(1500);
  const foundMsg = await popup.$eval('#fontStatus', (e) => e.textContent);
  check('popup finds an installed font', /^Georgia is installed/.test(foundMsg), foundMsg);
  await page.bringToFront();
  await sleep(1500);
  const fontOn = await measure();
  check('chosen font marks <html> for the editor', fontOn.attr && fontOn.fontVar.includes('"Georgia"'), fontOn.fontVar);
  check('canvas text draws in the chosen font', fontOn.arial === fontBase.georgia && fontBase.arial !== fontBase.georgia, `${fontBase.arial} -> ${fontOn.arial} (Georgia ${fontBase.georgia})`);
  check('monospace canvas text keeps its font', fontOn.courier === fontBase.courier, `${fontOn.courier}`);
  check('interface text switches to the chosen font', fontOn.uiRoboto === fontOn.uiGeorgia && fontBase.uiRoboto !== fontBase.uiGeorgia, `${fontBase.uiRoboto} -> ${fontOn.uiRoboto}`);
  await popup.bringToFront();
  await popup.$eval('#font', (e) => { e.value = ''; });
  await popup.type('#font', 'Nope Font 123');
  await sleep(1200);
  const missingMsg = await popup.$eval('#fontStatus', (e) => e.textContent);
  const keptFont = await sw.worker().then((w) => w.evaluate(() => chrome.storage.sync.get('font')));
  check('a font that is not installed is refused, the last good one stays', /^Nope Font 123 isn't installed/.test(missingMsg) && keptFont.font === 'Georgia', `${missingMsg} / ${keptFont.font}`);
  await popup.click('#fontReset');
  await page.bringToFront();
  await sleep(1500);
  const fontOff = await measure();
  check('reset gives Sheets its own fonts back', !fontOff.attr && fontOff.arial === fontBase.arial && fontOff.uiRoboto === fontBase.uiRoboto, `${fontOff.arial}, ${fontOff.uiRoboto}`);

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
