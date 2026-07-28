'use strict';
const fs = require('fs');
const path = require('path');
const { test, assert } = require('./harness');

const DIST = path.join(__dirname, '..', 'dist');
function walk(dir, base, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.relative(base, full);
    if (e.isDirectory()) walk(full, base, acc);
    else acc.set(rel, fs.readFileSync(full));
  }
  return acc;
}

test('chromium and firefox builds are identical except manifest.json', () => {
  const a = path.join(DIST, 'hamsoo-chromium');
  const b = path.join(DIST, 'hamsoo-firefox');
  const fa = walk(a, a, new Map());
  const fb = walk(b, b, new Map());
  assert.equal(fa.size, fb.size, 'file counts differ');
  const diffs = [];
  for (const [k, v] of fa) {
    if (k === 'manifest.json') continue;
    const w = fb.get(k);
    if (!w || !w.equals(v)) diffs.push(k);
  }
  assert.equal(diffs.length, 0, 'differing files: ' + diffs.join(', '));
});
