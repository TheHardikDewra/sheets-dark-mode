/*
 * Nightcell engine - runs in the page's MAIN world at document_start.
 *
 * Google Sheets paints the grid (and its charts) on <canvas>, so CSS alone can't darken it.
 * We wrap the 2D-canvas draw calls and swap each colour for a dark-theme equivalent at the
 * moment it is drawn, then restore the original style so Sheets never notices.
 *
 * Colour roles:
 *   bg   - fillRect / large fills      -> pushed into a dark band, hue kept
 *   fg   - fillText / glyph fills      -> lifted so it reads on the dark band, hue kept
 *   line - stroke / hairline fillRects -> gridlines go faint, user borders stay visible
 *
 * Two policies:
 *   grid  - the cell canvas: every colour adapts (pastel fills become deep tints)
 *   chart - charts + unknown canvases: only neutrals flip, series colours are kept
 */
(() => {
  'use strict';
  if (window.__nightcellEngine) return;

  const STORE_KEY = 'nightcell:state:v1';
  const THEMES = {
    graphite: { base: 0.235, tintC: 0, tintH: 0 },
    midnight: { base: 0.245, tintC: 0.018, tintH: 262 },
    oled: { base: 0.15, tintC: 0, tintH: 0 },
    dim: { base: 0.30, tintC: 0.006, tintH: 250, lift: 0.07 }, // lighter band, so text sits higher to keep 5:1
  };

  // ---------- state ----------
  const state = { on: true, theme: 'graphite', chartColors: 'keep' };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && typeof saved === 'object') Object.assign(state, pickState(saved));
  } catch (_) { /* storage blocked: keep defaults */ }

  function pickState(s) {
    const out = {};
    if (typeof s.on === 'boolean') out.on = s.on;
    if (THEMES[s.theme]) out.theme = s.theme;
    if (s.chartColors === 'keep' || s.chartColors === 'adapt') out.chartColors = s.chartColors;
    return out;
  }

  function applyRootAttrs() {
    const el = document.documentElement;
    if (!el) return;
    el.setAttribute('data-nightcell', state.on ? 'on' : 'off');
    el.setAttribute('data-nightcell-theme', state.theme);
  }
  applyRootAttrs();
  if (!document.documentElement) {
    new MutationObserver((_, obs) => { if (document.documentElement) { applyRootAttrs(); obs.disconnect(); } })
      .observe(document, { childList: true });
  }

  // ---------- colour math (OKLab / OKLCH) ----------
  const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const fromLin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

  function rgbToOklch(r, g, b) {
    const lr = toLin(r), lg = toLin(g), lb = toLin(b);
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    const C = Math.sqrt(A * A + B * B);
    let h = Math.atan2(B, A) * 180 / Math.PI;
    if (h < 0) h += 360;
    return [L, C, h];
  }

  function oklchToLinear(L, C, h) {
    const hr = h * Math.PI / 180, A = C * Math.cos(hr), B = C * Math.sin(hr);
    const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
    const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
    const s = Math.pow(L - 0.0894841775 * A - 1.2914855480 * B, 3);
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
  }

  const inGamut = (rgb) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);

  // Reduce chroma (binary search) until the colour fits sRGB, keeping L and hue.
  function oklchToRgb(L, C, h) {
    L = Math.min(1, Math.max(0, L));
    let lin = oklchToLinear(L, C, h);
    if (!inGamut(lin)) {
      let lo = 0, hi = C;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        if (inGamut(oklchToLinear(L, mid, h))) lo = mid; else hi = mid;
      }
      lin = oklchToLinear(L, lo, h);
    }
    return lin.map((v) => Math.round(Math.min(1, Math.max(0, fromLin(Math.min(1, Math.max(0, v))))) * 255));
  }

  function parseColor(str) {
    if (str.charCodeAt(0) === 35) { // '#'
      if (str.length === 7) {
        return [parseInt(str.slice(1, 3), 16), parseInt(str.slice(3, 5), 16), parseInt(str.slice(5, 7), 16), 1];
      }
      if (str.length === 4) {
        return [17 * parseInt(str[1], 16), 17 * parseInt(str[2], 16), 17 * parseInt(str[3], 16), 1];
      }
      return null;
    }
    const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(str);
    if (!m) return null;
    return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  }

  const fmt = (rgb, a) => (a >= 0.999
    ? '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('')
    : `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${+a.toFixed(3)})`);

  // ---------- the theme mapping ----------
  // Every function takes OKLCH + alpha and returns [L, C, h, alpha] for the dark theme.
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function tint(theme, L, C, h, neutral) {
    // neutral colours pick up the theme tint (e.g. midnight's blue cast)
    return neutral && theme.tintC ? [L, theme.tintC, theme.tintH] : [L, C, h];
  }

  const MAP = {
    grid: {
      bg(L, C, h, a, t) {
        const neutral = C < 0.02;
        if (a < 0.98) { // translucent overlays (selection washes, highlights)
          if (neutral) return [L < 0.5 ? 0.92 : t.base, 0, h, a];
          return [0.62, Math.min(C, 0.16), h, Math.min(1, a * 1.35)];
        }
        let L2;
        if (L >= 0.8) L2 = t.base + (1 - L) * 0.35;
        else if (L >= 0.45) L2 = t.base + 0.07 + (0.8 - L) * 0.15;
        else L2 = t.base + 0.05 + L * 0.17;
        const C2 = L >= 0.8 ? Math.min(C, 0.07) : C * 0.82;
        return [...tint(t, L2, C2, h, neutral), a];
      },
      fg(L, C, h, a, t) {
        const up = t.lift || 0;
        if (C < 0.03) {
          const L2 = L >= 0.7 ? clamp(L, 0.86, 0.96) : 0.92 - L * 0.2;
          return [Math.min(0.97, L2 + up), C, h, a];
        }
        return [clamp(Math.max(L + 0.2, 0.8 + up), 0.8 + up, 0.9 + up), C, h, a];
      },
      mark(L, C, h, a) { // sparkline bars and other data marks: keep them visible on the dark band
        if (C < 0.03) return [L < 0.5 ? 0.78 : Math.max(L, 0.62), C, h, a];
        return [clamp(L, 0.6, 0.82), C, h, a];
      },
      line(L, C, h, a, t) {
        if (C < 0.03) {
          if (a < 0.5) return [0.93, 0, h, Math.min(1, a * 1.05)]; // hairline gridlines
          if (L >= 0.6) return [...tint(t, t.base + 0.12, 0, h, true), a]; // light separators
          return [0.78, C, h, a]; // dark user borders stay visible
        }
        return [clamp(L, 0.6, 0.8), C, h, a];
      },
    },
    chart: {
      bg(L, C, h, a, t) {
        if (C >= 0.025 || a < 0.02) return null; // keep series colours + invisible fills
        if (L >= 0.9) return [...tint(t, t.base, 0, h, true), a];
        if (L >= 0.75) return [...tint(t, t.base + 0.08, 0, h, true), a];
        if (L < 0.35) return [0.8, 0, h, a];
        return null;
      },
      fg(L, C, h, a) {
        if (C < 0.03) return [L >= 0.7 ? L : 0.9 - L * 0.2, C, h, a];
        return [Math.max(L, 0.72), C, h, a];
      },
      line(L, C, h, a, t) {
        if (C >= 0.03 || a < 0.02) return null;
        if (L >= 0.6) return [t.base + 0.13, 0, h, a];
        return [0.72, 0, h, a];
      },
    },
  };
  MAP.chartAdapt = { bg: MAP.grid.bg, fg: MAP.grid.fg, line: MAP.grid.line, mark: MAP.grid.mark };
  MAP.chart.mark = MAP.chart.bg;

  const cache = new Map();

  function remap(policy, role, style) {
    if (typeof style !== 'string') return style; // gradients / patterns untouched
    const key = state.theme + '|' + policy + '|' + role + '|' + style;
    let out = cache.get(key);
    if (out !== undefined) return out;
    out = style;
    const c = parseColor(style);
    if (c) {
      const [r, g, b, a] = c;
      const [L, C, h] = rgbToOklch(r, g, b);
      const res = MAP[policy][role](L, C, h, a, THEMES[state.theme]);
      if (res) out = fmt(oklchToRgb(res[0], res[1], res[2]), res[3]);
    }
    if (cache.size > 20000) cache.clear();
    cache.set(key, out);
    return out;
  }

  // ---------- which canvas is this? ----------
  const policyOf = new WeakMap();
  function policyFor(ctx) {
    const cv = ctx.canvas;
    if (!cv) return 'chart';
    const known = policyOf.get(cv);
    if (known) return known;
    let p = state.chartColors === 'adapt' ? 'chartAdapt' : 'chart';
    if (typeof cv.closest === 'function') {
      if (!cv.isConnected) return p; // decide once attached
      const parent = cv.parentElement;
      if (parent && /grid-table-container$/.test(parent.id)) p = 'grid';
    }
    policyOf.set(cv, p);
    return p;
  }

  // ---------- wrap the draw calls ----------
  function patch(proto) {
    if (!proto || proto.__nightcell) return;
    const desc = (k) => Object.getOwnPropertyDescriptor(proto, k);
    const fillStyle = desc('fillStyle'), strokeStyle = desc('strokeStyle');
    if (!fillStyle || !strokeStyle) return;
    const getF = fillStyle.get, setF = fillStyle.set, getS = strokeStyle.get, setS = strokeStyle.set;

    const withFill = (role, fn) => function (...args) {
      if (!state.on) return fn.apply(this, args);
      let orig, mapped;
      try {
        orig = getF.call(this);
        const pol = policyFor(this);
        const r = typeof role === 'function' ? role.call(this, pol, orig, args) : role;
        mapped = remap(pol, r, orig);
      } catch (_) { return fn.apply(this, args); }
      if (mapped === orig) return fn.apply(this, args);
      setF.call(this, mapped);
      try { return fn.apply(this, args); } finally { setF.call(this, orig); }
    };
    const withStroke = (fn) => function (...args) {
      if (!state.on) return fn.apply(this, args);
      let orig, mapped;
      try {
        orig = getS.call(this);
        mapped = remap(policyFor(this), 'line', orig);
      } catch (_) { return fn.apply(this, args); }
      if (mapped === orig) return fn.apply(this, args);
      setS.call(this, mapped);
      try { return fn.apply(this, args); } finally { setS.call(this, orig); }
    };

    // A coloured rect clearly shorter than a row is a data mark (a sparkline bar), not a cell fill.
    // The row height is learned per grid canvas from the white cell backgrounds Sheets paints, as
    // the SMALLEST height it paints often, never the most common one: frozen rows are repainted on
    // every scroll, so a tall frozen title row can outnumber normal rows, and then every ordinary
    // cell fill looks like a mark and turns light. A learned height may drop at once (zoom out)
    // but only rises after it has gone unpainted for a long stretch: too high a row height
    // recolours real cells, too low only leaves some bars dark.
    const rowStats = new WeakMap();
    const learnRow = (cv, h) => {
      h = Math.round(h);
      if (h < 12 || h > 400) return;
      let st = rowStats.get(cv);
      if (!st) { st = { counts: new Map(), seen: 0, row: 0, rowSeen: 0 }; rowStats.set(cv, st); }
      const c = (st.counts.get(h) || 0) + 1;
      st.counts.set(h, c);
      st.seen++;
      if (h === st.row) st.rowSeen = st.seen;
      else if (c >= 3 && (!st.row || h < st.row)) { st.row = h; st.rowSeen = st.seen; }
      if (st.seen % 256 === 0) for (const [k, v] of st.counts) { if (v < 2) st.counts.delete(k); else st.counts.set(k, v >> 1); }
      if (st.seen - st.rowSeen > 2000) { // zoomed in or rows resized: take the smallest height still common
        let row = 0;
        for (const [k, v] of st.counts) if (v >= 3 && (!row || k < row)) row = k;
        st.row = row; st.rowSeen = st.seen;
      }
    };
    const isMark = (cv, w, h) => {
      const st = rowStats.get(cv);
      return !!st && st.row > 0 && Math.round(h) <= st.row - 6 && w < 600;
    };
    const isLight = (style) => {
      const c = parseColor(style);
      if (!c) return true;
      return rgbToOklch(c[0], c[1], c[2])[0] >= 0.8;
    };
    // a fillRect thinner than ~1.5 css px is a border/gridline, not a cell fill
    const rectRole = function (pol, style, a) {
      const w = Math.abs(a[2]), h = Math.abs(a[3]);
      const thin = Math.min(w, h);
      if (thin <= 8) {
        const dpr = window.devicePixelRatio || 1;
        const t = this.getTransform ? Math.abs(this.getTransform().a) || 1 : 1;
        if (thin * t <= 1.6 * dpr) return 'line';
      }
      if (pol !== 'grid') return 'bg';
      if (style === '#ffffff') { learnRow(this.canvas, h); return 'bg'; }
      return !isLight(style) && isMark(this.canvas, w, h) ? 'mark' : 'bg';
    };
    // path fills: neutral dark shapes are glyphs (checkbox, arrows) -> lift; others are surfaces -> darken
    const roleCache = new Map();
    const fillRole = function (_pol, style) {
      if (typeof style !== 'string') return 'bg';
      let r = roleCache.get(style);
      if (r) return r;
      const c = parseColor(style);
      r = 'bg';
      if (c) {
        const [L, C] = rgbToOklch(c[0], c[1], c[2]);
        if (C < 0.03 && L < 0.8) r = 'fg';
      }
      if (roleCache.size > 5000) roleCache.clear();
      roleCache.set(style, r);
      return r;
    };

    proto.fillRect = withFill(rectRole, proto.fillRect);
    proto.fill = withFill(fillRole, proto.fill);
    proto.fillText = withFill('fg', proto.fillText);
    if (proto.strokeText) proto.strokeText = withStroke(proto.strokeText);
    proto.stroke = withStroke(proto.stroke);
    proto.strokeRect = withStroke(proto.strokeRect);
    Object.defineProperty(proto, '__nightcell', { value: true });
  }

  patch(window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype);
  patch(window.OffscreenCanvasRenderingContext2D && OffscreenCanvasRenderingContext2D.prototype);

  // ---------- the in-cell editor: show it in the dark version of the cell it edits ----------
  // Sheets paints the editor as DOM with inline colours (the cell's fill + text colour). We map them
  // through the same grid roles and hand them to ui.css as custom properties.
  function themeEditor(el) {
    const set = (prop, val) => { if (el.style.getPropertyValue(prop) !== val) el.style.setProperty(prop, val); };
    if (!state.on) { el.style.removeProperty('--nc-edit-bg'); el.style.removeProperty('--nc-edit-fg'); return; }
    const bg = el.style.backgroundColor, fg = el.style.color;
    if (bg && parseColor(bg)) set('--nc-edit-bg', remap('grid', 'bg', bg));
    if (fg && parseColor(fg)) set('--nc-edit-fg', remap('grid', 'fg', fg));
  }
  const EDITOR = '.input-box, #waffle-rich-text-editor';
  const editorObs = new MutationObserver((muts) => {
    for (const m of muts) if (m.target.matches && m.target.matches(EDITOR)) themeEditor(m.target);
  });
  const watchEditor = (root) => {
    if (!root || root.nodeType !== 1) return;
    const hits = root.matches(EDITOR) ? [root] : [...root.querySelectorAll(EDITOR)];
    for (const el of hits) { themeEditor(el); editorObs.observe(el, { attributes: true, attributeFilter: ['style'] }); }
  };
  const bootEditorWatch = () => {
    watchEditor(document.body);
    new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) watchEditor(n); })
      .observe(document.body, { childList: true });
  };
  if (document.body) bootEditorWatch(); else document.addEventListener('DOMContentLoaded', bootEditorWatch, { once: true });

  // ---------- talk to the isolated-world bridge ----------
  document.addEventListener('nightcell:set', (e) => {
    const next = pickState((e && e.detail) || {});
    const changed = Object.keys(next).some((k) => next[k] !== state[k]);
    Object.assign(state, next);
    applyRootAttrs();
    if (changed) { cache.clear(); document.querySelectorAll(EDITOR).forEach(themeEditor); }
  });

  window.__nightcellEngine = { version: '1.0.0', state: () => ({ ...state }), remap };
  document.dispatchEvent(new CustomEvent('nightcell:engine-ready', { detail: { ...state } }));
})();
