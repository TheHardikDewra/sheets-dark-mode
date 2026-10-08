// Headless checks of Nightcell's colour mapping (node --test test/engine.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadEngine(saved) {
  const store = new Map(saved ? [['nightcell:state:v1', JSON.stringify(saved)]] : []);
  const attrs = {};
  class Ctx { get fillStyle() { return this._f || '#000000'; } set fillStyle(v) { this._f = v; }
              get strokeStyle() { return this._s || '#000000'; } set strokeStyle(v) { this._s = v; }
              fillRect() {} fill() {} fillText() {} stroke() {} strokeRect() {} strokeText() {} }
  const listeners = {};
  const document = { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } },
    addEventListener: (t, f) => { listeners[t] = f; }, dispatchEvent: () => true };
  const window = { CanvasRenderingContext2D: Ctx, devicePixelRatio: 2 };
  const ctx = { window, document, localStorage: { getItem: (k) => store.get(k) ?? null },
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
    MutationObserver: class { observe() {} }, CanvasRenderingContext2D: Ctx, console };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../extension/src/engine.js', import.meta.url), 'utf8'), ctx);
  return { engine: ctx.window.__nightcellEngine, attrs, Ctx, listeners };
}

const lum = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('default boot is on + graphite and marks <html>', () => {
  const { attrs } = loadEngine();
  assert.equal(attrs['data-nightcell'], 'on');
  assert.equal(attrs['data-nightcell-theme'], 'graphite');
});

test('saved off state is honoured synchronously', () => {
  const { attrs } = loadEngine({ on: false, theme: 'oled' });
  assert.equal(attrs['data-nightcell'], 'off');
  assert.equal(attrs['data-nightcell-theme'], 'oled');
});

test('grid: white cell -> dark, black text -> light, contrast >= 7', () => {
  const { engine } = loadEngine();
  const bg = engine.remap('grid', 'bg', '#ffffff');
  const fg = engine.remap('grid', 'fg', '#000000');
  assert.ok(lum(bg) < 0.03, bg);
  assert.ok(contrast(bg, fg) >= 7, `${bg} vs ${fg}`);
});

test('grid: every common fill keeps text readable (>= 4.5:1)', () => {
  const { engine } = loadEngine();
  const fills = ['#ffffff', '#f3f3f3', '#fff2cc', '#d9ead3', '#cfe2f3', '#f4cccc', '#fee2e2', '#86efac', '#fde68a', '#f87171',
    '#2563eb', '#166534', '#7c3aed', '#000000', '#1f2937', '#d3e3fd', '#f8f9fa', '#4285f4', '#ff0000', '#ffff00'];
  const texts = ['#000000', '#444746', '#6b7280', '#ffffff', '#ff0000', '#1155cc', '#16a34a', '#dc2626', '#041e49'];
  for (const f of fills) for (const t of texts) {
    const ratio = contrast(engine.remap('grid', 'bg', f), engine.remap('grid', 'fg', t));
    assert.ok(ratio >= 4.5, `fill ${f} text ${t} -> ${ratio.toFixed(2)}`);
  }
});

test('grid: hue survives (red stays red, green stays green)', () => {
  const { engine } = loadEngine();
  const r = engine.remap('grid', 'fg', '#ff0000'), g = engine.remap('grid', 'bg', '#d9ead3');
  assert.ok(parseInt(r.slice(1, 3), 16) > parseInt(r.slice(3, 5), 16) + 40, r);
  assert.ok(parseInt(g.slice(3, 5), 16) > parseInt(g.slice(1, 3), 16), g);
});

test('chart: series colours untouched, white background darkened', () => {
  const { engine } = loadEngine();
  for (const c of ['#4285f4', '#ea4335', '#fbbc04', '#34a853']) assert.equal(engine.remap('chart', 'bg', c), c);
  assert.ok(lum(engine.remap('chart', 'bg', '#ffffff')) < 0.03);
});

test('translucent gridlines flip to faint light lines', () => {
  const { engine } = loadEngine();
  const out = engine.remap('grid', 'line', 'rgba(31, 31, 31, 0.133)');
  assert.match(out, /^rgba\(2[2-5]\d, 2[2-5]\d, 2[2-5]\d, 0\.1[34]\d*\)$/);
});

test('gradients/patterns pass through', () => {
  const { engine } = loadEngine();
  const g = { gradient: true };
  assert.equal(engine.remap('grid', 'bg', g), g);
});

test('draw calls restore the original style afterwards', () => {
  const { Ctx } = loadEngine();
  const c = new Ctx(); c.canvas = null; c.fillStyle = '#ffffff';
  c.fillRect(0, 0, 100, 20);
  assert.equal(c.fillStyle, '#ffffff');
});
