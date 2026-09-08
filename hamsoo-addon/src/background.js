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
  // and make registerContentScripts throw. Invalid patterns are separated out
  // instead of passed through -- a single bad entry used to reject the entire
  // batched register call and silently disable every custom site.
  const util = globalThis.HamsooUtil;
  const requested = [...new Set(Array.isArray(patterns) ? patterns : await readCustomSites())];
  const failed = [];
  const wanted = [];
  for (const pattern of requested) {
    const valid = util && typeof util.isValidMatchPattern === 'function'
      ? util.isValidMatchPattern(pattern)
      : true;
    if (valid) wanted.push(pattern);
    else failed.push({ pattern, error: 'invalid match pattern' });
  }
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

  let registered = 0;
  for (let index = 0; index < wanted.length; index += 1) {
    if (existingIds.includes(wantedIds[index])) continue;
    // Register one at a time. Browsers validate a batched call as a unit, so
    // one rejected pattern would take every other site down with it.
    try {
      await api.scripting.registerContentScripts([{
        id: wantedIds[index],
        matches: [wanted[index]],
        js: ['shared/settings-util.js', 'content.js'],
        css: ['content.css'],
        runAt: 'document_idle',
        persistAcrossSessions: true
      }]);
      registered += 1;
    } catch (error) {
      failed.push({ pattern: wanted[index], error: String((error && error.message) || error) });
    }
  }
  return { ok: failed.length === 0, registered, failed };
}

// Never fire-and-forget this: an unhandled rejection inside the service
// worker is invisible. Log partial failures so they are at least diagnosable.
async function syncCustomSitesReporting() {
  try {
    const result = await syncCustomSites();
    if (result && result.ok === false) {
      console.warn('[hamsoo] some custom sites could not be registered', result.failed);
    }
    return result;
  } catch (error) {
    console.warn('[hamsoo] custom site sync failed', error);
    return { ok: false, registered: 0, failed: [{ pattern: '*', error: String(error) }] };
  }
}

