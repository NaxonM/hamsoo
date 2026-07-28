'use strict';
const fs = require('fs');
const path = require('path');
const { test, assert } = require('./harness');

const LOC = path.join(__dirname, '..', 'src', '_locales');
const load = lang => JSON.parse(fs.readFileSync(path.join(LOC, lang, 'messages.json'), 'utf8'));

test('_locales JSON is valid and fa/en share the same message keys', () => {
  const fa = load('fa');
  const en = load('en');
  const fk = Object.keys(fa).sort();
  const ek = Object.keys(en).sort();
  assert.equal(JSON.stringify(fk), JSON.stringify(ek), 'locale key sets differ');
});

test('_locales JSON is valid and fa/ar share the same message keys', () => {
  const fa = load('fa');
  const ar = load('ar');
  const fk = Object.keys(fa).sort();
  const ak = Object.keys(ar).sort();
  assert.equal(JSON.stringify(fk), JSON.stringify(ak), 'locale key sets differ (fa vs ar)');
});

test('required manifest message keys exist', () => {
  const fa = load('fa');
  for (const key of ['extName', 'extDesc', 'actionTitle', 'cmdToggle']) {
    assert.ok(fa[key] && fa[key].message, 'missing ' + key);
  }
});

test('required manifest message keys exist in ar', () => {
  const ar = load('ar');
  for (const key of ['extName', 'extDesc', 'actionTitle', 'cmdToggle']) {
    assert.ok(ar[key] && ar[key].message, 'missing ' + key);
  }
});
