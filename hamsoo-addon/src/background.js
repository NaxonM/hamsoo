'use strict';

// Chromium runs this as a MV3 service worker (importScripts available);
// Firefox runs it as an event page where fontdb.js is loaded via the
// background.scripts array first.
if (typeof importScripts === 'function' && !globalThis.HamsooFontDB) {
  importScripts('fontdb.js');
}

const api = globalThis.browser ?? globalThis.chrome;
const MENU_ID = 'hamsoo-fix-selection';

// Per-tab toolbar icon: full-color when Hamsoo actively styles the tab, muted
// gray when the site is supported but switched off. Non-Hamsoo tabs keep the
// gray default_icon from the manifest. Driven by content-script reports, so no
// extra host/tabs permissions are needed.
const ACTION = api.action || api.browserAction || null;
const ICON_ON = { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png' };
const ICON_OFF = { 16: 'icons/icon-gray-16.png', 32: 'icons/icon-gray-32.png', 48: 'icons/icon-gray-48.png' };
function setTabIcon(tabId, active) {
  if (!ACTION || typeof ACTION.setIcon !== 'function' || tabId == null) return;
  try {
    const r = ACTION.setIcon({ tabId, path: active ? ICON_ON : ICON_OFF });
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch (_) { /* tab closed or icon unavailable */ }
}

async function setupMenu() {
  try {
    await api.contextMenus.removeAll();
  } catch (_) {
    // No existing menu on first installation.
  }
  api.contextMenus.create({
    id: MENU_ID,
    title: (api.i18n && api.i18n.getMessage && api.i18n.getMessage('menuFixSelection')) ||
      'اصلاح جهت متن انتخاب‌شده (هم‌سو)',
    contexts: ['all']
  });
}

async function readCustomSites() {
  try {
    const res = await api.storage.local.get('settings');
    const sites = res && res.settings && Array.isArray(res.settings.customSites)
      ? res.settings.customSites
      : [];
    return sites.filter(p => typeof p === 'string' && /^https?:\/\//.test(p));
  } catch (_) {
    return [];
  }
}

function siteScriptId(pattern) {
  let hash = 2166136261;
  for (let i = 0; i < pattern.length; i += 1) {
    hash ^= pattern.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 'hamsoo-site-' + (hash >>> 0).toString(36);
}

// Keep dynamically registered content scripts (generic fallback sites) in
// sync with settings.customSites.
async function syncCustomSites(patterns) {
  const wanted = Array.isArray(patterns) ? patterns : await readCustomSites();
  const wantedIds = wanted.map(siteScriptId);

  let existing = [];
  try {
    existing = await api.scripting.getRegisteredContentScripts();
  } catch (_) {
    existing = [];
  }
  const existingIds = existing
    .map(s => s.id)
    .filter(id => id.startsWith('hamsoo-site-'));

  const toRemove = existingIds.filter(id => !wantedIds.includes(id));
  if (toRemove.length) {
    try { await api.scripting.unregisterContentScripts({ ids: toRemove }); } catch (_) { /* no-op */ }
  }

  const registrations = [];
  wanted.forEach((pattern, index) => {
    if (!existingIds.includes(wantedIds[index])) {
      registrations.push({
        id: wantedIds[index],
        matches: [pattern],
        js: ['content.js'],
        css: ['content.css'],
        runAt: 'document_idle',
        persistAcrossSessions: true
      });
    }
  });
  if (registrations.length) {
    await api.scripting.registerContentScripts(registrations);
  }
}

api.runtime.onInstalled.addListener(() => {
  void setupMenu();
  void syncCustomSites();
});
if (api.runtime.onStartup) {
  api.runtime.onStartup.addListener(() => {
    void setupMenu();
    void syncCustomSites();
  });
}

// Keyboard command: flip the global on/off switch. Content scripts and the
// popup both react to the storage change, so no per-tab messaging is needed.
// Toggling the global switch can arrive from two places (the native keyboard
// command and, on Chromium, the content-script keydown listener). A short time
// guard collapses duplicate toggles caused by a single keypress.
let lastToggle = 0;
async function toggleEnabled() {
  const now = Date.now();
  if (now - lastToggle < 250) return;
  lastToggle = now;
  try {
    const res = await api.storage.local.get('settings');
    const settings = res && res.settings && typeof res.settings === 'object' ? res.settings : {};
    // Mirror the "!== false" default used elsewhere so a missing value (treated
    // as on) toggles to off.
    settings.enabled = settings.enabled === false;
    await api.storage.local.set({ settings });
  } catch (_) {
    // Storage unavailable; nothing to toggle.
  }
}

if (api.commands && api.commands.onCommand) {
  api.commands.onCommand.addListener(command => {
    if (command === 'toggle-hamsoo') void toggleEnabled();
  });
}

api.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab || !tab.id) return;
  api.scripting.executeScript({
    target: { tabId: tab.id },
    func: fixSelection
  }).catch(() => {
    // Browser-internal pages do not permit script injection.
  });
});

// One-shot fix for any page via the context menu (activeTab permission).
function fixSelection() {
  function setRTL(element) {
    if (!(element instanceof HTMLElement)) return;
    element.setAttribute('dir', 'rtl');
    element.style.setProperty('direction', 'rtl', 'important');
    element.style.setProperty('text-align', 'start', 'important');
    element.style.setProperty('unicode-bidi', 'plaintext', 'important');
  }

  const selection = window.getSelection();
  const targets = [];

  if (selection && selection.rangeCount && selection.toString().trim()) {
    let node = selection.getRangeAt(0).commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    if (node) targets.push(node);
  } else if (document.activeElement) {
    targets.push(document.activeElement);
  }

  for (const element of targets) {
    setRTL(element);
    if (element.querySelectorAll) {
      element.querySelectorAll('p, div, li, span, h1, h2, h3, h4, h5, h6, td, th')
        .forEach(setRTL);
    }
  }
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return undefined;

  if (msg.type === 'HAMSOO_GET_FONT') {
    (async () => {
      try {
        const font = await globalThis.HamsooFontDB.get(String(msg.id || ''));
        if (!font || !font.bytes) {
          sendResponse(null);
          return;
        }
        sendResponse({ b64: bufferToBase64(font.bytes), format: font.format });
      } catch (_) {
        sendResponse(null);
      }
    })();
    return true;
  }

  if (msg.type === 'HAMSOO_TOGGLE') {
    void toggleEnabled();
    return undefined;
  }

  if (msg.type === 'HAMSOO_ICON') {
    if (_sender && _sender.tab && _sender.tab.id != null) {
      setTabIcon(_sender.tab.id, Boolean(msg.active));
    }
    return undefined;
  }

  if (msg.type === 'HAMSOO_SYNC_SITES') {
    (async () => {
      try {
        await syncCustomSites(msg.customSites);
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }

  return undefined;
});
