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
require('./settings-patch.test');
require('./settings-import.test');
require('./custom-sites.test');
require('./selection-fix.test');
require('./picked-unstyle.test');
require('./font-transactions.test');
require('./settings-patch-leaf.test');
require('./content-undo-ownership.test');
require('./selection-partial-text.test');
require('./fonts-validate.test');
require('./fonts-a11y.test');
require('./aria-i18n.test');
require('./shadow-measure.test');
require('./bare-text-bidi.test');
require('./locales.test');
require('./manifest.test');
require('./version.test');
require('./release-notes.test');
require('./publishable.test');
require('./parity.test');
require('./code-detect.test');
require('./dom.test');
require('./layout.test');
require('./direction.test');
require('./kimi.test');
require('./shadow.test');
require('./selectors.test');
require('./digits.test');
require('./teardown.test');
require('./options.test');
require('./welcome.test');

run().then(failed => {
  process.exit(failed ? 1 : 0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
