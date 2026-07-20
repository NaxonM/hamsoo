'use strict';
/**
 * Behavioral DOM tests for the popup, run in real headless Chromium (zero
 * npm dependencies). Skipped with a notice when no browser binary is found.
 *
 * How it works: scripts/uiharness.js copies dist/hamsoo-chromium into a temp
 * dir with a stubbed extension API and seeded (deliberately messy) settings,
 * test/dom-checks.js runs assertions in-page, and the results come back as
 * base64 JSON in <title> via --dump-dom.
 */
const path = require('path');
const { execFileSync } = require('child_process');
const { test, assert } = require('./harness');
const { findChrome, createHarnessDir } = require('../scripts/uiharness');

const EXPECTED_CHECKS = [
  'EN wordmark in header',
  'LTR direction applied for EN',
  '12 site chips rendered alphabetically',
  'moved cards absent from popup',
  'settings gear button present',
  'site chip toggles aria-pressed',
  'persisted settings: customSites deduped',
  'persisted settings: value-less site override pruned',
  'font-size slider dblclick resets to 15'
];

const chromeBin = findChrome();

if (!chromeBin) {
  console.log('  ! DOM tests skipped: no Chromium/Chrome binary found (set HAMSOO_CHROME to enable).');
} else {
  let promise = null;
  function browserResults() {
    if (!promise) {
      promise = Promise.resolve().then(() => {
        const dir = createHarnessDir({
          seedSettings: {
            lang: 'en',
            mode: 'light',
            customSites: [
              'https://a.example/*',
              'https://a.example/*', // duplicate: normalize() must dedupe
              'https://b.example/*'
            ],
            // Value-less override: normalize() must prune it.
            siteOverrides: { gemini: { enabled: true } }
          },
          extraScriptFiles: [path.join(__dirname, 'dom-checks.js')]
        });
        const url = 'file://' + path.join(dir, 'popup.html');
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
    test('popup DOM: ' + name, async () => {
      const results = await browserResults();
      const item = results.find(r => r.name === name);
      assert.ok(item, 'browser check did not run: ' + name);
      assert.ok(item.ok, item.msg || 'failed in browser');
    });
  }
}
