'use strict';

const api = globalThis.browser ?? globalThis.chrome ?? null;
const hasAPI = Boolean(api && api.storage && api.storage.local);
const CUSTOM_PREFIX = 'custom:';
const MAX_FONTS = 12;
const MAX_SIZE = 4 * 1024 * 1024;
const FORMATS = ['ttf', 'otf', 'woff', 'woff2'];

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fontList = document.getElementById('fontList');
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

async function saveSettings() {
  if (!hasAPI) return;
  try {
    await api.storage.local.set({ settings });
  } catch (_) {
    setStatus(t('saveSettingsError'));
  }
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
  if (!fonts.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = t('emptyFonts');
    fontList.appendChild(empty);
    return;
  }
  for (const font of fonts) {
    const row = document.createElement('div');
    row.className = 'font-row';

    const meta = document.createElement('div');
    meta.className = 'font-meta';
    const name = document.createElement('strong');
    name.textContent = font.name;
    const info = document.createElement('span');
    info.textContent = font.format.toUpperCase() + (font.size ? ' · ' + formatSize(font.size) : '');
    meta.append(name, info);

    const sample = document.createElement('div');
    sample.className = 'font-sample';
    sample.textContent = t('sampleText');
    sample.style.fontFamily = '"' + familyFor(font.id) + '", "Vazirmatn", Tahoma, sans-serif';
    void ensurePreview(font.id);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-btn';
    remove.textContent = t('remove');
    remove.addEventListener('click', async () => {
      try {
        await globalThis.HamsooFontDB.remove(font.id);
      } catch (_) { /* metadata cleanup below still applies */ }
      settings.customFonts = settings.customFonts.filter(f => f.id !== font.id);
      if (settings.font === CUSTOM_PREFIX + font.id) settings.font = 'Vazirmatn';
      await saveSettings();
      await render();
      setStatus(t('removedFont', font.name));
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
      const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 120) || t('defaultFontName');
      await globalThis.HamsooFontDB.put({ id, name, format: ext, bytes, size: file.size, added: Date.now() });
      settings.customFonts.push({ id, name, format: ext, size: file.size });
      await saveSettings();
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

(async () => {
  // Apply the UI language synchronously from the localStorage mirror first so
  // the page doesn't start in Persian and visibly flip after storage loads.
  let mirrored = null;
  try { mirrored = localStorage.getItem('hamsoo-lang'); } catch (_) {}
  LANG = globalThis.HamsooI18n ? globalThis.HamsooI18n.resolveLang(mirrored || 'auto') : 'fa';
  if (globalThis.HamsooI18n) globalThis.HamsooI18n.applyDom(document, LANG);

  await loadSettings();
  const realLang = globalThis.HamsooI18n ? globalThis.HamsooI18n.resolveLang(settings.lang) : 'fa';
  if (realLang !== LANG) {
    LANG = realLang;
    if (globalThis.HamsooI18n) globalThis.HamsooI18n.applyDom(document, LANG);
  }
  try { localStorage.setItem('hamsoo-lang', settings.lang || 'auto'); } catch (_) {}
  await render();
})();
