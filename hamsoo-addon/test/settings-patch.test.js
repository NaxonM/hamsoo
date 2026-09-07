'use strict';
const fs = require('fs');
const path = require('path');
const util = require(path.join(__dirname, '..', 'src', 'shared', 'settings-util'));
const { test, assert } = require('./harness');

function memoryApi(initial) {
  const box = { settings: initial };
  return {
    box,
    api: {
      storage: {
        local: {
          get: async () => ({ settings: box.settings }),
          set: async (obj) => { box.settings = obj.settings; }
        },
        sync: {
          get: async () => ({}),
          set: async () => { throw new Error('storage.sync must not be used'); },
          remove: async () => {}
        }
      }
    }
  };
}

test('H01: addFont patch preserves enabled and fontSize from storage', () => {
  const stored = { enabled: false, fontSize: 22, customFonts: [] };
  util.applySettingsPatch(stored, {
    addFont: { id: 'f1', name: 'X', format: 'woff2', size: 18 }
  });
  assert.equal(stored.enabled, false);
  assert.equal(stored.fontSize, 22);
  assert.equal(stored.customFonts.length, 1);
  assert.equal(stored.customFonts[0].id, 'f1');
  assert.equal(stored.customFonts[0].remoteOnly, undefined);
});

test('H01: rebase keeps an unacked slider over an unrelated disable', () => {
  const acked = { enabled: true, fontSize: 15, lang: 'en' };
  const local = { enabled: true, fontSize: 22, lang: 'en' };
  const incoming = { enabled: false, fontSize: 15, lang: 'en' };
  const rebased = util.rebasePendingSettings(acked, local, incoming);
  assert.equal(rebased.enabled, false);
  assert.equal(rebased.fontSize, 22);
  assert.equal(rebased.lang, 'en');
});

test('H01: field diff only includes edited keys', () => {
  const acked = { enabled: true, fontSize: 15, lang: 'en' };
  const local = { enabled: true, fontSize: 22, lang: 'en' };
  const fields = util.diffSettingsFields(acked, local);
  assert.equal(Object.keys(fields).join(','), 'fontSize');
  assert.equal(fields.fontSize, 22);
});

test('H01: addFont and an unrelated field patch serialize without clobber', async () => {
  const mem = memoryApi({ enabled: true, fontSize: 15, customFonts: [] });
  await Promise.all([
    util.updateStoredSettings(mem.api, s => util.applySettingsPatch(s, {
      addFont: { id: 'f1', name: 'X', format: 'woff2', size: 1 }
    })),
    util.updateStoredSettings(mem.api, s => util.applySettingsPatch(s, {
      fields: { enabled: false }
    }))
  ]);
  assert.equal(mem.box.settings.enabled, false, 'toggle survived');
  assert.equal(mem.box.settings.fontSize, 15, 'unrelated size survived');
  assert.equal(mem.box.settings.customFonts.length, 1, 'font was added');
});

test('H01: removeFont drops metadata and site-override uses', () => {
  const stored = {
    font: 'custom:f1',
    customFonts: [{ id: 'f1', name: 'X' }, { id: 'f2', name: 'Y' }],
    siteOverrides: { gemini: { font: 'custom:f1', fontSize: 18 } }
  };
  util.applySettingsPatch(stored, { removeFont: 'f1' });
  assert.equal(stored.font, 'Vazirmatn');
  assert.equal(stored.customFonts.length, 1);
  assert.equal(stored.customFonts[0].id, 'f2');
  assert.equal(stored.siteOverrides.gemini.font, undefined);
  assert.equal(stored.siteOverrides.gemini.fontSize, 18);
});

test('H01: replace patch never writes a leftover syncVersion', () => {
  const stored = { enabled: true, syncVersion: 9 };
  util.applySettingsPatch(stored, { replace: { enabled: false, syncVersion: 12, fontSize: 18 } });
  assert.equal(stored.enabled, false);
  assert.equal(stored.fontSize, 18);
  assert.equal(stored.syncVersion, undefined);
});

test('H01: popup.js does not persist a full settings snapshot', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'popup.js'), 'utf8');
  assert.equal(src.includes('persistSettings(api, settings)'), false);
  assert.equal(/storage\.local\.set\(\s*\{\s*settings/.test(src), false);
  assert.ok(src.includes('HAMSOO_PATCH_SETTINGS'), 'popup must send patches to background');
});

test('H01: fonts.js does not persist a full settings snapshot', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'fonts.js'), 'utf8');
  assert.equal(src.includes('persistSettings(api, settings)'), false);
  assert.equal(/storage\.local\.set\(\s*\{\s*settings/.test(src), false);
  assert.ok(src.includes('HAMSOO_PATCH_SETTINGS'), 'fonts must send patches to background');
});

test('H01: background owns HAMSOO_PATCH_SETTINGS', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
  assert.ok(src.includes("msg.type === 'HAMSOO_PATCH_SETTINGS'"));
  assert.ok(src.includes('applySettingsPatch'));
});
