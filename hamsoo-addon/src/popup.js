'use strict';

// This script drives popup.html, which hosts both the main view and the
// settings view (options.html is now just a redirect stub into
// popup.html?view=settings). Render functions and event bindings still guard
// against missing nodes.

const api = globalThis.browser ?? globalThis.chrome ?? null;
const hasAPI = Boolean(api && api.storage && api.storage.local);
const CUSTOM_PREFIX = 'custom:';

const SITES = [
  { key: 'chatgpt', label: 'ChatGPT' },
  { key: 'claude', label: 'Claude' },
  { key: 'gemini', label: 'Gemini' },
  { key: 'deepseek', label: 'DeepSeek' },
  { key: 'grok', label: 'Grok' },
  { key: 'perplexity', label: 'Perplexity' },
  { key: 'copilot', label: 'Copilot' },
  { key: 'aistudio', label: 'AI Studio' },
  { key: 'qwen', label: 'Qwen' },
  { key: 'kimi', label: 'Kimi' },
  { key: 'poe', label: 'Poe' },
  { key: 'notebooklm', label: 'NotebookLM' }
];

const SITE_HOSTS = {
  'chatgpt.com': 'chatgpt',
  'claude.ai': 'claude',
  'gemini.google.com': 'gemini',
  'chat.deepseek.com': 'deepseek',
  'grok.com': 'grok',
  'perplexity.ai': 'perplexity',
  'www.perplexity.ai': 'perplexity',
  'copilot.microsoft.com': 'copilot',
  'aistudio.google.com': 'aistudio',
  'chat.qwen.ai': 'qwen',
  // Apex as well as www: the suffix fallback only matches SUBdomains of a
  // listed host, so 'www.kimi.com' could never cover the bare apex.
  'kimi.com': 'kimi',
  'www.kimi.com': 'kimi',
  'kimi.moonshot.cn': 'kimi',
  'poe.com': 'poe',
  'notebooklm.google.com': 'notebooklm'
};

const BUILTIN_FONTS = [
  { key: 'Vazirmatn', label: 'وزیرمتن', labelEn: 'Vazirmatn' },
  { key: 'Estedad', label: 'استعداد', labelEn: 'Estedad' },
  { key: 'Sahel', label: 'ساحل', labelEn: 'Sahel' },
  { key: 'Shabnam', label: 'شبنم', labelEn: 'Shabnam' },
  { key: 'Samim', label: 'صمیم', labelEn: 'Samim' },
  { key: 'Gandom', label: 'گندم', labelEn: 'Gandom' }
];

const DEFAULT_SITES = Object.fromEntries(SITES.map(s => [s.key, true]));

const DEFAULTS = Object.freeze({
  enabled: true,
  fontEnabled: true,
  readabilityEnabled: true,
  digitsEnabled: false,
  digitsScript: 'fa',
  font: 'Vazirmatn',
  fontSize: 15,
  lineHeight: 1.9,
  fontWeight: 400,
  letterSpacing: 0,
  textAlign: 'start',
  maxWidth: 0,
  customFonts: [],
  sites: DEFAULT_SITES,
  customSites: [],
  siteOverrides: {},
  customSelectors: {},
  mode: 'system',
  accent: 'blue',
  lang: 'auto',
  punctuationFixEnabled: true,
  shortcut: 'Alt+Shift+R',
  // True once the shortcut is confirmed registered as the actual browser-wide
  // command binding, not just matched locally by the content-script listener.
  shortcutIsGlobal: true,
  // Read from the shared util rather than restated, so DEFAULTS can never claim
  // an older schema than the one migrate/normalize actually write.
  schemaVersion: HamsooUtil.SCHEMA_VERSION
});

let settings = structuredClone(DEFAULTS);
// Last storage copy we have acknowledged. save() sends only the keys that
// differ from this, so a stale popup snapshot cannot overwrite unrelated fields.
let lastAcked = structuredClone(DEFAULTS);
let saveTimer = 0;
let statusTimer = 0;
let currentTab = null; // { host, origin, pattern, siteKey, isCustom }
const loadedPreviewFonts = new Set();

const $ = id => document.getElementById(id);

// Query params drive preview/QA overrides (?uimode=dark&uilang=en) and the
// dedicated options page redirect (?view=settings). Used by init().
const params = new URLSearchParams(location.search);

/* ---------- i18n (runtime-switchable UI language) ---------- */
let LANG = 'fa';
function t(key, ...args) {
  const val = globalThis.HamsooI18n ? globalThis.HamsooI18n.t(key, LANG) : key;
  return typeof val === 'function' ? val(...args) : val;
}
function applyI18n() {
  LANG = globalThis.HamsooI18n ? globalThis.HamsooI18n.applyDom(document, settings.lang) : 'fa';
  try { localStorage.setItem('hamsoo-lang', settings.lang || 'auto'); } catch (_) {}
  const verEl = document.querySelector('.version');
  if (verEl && hasAPI && api.runtime && typeof api.runtime.getManifest === 'function') {
    const v = String(api.runtime.getManifest().version || '').split('.').slice(0, 2).join('.');
    if (v) verEl.textContent = locDigits(v);
  }
}

/* ---------- per-site scope helpers ---------- */
function overrideKey() {
  if (!currentTab) return null;
  return currentTab.siteKey || currentTab.host;
}
function currentOverride() {
  const key = overrideKey();
  if (!key) return null;
  const ov = settings.siteOverrides[key];
  return ov && ov.enabled !== false ? ov : null;
}
function overrideOn() {
  return Boolean(currentOverride());
}
function activeFont() {
  const ov = currentOverride();
  return ov && ov.font ? ov.font : settings.font;
}
function activeSize() {
  const ov = currentOverride();
  return ov && ov.fontSize != null ? ov.fontSize : settings.fontSize;
}
function activeLineHeight() {
  const ov = currentOverride();
  return ov && ov.lineHeight != null ? ov.lineHeight : settings.lineHeight;
}
function setActiveFont(key) {
  const ov = currentOverride();
  if (ov) ov.font = key; else settings.font = key;
}
function setActiveSize(value) {
  const ov = currentOverride();
  if (ov) ov.fontSize = value; else settings.fontSize = value;
}
function setActiveLineHeight(value) {
  const ov = currentOverride();
  if (ov) ov.lineHeight = value; else settings.lineHeight = value;
}
function activeWeight() {
  const ov = currentOverride();
  return ov && ov.fontWeight != null ? ov.fontWeight : settings.fontWeight;
}
function activeLetterSpacing() {
  const ov = currentOverride();
  return ov && ov.letterSpacing != null ? ov.letterSpacing : settings.letterSpacing;
}
function setActiveWeight(value) {
  const ov = currentOverride();
  if (ov) ov.fontWeight = value; else settings.fontWeight = value;
}
function setActiveLetterSpacing(value) {
  const ov = currentOverride();
  if (ov) ov.letterSpacing = value; else settings.letterSpacing = value;
}
function activeAlign() {
  const ov = currentOverride();
  return ov && ov.textAlign ? ov.textAlign : settings.textAlign;
}
function setActiveAlign(value) {
  const ov = currentOverride();
  if (ov) ov.textAlign = value; else settings.textAlign = value;
}
function activeWidth() {
  const ov = currentOverride();
  return ov && ov.maxWidth != null ? ov.maxWidth : settings.maxWidth;
}
function setActiveWidth(value) {
  const ov = currentOverride();
  if (ov) ov.maxWidth = value; else settings.maxWidth = value;
}
function setOverrideEnabled(on) {
  const key = overrideKey();
  if (!key) return;
  if (on) {
    if (settings.siteOverrides[key]) {
      settings.siteOverrides[key].enabled = true;
    } else {
      settings.siteOverrides[key] = {
        font: settings.font,
        fontSize: settings.fontSize,
        lineHeight: settings.lineHeight,
        fontWeight: settings.fontWeight,
        letterSpacing: settings.letterSpacing,
        textAlign: settings.textAlign,
        maxWidth: settings.maxWidth,
        enabled: true
      };
    }
  } else if (settings.siteOverrides[key]) {
    // Keep the saved per-site values so re-enabling restores them.
    settings.siteOverrides[key].enabled = false;
  }
}

/* ---------- backup (import/export) helpers ---------- */
function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
function base64ToBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
function cloneSettings(value) {
  try { return structuredClone(value); } catch (_) {
    return JSON.parse(JSON.stringify(value));
  }
}

