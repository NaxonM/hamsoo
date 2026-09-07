'use strict';

const api = globalThis.browser ?? globalThis.chrome ?? null;
const hasAPI = Boolean(api && api.storage && api.storage.local);
const CUSTOM_PREFIX = 'custom:';
// Limits live in the shared module so the fonts UI and the settings import
// path can never enforce different caps.
const MAX_FONTS = (globalThis.HamsooUtil && globalThis.HamsooUtil.MAX_CUSTOM_FONTS) || 12;
const MAX_SIZE = (globalThis.HamsooUtil && globalThis.HamsooUtil.MAX_FONT_BYTES) || 4 * 1024 * 1024;
const FORMATS = ['ttf', 'otf', 'woff', 'woff2'];

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fontList = document.getElementById('fontList');
const sampleRow = document.getElementById('sampleRow');
const sampleInput = document.getElementById('sampleInput');
let customSampleText = '';
if (sampleInput) {
  sampleInput.addEventListener('input', () => {
    customSampleText = sampleInput.value.trim();
    const fallback = t('sampleText');
    for (const el of document.querySelectorAll('.font-sample')) {
      el.textContent = customSampleText || fallback;
    }
  });
}
const statusEl = document.getElementById('status');

let settings = null;
let statusTimer = 0;
const previewLoaded = new Set();

let LANG = 'fa';
function t(key, ...args) {
  const val = globalThis.HamsooI18n ? globalThis.HamsooI18n.t(key, LANG) : key;
  return typeof val === 'function' ? val(...args) : val;
}

function setStatus(text, sticky) {
  statusEl.textContent = text;
  clearTimeout(statusTimer);
  if (!sticky) statusTimer = setTimeout(() => { statusEl.textContent = ''; }, 3200);
}

async function loadSettings() {
  if (!hasAPI) { settings = { customFonts: [], font: 'Vazirmatn' }; return; }
  try {
    const res = await api.storage.local.get('settings');
    settings = res && res.settings && typeof res.settings === 'object' ? res.settings : {};
  } catch (_) {
    settings = {};
  }
  if (!Array.isArray(settings.customFonts)) settings.customFonts = [];
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

function applyRemoteSettings(next) {
  if (next && typeof next === 'object') settings = next;
  if (!settings || typeof settings !== 'object') settings = { customFonts: [], font: 'Vazirmatn' };
  if (!Array.isArray(settings.customFonts)) settings.customFonts = [];
}

function familyFor(id) {
  return 'HamsooOptions_' + id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function ensurePreview(id) {
  if (previewLoaded.has(id) || !globalThis.HamsooFontDB) return;
  try {
    const font = await globalThis.HamsooFontDB.get(id);
    if (!font || !font.bytes) return;
    const face = new FontFace(familyFor(id), font.bytes);
    await face.load();
    document.fonts.add(face);
    previewLoaded.add(id);
  } catch (_) { /* preview only */ }
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}

async function render() {
  fontList.textContent = '';
  const fonts = settings.customFonts;
  if (sampleRow) sampleRow.hidden = fonts.length === 0;
  if (!fonts.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = t('emptyFonts');
    fontList.appendChild(empty);
    return;
  }
  for (const font of fonts) {
    // Never let one bad entry blank the whole page.
    if (!font || typeof font.id !== 'string') continue;
    const row = document.createElement('div');
    row.className = 'font-row';

    const meta = document.createElement('div');
    meta.className = 'font-meta';
    const name = document.createElement('strong');
    name.textContent = typeof font.name === 'string' && font.name ? font.name : t('defaultFontName');
    const info = document.createElement('span');
    const fmt = typeof font.format === 'string' && font.format ? font.format.toUpperCase() : '—';
    info.textContent = fmt + (font.size ? ' · ' + formatSize(font.size) : '');
    meta.append(name, info);

    const sample = document.createElement('div');
    sample.className = 'font-sample';
    sample.textContent = customSampleText || t('sampleText');
    sample.style.fontFamily = '"' + familyFor(font.id) + '", "Vazirmatn", Tahoma, sans-serif';
    void ensurePreview(font.id);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-btn';
    remove.textContent = t('remove');
    remove.addEventListener('click', async () => {
      try {
        try {
          await globalThis.HamsooFontDB.remove(font.id);
        } catch (_) { /* metadata cleanup below still applies */ }
        const res = await sendSettingsPatch({ removeFont: font.id });
        if (!res || res.ok === false) throw new Error((res && res.error) || 'save failed');
        applyRemoteSettings(res.settings);
        await render();
        setStatus(t('removedFont', font.name));
      } catch (_) {
        setStatus(t('saveSettingsError'));
      }
    });

    row.append(meta, sample, remove);
    fontList.appendChild(row);
  }
}

async function addFiles(files) {
  for (const file of files) {
    if (settings.customFonts.length >= MAX_FONTS) {
      setStatus(t('maxFonts', MAX_FONTS));
      break;
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!FORMATS.includes(ext)) {
      setStatus(t('unsupported', file.name));
      continue;
    }
    if (file.size > MAX_SIZE) {
      setStatus(t('tooBig', file.name));
      continue;
    }
    try {
      const bytes = await file.arrayBuffer();
      const sniffed = globalThis.HamsooUtil && typeof globalThis.HamsooUtil.sniffFontFormat === 'function'
        ? globalThis.HamsooUtil.sniffFontFormat(bytes)
        : '';
      if (!sniffed) {
        setStatus(t('unsupported', file.name));
        continue;
      }
      try {
        const probe = new FontFace('HamsooProbe_' + Date.now().toString(36), bytes);
        await probe.load();
      } catch (_) {
        setStatus(t('unsupported', file.name));
        continue;
      }
      const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 120) || t('defaultFontName');
      await globalThis.HamsooFontDB.put({ id, name, format: sniffed, bytes, size: file.size, added: Date.now() });
      const res = await sendSettingsPatch({ addFont: { id, name, format: sniffed, size: file.size } });
      if (!res || res.ok === false) throw new Error((res && res.error) || 'save failed');
      applyRemoteSettings(res.settings);
      setStatus(t('addedFont', name));
    } catch (_) {
      setStatus(t('addFailed', file.name));
    }
  }
  await render();
}

fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files.length) void addFiles([...fileInput.files]);
  fileInput.value = '';
});

