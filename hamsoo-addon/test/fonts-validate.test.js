'use strict';
const fs = require('fs');
const path = require('path');
const util = require(path.join(__dirname, '..', 'src', 'shared', 'settings-util'));
const { test, assert } = require('./harness');

function buf(bytes) {
  return Uint8Array.from(bytes).buffer;
}

test('H08: sniffFontFormat accepts sfnt/WOFF magics', () => {
  assert.equal(util.sniffFontFormat(buf([0x77, 0x4F, 0x46, 0x32])), 'woff2');
  assert.equal(util.sniffFontFormat(buf([0x77, 0x4F, 0x46, 0x46])), 'woff');
  assert.equal(util.sniffFontFormat(buf([0x4F, 0x54, 0x54, 0x4F])), 'otf');
  assert.equal(util.sniffFontFormat(buf([0x00, 0x01, 0x00, 0x00])), 'ttf');
  assert.equal(util.sniffFontFormat(buf([0x74, 0x72, 0x75, 0x65])), 'ttf');
});

test('H08: sniffFontFormat rejects renamed junk', () => {
  assert.equal(util.sniffFontFormat(buf([0x00, 0x00, 0x00, 0x00])), '');
  assert.equal(util.sniffFontFormat(buf([0x3C, 0x68, 0x74, 0x6D])), ''); // <htm
  assert.equal(util.sniffFontFormat(new ArrayBuffer(2)), '');
  assert.equal(util.sniffFontFormat(null), '');
});

test('H08: fonts.js sniffs bytes before installing', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'fonts.js'), 'utf8');
  assert.ok(src.includes('sniffFontFormat'));
  assert.ok(src.includes('FontFace'));
  const putIdx = src.indexOf('HamsooFontDB.put');
  const sniffIdx = src.indexOf('sniffFontFormat');
  assert.ok(sniffIdx > 0 && sniffIdx < putIdx);
});

test('H08: import skips fonts that fail the magic sniff', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'popup.js'), 'utf8');
  const start = src.indexOf('async function importSettings');
  const body = src.slice(start, start + 3500);
  assert.ok(body.includes('sniffFontFormat'));
});

test('H09: font remove does not toast success on a failed save', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'fonts.js'), 'utf8');
  assert.ok(src.includes('saveSettingsError'));
  const start = src.indexOf('remove.addEventListener');
  const body = src.slice(start, start + 900);
  assert.ok(body.includes('saveSettingsError'));
  assert.ok(body.includes('res.ok === false'));
});
