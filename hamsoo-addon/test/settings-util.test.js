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

/* ---------- schema v3: onboarding + feedback-ask state ---------- */

const FIXED_NOW = 1700000000000;

test('migrateSettings v2->v3 seeds onboardedVersion at the current welcome version', () => {
  // An upgrading user has already been using Hamsoo, so the first-run tour must
  // not fire at them. Fresh installs start at 0 and never reach migrateSettings.
  const v2 = { enabled: true, schemaVersion: 2, syncVersion: 4 };
  const res = util.migrateSettings(v2, FIXED_NOW);
  assert.equal(res.changed, true);
  assert.equal(res.settings.schemaVersion, util.SCHEMA_VERSION);
  assert.equal(res.settings.onboardedVersion, util.WELCOME_VERSION);
  assert.ok(res.settings.onboardedVersion > 0, 'upgraders must not see the tour');
});

test('migrateSettings v2->v3 starts the feedback clock at the upgrade moment', () => {
  const res = util.migrateSettings({ schemaVersion: 2 }, FIXED_NOW);
  const support = res.settings.support;
  assert.equal(support.installedAt, FIXED_NOW);
  assert.equal(support.usageDays.length, 0);
  assert.equal(support.askCount, 0);
  assert.equal(support.snoozeUntil, 0);
  assert.equal(support.actedAt, 0);
  assert.equal(support.dismissedForever, false);
});

test('migrateSettings v2->v3 preserves every existing setting', () => {
  const v2 = {
    schemaVersion: 2, syncVersion: 9, enabled: false, font: 'Sahel', fontSize: 18,
    customSites: ['https://a.example/*'], siteOverrides: { chatgpt: { enabled: true, fontSize: 17 } }
  };
  const res = util.migrateSettings(v2, FIXED_NOW);
  assert.equal(res.settings.enabled, false);
  assert.equal(res.settings.font, 'Sahel');
  assert.equal(res.settings.fontSize, 18);
  assert.equal(res.settings.syncVersion, 9);
  assert.equal(res.settings.siteOverrides.chatgpt.fontSize, 17);
  assert.equal(JSON.stringify(res.settings.customSites), JSON.stringify(['https://a.example/*']));
});

test('migrateSettings v2->v3 does not overwrite an existing onboardedVersion', () => {
  const res = util.migrateSettings({ schemaVersion: 2, onboardedVersion: 0 }, FIXED_NOW);
  assert.equal(res.settings.onboardedVersion, 0);
});

test('migrateSettings is still a no-op once at v3', () => {
  const first = util.migrateSettings({ schemaVersion: 2 }, FIXED_NOW);
  const second = util.migrateSettings(first.settings, FIXED_NOW);
  assert.equal(second.changed, false);
  assert.equal(second.settings, first.settings);
});

test('normalizeOnboardedVersion clamps to the known welcome version', () => {
  assert.equal(util.normalizeOnboardedVersion(undefined), 0);
  assert.equal(util.normalizeOnboardedVersion(-3), 0);
  assert.equal(util.normalizeOnboardedVersion('nope'), 0);
  assert.equal(util.normalizeOnboardedVersion(1), 1);
  // A crafted backup claiming a future version must not suppress the tour.
  assert.equal(util.normalizeOnboardedVersion(99), util.WELCOME_VERSION);
});

test('dayKey renders a zero-padded local calendar day', () => {
  const key = util.dayKey(new Date(2026, 0, 5, 13, 30).getTime());
  assert.equal(key, '2026-01-05');
  // Two moments in the same local day must produce the same key, or a single
  // day of use would be counted twice.
  const a = util.dayKey(new Date(2026, 6, 9, 0, 1).getTime());
  const b = util.dayKey(new Date(2026, 6, 9, 23, 59).getTime());
  assert.equal(a, b);
});

test('clampTimestamp rejects non-finite, negative and zero values', () => {
  assert.equal(util.clampTimestamp(FIXED_NOW), FIXED_NOW);
  assert.equal(util.clampTimestamp(-5), 0);
  assert.equal(util.clampTimestamp(0), 0);
  assert.equal(util.clampTimestamp('x'), 0);
  assert.equal(util.clampTimestamp(Infinity), 0);
  assert.equal(util.clampTimestamp(12.7), 12);
});

test('normalizeSupport drops malformed usage days and dedupes the rest', () => {
  const s = util.normalizeSupport({
    usageDays: ['2026-07-09', '2026-07-09', 'yesterday', '2026-7-9', 42, null, '2026-07-10']
  }, FIXED_NOW);
  assert.equal(JSON.stringify(s.usageDays), JSON.stringify(['2026-07-09', '2026-07-10']));
});

