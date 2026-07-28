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

test('i18n ar dictionary matches fa keys and resolveLang resolves ar', () => {
  const fa = dict('fa');
  const ar = dict('ar');
  const miss = fa.filter(k => !ar.includes(k));
  assert.equal(miss.length, 0, 'fa keys missing from ar: ' + miss);

  // Evaluate resolveLang in Node context
  globalThis.browser = undefined;
  globalThis.chrome = undefined;
  require(path.join(__dirname, '..', 'src', 'i18n.js'));
  assert.equal(globalThis.HamsooI18n.resolveLang('ar'), 'ar');
  assert.equal(globalThis.HamsooI18n.resolveLang('fa'), 'fa');
  assert.equal(globalThis.HamsooI18n.resolveLang('en'), 'en');
});

test('language falls back to the timezone when the UI language is not Persian', () => {
  globalThis.browser = undefined;
  globalThis.chrome = undefined;
  require(path.join(__dirname, '..', 'src', 'i18n.js'));
  const f = globalThis.HamsooI18n.langFromLocaleAndZone;

  // The case that made the welcome tour open in English for Iranian users:
  // Firefox and Chrome both ship to Iran with an en-US interface.
  assert.equal(f('en-US', 'Asia/Tehran'), 'fa', 'en-US in Tehran');
  assert.equal(f('', 'Iran'), 'fa', 'legacy zone alias');
  assert.equal(f('en-US', 'Europe/Berlin'), 'en', 'en-US abroad stays English');

  // An explicit UI language is the stronger signal, so the timezone must never
  // override it -- otherwise an Arabic speaker in Tehran gets Persian.
  assert.equal(f('ar-EG', 'Asia/Tehran'), 'ar', 'Arabic UI in Tehran stays Arabic');
  assert.equal(f('fa-IR', 'America/New_York'), 'fa', 'Persian UI abroad stays Persian');
  assert.equal(f('de-DE', 'Europe/Berlin'), 'en', 'unmapped language falls back to English');

  // Missing or unreadable zone must not throw or guess.
  assert.equal(f('en-US', ''), 'en', 'no zone available');
  assert.equal(f(null, null), 'en', 'nothing available');

  // A stored choice outranks both signals: resolveLang returns before either is
  // consulted, which is what makes the language switch stick.
  assert.equal(globalThis.HamsooI18n.resolveLang('en'), 'en', 'stored en wins');
  assert.equal(globalThis.HamsooI18n.resolveLang('ar'), 'ar', 'stored ar wins');
});

test('lang-init.js carries the same timezone rule as i18n.js', () => {
  const init = fs.readFileSync(path.join(__dirname, '..', 'src', 'lang-init.js'), 'utf8');
  // lang-init.js runs before first paint and before the dictionary exists, so it
  // cannot call langFromLocaleAndZone and has to carry a copy of the rule. If the
  // two drift, a page paints in one language and then visibly flips to another --
  // which is the exact flash lang-init.js was added to prevent.
  const rule = /\/\^\(Asia\\\/Tehran\|Iran\)\$\/i/;
  assert.ok(rule.test(init), 'lang-init.js still carries the Iran zone rule');
  assert.ok(rule.test(src), 'i18n.js still carries the Iran zone rule');
  for (const file of [init, src]) {
    assert.ok(file.indexOf('resolvedOptions().timeZone') !== -1, 'reads the zone from Intl');
  }
  // Arabic must be tested before Persian in both, or an ar-EG user in Tehran
  // would fall through to the zone rule and get Persian.
  assert.ok(init.indexOf('/^ar/i') < init.indexOf('/^(fa|per|prs)/i'), 'lang-init tests ar first');
  assert.ok(src.indexOf('/^ar/i') < src.indexOf('/^(fa|per|prs)/i'), 'i18n tests ar first');
});