// The background page's single settings write funnel.
//
// Wraps the shared serialized read-modify-write helper so no code in this file
// performs its own get -> mutate -> set. The fallback exists only for the case
// where settings-util failed to load; it is deliberately NOT a second
// implementation of the merge, just a last-resort direct write.
async function writeSettings(mutate, options) {
  const util = globalThis.HamsooUtil;
  if (util && typeof util.updateStoredSettings === 'function') {
    return util.updateStoredSettings(api, mutate, options);
  }
  const res = await api.storage.local.get('settings');
  const settings = res && res.settings && typeof res.settings === 'object' ? res.settings : {};
  const result = mutate(settings);
  if (result === false) return null;
  const next = result && typeof result === 'object' ? result : settings;
  if (next && typeof next === 'object') delete next.syncVersion;
  await api.storage.local.set({ settings: next });
  return next;
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

// Drop leftover browser-profile copies from the removed storage.sync feature.
// Local storage is the only settings store; do not read or merge this payload.
async function discardLegacySyncSettings() {
  if (!api || !api.storage || !api.storage.sync || typeof api.storage.sync.remove !== 'function') return;
  try {
    await api.storage.sync.remove('settings');
  } catch (_) {}
}

// Opens the welcome tour exactly once, on a genuine first install.
//
// `reason` is checked explicitly by the caller: auto-opening a tab on every
// update is a well-documented uninstall driver, and onInstalled also fires for
// 'update' and 'browser_update'.
//
// The marker is written BEFORE the tab is created. If tabs.create throws, the
// worst case is a user who never sees the tour but can still open it from
// Settings -- far better than a tour that reopens on every browser start.
async function openWelcomePage() {
  const util = globalThis.HamsooUtil;
  try {
    const current = (util && util.WELCOME_VERSION) || 1;
    // The marker write and the decision to open must come from the SAME
    // serialized snapshot. Read-then-write across an await let a concurrent
    // write land in between, so the marker could be written against a stale
    // object -- losing whatever the other writer had just saved.
    let shouldOpen = false;
    await writeSettings(settings => {
      const seen = util && typeof util.normalizeOnboardedVersion === 'function'
        ? util.normalizeOnboardedVersion(settings.onboardedVersion)
        : (typeof settings.onboardedVersion === 'number' ? settings.onboardedVersion : 0);
      // A reinstall on top of an existing profile keeps its settings, and that
      // user has already been toured.
      if (seen >= current) return false;
      settings.onboardedVersion = current;
      shouldOpen = true;
    });
    if (!shouldOpen) return;
    if (api.tabs && api.tabs.create) {
      await api.tabs.create({ url: api.runtime.getURL('welcome.html'), active: true });
    }
  } catch (_) {
    // Storage or tabs unavailable; the tour stays reachable from Settings.
  }
}

api.runtime.onInstalled.addListener(async (details) => {
  await migrateStoredSettings();
  await discardLegacySyncSettings();
  void setupMenu();
  await syncCustomSitesReporting();
  if (details && details.reason === 'install') await openWelcomePage();
});
if (api.runtime.onStartup) {
  api.runtime.onStartup.addListener(async () => {
    await migrateStoredSettings();
    await discardLegacySyncSettings();
    void setupMenu();
    await syncCustomSitesReporting();
  });
}

// Keyboard command: flip the global on/off switch. Content scripts and the
// popup both react to the storage change, so no per-tab messaging is needed.
// Toggling the global switch can arrive from two places (the native keyboard
// command and, on Chromium, the content-script keydown listener). A short time
// guard collapses duplicate toggles caused by a single keypress.
const TOGGLE_DEDUPE_MS = 250;
let lastToggle = 0;

// The in-memory guard alone is not enough. Chromium can evict the MV3 service
// worker between the content-script keydown and the native command event, and
// a fresh worker would apply both halves of a single keypress -- flipping the
// switch twice for a net no-op. Mirror the timestamp into storage.session so
// the guard survives eviction; fall back to memory where it is unavailable.
async function readStoredToggle() {
  if (!api || !api.storage || !api.storage.session) return 0;
  try {
    const res = await api.storage.session.get('lastToggle');
    return res && typeof res.lastToggle === 'number' ? res.lastToggle : 0;
  } catch (_) {
    return 0;
  }
}

async function writeStoredToggle(value) {
  if (!api || !api.storage || !api.storage.session) return;
  try { await api.storage.session.set({ lastToggle: value }); } catch (_) { /* no-op */ }
}

async function toggleEnabled() {
  const now = Date.now();
  // Synchronous claim first: two events reaching the same live worker must not
  // both get past the guard while awaiting session storage.
  if (now - lastToggle < TOGGLE_DEDUPE_MS) return;
  lastToggle = now;
  // Cross-worker claim: catches the eviction case the memory guard cannot see.
  if (now - (await readStoredToggle()) < TOGGLE_DEDUPE_MS) return;
  await writeStoredToggle(now);
  try {
    // Serialized so a toggle racing a usage-day write or a language change
    // cannot be silently overwritten by whichever read started first.
    await writeSettings(settings => {
      // Mirror the "!== false" default used elsewhere so a missing value
      // (treated as on) toggles to off.
      settings.enabled = settings.enabled === false;
    });
  } catch (_) {
    // Storage unavailable; nothing to toggle.
  }
}

// Counts today as a usage day for the feedback ask. Fires on every styled page
// load, so it is written to be cheap: the day key is compared first and storage
// is only touched on the first hit of a new day.
//
// Usage days are a local engagement fact. The write still goes through the
// serialized funnel so it cannot clobber a concurrent toggle or language change.
async function recordUsageDay() {
  const util = globalThis.HamsooUtil;
  if (!util || typeof util.recordUsageDay !== 'function') return;
  try {
    await writeSettings(settings => {
      // No stored settings yet means a fresh install that has not been through
      // migration; the install listener owns seeding, not this path.
      if (!settings || !Object.keys(settings).length) return false;
      const result = util.recordUsageDay(settings.support, Date.now());
      if (!result || !result.changed) return false;
      settings.support = result.support;
    }, { bump: false, localOnly: true });
  } catch (_) {
    // Storage unavailable; a missed usage day only delays the ask.
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
  function snapshotProp(element, name) {
    const value = element.style.getPropertyValue(name);
    if (!value) return null;
    return [value, element.style.getPropertyPriority(name)];
  }

  function setRTL(element) {
    if (!(element instanceof HTMLElement)) return;
    // Snapshot original dir= AND inline direction styles. Teardown used to
    // removeProperty() those three names, which also wiped author inline CSS.
    if (!element.hasAttribute('data-hamsoo-fix')) {
      element.setAttribute('data-hamsoo-fix', JSON.stringify({
        dir: element.getAttribute('dir'),
        direction: snapshotProp(element, 'direction'),
        textAlign: snapshotProp(element, 'text-align'),
        unicodeBidi: snapshotProp(element, 'unicode-bidi')
      }));
    }
    element.setAttribute('dir', 'rtl');
    element.style.setProperty('direction', 'rtl', 'important');
    element.style.setProperty('text-align', 'start', 'important');
    element.style.setProperty('unicode-bidi', 'isolate', 'important');
  }

  function intersects(range, node) {
    try { return range.intersectsNode(node); } catch (_) { return false; }
  }

  // A wrapper that contains both selected and unselected children must not be
  // flipped: direction inherits, so styling the common ancestor restyles siblings.
  function isPartialContainer(el, range) {
    if (!range || !el || !el.childNodes) return false;
    let hit = 0;
    let miss = 0;
    for (const kid of el.childNodes) {
      if (kid.nodeType === Node.TEXT_NODE && !kid.nodeValue.trim()) continue;
      if (intersects(range, kid)) hit += 1;
      else miss += 1;
      if (hit && miss) return true;
    }
    return false;
  }

  const selection = window.getSelection();
  const targets = [];
  let range = null;

  if (selection && selection.rangeCount && selection.toString().trim()) {
    range = selection.getRangeAt(0);
    let node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    if (node) targets.push(node);
  } else if (document.activeElement) {
    targets.push(document.activeElement);
  }

  for (const element of targets) {
    if (!(range && isPartialContainer(element, range))) setRTL(element);
    if (!element.querySelectorAll) continue;
    const descendants = element.querySelectorAll('p, div, li, span, h1, h2, h3, h4, h5, h6, td, th');
    for (const child of descendants) {
      if (range && !intersects(range, child)) continue;
      if (range && isPartialContainer(child, range)) continue;
      setRTL(child);
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
        // This picker is injected into the PAGE, where the shared settings
        // helper does not exist. Writing storage directly from here would be a
        // second writer racing the background funnel. Hand the write over.
        const reply = await ext.runtime.sendMessage({
          type: 'HAMSOO_ADD_SELECTOR',
          host: location.hostname,
          selector
        });
        if (!reply || reply.ok !== true) throw new Error('write rejected');
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
    // A content script reporting "active" means Hamsoo actually styled a page,
    // which is the only honest definition of a usage day. Reusing this existing
    // report keeps the signal free: no new message type, no new permission.
    if (msg.active) void recordUsageDay();
    return undefined;
  }

  // Selector picks arrive from the injected page picker, which cannot reach
  // the shared settings helper. The merge lives here so picks go through the
  // same funnel as every other write.
  if (msg.type === 'HAMSOO_ADD_SELECTOR') {
    (async () => {
      try {
        const host = typeof msg.host === 'string' ? msg.host : '';
        const selector = typeof msg.selector === 'string' ? msg.selector : '';
        if (!host || !selector) {
          sendResponse({ ok: false, error: 'missing host or selector' });
          return;
        }
        await writeSettings(settings => {
          const map = settings.customSelectors && typeof settings.customSelectors === 'object'
            ? settings.customSelectors
            : {};
          const list = Array.isArray(map[host]) ? map[host].slice() : [];
          if (list.includes(selector)) return false;
          list.push(selector);
          map[host] = list.slice(-20);
          settings.customSelectors = map;
        });
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }

  // The welcome tour offers a language switch, because it opens on install --
  // when 'auto' has usually resolved to English for a Persian-speaking user on
  // an English-language browser. It routes the change through here instead of
  // writing storage itself, so the shared persist funnel keeps sole ownership;
  // two writers would drift.
  // Narrow settings mutations from popup/fonts. Never accept a full UI snapshot
  // as the stored object — full snapshots clobber concurrent edits.
  if (msg.type === 'HAMSOO_PATCH_SETTINGS') {
    (async () => {
      try {
        const patch = msg.patch && typeof msg.patch === 'object' ? msg.patch : null;
        if (!patch) {
          sendResponse({ ok: false, error: 'missing patch' });
          return;
        }
        const next = await writeSettings(settings => {
          const helper = globalThis.HamsooUtil;
          if (!helper || typeof helper.applySettingsPatch !== 'function') return false;
          helper.applySettingsPatch(settings, patch);
        });
        sendResponse({ ok: true, settings: next });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }

  if (msg.type === 'HAMSOO_SET_LANG') {
    (async () => {
      try {
        const lang = msg.lang;
        if (lang !== 'auto' && lang !== 'fa' && lang !== 'en' && lang !== 'ar') {
          sendResponse({ ok: false, error: 'unsupported language' });
          return;
        }
        await writeSettings(settings => {
          if (settings.lang === lang) return false;
          settings.lang = lang;
        });
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }

  if (msg.type === 'HAMSOO_SYNC_SITES') {
    (async () => {
      try {
        const result = await syncCustomSites(msg.customSites);
        // Forward per-pattern failures so the popup can stop reporting
        // unconditional success.
        sendResponse(result && typeof result === 'object'
          ? { ok: result.ok !== false, registered: result.registered, failed: result.failed || [] }
          : { ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }

  return undefined;
});
