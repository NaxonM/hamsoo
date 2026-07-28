'use strict';
/**
 * Drift guard. Every place a version number is written down is listed in
 * scripts/version-sites.js; this fails the gate if any of them disagrees with
 * package.json.
 *
 * This exists because two version bugs shipped without any test noticing: the
 * published website served a stale, never-released version during the 1.3.0 release, and the popup's
 * fallback chip sat a release behind. Both were single literals nobody diffed.
 */
const { test, assert } = require('./harness');
const { pkgVersion, scan } = require('../scripts/version-sites');

const version = pkgVersion();

test('version: package.json carries a plain semver', () => {
  assert.ok(/^\d+\.\d+\.\d+$/.test(version), 'unexpected version string: ' + version);
});

for (const row of scan(version)) {
  test('version: ' + row.id + ' is in sync at ' + version, () => {
    if (!row.exists) {
      assert.ok(!row.required, row.rel + ' is required but missing');
      return;
    }
    assert.ok(!row.error, row.rel + ': ' + row.error);
    const bad = row.bad.map((b) => b.label + ' = ' + b.value).join('; ');
    assert.equal(row.bad.length, 0,
      row.rel + ' expected ' + row.want + ' but has ' + bad);
  });
}