function sendSettingsPatch(patch) {
  if (!hasAPI || !api.runtime || typeof api.runtime.sendMessage !== 'function') {
    return Promise.reject(new Error('no runtime'));
  }
  const sent = api.runtime.sendMessage({ type: 'HAMSOO_PATCH_SETTINGS', patch });
  if (sent && typeof sent.then === 'function') return sent;
  return new Promise((resolve, reject) => {
    try {
      api.runtime.sendMessage({ type: 'HAMSOO_PATCH_SETTINGS', patch }, (res) => {
        const err = api.runtime && api.runtime.lastError;
        if (err) reject(new Error(err.message || String(err)));
        else resolve(res);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Narrow patch through the background. Never write the popup's full in-memory
// object — that snapshot is what clobbered concurrent edits.
async function writeSettings() {
  const util = globalThis.HamsooUtil;
  if (!util || typeof util.diffSettingsFields !== 'function') {
    throw new Error('settings helper missing');
  }
  const fields = util.diffSettingsFields(lastAcked, settings);
  if (!Object.keys(fields).length) return;
  const ackedAtSend = lastAcked;
  const res = await sendSettingsPatch({ fields });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'patch failed');
  if (res.settings && typeof res.settings === 'object') {
    const committed = normalize(res.settings);
    settings = util.rebasePendingSettings(ackedAtSend, settings, committed);
    lastAcked = cloneSettings(committed);
  }
}

async function persistNow() {
  if (!hasAPI) return false;
  try {
    const res = await sendSettingsPatch({ replace: settings });
    if (!res || res.ok === false) throw new Error((res && res.error) || 'replace failed');
    if (res.settings && typeof res.settings === 'object') {
      settings = normalize(res.settings);
    }
    lastAcked = cloneSettings(settings);
    return true;
  } catch (_) {
    setStatus(t('saveError'));
    return false;
  }
}
async function exportSettings() {
  const payload = {
    format: 'hamsoo-settings',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: structuredClone(settings),
    fonts: []
  };
  if (globalThis.HamsooFontDB && settings.customFonts.length) {
    try {
      const all = await globalThis.HamsooFontDB.list();
      const wanted = new Set(settings.customFonts.map(f => f.id));
      for (const font of all) {
        if (!wanted.has(font.id) || !font.bytes) continue;
        payload.fonts.push({
          id: font.id,
          name: font.name,
          format: font.format,
          size: font.size,
          added: font.added,
          bytes: bufferToBase64(font.bytes)
        });
      }
    } catch (_) { /* export without embedded font bytes */ }
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'hamsoo-settings-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(t('exported'));
}
// Imported site patterns arrive with no host permission attached. Ask for
// them in a single prompt and drop whatever is not granted, mirroring the
// interactive "add this site" flow instead of silently trusting the file.
// Returns the number of patterns that were dropped.
async function requestImportedSitePermissions() {
  const patterns = Array.isArray(settings.customSites) ? settings.customSites : [];
  if (!hasAPI || !api.permissions || !patterns.length) return 0;
  const missing = [];
  for (const pattern of patterns) {
    let has = false;
    try { has = await api.permissions.contains({ origins: [pattern] }); } catch (_) { has = false; }
    if (!has) missing.push(pattern);
  }
  if (!missing.length) return 0;
  let granted = false;
  try { granted = await api.permissions.request({ origins: missing }); } catch (_) { granted = false; }
  if (granted) return 0;
  settings.customSites = patterns.filter(p => !missing.includes(p));
  return missing.length;
}

async function importSettings(file) {
  const maxImport = HamsooUtil.MAX_IMPORT_BYTES || (12 * 4 * 1024 * 1024);
  if (file && typeof file.size === 'number' && file.size > maxImport) {
    setStatus(t('invalidFile'));
    return;
  }
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (_) {
    setStatus(t('invalidFile'));
    return;
  }
  const parsed = HamsooUtil.recognizeImportedSettings(data);
  if (!parsed || !parsed.ok) {
    setStatus(t(parsed && parsed.error === 'unsupportedVersion' ? 'importUnsupported' : 'invalidFile'));
    return;
  }
  if (typeof confirm === 'function' && !confirm(t('importConfirm'))) return;

  const previous = cloneSettings(settings);
  const previousAcked = cloneSettings(lastAcked);
  const maxFonts = HamsooUtil.MAX_CUSTOM_FONTS;
  const maxBytes = HamsooUtil.MAX_FONT_BYTES;
  const acceptedFontIds = new Set();
  const stagedFontIds = [];
  let skippedFonts = 0;
  const incomingFonts = Array.isArray(parsed.fonts) ? parsed.fonts : [];
  const hadFontPayload = incomingFonts.length > 0 && Boolean(globalThis.HamsooFontDB);
  if (hadFontPayload) {
    for (const font of incomingFonts) {
      if (!font || typeof font.id !== 'string' || typeof font.bytes !== 'string') continue;
      if (acceptedFontIds.size >= maxFonts) { skippedFonts += 1; continue; }
      let bytes;
      try { bytes = base64ToBuffer(font.bytes); } catch (_) { skippedFonts += 1; continue; }
      const size = bytes && bytes.byteLength ? bytes.byteLength : (Number(font.size) || 0);
      if (size > maxBytes) { skippedFonts += 1; continue; }
      const sniffed = HamsooUtil.sniffFontFormat ? HamsooUtil.sniffFontFormat(bytes) : '';
      if (!sniffed) { skippedFonts += 1; continue; }
      try {
        await globalThis.HamsooFontDB.put({
          id: font.id,
          name: typeof font.name === 'string' ? font.name : 'فونت شخصی',
          format: sniffed,
          bytes,
          size,
          added: Number(font.added) || Date.now()
        });
        acceptedFontIds.add(font.id);
        stagedFontIds.push(font.id);
      } catch (_) { skippedFonts += 1; }
    }
  }
  settings = normalize(parsed.settings);
  if (hadFontPayload) {
    settings.customFonts = settings.customFonts.filter(f => acceptedFontIds.has(f.id));
  }
  settings.customFonts = settings.customFonts.slice(0, maxFonts);
  delete settings.syncVersion;
  const deniedSites = await requestImportedSitePermissions();
  const saved = await persistNow();
  if (!saved) {
    for (const id of stagedFontIds) {
      try { await globalThis.HamsooFontDB.remove(id); } catch (_) {}
    }
    settings = previous;
    lastAcked = previousAcked;
    renderAll();
    return;
  }
  applyI18n();
  await detectCurrentTab();
  renderAll();
  void ensurePreviewFont(activeFont());
  const pushed = await pushCustomSites();
  if (!pushed) return;
  setStatus(skippedFonts || deniedSites ? t('importedPartial') : t('imported'));
}
const faDigits = value => String(value).replace(/[0-9.]/g, ch => '\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9\u066b'['0123456789.'.indexOf(ch)]);

const locDigits = value => (LANG === 'fa' ? faDigits(value) : String(value));

function normalize(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const rawSites = raw.sites && typeof raw.sites === 'object' ? raw.sites : {};
  const sites = {};
  for (const site of SITES) sites[site.key] = rawSites[site.key] !== false;
  const customFonts = (Array.isArray(raw.customFonts) ? raw.customFonts : [])
    .filter(f => f && typeof f.id === 'string' && typeof f.name === 'string');
  let font = typeof raw.font === 'string' ? raw.font : DEFAULTS.font;
  const builtinKeys = new Set(BUILTIN_FONTS.map(f => f.key));
  if (font.startsWith(CUSTOM_PREFIX)) {
    const id = font.slice(CUSTOM_PREFIX.length);
    if (!customFonts.some(f => f.id === id)) font = DEFAULTS.font;
  } else if (!builtinKeys.has(font)) {
    font = DEFAULTS.font;
  }
  const rawOverrides = raw.siteOverrides && typeof raw.siteOverrides === 'object' ? raw.siteOverrides : {};
  const siteOverrides = {};
  for (const okey of Object.keys(rawOverrides)) {
    const ov = rawOverrides[okey];
    if (!ov || typeof ov !== 'object') continue;
    const clean = {};
    if (typeof ov.font === 'string') {
      if (ov.font.startsWith(CUSTOM_PREFIX)) {
        if (customFonts.some(f => CUSTOM_PREFIX + f.id === ov.font)) clean.font = ov.font;
      } else if (builtinKeys.has(ov.font)) {
        clean.font = ov.font;
      }
    }
    if (ov.fontSize != null) clean.fontSize = HamsooUtil.clampSize(ov.fontSize);
    if (ov.lineHeight != null) clean.lineHeight = HamsooUtil.clampLineHeight(ov.lineHeight);
    if (ov.fontWeight != null) clean.fontWeight = HamsooUtil.clampWeight(ov.fontWeight);
    if (ov.letterSpacing != null) clean.letterSpacing = HamsooUtil.clampLetterSpacing(ov.letterSpacing);
    if (ov.textAlign != null) clean.textAlign = HamsooUtil.normalizeAlign(ov.textAlign);
    if (ov.maxWidth != null) clean.maxWidth = HamsooUtil.clampMeasure(ov.maxWidth);
    // Only keep overrides that carry at least one real value; a bare
    // { enabled } object holds no per-site settings worth storing.
    const hasValues = Object.keys(clean).length > 0;
    clean.enabled = ov.enabled !== false;
    if (hasValues) siteOverrides[okey] = clean;
  }
  // Picked-element selectors (context-menu element picker), keyed by host.
  const rawSelectors = raw.customSelectors && typeof raw.customSelectors === 'object' ? raw.customSelectors : {};
  const customSelectors = {};
  for (const okey of Object.keys(rawSelectors)) {
    const list = rawSelectors[okey];
    if (!Array.isArray(list)) continue;
    const cleanList = [...new Set(list.filter(s => typeof s === 'string' && s.trim() && s.length <= 400))].slice(0, 20);
    if (cleanList.length) customSelectors[okey] = cleanList;
  }
  return {
    enabled: raw.enabled !== false,
    fontEnabled: raw.fontEnabled !== false,
    readabilityEnabled: raw.readabilityEnabled !== false,
    digitsEnabled: raw.digitsEnabled === true,
    digitsScript: HamsooUtil.normalizeDigitsScript(raw.digitsScript),
    font,
    fontSize: HamsooUtil.clampSize(raw.fontSize),
    lineHeight: HamsooUtil.clampLineHeight(raw.lineHeight),
    fontWeight: HamsooUtil.clampWeight(raw.fontWeight),
    letterSpacing: HamsooUtil.clampLetterSpacing(raw.letterSpacing),
    textAlign: HamsooUtil.normalizeAlign(raw.textAlign),
    maxWidth: HamsooUtil.clampMeasure(raw.maxWidth),
    customFonts,
    sites,
    // Validate against the match-pattern grammar rather than just checking
    // `typeof p === 'string'`: ported origins, `<all_urls>` and outright
    // garbage all used to survive an import unchallenged.
    customSites: HamsooUtil.sanitizeMatchPatterns(raw.customSites),
    siteOverrides,
    customSelectors,
    schemaVersion: HamsooUtil.SCHEMA_VERSION,
    mode: ['system', 'light', 'dark'].includes(raw.mode) ? raw.mode : 'system',
    accent: ['blue', 'teal', 'violet', 'amber'].includes(raw.accent) ? raw.accent : 'blue',
    lang: ['auto', 'fa', 'en', 'ar'].includes(raw.lang) ? raw.lang : 'auto',
    punctuationFixEnabled: raw.punctuationFixEnabled !== false,
    shortcut: typeof raw.shortcut === 'string' ? raw.shortcut : 'Alt+Shift+R',
    shortcutIsGlobal: raw.shortcutIsGlobal !== false,
    // Onboarding and feedback-ask state. These are NOT popup-owned fields, but
    // normalize() is the shape every popup save is built from, so omitting them
    // meant opening the popup and touching any control erased the install
    // clock, the recorded usage days, and any "later"/"never" the user had
    // already chosen -- and exports taken from popup state lost them too.
    onboardedVersion: HamsooUtil.normalizeOnboardedVersion(raw.onboardedVersion),
    support: HamsooUtil.normalizeSupport(raw.support, Date.now())
  };
}

function save(immediate = false) {
  clearTimeout(saveTimer);
  const doSave = async () => {
    if (hasAPI) {
      try {
        await writeSettings();
        setStatus(t('saved'));
      } catch (_) {
        setStatus(t('saveError'));
      }
    } else {
      setStatus(t('saved'));
    }
  };
  if (immediate) {
    void doSave();
  } else {
    saveTimer = setTimeout(doSave, 150);
  }
}

function setStatus(text) {
  const el = $('saveState');
  if (!el) return;
  el.textContent = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.textContent = ''; }, 1600);
}

/* ---------- theme ---------- */

const darkQuery = matchMedia('(prefers-color-scheme: dark)');

function applyTheme() {
  const dark = settings.mode === 'dark' || (settings.mode === 'system' && darkQuery.matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.dataset.accent = settings.accent;
  // Mirror to localStorage (synchronous) so theme-init.js can apply the theme
  // before first paint on the next open, avoiding a light->dark flash.
  try {
    localStorage.setItem('hamsoo-mode', settings.mode);
    localStorage.setItem('hamsoo-accent', settings.accent);
  } catch (_) {}
  for (const btn of document.querySelectorAll('#modeSeg button')) {
    const on = btn.dataset.mode === settings.mode;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-checked', String(on));
  }
  for (const btn of document.querySelectorAll('#accentRow .accent')) {
    const on = btn.dataset.accent === settings.accent;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-checked', String(on));
  }
  updateRoving($('modeSeg'), 'button');
  updateRoving($('accentRow'), 'button');
}

darkQuery.addEventListener('change', applyTheme);

function renderLang() {
  const seg = $('langSeg');
  if (!seg) return;
  for (const btn of seg.querySelectorAll('button')) {
    const on = btn.dataset.lang === settings.lang;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-checked', String(on));
  }
  updateRoving(seg, 'button');
}

function renderDigitsScript() {
  const row = $('digitsScriptRow');
  if (row) row.hidden = !settings.digitsEnabled;
  const seg = $('digitsScriptSeg');
  if (!seg) return;
  for (const btn of seg.querySelectorAll('button')) {
    const on = btn.dataset.script === settings.digitsScript;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-checked', String(on));
  }
  updateRoving(seg, 'button');
}

/* ---------- keyboard: roving focus for button groups ---------- */
// Keep exactly one tab stop in a group: the active (checked/pressed) item.
function updateRoving(container, selector) {
  if (!container) return;
  const items = [...container.querySelectorAll(selector)];
  if (!items.length) return;
  const active = items.find(el =>
    el.getAttribute('aria-checked') === 'true' ||
    el.getAttribute('aria-pressed') === 'true' ||
    el.classList.contains('on')) || items[0];
  for (const el of items) el.tabIndex = el === active ? 0 : -1;
}

// Arrow/Home/End navigation for a button group. Radio groups also select on
// move (WAI-ARIA radiogroup pattern); toolbars only move focus. RTL-aware.
function setupGroup(container, selector, radio) {
  if (!container || container.dataset.rovingReady) return;
  container.dataset.rovingReady = '1';
  container.addEventListener('keydown', e => {
    const items = [...container.querySelectorAll(selector)].filter(el => !el.disabled);
    if (!items.length) return;
    const rtl = (document.documentElement.getAttribute('dir') || 'ltr') === 'rtl';
    const idx = items.indexOf(document.activeElement);
    const fwd = idx < 0 ? 0 : (idx + 1) % items.length;
    const back = idx < 0 ? 0 : (idx - 1 + items.length) % items.length;
    let next;
    switch (e.key) {
      case 'ArrowRight': next = rtl ? back : fwd; break;
      case 'ArrowLeft': next = rtl ? fwd : back; break;
      case 'ArrowDown': next = fwd; break;
      case 'ArrowUp': next = back; break;
      case 'Home': next = 0; break;
      case 'End': next = items.length - 1; break;
      default: return;
    }
    e.preventDefault();
    const target = items[next];
    if (radio) {
      target.click();
      const after = [...container.querySelectorAll(selector)].filter(el => !el.disabled);
      const focused = after.find(el =>
        el.getAttribute('aria-checked') === 'true' || el.classList.contains('on'))
        || after[next] || target;
      focused.focus();
    } else {
      for (const el of items) el.tabIndex = el === target ? 0 : -1;
      target.focus();
    }
  });
}

/* ---------- rendering ---------- */

function renderSites() {
  const grid = $('siteGrid');
  if (!grid) return;
  grid.textContent = '';
  // Alphabetical order keeps the grid scannable in both LTR and RTL states.
  const orderedSites = [...SITES].sort((a, b) => a.label.localeCompare(b.label));
  for (const site of orderedSites) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'site-chip' + (settings.sites[site.key] ? ' on' : '');
    btn.setAttribute('aria-pressed', String(Boolean(settings.sites[site.key])));
    const dot = document.createElement('span');
    dot.className = 'dot';
    const label = document.createElement('span');
    label.textContent = site.label;
    btn.append(dot, label);
    btn.addEventListener('click', () => {
      settings.sites[site.key] = !settings.sites[site.key];
      renderSites();
      renderCurrentSite();
      save();
    });
    grid.appendChild(btn);
  }
  updateRoving(grid, 'button');
  const onCount = SITES.filter(s => settings.sites[s.key]).length;
  const onLabel = LANG === 'fa' ? faDigits(onCount) : String(onCount);
  const totalLabel = LANG === 'fa' ? faDigits(SITES.length) : String(SITES.length);
  $('siteCount').textContent = t('siteCount', onLabel, totalLabel);
}

function hostFromPattern(pattern) {
  return String(pattern).replace(/^https?:\/\//, '').replace(/\/\*$/, '');
}

// Ask the background worker to (re-)register custom sites and surface the
// outcome. Registration can fail per pattern, and reporting success anyway is
// exactly what made these failures invisible.
async function pushCustomSites() {
  if (!hasAPI || !api.runtime) return true;
  let res;
  try {
    res = await api.runtime.sendMessage({ type: 'HAMSOO_SYNC_SITES', customSites: settings.customSites });
  } catch (_) {
    setStatus(t('siteRegisterFailed'));
    return false;
  }
  if (res && res.ok === false) {
    const bad = Array.isArray(res.failed) && res.failed.length
      ? res.failed.map(f => f && f.pattern).filter(Boolean).join(', ')
      : '';
    setStatus(bad ? t('siteRegisterFailed') + ' \u2014 ' + bad : t('siteRegisterFailed'));
    return false;
  }
  return true;
}

async function removeCustomSite(pattern) {
  settings.customSites = settings.customSites.filter(p => p !== pattern);
  // Persist immediately so the open tab hears storage.onChanged and tears down.
  // A debounced save would leave Hamsoo running until the timer fired.
  await persistNow();
  if (hasAPI && api.runtime) {
    await pushCustomSites();
  }
  // Revoke the origin permission too, so removed sites don't leave a
  // lingering host grant behind.
  if (hasAPI && api.permissions && typeof api.permissions.remove === 'function') {
    try { await api.permissions.remove({ origins: [pattern] }); } catch (_) { /* already gone */ }
  }
  if (currentTab && currentTab.pattern === pattern) currentTab.isCustom = false;
  renderCustomSites();
  renderCurrentSite();
}

function renderCustomSites() {
  const wrap = $('customSites');
  const list = $('customSiteList');
  if (!wrap || !list) return;
  const patterns = Array.isArray(settings.customSites) ? settings.customSites : [];
  wrap.hidden = patterns.length === 0;
  const emptyHint = $('customSitesEmpty');
  if (emptyHint) emptyHint.hidden = patterns.length !== 0;
  list.textContent = '';
  for (const pattern of patterns) {
    const row = document.createElement('div');
    row.className = 'custom-site-row';
    const host = document.createElement('span');
    host.className = 'host';
    host.textContent = hostFromPattern(pattern);
    host.title = pattern;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm ghost';
    btn.textContent = t('removeSite');
    btn.addEventListener('click', () => { void removeCustomSite(pattern); });
    row.append(host, btn);
    list.appendChild(row);
  }
  renderPickedElements();
}

/* ---------- picked elements (context-menu element picker) ---------- */
async function removeCustomSelector(hostKey, selector) {
  const map = settings.customSelectors && typeof settings.customSelectors === 'object' ? settings.customSelectors : {};
  const list = (Array.isArray(map[hostKey]) ? map[hostKey] : []).filter(s => s !== selector);
  if (list.length) map[hostKey] = list;
  else delete map[hostKey];
  settings.customSelectors = map;
  // Persist immediately so the open tab hears storage.onChanged and unstyles
  // the picked element. A debounced save would leave it marked.
  await persistNow();
  renderPickedElements();
}

function renderPickedElements() {
  const wrap = $('pickedElements');
  const list = $('pickedList');
  if (!wrap || !list) return;
  const map = settings.customSelectors && typeof settings.customSelectors === 'object' ? settings.customSelectors : {};
  const hosts = Object.keys(map).filter(h => Array.isArray(map[h]) && map[h].length);
  wrap.hidden = hosts.length === 0;
  const emptyHint = $('pickedEmpty');
  if (emptyHint) emptyHint.hidden = hosts.length !== 0;
  list.textContent = '';
  for (const hostKey of hosts) {
    for (const selector of map[hostKey]) {
      const row = document.createElement('div');
      row.className = 'custom-site-row';
      const label = document.createElement('span');
      label.className = 'host';
      label.dir = 'ltr';
      label.textContent = (hostKey || '?') + ' \u2014 ' + selector;
      label.title = selector;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-sm ghost';
      btn.textContent = t('remove');
      btn.addEventListener('click', () => { void removeCustomSelector(hostKey, selector); });
      row.append(label, btn);
      list.appendChild(row);
    }
  }
}

function familyForPreview(fontKey) {
  if (fontKey.startsWith(CUSTOM_PREFIX)) {
    return '"HamsooPreview_' + fontKey.slice(CUSTOM_PREFIX.length).replace(/[^a-zA-Z0-9_-]/g, '_') + '", "Vazirmatn", sans-serif';
  }
  return '"' + fontKey + '", "Vazirmatn", sans-serif';
}

async function ensurePreviewFont(fontKey) {
  if (!fontKey.startsWith(CUSTOM_PREFIX) || !globalThis.HamsooFontDB) return;
  const id = fontKey.slice(CUSTOM_PREFIX.length);
  if (loadedPreviewFonts.has(id)) return;
  try {
    const font = await globalThis.HamsooFontDB.get(id);
    if (!font || !font.bytes) return;
    const face = new FontFace('HamsooPreview_' + id.replace(/[^a-zA-Z0-9_-]/g, '_'), font.bytes);
    await face.load();
    document.fonts.add(face);
    loadedPreviewFonts.add(id);
    renderPreview();
  } catch (_) { /* preview only */ }
}

function renderFonts() {
  const grid = $('fontGrid');
  if (!grid) return;
  grid.textContent = '';
  const options = [
    ...BUILTIN_FONTS.map(f => ({ key: f.key, label: (LANG === 'en' && f.labelEn) ? f.labelEn : f.label })),
    ...settings.customFonts
      .map(f => ({ key: CUSTOM_PREFIX + f.id, label: f.name }))
  ];
  for (const option of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'font-option' + (activeFont() === option.key ? ' selected' : '');
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(activeFont() === option.key));
    const name = document.createElement('span');
    name.className = 'fname';
    name.textContent = option.label;
    const sample = document.createElement('span');
    sample.className = 'fsample';
    sample.textContent = 'متن نمونه';
    sample.style.fontFamily = familyForPreview(option.key);
    btn.append(name, sample);
    btn.addEventListener('click', () => {
      setActiveFont(option.key);
      renderFonts();
      renderRead();
      renderPreview();
      void ensurePreviewFont(option.key);
      save();
    });
    grid.appendChild(btn);
  }
  updateRoving(grid, 'button');
  $('fontControls').hidden = !settings.fontEnabled;
}


function supportsVariableWeight(fontKey) {
  if (!fontKey || typeof fontKey !== 'string') return false;
  // Variable fonts in Hamsoo roster are Vazirmatn, Estedad, Sahel
  const VARIABLE_FONTS = ['Vazirmatn', 'Estedad', 'Sahel'];
  return VARIABLE_FONTS.includes(fontKey);
}

function renderRead() {
  if (!$('fontSize')) return;
  const isVariable = supportsVariableWeight(activeFont());
  const weightInput = $('fontWeight');
  const weightRow = weightInput ? weightInput.closest('.slider-row') : null;

  if (weightInput) {
    weightInput.disabled = !isVariable;
  }
  if (weightRow) {
    weightRow.classList.toggle('disabled-row', !isVariable);
  }

  $('fontSize').value = String(activeSize());
  $('lineHeight').value = String(activeLineHeight());
  $('fontWeight').value = String(activeWeight());
  $('letterSpacing').value = String(activeLetterSpacing());
  $('fontSizeVal').textContent = locDigits(activeSize());
  $('lineHeightVal').textContent = locDigits(activeLineHeight());
  $('fontWeightVal').textContent = locDigits(activeWeight());
  $('letterSpacingVal').textContent = locDigits(activeLetterSpacing());
  const align = activeAlign();
  for (const btn of document.querySelectorAll('#alignSeg button')) {
    const on = btn.dataset.align === align;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-checked', String(on));
  }
  updateRoving($('alignSeg'), 'button');
  const width = String(activeWidth());
  for (const btn of document.querySelectorAll('#widthSeg button')) {
    const on = btn.dataset.width === width;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-checked', String(on));
  }
  updateRoving($('widthSeg'), 'button');
  $('readControls').hidden = !settings.readabilityEnabled;
}

function renderPreview() {
  const p = $('previewText');
  if (!p) return;
  p.style.fontFamily = settings.fontEnabled ? familyForPreview(activeFont()) : '';
  p.style.fontSize = settings.readabilityEnabled ? activeSize() + 'px' : '';
  p.style.lineHeight = settings.readabilityEnabled ? String(activeLineHeight()) : '';
  p.style.fontWeight = settings.readabilityEnabled ? String(activeWeight()) : '';
  p.style.letterSpacing = settings.readabilityEnabled ? activeLetterSpacing() + 'px' : '';
  p.style.textAlign = settings.readabilityEnabled && activeAlign() === 'justify' ? 'justify' : '';
  p.style.maxWidth = settings.readabilityEnabled && activeWidth() > 0 ? activeWidth() + 'ch' : '';
}


/* ---------- Keyboard Shortcut Recorder ---------- */
let isRecordingShortcut = false;

function formatShortcutEvent(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');

  let key = e.key;
  if (!key || ['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null;

  if (key === ' ') key = 'Space';
  else if (HamsooUtil.ARROW_KEY_MAP[key]) key = HamsooUtil.ARROW_KEY_MAP[key];
  else if (key.length === 1) key = key.toUpperCase();
  else if (/^f\d+$/i.test(key)) key = key.toUpperCase();
  else key = key.charAt(0).toUpperCase() + key.slice(1);

  if (parts.length === 0 && !/^F\d+$/.test(key)) {
    parts.push('Alt');
  }

  parts.push(key);
  return parts.join('+');
}

function startRecordingShortcut() {
  isRecordingShortcut = true;
  const display = $('shortcutDisplay');
  const btn = $('changeShortcutBtn');
  const hint = $('shortcutHint');
  if (display) {
    display.classList.add('recording');
    display.textContent = t('shortcutRecording') || 'کلیدها را فشار دهید...';
    display.focus();
  }
  if (btn) btn.textContent = t('cancel') || 'انصراف';
  if (hint) hint.textContent = t('recordingHint') || 'کلید ترکیبی موردنظر (مانند Ctrl+Shift+H) را روی کیبورد فشار دهید.';
}

function stopRecordingShortcut() {
  isRecordingShortcut = false;
  const display = $('shortcutDisplay');
  const btn = $('changeShortcutBtn');
  const hint = $('shortcutHint');
  if (display) display.classList.remove('recording');
  if (btn) btn.textContent = t('changeShortcut') || 'تغییر میان‌بر';
  if (hint) hint.textContent = t('shortcutHint') || 'برای تغییر، روی دکمه کلیک کنید و کلید ترکیبی جدید را روی کیبورد فشار دهید.';
  renderShortcut();
}

function renderShortcut() {
  const display = $('shortcutDisplay');
  if (display && !isRecordingShortcut) {
    display.textContent = settings.shortcut || 'Alt+Shift+R';
  }
  // Issue 17: disclose when the recorded combo is not the actual global
  // browser command -- on Chromium that's every non-default combo; on
  // Firefox it's any combo commands.update() rejected.
  const globalWarning = $('shortcutGlobalWarning');
  if (globalWarning) {
    globalWarning.hidden = settings.shortcutIsGlobal !== false;
    // Two different situations, and one sentence was covering both. When the
    // browser has NO shortcut registered for Hamsoo -- which is what Chromium
    // shows as "Not set" -- telling the user the previous browser-wide shortcut
    // is still active is simply false. Swap the key, not just the text, so a
    // later language change re-renders the right sentence.
    const warnKey = browserCommandShortcut === '' ? 'shortcutNoGlobal' : 'shortcutGlobalWarning';
    globalWarning.setAttribute('data-i18n', warnKey);
    globalWarning.textContent = t(warnKey);
  }
  // The badge must not imply the browser agrees when the browser has nothing
  // registered at all: mark it so it reads as site-only rather than global.
  if (display && !isRecordingShortcut) {
    display.classList.toggle('site-only', browserCommandShortcut === '');
  }
  // Issue 19: warn (never block) when the combo matches a common host-page
  // shortcut that Hamsoo's capture-phase listener would swallow.
  const conflictWarning = $('shortcutConflictWarning');
  if (conflictWarning) conflictWarning.hidden = !HamsooUtil.isLikelyHostConflict(settings.shortcut);
  // The escape hatch into browser settings only earns its place where the popup
  // cannot reach the real command. On Firefox commands.update() has already
  // rebound it, and about:addons has no shortcut row to send anyone to, so the
  // button there is either redundant or a dead end. Offer it only when stuck.
  const browserLink = $('openBrowserShortcutsBtn');
  if (browserLink) {
    browserLink.hidden = canRebindBrowserCommand();
    if (browserLink.hidden) {
      const manual = $('shortcutManualHint');
      if (manual) manual.hidden = true;
    }
  }
}

// Chromium has no API to rebind a manifest command; Firefox's commands.update()
// does. Every decision about the browser-settings escape hatch keys off this one
// capability check, so the button can never contradict what the recorder did.
function canRebindBrowserCommand() {
  return !!(api && api.commands && typeof api.commands.update === 'function');
}

// What the BROWSER actually has registered for the toggle command, as opposed
// to the combo we recorded. On Chromium the two can disagree permanently:
// commands.update() does not exist there, and the manifest's suggested_key is
// applied by the browser at install time only -- if that combo was already
// taken, Chrome leaves the command unset and nothing tells the user. The popup
// was printing "Alt+Shift+R" while chrome://extensions/shortcuts said "Not
// set", which is the one place a shortcut has to be believable.
//
// Read once per popup open, and only ever used for disclosure: settings.shortcut
// is never overwritten from it, because the recorded combo does still work on
// Hamsoo-enabled pages and silently dropping it would lose a working shortcut.
let browserCommandShortcut = null;
let browserCommandChecked = false;

function commandsGetAll() {
  return new Promise(resolve => {
    if (!(api && api.commands && typeof api.commands.getAll === 'function')) {
      resolve(null);
      return;
    }
    try {
      // Chromium takes a callback, Firefox returns a promise; accept both
      // rather than assuming, the way the shortcuts button once assumed.
      const maybe = api.commands.getAll(list => resolve(list || []));
      if (maybe && typeof maybe.then === 'function') {
        maybe.then(list => resolve(list || []), () => resolve(null));
      }
    } catch (_) {
      resolve(null);
    }
  });
}

async function syncBrowserCommandState() {
  if (browserCommandChecked) return;
  browserCommandChecked = true;
  const list = await commandsGetAll();
  if (!list) return;
  const cmd = Array.prototype.find.call(list, c => c && c.name === 'toggle-hamsoo');
  browserCommandShortcut = cmd && cmd.shortcut ? cmd.shortcut : '';
  const recorded = HamsooUtil.toBrowserCommandString(
    settings.shortcut || HamsooUtil.MANIFEST_DEFAULT_SHORTCUT
  );
  if (browserCommandShortcut !== recorded) settings.shortcutIsGlobal = false;
  renderShortcut();
}

async function updateBrowserCommandShortcut(newShortcut) {
  // The manifest's own suggested_key already matches; nothing to change,
  // and nothing to ask the API to do.
  if (newShortcut === HamsooUtil.MANIFEST_DEFAULT_SHORTCUT) return { applied: true, isGlobal: true };

  if (!canRebindBrowserCommand()) {
    // Chromium cannot rebind the manifest command from the extension at all.
    // Whatever was last actually registered stays live globally; only the
    // content-script keydown listener enforces this new combo, and only on
    // Hamsoo-enabled sites. Callers must surface that gap (Issue 17) instead
    // of presenting the change as fully applied.
    return { applied: false, isGlobal: false, reason: 'unsupported' };
  }

  if (!HamsooUtil.isValidCommandShortcut(newShortcut)) {
    // commands.update() would throw on this anyway (Shift-only combos,
    // disallowed keys, wrong modifier token, ...). Don't even attempt it, so
    // a real rejection can no longer hide behind an empty catch (Issue 18).
    return { applied: false, isGlobal: false, reason: 'invalid' };
  }

  try {
    await api.commands.update({
      name: 'toggle-hamsoo',
      shortcut: HamsooUtil.toBrowserCommandString(newShortcut)
    });
    return { applied: true, isGlobal: true };
  } catch (_) {
    return { applied: false, isGlobal: false, reason: 'error' };
  }
}

function renderCurrentSite() {
  const card = $('currentSiteCard');
  if (!card) return;
  if (!currentTab) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  card.classList.remove('suggest');
  $('currentSiteHost').textContent = currentTab.host;
  const dot = $('currentSiteDot');
  const state = $('currentSiteState');
  const action = $('currentSiteAction');
  action.className = 'btn';

  if (currentTab.siteKey) {
    const on = settings.enabled && settings.sites[currentTab.siteKey];
    dot.classList.toggle('off', !on);
    state.textContent = on ? t('activeHere') : t('inactiveHere');
    action.textContent = on ? t('disable') : t('enable');
    action.onclick = () => {
      settings.sites[currentTab.siteKey] = !settings.sites[currentTab.siteKey];
      renderSites();
      renderCurrentSite();
      save();
    };
  } else if (currentTab.isCustom) {
    dot.classList.remove('off');
    state.textContent = t('customActive');
    action.textContent = t('removeSite');
    action.onclick = () => { void removeCustomSite(currentTab.pattern); };
  } else {
    const suggest = Boolean(currentTab.suggested);
    if (suggest) card.classList.add('suggest');
    dot.classList.toggle('off', !suggest);
    state.textContent = suggest ? t('suggestAdd') : t('notListed');
    action.textContent = t('addSite');
    action.classList.add('primary');
    action.onclick = async () => {
      if (!hasAPI || !api.permissions) return;
      let granted = false;
      try {
        granted = await api.permissions.request({ origins: [currentTab.pattern] });
      } catch (_) { granted = false; }
      if (!granted) {
        setStatus(t('permissionDenied'));
        return;
      }
      if (!settings.customSites.includes(currentTab.pattern)) {
        settings.customSites.push(currentTab.pattern);
      }
      save();
      const pushed = await pushCustomSites();
      currentTab.isCustom = true;
      renderCustomSites();
      renderCurrentSite();
      // Be explicit when the granted scope is wider than the page the user is
      // looking at: a host match pattern cannot carry a port, so this covers
      // every port on the host, not just the current one.
      if (pushed) setStatus(currentTab.hasPort ? t('addedAllPorts', currentTab.host) : t('addedReload'));
    };
  }
}

function renderScope() {
  const card = $('siteScopeCard');
  if (!card) return;
  const key = overrideKey();
  if (!key) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const on = overrideOn();
  $('scopeToggle').checked = on;
  $('scopeHint').textContent = on
    ? t('scopeOn', currentTab.host)
    : t('scopeOff');
}

/* ---------- support / feedback ask ---------- */

// Which step of the card is on screen. Held in memory only: the fork is a UI
// state, not a preference, so reopening the popup starts the ask cleanly.
let supportStep = 'ask';

function supportTarget() {
  try {
    if (hasAPI && api.runtime && typeof api.runtime.getManifest === 'function') {
      return HamsooUtil.supportTargetFromManifest(api.runtime.getManifest());
    }
  } catch (_) { /* fall through to the safe default */ }
  return 'chromium';
}

function openExternal(url) {
  try {
    if (hasAPI && api.tabs && typeof api.tabs.create === 'function') {
      void api.tabs.create({ url });
      return;
    }
  } catch (_) { /* fall back to a plain window open */ }
  try { window.open(url, '_blank', 'noopener'); } catch (_) { /* nothing else to try */ }
}

function renderSupportCard() {
  const card = $('supportCard');
  if (!card) return;
  const eligible = HamsooUtil.shouldAskForSupport(settings, Date.now());
  card.hidden = !eligible;
  if (!eligible) {
    supportStep = 'ask';
    return;
  }
  const steps = { ask: $('supportStepAsk'), yes: $('supportStepYes'), no: $('supportStepNo') };
  for (const name of Object.keys(steps)) {
    if (steps[name]) steps[name].hidden = name !== supportStep;
  }
  // The destination differs per browser, so the label has to follow it. Setting
  // data-i18n rather than just textContent keeps the runtime language switch
  // working on this button like every other string.
  // One constant, two places in the markup: keep the visible address in step
  // with the one the mailto actually targets.
  for (const el of document.querySelectorAll('.support-email-addr')) {
    el.textContent = HamsooUtil.SUPPORT_EMAIL;
  }
  const action = $('supportActionBtn');
  if (action) {
    const key = supportTarget() === 'firefox' ? 'supportRate' : 'supportStar';
    action.dataset.i18n = key;
    action.textContent = t(key);
  }
}

// Builds the prefilled email. The address is also rendered as selectable text in
// the card, because a mailto: with no registered handler does nothing at all and
// the user would otherwise think the button is broken.
function feedbackMailto(kind) {
  const isPraise = kind === 'praise';
  let version = '';
  try {
    if (hasAPI && api.runtime && typeof api.runtime.getManifest === 'function') {
      version = api.runtime.getManifest().version || '';
    }
  } catch (_) { /* version is optional context, not worth failing over */ }
  const details = { version: version, browser: supportTarget(), language: LANG };
  // The site host and the toggle digest go only into a problem report, where
  // they are the two fields that make it reproducible. Praise has no reason to
  // carry where the user was browsing.
  if (!isPraise) {
    if (currentTab && currentTab.host) details.site = currentTab.host;
    details.settings = HamsooUtil.settingsDigest(settings);
  }
  return HamsooUtil.buildFeedbackMailto({
    email: HamsooUtil.SUPPORT_EMAIL,
    subject: t(isPraise ? 'supportEmailSubjectPraise' : 'supportEmailSubjectProblem'),
    intro: t(isPraise ? 'supportEmailIntroPraise' : 'supportEmailIntroProblem'),
    details: details
  });
}

// Every resolution writes through the normal save path so a Later / Never
// choice survives the next popup open.
function resolveSupport(mutate) {
  settings.support = mutate(settings.support, Date.now());
  supportStep = 'ask';
  renderSupportCard();
  save(true);
}

function renderAll() {
  const setChecked = (id, value) => { const el = $(id); if (el) el.checked = value; };
  setChecked('enableToggle', settings.enabled);
  document.body.classList.toggle('disabled-global', !settings.enabled);
  setChecked('fontToggle', settings.fontEnabled);
  setChecked('readToggle', settings.readabilityEnabled);
  setChecked('digitsToggle', settings.digitsEnabled);
  setChecked('punctToggle', settings.punctuationFixEnabled);
  applyTheme();
  renderLang();
  renderDigitsScript();
  renderSites();
  renderCustomSites();
  renderScope();
  renderFonts();
  renderRead();
  renderPreview();
  renderShortcut();
  renderCurrentSite();
  renderSupportCard();
  syncBrowserCommandState();
}

/* ---------- events ---------- */

$('enableToggle')?.addEventListener('change', e => {
  settings.enabled = e.target.checked;
  renderAll();
  save(true);
});
$('fontToggle')?.addEventListener('change', e => {
  settings.fontEnabled = e.target.checked;
  renderFonts();
  renderRead();
  renderPreview();
  save(true);
});
$('readToggle')?.addEventListener('change', e => {
  settings.readabilityEnabled = e.target.checked;
  renderRead();
  renderPreview();
  save(true);
});
$('fontSize')?.addEventListener('input', e => {
  setActiveSize(Number(e.target.value));
  $('fontSizeVal').textContent = locDigits(Number(e.target.value));
  renderPreview();
  save();
});
$('lineHeight')?.addEventListener('input', e => {
  setActiveLineHeight(Number(e.target.value));
  $('lineHeightVal').textContent = locDigits(Number(e.target.value));
  renderPreview();
  save();
});
$('fontWeight')?.addEventListener('input', e => {
  setActiveWeight(Number(e.target.value));
  $('fontWeightVal').textContent = locDigits(Number(e.target.value));
  renderPreview();
  save();
});
$('letterSpacing')?.addEventListener('input', e => {
  setActiveLetterSpacing(Number(e.target.value));
  $('letterSpacingVal').textContent = locDigits(Number(e.target.value));
  renderPreview();
  save();
});
// Double-click a readability slider to reset it to its default value.
function bindSliderReset(id, outId, apply) {
  const slider = $(id);
  if (!slider) return;
  slider.addEventListener('dblclick', () => {
    const def = DEFAULTS[id];
    if (typeof def !== 'number') return;
    $(id).value = String(def);
    apply(def);
    $(outId).textContent = locDigits(def);
    renderPreview();
    save();
  });
}
bindSliderReset('fontSize', 'fontSizeVal', setActiveSize);
bindSliderReset('lineHeight', 'lineHeightVal', setActiveLineHeight);
bindSliderReset('fontWeight', 'fontWeightVal', setActiveWeight);
bindSliderReset('letterSpacing', 'letterSpacingVal', setActiveLetterSpacing);
$('modeSeg')?.addEventListener('click', e => {
  const btn = e.target.closest('button[data-mode]');
  if (!btn) return;
  settings.mode = btn.dataset.mode;
  applyTheme();
  save(true);
});
$('accentRow')?.addEventListener('click', e => {
  const btn = e.target.closest('button[data-accent]');
  if (!btn) return;
  settings.accent = btn.dataset.accent;
  applyTheme();
  save(true);
});
// The dedicated settings page is now the extension's options_ui, so the font
// manager is opened directly by URL from both the popup and that page.
$('manageFonts')?.addEventListener('click', () => {
  const url = hasAPI && api.runtime && api.runtime.getURL ? api.runtime.getURL('fonts.html') : 'fonts.html';
  if (hasAPI && api.tabs && api.tabs.create) {
    api.tabs.create({ url });
  } else {
    location.href = url;
  }
});
$('scopeToggle')?.addEventListener('change', e => {
  setOverrideEnabled(e.target.checked);
  renderScope();
  renderFonts();
  renderRead();
  renderPreview();
  save(true);
});
$('digitsToggle')?.addEventListener('change', e => {
  settings.digitsEnabled = e.target.checked;
  renderDigitsScript();
  save(true);
});
$('digitsScriptSeg')?.addEventListener('click', e => {
  const btn = e.target.closest('button[data-script]');
  if (!btn) return;
  settings.digitsScript = btn.dataset.script;
  renderDigitsScript();
  save(true);
});
$('punctToggle')?.addEventListener('change', e => {
  settings.punctuationFixEnabled = e.target.checked;
  save(true);
});
$('langSeg')?.addEventListener('click', e => {
  const btn = e.target.closest('button[data-lang]');
  if (!btn) return;
  settings.lang = btn.dataset.lang;
  applyI18n();
  renderAll();
  save(true);
});

setupGroup($('modeSeg'), 'button[data-mode]', true);
setupGroup($('langSeg'), 'button[data-lang]', true);
setupGroup($('accentRow'), 'button[data-accent]', true);
setupGroup($('fontGrid'), 'button', true);
setupGroup($('siteGrid'), 'button', false);
$('alignSeg')?.addEventListener('click', e => {
  const btn = e.target.closest('button[data-align]');
  if (!btn) return;
  setActiveAlign(btn.dataset.align);
  renderRead();
  renderPreview();
  save(true);
});
$('widthSeg')?.addEventListener('click', e => {
  const btn = e.target.closest('button[data-width]');
  if (!btn) return;
  setActiveWidth(Number(btn.dataset.width));
  renderRead();
  renderPreview();
  save(true);
});
setupGroup($('alignSeg'), 'button[data-align]', true);
setupGroup($('widthSeg'), 'button[data-width]', true);
$('exportBtn')?.addEventListener('click', () => { void exportSettings(); });
$('importBtn')?.addEventListener('click', () => { $('importFile').click(); });
$('importFile')?.addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  if (file) void importSettings(file);
  e.target.value = '';
});


$('changeShortcutBtn')?.addEventListener('click', () => {
  if (isRecordingShortcut) stopRecordingShortcut();
  else startRecordingShortcut();
});
$('shortcutDisplay')?.addEventListener('click', () => {
  if (isRecordingShortcut) stopRecordingShortcut();
  else startRecordingShortcut();
});
$('resetShortcutBtn')?.addEventListener('click', async () => {
  settings.shortcut = 'Alt+Shift+R';
  const result = await updateBrowserCommandShortcut('Alt+Shift+R');
  settings.shortcutIsGlobal = result.isGlobal;
  save();
  renderShortcut();
  setStatus(t('saved'));
});
// Neither browser lets an extension navigate to its own settings surface:
// Chrome refuses tabs.create on a chrome:// URL and Firefox refuses
// about:addons. The previous version called tabs.create and ignored the
// outcome, so this button did nothing whatsoever -- no tab, no error, no
// feedback. Chrome throws synchronously and Firefox rejects a promise, so both
// paths are handled, and on failure the address is revealed as selectable text
// (the same pattern as the support email: the browser will not do it for you,
// so let the user do it).
// Do NOT decide this by asking whether globalThis.browser exists. Recent
// Chromium builds define that global too, so the old test answered "Firefox" on
// Chrome: the card handed a Chrome user the address about:addons -- which is not
// even a page that exists there -- and skipped trying to open Chrome's own
// shortcuts page at all. The capability is the question here, as everywhere else
// on this card: a runtime that cannot rebind the command is the only runtime
// shown this button, and that runtime is Chromium, whose shortcuts page is the
// only place the real global command can change.
function shortcutsPageUrl() {
  return 'chrome://extensions/shortcuts';
}

function revealShortcutsFallback(url) {
  const target = $('shortcutManualUrl');
  const hint = $('shortcutManualHint');
  if (target) target.textContent = url;
  if (hint) hint.hidden = false;
}

$('openBrowserShortcutsBtn')?.addEventListener('click', () => {
  const url = shortcutsPageUrl();
  // A runtime that can rebind the command has no use for this page, and the
  // button is hidden there anyway. Anything without tabs.create gets the address
  // as selectable text rather than a click that does nothing.
  if (canRebindBrowserCommand() || !hasAPI || !api.tabs || typeof api.tabs.create !== 'function') {
    revealShortcutsFallback(url);
    return;
  }
  // Chromium: chrome://extensions/shortcuts is a real per-extension shortcut
  // list, so opening it is worth trying. It throws synchronously when refused.
  try {
    const opening = api.tabs.create({ url });
    if (opening && typeof opening.catch === 'function') {
      opening.catch(() => revealShortcutsFallback(url));
    }
  } catch (e) {
    revealShortcutsFallback(url);
  }
});
window.addEventListener('keydown', (e) => {
  if (!isRecordingShortcut) return;
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    stopRecordingShortcut();
    return;
  }

  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Meta');
    const display = $('shortcutDisplay');
    if (display && parts.length > 0) {
      display.textContent = parts.join('+') + '+...';
    }
    return;
  }

  const newShortcut = formatShortcutEvent(e);
  if (newShortcut) {
    settings.shortcut = newShortcut;
    stopRecordingShortcut();
    updateBrowserCommandShortcut(newShortcut).then(result => {
      settings.shortcutIsGlobal = result.isGlobal;
      save();
      renderShortcut();
      if (result.isGlobal) {
        setStatus(t('saved'));
        return;
      }
      // Explain *why* it degraded to site-only when the reason is actionable.
      // A Meta/Win combo can never register as a browser command off macOS, so
      // say that outright rather than leaving the user to guess.
      const limitation = HamsooUtil.describeShortcutLimitation(newShortcut);
      if (limitation === 'metaNotSupported') {
        setStatus(t('shortcutMetaUnsupported') || t('shortcutSiteOnly') || t('saved'));
      } else {
        setStatus(t('shortcutSiteOnly') || t('saved'));
      }
    });
  }
}, true);

/* ---------- init ---------- */

async function detectCurrentTab() {
  // The options page has no current-site card, so tab probing is popup-only.
  if (!$('currentSiteCard')) return;
  if (!hasAPI || !api.tabs) return;
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    let targetUrl = tab.url || tab.pendingUrl;
    if (!targetUrl && api.tabs.get) {
      try {
        const fullTab = await api.tabs.get(tab.id);
        targetUrl = fullTab && (fullTab.url || fullTab.pendingUrl);
      } catch (_) {}
    }
    if (!targetUrl || !/^https?:\/\//.test(targetUrl)) return;
    const url = new URL(targetUrl);
    const host = url.hostname;
    let siteKey = SITE_HOSTS[host] || null;
    if (!siteKey) {
      for (const h of Object.keys(SITE_HOSTS)) {
        if (host.endsWith('.' + h)) { siteKey = SITE_HOSTS[h]; break; }
      }
    }
    // Match patterns must not contain a port, but url.origin does. Building
    // from the hostname makes ported origins (localhost:3000, host:8443)
    // produce a pattern the browser will actually accept.
    const pattern = HamsooUtil.patternFromUrl(targetUrl);
    if (!pattern) return;
    currentTab = {
      host,
      origin: url.origin,
      pattern,
      siteKey,
      // The pattern drops the port, so adding "localhost:3000" really grants
      // every port on that host. Remember this so the add action can say so.
      hasPort: Boolean(url.port),
      isCustom: !siteKey && settings.customSites.includes(pattern),
      suggested: false
    };
    if (!siteKey && !currentTab.isCustom) {
      currentTab.suggested = await probePersianDensity(tab.id);
    }
  } catch (_) {
    currentTab = null;
  }
}

// Uses activeTab to sample the current page's visible text once (no persistent
// host permission needed). Returns true when Persian clearly dominates, so the
// popup can gently suggest adding an unlisted site.
async function probePersianDensity(tabId) {
  if (!hasAPI || !api.scripting || typeof tabId !== 'number') return false;
  try {
    const results = await api.scripting.executeScript({
      target: { tabId },
      func: () => {
        const text = ((document.body && document.body.innerText) || '').slice(0, 8000);
        const fa = (text.match(/[\u0600-\u06FF]/g) || []).length;
        const letters = (text.match(/[A-Za-z\u0600-\u06FF]/g) || []).length;
        return { ratio: letters ? fa / letters : 0, letters };
      }
    });
    const out = results && results[0] && results[0].result;
    return Boolean(out && out.letters >= 80 && out.ratio >= 0.35);
  } catch (_) {
    return false;
  }
}

// Three views now, so the router pairs each view with its header rather than
// flipping a single boolean. Adding a fourth means adding one line.
const VIEWS = ['main', 'settings', 'help'];
const VIEW_NODES = {
  main: { view: 'viewMain', header: 'headerMain' },
  settings: { view: 'viewSettings', header: 'headerSettings' },
  help: { view: 'viewHelp', header: 'headerHelp' }
};

function switchView(view) {
  const active = VIEWS.includes(view) ? view : 'main';
  const isSettings = active === 'settings';
  for (const name of VIEWS) {
    const v = $(VIEW_NODES[name].view);
    const h = $(VIEW_NODES[name].header);
    if (v) v.hidden = name !== active;
    if (h) h.hidden = name !== active;
  }
  const pMain = $('previewMain');

  // The live preview belongs to the main view only.
  if (pMain) pMain.hidden = active !== 'main';

  if (active === 'help') renderHelp();

  if (isSettings) {
    applyTheme();
    renderLang();
    renderShortcut();
    renderCustomSites();
    renderPickedElements();
  }
}

// Step 1 is a neutral question: both answers are cheap and neither writes to
// storage, so nobody is punished for answering honestly.
$('supportYesBtn')?.addEventListener('click', () => {
  supportStep = 'yes';
  renderSupportCard();
});
$('supportNoBtn')?.addEventListener('click', () => {
  supportStep = 'no';
  renderSupportCard();
});
$('supportActionBtn')?.addEventListener('click', () => {
  openExternal(HamsooUtil.supportActionUrl(supportTarget()));
  resolveSupport(HamsooUtil.markSupportActed);
});
// Filing a report counts as acting: they did us a favour, so never ask again.
// "Not really" now lands in the help view, which offers the three self-serve
// fixes before the tracker. Dropping an unhappy user straight into a bug form is
// how you collect reports that a per-site toggle would have solved.
$('supportReportBtn')?.addEventListener('click', () => {
  resolveSupport(HamsooUtil.markSupportActed);
  switchView('help');
});
$('supportEmailBtn')?.addEventListener('click', () => {
  openExternal(feedbackMailto('praise'));
  resolveSupport(HamsooUtil.markSupportActed);
});
$('supportSorryEmailBtn')?.addEventListener('click', () => {
  openExternal(feedbackMailto('problem'));
  resolveSupport(HamsooUtil.markSupportActed);
});
for (const id of ['supportLaterBtn', 'supportSorryLaterBtn']) {
  $(id)?.addEventListener('click', () => { resolveSupport(HamsooUtil.snoozeSupport); });
}
for (const id of ['supportNeverBtn', 'supportSorryNeverBtn']) {
  $(id)?.addEventListener('click', () => { resolveSupport(HamsooUtil.dismissSupportForever); });
}

// The help view is the escalation target for the feedback card's "Not really"
// branch as well as a standalone entry point from the header.
function renderHelp() {
  for (const el of document.querySelectorAll('.support-email-addr')) {
    el.textContent = HamsooUtil.SUPPORT_EMAIL;
  }
  const digest = $('helpDigest');
  if (digest) digest.textContent = HamsooUtil.settingsDigest(settings);
}

$('openHelpBtn')?.addEventListener('click', () => switchView('help'));
$('backFromHelpBtn')?.addEventListener('click', () => switchView('main'));

$('helpReportBtn')?.addEventListener('click', () => {
  let version = '';
  try {
    if (hasAPI && api.runtime && typeof api.runtime.getManifest === 'function') {
      version = api.runtime.getManifest().version || '';
    }
  } catch (_) { /* optional context */ }
  openExternal(HamsooUtil.buildIssueUrl({
    template: HamsooUtil.SUPPORT_ISSUE_TEMPLATE,
    labels: 'bug',
    title: t('helpIssueTitle'),
    body: HamsooUtil.buildIssueBody({
      intro: t('helpIssueIntro'),
      steps: [t('helpIssueSteps'), t('helpIssueExpected'), t('helpIssueSite')],
      details: {
        version: version,
        browser: supportTarget(),
        language: LANG,
        site: currentTab && currentTab.host ? currentTab.host : '',
        settings: HamsooUtil.settingsDigest(settings)
      }
    })
  }));
});

$('helpEmailBtn')?.addEventListener('click', () => openExternal(feedbackMailto('problem')));

$('openSettingsBtn')?.addEventListener('click', () => switchView('settings'));
$('backToMainBtn')?.addEventListener('click', () => switchView('main'));

// Keeps the first-run tour permanently discoverable. Without this the only way
// back to it is a reinstall, and support replies have nothing to point at.
$('replayWelcomeBtn')?.addEventListener('click', () => {
  const url = hasAPI && api.runtime && typeof api.runtime.getURL === 'function'
    ? api.runtime.getURL('welcome.html')
    : 'welcome.html';
  openExternal(url);
});

async function init() {
  // lastAcked is the last copy we believe is in storage, NOT the normalized UI
  // object. If we ack the cleaned in-memory shape, a later patch only sends the
  // field the user touched and leaves duplicate sites / empty overrides on disk.
  let rawStored = {};
  if (hasAPI) {
    try {
      const res = await api.storage.local.get('settings');
      rawStored = res && res.settings && typeof res.settings === 'object' ? res.settings : {};
      settings = normalize(rawStored);
    } catch (_) {
      rawStored = {};
      settings = normalize(null);
    }
  } else {
    // Standalone preview: allow ?mode=dark&accent=teal for design QA.
    settings = normalize(null);
  }
  lastAcked = cloneSettings(rawStored);
  if (params.get('uimode')) settings.mode = params.get('uimode');
  else if (params.get('mode')) settings.mode = params.get('mode');
  if (params.get('uiaccent')) settings.accent = params.get('uiaccent');
  else if (params.get('accent')) settings.accent = params.get('accent');
  if (params.get('uilang')) settings.lang = params.get('uilang');
  settings = normalize(settings);

  // popup.html also serves as the options page and as the welcome tour's
  // deep-link target, both of which open it in a full browser tab. ?ui=tab is
  // an explicit signal rather than a viewport-width guess.
  if (params.get('ui') === 'tab') document.body.classList.add('ui-tab');

  applyI18n();
  await detectCurrentTab();
  renderAll();
  if (VIEWS.includes(params.get('view'))) switchView(params.get('view'));
  void ensurePreviewFont(activeFont());

  if (params.get('scrollTop')) {
    const st = parseInt(params.get('scrollTop'), 10);
    const applyScroll = () => {
      const content = document.getElementById('content');
      if (content) {
        void content.offsetHeight;
        content.scrollTop = st;
      }
    };
    applyScroll();
    requestAnimationFrame(applyScroll);
    setTimeout(applyScroll, 50);
    setTimeout(applyScroll, 150);
    setTimeout(applyScroll, 300);
    setTimeout(applyScroll, 500);
  }

  if (hasAPI && api.storage && api.storage.onChanged) {
    api.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.settings && changes.settings.newValue) {
        const incomingRaw = changes.settings.newValue;
        const incoming = normalize(incomingRaw);
        const util = globalThis.HamsooUtil;
        if (util && typeof util.rebasePendingSettings === 'function') {
          settings = util.rebasePendingSettings(lastAcked, settings, incoming);
        } else {
          settings = incoming;
        }
        lastAcked = cloneSettings(incomingRaw && typeof incomingRaw === 'object' ? incomingRaw : incoming);
        renderAll();
      }
    });
  }
}

// Pre-paint: translate the UI synchronously from the localStorage language
// mirror so an English user never sees a frame of Persian before the async
// settings load resolves. init() reconciles with the stored setting afterward.
try {
  if (globalThis.HamsooI18n) {
    LANG = globalThis.HamsooI18n.applyDom(document, localStorage.getItem('hamsoo-lang') || 'auto');
  }
} catch (_) { /* fall back to init()'s async applyI18n */ }

void init();
