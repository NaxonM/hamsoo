'use strict';
/**
 * Test & Preview Harness helper for headless Chromium execution.
 *
 * Creates a temporary directory containing the built extension with an API stub
 * injected into popup.html, options.html, and fonts.html, allowing the UI pages
 * to run standalone in a real browser tab without requiring Chrome extension APIs.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST_CHROMIUM = path.join(ROOT, 'dist', 'hamsoo-chromium');
// Read the real version instead of hardcoding one: the stub feeds
// runtime.getManifest(), which is what the popup renders in its version chip,
// and a hardcoded value silently drifts one release after every bump.
const PKG_VERSION = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
).version;

function findChrome() {
  if (process.env.HAMSOO_CHROME) return process.env.HAMSOO_CHROME;
  const candidates = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'chromium']
    : process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'chromium', 'chrome'
      ]
    : ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'chrome'];
  for (const bin of candidates) {
    if (!bin) continue;
    if (path.isAbsolute(bin) && fs.existsSync(bin)) return bin;
    const res = spawnSync(bin, ['--version'], { stdio: 'ignore' });
    if (!res.error && res.status === 0) return bin;
  }
  return null;
}

/**
 * Generates JS source that stubs chrome.storage, chrome.i18n, chrome.tabs, etc.
 */
function stubSource(seedSettings = null) {
  const json = seedSettings ? JSON.stringify(seedSettings) : 'null';
  return `(function() {
  let _s = ${json};
  globalThis.__HAMSOO_LAST_SET__ = null;
  globalThis.chrome = globalThis.browser = {
    runtime: {
      id: 'hamsoo-stub-id',
      getManifest: () => ({ version: '${PKG_VERSION}' }),
      getURL: (path) => path,
      sendMessage: (_msg, cb) => { if (cb) cb(); },
      onMessage: { addListener: () => {} },
      openOptionsPage: () => {}
    },
    storage: {
      local: {
        get: (_k, cb) => {
          const res = { settings: _s };
          if (cb) cb(res);
          return Promise.resolve(res);
        },
        set: (obj, cb) => {
          if (obj && obj.settings) {
            _s = JSON.parse(JSON.stringify(obj.settings));
            globalThis.__HAMSOO_LAST_SET__ = obj;
          }
          if (cb) cb();
          return Promise.resolve();
        }
      },
      sync: {
        get: (_k, cb) => { const res = {}; if (cb) cb(res); return Promise.resolve(res); },
        set: (_obj, cb) => { if (cb) cb(); return Promise.resolve(); }
      },
      onChanged: { addListener: () => {} }
    },
    tabs: {
      query: (_q, cb) => {
        const res = [{ id: 1, url: 'https://gemini.google.com/app', active: true }];
        if (cb) cb(res);
        return Promise.resolve(res);
      },
      get: (_id, cb) => {
        const res = { id: 1, url: 'https://gemini.google.com/app' };
        if (cb) cb(res);
        return Promise.resolve(res);
      },
      create: () => {}
    },
    scripting: {
      executeScript: (_opts, cb) => {
        const res = [{ result: { ratio: 0.8, letters: 200 } }];
        if (cb) cb(res);
        return Promise.resolve(res);
      }
    },
    commands: {
      getAll: (cb) => {
        const res = [{ name: 'toggle-hamsoo', shortcut: 'Alt+Shift+R' }];
        if (cb) cb(res);
        return Promise.resolve(res);
      },
      update: (_opts, cb) => { if (cb) cb(); return Promise.resolve(); }
    }
  };
})();`;
}

/**
 * Copies the built Chromium variant into a temp dir, injects the API stub
 * (and any extra scripts into popup.html), and returns the dir path.
 */
function createHarnessDir({ seedSettings, extraScriptFiles = [], unclampShell = false, checksPage = 'popup.html' } = {}) {
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
  for (const page of ['popup.html', 'options.html', 'fonts.html', 'welcome.html']) {
    const p = path.join(dir, page);
    let html = fs.readFileSync(p, 'utf8');
    html = html.replace(
      '<script src="lang-init.js"></script>',
      '<script src="stub.js"></script>\n  <script src="lang-init.js"></script>'
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

  // Create wrapper HTML for side-by-side visual previews (1280x780 presentation layout)
  const wrapperHtml = `<!doctype html>
<html id="h">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100vw;
      height: 100vh;
      background: #F4F5F7;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 28px;
      padding: 24px 32px;
      font-family: system-ui, -apple-system, sans-serif;
      overflow: hidden;
    }
    html.dark, body.dark {
      background: #141619 !important;
    }
    .card-frame {
      width: 372px;
      height: 600px;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.08);
      background: #FFFFFF;
      flex: 0 0 372px;
    }
    html.dark .card-frame, body.dark .card-frame {
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
      background: #191919;
    }
    iframe {
      width: 372px;
      height: 600px;
      border: none;
      display: block;
    }
  </style>
</head>
<body id="b">
  <div class="card-frame" id="frame1">
    <iframe id="f1"></iframe>
  </div>
  <div class="card-frame" id="frame2">
    <iframe id="f2"></iframe>
  </div>
  <script>
    const params = new URLSearchParams(location.search);
    const lang = params.get('uilang') || 'fa';
    const mode = params.get('uimode') || 'light';
    const page = params.get('page') || 'popup';

    try { localStorage.setItem('hamsoo-lang', lang); } catch(_) {}

    document.getElementById('h').className = mode;
    document.getElementById('b').className = mode;

    const f1 = document.getElementById('f1');
    const f2 = document.getElementById('f2');

    const scrollAmt = page === 'options' ? 500 : 350;

    function applyScrollToF2() {
      try {
        const doc = f2.contentDocument;
        if (!doc) return;
        const content = doc.getElementById('content');
        if (content) {
          void content.offsetHeight;
          content.scrollTop = scrollAmt;
        }
      } catch(e) {}
    }

    f2.addEventListener('load', function() {
      let attempts = 0;
      const timer = setInterval(function() {
        applyScrollToF2();
        attempts++;
        if (attempts > 40) clearInterval(timer);
      }, 30);
    });

    if (page === 'options') {
      f1.src = 'popup.html?view=settings&uilang=' + lang + '&uimode=' + mode;
      f2.src = 'popup.html?view=settings&scrollTop=' + scrollAmt + '&uilang=' + lang + '&uimode=' + mode;
    } else {
      f1.src = 'popup.html?uilang=' + lang + '&uimode=' + mode;
      f2.src = 'popup.html?scrollTop=' + scrollAmt + '&uilang=' + lang + '&uimode=' + mode;
    }
  </script>
</body>
</html>`;
  fs.writeFileSync(path.join(dir, 'wrapper.html'), wrapperHtml);

  return dir;
}

module.exports = {
  ROOT,
  DIST_CHROMIUM,
  findChrome,
  stubSource,
  createHarnessDir
};
