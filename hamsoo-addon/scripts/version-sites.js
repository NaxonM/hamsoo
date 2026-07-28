'use strict';
/**
 * The registry of every place the version number is written down.
 *
 * The docs used to say package.json was the only place a version lived, and
 * that was wrong in four ways: release.json existed twice, the website printed
 * the version in two static chips, and popup.html carried a Persian-digit
 * fallback chip. All of them drifted, and one of them shipped -- the published
 * site advertised a version that was never released while 1.3.0 shipped.
 *
 * So the list lives here once and has three consumers:
 *   - scripts/bump-version.js  writes every site in a single run
 *   - test/version.test.js     fails `npm run verify` when any site disagrees
 *   - npm run version:check    prints the report on demand
 *
 * If a version number starts appearing somewhere new, add it HERE; the bumper
 * and the guard both pick it up for free. A site whose pattern stops matching
 * is treated as a failure, not a pass, because an unmatched pattern is exactly
 * how drift becomes invisible again.
 */
const fs = require('fs');
const path = require('path');

const ADDON = path.join(__dirname, '..');
const REPO = path.join(ADDON, '..');

const SEMVER = /^\d+\.\d+\.\d+$/;

function pkgVersion() {
  return JSON.parse(fs.readFileSync(path.join(ADDON, 'package.json'), 'utf8')).version;
}

/** 1.3.0 -> 1.3 (the popup chip shows only major.minor). */
function shortForm(version) {
  return version.split('.').slice(0, 2).join('.');
}

/** 1.3 -> \u06f1\u066b\u06f3 (Persian digits + Persian decimal separator). */
function toFa(s) {
  return String(s)
    .replace(/\d/g, (d) => String.fromCharCode(0x06F0 + Number(d)))
    .replace(/\./g, '\u066B');
}

/** Accepts Persian or Arabic-Indic digits and gives back ASCII. */
function fromFa(s) {
  return String(s)
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\u066B/g, '.')
    .trim();
}

