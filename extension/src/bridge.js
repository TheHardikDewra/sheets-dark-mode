/*
 * Nightcell bridge - runs in the extension's ISOLATED world at document_start.
 *
 * 1. Reads settings from chrome.storage and works out the effective state for this sheet.
 * 2. Mirrors that state into the page's localStorage so engine.js can read it synchronously
 *    on the next load (no flash of white), and pushes it to the running engine.
 * 3. Asks for a repaint when the state changes (the grid is a canvas, it must redraw).
 * 4. Darkens light pop-ups that the stylesheet does not know about yet (robust to Google UI changes).
 */
(() => {
  'use strict';
  if (window.__nightcellBridge) return;
  window.__nightcellBridge = true;

  const STORE_KEY = 'nightcell:state:v1';
  const DEFAULTS = { enabled: true, theme: 'graphite', followSystem: false, chartColors: 'keep', docOverrides: {} };
  const docId = (location.pathname.match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([^/]+)/) || [])[1] || '';
  const systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  let settings = { ...DEFAULTS };
  let current = readMirror();

  function readMirror() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null') || { on: true, theme: 'graphite', chartColors: 'keep' }; }
    catch (_) { return { on: true, theme: 'graphite', chartColors: 'keep' }; }
  }

  function effective(s) {
    let on = !!s.enabled;
    if (on && s.followSystem && systemDark) on = systemDark.matches;
    const o = s.docOverrides && docId ? s.docOverrides[docId] : undefined;
    if (o === 'on') on = true;
    if (o === 'off') on = false;
    return { on, theme: s.theme, chartColors: s.chartColors };
  }

  function push(next, { repaint } = { repaint: true }) {
    const changed = next.on !== current.on || next.theme !== current.theme || next.chartColors !== current.chartColors;
    current = next;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch (_) { /* storage blocked */ }
    document.documentElement.setAttribute('data-nightcell', next.on ? 'on' : 'off');
    document.documentElement.setAttribute('data-nightcell-theme', next.theme);
    document.dispatchEvent(new CustomEvent('nightcell:set', { detail: next }));
    if (changed && repaint) requestRepaint();
    if (next.on) scheduleSweep();
  }

  // ---------- repaint: the canvas only changes colour when Sheets redraws it ----------
  let repaintTimer = 0;
  function requestRepaint() {
    clearTimeout(repaintTimer);
    repaintTimer = setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'nightcell:repaint' }).then((res) => {
        if (!res || !res.ok) repaintViaZoomMenu();
      }).catch(() => repaintViaZoomMenu());
    }, 60);
  }

  // Fallback: pick another zoom level in Sheets' own zoom box, then the original one.
  async function repaintViaZoomMenu() {
    const box = document.querySelector('#t-zoom');
    const input = box && box.querySelector('input');
    const arrow = box && box.querySelector('.goog-toolbar-combo-button-dropdown');
    if (!input || !arrow) return;
    const original = (input.value || '100%').trim();
    const fire = (el, type) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 }));
    };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const pick = async (label) => {
      fire(arrow, 'mousedown'); fire(arrow, 'mouseup');
      await wait(250);
      const item = [...document.querySelectorAll('.goog-menuitem')]
        .find((e) => e.offsetParent !== null && e.textContent.trim() === label);
      if (!item) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return false; }
      for (const t of ['mouseover', 'mousedown', 'mouseup', 'click']) fire(item, t);
      await wait(350);
      return true;
    };
    const other = original === '90%' ? '100%' : '90%';
    if (await pick(other)) await pick(original);
  }

  // ---------- safety net: darken light pop-ups/dialogs the stylesheet does not cover ----------
  const parse = (s) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(s || ''); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
  const luma = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  const SKIP = 'canvas, img, svg, video, iframe, [data-nightcell-skip], .docs-toolbar-color-menu-button-color-bar, .goog-palette-cell, [class*="color-bar"], [class*="swatch"]';
  const SIDES = ['Top', 'Right', 'Bottom', 'Left'];

  function sweep(root) {
    if (!current.on || !root || root.nodeType !== 1) return;
    const nodes = [root, ...root.querySelectorAll('*')];
    if (nodes.length > 4000) return; // never walk the whole app
    for (const el of nodes) {
      if (el.matches(SKIP) || el.closest('[id$="grid-table-container"]')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none') continue;
      const bg = parse(cs.backgroundColor);
      if (bg && bg[3] > 0.5 && luma(bg) > 0.82 && !el.hasAttribute('data-nc-surface')) {
        el.setAttribute('data-nc-surface', el.matches('input, textarea, select, [contenteditable="true"]') ? 'input' : '1');
      }
      const fg = parse(cs.color);
      if (fg && luma(fg) < 0.45 && !el.hasAttribute('data-nc-text')) el.setAttribute('data-nc-text', luma(fg) > 0.3 ? 'muted' : '1');
      // Light hairlines (accordion rows, cards) read as white outlines on a dark surface.
      if (!el.hasAttribute('data-nc-border') && SIDES.some((s) => {
        if (!(parseFloat(cs['border' + s + 'Width']) > 0)) return false;
        const c = parse(cs['border' + s + 'Color']);
        return c && c[3] > 0.3 && luma(c) > 0.75;
      })) el.setAttribute('data-nc-border', '1');
    }
  }

  const pending = new Set();
  let sweepScheduled = false;
  function scheduleSweep(el) {
    if (el) pending.add(el);
    if (sweepScheduled) return;
    sweepScheduled = true;
    const run = () => {
      sweepScheduled = false;
      const list = pending.size ? [...pending] : [...document.querySelectorAll('body > div[role], body > .goog-menu, body > .modal-dialog, .docs-sidebar, .waffle-sidebar-container')];
      pending.clear();
      list.forEach(sweep);
    };
    (window.requestIdleCallback || ((f) => setTimeout(f, 50)))(run, { timeout: 300 });
  }

  function watch() {
    // Pop-ups, menus and dialogs are appended straight to <body>. Menus are built once and
    // re-shown, so each direct child of <body> is watched for becoming visible. Watching only
    // direct children keeps this cheap: Sheets mutates deep nodes constantly while scrolling.
    const shown = new MutationObserver((muts) => {
      for (const m of muts) {
        const t = m.target;
        if (t.style && t.style.display !== 'none' && t.style.visibility !== 'hidden') scheduleSweep(t);
      }
    });
    const track = (el) => { if (el.nodeType === 1) shown.observe(el, { attributes: true, attributeFilter: ['style', 'class'] }); };
    [...document.body.children].forEach(track);
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) { track(n); scheduleSweep(n); }
    }).observe(document.body, { childList: true });
    // Sidebars and dialogs render their tabs lazily (the chart editor's Customize tab, for one),
    // so each one gets a subtree observer while it is open. They are small; the grid is never watched.
    const deep = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'childList') { for (const n of m.addedNodes) if (n.nodeType === 1) scheduleSweep(n); }
        else if (m.target.nodeType === 1 && !(m.attributeName || '').startsWith('data-nc')) scheduleSweep(m.target);
      }
    });
    const adopted = new WeakSet();
    const adopt = (el) => {
      if (adopted.has(el)) return;
      adopted.add(el);
      deep.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
      scheduleSweep(el);
    };
    setInterval(() => {
      if (!current.on || document.hidden) return;
      for (const el of document.querySelectorAll('[class*="sidebar-container"], [role="complementary"], [role="dialog"], .modal-dialog, .docs-material-dialog')) {
        if (el.offsetParent !== null && !el.closest('[id$="grid-table-container"]')) adopt(el);
      }
    }, 1500);
    scheduleSweep(document.body.querySelector('#docs-chrome'));
  }

  // ---------- wiring ----------
  function load() {
    chrome.storage.sync.get(DEFAULTS).then((s) => {
      settings = { ...DEFAULTS, ...s };
      push(effective(settings));
    }).catch(() => push(effective(settings)));
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const [k, v] of Object.entries(changes)) settings[k] = v.newValue === undefined ? DEFAULTS[k] : v.newValue;
    push(effective(settings));
  });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg && msg.type === 'nightcell:get-doc') reply({ docId, state: current });
    if (msg && msg.type === 'nightcell:repaint-fallback') repaintViaZoomMenu();
    return false;
  });

  if (systemDark && systemDark.addEventListener) systemDark.addEventListener('change', () => push(effective(settings)));

  // The engine (MAIN world) may already have booted from the mirror: if it booted with a
  // different state than storage says, push() repaints once so the grid matches.
  load();
  if (document.body) watch();
  else document.addEventListener('DOMContentLoaded', watch, { once: true });
})();
