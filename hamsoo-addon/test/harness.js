'use strict';
// Minimal zero-dependency test harness.
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
assert.equal = (a, b, msg) => {
  if (a !== b) throw new Error((msg || 'not equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
};
assert.ok = (v, msg) => { if (!v) throw new Error(msg || 'expected truthy value'); };
assert.includes = (arr, v, msg) => {
  if (!arr.includes(v)) throw new Error((msg || 'missing value') + ': ' + JSON.stringify(v));
};

async function run() {
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log('  . ' + t.name);
      passed++;
    } catch (e) {
      console.error('  x ' + t.name + '\n      ' + e.message);
      failed++;
    }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  return failed;
}

module.exports = { test, assert, run, tests };
