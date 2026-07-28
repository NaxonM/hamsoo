'use strict';
/**
 * Behavioral tests for per-locale digit conversion (settings.digitsEnabled +
 * settings.digitsScript) in real headless Chromium (zero npm dependencies).
 * Skipped with a notice when no browser binary is found.
 *
 * A fixture page loads the built content script with a stubbed extension API
 * seeding digitsEnabled: true, digitsScript: 'ar', then
 * test/digits-checks.js asserts that Latin digits inside RTL prose are
 * rewritten to Arabic-Indic digits, while code/editable regions are left
 * untouched.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, assert } = require('./harness');
const { findChrome, createHarnessDir } = require('../scripts/uiharness');

const EXPECTED_CHECKS = [
  'arabic-indic digits applied to rtl prose',
  'latin digits no longer present in rtl prose',
  'code block digits are left untouched',
  'editable field digits are left untouched'
];

const chromeBin = findChrome();

if (!chromeBin) {
  console.log('  ! digit-locale tests skipped: no Chromium/Chrome binary found (set HAMSOO_CHROME to enable).');
} else {
  let promise = null;
  function browserResults() {
    if (!promise) {
      promise = Promise.resolve().then(() => {
        const dir = createHarnessDir({
          seedSettings: { lang: 'en', digitsEnabled: true, digitsScript: 'ar' }
        });
        fs.copyFileSync(
          path.join(__dirname, 'digits-checks.js'),
          path.join(dir, 'digits-checks.js')
        );
        fs.writeFileSync(path.join(dir, 'digits-fixture.html'), [
          '<!doctype html>',
          '<html><head><meta charset="utf-8"><title>fixture</title>',
          '<link rel="stylesheet" href="content.css"></head><body>',
          '<p id="prose">\u0633\u0644\u0627\u0645 123 \u062f\u0646\u06cc\u0627\u06cc \u0631\u0648\u0634\u0646</p>',
          '<pre id="code"><code>const x = 123;</code></pre>',
          '<textarea id="editable">123</textarea>',
          '<script src="stub.js"></script>',
          '<script src="shared/settings-util.js"></script>',
          '<script src="content.js"></script>',
          '<script src="digits-checks.js"></script>',
          '</body></html>'
        ].join('\n'));
        const url = 'file://' + path.join(dir, 'digits-fixture.html');
        const out = execFileSync(chromeBin, [
          '--headless', '--no-sandbox', '--disable-gpu',
          '--virtual-time-budget=8000', '--dump-dom', url
        ], { encoding: 'utf8', timeout: 90000, maxBuffer: 32 * 1024 * 1024 });
        const m = /HAMSOO_RESULTS:([A-Za-z0-9+/=]+)/.exec(out);
        if (!m) throw new Error('no HAMSOO_RESULTS marker in dumped DOM');
        return JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
      });
    }
    return promise;
  }

  for (const name of EXPECTED_CHECKS) {
    test('digit locale: ' + name, async () => {
      const results = await browserResults();
      const item = results.find(r => r.name === name);
      assert.ok(item, 'browser check did not run: ' + name);
      assert.ok(item.ok, item.msg || 'failed in browser');
    });
  }
}
