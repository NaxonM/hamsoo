'use strict';
const fs = require('fs');
const path = require('path');
const { test, assert } = require('./harness');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n.js'), 'utf8');
function dict(name) {
  const m = new RegExp(name + ':\\s*\\{([\\s\\S]*?)\\n\\s{4}\\}').exec(src);
  assert.ok(m, 'dictionary ' + name + ' found');
  return [...m[1].matchAll(/^\s{6}([a-zA-Z0-9_]+):/gm)].map(x => x[1]);
}

test('i18n fa/en key sets match', () => {
  const fa = dict('fa');
  const en = dict('en');
  const miss = (a, b) => a.filter(k => !b.includes(k));
  assert.equal(miss(fa, en).length, 0, 'fa keys missing from en: ' + miss(fa, en));
  assert.equal(miss(en, fa).length, 0, 'en keys missing from fa: ' + miss(en, fa));
});

test('i18n has no duplicate keys', () => {
  for (const name of ['fa', 'en']) {
    const k = dict(name);
    const dup = k.filter((x, i) => k.indexOf(x) !== i);
    assert.equal(dup.length, 0, name + ' duplicates: ' + dup);
  }
});

test('Phase 9 typography keys present in both languages', () => {
  const fa = dict('fa');
  const en = dict('en');
  for (const key of ['alignLabel', 'alignStart', 'alignJustify', 'widthLabel', 'widthOff', 'widthNarrow', 'widthMedium', 'widthWide']) {
    assert.includes(fa, key, 'fa ' + key);
    assert.includes(en, key, 'en ' + key);
  }
});
