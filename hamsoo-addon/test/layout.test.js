'use strict';
/**
 * Popup layout regression tests, run in real headless Chromium.
 *
 * These are deliberately separate from dom.test.js: dom.test.js unclamps the
 * shell so it can inspect every card at once, which is exactly the condition
 * under which a popup-sizing bug becomes invisible. Here the shell is left
 * clamped and the window is sized to 372x150 -- roughly the provisional
 * window a browser uses before it measures the popup document -- so any
 * percentage height on html/body/.shell collapses the scroll area and fails
 * the run.
 *
 * Background: docs/DEBUGGING-REPORT.md, Regression R1.
 */
const path = require('path');
const { execFileSync } = require('child_process');
const { test, assert } = require('./harness');
const { findChrome, createHarnessDir } = require('../scripts/uiharness');

const EXPECTED_CHECKS = [
  'shell grows with content, not with the viewport',
  'no percentage height on html, body or .shell',
  'scroll area keeps a usable height',
  'scroll area is actually scrollable, not clipped away',
  'preview footer stays inside the shell',
  'header, content and footer stack in order without gaps',
  'settings cards are visible, not trapped behind the fold'
];

const chromeBin = findChrome();

if (!chromeBin) {
  console.log('  ! layout tests skipped: no Chromium/Chrome binary found (set HAMSOO_CHROME to enable).');
} else {
  let promise = null;
  function browserResults() {
    if (!promise) {
      promise = Promise.resolve().then(() => {
        const dir = createHarnessDir({
          seedSettings: { lang: 'fa', mode: 'light' },
          // unclampShell stays false on purpose: the clamped shell is the
          // thing under test.
          extraScriptFiles: [path.join(__dirname, 'layout-checks.js')]
        });
        const url = 'file://' + path.join(dir, 'popup.html');
        const out = execFileSync(chromeBin, [
          '--headless', '--no-sandbox', '--disable-gpu',
          // Short, popup-like provisional window: this is what exposes a
          // percentage-height regression.
          '--window-size=372,150',
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
    test('popup layout: ' + name, async () => {
      const results = await browserResults();
      const item = results.find(r => r.name === name);
      assert.ok(item, 'browser check did not run: ' + name);
      assert.ok(item.ok, item.msg || 'failed in browser');
    });
  }
}
