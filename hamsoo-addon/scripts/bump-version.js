'use strict';
/**
 * Bump the extension version.
 *
 * package.json is the single source of truth: build.js injects it into both
 * manifests, and the popup reads it back at runtime via runtime.getManifest(),
 * so there is nothing else to edit by hand. This script also prepends a
 * changelog stub for the new version.
 *
 * Usage: node scripts/bump-version.js <major.minor.patch>
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('usage: node scripts/bump-version.js <major.minor.patch>');
  process.exit(1);
}

const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const prev = pkg.version;
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const clPath = path.join(ROOT, 'CHANGELOG.md');
const today = new Date().toISOString().slice(0, 10);
const entry = '## [' + version + '] - ' + today + '\n\n- _Describe changes here._\n\n';
const marker = '# Changelog\n\n';
let cl = fs.existsSync(clPath) ? fs.readFileSync(clPath, 'utf8') : marker;
cl = cl.startsWith(marker) ? marker + entry + cl.slice(marker.length) : marker + entry + cl;
fs.writeFileSync(clPath, cl);

console.log('bumped ' + prev + ' -> ' + version);
console.log('updated package.json + CHANGELOG.md; run `npm run build` to regenerate manifests.');
