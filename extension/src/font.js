/*
 * Nightcell font: show Google Sheets in a font installed on this computer.
 *
 * Sheets draws text two ways, so there are two routes:
 * - The grid and charts are canvas. The engine puts the chosen family first in every canvas font
 *   (rewriteFont). Sheets measures text with the same font it draws with, so column widths and
 *   overflow stay right. Monospace cells keep their font, so digits stay aligned.
 * - Menus, toolbar, sidebars and dialogs are DOM set in Roboto and Google Sans. Rather than restyle
 *   Google's elements, the engine adds font faces under those family names whose source is the
 *   local font (planFaces), so only text in those families changes.
 * Nothing is downloaded or bundled: local() reads only fonts that are already installed.
 *
 * Loaded in the page world (engine), the extension's isolated world (bridge) and the popup.
 */
(function (root) {
  'use strict';
  if (root.NightcellFont) return;

  // Family names Sheets' interface is set in. Cell fonts are handled on the canvas instead.
  const UI_FAMILIES = ['Roboto', 'RobotoDraft', 'Google Sans', 'Google Sans Text', 'Google Sans Display', 'Product Sans', 'Helvetica', 'Arial'];
  const MONO = /mono|courier|consol|code|menlo|monaco|typewriter|fixed/i;

  // CSS weight -> the words foundries use for it in full and PostScript names
  const WEIGHTS = [
    [100, ['Thin', 'Hairline']],
    [200, ['ExtraLight', 'Extralight', 'Extra Light', 'UltraLight', 'Ultra Light']],
    [300, ['Light']],
    [400, ['Regular', '', 'Roman', 'Book', 'Normal']],
    [500, ['Medium']],
    [600, ['SemiBold', 'Semibold', 'Semi Bold', 'DemiBold', 'Demibold', 'Demi Bold']],
    [700, ['Bold']],
    [800, ['ExtraBold', 'Extrabold', 'Extra Bold', 'UltraBold', 'Heavy']],
    [900, ['Black', 'Heavy']],
  ];

  // Letters, digits, spaces and - _ . only: the name goes into CSS and canvas font strings.
  function clean(name) {
    return String(name || '').replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 64);
  }

  // local() matches full names ("Haffer Medium") and PostScript names ("Haffer-Medium"), never a
  // family name on its own, so each weight is looked up under the usual spellings.
  function candidates(family, weight, italic) {
    const f = clean(family), ps = f.replace(/ /g, '');
    const words = (WEIGHTS.find(([w]) => w === weight) || [0, []])[1];
    const out = [];
    for (const w of words) {
      const wp = w.replace(/ /g, '');
      if (!italic) out.push(w ? `${f} ${w}` : f, w ? `${ps}-${wp}` : ps);
      else out.push(w ? `${f} ${w} Italic` : `${f} Italic`, w ? `${ps}-${wp}Italic` : `${ps}-Italic`);
    }
    if (italic && weight === 400) out.push(`${f} Oblique`, `${ps}-Oblique`);
    return [...new Set(out)];
  }

  async function installed(name) {
    try { await new FontFace('nightcell-probe', `local("${name}")`).load(); return true; } catch (_) { return false; }
  }

  // Which weights and styles of a family are installed: [{ weight, italic, name }]
  async function probe(family) {
    const f = clean(family);
    if (!f || typeof FontFace !== 'function') return [];
    const jobs = [];
    for (const [weight] of WEIGHTS) {
      for (const italic of [false, true]) {
        jobs.push((async () => {
          for (const name of candidates(f, weight, italic)) if (await installed(name)) return { weight, italic, name };
          return null;
        })());
      }
    }
    return (await Promise.all(jobs)).filter(Boolean);
  }

  // The installed weight a wanted weight falls back to, in CSS font matching order.
  function nearestWeight(have, want) {
    if (have.includes(want)) return want;
    const up = have.filter((w) => w > want).sort((a, b) => a - b);
    const down = have.filter((w) => w < want).sort((a, b) => b - a);
    if (want >= 400 && want <= 500) {
      const near = up.filter((w) => w <= 500);
      return near.length ? near[0] : down.length ? down[0] : up[0];
    }
    if (want < 400) return down.length ? down[0] : up[0];
    return up.length ? up[0] : down[0];
  }

  // One face per weight 100-900 and style, each pointing at the nearest installed weight, so every
  // weight Google's own faces define is covered. Italic faces only if the family has italics;
  // otherwise italic text keeps Google's italic.
  function planFaces(found) {
    const out = [];
    for (const italic of [false, true]) {
      const set = (found || []).filter((f) => f && !!f.italic === italic);
      if (!set.length) continue;
      const have = set.map((f) => f.weight);
      for (const [weight] of WEIGHTS) {
        const w = nearestWeight(have, weight);
        out.push({ weight, italic, name: set.find((f) => f.weight === w).name });
      }
    }
    return out;
  }

  // "bold 13.3333px docs-Inter, Arial" -> 'bold 13.3333px "Haffer", docs-Inter, Arial'
  const SIZE = /(\d*\.?\d+(?:px|pt|pc|em|rem|ex|ch|%|q|mm|cm|in|vw|vh|vmin|vmax)(?:\s*\/\s*\S+)?)\s+(.+)$/i;
  function rewriteFont(font, family) {
    if (!family || typeof font !== 'string') return font;
    const m = SIZE.exec(font);
    if (!m) return font;
    const families = m[2];
    if (MONO.test(families) || families.indexOf('"' + family + '"') === 0) return font;
    return font.slice(0, m.index) + m[1] + ' "' + family + '", ' + families;
  }

  root.NightcellFont = { UI_FAMILIES, WEIGHTS, clean, candidates, probe, nearestWeight, planFaces, rewriteFont, isMono: (s) => MONO.test(String(s || '')) };
})(typeof window !== 'undefined' ? window : globalThis);
