'use strict';
/**
 * Static checks for the Hamsoo source tree. Zero dependencies.
 *   - JS syntax (node --check) on every shipped script
 *   - JSON validity for the base manifest and every locale file
 *   - i18n parity between the fa and en dictionaries in src/i18n.js
 *   - lightweight lint (no stray debugger statements)
 * Exits non-zero if anything fails, so it can gate CI.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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

// 3. i18n parity (fa vs en) in src/i18n.js.
console.log('i18n parity:');
try {
  const s = fs.readFileSync(path.join(SRC, 'i18n.js'), 'utf8');
  const dict = name => {
    const m = new RegExp(name + ':\\s*\\{([\\s\\S]*?)\\n\\s{4}\\}').exec(s);
    if (!m) throw new Error('dictionary "' + name + '" not found');
    return [...m[1].matchAll(/^\s{6}([a-zA-Z0-9_]+):/gm)].map(x => x[1]);
  };
  const fa = dict('fa');
  const en = dict('en');
  const dupes = a => a.filter((k, i) => a.indexOf(k) !== i);
  const miss = (a, b) => a.filter(k => !b.includes(k));
  const dupFa = dupes(fa);
  const dupEn = dupes(en);
  const m1 = miss(fa, en);
  const m2 = miss(en, fa);
  if (dupFa.length) fail('duplicate fa keys: ' + dupFa.join(', '));
  if (dupEn.length) fail('duplicate en keys: ' + dupEn.join(', '));
  if (m1.length) fail('keys in fa missing from en: ' + m1.join(', '));
  if (m2.length) fail('keys in en missing from fa: ' + m2.join(', '));
  if (!dupFa.length && !dupEn.length && !m1.length && !m2.length) {
    ok('fa=' + fa.length + ' en=' + en.length + ' (in sync)');
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

if (failures) {
  console.error('\ncheck FAILED (' + failures + ' problem' + (failures === 1 ? '' : 's') + ')');
  process.exit(1);
}
console.log('\ncheck OK');
