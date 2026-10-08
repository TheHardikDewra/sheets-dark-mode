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
  const MARKS = ['data-nc-surface', 'data-nc-hue', 'data-nc-text', 'data-nc-border']; // never class/style: observers ignore these

  // A light surface becomes a dark one of the same kind: white -> raised, light grey -> one step
  // lighter (chips, hover), a light tint -> a dark surface of the same hue (a green selected tab
  // stays green), and a fill only a pixel or two thick is a divider, so it takes the border colour.
  function surfaceKind(el, bg) {
    if (el.matches('input, textarea, select, [contenteditable="true"]')) return 'input';
    if (el.tagName === 'HR' || el.offsetHeight <= 2 || el.offsetWidth <= 2) return 'line';
    if (Math.max(bg[0], bg[1], bg[2]) - Math.min(bg[0], bg[1], bg[2]) >= 6) return 'tone';
    return luma(bg) >= 0.975 ? '1' : 'tonal';
  }
  const hueBucket = ([r, g, b]) => { // 12 buckets of 30 degrees, matched by rules in ui.css
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    if (!d) return 0;
    const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return Math.round(h * 2) % 12;
  };

  // The marks an element needs, judged from its own colours as Sheets styles it right now.
  function decide(el) {
    const cs = getComputedStyle(el);
    const out = [];
    const bg = parse(cs.backgroundColor);
    if (bg && bg[3] > 0.5 && luma(bg) > 0.82) {
      const kind = surfaceKind(el, bg);
      out.push(['data-nc-surface', kind]);
      if (kind === 'tone') out.push(['data-nc-hue', String(hueBucket(bg))]);
    }
    const fg = parse(cs.color);
    if (fg && luma(fg) < 0.45) out.push(['data-nc-text', luma(fg) > 0.26 ? 'muted' : '1']); // #444746 and lighter = secondary
    // Light hairlines (accordion rows, cards) read as white outlines on a dark surface.
    if (SIDES.some((s) => {
      if (!(parseFloat(cs['border' + s + 'Width']) > 0)) return false;
      const c = parse(cs['border' + s + 'Color']);
      return c && c[3] > 0.3 && luma(c) > 0.75;
    })) out.push(['data-nc-border', '1']);
    return out;
  }

  // Marks are always worked out from scratch: they come off, colours are read, they go back on.
  // Hover, selection and expanded states change an element's colours, and a mark has to follow
  // the state rather than keep the first one it saw. All of it runs inside one task, so nothing
  // paints in between. While reading, transitions are frozen (data-nc-measure, see ui.css):
  // Sheets fades some colours, and a colour caught mid-fade would be judged wrongly. The freeze is
  // an attribute rather than an inline style, so it never wakes the class/style observers.
  function remarkAll(root, els) {
    root.setAttribute('data-nc-measure', '');
    for (const el of els) MARKS.forEach((a) => el.removeAttribute(a));
    const plan = els.map(decide);
    els.forEach((el, i) => { for (const [a, v] of plan[i]) el.setAttribute(a, v); });
    for (const el of els) void getComputedStyle(el).color; // land the new colours while frozen
    root.removeAttribute('data-nc-measure');
  }
  function remark(el) {
    if (current.on && el.isConnected && !el.matches(SKIP)) remarkAll(el, [el]);
  }

  // Walks only what is rendered: a hidden subtree is skipped whole and swept when it is shown.
  // The chart editor alone keeps ~4,400 nodes, of which ~200 are visible at a time.
  const rejectHidden = (el) => (el.matches(SKIP) || /grid-table-container$/.test(el.id) || getComputedStyle(el).display === 'none'
    ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT);
  function sweep(root) {
    if (!current.on || !root || root.nodeType !== 1 || !root.isConnected) return;
    if (rejectHidden(root) === NodeFilter.FILTER_REJECT || root.closest('[id$="grid-table-container"]')) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, { acceptNode: rejectHidden });
    const els = [];
    for (let el = root; el && els.length < 3000; el = walker.nextNode()) els.push(el); // never walk the whole app
    remarkAll(root, els);
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
        else if (m.target.nodeType === 1) { remark(m.target); scheduleSweep(m.target); } // marks follow state, before paint
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
      if (!current.on) return;
      for (const el of document.querySelectorAll('[class*="sidebar-container"], [role="complementary"], [role="dialog"], .modal-dialog, .docs-material-dialog')) {
        // getClientRects, not offsetParent: offsetParent is null for position:fixed dialogs
        if (el.getClientRects().length && !el.closest('[id$="grid-table-container"]')) adopt(el);
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
