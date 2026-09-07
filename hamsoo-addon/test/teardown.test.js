'use strict';
/**
 * Behavioral tests for the disable teardown in real headless Chromium
 * (zero npm dependencies). Skipped with a notice when no browser binary
 * is found.
 *
 * The shared harness stub deliberately makes storage.onChanged a no-op, so a
 * settings change cannot be delivered to the content script the way the real
 * extension delivers one. This fixture therefore installs a tiny shim AFTER
 * stub.js and BEFORE content.js that records the content script's listener and
 * exposes window.__push(settings) to fire it -- the same path a popup toggle
 * takes in production.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, assert } = require('./harness');
const { findChrome, createHarnessDir } = require('../scripts/uiharness');

const EXPECTED_CHECKS = [
  'teardown fixture: extension applied before disabling',
  'disabling removes every data-hamsoo attribute from <html>',
  'disabling removes every --hamsoo custom property from <html>',
  'disabling removes element direction marks',
  'disabling restores localized digits to ascii',
  'disabling restores a site-authored dir attribute',
  'disabling detaches injected styling from shadow roots',
  'disabling undoes a context-menu selection fix',
  'undoing a selection fix keeps the page\u2019s own dir attribute',
  'undoing a selection fix restores original inline styles',
  're-enabling restores marks and digits',
  're-enabling restores styling and marks inside shadow roots'
];

const SEED = {
  enabled: true, fontEnabled: true, readabilityEnabled: true,
  digitsEnabled: true, digitsScript: 'fa', punctuationFixEnabled: true,
  fontSize: 17, lineHeight: 2, fontWeight: 500, letterSpacing: 0.4,
  textAlign: 'justify', maxWidth: 70, customSites: [], schemaVersion: 2, lang: 'fa'
};

// "\u062f\u0631 \u0633\u0627\u0644 2024 \u062d\u062f\u0648\u062f 150 \u0646\u0633\u062e\u0647 \u0645\u0646\u062a\u0634\u0631 \u0634\u062f" -- Persian prose carrying Latin digits.
const PROSE = '\u062f\u0631 \u0633\u0627\u0644 2024 \u062d\u062f\u0648\u062f 150 \u0646\u0633\u062e\u0647 \u0645\u0646\u062a\u0634\u0631 \u0634\u062f \u0648 \u0627\u06cc\u0646 \u0631\u0648\u0646\u062f \u0627\u062f\u0627\u0645\u0647 \u062f\u0627\u0631\u062f';
const FA = '\u0627\u06cc\u0646 \u06cc\u06a9 \u0645\u062a\u0646 \u0641\u0627\u0631\u0633\u06cc \u0637\u0648\u0644\u0627\u0646\u06cc \u0628\u0631\u0627\u06cc \u0622\u0632\u0645\u0627\u06cc\u0634 \u0627\u0633\u062a';

const chromeBin = findChrome();

if (!chromeBin) {
  console.log('  ! teardown tests skipped: no Chromium/Chrome binary found (set HAMSOO_CHROME to enable).');
} else {
  let promise = null;
  function browserResults() {
    if (!promise) {
      promise = Promise.resolve().then(() => {
        const dir = createHarnessDir({ seedSettings: SEED });
        fs.copyFileSync(
          path.join(__dirname, 'teardown-checks.js'),
          path.join(dir, 'teardown-checks.js')
        );
        fs.writeFileSync(path.join(dir, 'teardown-fixture.html'), [
          '<!doctype html>',
          '<html lang="fa"><head><meta charset="utf-8"><title>fixture</title>',
          '<link rel="stylesheet" href="content.css"></head><body>',
          '<p id="prose">' + PROSE + '</p>',
          '<textarea id="siteDir" dir="rtl">' + FA + '</textarea>',
          '<div id="host"></div>',
          '<script src="stub.js"></script>',
          // Deliver settings changes the way the popup does; the shared stub
          // swallows onChanged listeners.
          '<script>',
          '(function(){',
          '  var listeners = [];',
          '  chrome.storage.onChanged = { addListener: function(fn){ listeners.push(fn); } };',
          '  window.__push = function(s){',
          '    chrome.storage.local.set({ settings: s });',
          '    for (var i = 0; i < listeners.length; i++) {',
          '      listeners[i]({ settings: { newValue: s } }, "local");',
          '    }',
          '  };',
          '  var root = document.getElementById("host").attachShadow({ mode: "open" });',
          '  var p = document.createElement("p");',
          '  p.id = "shadowPara";',
          '  p.textContent = ' + JSON.stringify(FA) + ';',
          '  root.appendChild(p);',
          '})();',
          '</script>',
          '<script src="shared/settings-util.js"></script>',
          '<script src="content.js"></script>',
          '<script src="teardown-checks.js"></script>',
          '</body></html>'
        ].join('\n'));
        const url = 'file://' + path.join(dir, 'teardown-fixture.html');
        const out = execFileSync(chromeBin, [
          '--headless', '--no-sandbox', '--disable-gpu',
          '--virtual-time-budget=12000', '--dump-dom', url
        ], { encoding: 'utf8', timeout: 90000, maxBuffer: 32 * 1024 * 1024 });
        const m = /HAMSOO_RESULTS:([A-Za-z0-9+/=]+)/.exec(out);
        if (!m) throw new Error('no HAMSOO_RESULTS marker in dumped DOM');
        return JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
      });
    }
    return promise;
  }

  for (const name of EXPECTED_CHECKS) {
    test('teardown: ' + name, async () => {
      const results = await browserResults();
      const item = results.find(r => r.name === name);
      assert.ok(item, 'browser check did not run: ' + name);
      assert.ok(item.ok, item.msg || 'failed in browser');
    });
  }
}