dropzone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

for (const eventName of ['dragenter', 'dragover']) {
  dropzone.addEventListener(eventName, e => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  dropzone.addEventListener(eventName, e => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
}
dropzone.addEventListener('drop', e => {
  if (e.dataTransfer && e.dataTransfer.files.length) void addFiles([...e.dataTransfer.files]);
});

// Mirrors popup.js applyTheme(): the fonts page previously relied purely on
// CSS prefers-color-scheme, ignoring explicit Light/Dark picks from settings.
const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

function applyTheme() {
  const mode = (settings && settings.mode) || 'system';
  const accent = (settings && settings.accent) || 'blue';
  const dark = mode === 'dark' || (mode === 'system' && Boolean(darkQuery && darkQuery.matches));
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.dataset.accent = accent;
}

(async () => {
  // Apply the UI language synchronously from the localStorage mirror first so
  // the page doesn't start in Persian and visibly flip after storage loads.
  let mirrored = null;
  try { mirrored = localStorage.getItem('hamsoo-lang'); } catch (_) {}
  LANG = globalThis.HamsooI18n ? globalThis.HamsooI18n.resolveLang(mirrored || 'auto') : 'fa';
  if (globalThis.HamsooI18n) globalThis.HamsooI18n.applyDom(document, LANG);

  await loadSettings();
  applyTheme();
  const realLang = globalThis.HamsooI18n ? globalThis.HamsooI18n.resolveLang(settings.lang) : 'fa';
  if (realLang !== LANG) {
    LANG = realLang;
    if (globalThis.HamsooI18n) globalThis.HamsooI18n.applyDom(document, LANG);
  }
  try { localStorage.setItem('hamsoo-lang', settings.lang || 'auto'); } catch (_) {}
  if (darkQuery && typeof darkQuery.addEventListener === 'function') {
    darkQuery.addEventListener('change', () => {
      if (!settings || settings.mode === 'system') applyTheme();
    });
  }
  if (hasAPI && api.storage && api.storage.onChanged) {
    api.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.settings && changes.settings.newValue) {
        applyRemoteSettings(changes.settings.newValue);
        applyTheme();
        void render();
      }
    });
  }
  await render();
})();