test('normalizeSupport caps the usage-day window and keeps the most recent', () => {
  const days = [];
  for (let i = 1; i <= 20; i += 1) days.push('2026-03-' + String(i).padStart(2, '0'));
  const s = util.normalizeSupport({ usageDays: days }, FIXED_NOW);
  assert.equal(s.usageDays.length, util.SUPPORT_USAGE_DAYS_CAP);
  assert.equal(s.usageDays[s.usageDays.length - 1], '2026-03-20');
  // The cap must never sit below the eligibility threshold, or the ask could
  // never fire at all.
  assert.ok(util.SUPPORT_USAGE_DAYS_CAP >= util.SUPPORT_MIN_USAGE_DAYS);
});

test('normalizeSupport clamps askCount to the lifetime cap', () => {
  assert.equal(util.normalizeSupport({ askCount: 99 }, FIXED_NOW).askCount, util.SUPPORT_MAX_ASKS);
  assert.equal(util.normalizeSupport({ askCount: -4 }, FIXED_NOW).askCount, 0);
  assert.equal(util.normalizeSupport({ askCount: 'x' }, FIXED_NOW).askCount, 0);
  assert.equal(util.normalizeSupport({ askCount: 1 }, FIXED_NOW).askCount, 1);
});

test('normalizeSupport treats having acted as a permanent opt-out', () => {
  const s = util.normalizeSupport({ actedAt: FIXED_NOW, dismissedForever: false }, FIXED_NOW);
  assert.equal(s.dismissedForever, true);
});

test('normalizeSupport falls back to the injected now for installedAt', () => {
  assert.equal(util.normalizeSupport({}, FIXED_NOW).installedAt, FIXED_NOW);
  assert.equal(util.normalizeSupport({ installedAt: 500 }, FIXED_NOW).installedAt, 500);
  assert.equal(util.normalizeSupport({ installedAt: -1 }, FIXED_NOW).installedAt, FIXED_NOW);
});

test('getSlimSettingsForSync keeps the shareable support fields only', () => {
  const slim = util.getSlimSettingsForSync({
    font: 'Vazirmatn',
    support: {
      installedAt: FIXED_NOW,
      usageDays: ['2026-07-09', '2026-07-10'],
      askCount: 1,
      snoozeUntil: FIXED_NOW,
      dismissedForever: true,
      actedAt: 0
    }
  });
  // Local facts must not travel: a long-standing install would otherwise make a
  // brand-new device look immediately eligible.
  assert.equal(slim.support.installedAt, undefined);
  assert.equal(slim.support.usageDays, undefined);
  // The decision itself does travel.
  assert.equal(slim.support.dismissedForever, true);
  assert.equal(slim.support.askCount, 1);
  assert.equal(slim.support.snoozeUntil, FIXED_NOW);
});

test('getSlimSettingsForSync does not mutate the settings it is given', () => {
  const full = { support: { installedAt: FIXED_NOW, usageDays: ['2026-07-09'] } };
  util.getSlimSettingsForSync(full);
  assert.equal(full.support.installedAt, FIXED_NOW);
  assert.equal(full.support.usageDays.length, 1);
});

test('mergeSupport keeps local engagement and unions the opt-out', () => {
  const local = {
    installedAt: FIXED_NOW,
    usageDays: ['2026-07-08', '2026-07-09', '2026-07-10'],
    askCount: 0,
    snoozeUntil: 0,
    dismissedForever: false,
    actedAt: 0
  };
  // What actually arrives from storage.sync: the slim half, no local facts.
  const remote = { askCount: 2, snoozeUntil: FIXED_NOW + 1000, dismissedForever: true };
  const merged = util.mergeSupport(local, remote);
  assert.equal(merged.installedAt, FIXED_NOW);
  assert.equal(merged.usageDays.length, 3);
  assert.equal(merged.dismissedForever, true);
  assert.equal(merged.askCount, 2);
  assert.equal(merged.snoozeUntil, FIXED_NOW + 1000);
});

test('mergeSupport never lowers a local askCount or snooze', () => {
  const local = { askCount: 2, snoozeUntil: FIXED_NOW + 5000, installedAt: FIXED_NOW };
  const merged = util.mergeSupport(local, { askCount: 0, snoozeUntil: 0 });
  assert.equal(merged.askCount, 2);
  assert.equal(merged.snoozeUntil, FIXED_NOW + 5000);
});

test('mergeSupport records the earliest moment the user acted', () => {
  const merged = util.mergeSupport({ actedAt: FIXED_NOW }, { actedAt: FIXED_NOW - 9000 });
  assert.equal(merged.actedAt, FIXED_NOW - 9000);
  assert.equal(merged.dismissedForever, true);
});

test('mergeSupport tolerates missing objects on either side', () => {
  assert.equal(util.mergeSupport(undefined, undefined).askCount, 0);
  assert.equal(util.mergeSupport(null, { dismissedForever: true }).dismissedForever, true);
});

