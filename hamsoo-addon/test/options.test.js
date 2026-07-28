'use strict';
/**
 * Behavioral DOM tests for the dedicated options page (options.html), run in
 * real headless Chromium. Mirrors test/dom.test.js; see that file and
 * scripts/uiharness.js for how the harness works.
 */
const path = require('path');
const { execFileSync } = require('child_process');
const { test, assert } = require('./harness');
const { findChrome, createHarnessDir } = require('../scripts/uiharness');

// Static guards for the two callers that open popup.html in a full browser
// tab. The CSS only kicks in when they pass ?ui=tab, and neither caller is
// reachable from the DOM harness, so assert the plumbing directly: a dropped
// flag here would silently restore the corner-of-the-window rendering.
const fs = require('fs');
const SRC = path.join(__dirname, '..', 'src');

test('options page opens the popup shell in tab mode', () => {
  const html = fs.readFileSync(path.join(SRC, 'options.html'), 'utf8');
  assert.includes(html, 'ui=tab', 'options.html must request tab-mode rendering');
});

test('welcome tour deep links open the popup shell in tab mode', () => {
  const js = fs.readFileSync(path.join(SRC, 'welcome.js'), 'utf8');
  assert.includes(js, 'ui=tab', 'welcome.js must request tab-mode rendering');
});

const EXPECTED_CHECKS = [
  'EN settings title in header',
  'custom sites listed and deduped',
  'custom site hosts stripped of scheme/wildcard',
  'picked element row rendered',
  'removing a picked element persists and shows the empty hint',
  'dark mode button applies the dark theme',
  'backup controls present',
  'tab mode centers and unclamps the popup shell'
];

const chromeBin = findChrome();

if (!chromeBin) {
  console.log('  ! options DOM tests skipped: no Chromium/Chrome binary found (set HAMSOO_CHROME to enable).');
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
            customSelectors: { 'gemini.google.com': ['div.follow-up-text'] }
          },
          extraScriptFiles: [path.join(__dirname, 'options-checks.js')],
          checksPage: 'popup.html'
        });
        // ?ui=tab mirrors what options.html actually redirects to.
        const url = 'file://' + path.join(dir, 'popup.html') + '?view=settings&ui=tab';
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
    test('options DOM: ' + name, async () => {
      const results = await browserResults();
      const item = results.find(r => r.name === name);
      assert.ok(item, 'browser check did not run: ' + name);
      assert.ok(item.ok, item.msg || 'failed in browser');
    });
  }
}
