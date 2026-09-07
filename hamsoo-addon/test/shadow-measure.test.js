'use strict';
const fs = require('fs');
const path = require('path');
const { test, assert } = require('./harness');

test('H15: shadow measure CSS excludes pre and code like light DOM', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.css'), 'utf8');
  assert.ok(css.includes('[data-hamsoo="rtl"]:not(td):not(th):not(pre):not(code)'));
  assert.ok(js.includes('[data-hamsoo="rtl"]:not(td):not(th):not(pre):not(code)'));
  assert.ok(!js.includes('[data-hamsoo="rtl"]:not(td):not(th){max-width'));
});