test('support survives a full slim sync round-trip', () => {
  // The regression this design exists to prevent: a newer remote copy carries no
  // installedAt or usageDays, so a plain overwrite would erase this device's
  // earned engagement and restart the seven-day clock.
  const local = {
    font: 'Sahel',
    syncVersion: 1,
    onboardedVersion: 1,
    support: {
      installedAt: FIXED_NOW - 30 * util.DAY_MS,
      usageDays: ['2026-07-08', '2026-07-09', '2026-07-10'],
      askCount: 0,
      snoozeUntil: 0,
      dismissedForever: false,
      actedAt: 0
    }
  };
  const remote = util.getSlimSettingsForSync({
    font: 'Estedad',
    syncVersion: 2,
    onboardedVersion: 1,
    support: {
      installedAt: FIXED_NOW,
      usageDays: ['2026-07-01'],
      askCount: 1,
      snoozeUntil: 0,
      dismissedForever: true,
      actedAt: 0
    }
  });
  const merged = util.mergeSyncedSettings(local, remote);
  assert.equal(merged.font, 'Estedad', 'ordinary settings still follow the newer copy');
  assert.equal(merged.support.installedAt, FIXED_NOW - 30 * util.DAY_MS);
  assert.equal(merged.support.usageDays.length, 3);
  assert.equal(merged.support.dismissedForever, true);
  assert.equal(merged.support.askCount, 1);
});

test('mergeSyncedSettings keeps the higher onboardedVersion', () => {
  // Seen on any device counts as seen. Taking the LOWER value (the original
  // behavior) meant a slim or freshly installed remote copy -- where the field
  // is 0 or missing entirely -- dragged a fully onboarded device back to 0 on
  // every pull, permanently corrupting the marker. Tour auto-open is
  // install-only, so nothing re-shows the tour; the state just went wrong.
  const merged = util.mergeSyncedSettings({ onboardedVersion: 0 }, { onboardedVersion: 1 });
  assert.equal(merged.onboardedVersion, 1);
  const both = util.mergeSyncedSettings({ onboardedVersion: 1 }, { onboardedVersion: 1 });
  assert.equal(both.onboardedVersion, 1);
  // The regression case: an onboarded device pulling a slim remote copy.
  const slimRemote = util.mergeSyncedSettings({ onboardedVersion: 1 }, {});
  assert.equal(slimRemote.onboardedVersion, 1, 'a remote copy without the field must not reset it');
  const zeroRemote = util.mergeSyncedSettings({ onboardedVersion: 1 }, { onboardedVersion: 0 });
  assert.equal(zeroRemote.onboardedVersion, 1, 'a fresh remote install must not reset it');
});

test('mergeSyncedSettings unions customSelectors instead of overwriting', () => {
  // An empty remote map used to erase every pick another device had made,
  // because the plain key-by-key overwrite treated {} as an authoritative value.
  const wiped = util.mergeSyncedSettings(
    { customSelectors: { 'a.com': ['div.x'] } },
    { customSelectors: {} }
  );
  assert.equal(JSON.stringify(wiped.customSelectors), JSON.stringify({ 'a.com': ['div.x'] }),
    'empty remote must not wipe local picks');

  const unioned = util.mergeSyncedSettings(
    { customSelectors: { 'a.com': ['div.x'], 'b.com': ['p.y'] } },
    { customSelectors: { 'a.com': ['div.x', 'span.z'] } }
  );
  assert.equal(JSON.stringify(unioned.customSelectors['a.com']), JSON.stringify(['div.x', 'span.z']),
    'per-host lists union and dedupe');
  assert.equal(JSON.stringify(unioned.customSelectors['b.com']), JSON.stringify(['p.y']),
    'hosts absent from remote survive');
});

test('isValidMatchPattern rejects registry-wide wildcards', () => {
  // A crafted import could otherwise request host permissions over a whole TLD.
  assert.equal(util.isValidMatchPattern('https://*.com/*'), false, 'bare TLD wildcard');
  assert.equal(util.isValidMatchPattern('https://*.co.uk/*'), false, 'multi-label registry wildcard');
  assert.equal(util.isValidMatchPattern('https://*.example.com/*'), true, 'a real site wildcard still works');
  assert.equal(util.isValidMatchPattern('https://chatgpt.com/*'), true, 'plain hosts unaffected');
  assert.equal(util.sanitizeMatchPatterns(['https://*.com/*', 'https://ok.com/*']).length, 1);
});

test('normalizeDigitsScript is case-insensitive', () => {
  // A hand-edited backup carrying 'AR' silently ran Persian digits.
  assert.equal(util.normalizeDigitsScript('AR'), 'ar');
  assert.equal(util.normalizeDigitsScript(' Ar '), 'ar');
  assert.equal(util.normalizeDigitsScript('fa'), 'fa');
  assert.equal(util.normalizeDigitsScript(undefined), 'fa');
});

