'use strict';
const path = require('path');
const util = require(path.join(__dirname, '..', 'src', 'shared', 'settings-util'));
const { test, assert } = require('./harness');

test('clampSize clamps to 12..22 and defaults to 15', () => {
  assert.equal(util.clampSize(5), 12);
  assert.equal(util.clampSize(30), 22);
  assert.equal(util.clampSize(16), 16);
  assert.equal(util.clampSize(0), 15);
  assert.equal(util.clampSize('nope'), 15);
});

test('clampLineHeight clamps to 1.3..2.5 and defaults to 1.9', () => {
  assert.equal(util.clampLineHeight(1), 1.3);
  assert.equal(util.clampLineHeight(3), 2.5);
  assert.equal(util.clampLineHeight(2), 2);
  assert.equal(util.clampLineHeight(0), 1.9);
});

test('clampWeight clamps to 300..800 and defaults to 400', () => {
  assert.equal(util.clampWeight(100), 300);
  assert.equal(util.clampWeight(900), 800);
  assert.equal(util.clampWeight(500), 500);
  assert.equal(util.clampWeight(0), 400);
});

test('clampLetterSpacing clamps to 0..1.5', () => {
  assert.equal(util.clampLetterSpacing(-1), 0);
  assert.equal(util.clampLetterSpacing(2), 1.5);
  assert.equal(util.clampLetterSpacing(0.5), 0.5);
});

test('clampMeasure: 0/invalid stays off, otherwise 40..100', () => {
  assert.equal(util.clampMeasure(0), 0);
  assert.equal(util.clampMeasure('x'), 0);
  assert.equal(util.clampMeasure(10), 40);
  assert.equal(util.clampMeasure(200), 100);
  assert.equal(util.clampMeasure(65), 65);
});

test('normalizeAlign only allows justify, else start', () => {
  assert.equal(util.normalizeAlign('justify'), 'justify');
  assert.equal(util.normalizeAlign('start'), 'start');
  assert.equal(util.normalizeAlign('center'), 'start');
  assert.equal(util.normalizeAlign(undefined), 'start');
});

test('normalizeDigitsScript only allows ar, else fa', () => {
  assert.equal(util.normalizeDigitsScript('ar'), 'ar');
  assert.equal(util.normalizeDigitsScript('fa'), 'fa');
  assert.equal(util.normalizeDigitsScript('en'), 'fa');
  assert.equal(util.normalizeDigitsScript(undefined), 'fa');
});

test('migrateSettings stamps schemaVersion and reports change', () => {
  const res = util.migrateSettings({ enabled: true });
  assert.equal(res.changed, true);
  assert.equal(res.settings.schemaVersion, util.SCHEMA_VERSION);
  assert.equal(res.settings.enabled, true);
});

test('migrateSettings is a no-op at the current schema version', () => {
  const first = util.migrateSettings({ enabled: false });
  const second = util.migrateSettings(first.settings);
  assert.equal(second.changed, false);
  assert.equal(second.settings, first.settings);
});

test('migrateSettings v0->v1 dedupes custom sites', () => {
  const res = util.migrateSettings({
    customSites: ['https://a.example/*', 'https://a.example/*', 'https://b.example/*', 7]
  });
  assert.equal(
    JSON.stringify(res.settings.customSites),
    JSON.stringify(['https://a.example/*', 'https://b.example/*'])
  );
});

test('migrateSettings v0->v1 drops value-less site overrides', () => {
  const res = util.migrateSettings({
    siteOverrides: { gemini: { enabled: true }, chatgpt: { enabled: false, fontSize: 17 } }
  });
  assert.equal(res.settings.siteOverrides.gemini, undefined);
  assert.equal(res.settings.siteOverrides.chatgpt.fontSize, 17);
});

test('migrateSettings v1->v2 adds syncVersion: 0', () => {
  // Simulate a v1 payload (has schemaVersion 1, no syncVersion).
  const v1 = { enabled: true, schemaVersion: 1, font: 'Vazirmatn' };
  const res = util.migrateSettings(v1);
  assert.equal(res.changed, true);
  assert.equal(res.settings.schemaVersion, util.SCHEMA_VERSION);
  assert.equal(res.settings.syncVersion, 0);
});

test('migrateSettings v1->v2 does not overwrite existing syncVersion', () => {
  // If a v1 payload somehow already has a syncVersion (e.g. manual edit),
  // the migration must not reset it.
  const v1WithVer = { enabled: true, schemaVersion: 1, syncVersion: 5 };
  const res = util.migrateSettings(v1WithVer);
  assert.equal(res.settings.syncVersion, 5);
});

test('incrementSyncVersion increments and returns new value', () => {
  const s = { syncVersion: 3 };
  const next = util.incrementSyncVersion(s);
  assert.equal(next, 4);
  assert.equal(s.syncVersion, 4);
});

test('incrementSyncVersion initializes missing syncVersion to 1', () => {
  const s = {};
  const next = util.incrementSyncVersion(s);
  assert.equal(next, 1);
  assert.equal(s.syncVersion, 1);
});

test('getSlimSettingsForSync trims heavy font payload for storage.sync', () => {
  const full = {
    font: 'Vazirmatn',
    syncVersion: 2,
    customFonts: [{ id: 'font1', name: 'Custom Font 1', bytes: 'heavyBase64Data' }]
  };
  const slim = util.getSlimSettingsForSync(full);
  assert.equal(slim.font, 'Vazirmatn');
  assert.equal(slim.syncVersion, 2);
  assert.equal(slim.customFonts[0].bytes, undefined);
  assert.equal(slim.customFonts[0].id, 'font1');
  assert.equal(slim.customFonts[0].name, 'Custom Font 1');
});
