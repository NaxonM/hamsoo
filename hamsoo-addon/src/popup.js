'use strict';

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
  mode: 'system',
  accent: 'blue',
  lang: 'auto',
  punctuationFixEnabled: true,
  shortcut: 'Alt+Shift+R'
});

let settings = structuredClone(DEFAULTS);
let saveTimer = 0;
let statusTimer = 0;
let currentTab = null; // { host, origin, pattern, siteKey, isCustom }
const loadedPreviewFonts = new Set();

const $ = id => document.getElementById(id);

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
async function persistNow() {
  if (!hasAPI) return;
  try {
    await api.storage.local.set({ settings });
  } catch (_) {
    setStatus(t('saveError'));
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
async function importSettings(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (_) {
    setStatus(t('invalidFile'));
    return;
  }
  const incoming = data && typeof data === 'object' && data.settings && typeof data.settings === 'object'
    ? data.settings
    : data;
  if (!incoming || typeof incoming !== 'object') {
    setStatus(t('invalidFile'));
    return;
  }
  if (Array.isArray(data.fonts) && globalThis.HamsooFontDB) {
    for (const font of data.fonts) {
      if (!font || typeof font.id !== 'string' || typeof font.bytes !== 'string') continue;
      try {
        await globalThis.HamsooFontDB.put({
          id: font.id,
          name: typeof font.name === 'string' ? font.name : 'فونت شخصی',
          format: typeof font.format === 'string' ? font.format : 'woff2',
          bytes: base64ToBuffer(font.bytes),
          size: Number(font.size) || 0,
          added: Number(font.added) || Date.now()
        });
      } catch (_) { /* skip unreadable font */ }
    }
  }
  settings = normalize(incoming);
  await persistNow();
  applyI18n();
  await detectCurrentTab();
  renderAll();
  void ensurePreviewFont(activeFont());
  if (hasAPI && api.runtime) {
    try { await api.runtime.sendMessage({ type: 'HAMSOO_SYNC_SITES', customSites: settings.customSites }); } catch (_) { /* no-op */ }
  }
  setStatus(t('imported'));
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
    clean.enabled = ov.enabled !== false;
    if (Object.keys(clean).length) siteOverrides[okey] = clean;
  }
  return {
    enabled: raw.enabled !== false,
    fontEnabled: raw.fontEnabled !== false,
    readabilityEnabled: raw.readabilityEnabled !== false,
    digitsEnabled: raw.digitsEnabled === true,
    font,
    fontSize: HamsooUtil.clampSize(raw.fontSize),
    lineHeight: HamsooUtil.clampLineHeight(raw.lineHeight),
    fontWeight: HamsooUtil.clampWeight(raw.fontWeight),
    letterSpacing: HamsooUtil.clampLetterSpacing(raw.letterSpacing),
    textAlign: HamsooUtil.normalizeAlign(raw.textAlign),
    maxWidth: HamsooUtil.clampMeasure(raw.maxWidth),
    customFonts,
    sites,
    customSites: (Array.isArray(raw.customSites) ? raw.customSites : []).filter(p => typeof p === 'string'),
    siteOverrides,
    mode: ['system', 'light', 'dark'].includes(raw.mode) ? raw.mode : 'system',
    accent: ['blue', 'teal', 'violet', 'amber'].includes(raw.accent) ? raw.accent : 'blue',
    lang: ['auto', 'fa', 'en'].includes(raw.lang) ? raw.lang : 'auto',
    punctuationFixEnabled: raw.punctuationFixEnabled !== false,
    shortcut: typeof raw.shortcut === 'string' ? raw.shortcut : 'Alt+Shift+R'
  };
}

function save(immediate = false) {
  clearTimeout(saveTimer);
  const doSave = async () => {
    if (hasAPI) {
      try {
        await api.storage.local.set({ settings });
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
  for (const btn of seg.querySelectorAll('button')) {
    const on = btn.dataset.lang === settings.lang;
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
  grid.textContent = '';
  for (const site of SITES) {
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
  grid.textContent = '';
  const options = [
    ...BUILTIN_FONTS.map(f => ({ key: f.key, label: (LANG === 'en' && f.labelEn) ? f.labelEn : f.label })),
    ...settings.customFonts.map(f => ({ key: CUSTOM_PREFIX + f.id, label: f.name }))
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
}

async function updateBrowserCommandShortcut(newShortcut) {
  if (api && api.commands && typeof api.commands.update === 'function') {
    try {
      await api.commands.update({
        name: 'toggle-hamsoo',
        shortcut: newShortcut
      });
    } catch (_) {
      // On Chromium, commands.update is unavailable, so the content-script keydown listener enforces the custom shortcut instead.
    }
  }
}

function renderCurrentSite() {
  const card = $('currentSiteCard');
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
    action.onclick = async () => {
      settings.customSites = settings.customSites.filter(p => p !== currentTab.pattern);
      save();
      if (hasAPI && api.runtime) {
        try { await api.runtime.sendMessage({ type: 'HAMSOO_SYNC_SITES', customSites: settings.customSites }); } catch (_) { /* no-op */ }
      }
      currentTab.isCustom = false;
      renderCurrentSite();
    };
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
      try { await api.runtime.sendMessage({ type: 'HAMSOO_SYNC_SITES', customSites: settings.customSites }); } catch (_) { /* no-op */ }
      currentTab.isCustom = true;
      renderCurrentSite();
      setStatus(t('addedReload'));
    };
  }
}

function renderScope() {
  const card = $('siteScopeCard');
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

function renderAll() {
  $('enableToggle').checked = settings.enabled;
  document.body.classList.toggle('disabled-global', !settings.enabled);
  $('fontToggle').checked = settings.fontEnabled;
  $('readToggle').checked = settings.readabilityEnabled;
  $('digitsToggle').checked = settings.digitsEnabled;
  $('punctToggle').checked = settings.punctuationFixEnabled;
  applyTheme();
  renderLang();
  renderSites();
  renderScope();
  renderFonts();
  renderRead();
  renderPreview();
  renderCurrentSite();
}

/* ---------- events ---------- */

$('enableToggle').addEventListener('change', e => {
  settings.enabled = e.target.checked;
  renderAll();
  save(true);
});
$('fontToggle').addEventListener('change', e => {
  settings.fontEnabled = e.target.checked;
  renderFonts();
  renderRead();
  renderPreview();
  save(true);
});
$('readToggle').addEventListener('change', e => {
  settings.readabilityEnabled = e.target.checked;
  renderRead();
  renderPreview();
  save(true);
});
$('fontSize').addEventListener('input', e => {
  setActiveSize(Number(e.target.value));
  $('fontSizeVal').textContent = locDigits(Number(e.target.value));
  renderPreview();
  save();
});
$('lineHeight').addEventListener('input', e => {
  setActiveLineHeight(Number(e.target.value));
  $('lineHeightVal').textContent = locDigits(Number(e.target.value));
  renderPreview();
  save();
});
$('fontWeight').addEventListener('input', e => {
  setActiveWeight(Number(e.target.value));
  $('fontWeightVal').textContent = locDigits(Number(e.target.value));
  renderPreview();
  save();
});
$('letterSpacing').addEventListener('input', e => {
  setActiveLetterSpacing(Number(e.target.value));
  $('letterSpacingVal').textContent = locDigits(Number(e.target.value));
  renderPreview();
  save();
});
$('modeSeg').addEventListener('click', e => {
  const btn = e.target.closest('button[data-mode]');
  if (!btn) return;
  settings.mode = btn.dataset.mode;
  applyTheme();
  save(true);
});
$('accentRow').addEventListener('click', e => {
  const btn = e.target.closest('button[data-accent]');
  if (!btn) return;
  settings.accent = btn.dataset.accent;
  applyTheme();
  save(true);
});
$('manageFonts').addEventListener('click', () => {
  if (hasAPI && api.runtime && api.runtime.openOptionsPage) {
    api.runtime.openOptionsPage();
  } else {
    location.href = 'fonts.html';
  }
});
$('scopeToggle').addEventListener('change', e => {
  setOverrideEnabled(e.target.checked);
  renderScope();
  renderFonts();
  renderRead();
  renderPreview();
  save(true);
});
$('digitsToggle').addEventListener('change', e => {
  settings.digitsEnabled = e.target.checked;
  save(true);
});
$('punctToggle').addEventListener('change', e => {
  settings.punctuationFixEnabled = e.target.checked;
  save(true);
});
$('langSeg').addEventListener('click', e => {
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
$('alignSeg').addEventListener('click', e => {
  const btn = e.target.closest('button[data-align]');
  if (!btn) return;
  setActiveAlign(btn.dataset.align);
  renderRead();
  renderPreview();
  save(true);
});
$('widthSeg').addEventListener('click', e => {
  const btn = e.target.closest('button[data-width]');
  if (!btn) return;
  setActiveWidth(Number(btn.dataset.width));
  renderRead();
  renderPreview();
  save(true);
});
setupGroup($('alignSeg'), 'button[data-align]', true);
setupGroup($('widthSeg'), 'button[data-width]', true);
$('exportBtn').addEventListener('click', () => { void exportSettings(); });
$('importBtn').addEventListener('click', () => { $('importFile').click(); });
$('importFile').addEventListener('change', e => {
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
$('resetShortcutBtn')?.addEventListener('click', () => {
  settings.shortcut = 'Alt+Shift+R';
  save();
  renderShortcut();
  void updateBrowserCommandShortcut('Alt+Shift+R');
  setStatus(t('saved'));
});
$('openBrowserShortcutsBtn')?.addEventListener('click', () => {
  if (hasAPI && api.tabs) {
    const isFirefox = typeof globalThis.browser !== 'undefined';
    if (isFirefox) {
      // Firefox has no deep link to a single extension's shortcut row; open the
      // Add-ons Manager (Manage Extension Shortcuts lives under the gear menu).
      api.tabs.create({ url: 'about:addons' });
    } else {
      api.tabs.create({ url: 'chrome://extensions/shortcuts' });
    }
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
    save();
    stopRecordingShortcut();
    void updateBrowserCommandShortcut(newShortcut);
    setStatus(t('saved'));
  }
}, true);

/* ---------- init ---------- */

async function detectCurrentTab() {
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
    const pattern = url.origin + '/*';
    currentTab = {
      host,
      origin: url.origin,
      pattern,
      siteKey,
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

async function init() {
  if (hasAPI) {
    try {
      const res = await api.storage.local.get('settings');
      settings = normalize(res ? res.settings : null);
    } catch (_) {
      settings = normalize(null);
    }
  } else {
    // Standalone preview: allow ?mode=dark&accent=teal for design QA.
    settings = normalize(null);
    const params = new URLSearchParams(location.search);
    if (params.get('mode')) settings.mode = params.get('mode');
    if (params.get('accent')) settings.accent = params.get('accent');
    settings = normalize(settings);
  }
  applyI18n();
  await detectCurrentTab();
  renderAll();
  void ensurePreviewFont(activeFont());
}


  if (hasAPI && api.storage && api.storage.onChanged) {
    api.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.settings && changes.settings.newValue) {
        settings = normalize(changes.settings.newValue);
        renderAll();
      }
    });
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