test('persistSettings surfaces sync failures instead of swallowing them', async () => {
  // The local write is still authoritative, so the call resolves true -- but a
  // rejected or over-quota sync mirror must be reported, not reported as success.
  const seen = [];
  const api = {
    storage: {
      local: { set: async () => {} },
      sync: { set: async () => { throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded'); } }
    }
  };
  const ok = await util.persistSettings(api, { enabled: true }, { onSyncError: e => seen.push(e) });
  assert.equal(ok, true, 'a sync failure does not fail the local save');
  assert.equal(seen.length, 1, 'the failure is reported');
  assert.equal(seen[0].kind, 'write');
  assert.ok(util.getLastSyncError(), 'the failure is recorded for the UI');
});

test('persistSettings refuses to mirror a payload over the sync item quota', async () => {
  const seen = [];
  let mirrored = false;
  const api = {
    storage: {
      local: { set: async () => {} },
      sync: { set: async () => { mirrored = true; } }
    }
  };
  const fat = { enabled: true, customSelectors: {} };
  for (let i = 0; i < 120; i += 1) {
    fat.customSelectors['example-site-' + i + '.com'] =
      ['div.message-bubble-container.prose-wrapper-' + i, 'article.chat-turn__body--assistant-' + i];
  }
  assert.ok(util.estimateSyncBytes(fat) > util.SYNC_QUOTA_BYTES_PER_ITEM, 'probe payload exceeds the quota');
  await util.persistSettings(api, fat, { onSyncError: e => seen.push(e) });
  assert.equal(mirrored, false, 'an over-quota payload is not sent');
  assert.equal(seen[0].kind, 'quota');
});

/* ---------- Phase 3: the serialized write funnel ---------- */

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

// Storage that actually takes time to read and write, which is what makes the
// lost-update race reproducible. A synchronous fake would pass either way.
function slowStorage(initial) {
  const box = { settings: JSON.parse(JSON.stringify(initial)) };
  return {
    box,
    api: {
      storage: {
        local: {
          get: async () => { await tick(); return JSON.parse(JSON.stringify(box)); },
          set: async obj => { await tick(); box.settings = JSON.parse(JSON.stringify(obj.settings)); }
        }
      }
    }
  };
}

test('updateStoredSettings serializes concurrent writes instead of losing one', async () => {
  // Two writers touching DIFFERENT fields, started in the same tick. With a
  // plain get -> mutate -> set both read the same snapshot and the second set
  // erased the first one's field.
  const { api, box } = slowStorage({ syncVersion: 0 });
  await Promise.all([
    util.updateStoredSettings(api, s => { s.enabled = false; }),
    util.updateStoredSettings(api, s => { s.lang = 'fa'; })
  ]);
  assert.equal(box.settings.enabled, false, 'the first writer survived');
  assert.equal(box.settings.lang, 'fa', 'the second writer survived');
  assert.equal(box.settings.syncVersion, 2, 'both writes bumped the counter');
});

test('updateStoredSettings mutators observe the previous write', async () => {
  const { api, box } = slowStorage({ syncVersion: 0, count: 0 });
  await Promise.all([
    util.updateStoredSettings(api, s => { s.count += 1; }),
    util.updateStoredSettings(api, s => { s.count += 1; }),
    util.updateStoredSettings(api, s => { s.count += 1; })
  ]);
  assert.equal(box.settings.count, 3, 'no increment was lost to a stale read');
});

test('updateStoredSettings skips the write when the mutator declines', async () => {
  let writes = 0;
  const box = { settings: { lang: 'fa', syncVersion: 3 } };
  const api = {
    storage: {
      local: {
        get: async () => JSON.parse(JSON.stringify(box)),
        set: async obj => { writes += 1; box.settings = obj.settings; }
      }
    }
  };
  const res = await util.updateStoredSettings(api, s => (s.lang === 'fa' ? false : undefined));
  assert.equal(res, null, 'a declined mutation resolves null');
  assert.equal(writes, 0, 'no write was issued');
  assert.equal(box.settings.syncVersion, 3, 'the counter was not bumped');
});

test('a failed write does not wedge the queue for later writers', async () => {
  let calls = 0;
  const box = { settings: {} };
  const api = {
    storage: {
      local: {
        get: async () => JSON.parse(JSON.stringify(box)),
        set: async obj => {
          calls += 1;
          if (calls === 1) throw new Error('disk full');
          box.settings = obj.settings;
        }
      }
    }
  };
  let failed = false;
  try {
    await util.updateStoredSettings(api, s => { s.enabled = true; });
  } catch (_) { failed = true; }
  assert.equal(failed, true, 'the failing write rejects');
  await util.updateStoredSettings(api, s => { s.lang = 'en'; });
  assert.equal(box.settings.lang, 'en', 'a later write still goes through');
});

test('persistSettings localOnly writes local without mirroring to sync', async () => {
  // Usage days and install age are per-device and stripped from the slim
  // payload, so mirroring them is a pure round-trip cost.
  let wrote = false;
  let mirrored = false;
  const api = {
    storage: {
      local: { set: async () => { wrote = true; } },
      sync: { set: async () => { mirrored = true; } }
    }
  };
  await util.persistSettings(api, { support: { usageDays: ['2026-07-29'] } }, { localOnly: true, bump: false });
  assert.equal(wrote, true, 'the local write still happens');
  assert.equal(mirrored, false, 'per-device data is not mirrored to sync');
});

/* ---------- Phase 2: feedback ask ---------- */

// A profile that satisfies every condition, so each test can break exactly one.
function eligibleSettings(now) {
  return {
    enabled: true,
    support: {
      installedAt: now - 30 * util.DAY_MS,
      usageDays: ['2026-07-08', '2026-07-09', '2026-07-10'],
      askCount: 0,
      snoozeUntil: 0,
      dismissedForever: false,
      actedAt: 0
    }
  };
}

test('the reference profile is eligible', () => {
  const d = util.supportAskDecision(eligibleSettings(FIXED_NOW), FIXED_NOW);
  assert.equal(d.ask, true);
  assert.equal(d.reason, 'eligible');
  assert.equal(util.shouldAskForSupport(eligibleSettings(FIXED_NOW), FIXED_NOW), true);
});

test('a user who switched Hamsoo off is never asked', () => {
  const s = eligibleSettings(FIXED_NOW);
  s.enabled = false;
  const d = util.supportAskDecision(s, FIXED_NOW);
  assert.equal(d.ask, false);
  assert.equal(d.reason, 'disabled');
});

test('a permanent dismissal is respected forever', () => {
  const s = eligibleSettings(FIXED_NOW);
  s.support.dismissedForever = true;
  assert.equal(util.supportAskDecision(s, FIXED_NOW).reason, 'dismissed');
});

test('someone who already acted is never asked again', () => {
  const s = eligibleSettings(FIXED_NOW);
  s.support.actedAt = FIXED_NOW - util.DAY_MS;
  assert.equal(util.supportAskDecision(s, FIXED_NOW).reason, 'dismissed');
});

test('an active snooze suppresses the ask, and expires on its own', () => {
  const s = eligibleSettings(FIXED_NOW);
  s.support.snoozeUntil = FIXED_NOW + util.DAY_MS;
  assert.equal(util.supportAskDecision(s, FIXED_NOW).reason, 'snoozed');
  // One millisecond past the snooze it becomes eligible again.
  assert.equal(util.supportAskDecision(s, FIXED_NOW + util.DAY_MS + 1).reason, 'eligible');
});

test('a fresh install is not asked before the minimum age', () => {
  const s = eligibleSettings(FIXED_NOW);
  s.support.installedAt = FIXED_NOW - (util.SUPPORT_MIN_INSTALL_AGE_DAYS * util.DAY_MS - 1);
  assert.equal(util.supportAskDecision(s, FIXED_NOW).reason, 'tooNew');
  // Exactly at the boundary it qualifies.
  s.support.installedAt = FIXED_NOW - util.SUPPORT_MIN_INSTALL_AGE_DAYS * util.DAY_MS;
  assert.equal(util.supportAskDecision(s, FIXED_NOW).reason, 'eligible');
});

test('a clock skewed backwards reads as too new, never as eligible', () => {
  const s = eligibleSettings(FIXED_NOW);
  s.support.installedAt = FIXED_NOW + 90 * util.DAY_MS;
  assert.equal(util.supportAskDecision(s, FIXED_NOW).reason, 'tooNew');
});

test('too few usage days blocks the ask', () => {
  const s = eligibleSettings(FIXED_NOW);
  s.support.usageDays = ['2026-07-08', '2026-07-09'];
  assert.equal(util.supportAskDecision(s, FIXED_NOW).reason, 'notEngaged');
  s.support.usageDays = [];
  assert.equal(util.supportAskDecision(s, FIXED_NOW).reason, 'notEngaged');
});

test('long installation cannot substitute for engagement', () => {
  // The two conditions are independent: five years installed but never actually
  // applied must still not trigger an ask.
  const s = eligibleSettings(FIXED_NOW);
  s.support.installedAt = FIXED_NOW - 1825 * util.DAY_MS;
  s.support.usageDays = ['2026-07-10'];
  assert.equal(util.supportAskDecision(s, FIXED_NOW).reason, 'notEngaged');
});

test('supportAskDecision tolerates junk input', () => {
  assert.equal(util.supportAskDecision(null, FIXED_NOW).ask, false);
  assert.equal(util.supportAskDecision({}, FIXED_NOW).ask, false);
  assert.equal(util.shouldAskForSupport(undefined, FIXED_NOW), false);
});

test('recordUsageDay adds today exactly once', () => {
  const first = util.recordUsageDay({ installedAt: FIXED_NOW }, FIXED_NOW);
  assert.equal(first.changed, true);
  assert.equal(first.support.usageDays.length, 1);
  assert.equal(first.support.usageDays[0], util.dayKey(FIXED_NOW));
  // Second page load the same day must not report a change, or the background
  // would write to storage on every single page view.
  const second = util.recordUsageDay(first.support, FIXED_NOW);
  assert.equal(second.changed, false);
  assert.equal(second.support.usageDays.length, 1);
});

test('recordUsageDay accumulates across days and honors the cap', () => {
  let support = { installedAt: FIXED_NOW };
  for (let i = 0; i < 15; i += 1) {
    support = util.recordUsageDay(support, FIXED_NOW + i * util.DAY_MS).support;
  }
  assert.equal(support.usageDays.length, util.SUPPORT_USAGE_DAYS_CAP);
  // The most recent day is kept, the oldest are dropped.
  assert.equal(
    support.usageDays[support.usageDays.length - 1],
    util.dayKey(FIXED_NOW + 14 * util.DAY_MS)
  );
});

test('three days of real use makes a week-old install eligible', () => {
  // The end-to-end path the feature actually depends on.
  const installedAt = FIXED_NOW - 8 * util.DAY_MS;
  let support = { installedAt: installedAt };
  support = util.recordUsageDay(support, FIXED_NOW - 2 * util.DAY_MS).support;
  support = util.recordUsageDay(support, FIXED_NOW - util.DAY_MS).support;
  assert.equal(util.supportAskDecision({ enabled: true, support: support }, FIXED_NOW).reason, 'notEngaged');
  support = util.recordUsageDay(support, FIXED_NOW).support;
  assert.equal(util.supportAskDecision({ enabled: true, support: support }, FIXED_NOW).reason, 'eligible');
});

test('Later snoozes for the configured window and counts as one ask', () => {
  const s = eligibleSettings(FIXED_NOW);
  const snoozed = util.snoozeSupport(s.support, FIXED_NOW);
  assert.equal(snoozed.askCount, 1);
  assert.equal(snoozed.snoozeUntil, FIXED_NOW + util.SUPPORT_SNOOZE_DAYS * util.DAY_MS);
  assert.equal(snoozed.dismissedForever, false);
  assert.equal(util.supportAskDecision({ enabled: true, support: snoozed }, FIXED_NOW).reason, 'snoozed');
});

test('two Laters exhaust the lifetime cap and end the asking', () => {
  const s = eligibleSettings(FIXED_NOW);
  const after1 = util.snoozeSupport(s.support, FIXED_NOW);
  const later = FIXED_NOW + (util.SUPPORT_SNOOZE_DAYS + 1) * util.DAY_MS;
  // The snooze has expired, so the second ask is allowed.
  assert.equal(util.supportAskDecision({ enabled: true, support: after1 }, later).reason, 'eligible');
  const after2 = util.snoozeSupport(after1, later);
  assert.equal(after2.askCount, util.SUPPORT_MAX_ASKS);
  const muchLater = later + 3650 * util.DAY_MS;
  // Even years afterwards, with the snooze long expired, the cap holds.
  assert.equal(util.supportAskDecision({ enabled: true, support: after2 }, muchLater).reason, 'askCap');
});

test('Don\u2019t show again is permanent', () => {
  const s = eligibleSettings(FIXED_NOW);
  const dismissed = util.dismissSupportForever(s.support, FIXED_NOW);
  assert.equal(dismissed.dismissedForever, true);
  const muchLater = FIXED_NOW + 3650 * util.DAY_MS;
  assert.equal(util.supportAskDecision({ enabled: true, support: dismissed }, muchLater).reason, 'dismissed');
});

test('acting on the ask records the moment and stops all future asks', () => {
  const s = eligibleSettings(FIXED_NOW);
  const acted = util.markSupportActed(s.support, FIXED_NOW);
  assert.equal(acted.actedAt, FIXED_NOW);
  assert.equal(acted.dismissedForever, true);
  // And it survives a normalize round-trip, which every read performs.
  const reread = util.normalizeSupport(JSON.parse(JSON.stringify(acted)), FIXED_NOW);
  assert.equal(reread.dismissedForever, true);
  assert.equal(util.supportAskDecision({ enabled: true, support: reread }, FIXED_NOW).reason, 'dismissed');
});

test('a dismissal on one device silences the ask on the other', () => {
  // The cross-device promise: dismissing travels, engagement does not.
  const local = eligibleSettings(FIXED_NOW);
  local.syncVersion = 1;
  const remoteFull = eligibleSettings(FIXED_NOW);
  remoteFull.syncVersion = 2;
  remoteFull.support = util.dismissSupportForever(remoteFull.support, FIXED_NOW);
  const merged = util.mergeSyncedSettings(local, util.getSlimSettingsForSync(remoteFull));
  assert.equal(util.supportAskDecision(merged, FIXED_NOW).reason, 'dismissed');
  // The local engagement record is still intact after the merge.
  assert.equal(merged.support.usageDays.length, 3);
});

test('the ask destination follows the build target', () => {
  const firefoxManifest = { browser_specific_settings: { gecko: { id: 'hamsoo@naxonm.github.io' } } };
  assert.equal(util.supportTargetFromManifest(firefoxManifest), 'firefox');
  assert.equal(util.supportTargetFromManifest({ background: { service_worker: 'background.js' } }), 'chromium');
  // Anything unrecognizable falls back to the target with no store listing.
  assert.equal(util.supportTargetFromManifest(null), 'chromium');
  assert.equal(util.supportTargetFromManifest({ browser_specific_settings: {} }), 'chromium');
});

test('Firefox is pointed at AMO reviews and Chromium at the repo', () => {
  assert.equal(util.supportActionUrl('firefox'), util.SUPPORT_AMO_REVIEW_URL);
  assert.equal(util.supportActionUrl('chromium'), util.SUPPORT_REPO_URL);
  assert.ok(util.SUPPORT_AMO_REVIEW_URL.indexOf('addons.mozilla.org') !== -1);
  // No Chrome Web Store listing exists, so the Chromium ask must be the repo.
  assert.ok(util.SUPPORT_REPO_URL.indexOf('github.com') !== -1);
  assert.ok(util.SUPPORT_ISSUE_URL.indexOf('/issues/new') !== -1);
});

/* ---------- email feedback ---------- */

// The body is not always the second parameter: with no subject it is the first,
// so it is preceded by '?' rather than '&'. Match either.
function mailtoBody(url) {
  const match = /[?&]body=([^&]*)/.exec(url);
  return match ? decodeURIComponent(match[1]) : '';
}

test('buildFeedbackMailto targets the published address by default', () => {
  const url = util.buildFeedbackMailto({});
  assert.ok(url.indexOf('mailto:' + util.SUPPORT_EMAIL) === 0, 'starts with the mailto target');
  assert.equal(util.SUPPORT_EMAIL, 'hamsoo@bellamor.ir');
});

test('buildFeedbackMailto encodes the subject and body', () => {
  const url = util.buildFeedbackMailto({
    subject: 'Hamsoo & RTL',
    intro: 'line one',
    details: { version: '1.3.0' }
  });
  // A raw '&' would end the subject parameter and swallow the body; a raw
  // newline is rejected outright by some mail clients.
  assert.ok(url.indexOf('subject=Hamsoo%20%26%20RTL') !== -1, 'subject is encoded');
  assert.ok(url.indexOf('&body=') !== -1, 'body is a separate parameter');
  assert.ok(url.indexOf('%0A') !== -1, 'newlines are encoded');
  assert.ok(url.indexOf('\n') === -1, 'no raw newline survives');
});

test('buildFeedbackMailto writes the details in a fixed order', () => {
  const url = util.buildFeedbackMailto({
    details: { site: 'chat.openai.com', language: 'fa', browser: 'chromium', version: '1.3.0' }
  });
  const body = mailtoBody(url);
  assert.equal(body.indexOf('version: 1.3.0') !== -1, true);
  assert.ok(body.indexOf('version:') < body.indexOf('browser:'), 'version precedes browser');
  assert.ok(body.indexOf('browser:') < body.indexOf('language:'), 'browser precedes language');
  assert.ok(body.indexOf('language:') < body.indexOf('site:'), 'language precedes site');
});

test('buildFeedbackMailto only ever sends whitelisted details', () => {
  // Hamsoo promises nothing leaves the device unread by the user, so an extra
  // key must not be able to smuggle itself into an outgoing message.
  // 'settings' became an allowed field in Phase 3, but only as the short digest
  // built by settingsDigest() -- never a raw settings blob, which is why the
  // bait below is a full JSON dump under an unlisted key.
  const url = util.buildFeedbackMailto({
    details: {
      version: '1.3.0',
      settings: 'hamsoo on, font',
      customFonts: 'secret.ttf',
      siteOverrides: '{"all":"of it"}'
    }
  });
  const body = mailtoBody(url);
  assert.ok(body.indexOf('version: 1.3.0') !== -1, 'the allowed key is present');
  assert.ok(body.indexOf('settings: hamsoo on, font') !== -1, 'the digest is allowed');
  assert.ok(body.indexOf('secret.ttf') === -1, 'unknown keys are dropped');
  assert.ok(body.indexOf('all') === -1, 'unknown keys are dropped');
});

test('buildFeedbackMailto omits empty and non-scalar details', () => {
  const url = util.buildFeedbackMailto({
    intro: 'hello',
    details: { version: '', browser: '   ', language: null, site: { host: 'x' } }
  });
  const body = mailtoBody(url);
  assert.equal(body, 'hello\n\n');
  assert.ok(body.indexOf('undefined') === -1, 'no undefined leaks into the body');
  assert.ok(body.indexOf('[object') === -1, 'no stringified object leaks into the body');
});

test('buildFeedbackMailto survives junk input', () => {
  assert.equal(util.buildFeedbackMailto(null), 'mailto:' + util.SUPPORT_EMAIL);
  assert.equal(util.buildFeedbackMailto(undefined), 'mailto:' + util.SUPPORT_EMAIL);
  assert.equal(util.buildFeedbackMailto({ email: '' }), 'mailto:' + util.SUPPORT_EMAIL);
});

/* ---------- help view: settings digest and issue prefill ---------- */

test('settingsDigest lists only the toggles that change rendering', () => {
  const d = util.settingsDigest({ enabled: true, fontEnabled: true, readabilityEnabled: true, digitsEnabled: false, punctuationFixEnabled: true });
  assert.equal(d, 'hamsoo on, font + readability + punctuation');
});

test('settingsDigest reports a disabled extension in one word', () => {
  assert.equal(util.settingsDigest({ enabled: false, fontEnabled: true }), 'hamsoo off');
});

test('settingsDigest names the digit script only when digits are on', () => {
  const on = util.settingsDigest({ digitsEnabled: true, digitsScript: 'ar' });
  const off = util.settingsDigest({ digitsEnabled: false, digitsScript: 'ar' });
  assert(on.indexOf('digits:ar') !== -1, 'script should be named when digits are on');
  assert(off.indexOf('digits') === -1, 'digits must not appear when off');
});

// The digest is sent to a stranger, so it must not carry anything identifying.
test('settingsDigest never leaks font names or the site list', () => {
  const d = util.settingsDigest({
    enabled: true,
    font: 'custom:x',
    customFonts: [{ id: 'x', name: 'MySecretFont.ttf' }],
    customSites: ['https://private.example/*']
  });
  assert(d.indexOf('MySecretFont') === -1, 'font filename must not appear');
  assert(d.indexOf('private.example') === -1, 'site list must not appear');
});

test('settingsDigest tolerates junk input', () => {
  assert(typeof util.settingsDigest(null) === 'string', 'null is a string');
  assert(typeof util.settingsDigest('nope') === 'string', 'string is a string');
});

test('buildIssueUrl encodes characters that would truncate the body', () => {
  const url = util.buildIssueUrl({ title: '[bug] #1 & co', body: 'line one\nline two' });
  assert(url.indexOf('%23') !== -1, 'hash must be encoded');
  assert(url.indexOf('%26') !== -1, 'ampersand must be encoded');
  assert(url.indexOf('\n') === -1, 'no raw newline in a URL');
});

test('buildIssueUrl carries the template and the bug label', () => {
  const url = util.buildIssueUrl({ template: util.SUPPORT_ISSUE_TEMPLATE, labels: 'bug', title: 'x' });
  assert(url.indexOf('template=bug_report.md') !== -1, 'template param present');
  assert(url.indexOf('labels=bug') !== -1, 'label param present');
  assert(url.indexOf(util.SUPPORT_ISSUE_URL) === 0, 'points at the new-issue page');
});

test('buildIssueUrl with no options is the plain new-issue page', () => {
  assert.equal(util.buildIssueUrl(), util.SUPPORT_ISSUE_URL);
  assert.equal(util.buildIssueUrl(null), util.SUPPORT_ISSUE_URL);
});

test('buildIssueBody applies the same whitelist as the email', () => {
  const body = util.buildIssueBody({
    intro: 'what happened?',
    steps: ['steps:', 'expected:'],
    details: {
      version: '1.3.0', browser: 'chromium', language: 'fa',
      site: 'chatgpt.com', settings: 'hamsoo on, font',
      customFonts: 'SECRETFONT.ttf', token: 'nope'
    }
  });
  assert(body.indexOf('SECRETFONT.ttf') === -1, 'unlisted keys must be dropped');
  assert(body.indexOf('token') === -1, 'unlisted keys must be dropped');
  assert(body.indexOf('settings: hamsoo on, font') !== -1, 'digest must be included');
  const order = ['version:', 'browser:', 'language:', 'site:', 'settings:'].map(k => body.indexOf(k));
  assert(order.every((v, i) => v !== -1 && (i === 0 || v > order[i - 1])), 'details in fixed order');
});

// The two channels must never disagree about what an outgoing report contains.
test('the email and the issue prefill share one detail whitelist', () => {
  assert.equal(util.REPORT_DETAIL_KEYS.join(','), 'version,browser,language,site,settings');
});
