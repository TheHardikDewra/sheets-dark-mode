// Nightcell site. Every word is readable without JS. With JS, the demo sheets are built from
// data.js, which scripts/site-data.mjs writes from the extension's own engine, so every colour on
// this page is one Nightcell really draws. With motion allowed and GSAP loaded, they move;
// otherwise each demo simply shows its end state.
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const D = window.NC_DATA;
  const root = document.documentElement;
  const motion = root.classList.contains('motion');
  const G = motion && window.gsap ? window.gsap : null;
  const ST = G && window.ScrollTrigger ? window.ScrollTrigger : null;
  if (ST) G.registerPlugin(ST);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Runs fn each time el scrolls into view (and stop when it leaves, if given).
  function inView(el, fn, stop, margin = '0px 0px -12% 0px') {
    if (!el || !('IntersectionObserver' in window)) { if (el) fn(); return; }
    new IntersectionObserver((entries) => {
      for (const e of entries) { if (e.isIntersecting) fn(); else if (stop) stop(); }
    }, { rootMargin: margin }).observe(el);
  }

  // ---------- header, mobile menu, numbers from the build ----------
  const nav = $('.nav');
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const menuBtn = $('.menu-btn'), mnav = $('#mnav');
  const setMenu = (open) => {
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    $('use', menuBtn).setAttribute('href', open ? '#i-x' : '#i-list');
    mnav.hidden = !open;
  };
  menuBtn.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
  $$('a', mnav).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !mnav.hidden) { setMenu(false); menuBtn.focus(); } });
  matchMedia('(min-width: 961px)').addEventListener('change', (m) => { if (m.matches) setMenu(false); });
  if (D) {
    $$('[data-version]').forEach((e) => { e.textContent = D.version; });
    $$('[data-zip]').forEach((e) => { e.textContent = D.zipKB; });
  }

  // ---------- section reveals: opacity only, in reading order ----------
  if (motion && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal').forEach((el) => io.observe(el));
  } else $$('.reveal').forEach((el) => el.classList.add('in'));

  // ---------- compare slider ----------
  const slider = $('#slider');
  if (slider) {
    const input = $('input', slider);
    const set = (v) => slider.style.setProperty('--pos', v + '%');
    input.addEventListener('input', () => set(input.value));
    let nudged = !motion;
    inView(slider, () => { // a one-time nudge so the handle reads as draggable: 50% -> 44% -> 50%
      if (nudged) return;
      nudged = true;
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / 800);
        const v = 50 - Math.sin(p * Math.PI) * 6;
        if (!input.matches(':active')) { input.value = v; set(v); }
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, null, '0px 0px -30% 0px');
  }

  if (!D) return; // without data.js the demos stay as plain text

  // ---------- demo sheets ----------
  // A cell is [text, fill, ink, flags]; fills and inks name Sheets' own light colours in data.js.
  const H = (t, flags = '') => [t, 'head', 'ink', 'b ' + flags];
  const SHEETS = {
    hero: {
      title: 'Studio budget (demo data)', chrome: true,
      cols: 5,
      rows: [
        [H('Month'), H('Food', 'r'), H('Travel', 'r'), H('Total', 'r'), H('vs plan', 'r')],
        [['Jan'], ['₹4,200', 'white', 'ink', 'r'], ['₹1,800', 'white', 'ink', 'r'], ['₹6,000', 'green', 'ink', 'r'], ['-₹1,500', 'white', 'green', 'r']],
        [['Feb'], ['₹3,900', 'white', 'ink', 'r'], ['₹12,600', 'white', 'ink', 'r'], ['₹16,500', 'red', 'ink', 'r'], ['+₹9,000', 'white', 'red', 'r']],
        [['Mar'], ['₹5,100', 'white', 'ink', 'r'], ['₹900', 'white', 'ink', 'r'], ['₹6,000', 'green', 'ink', 'r'], ['-₹1,500', 'white', 'green', 'r']],
        [['Apr'], ['₹4,700', 'white', 'ink', 'r'], ['₹3,200', 'white', 'ink', 'r'], ['₹7,900', 'white', 'ink', 'r'], ['+₹400', 'white', 'red', 'r']],
        [['May'], ['₹5,300', 'white', 'ink', 'r'], ['₹1,500', 'white', 'ink', 'r'], ['₹6,800', 'green', 'ink', 'r'], ['-₹700', 'white', 'green', 'r']],
        [['Total', 'yellow', 'ink', 'b'], ['₹23,200', 'yellow', 'ink', 'b r'], ['₹20,000', 'yellow', 'ink', 'b r'], ['₹43,200', 'yellow', 'ink', 'b r'], ['+₹5,700', 'yellow', 'red', 'b r']],
        [['Plan is ₹7,500 a month. Every number here is made up for testing.', 'white', 'grey', 'span5']],
      ],
    },
    mini: {
      title: 'Budget', chrome: true,
      cols: 4,
      rows: [
        [H('Month'), H('Food', 'r'), H('Total', 'r'), H('vs plan', 'r')],
        [['Jan'], ['₹4,200', 'white', 'ink', 'r'], ['₹6,000', 'green', 'ink', 'r'], ['-₹1,500', 'white', 'green', 'r']],
        [['Feb'], ['₹3,900', 'white', 'ink', 'r'], ['₹16,500', 'red', 'ink', 'r'], ['+₹9,000', 'white', 'red', 'r']],
        [['Mar'], ['₹5,100', 'white', 'ink', 'r'], ['₹6,000', 'green', 'ink', 'r'], ['-₹1,500', 'white', 'green', 'r']],
        [['Total', 'yellow', 'ink', 'b'], ['₹13,200', 'yellow', 'ink', 'b r'], ['₹28,500', 'yellow', 'ink', 'b r'], ['+₹6,000', 'yellow', 'red', 'b r']],
      ],
    },
  };
  SHEETS.font = { ...SHEETS.mini, rows: [...SHEETS.mini.rows, [['Check', 'white', 'grey'], ['=SUM(C2:C4)', 'white', 'blue', 'mono span3']]] };

  function setTheme(app, theme) {
    const t = D.themes[theme];
    for (const [k, v] of Object.entries(t.fill)) app.style.setProperty('--Df-' + k, v);
    for (const [k, v] of Object.entries(t.ink)) app.style.setProperty('--Di-' + k, v);
    app.style.setProperty('--D-line', t.line);
    app.style.setProperty('--D-app', t.chrome.app);
    app.style.setProperty('--D-bar', t.chrome.raised);
    app.style.setProperty('--D-txt', t.chrome.text);
  }

  function build(app, spec) {
    app.textContent = '';
    for (const [k, v] of Object.entries(D.light.fill)) app.style.setProperty('--Lf-' + k, v);
    for (const [k, v] of Object.entries(D.light.ink)) app.style.setProperty('--Li-' + k, v);
    app.style.setProperty('--L-line', D.light.line);
    setTheme(app, 'graphite');
    if (spec.chrome) {
      const top = document.createElement('div');
      top.className = 'app-top';
      top.innerHTML = '<i class="app-logo"></i><span class="app-title"></span>';
      $('.app-title', top).textContent = spec.title;
      const menus = document.createElement('div');
      menus.className = 'app-menus';
      menus.innerHTML = '<span>File</span><span>Edit</span><span>View</span><span>Insert</span><span>Format</span><span>Data</span>';
      const bar = document.createElement('div');
      bar.className = 'app-bar';
      bar.innerHTML = '<i></i>'.repeat(9);
      app.append(top, menus, bar);
    }
    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.style.setProperty('--cols', spec.cols);
    const cell = (text, fill, ink, flags, r) => {
      const c = document.createElement('span');
      c.className = ['c', ...String(flags || '').split(' ').filter((f) => f && !f.startsWith('span'))].join(' ');
      const span = /span(\d)/.exec(flags || '');
      if (span) c.style.gridColumn = 'span ' + span[1];
      c.textContent = text;
      c.style.setProperty('--lb', `var(--Lf-${fill})`);
      c.style.setProperty('--db', `var(--Df-${fill})`);
      c.style.setProperty('--lt', `var(--Li-${ink})`);
      c.style.setProperty('--dt', `var(--Di-${ink})`);
      c.style.setProperty('--r', r);
      grid.appendChild(c);
    };
    cell('', 'axis', 'axis', 'ax', 0);
    for (let i = 0; i < spec.cols; i++) cell('ABCDEFGH'[i], 'axis', 'axis', 'ax', 0);
    spec.rows.forEach((row, ri) => {
      cell(String(ri + 1), 'axis', 'axis', 'ax', ri + 1);
      for (const [text, fill = 'white', ink = 'ink', flags = ''] of row) cell(text, fill, ink, flags, ri + 1);
    });
    const scan = document.createElement('i');
    scan.className = 'scan';
    grid.appendChild(scan);
    app.appendChild(grid);
    app.style.setProperty('--rows', spec.rows.length + 1);
    app.style.setProperty('--scan-ms', (spec.rows.length + 1) * 70 + 350 + 'ms');
    return app;
  }

  const apps = {};
  for (const app of $$('[data-sheet]')) {
    const kind = app.dataset.sheet;
    apps[kind] = build(app, SHEETS[kind === 'hero' || kind === 'themes' ? 'hero' : kind === 'font' ? 'font' : 'mini']);
  }
  // end states: what the page shows at rest, with no motion
  for (const k of ['hero', 'keep', 'themes', 'font', 'toggle']) if (apps[k]) apps[k].classList.add('is-dark');

  // ---------- 1. hero: the repaint, row by row ----------
  const hero = apps.hero;
  async function repaint() {
    hero.classList.add('no-tr');
    hero.classList.remove('is-dark', 'sweep', 'scanning');
    void hero.offsetWidth;
    hero.classList.remove('no-tr');
    await wait(450);
    hero.classList.add('sweep', 'scanning', 'is-dark');
    await wait(parseInt(getComputedStyle(hero).getPropertyValue('--scan-ms'), 10) + 400);
    hero.classList.remove('sweep', 'scanning');
  }
  if (motion && hero) {
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => wait(250)).then(repaint);
    $('[data-replay]').addEventListener('click', repaint);
  } else { const b = $('[data-replay]'); if (b) b.hidden = true; }

  if (G) {
    G.from('h1 .ln', { opacity: 0, yPercent: 20, filter: 'blur(10px)', duration: 1, ease: 'power3.out', stagger: 0.12, delay: 0.05 });
    G.from('[data-rise]', { opacity: 0, y: 12, duration: 0.7, ease: 'power3.out', stagger: 0.08, delay: 0.3 });
    if (ST) G.fromTo('.frame', { scale: 0.95 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.stage', start: 'top 98%', end: 'top 35%', scrub: true } });
  }

  // ---------- 2. invert vs Nightcell, scrubbed by scroll ----------
  const inv = apps.invert, keep = apps.keep;
  if (inv && keep && motion) {
    inv.style.setProperty('--inv', 0);
    keep.classList.remove('is-dark');
    const at = (p) => {
      inv.style.setProperty('--inv', p.toFixed(3));
      keep.classList.toggle('is-dark', p > 0.4);
    };
    if (ST) {
      inv.style.transition = 'none';
      ST.create({ trigger: '[data-duel]', start: 'top 85%', end: 'center 50%', scrub: true, onUpdate: (s) => at(s.progress) });
    } else inView($('[data-duel]'), () => setTimeout(() => at(1), 300));
  }

  // ---------- 3. 180 pairs, with odometers ----------
  const pairs = $('[data-pairs]');
  if (pairs) {
    const html = D.pairs.map(([fill, text, bg, fg, ratio], i) => {
      const row = Math.floor(i / 20), col = i % 20;
      return `<i style="background:${bg};color:${fg};--d:${(row + col) * 22}" title="Fill ${fill} with text ${text}: drawn as ${bg} with ${fg}, ${ratio}:1">Aa</i>`;
    }).join('');
    pairs.innerHTML = html;
    if (motion) inView(pairs, () => pairs.classList.add('in'), null, '0px 0px -15% 0px');
  }
  const mins = $('[data-mins]');
  if (mins) {
    mins.innerHTML = Object.entries(D.minContrast).map(([t, v]) => `<li><b>${t === 'oled' ? 'OLED' : t[0].toUpperCase() + t.slice(1)}</b> ${v.toFixed(2)}:1</li>`).join('');
  }
  function odometer(el) {
    const target = el.dataset.odo;
    const cycles = target.length > 1 ? 2 : 1;
    const label = document.createElement('span');
    label.className = 'sr';
    label.textContent = target;
    label.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)';
    el.textContent = '';
    el.setAttribute('aria-hidden', 'true');
    el.before(label);
    [...target].forEach((ch, i) => {
      const col = document.createElement('span');
      col.className = 'col';
      col.style.setProperty('--i', i);
      for (let k = 0; k <= cycles * 10 + 9; k++) { const d = document.createElement('span'); d.textContent = k % 10; col.appendChild(d); }
      col.dataset.to = cycles * 10 + Number(ch);
      el.appendChild(col);
    });
    // rolls once and stays: a number that resets when scrolled past would read wrong at rest
    let done = false;
    return { roll: () => { if (done) return; done = true; for (const col of el.children) col.style.transform = `translateY(-${col.dataset.to}em)`; } };
  }
  if (motion) {
    for (const el of $$('.odo[data-odo]')) {
      const o = odometer(el);
      inView(el, () => requestAnimationFrame(o.roll), null, '0px 0px -10% 0px');
    }
  }

  // ---------- 4. themes: pinned and stepped on desktop, tabs everywhere ----------
  const stage = $('[data-theme-stage]'), themesApp = apps.themes;
  const THEME_IDS = ['graphite', 'midnight', 'oled', 'dim'];
  const tabs = stage ? $$('[role="tab"]', stage) : [];
  let themeIdx = 0, themeAuto = 0, themeTouched = false, themeST = null;
  function showTheme(i) {
    themeIdx = i;
    setTheme(themesApp, THEME_IDS[i]);
    tabs.forEach((t, k) => t.setAttribute('aria-selected', String(k === i)));
  }
  tabs.forEach((t, i) => t.addEventListener('click', () => {
    themeTouched = true;
    clearInterval(themeAuto);
    if (themeST) scrollTo({ top: themeST.start + (themeST.end - themeST.start) * (i / 3) + 1, behavior: 'smooth' });
    showTheme(i);
  }));
  if (stage && themesApp) {
    const desktop = matchMedia('(min-width: 961px)').matches;
    if (ST && desktop) {
      themeST = ST.create({
        trigger: stage, start: 'center center', end: '+=' + 1200, pin: true, scrub: true,
        snap: { snapTo: 1 / 3, duration: 0.3, ease: 'power1.inOut' },
        onUpdate: (s) => { const i = Math.round(s.progress * 3); if (i !== themeIdx) showTheme(i); },
      });
    } else if (motion) {
      inView(stage, () => {
        if (themeTouched || themeAuto) return;
        themeAuto = setInterval(() => showTheme((themeIdx + 1) % 4), 2600);
      }, () => { clearInterval(themeAuto); themeAuto = 0; });
    }
  }

  // ---------- 5. your font: the popup types, the cells switch ----------
  const fontApp = apps.font, typed = $('[data-typed]'), fstatus = $('[data-font-status]');
  const WEIGHTS = { Haffer: 8, Georgia: 2, Verdana: 2 };
  const IDLE = 'Type a font installed on this computer. Cells, menus and charts use it, on your screen only.';
  let fontRun = 0;
  async function chooseFont(name, { animate = motion } = {}) {
    const run = ++fontRun;
    $$('.chips button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.font === name)));
    if (animate) {
      typed.textContent = '';
      for (const ch of name) { await wait(85); if (run !== fontRun) return; typed.textContent += ch; }
      fstatus.textContent = name ? `Looking for ${name}...` : IDLE;
      await wait(name ? 380 : 120);
      if (run !== fontRun) return;
      fontApp.classList.add('font-swap');
      await wait(170);
    } else typed.textContent = name;
    if (name) fontApp.style.setProperty('--sheet-font', `"${name}", Arial, Helvetica, sans-serif`);
    else fontApp.style.removeProperty('--sheet-font');
    fstatus.textContent = name ? `${name} is installed (${WEIGHTS[name]} weights). Cells, menus and charts use it, on your screen only.` : IDLE;
    fontApp.classList.remove('font-swap');
  }
  if (fontApp) {
    chooseFont('Haffer', { animate: false });
    $$('.chips button').forEach((b) => b.addEventListener('click', () => chooseFont(b.dataset.font)));
    if (motion) {
      let played = false;
      inView($('.font-demo'), async () => {
        if (played) return;
        played = true;
        await chooseFont('', { animate: false });
        await wait(400);
        chooseFont('Haffer');
      }, null, '0px 0px -25% 0px');
    }
  }

  // ---------- 6. Alt+Shift+D, on the demo and for real ----------
  const toggleApp = apps.toggle, caps = $$('.caps kbd'), keyState = $('[data-key-state]');
  let keyLoop = 0;
  async function flip() {
    for (const k of caps) { k.classList.add('down'); await wait(80); }
    await wait(140);
    caps.forEach((k) => k.classList.remove('down'));
    const dark = !toggleApp.classList.contains('is-dark');
    toggleApp.classList.toggle('is-dark', dark);
    keyState.textContent = dark ? 'Dark mode on' : 'Dark mode off';
  }
  if (toggleApp) {
    if (motion) {
      inView($('.keys-demo'), () => { if (!keyLoop) { flip(); keyLoop = setInterval(flip, 3400); } },
        () => { clearInterval(keyLoop); keyLoop = 0; }, '0px 0px -10% 0px');
    }
    addEventListener('keydown', (e) => {
      if (!(e.altKey && e.shiftKey && e.code === 'KeyD')) return;
      if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      clearInterval(keyLoop); keyLoop = -1; // the visitor has it now
      $('#shortcut').scrollIntoView({ behavior: motion ? 'smooth' : 'auto', block: 'center' });
      flip();
    });
  }

  // ---------- 7. zero network: the manifest prints, the counter rolls back to 0 ----------
  const man = $('[data-manifest]');
  if (man && motion) {
    const lines = $$('span', man);
    man.classList.add('typing');
    let shown = false;
    inView(man, async () => {
      if (shown) return;
      shown = true;
      for (const l of lines) { l.classList.add('on'); await wait(80); }
    }, null, '0px 0px -15% 0px');
    const reqs = $('[data-reqs]');
    reqs.dataset.odo = '0';
    reqs.classList.add('odo');
    const o = odometer(reqs);
    inView(reqs, () => requestAnimationFrame(o.roll));
  }

  // ---------- 8. install: the line fills as you read the steps ----------
  const steps = $('[data-steps]');
  if (steps && ST) {
    steps.setAttribute('data-scrub', '');
    const items = $$('li', steps);
    ST.create({ trigger: steps, start: 'top 80%', end: 'bottom 55%', scrub: true, onUpdate: (s) => {
      steps.style.setProperty('--p', s.progress.toFixed(3));
      items.forEach((li, i) => li.classList.toggle('lit', s.progress >= i / (items.length - 1) - 0.001));
    } });
    steps.style.setProperty('--p', 0);
  }

  // pause looping demos while the tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearInterval(themeAuto); themeAuto = 0; if (keyLoop > 0) { clearInterval(keyLoop); keyLoop = 0; } }
  });
})();
