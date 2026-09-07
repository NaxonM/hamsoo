'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, assert } = require('./harness');
const { findChrome, createHarnessDir } = require('../scripts/uiharness');

test('H10: fixSelection snapshots inline styles and skips partial containers', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
  const start = src.indexOf('function fixSelection()');
  const end = src.indexOf('\nfunction startElementPicker');
  const body = src.slice(start, end > start ? end : start + 4000);
  assert.ok(body.includes('isPartialContainer'));
  assert.ok(body.includes('JSON.stringify'));
  assert.ok(body.includes('snapshotProp'));
});

test('H10: content teardown restores JSON style snapshots', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
  assert.ok(src.includes('prior.direction'));
  assert.ok(src.includes("raw.charAt(0) === '{'"));
});

const EXPECTED_CHECKS = [
  'selected paragraph is marked',
  'unselected sibling is not marked',
  'wrapper is not marked'
];

const chromeBin = findChrome();
if (!chromeBin) {
  console.log('  ! selection-fix tests skipped: no Chromium/Chrome binary found (set HAMSOO_CHROME to enable).');
} else {
  let promise = null;
  function browserResults() {
    if (!promise) {
      promise = Promise.resolve().then(() => {
        const dir = createHarnessDir({ seedSettings: { lang: 'en', enabled: true } });
        const bg = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
        const start = bg.indexOf('function fixSelection()');
        const end = bg.indexOf('\nfunction startElementPicker');
        fs.writeFileSync(path.join(dir, 'fix-selection.js'), bg.slice(start, end) + '\n');
        fs.copyFileSync(
          path.join(__dirname, 'selection-fix-checks.js'),
          path.join(dir, 'selection-fix-checks.js')
        );
        fs.writeFileSync(path.join(dir, 'selection-fix-fixture.html'), [
          '<!doctype html>',
          '<html><head><meta charset="utf-8"><title>fixture</title></head><body>',
          '<div id="wrap">',
          '<p id="sel">AAAA selected</p>',
          '<p id="sib">BBBB sibling</p>',
          '</div>',
          '<script src="fix-selection.js"></script>',
          '<script src="selection-fix-checks.js"></script>',
          '</body></html>'
        ].join('\n'));
        const url = 'file://' + path.join(dir, 'selection-fix-fixture.html');
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
    test('selection fix: ' + name, async () => {
      const results = await browserResults();
      const item = results.find(r => r.name === name);
      assert.ok(item, 'browser check did not run: ' + name);
      assert.ok(item.ok, item.msg || 'failed in browser');
    });
  }
}
