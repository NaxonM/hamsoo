'use strict';
const fs = require('fs');
const path = require('path');
const { test, assert } = require('./harness');

test('H05: removing a picked selector persists immediately', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'popup.js'), 'utf8');
  const start = src.indexOf('async function removeCustomSelector');
  const end = src.indexOf('function renderPickedElements');
  const body = src.slice(start, end > start ? end : start + 600);
  assert.ok(body.includes('persistNow()'));
  assert.ok(!/\bsave\(\s*\)/.test(body));
});

test('H05: content script unstyles dropped extra selectors', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
  assert.ok(src.includes('unstyleDroppedSelectors'));
});
