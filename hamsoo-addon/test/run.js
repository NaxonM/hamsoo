'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const { run } = require('./harness');

// Build first so the manifest/parity tests inspect fresh dist output.
console.log('building dist for tests...');
execFileSync(process.execPath, [path.join(__dirname, '..', 'build.js')], { stdio: 'inherit' });

console.log('\nrunning tests:');
require('./i18n.test');
require('./settings-util.test');
require('./locales.test');
require('./manifest.test');
require('./parity.test');
require('./dom.test');
require('./shadow.test');
require('./selectors.test');
require('./digits.test');
require('./options.test');

run().then(failed => {
  process.exit(failed ? 1 : 0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
