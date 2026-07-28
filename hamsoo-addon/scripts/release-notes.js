'use strict';
/**
 * Release copy has one source: the changelog section for the current version.
 *
 * Before this, the same release was described three times -- in CHANGELOG.md, in
 * the GitHub release body, and in STORE-LISTING.md -- and nothing held the three
 * together. This script derives the other two from the changelog:
 *
 *   node scripts/release-notes.js            full section, as the GitHub release body
 *   node scripts/release-notes.js --write    the same, into RELEASE-NOTES.md (gitignored)
 *   node scripts/release-notes.js --store    plain-text bullets for the store fields
 *   node scripts/release-notes.js --check    fail if STORE-LISTING.md has drifted
 *
 * The store fields are plain text, not markdown, and they are short. So the
 * changelog section opens with a `### Highlights` list written to survive being
 * stripped to plain text, and that list -- not the whole section -- is what the
 * listing carries. `--check` runs in the gate via test/release-notes.test.js, so
 * editing the changelog and forgetting the listing fails a normal test run.
 */

const fs = require('fs');
const path = require('path');

const ADDON = path.join(__dirname, '..');
const REPO = path.join(ADDON, '..');
const CHANGELOG = path.join(ADDON, 'CHANGELOG.md');
const LISTING = path.join(REPO, 'STORE-LISTING.md');
const NOTES_OUT = path.join(ADDON, 'RELEASE-NOTES.md');

// Store fields cannot be edited after a review round without another review, so
// a runaway list is worth failing on rather than truncating silently.
const MAX_HIGHLIGHTS = 10;

function pkgVersion() {
  return JSON.parse(fs.readFileSync(path.join(ADDON, 'package.json'), 'utf8')).version;
}

/** The changelog section for one version: its heading up to the next heading. */
function section(version) {
  const src = fs.readFileSync(CHANGELOG, 'utf8');
  const re = new RegExp('^## \\[' + version.replace(/\./g, '\\.') + '\\][^\n]*$', 'm');
  const m = re.exec(src);
  if (!m) throw new Error('CHANGELOG.md has no section for ' + version);
  const nextAt = src.indexOf('\n## [', m.index + 1);
  const raw = nextAt === -1 ? src.slice(m.index) : src.slice(m.index, nextAt);
  return { heading: m[0], body: raw.trim() };
}

/** Markdown down to what a store text field can actually show. */
function plain(s) {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/ -- /g, ' \u2014 ')
    .trim();
}

function highlights(version) {
  const body = section(version).body;
  const at = body.indexOf('### Highlights');
  if (at === -1) {
    throw new Error('the ' + version + ' changelog section has no "### Highlights" list');
  }
  const rest = body.slice(at + '### Highlights'.length);
  const end = rest.indexOf('\n### ');
  const block = end === -1 ? rest : rest.slice(0, end);
  const items = block.split('\n').filter(l => l.startsWith('- ')).map(l => plain(l.slice(2)));
  if (!items.length) throw new Error('the Highlights list is empty');
  if (items.length > MAX_HIGHLIGHTS) {
    throw new Error('too many highlights for a store field: ' + items.length
      + ' (max ' + MAX_HIGHLIGHTS + ')');
  }
  return items;
}

function storeText(version) {
  return highlights(version).map(l => '\u2022 ' + l).join('\n');
}

/**
 * Every fenced block that follows a "what's new" heading in the listing, in file
 * order. The Persian heading is matched by codepoint rather than by pasted text:
 * hand-typed Persian has silently mismatched an anchor here before.
 */
function listingBlocks() {
  const lines = fs.readFileSync(LISTING, 'utf8').split('\n');
  const FA_WHATS_NEW = /\u062a\u0627\u0632\u0647/; // "taazeh" -- the fa heading stem
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^## /.test(lines[i])) continue;
    const isEn = /what's new/i.test(lines[i]);
    const isFa = FA_WHATS_NEW.test(lines[i]);
    if (!isEn && !isFa) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== '```') j += 1;
    if (j >= lines.length) continue;
    const body = [];
    for (j += 1; j < lines.length && lines[j].trim() !== '```'; j += 1) body.push(lines[j]);
    out.push({ lang: isEn ? 'en' : 'fa', heading: lines[i].trim(), text: body.join('\n').trim() });
  }
  return out;
}

function bulletCount(text) {
  return text.split('\n').filter(l => l.trim().startsWith('\u2022')).length;
}

/** Returns a list of problems; empty means the listing is in sync. */
function checkListing(version) {
  const problems = [];
  const blocks = listingBlocks();
  const en = blocks.filter(b => b.lang === 'en');
  const fa = blocks.filter(b => b.lang === 'fa');
  if (en.length !== 1) {
    problems.push('expected exactly one English "what\'s new" block, found ' + en.length
      + ' (a superseded release block left behind?)');
  }
  if (fa.length !== 1) {
    problems.push('expected exactly one Persian "what\'s new" block, found ' + fa.length);
  }
  if (en.length === 1 && en[0].text !== storeText(version)) {
    problems.push('the English block does not match the changelog highlights for ' + version);
  }
  if (en.length === 1 && fa.length === 1) {
    const a = bulletCount(en[0].text);
    const b = bulletCount(fa[0].text);
    if (a !== b) {
      problems.push('bullet counts differ: ' + a + ' English vs ' + b + ' Persian');
    }
  }
  return problems;
}

function main(argv) {
  const version = pkgVersion();
  const mode = argv[0] || '--github';

  if (mode === '--store') {
    console.log(storeText(version));
    return 0;
  }

  if (mode === '--check') {
    const problems = checkListing(version);
    for (const p of problems) console.log('  x ' + p);
    if (problems.length) {
      console.log('\nrelease notes FAILED (' + problems.length + ' problem'
        + (problems.length === 1 ? '' : 's') + ') -- regenerate with: npm run release:notes -- --store');
      return 1;
    }
    console.log('  . store listing matches the ' + version + ' changelog highlights');
    console.log('release notes OK');
    return 0;
  }

  const body = section(version).body;
  if (mode === '--write') {
    fs.writeFileSync(NOTES_OUT, body + '\n', 'utf8');
    console.log('wrote ' + path.relative(REPO, NOTES_OUT) + ' (' + version + ')');
    return 0;
  }
  if (mode !== '--github') {
    console.log('unknown option: ' + mode);
    return 1;
  }
  console.log(body);
  return 0;
}

module.exports = {
  pkgVersion: pkgVersion,
  section: section,
  plain: plain,
  highlights: highlights,
  storeText: storeText,
  listingBlocks: listingBlocks,
  bulletCount: bulletCount,
  checkListing: checkListing,
  MAX_HIGHLIGHTS: MAX_HIGHLIGHTS
};

if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.log('release notes FAILED: ' + e.message);
    process.exit(1);
  }
}
