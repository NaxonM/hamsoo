'use strict';
/**
 * Bump the extension version in one run.
 *
 * Every place a version is written down lives in scripts/version-sites.js, and
 * this script writes all of them, then rebuilds, then re-reads everything to
 * prove the tree is consistent. It also greps for leftovers of the previous
 * version, which is how the stale copies were found in the first place.
 *
 * Usage:
 *   node scripts/bump-version.js <major.minor.patch> [options]
 *
 * Options:
 *   -m, --message "text"   first changelog bullet instead of the TODO stub
 *   --dry-run              report what would change, write nothing
 *   --no-build             skip regenerating dist/ (manifests stay on the old version)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sites = require('./version-sites');

const ROOT = sites.ADDON;
const REPO = sites.REPO;

const argv = process.argv.slice(2);
const opts = { dryRun: false, build: true, summary: null };
let version = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dry-run') opts.dryRun = true;
  else if (a === '--no-build') opts.build = false;
  else if (a === '-m' || a === '--message') opts.summary = argv[++i];
  else if (!version) version = a;
  else {
    console.error('unexpected argument: ' + a);
    process.exit(1);
  }
}

if (!version || !sites.SEMVER.test(version)) {
  console.error('usage: node scripts/bump-version.js <major.minor.patch> '
    + '[-m "changelog summary"] [--dry-run] [--no-build]');
  process.exit(1);
}

const prev = sites.pkgVersion();
if (prev === version && !opts.dryRun) {
  console.log('already at ' + version + '; rewriting every site anyway to pull stragglers into line.');
}

console.log((opts.dryRun ? 'DRY RUN: ' : '') + prev + ' -> ' + version + '\n');

// 1. Write every known site.
console.log('sites:');
let writeProblem = false;
for (const row of sites.writeAll(version, opts)) {
  const mark = (row.status === 'error' || row.status === 'missing') ? '  x ' : '  . ';
  console.log(mark + row.rel + '  ' + row.status + (row.detail ? ' - ' + row.detail : ''));
  if (row.status === 'error' || row.status === 'missing') writeProblem = true;
}

// 2. Look for leftovers of the previous version that no site knows about. This
//    is the check that would have caught website/release.json and the popup
//    chip. History is excluded on purpose: the changelog, the debugging report
//    and CONTRIBUTING legitimately name old versions, and test fixtures pin
//    their own version strings.
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'preview-shots', 'dev', 'test',
  'audit-harness', 'audit2', 'docs'
]);
const SKIP_FILES = new Set(['CHANGELOG.md', 'CONTRIBUTING.md']);
const EXT = new Set(['.js', '.mjs', '.json', '.md', '.html', '.css', '.yml', '.yaml']);

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name), acc);
    } else if (EXT.has(path.extname(e.name)) && !SKIP_FILES.has(e.name)) {
      acc.push(path.join(dir, e.name));
    }
  }
  return acc;
}

if (prev !== version) {
  const known = new Set(sites.SITES.map((s) => s.file));
  const faPrev = sites.toFa(sites.shortForm(prev));
  const stragglers = [];
  for (const file of walk(REPO, [])) {
    if (known.has(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const hits = [];
    if (text.includes(prev)) hits.push(prev);
    if (text.includes(faPrev)) hits.push(faPrev);
    if (hits.length) stragglers.push({ rel: sites.relPath(file), hits });
  }
  console.log('\nleftover mentions of ' + prev + ':');
  if (!stragglers.length) {
    console.log('  . none outside the registry and the excluded history');
  } else {
    for (const s of stragglers) {
      console.log('  ? ' + s.rel + '  (' + s.hits.join(', ') + ')');
    }
    console.log('  Review these. If one is a real version site, add it to '
      + 'scripts/version-sites.js so it is written and guarded from now on.');
  }
}

// 3. Regenerate the manifests, which are the only generated version carriers.
if (opts.build && !opts.dryRun) {
  console.log('\nbuild:');
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'inherit' });
  } catch (e) {
    console.error('  x build failed');
    process.exit(1);
  }
} else {
  console.log('\nbuild: skipped'
    + (opts.build ? ' (dry run)' : ' (--no-build; dist manifests still read ' + prev + ')'));
}

// 4. Prove it, rather than trusting the writes above.
console.log('');
if (opts.dryRun) {
  console.log('dry run: nothing written, so the version check still reflects ' + prev + '.');
  process.exit(0);
}

const failed = sites.report(version);
if (failed || writeProblem) {
  console.error('\nbump FAILED: the tree is not consistent at ' + version + '.');
  process.exit(1);
}

const changelogStubbed = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8')
  .includes('_Describe changes here._');
console.log('\nbumped ' + prev + ' -> ' + version + '.');
if (changelogStubbed) {
  console.log('next: replace the `_Describe changes here._` stub in CHANGELOG.md, '
    + 'then run `npm run verify`.');
} else {
  console.log('next: run `npm run verify`.');
}
if (fs.existsSync(path.join(REPO, 'STORE-LISTING.md'))) {
  console.log('also: STORE-LISTING.md keeps a hand-written "What\'s new" block per release.');
}
