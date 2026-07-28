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

// The host list exists in three places -- the manifest, content.js and
// popup.js -- and they drifted: kimi.com had no apex entry anywhere and the
// manifest never registered www variants, so the extension simply did not run
// on those URLs. These guards fail the build if the three lists disagree.
function siteHostsFrom(file) {
  const src = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');
  const block = src.match(/SITE_HOSTS = \{([\s\S]*?)\n\s*\};/);
  assert.ok(block, 'could not locate SITE_HOSTS in ' + file);
  const out = {};
  for (const line of block[1].split('\n')) {
    if (/^\s*\/\//.test(line)) continue;
    const kv = line.match(/'([^']+)':\s*'([^']+)'/);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}

test('content.js and popup.js agree on the site host map', () => {
  const a = siteHostsFrom('content.js');
  const b = siteHostsFrom('popup.js');
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'SITE_HOSTS drifted between content.js and popup.js');
  assert.equal(a['kimi.com'], 'kimi', 'the bare kimi.com apex must resolve');
});

test('every host in SITE_HOSTS has a content-script match pattern', () => {
  // Suffix matching in the resolver only covers SUBdomains of a listed host,
  // so a host that is absent from the manifest is never injected at all.
  const hosts = siteHostsFrom('content.js');
  const matches = manifest('hamsoo-chromium').content_scripts[0].matches;
  for (const host of Object.keys(hosts)) {
    assert.includes(matches, 'https://' + host + '/*', 'no match pattern registers ' + host);
  }
});

test('apex and www are both registered for the bare-domain products', () => {
  const matches = manifest('hamsoo-chromium').content_scripts[0].matches;
  for (const host of ['chatgpt.com', 'claude.ai', 'grok.com', 'poe.com', 'kimi.com', 'perplexity.ai']) {
    assert.includes(matches, 'https://' + host + '/*', 'missing apex for ' + host);
    assert.includes(matches, 'https://www.' + host + '/*', 'missing www for ' + host);
  }
});

test('both variants load settings-util before content.js', () => {
  for (const name of ['hamsoo-chromium', 'hamsoo-firefox']) {
    const js = manifest(name).content_scripts[0].js;
    assert.equal(js[0], 'shared/settings-util.js', name + ' loads shared module first');
    assert.ok(js.indexOf('shared/settings-util.js') < js.indexOf('content.js'), name + ' shared module precedes content.js');
  }
});
