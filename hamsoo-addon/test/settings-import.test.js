'use strict';
const fs = require('fs');
const path = require('path');
const util = require(path.join(__dirname, '..', 'src', 'shared', 'settings-util'));
const { test, assert } = require('./harness');

function reject(data) {
  const res = util.recognizeImportedSettings(data);
  assert.equal(res.ok, false);
  return res;
}

test('H02: empty object is not a settings backup', () => {
  const res = reject({});
  assert.equal(res.error, 'invalid');
});

test('H02: arrays are not a settings backup', () => {
  assert.equal(reject([]).error, 'invalid');
});

test('H02: unrelated JSON is rejected', () => {
  assert.equal(reject({ theme: 'dark', foo: 1 }).error, 'invalid');
  assert.equal(reject({ enabled: true }).error, 'invalid');
  assert.equal(reject(null).error, 'invalid');
  assert.equal(reject('hamsoo').error, 'invalid');
});

test('H02: envelope without settings is rejected', () => {
  assert.equal(reject({ format: 'hamsoo-settings', version: 1 }).error, 'invalid');
  assert.equal(reject({ format: 'hamsoo-settings', version: 1, settings: [] }).error, 'invalid');
});

test('H02: wrong format or unsupported version is rejected', () => {
  assert.equal(reject({ format: 'other', version: 1, settings: { font: 'Vazirmatn' } }).error, 'invalid');
  assert.equal(reject({
    format: 'hamsoo-settings',
    version: 2,
    settings: { font: 'Vazirmatn', sites: {} }
  }).error, 'unsupportedVersion');
});

test('H02: a real export envelope is accepted', () => {
  const res = util.recognizeImportedSettings({
    format: 'hamsoo-settings',
    version: 1,
    settings: { enabled: false, font: 'Vazirmatn', fontSize: 18 },
    fonts: []
  });
  assert.equal(res.ok, true);
  assert.equal(res.envelope, true);
  assert.equal(res.settings.enabled, false);
  assert.equal(res.settings.fontSize, 18);
});

test('H02: a distinctive legacy settings object is accepted', () => {
  const res = util.recognizeImportedSettings({
    schemaVersion: 4,
    enabled: true,
    font: 'Vazirmatn'
  });
  assert.equal(res.ok, true);
  assert.equal(res.envelope, false);
});

test('H02: popup import calls recognizeImportedSettings before persist', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'popup.js'), 'utf8');
  assert.ok(src.includes('recognizeImportedSettings'));
  assert.ok(src.includes('importConfirm'));
  const importIdx = src.indexOf('async function importSettings');
  const persistIdx = src.indexOf('persistNow()', importIdx);
  const recognizeIdx = src.indexOf('recognizeImportedSettings', importIdx);
  assert.ok(importIdx > 0 && recognizeIdx > importIdx && recognizeIdx < persistIdx);
});
