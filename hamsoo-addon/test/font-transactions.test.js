'use strict';
const fs = require('fs');
const path = require('path');
const util = require(path.join(__dirname, '..', 'src', 'shared', 'settings-util'));
const { test, assert } = require('./harness');

test('storage: promisifyTx in fontdb.js waits for oncomplete and handles onabort/onerror', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'fontdb.js'), 'utf8');
  assert.ok(src.includes('function promisifyTx(tx, req)'));
  assert.ok(src.includes('tx.oncomplete = () =>'));
  assert.ok(src.includes('tx.onabort = () =>'));
  assert.ok(src.includes('tx.onerror = () =>'));
  assert.ok(src.includes('promisifyTx(tx, req)'));
});

test('storage: font remove in fonts.js persists metadata before deleting bytes', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'fonts.js'), 'utf8');
  const removeStart = src.indexOf("remove.addEventListener('click'");
  const removeBody = src.slice(removeStart, removeStart + 800);
  const patchIdx = removeBody.indexOf('sendSettingsPatch({ removeFont:');
  const dbRemoveIdx = removeBody.indexOf('HamsooFontDB.remove');
  assert.ok(patchIdx > 0, 'metadata patch must be sent');
  assert.ok(dbRemoveIdx > patchIdx, 'DB byte removal must occur only after metadata patch succeeds');
});

test('storage: font add in fonts.js removes staged orphan bytes on failure and verifies capacity', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'fonts.js'), 'utf8');
  const addStart = src.indexOf('async function addFiles(files)');
  const addBody = src.slice(addStart, addStart + 2500);
  assert.ok(addBody.includes('HamsooFontDB.put'), 'stages font in IndexedDB');
  assert.ok(addBody.includes('sendSettingsPatch({ addFont:'), 'sends addFont patch');
  assert.ok(addBody.includes('res.settings.customFonts.some'), 'verifies font added to authoritative metadata');
  assert.ok(addBody.includes('HamsooFontDB.remove(id)'), 'cleans up staged bytes on failure');
});

test('import: rollback snapshots overwritten fonts and restores them on save failure', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'popup.js'), 'utf8');
  const importStart = src.indexOf('async function importSettings(file)');
  const importBody = src.slice(importStart, importStart + 5000);
  assert.ok(importBody.includes('overwrittenFonts'), 'snapshots overwritten fonts');
  assert.ok(importBody.includes('newlyAddedFontIds'), 'tracks newly added IDs');
  assert.ok(importBody.includes('HamsooFontDB.put(prevRecord)'), 'restores overwritten font bytes on rollback');
  assert.ok(importBody.includes('HamsooFontDB.remove(id)'), 'only removes newly added font IDs on rollback');
});

test('import: validates fonts using FontFace decode probe', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'popup.js'), 'utf8');
  const importStart = src.indexOf('async function importSettings(file)');
  const importBody = src.slice(importStart, importStart + 2500);
  assert.ok(importBody.includes('new FontFace('), 'constructs FontFace probe');
  assert.ok(importBody.includes('.load()'), 'loads font probe to verify decoding');
});

test('import: MAX_IMPORT_BYTES accommodates full 12-font backup with base64 expansion', () => {
  const maxFonts = util.MAX_CUSTOM_FONTS || 12;
  const maxFontBytes = util.MAX_FONT_BYTES || (4 * 1024 * 1024);
  const base64PerFont = Math.ceil(maxFontBytes / 3) * 4;
  const totalFontsPayload = maxFonts * base64PerFont;
  assert.ok(util.MAX_IMPORT_BYTES > totalFontsPayload, 'MAX_IMPORT_BYTES must exceed 12 max-sized base64 fonts');
  assert.ok(util.MAX_IMPORT_BYTES >= (68 * 1024 * 1024), 'MAX_IMPORT_BYTES must be at least 68MB for headroom');
});
