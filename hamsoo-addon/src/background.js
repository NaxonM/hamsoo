'use strict';

// Chromium runs this as a MV3 service worker (importScripts available);
// Firefox runs it as an event page where fontdb.js is loaded via the
// background.scripts array first.
if (typeof importScripts === 'function') {
  if (!globalThis.HamsooUtil) importScripts('shared/settings-util.js');
  if (!globalThis.HamsooFontDB) importScripts('fontdb.js');
}

const api = globalThis.browser ?? globalThis.chrome;
const MENU_ID = 'hamsoo-fix-selection';
const MENU_PICK_ID = 'hamsoo-pick-element';

// _locales lookup with an inline Persian fallback (the default locale), used
// for menu titles and the strings passed into injected page scripts.
function msg(key, fallback) {
  try {
    return (api.i18n && api.i18n.getMessage && api.i18n.getMessage(key)) || fallback;
  } catch (_) {
    return fallback;
  }
}

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
    title: msg('menuFixSelection', 'اصلاح جهت متن انتخاب‌شده (هم‌سو)'),
    contexts: ['all']
  });
  api.contextMenus.create({
    id: MENU_PICK_ID,
    title: msg('menuPickElement', 'راست‌چین‌سازی همیشگی یک عنصر در این سایت… (هم‌سو)'),
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
  // Dedupe defensively: duplicate patterns would map to duplicate script ids
  // and make registerContentScripts throw.
  const wanted = [...new Set(Array.isArray(patterns) ? patterns : await readCustomSites())];
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
        js: ['shared/settings-util.js', 'content.js'],
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

// Bring persisted settings up to the current schema once per install/startup.
async function migrateStoredSettings() {
  const util = globalThis.HamsooUtil;
  if (!util || typeof util.migrateSettings !== 'function') return;
  try {
    const res = await api.storage.local.get('settings');
    if (!res || !res.settings || typeof res.settings !== 'object') return;
    const { settings, changed } = util.migrateSettings(res.settings);
    if (changed) await api.storage.local.set({ settings });
  } catch (_) {
    // Storage unavailable; popup/content normalization still guards shapes.
  }
}

// Cross-device settings sync: compare storage.sync vs storage.local by syncVersion.
// The copy with the higher syncVersion counter wins conflicts.
async function _pullFromSync() {
  if (!api || !api.storage || !api.storage.sync || !api.storage.local) return;
  try {
    const [localRes, remoteRes] = await Promise.all([
      api.storage.local.get('settings'),
      api.storage.sync.get('settings')
    ]);
    const local = localRes && localRes.settings && typeof localRes.settings === 'object' ? localRes.settings : {};
    const remote = remoteRes && remoteRes.settings && typeof remoteRes.settings === 'object' ? remoteRes.settings : {};
    const localVer = typeof local.syncVersion === 'number' ? local.syncVersion : 0;
    const remoteVer = typeof remote.syncVersion === 'number' ? remote.syncVersion : 0;

    if (remoteVer > localVer) {
      const util = globalThis.HamsooUtil;
      const merged = Object.assign({}, local, remote);
      const normalized = util && typeof util.migrateSettings === 'function'
        ? util.migrateSettings(merged).settings
        : merged;
      await api.storage.local.set({ settings: normalized });
    } else if (localVer > remoteVer) {
      const util = globalThis.HamsooUtil;
      const slim = util && typeof util.getSlimSettingsForSync === 'function'
        ? util.getSlimSettingsForSync(local)
        : local;
      await api.storage.sync.set({ settings: slim }).catch(() => {});
    }
  } catch (_) {}
}

if (api && api.storage && api.storage.onChanged) {
  api.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync') {
      void _pullFromSync();
    }
  });
}

