'use strict';
/**
 * Shared helpers for rendering the real extension UI in headless Chromium
 * outside the browser-extension context. Used by scripts/preview.js (visual
 * QA screenshots) and test/dom.test.js (behavioral DOM assertions).
 *
 * The trick: copy the built dist/hamsoo-chromium output, then inject a tiny
 * stub that emulates just enough of the extension API (chrome.storage,
 * chrome.runtime, ...) for popup.js / fonts.js to run their real init path
 * with hasAPI === true and a seeded settings object.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST_CHROMIUM = path.join(ROOT, 'dist', 'hamsoo-chromium');

function findChrome() {
  if (process.env.HAMSOO_CHROME) return process.env.HAMSOO_CHROME;
  const candidates = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'chromium']
    : ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'chrome'];
  for (const bin of candidates) {
    const res = spawnSync(bin, ['--version'], { stdio: 'ignore' });
    if (!res.error && res.status === 0) return bin;
  }
  return null;
}

function stubSource(seedSettings) {
  return [
    '// Auto-generated harness stub: minimal extension API emulation.',
    '(() => {',
    '  const settings = ' + JSON.stringify(seedSettings || {}) + ';',
    '  const params = new URLSearchParams(location.search);',
    "  if (params.get('uilang')) settings.lang = params.get('uilang');",
    "  if (params.get('uimode')) settings.mode = params.get('uimode');",
    '  try {',
    "    if (settings.lang) localStorage.setItem('hamsoo-lang', settings.lang);",
    "    if (settings.mode) localStorage.setItem('hamsoo-mode', settings.mode);",
    '  } catch (_) { /* storage may be unavailable on file:// */ }',
    '  globalThis.chrome = {',
    '    storage: {',
    '      local: {',
    '        get: async () => ({ settings }),',
    '        set: async (obj) => { globalThis.__HAMSOO_LAST_SET__ = obj; }',
    '      },',
    '      sync: {',
    '        get: async () => ({}),',
    '        set: async () => {}',
    '      },',
    '      onChanged: { addListener() {} }',
    '    },',
    '    runtime: {',
    "      getManifest: () => ({ version: '0.0.0-preview' }),",
    '      getURL: (p) => p,',
    '      sendMessage: async () => ({}),',
    '      openOptionsPage: () => {}',
    '    },',
    "    i18n: { getUILanguage: () => (settings.lang === 'fa' ? 'fa-IR' : 'en-US') },",
    '    permissions: { request: async () => true, remove: async () => true }',
    '  };',
    '})();',
    ''
  ].join('\n');
}

/**
 * Copies the built Chromium variant into a temp dir, injects the API stub
 * (and any extra scripts into popup.html), and returns the dir path.
 */
function createHarnessDir({ seedSettings, extraScriptFiles = [], unclampShell = true, checksPage = 'popup.html' } = {}) {
  if (!fs.existsSync(DIST_CHROMIUM)) {
    throw new Error('dist/hamsoo-chromium not found -- run `node build.js` first');
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hamsoo-ui-'));
  fs.cpSync(DIST_CHROMIUM, dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'stub.js'), stubSource(seedSettings));
  const extraTags = [];
  for (const file of extraScriptFiles) {
    const base = path.basename(file);
    fs.copyFileSync(file, path.join(dir, base));
    extraTags.push('<script src="' + base + '"></script>');
  }
  for (const page of ['popup.html', 'options.html', 'fonts.html']) {
    const p = path.join(dir, page);
    let html = fs.readFileSync(p, 'utf8');
    html = html.replace(
      '<script src="fontdb.js"></script>',
      '<script src="stub.js"></script>\n  <script src="fontdb.js"></script>'
    );
    if (page === 'popup.html' && unclampShell) {
      html = html.replace(
        '</head>',
        '<style>.shell{max-height:none !important;}.content{overflow-y:visible !important;}</style></head>'
      );
    }
    if (page === checksPage && extraTags.length) {
      html = html.replace('</body>', extraTags.join('\n') + '\n</body>');
    }
    fs.writeFileSync(p, html);
  }
  return dir;
}

module.exports = { findChrome, createHarnessDir, ROOT };
