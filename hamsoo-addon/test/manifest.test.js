'use strict';
const fs = require('fs');
const path = require('path');
const { test, assert } = require('./harness');

const ROOT = path.join(__dirname, '..');
const PKG = require(path.join(ROOT, 'package.json'));
const manifest = name => JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', name, 'manifest.json'), 'utf8'));

test('both manifests are MV3 and versioned from package.json', () => {
  for (const name of ['hamsoo-chromium', 'hamsoo-firefox']) {
    const m = manifest(name);
    assert.equal(m.manifest_version, 3, name + ' manifest_version');
    assert.equal(m.version, PKG.version, name + ' version matches package.json');
    assert.equal(m.default_locale, 'fa', name + ' default_locale');
    assert.equal(m.options_ui.page, 'options.html', name + ' options_ui page');
  }
});

test('chromium uses a service worker and carries no gecko settings', () => {
  const m = manifest('hamsoo-chromium');
  assert.equal(m.background.service_worker, 'background.js');
  assert.ok(!m.browser_specific_settings, 'chromium must not carry gecko settings');
});

test('firefox uses background scripts and declares a gecko id', () => {
  const m = manifest('hamsoo-firefox');
  assert.includes(m.background.scripts, 'fontdb.js');
  assert.includes(m.background.scripts, 'background.js');
  assert.equal(m.browser_specific_settings.gecko.id, 'hamsoo@naxonm.github.io');
});

test('both manifests target the same content-script hosts', () => {
  const a = manifest('hamsoo-chromium').content_scripts[0].matches;
  const b = manifest('hamsoo-firefox').content_scripts[0].matches;
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'content-script matches differ');
});

test('both variants load settings-util before content.js', () => {
  for (const name of ['hamsoo-chromium', 'hamsoo-firefox']) {
    const js = manifest(name).content_scripts[0].js;
    assert.equal(js[0], 'shared/settings-util.js', name + ' loads shared module first');
    assert.ok(js.indexOf('shared/settings-util.js') < js.indexOf('content.js'), name + ' shared module precedes content.js');
  }
});
