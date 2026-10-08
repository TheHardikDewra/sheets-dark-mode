const DEFAULTS = { enabled: true, theme: 'graphite', followSystem: false, chartColors: 'keep', docOverrides: {}, font: '' };
const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULTS };
let docId = '';

function setRadio(group, value) {
  for (const b of group.querySelectorAll('[role="radio"]')) b.setAttribute('aria-checked', String(b.dataset.v === value));
}

function render() {
  $('enabled').setAttribute('aria-checked', String(settings.enabled));
  $('heroSub').textContent = !settings.enabled ? 'Off. Sheets look like normal'
    : settings.followSystem ? 'On when your computer is in dark mode' : 'On for every Google Sheet';
  setRadio($('themes'), settings.theme);
  setRadio($('chartSeg'), settings.chartColors);
  $('followSystem').checked = !!settings.followSystem;
  if (docId) setRadio($('docSeg'), (settings.docOverrides || {})[docId] || 'auto');
}

async function save(patch) {
  settings = { ...settings, ...patch };
  render();
  await chrome.storage.sync.set(patch);
}

function bindRadios(group, onPick) {
  group.addEventListener('click', (e) => {
    const b = e.target.closest('[role="radio"]');
    if (b) onPick(b.dataset.v);
  });
  group.addEventListener('keydown', (e) => { // arrow keys move between options
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const items = [...group.querySelectorAll('[role="radio"]')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    const next = items[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length];
    next.focus(); onPick(next.dataset.v); e.preventDefault();
  });
}

// ---------- font: any font installed on this computer (font.js) ----------
const UI_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const popupFont = (name) => { document.body.style.fontFamily = name ? `"${name}", ${UI_STACK}` : ''; };

function fontStatus(kind, name, found) {
  const weights = found ? new Set(found.filter((f) => !f.italic).map((f) => f.weight)).size : 0;
  const el = $('fontStatus');
  el.className = 'hint' + (kind === 'found' ? ' ok' : kind === 'missing' ? ' warn' : '');
  el.textContent = kind === 'found' ? `${name} is installed (${weights} ${weights === 1 ? 'weight' : 'weights'}). Cells, menus and charts use it, on your screen only.`
    : kind === 'missing' ? `${name} isn't installed on this computer, so Sheets keeps its fonts.`
    : kind === 'checking' ? `Looking for ${name}...`
    : 'Type a font installed on this computer. Cells, menus and charts use it, on your screen only.';
  $('fontReset').hidden = !settings.font && !$('font').value.trim();
}

let fontSeq = 0;
async function checkFont(raw) {
  const seq = ++fontSeq;
  const name = NightcellFont.clean(raw);
  if (!name) {
    popupFont('');
    if (settings.font) await save({ font: '' });
    fontStatus('idle');
    return;
  }
  fontStatus('checking', name);
  const found = await NightcellFont.probe(name);
  if (seq !== fontSeq) return; // a newer keystroke is being checked
  if (!found.some((f) => !f.italic)) { fontStatus('missing', name); return; }
  popupFont(name);
  if (settings.font !== name) await save({ font: name });
  fontStatus('found', name, found);
}

async function init() {
  $('ver').textContent = 'v' + chrome.runtime.getManifest().version;
  settings = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const m = tab && tab.url && tab.url.match(/^https:\/\/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/([^/?#]+)/);
  if (m) { docId = m[1]; $('docGroup').hidden = false; }

  const cmds = await chrome.commands.getAll();
  const toggle = cmds.find((c) => c.name === 'toggle-dark');
  $('shortcut').textContent = (toggle && toggle.shortcut) || 'Not set';

  $('enabled').addEventListener('click', () => save({ enabled: !settings.enabled }));
  $('followSystem').addEventListener('change', (e) => save({ followSystem: e.target.checked }));
  bindRadios($('themes'), (v) => save({ theme: v }));
  bindRadios($('chartSeg'), (v) => save({ chartColors: v }));
  bindRadios($('docSeg'), (v) => {
    const overrides = { ...(settings.docOverrides || {}) };
    if (v === 'auto') delete overrides[docId]; else overrides[docId] = v;
    save({ docOverrides: overrides });
  });
  $('editShortcut').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

  let fontTimer = 0;
  $('font').value = settings.font || '';
  $('font').addEventListener('input', (e) => { clearTimeout(fontTimer); const v = e.target.value; fontTimer = setTimeout(() => checkFont(v), 350); });
  $('font').addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(fontTimer); checkFont(e.target.value); } });
  $('fontReset').addEventListener('click', () => { clearTimeout(fontTimer); $('font').value = ''; checkFont(''); $('font').focus(); });
  if (settings.font) checkFont(settings.font); else fontStatus('idle');
  render();
}

init();
