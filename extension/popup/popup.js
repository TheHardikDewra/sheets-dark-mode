const DEFAULTS = { enabled: true, theme: 'graphite', followSystem: false, chartColors: 'keep', docOverrides: {} };
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
  render();
}

init();
