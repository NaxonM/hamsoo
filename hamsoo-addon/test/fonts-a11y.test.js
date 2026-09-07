'use strict';
const fs = require('fs');
const path = require('path');
const { test, assert } = require('./harness');

test('H12: Add font dropzone is keyboard reachable', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'fonts.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'fonts.css'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'fonts.js'), 'utf8');
  assert.ok(/id="dropzone"[^>]*tabindex="0"/.test(html));
  assert.ok(!/\.dropzone input\s*\{\s*display:\s*none/.test(css));
  assert.ok(css.includes('clip: rect(0, 0, 0, 0)'));
  assert.ok(js.includes("e.key === 'Enter'"));
});

test('H14: fonts page uses html.dark and accent tokens over raw media query', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'fonts.css'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'fonts.js'), 'utf8');
  assert.ok(css.includes('html.dark'));
  assert.ok(css.includes('data-accent="teal"'));
  assert.ok(!css.includes('@media (prefers-color-scheme: dark)'));
  assert.ok(js.includes('applyTheme'));
});
