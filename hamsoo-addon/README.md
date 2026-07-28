# Hamsoo — add-on build

> Build and packaging notes for the extension itself.
> For what Hamsoo does, how to install it, and the full settings reference, see the
> [root README](../README.md) ([فارسی](../README.fa.md)).
> For maintainer workflow, releasing and known traps, see [`AGENTS.md`](../AGENTS.md).

This directory builds two extension variants — **Chromium** and **Firefox** — from a
single shared source tree, so the two are never edited (or drift) separately.

## Layout

```
src/                     Shared extension source (the only place you edit)
manifest.base.json       Common manifest; per-browser bits are injected at build time
build.js                 Generates dist/hamsoo-chromium and dist/hamsoo-firefox
                         (at the add-on ROOT, not in scripts/)
scripts/check.js         Static checks: JS syntax, JSON validity, i18n parity, lint
scripts/bump-version.js  Version + changelog bump (package.json is the source of truth)
scripts/version-sites.js The registry of every place a version number is written
test/                    No-dependency test suite. 217 tests.
website/                 Project website, deployed to GitHub Pages
.github/workflows/       CI lives at the REPO root, not here
dist/                    Build output (generated; git-ignored)
```

### How the test suite is arranged

Tests come in pairs, and the pairing is deliberate — not duplication:

| File | Runs in | Role |
| :--- | :--- | :--- |
| `X.test.js` | Node | Driver: builds a temp profile, launches headless Chromium, asserts on results |
| `X-checks.js` | The page | The assertions themselves, injected into the browser and reported back |

So `direction.test.js` and `direction-checks.js` are two halves of one test, not two copies
of it. Deleting a `-checks.js` file silently guts its driver.

`test/run.js` uses an **explicit require list**. A new `test/foo.test.js` that is not
registered there runs nothing at all, and the suite still reports green.

## Commands

```
npm run check        # syntax + JSON + i18n parity + lint
npm run build        # write dist/hamsoo-chromium and dist/hamsoo-firefox
npm test             # build, then run the 217-test suite
npm run verify       # check + build + test (what CI runs; the gate before any commit)
npm run version:check# report every version site and fail on drift
npm run zip          # build + package dist/hamsoo-*.zip
npm run preview      # UI screenshots into preview-shots/ (git-ignored)
npm run release:notes# release body + store copy, generated from CHANGELOG.md
npm run bump 1.4.0   # set version everywhere and add a changelog stub
```

No third-party dependencies — everything runs on Node's standard library (Node >= 18).
If Playwright cannot find a browser for the headless tests, set `HAMSOO_CHROME`.

## How the two variants differ

The variants are byte-identical except for `manifest.json`:

| | Chromium | Firefox |
|---|---|---|
| background | `service_worker: background.js` | `scripts: [fontdb.js, background.js]` |
| gecko settings | none | `browser_specific_settings.gecko` |

`build.js` enforces this invariant on every build: all non-manifest files must be
byte-identical across the two outputs, or the build fails. It also filters `.md` files out
of `src/`, and copies `LICENSE` in explicitly (AGPLv3 requires it to travel with the build).

## Loading locally

- **Chromium**: `chrome://extensions` -> Developer mode -> Load unpacked -> `dist/hamsoo-chromium`
- **Firefox**: `about:debugging` -> This Firefox -> Load Temporary Add-on -> `dist/hamsoo-firefox/manifest.json`

## Version & release

`package.json` holds the canonical version, but it is **not** the only place one is written —
see `scripts/version-sites.js` for the full registry and `AGENTS.md` §6 for the release
procedure. Never hand-edit a version number; run `npm run bump <version>`.