// release.json is duplicated. The root copy is the canonical record and the one
// pages.yml watches, but the workflow only uploads hamsoo-addon/website/, so the
// copy inside that folder is the file actually served. Same shape, same logic.
function releaseJsonSite(id, file, note) {
  return {
    id,
    file,
    required: true,
    form: 'full',
    note,
    read(content) {
      const rel = JSON.parse(content);
      const out = [{ label: 'version', value: rel.version }];
      if (rel.tag) out.push({ label: 'tag', value: String(rel.tag).replace(/^v/, '') });
      for (const key of Object.keys(rel.downloads || {})) {
        const m = String(rel.downloads[key]).match(/\/v(\d+\.\d+\.\d+)\//);
        // The AMO link is version-independent by design, so a download entry
        // without a /vX.Y.Z/ segment is not a miss.
        if (m) out.push({ label: 'downloads.' + key, value: m[1] });
      }
      return out;
    },
    write(content, version, today) {
      const rel = JSON.parse(content);
      rel.version = version;
      rel.tag = 'v' + version;
      if (today) rel.date = today;
      for (const key of Object.keys(rel.downloads || {})) {
        rel.downloads[key] = String(rel.downloads[key])
          .replace(/\/v\d+\.\d+\.\d+\//g, '/v' + version + '/');
      }
      return JSON.stringify(rel, null, 2) + '\n';
    }
  };
}

const SITES = [
  {
    id: 'package.json',
    file: path.join(ADDON, 'package.json'),
    required: true,
    form: 'full',
    note: 'the source of truth; build.js injects it into both manifests',
    read(content) {
      return [{ label: 'version', value: JSON.parse(content).version }];
    },
    write(content, version) {
      const pkg = JSON.parse(content);
      pkg.version = version;
      return JSON.stringify(pkg, null, 2) + '\n';
    }
  },
  {
    id: 'CHANGELOG.md',
    file: path.join(ADDON, 'CHANGELOG.md'),
    required: true,
    form: 'full',
    note: 'the newest entry heading must be the version being released',
    read(content) {
      const m = content.match(/^## \[(\d+\.\d+\.\d+)\]/m);
      return m ? [{ label: 'newest entry', value: m[1] }] : [];
    },
    write(content, version, today, options) {
      const marker = '# Changelog\n\n';
      const already = new RegExp('^## \\[' + version.replace(/\./g, '\\.') + '\\]', 'm');
      if (already.test(content)) return content;
      const summary = (options && options.summary) || '_Describe changes here._';
      const entry = '## [' + version + '] - ' + today + '\n\n- ' + summary + '\n\n';
      return content.startsWith(marker)
        ? marker + entry + content.slice(marker.length)
        : marker + entry + content;
    }
  },
  releaseJsonSite(
    'release.json',
    path.join(REPO, 'release.json'),
    'canonical record; pages.yml redeploys the site when it changes'
  ),
  releaseJsonSite(
    'website/release.json',
    path.join(ADDON, 'website', 'release.json'),
    'the copy Pages actually uploads, so this is the one users can fetch'
  ),
  {
    id: 'website/index.html',
    file: path.join(ADDON, 'website', 'index.html'),
    required: true,
    form: 'full',
    note: 'two static version chips on the marketing page',
    read(content) {
      const out = [];
      const re = /<span class="(pv|ver)">v(\d+\.\d+\.\d+)<\/span>/g;
      let m;
      while ((m = re.exec(content))) out.push({ label: 'span.' + m[1], value: m[2] });
      return out;
    },
    write(content, version) {
      return content.replace(
        /(<span class="(?:pv|ver)">)v\d+\.\d+\.\d+(<\/span>)/g,
        '$1v' + version + '$2'
      );
    }
  },
  {
    id: 'src/popup.html',
    file: path.join(ADDON, 'src', 'popup.html'),
    required: true,
    form: 'short',
    note: 'fallback chip in Persian digits; popup.js overwrites it from the manifest at runtime',
    read(content) {
      const m = content.match(/<span class="version">([^<]*)<\/span>/);
      return m ? [{ label: 'span.version', value: fromFa(m[1]) }] : [];
    },
    write(content, version) {
      return content.replace(
        /(<span class="version">)[^<]*(<\/span>)/,
        '$1' + toFa(shortForm(version)) + '$2'
      );
    }
  },
  {
    // Gitignored internal copy, so it is absent on a fresh clone and in CI.
    id: 'STORE-LISTING.md',
    file: path.join(REPO, 'STORE-LISTING.md'),
    required: false,
    form: 'full',
    note: 'store copy header; the "What\'s new" prose is written by hand',
    read(content) {
      const m = content.match(/^# Store Listing Copy \u2014 Hamsoo v(\d+\.\d+\.\d+)/m);
      return m ? [{ label: 'header', value: m[1] }] : [];
    },
    write(content, version) {
      return content.replace(
        /^(# Store Listing Copy \u2014 Hamsoo v)\d+\.\d+\.\d+/m,
        '$1' + version
      );
    }
  }
];

function relPath(file) {
  return path.relative(REPO, file);
}

/**
 * Compare every site against the expected version.
 * Returns one row per site; `ok` is false for a mismatch, an unreadable file,
 * a required file that is missing, and for a pattern that matched nothing.
 */
function scan(expected) {
  const rows = [];
  for (const site of SITES) {
    const row = {
      id: site.id,
      rel: relPath(site.file),
      note: site.note,
      required: site.required,
      form: site.form,
      want: site.form === 'short' ? shortForm(expected) : expected,
      exists: fs.existsSync(site.file),
      found: [],
      bad: [],
      error: null,
      ok: false
    };
    if (!row.exists) {
      row.ok = !site.required;
      row.error = site.required ? 'required file is missing' : null;
      rows.push(row);
      continue;
    }
    try {
      row.found = site.read(fs.readFileSync(site.file, 'utf8')) || [];
    } catch (e) {
      row.error = e.message;
      rows.push(row);
      continue;
    }
    if (!row.found.length) {
      row.error = 'no version found -- the pattern for this file no longer matches, '
        + 'so drift here would be invisible';
      rows.push(row);
      continue;
    }
    row.bad = row.found.filter((f) => f.value !== row.want);
    row.ok = row.bad.length === 0;
    rows.push(row);
  }
  return rows;
}

/** Write `version` into every site. Returns one row per site describing what happened. */
function writeAll(version, options) {
  const opts = options || {};
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const rows = [];
  for (const site of SITES) {
    if (!fs.existsSync(site.file)) {
      rows.push({ id: site.id, rel: relPath(site.file), status: site.required ? 'missing' : 'skipped' });
      continue;
    }
    const before = fs.readFileSync(site.file, 'utf8');
    let after;
    try {
      after = site.write(before, version, today, opts);
    } catch (e) {
      rows.push({ id: site.id, rel: relPath(site.file), status: 'error', detail: e.message });
      continue;
    }
    if (after === before) {
      rows.push({ id: site.id, rel: relPath(site.file), status: 'unchanged' });
      continue;
    }
    if (!opts.dryRun) fs.writeFileSync(site.file, after);
    rows.push({ id: site.id, rel: relPath(site.file), status: opts.dryRun ? 'would write' : 'written' });
  }
  return rows;
}

function report(expected) {
  const version = expected || pkgVersion();
  const rows = scan(version);
  console.log('version sites (expected ' + version + '):');
  for (const row of rows) {
    if (!row.exists) {
      console.log('  ' + (row.required ? 'x ' : '- ') + row.rel
        + (row.required ? '  MISSING' : '  (absent, optional)'));
      continue;
    }
    if (row.error) {
      console.log('  x ' + row.rel + '  ' + row.error);
      continue;
    }
    if (row.ok) {
      console.log('  . ' + row.rel + '  ' + row.found.map((f) => f.label).join(', '));
    } else {
      for (const b of row.bad) {
        console.log('  x ' + row.rel + '  ' + b.label + ' = ' + b.value + ' (expected ' + row.want + ')');
      }
    }
  }
  const failed = rows.filter((r) => !r.ok);
  console.log(failed.length
    ? '\nversion check FAILED (' + failed.length + ' site' + (failed.length === 1 ? '' : 's') + ' out of sync)'
    : '\nversion check OK');
  return failed.length;
}

module.exports = {
  SITES, SEMVER, ADDON, REPO,
  pkgVersion, shortForm, toFa, fromFa,
  scan, writeAll, report, relPath
};

if (require.main === module) {
  process.exit(report(process.argv[2]) ? 1 : 0);
}
