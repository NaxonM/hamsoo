'use strict';
/**
 * Gate on what a fresh clone actually contains.
 *
 * Every other test in this suite runs against the working tree of whoever
 * invokes it, which is never the tree CI or a new contributor gets: `git clone`
 * and `actions/checkout` both materialise tracked files only. Two tests in
 * release-notes.test.js read STORE-LISTING.md, which .gitignore excludes, so
 * they passed for everyone who happened to have the file locally and failed for
 * everyone who did not -- including CI, which runs `node test/run.js` on a bare
 * checkout. A green local run was not evidence the gate was green.
 *
 * These rules are asked of git, not of .gitignore. Reading that file by eye is
 * exactly how the problem survived review: `RELEASE-*.md` and `STORE-LISTING.md`
 * are unanchored patterns, and an unanchored pattern matches at every depth, so
 * `RELEASE-*.md` silently covers hamsoo-addon/RELEASE-NOTES.md too. Grepping
 * .gitignore for a literal filename reports "not ignored" for a file git does
 * ignore. `git check-ignore` is the only authority on the question, so it is
 * what this file calls.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, assert } = require('./harness');

const REPO = path.join(__dirname, '..', '..');

function git(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

// A tarball, an npm pack, or a vendored copy has no .git. Skip rather than fail:
// this file gates the repository, and outside a repository there is nothing to
// gate. CI always has one.
let haveGit = false;
try {
  git(['rev-parse', '--git-dir']);
  haveGit = true;
} catch (e) {
  haveGit = false;
}

// exit 0 = ignored, exit 1 = not ignored. Anything else is a real error.
function isIgnored(rel) {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', rel],
      { cwd: REPO, stdio: 'ignore' });
    return true;
  } catch (err) {
    if (err && err.status === 1) return false;
    throw new Error('git check-ignore failed for ' + rel + ': ' + err.message);
  }
}

// Files the build, the checks, the website or the docs cannot work without.
// If any of these ever becomes ignored, a fresh clone is broken and no local
// run would show it.
const REQUIRED = [
  '.gitattributes',
  'README.md',
  'README.fa.md',
  'AGENTS.md',
  'LICENSE',
  'package.json',
  'release.json',
  'docs/DEBUGGING-REPORT.md',
  '.github/CONTRIBUTING.md',
  '.github/workflows/ci.yml',
  '.github/workflows/pages.yml',
  'hamsoo-addon/package.json',
  'hamsoo-addon/CHANGELOG.md',
  'hamsoo-addon/README.md',
  'hamsoo-addon/build.js',
  'hamsoo-addon/manifest.base.json',
  'hamsoo-addon/scripts/check.js',
  'hamsoo-addon/scripts/release-notes.js',
  'hamsoo-addon/scripts/version-sites.js',
  'hamsoo-addon/test/run.js',
  'hamsoo-addon/src/content.js',
  'hamsoo-addon/src/ADDING-FONTS.md',
  'hamsoo-addon/website/index.html',
  'hamsoo-addon/website/release.json'
];

// Internal copy that is deliberately not published. Anything listed here may be
// read by tooling only behind an existence check.
const PRIVATE = [
  'STORE-LISTING.md',
  'hamsoo-addon/RELEASE-NOTES.md',
  'hamsoo-addon/src/RELEASE-fa.md'
];

// Directories that ship in full: the extension source, the published test suite,
// the release scripts, the Pages publish root (pages.yml uploads
// hamsoo-addon/website wholesale) and the docs/images the READMEs link to. An
// ignored file inside any of them is either a broken published site or a file
// that silently vanishes for everyone but its author.
const PUBLISHED_DIRS = [
  'assets/',
  'docs/',
  'hamsoo-addon/src/',
  'hamsoo-addon/scripts/',
  'hamsoo-addon/test/',
  'hamsoo-addon/website/'
];

if (!haveGit) {
  console.log('  ! publishable tests skipped: not a git repository.');
} else {
  test('publishable: files the tooling requires are tracked', () => {
    const broken = [];
    for (const rel of REQUIRED) {
      if (!fs.existsSync(path.join(REPO, rel))) broken.push(rel + ' (missing from the tree)');
      else if (isIgnored(rel)) broken.push(rel + ' (ignored, so absent from a fresh clone)');
    }
    assert.ok(broken.length === 0, broken.join('\n      '));
  });

  test('publishable: internal copy stays out of the published tree', () => {
    const leaked = PRIVATE.filter(rel => !isIgnored(rel));
    assert.ok(leaked.length === 0,
      'expected these to be gitignored: ' + leaked.join(', '));
  });

  test('publishable: nothing inside a published directory is ignored', () => {
    // Present-but-ignored files, which is the state a developer machine is in.
    // A bare CI checkout has none of them, so this rule can only be enforced
    // where the mistake is actually made: locally, before it is pushed.
    const listed = git(['ls-files', '--others', '--ignored', '--exclude-standard'])
      .split('\n').map(s => s.trim()).filter(Boolean);
    const offenders = listed.filter(rel =>
      PUBLISHED_DIRS.some(dir => rel.startsWith(dir)) && PRIVATE.indexOf(rel) === -1);
    assert.ok(offenders.length === 0,
      'ignored files inside a published directory:\n      ' + offenders.join('\n      '));
  });

  test('publishable: every gitignore claim in the docs matches git', () => {
    // Prose that says a file is ignored, or is not published, is a claim git can
    // settle. The claims drifted once already, in the opposite direction: a file
    // git ignores was described as tracked.
    const problems = [];
    for (const rel of PRIVATE) {
      const base = path.basename(rel);
      if (!isIgnored(rel)) problems.push(base + ' is documented as private but git tracks it');
    }
    // release-notes.js states RELEASE-NOTES.md is gitignored; hold it to that.
    const src = fs.readFileSync(
      path.join(REPO, 'hamsoo-addon/scripts/release-notes.js'), 'utf8');
    if (/RELEASE-NOTES\.md \(gitignored\)/.test(src)
      && !isIgnored('hamsoo-addon/RELEASE-NOTES.md')) {
      problems.push('release-notes.js calls RELEASE-NOTES.md gitignored, but it is not');
    }
    assert.ok(problems.length === 0, problems.join('\n      '));
  });
}
