'use strict';
/**
 * Hamsoo single-source build.
 *
 * Generates dist/hamsoo-chromium and dist/hamsoo-firefox from one src/ tree,
 * injecting the per-browser manifest differences and the version from
 * package.json. Zero runtime dependencies (Node built-ins only).
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const BASE_MANIFEST = path.join(ROOT, 'manifest.base.json');
const PKG = require('./package.json');

// Per-target manifest patches. Everything else comes from manifest.base.json.
const TARGETS = {
  'hamsoo-chromium': {
    background: { service_worker: 'background.js' }
  },
  'hamsoo-firefox': {
    background: { scripts: ['fontdb.js', 'background.js'] },
    browser_specific_settings: {
      gecko: {
        id: 'hamsoo@nimbusreach.info',
        strict_min_version: '128.0',
        data_collection_permissions: { required: ['none'] }
      }
    }
  }
};

function buildManifest(patch) {
  const base = JSON.parse(fs.readFileSync(BASE_MANIFEST, 'utf8'));
  base.version = PKG.version;
  // 'background' is a positioned placeholder in the base; overwrite in place so
  // the generated key order stays stable and readable.
  base.background = patch.background;
  if (patch.browser_specific_settings) {
    base.browser_specific_settings = patch.browser_specific_settings;
  }
  return JSON.stringify(base, null, 2) + '\n';
}

function build() {
  if (!fs.existsSync(SRC)) throw new Error('src/ not found');
  fs.rmSync(DIST, { recursive: true, force: true });
  const names = Object.keys(TARGETS);
  for (const name of names) {
    const out = path.join(DIST, name);
    fs.mkdirSync(out, { recursive: true });
    fs.cpSync(SRC, out, {
      recursive: true,
      filter: (src) => !src.endsWith('.md')
    });
    fs.writeFileSync(path.join(out, 'manifest.json'), buildManifest(TARGETS[name]));
    console.log('built ' + name + ' (v' + PKG.version + ')');
  }
  verifyParity(names.map(n => path.join(DIST, n)));
  console.log('build OK');
}

// Collect every file under dir as rel-path -> bytes.
function walk(dir, base, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full);
    if (entry.isDirectory()) walk(full, base, acc);
    else acc.set(rel, fs.readFileSync(full));
  }
  return acc;
}

// Every file except manifest.json must be byte-identical across the variants.
function verifyParity(dirs) {
  const [a, b] = dirs;
  const fa = walk(a, a, new Map());
  const fb = walk(b, b, new Map());
  const keys = new Set([...fa.keys(), ...fb.keys()]);
  const diffs = [];
  for (const k of keys) {
    if (k === 'manifest.json') continue;
    const x = fa.get(k);
    const y = fb.get(k);
    if (!x || !y || !x.equals(y)) diffs.push(k);
  }
  if (diffs.length) throw new Error('variant parity broken: ' + diffs.join(', '));
}

if (require.main === module) {
  try {
    build();
  } catch (e) {
    console.error('build failed: ' + e.message);
    process.exit(1);
  }
}

module.exports = { build, buildManifest, verifyParity, TARGETS };
