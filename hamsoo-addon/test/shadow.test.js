'use strict';
/**
 * Shadow DOM behavioral tests for the content script, run in real headless
 * Chromium (zero npm dependencies). Skipped with a notice when no browser
 * binary is found.
 *
 * A fixture page loads the built content script with a stubbed extension API
 * (file:// host is not a known site, i.e. the custom-site code path), then
 * test/shadow-checks.js attaches nested open shadow roots and asserts both
 * marking and computed styles inside them.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, assert } = require('./harness');
const { findChrome, createHarnessDir } = require('../scripts/uiharness');

const EXPECTED_CHECKS = [
  'light DOM paragraph marked rtl',
  'shadow paragraph marked rtl',
  'nested shadow paragraph marked rtl',
  'shadow computed direction is rtl',
  'nested shadow computed direction is rtl',
  'ltr-only shadow paragraph keeps ltr direction'
];

const chromeBin = findChrome();

if (!chromeBin) {
  console.log('  ! shadow DOM tests skipped: no Chromium/Chrome binary found (set HAMSOO_CHROME to enable).');
} else {
  let promise = null;
  function browserResults() {
    if (!promise) {
      promise = Promise.resolve().then(() => {
        const dir = createHarnessDir({ seedSettings: { lang: 'en' } });
        fs.copyFileSync(
          path.join(__dirname, 'shadow-checks.js'),
          path.join(dir, 'shadow-checks.js')
        );
        fs.writeFileSync(path.join(dir, 'shadow-fixture.html'), [
          '<!doctype html>',
          '<html><head><meta charset="utf-8"><title>fixture</title></head><body>',
          '<p id="lightP">\u0633\u0644\u0627\u0645 \u0627\u0632 \u062f\u0646\u06cc\u0627\u06cc \u0631\u0648\u0634\u0646</p>',
          '<script src="stub.js"></script>',
          '<script src="shared/settings-util.js"></script>',
          '<script src="content.js"></script>',
          '<script src="shadow-checks.js"></script>',
          '</body></html>'
        ].join('\n'));
        const url = 'file://' + path.join(dir, 'shadow-fixture.html');
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
    test('shadow DOM: ' + name, async () => {
      const results = await browserResults();
      const item = results.find(r => r.name === name);
      assert.ok(item, 'browser check did not run: ' + name);
      assert.ok(item.ok, item.msg || 'failed in browser');
    });
  }
}
