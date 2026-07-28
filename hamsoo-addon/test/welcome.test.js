'use strict';
/**
 * Behavioral DOM tests for the welcome tour, run in real headless Chromium.
 * Skipped with a notice when no browser binary is found, like the other UI tests.
 *
 * The page is loaded with ?uilang=en so the asserted copy does not depend on the
 * host machine's UI language.
 */
const path = require('path');
const { execFileSync } = require('child_process');
const { test, assert } = require('./harness');
const { findChrome, createHarnessDir } = require('../scripts/uiharness');

const EXPECTED_CHECKS = [
  'welcome tour renders the hero and the demo',
  'welcome copy is localized',
  'demo sample starts in the unfixed state',
  'direction toggle changes only direction',
  'font toggle applies the bundled font',
  'readability toggle changes size and spacing',
  'digits toggle localizes digits',
  'digits toggle is losslessly reversible',
  'every control row has a localized description',
  'language switch is offered above the tour',
  'switching language re-localizes the page and marks the choice',
  'switching language rebinds the demo sample',
  'the tour never writes to storage'
];

const chromeBin = findChrome();

if (!chromeBin) {
  console.log('  ! Welcome DOM tests skipped: no Chromium/Chrome binary found (set HAMSOO_CHROME to enable).');
} else {
  let promise = null;
  function browserResults() {
    if (!promise) {
      promise = Promise.resolve().then(() => {
        const dir = createHarnessDir({
          checksPage: 'welcome.html',
          extraScriptFiles: [path.join(__dirname, 'welcome-checks.js')]
        });
        const url = 'file://' + path.join(dir, 'welcome.html') + '?uilang=en';
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
    test('welcome DOM: ' + name, async () => {
      const results = await browserResults();
      const item = results.find(r => r.name === name);
      assert.ok(item, 'browser check did not run: ' + name);
      assert.ok(item.ok, item.msg || 'failed in browser');
    });
  }
}
