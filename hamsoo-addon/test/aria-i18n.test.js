'use strict';
const fs = require('fs');
const path = require('path');
const { test, assert } = require('./harness');

test('H13: popup aria-labels are wired to data-i18n-attr', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'popup.html'), 'utf8');
  const tags = html.match(/<[^>]+aria-label="[^"]+"[^>]*>/g) || [];
  const missing = tags.filter(tag => !tag.includes('data-i18n-attr'));
  assert.equal(missing.length, 0);
});
