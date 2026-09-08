'use strict';
const fs = require('fs');
const path = require('path');
const util = require(path.join(__dirname, '..', 'src', 'shared', 'settings-util'));
const { test, assert } = require('./harness');

test('settings: diffSettingsFields extracts leaf changes for nested sites', () => {
  const acked = { sites: { gemini: true, chatgpt: true } };
  const local = { sites: { gemini: false, chatgpt: true } };
  const diff = util.diffSettingsFields(acked, local);
  assert.ok(diff.sites, 'must include sites diff');
  assert.equal(diff.sites.gemini, false);
  assert.equal(diff.sites.chatgpt, undefined, 'unchanged site must not be in diff');
});

test('settings: applySettingsPatch applies leaf changes without clobbering concurrent sibling sites', () => {
  const stored = { sites: { gemini: true, chatgpt: true } };
  // Client A disables gemini:
  const patchA = { fields: { sites: { gemini: false } } };
  // Client B concurrently disables chatgpt:
  const patchB = { fields: { sites: { chatgpt: false } } };

  util.applySettingsPatch(stored, patchA);
  util.applySettingsPatch(stored, patchB);

  assert.equal(stored.sites.gemini, false, 'gemini disabled');
  assert.equal(stored.sites.chatgpt, false, 'chatgpt disabled');
});

test('settings: applySettingsPatch handles siteOverrides at the leaf level', () => {
  const stored = {
    siteOverrides: {
      'chatgpt.com': { fontSize: 18 },
      'gemini.google.com': { font: 'Vazirmatn' }
    }
  };
  const patch = {
    fields: {
      siteOverrides: {
        'chatgpt.com': { fontSize: 20 }
      }
    }
  };
  util.applySettingsPatch(stored, patch);
  assert.equal(stored.siteOverrides['chatgpt.com'].fontSize, 20);
  assert.equal(stored.siteOverrides['gemini.google.com'].font, 'Vazirmatn', 'unrelated site override preserved');
});

test('settings: rebasePendingSettings preserves pending local edit while accepting sibling committed edits', () => {
  const acked = { sites: { gemini: true, chatgpt: true } };
  const local = { sites: { gemini: false, chatgpt: true } };
  const committed = { sites: { gemini: true, chatgpt: false } };

  const rebased = util.rebasePendingSettings(acked, local, committed);
  assert.equal(rebased.sites.gemini, false, 'local pending edit preserved');
  assert.equal(rebased.sites.chatgpt, false, 'committed sibling edit accepted');
});

test('settings: removeCustomSite in popup.js stops immediately on persistence failure', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'popup.js'), 'utf8');
  const start = src.indexOf('async function removeCustomSite(pattern)');
  const body = src.slice(start, start + 700);
  const savedIdx = body.indexOf('const saved = await persistNow()');
  const guardIdx = body.indexOf('if (!saved)');
  const pushIdx = body.indexOf('pushCustomSites()');
  const permIdx = body.indexOf('permissions.remove');
  assert.ok(savedIdx > 0, 'calls persistNow()');
  assert.ok(guardIdx > savedIdx, 'checks saved result');
  assert.ok(pushIdx > guardIdx, 'script push gated behind saved check');
  assert.ok(permIdx > guardIdx, 'permission revocation gated behind saved check');
});

test('messaging: sendSettingsPatch in popup.js dispatches runtime message exactly once', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'popup.js'), 'utf8');
  const start = src.indexOf('function sendSettingsPatch(patch)');
  const body = src.slice(start, start + 700);
  const matches = body.match(/\bapi\.runtime\.sendMessage\s*\(/g) || [];
  assert.equal(matches.length, 1, 'must dispatch message exactly once');
});
