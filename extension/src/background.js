/*
 * Nightcell service worker.
 * - Seeds default settings on install.
 * - Repaints a sheet after a theme change by nudging the tab zoom 1% and back. Sheets only
 *   redraws its canvas on a real resize, and a zoom change is the one resize an extension can
 *   trigger without touching the document.
 * - Handles the Alt+Shift+D shortcut.
 */
const DEFAULTS = { enabled: true, theme: 'graphite', followSystem: false, chartColors: 'keep', docOverrides: {}, font: '' };
const SHEETS = /^https:\/\/docs\.google\.com\/spreadsheets\//;

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(null);
  const missing = Object.fromEntries(Object.entries(DEFAULTS).filter(([k]) => !(k in current)));
  if (Object.keys(missing).length) await chrome.storage.sync.set(missing);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function repaintTab(tabId) {
  const zoom = await chrome.tabs.getZoom(tabId);
  const nudge = zoom > 0.3 ? Math.round((zoom - 0.01) * 1000) / 1000 : zoom + 0.01;
  await chrome.tabs.setZoom(tabId, nudge);
  await sleep(160);
  await chrome.tabs.setZoom(tabId, zoom);
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === 'nightcell:repaint' && sender.tab && sender.tab.id !== undefined) {
    repaintTab(sender.tab.id).then(() => reply({ ok: true }), () => reply({ ok: false }));
    return true; // async reply
  }
  return false;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-dark') return;
  const { enabled } = await chrome.storage.sync.get({ enabled: DEFAULTS.enabled });
  await chrome.storage.sync.set({ enabled: !enabled });
});

// Keep the toolbar icon honest: a small "off" badge when dark mode is disabled.
async function syncBadge() {
  const { enabled } = await chrome.storage.sync.get({ enabled: DEFAULTS.enabled });
  await chrome.action.setBadgeText({ text: enabled ? '' : 'off' });
  await chrome.action.setBadgeBackgroundColor({ color: '#3a3a3a' });
}
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'sync' && 'enabled' in changes) syncBadge(); });
chrome.runtime.onStartup.addListener(syncBadge);
chrome.runtime.onInstalled.addListener(syncBadge);

// Exposed for the popup: is the active tab a sheet?
self.isSheetsUrl = (url) => SHEETS.test(url || '');
