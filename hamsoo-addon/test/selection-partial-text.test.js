'use strict';
const fs = require('fs');
const path = require('path');
const { test, assert } = require('./harness');

test('selection: isPartialContainer inspects childNodes including non-empty text nodes', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
  const start = src.indexOf('function isPartialContainer(el, range)');
  const body = src.slice(start, start + 600);
  assert.ok(body.includes('el.childNodes'), 'must iterate childNodes instead of only children');
  assert.ok(body.includes('Node.TEXT_NODE'), 'must handle TEXT_NODE childNodes');
  assert.ok(body.includes('hit && miss'), 'must detect partial coverage when both hit and miss are present');
});
