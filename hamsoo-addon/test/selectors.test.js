'use strict';
/**
 * Behavioral tests for picked-element selectors (settings.customSelectors) in
 * real headless Chromium (zero npm dependencies). Skipped with a notice when
 * no browser binary is found.
 *
 * A fixture page loads the built content script with a stubbed extension API
 * that seeds customSelectors, then test/selectors-checks.js asserts that only
 * the picked element is styled and that an invalid stored selector is ignored.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, assert } = require('./harness');
const { findChrome, createHarnessDir } = require('../scripts/uiharness');

const EXPECTED_CHECKS = [
  'picked element marked rtl',
  'picked element computed direction is rtl',
  'unpicked sibling div stays unmarked',
  'invalid stored selector does not break scanning'
];

const chromeBin = findChrome();

if (!chromeBin) {
  console.log('  ! picked-selector tests skipped: no Chromium/Chrome binary found (set HAMSOO_CHROME to enable).');
} else {
  let promise = null;
  function browserResults() {
    if (!promise) {
      promise = Promise.resolve().then(() => {
        const dir = createHarnessDir({
          seedSettings: {
            lang: 'en',
            customSelectors: { '': ['div.pick-me', 'div[[bad'] }
          }
        });
        fs.copyFileSync(
          path.join(__dirname, 'selectors-checks.js'),
          path.join(dir, 'selectors-checks.js')
        );
        fs.writeFileSync(path.join(dir, 'selectors-fixture.html'), [
          '<!doctype html>',
          // content.css is part of every real injection (manifest css +
          // registerContentScripts css), so the fixture loads it too.
          '<html><head><meta charset="utf-8"><title>fixture</title>',
          '<link rel="stylesheet" href="content.css"></head><body>',
          '<p id="lightP">\u0633\u0644\u0627\u0645 \u0627\u0632 \u062f\u0646\u06cc\u0627\u06cc \u0631\u0648\u0634\u0646</p>',
          '<div id="picked" class="pick-me">\u0627\u06cc\u0646 \u06cc\u06a9 \u0645\u062a\u0646 \u0641\u0627\u0631\u0633\u06cc \u0627\u0633\u062a.</div>',
          '<div id="control">\u0627\u06cc\u0646 \u0647\u0645 \u0641\u0627\u0631\u0633\u06cc \u0627\u0633\u062a.</div>',
          '<script src="stub.js"></script>',
          '<script src="shared/settings-util.js"></script>',
          '<script src="content.js"></script>',
          '<script src="selectors-checks.js"></script>',
          '</body></html>'
        ].join('\n'));
        const url = 'file://' + path.join(dir, 'selectors-fixture.html');
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
    test('picked selectors: ' + name, async () => {
      const results = await browserResults();
      const item = results.find(r => r.name === name);
      assert.ok(item, 'browser check did not run: ' + name);
      assert.ok(item.ok, item.msg || 'failed in browser');
    });
  }
}