api.runtime.onInstalled.addListener(async () => {
  await migrateStoredSettings();
  await _pullFromSync();
  void setupMenu();
  void syncCustomSites();
});
if (api.runtime.onStartup) {
  api.runtime.onStartup.addListener(async () => {
    await migrateStoredSettings();
    await _pullFromSync();
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
  if (!tab || !tab.id) return;
  if (info.menuItemId === MENU_ID) {
    api.scripting.executeScript({
      target: { tabId: tab.id },
      func: fixSelection
    }).catch(() => {
      // Browser-internal pages do not permit script injection.
    });
  } else if (info.menuItemId === MENU_PICK_ID) {
    api.scripting.executeScript({
      target: { tabId: tab.id },
      func: startElementPicker,
      args: [{
        hint: msg('pickerHint', 'روی عنصری که هم‌سو باید همیشه اصلاح کند کلیک کنید — برای انصراف Esc را بزنید'),
        saved: msg('pickerSaved', 'ذخیره شد — هم‌سو از این پس این عنصر را در این سایت اصلاح می‌کند'),
        failed: msg('pickerFailed', 'ذخیرهٔ عنصر انتخابی ناموفق بود')
      }]
    }).catch(() => {
      // Browser-internal pages do not permit script injection.
    });
  }
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

// Interactive element picker (context menu): highlights the element under the
// cursor; clicking saves a CSS selector for it under settings.customSelectors,
// keyed by hostname. The content script unions those selectors into its scan,
// so the picked element is styled now and on future visits. Injected via
// executeScript, so the function must be fully self-contained.
function startElementPicker(texts) {
  if (window.__hamsooPickerActive) return;
  window.__hamsooPickerActive = true;
  const ext = globalThis.browser || globalThis.chrome;
  const Z = 2147483647;

  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:' + Z + ';pointer-events:none;' +
    'background:rgba(59,130,246,.16);outline:2px solid rgba(59,130,246,.95);' +
    'border-radius:3px;left:0;top:0;width:0;height:0;';
  const hint = document.createElement('div');
  hint.textContent = (texts && texts.hint) || '';
  hint.dir = 'auto';
  hint.style.cssText = 'position:fixed;z-index:' + Z + ';left:50%;bottom:24px;' +
    'transform:translateX(-50%);background:#111;color:#fff;' +
    'font:13px/1.6 system-ui,sans-serif;padding:8px 14px;border-radius:8px;' +
    'box-shadow:0 4px 16px rgba(0,0,0,.35);max-width:80vw;text-align:center;';
  document.documentElement.append(box, hint);

  function toast(message) {
    const el = hint.cloneNode(false);
    el.textContent = message;
    el.dir = 'auto';
    document.documentElement.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function esc(value) {
    return window.CSS && CSS.escape
      ? CSS.escape(value)
      : String(value).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
  }

  // Prefer a class-based selector (it generalizes to similar elements, e.g.
  // every future chat bubble), then a unique id, then a positional path.
  function selectorFor(el) {
    const tag = el.tagName.toLowerCase();
    const classes = Array.from(el.classList).filter(c => c && c.length <= 64).slice(0, 4);
    if (classes.length) {
      const sel = tag + '.' + classes.map(esc).join('.');
      try { if (document.querySelectorAll(sel).length) return sel; } catch (_) { /* invalid */ }
    }
    if (el.id) {
      const sel = '#' + esc(el.id);
      try { if (document.querySelectorAll(sel).length === 1) return sel; } catch (_) { /* invalid */ }
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      if (node.id) { parts.unshift('#' + esc(node.id)); break; }
      const parent = node.parentElement;
      const t = node.tagName.toLowerCase();
      if (!parent) { parts.unshift(t); break; }
      const same = Array.prototype.filter.call(parent.children, c => c.tagName === node.tagName);
      parts.unshift(same.length > 1 ? t + ':nth-of-type(' + (same.indexOf(node) + 1) + ')' : t);
      node = parent;
    }
    return parts.join(' > ');
  }

  let current = null;
  function cleanup() {
    window.__hamsooPickerActive = false;
    box.remove();
    hint.remove();
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mousedown', onSwallow, true);
    document.removeEventListener('mouseup', onSwallow, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
  }

  function onMove(event) {
    const el = document.elementFromPoint(event.clientX, event.clientY);
    if (!el || el === box || el === hint || el === current) return;
    current = el;
    const rect = el.getBoundingClientRect();
    box.style.left = rect.left + 'px';
    box.style.top = rect.top + 'px';
    box.style.width = rect.width + 'px';
    box.style.height = rect.height + 'px';
  }

  function onSwallow(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onClick(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const el = document.elementFromPoint(event.clientX, event.clientY) || current;
    cleanup();
    if (!el) return;
    const selector = selectorFor(el);
    if (!selector) return;
    (async () => {
      try {
        const res = await ext.storage.local.get('settings');
        const settings = res && res.settings && typeof res.settings === 'object' ? res.settings : {};
        const map = settings.customSelectors && typeof settings.customSelectors === 'object'
          ? settings.customSelectors
          : {};
        const key = location.hostname;
        const list = Array.isArray(map[key]) ? map[key] : [];
        if (!list.includes(selector)) list.push(selector);
        map[key] = list.slice(-20);
        settings.customSelectors = map;
        await ext.storage.local.set({ settings });
        toast(((texts && texts.saved) || '') + ' \u2014 ' + selector);
      } catch (_) {
        toast((texts && texts.failed) || '');
      }
    })();
  }

  function onKey(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cleanup();
  }

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('mousedown', onSwallow, true);
  document.addEventListener('mouseup', onSwallow, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
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
