'use strict';
/**
 * Static checks for the Hamsoo source tree. Zero dependencies.
 *   - JS syntax (node --check) on every shipped script
 *   - JSON validity for the base manifest and every locale file
 *   - i18n parity between the fa and en dictionaries in src/i18n.js
 *   - lightweight lint (no stray debugger statements)
 *   - no inline scripts/handlers in extension pages (the CSP blocks them)
 *   - Arabic-script lookalikes and known mis-spellings in Persian copy
 * Exits non-zero if anything fails, so it can gate CI.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

let failures = 0;
const fail = msg => { console.error('  x ' + msg); failures++; };
const ok = msg => { console.log('  . ' + msg); };

function listFiles(dir, filter, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(full, filter, acc);
    else if (filter(full)) acc.push(full);
  }
  return acc;
}

// 1. Syntax check every shipped JS file.
console.log('syntax:');
const jsFiles = listFiles(SRC, f => f.endsWith('.js'));
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    ok(path.relative(ROOT, f));
  } catch (e) {
    const line = e.stderr ? e.stderr.toString().split('\n').find(Boolean) : e.message;
    fail(path.relative(ROOT, f) + ' - ' + line);
  }
}

// 2. JSON validity (base manifest + locales).
console.log('json:');
const jsonFiles = [path.join(ROOT, 'manifest.base.json')]
  .concat(listFiles(path.join(SRC, '_locales'), f => f.endsWith('.json')));
for (const f of jsonFiles) {
  try {
    JSON.parse(fs.readFileSync(f, 'utf8'));
    ok(path.relative(ROOT, f));
  } catch (e) {
    fail(path.relative(ROOT, f) + ' - ' + e.message);
  }
}

// 3. i18n parity (fa vs en vs ar) in src/i18n.js.
//
// The dictionaries are loaded by *executing* i18n.js in a sandbox and reading
// the real HamsooI18n.DICT object. The previous implementation scraped the
// source with a regex anchored to exact indentation ('\n\s{4}\}' as the end of
// a dictionary, '^\s{6}key:' for entries), so a reformat -- or a nested object
// -- would silently truncate a dictionary and still report "in sync".
console.log('i18n parity:');
try {
  const src = fs.readFileSync(path.join(SRC, 'i18n.js'), 'utf8');
  const sandbox = { globalThis: null, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'i18n.js' });

  const DICT = sandbox.HamsooI18n && sandbox.HamsooI18n.DICT;
  if (!DICT) throw new Error('HamsooI18n.DICT was not exposed');
  for (const lang of ['fa', 'en', 'ar']) {
    if (!DICT[lang] || typeof DICT[lang] !== 'object') throw new Error('dictionary "' + lang + '" not found');
  }

  const keys = lang => Object.keys(DICT[lang]);
  const fa = keys('fa');
  const en = keys('en');
  const ar = keys('ar');
  const miss = (a, b) => a.filter(k => !b.includes(k));
  const m1 = miss(fa, en);
  const m2 = miss(en, fa);
  const m3 = miss(fa, ar);
  const m4 = miss(ar, fa);
  if (m1.length) fail('keys in fa missing from en: ' + m1.join(', '));
  if (m2.length) fail('keys in en missing from fa: ' + m2.join(', '));
  if (m3.length) fail('keys in fa missing from ar: ' + m3.join(', '));
  if (m4.length) fail('keys in ar missing from fa: ' + m4.join(', '));

  // Duplicate literal keys collapse silently in an object literal, so detect
  // them in the source instead: 'key:' at the start of a dictionary entry.
  const dupSource = [];
  for (const key of new Set([...fa, ...en, ...ar])) {
    const n = (src.match(new RegExp('^\\s*' + key + ':', 'gm')) || []).length;
    const expected = [fa, en, ar].filter(list => list.includes(key)).length;
    if (n > expected) dupSource.push(key + ' (x' + n + ', expected ' + expected + ')');
  }
  if (dupSource.length) fail('duplicate keys in source: ' + dupSource.join(', '));

  // Value-level checks: a key can be present and still be broken.
  const badValues = [];
  const typeMismatch = [];
  for (const lang of ['fa', 'en', 'ar']) {
    for (const key of keys(lang)) {
      const v = DICT[lang][key];
      if (typeof v === 'function') continue;
      if (typeof v !== 'string' || v.trim() === '') {
        badValues.push(lang + '.' + key);
        continue;
      }
      // A translated value should not still be the raw key name.
      if (v === key) badValues.push(lang + '.' + key + ' (untranslated placeholder)');
    }
    // A key that is a function in one language must be a function in all of
    // them, or callers that pass arguments get a bare string back.
    for (const key of keys(lang)) {
      const here = typeof DICT[lang][key];
      for (const other of ['fa', 'en', 'ar']) {
        if (other === lang) continue;
        if (!(key in DICT[other])) continue;
        if (typeof DICT[other][key] !== here) {
          const pair = [lang + '.' + key + ':' + here, other + '.' + key + ':' + typeof DICT[other][key]].sort().join(' vs ');
          if (!typeMismatch.includes(pair)) typeMismatch.push(pair);
        }
      }
    }
  }
  if (badValues.length) fail('empty/invalid i18n values: ' + badValues.join(', '));
  if (typeMismatch.length) fail('i18n value type mismatch: ' + typeMismatch.join(', '));

  // Arabic values must not contain the mojibake that a bad transliteration
  // pass left behind (e.g. 'فير' for 'غير'). These are real words nowhere in
  // correct Arabic UI copy, so an exact substring match is safe.
  const GARBLED_AR = ['\u0641\u064a\u0631 ', '\u062a\u0639\u064a\u064a\u0631', '\u0625\u0644\u0639\u0627\u0621', '\u0627\u0636\u0637\u0637', '\u0623\u062a\u0646\u0627\u0621'];
  const garbled = [];
  for (const key of keys('ar')) {
    const v = DICT.ar[key];
    if (typeof v !== 'string') continue;
    for (const bad of GARBLED_AR) {
      if (v.includes(bad)) garbled.push('ar.' + key + ' contains "' + bad.trim() + '"');
    }
  }
  if (garbled.length) fail('garbled Arabic values: ' + garbled.join(', '));

  // A U+FFFD replacement character means bytes were lost in an earlier edit,
  // not that a translation is wrong. The English dictionary shipped `langAr`
  // with two of them -- it rendered as black diamonds in the English interface
  // -- and nothing caught it, because the guard above only inspects Arabic.
  // So: check every dictionary, and include private-use glyphs, which are the
  // other way a broken font/encoding round-trip shows up.
  // Arabic-script lookalikes in the Persian dictionary. Arabic yeh (U+064A) and
  // kaf (U+0643) are near-identical to Persian yeh (U+06CC) and keheh (U+06A9)
  // in most fonts, so a word pasted from an Arabic source reads as a spelling
  // mistake to a Persian speaker and cannot be found by searching for the
  // correct form. Keys that deliberately show Arabic are exempt.
  const AR_LOOKALIKE = /[\u064A\u0643\u0649\u0629\u0660-\u0669]/;
  const lookalikes = [];
  for (const key of keys('fa')) {
    if (/Ar$|Arab/.test(key)) continue;
    const v = DICT.fa[key];
    if (typeof v === 'string' && AR_LOOKALIKE.test(v)) lookalikes.push('fa.' + key);
  }
  if (lookalikes.length) {
    fail('arabic-script lookalike letters in Persian values: ' + lookalikes.join(', '));
  }

  const mojibake = [];
  for (const lang of ['fa', 'en', 'ar']) {
    for (const key of keys(lang)) {
      const v = DICT[lang][key];
      if (typeof v !== 'string') continue;
      if (/[\uFFFD\uE000-\uF8FF]/.test(v)) mojibake.push(lang + '.' + key);
    }
  }
  if (mojibake.length) {
    fail('lost bytes in i18n values (replacement or private-use characters): '
      + mojibake.join(', '));
  }

  if (!m1.length && !m2.length && !m3.length && !m4.length &&
      !dupSource.length && !badValues.length && !typeMismatch.length && !garbled.length &&
      !mojibake.length && !lookalikes.length) {
    ok('fa=' + fa.length + ' en=' + en.length + ' ar=' + ar.length + ' (keys and values in sync)');
  }
} catch (e) {
  fail('i18n parity - ' + e.message);
}

// 4. Lightweight lint: no stray debugger statements in shipped JS.
console.log('lint:');
let lintClean = true;
for (const f of jsFiles) {
  if (/(^|[^.\w])debugger\s*;/.test(fs.readFileSync(f, 'utf8'))) {
    fail('debugger statement in ' + path.relative(ROOT, f));
    lintClean = false;
  }
}
if (lintClean) ok('no debugger statements');

// 5. Extension pages carry no inline scripts and no inline event handlers. The
// MV3 default policy is script-src 'self', so an inline <script> never runs at
// all: the page simply renders blank, and on a normal profile nobody has a
// console open to see why. options.html shipped an inline redirect and was a
// blank screen from Chromium's right-click -> Options.
console.log('csp:');
let cspClean = true;
for (const html of listFiles(SRC, f => f.endsWith('.html'))) {
  const body = fs.readFileSync(html, 'utf8');
  const rel = path.relative(ROOT, html);
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(body))) {
    if (!/\bsrc\s*=/i.test(m[1] || '') && (m[2] || '').trim()) {
      fail('inline <script> in ' + rel + ' -- the extension CSP blocks it, so it never runs');
      cspClean = false;
    }
  }
  if (/<[a-z][^>]*\son(?:click|change|input|submit|load|error)\s*=/i.test(body)) {
    fail('inline event handler in ' + rel + ' -- the extension CSP blocks it');
    cspClean = false;
  }
}
if (cspClean) ok('no inline scripts or handlers in extension pages');

// 6. Mis-spellings we have actually shipped, in any source or copy file. The
// pair below differs by one dot (tanTimat / tanZimat) and is invisible at UI
// sizes in most fonts, so it survived from 1.0 in the options page title.
console.log('spelling:');
// Persian letters that differ only in their dots are indistinguishable at UI
// size, so a mis-spelling can ship for a year unnoticed. Check the word
// SKELETON rather than a list of typos we happen to have seen: three
// different middle letters have already shipped for this one word (U+0637 in
// the options page title, U+0632 in the shortcut hint) and listing them one
// at a time only ever catches yesterday's mistake.
const SKELETONS = [
  {
    // ta-nun-?-yeh-mim-alef-ta: only U+0638 spells the word for settings.
    re: /\u062a\u0646([^\u0638])\u06cc\u0645\u0627\u062a/g,
    correct: '\u062a\u0646\u0638\u06cc\u0645\u0627\u062a'
  }
];
let spellingClean = true;
const copyFiles = listFiles(SRC, f => /\.(js|html|md|json)$/.test(f));
// Copy that users read but that does not live under src/. The store listing
// carried the same typo and the src-only walk could never have seen it.
for (const extra of ['CHANGELOG.md', '../STORE-LISTING.md', '../README.md', '../README.fa.md']) {
  const abs = path.join(ROOT, extra);
  if (fs.existsSync(abs)) copyFiles.push(abs);
}
for (const f of copyFiles) {
  const body = fs.readFileSync(f, 'utf8');
  for (const { re, correct } of SKELETONS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(body))) {
      const line = body.slice(0, m.index).split('\n').length;
      fail(path.relative(ROOT, f) + ':' + line + ' spells "' + m[0] + '" (middle letter U+' +
        m[1].codePointAt(0).toString(16).toUpperCase().padStart(4, '0') +
        '), should be "' + correct + '"');
      spellingClean = false;
    }
  }
}
if (spellingClean) ok('no mis-spelled Persian words in copy');

if (failures) {
  console.error('\ncheck FAILED (' + failures + ' problem' + (failures === 1 ? '' : 's') + ')');
  process.exit(1);
}
console.log('\ncheck OK');
