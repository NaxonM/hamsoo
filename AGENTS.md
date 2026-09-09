# Maintainer & Agent Guide

Operational guide for anyone — human or AI — working on Hamsoo. It explains how the
project is put together, which commands are authoritative, and the traps that have
already cost real debugging time.

Read this before editing. Then read [`docs/HANDOVER.md`](docs/HANDOVER.md) and
[`docs/GROUND-TRUTH.md`](docs/GROUND-TRUTH.md). Those are the **current** source of
truth for remaining work (H-items from the 7 Sep 2026 audit; cloud sync was later removed).

[`docs/DEBUGGING-REPORT.md`](docs/DEBUGGING-REPORT.md) is the **historical**
regression ledger: source comments cite its R-numbers (R1–R6). Do not treat its
pre-1.3.0 narrative, or anything under `docs/archive/`, as the open-bug list.

---

## 1. The ten-second orientation

- **One product, one source tree.** `hamsoo-addon/src/` is what runs in the browser.
  There is no bundler, no transpiler, and no runtime dependency. What you read is what ships.
- **One build, two targets.** `build.js` generates `dist/hamsoo-chromium` and
  `dist/hamsoo-firefox` from the same `src/`, differing only by manifest patch.
- **`hamsoo-addon/package.json` is the source of truth for the version, but it is not
  the only place a version is written.** Manifests are generated from it; the two
  `release.json` copies, the website's version chips and the popup's fallback chip are
  not. Every such place is listed in `hamsoo-addon/scripts/version-sites.js`, written by
  `npm run bump`, and guarded by `npm run version:check` and the test suite. Never
  hand-edit a version number: if a new one appears, add it to that registry.
- **Node >= 18.** Tests and preview tooling drive headless Chromium via Playwright.

---

## 2. Repository map

```
/
├── package.json              Root forwarder. Runs the add-on's scripts from the repo root.
├── release.json              Feeds the website's download buttons. See §6.
├── README.md / README.fa.md  Public docs (English / Persian). Keep in parity.
├── AGENTS.md                 This file.
├── LICENSE                   AGPLv3.
├── .gitattributes            Pins LF endings. Do not remove — see R2.
├── .github/
│   ├── workflows/ci.yml      Checks, builds, and tests on push and pull requests.
│   ├── workflows/pages.yml   Deploys hamsoo-addon/website on changes to it or release.json.
│   ├── workflows/release.yml Packages and publishes GitHub releases on tag push.
│   ├── CONTRIBUTING.md
│   └── SECURITY.md
├── assets/                   TRACKED. Logo + screenshots referenced by the READMEs.
│   ├── logo.png
│   └── screenshots/          comparison, comparison-stacked, popup, popup-dark, options, fonts
├── docs/
│   ├── README.md             Doc index. Start here for current vs historical.
│   ├── HANDOVER.md           Instructions for the implementing agent.
│   ├── GROUND-TRUTH.md       Current open issues after the storage.sync purge.
│   ├── DEBUGGING-REPORT.md   Historical R1–R6 ledger. Source comments cite it.
│   └── archive/              Superseded B-series audits. Not current work.
├── dev/                      GITIGNORED. Internal harnesses and image tooling. Never ships.
└── hamsoo-addon/
    ├── package.json          Version source of truth. npm scripts live here.
    ├── manifest.base.json    Shared manifest; build.js applies per-browser patches.
    ├── build.js              Build script. At the add-on ROOT, not in scripts/.
    ├── CHANGELOG.md
    ├── LICENSE               Copied into dist/ by build.js (AGPL requirement).
    ├── src/                  The extension itself.
    ├── test/                 PUBLISHED test suite. Count lives in `test/run.js` (347 passing outside git; 351 in git).
    ├── scripts/              check, build helpers, zip, preview, bump-version,
    │                         version-sites (the version registry), release-notes
    └── website/              Project website, deployed to GitHub Pages.
```

### Tracked vs. not — and why

| Path | State | Reason |
| :--- | :--- | :--- |
| `hamsoo-addon/test/`, `scripts/` | tracked | Published test suite. CI runs it. |
| `dev/` | ignored | Internal debugging instruments. Deliberately not shipped. |
| `assets/` | tracked | GitHub must serve these or the READMEs show broken images. |
| `docs/DEBUGGING-REPORT.md` | tracked | Source comments cite R1–R6; ignoring it broke those references. |
| `docs/HANDOVER.md`, `docs/GROUND-TRUTH.md` | tracked | Current open work. Supersedes archive reports. |
| `hamsoo-addon/preview-shots/` | ignored | Raw generated output. Publish via `assets/` instead (§5). |
| `dist/`, `*.zip`, `node_modules/` | ignored | Build output. |
| `RELEASE-*.md`, `STORE-LISTING.md` | ignored | Internal release/marketing copy. |

**The rule to internalise:** anything under `dev/` is invisible to a cloner. A README or
doc may never reference a `dev/` path — GitHub would render a broken link. Move the
artifact into `assets/` first (§5).

---

## 3. Commands

From the repository root (forwards into the add-on):

```bash
npm run check      # syntax, JSON, manifest and i18n parity validation
npm test           # registered suite, headless Chromium
npm run build      # writes dist/hamsoo-chromium and dist/hamsoo-firefox
npm run verify     # check + build + test. THE gate before any commit.
npm run preview    # UI screenshots into hamsoo-addon/preview-shots/
npm run release:notes  # GitHub release body + store what's-new, from CHANGELOG.md
npm run version:check  # report every version site and fail on drift (§6)
npm run zip        # dist/hamsoo-chromium.zip + dist/hamsoo-firefox.zip
```

Version bumping is intentionally **not** forwarded; run it deliberately from the add-on:

```bash
cd hamsoo-addon && node scripts/bump-version.js <major.minor.patch>
```

`npm run verify` must print `check OK`, `build OK` (twice — once per target), and
`351 passed, 0 failed` (or `347 passed, 0 failed` outside git). Treat anything else as a failure, including a zero exit code with
unexpected output.

That count is a live number, not decoration: it is the figure the READMEs quote. If you add or
remove a test, update it in `README.md`, `README.fa.md` (Persian digits) and here in the same
commit, or the three drift apart the way the version numbers once did (§6).

Four of those are the `publishable` group, which asks `git check-ignore` what a fresh clone
would actually contain. Outside a git repository (a tarball, a vendored copy) they skip with a
printed note and the run reports 347. That is expected; CI always has git.

---

## 4. How the extension works

- **`src/content.js`** is the engine. It classifies elements, decides base direction, applies
  typography variables, converts digits, and manages shadow roots.
  - Direction is decided by the **first strong character** (matching `dir="auto"`), with a
    letter-ratio test only as a fallback. This is deliberate — see R3/R4 in the report.
  - `code`, `pre`, links and inputs are never flipped.
  - Everything it writes must be reversible. Disabling Hamsoo runs `removeInjections()` and
    restores the page without a reload (R6).
- **`src/background.js`** owns storage, sync, context menus, and the toggle command.
- **`src/popup.*` / `src/options.*`** are the two UIs. `src/i18n.js` holds one `DICT` with
  `fa`, `en`, and `ar` — all three must stay key-for-key identical or `npm run check` fails.
- **Settings** are clamped and versioned in `src/shared/settings-util.js` (`SCHEMA_VERSION`).
  Add a new setting there first, or migration and import validation will not know about it.

---

## 5. Screenshots: generating and publishing them

There are two independent image pipelines. Both write into `dev/` or a gitignored folder,
so there is always a second step to make an image visible on GitHub.

### 5a. UI screenshots (popup, options, fonts)

```bash
cd hamsoo-addon
npm run preview
```

Writes `preview-shots/{popup,options,fonts}-{lang}-{light|dark}.png`. **This folder is
gitignored** — the raw output is not publishable as-is.

### 5b. Before/after comparison

```bash
node dev/tools/compare-shots.mjs            # from the repo root
node dev/tools/compare-shots.mjs --scroll 400
```

Renders `dev/fixtures/chat-demo.html` twice in one browser session — once untouched, once
with `content.js` injected exactly as the manifest injects it — and composes a 16:9 sheet.
Outputs into `dev/shots/`: `before.png`, `after.png`, the two cropped panels,
`comparison.png`, and `comparison-stacked.png`.

It self-checks and exits non-zero if the extension did not apply, if the page threw, if the
two panels differ in size, or if the sheet drifts from 16:9. **Do not "fix" a height
mismatch by scaling one side** — that renders the two sides at different text sizes and
makes the comparison dishonest. Both panels are a fixed viewport crop at the same scroll
offset, so they are equal by construction.

### 5c. Publishing images into the repo

```bash
node dev/tools/publish-assets.mjs
```

Copies the real images from `dev/shots/` and `hamsoo-addon/preview-shots/` into the tracked
`assets/screenshots/` directory, under stable names the READMEs point at:

| Slot | Real source |
| :--- | :--- |
| `comparison.png` | `dev/shots/comparison.png` |
| `comparison-stacked.png` | `dev/shots/comparison-stacked.png` |
| `popup.png` / `popup-dark.png` | `preview-shots/popup-fa-light.png` / `-dark.png` |
| `options.png` | `preview-shots/options-fa-light.png` |
| `fonts.png` | `preview-shots/fonts-fa-light.png` |

If a source is missing, the tool renders a **placeholder card naming the exact command that
produces the real image**, so a gap is self-explanatory rather than a broken box. It prints
a `N real, M placeholder` summary and exits 1 if any slot file is absent.

> **Current state:** all six slots are real renders. The four UI shots have been published
> and are no longer placeholders. A generated placeholder is 1600×900 by construction, so
> `identify -format '%wx%h\n' assets/screenshots/*.png` tells you at a glance whether any slot
> has regressed to one.

**`welcome.png` has no slot.** `README.md` embeds `assets/screenshots/welcome.png`, but there
is no entry for it in `SLOTS`, so `publish-assets.mjs` neither refreshes it nor reports it
missing. It is hand-maintained today and will go stale silently. Add a slot for it, or accept
that and say so next to the image.

After publishing, the images are ordinary tracked files — commit them.

---

## 6. Releasing

### Step 1 — bump the version

```bash
cd hamsoo-addon && node scripts/bump-version.js 1.3.0
```

One command does the whole thing: it writes every site in
`scripts/version-sites.js`, greps for leftovers of the previous version, regenerates the
manifests, and then re-reads everything and fails if the tree is inconsistent.

| Site | What it carries |
| :--- | :--- |
| `hamsoo-addon/package.json` | the version everything else derives from |
| `hamsoo-addon/CHANGELOG.md` | prepends a `## [1.3.0] - YYYY-MM-DD` entry (`-m "summary"` fills the first bullet) |
| `release.json` | version, tag, date, and the `/vX.Y.Z/` download URLs |
| `hamsoo-addon/website/release.json` | the duplicate that Pages actually serves |
| `hamsoo-addon/website/index.html` | two static version chips |
| `hamsoo-addon/src/popup.html` | fallback chip in Persian digits (`popup.js` overwrites it at runtime) |
| `STORE-LISTING.md` | copy header, when the untracked file is present |

Useful flags: `--dry-run` reports without writing, `--no-build` skips regenerating `dist/`.

**Why the duplication matters.** `pages.yml` uploads only `hamsoo-addon/website/`, so the
root `release.json` is *not* the file the site serves. During the 1.3.0 release the served
copy and both site chips were still on a version that was never released at all.
That is what the registry, `npm run version:check`, and `test/version.test.js` exist to
prevent; a site whose pattern stops matching fails rather than passes.

### Step 2 — write the changelog entry

Replace the `_Describe changes here._` stub. Group under `### Added`, `### Fixed`,
`### Changed`. Write for users, not for the diff: describe the symptom that disappears
("turning Hamsoo off now completely undoes everything it added"), not the internal function
you renamed. Match the voice of the 1.3.0 entry.

### Step 3 — build, verify, package

```bash
npm run verify    # must be green before packaging
npm run zip       # dist/hamsoo-chromium.zip, dist/hamsoo-firefox.zip
```

Confirm `LICENSE` is present inside both `dist/` folders — AGPLv3 requires it to travel with
the distributed work, and `build.js` copies it explicitly because `src/` is filtered.

### Step 4 — tag and publish

```bash
git add -A
git commit -m "release: v1.3.0"
git tag v1.3.0
git push origin main --tags
```

Then create the GitHub release for that tag and **attach both zips**. `release.json` already
points at `releases/download/v1.3.0/hamsoo-chromium.zip`; if the release or its assets do
not exist, the website's download button is a live 404. Firefox is distributed through AMO,
so upload `hamsoo-firefox.zip` there separately; the AMO link is version-independent.

---

## 7. Everyday git hygiene

```bash
npm run verify
git add -A
git commit -m "fix: <symptom that disappears>"
git push origin main
```

- **Never commit without a green `npm run verify`.** CI runs the same three steps.
- Keep `README.md` and `README.fa.md` in **parity**. If you add a feature to one, add it to
  the other. The Persian file is not a translation afterthought — it previously omitted the
  one-click AMO install entirely and told Persian users to build from source.
- Do not remove `.gitattributes`. Without the LF pin, an editor can rewrite line endings and
  turn a 100-line change into a 4,300-line diff. That is how a three-line popup regression
  once slipped through review (R2).
- `git status` should stay clean. If a new file is genuinely internal, add it to
  `.gitignore` with a comment saying why.

---

## 8. Traps that have already bitten

These are not hypothetical. Each one cost real debugging time.

| Trap | What actually happens |
| :--- | :--- |
| **`test/run.js` uses an explicit require list** | Adding `test/foo.test.js` runs nothing. The suite reports green and your guard never executed. Register it in `run.js`. |
| **The build script is `hamsoo-addon/build.js`** | Not `scripts/build.js`. Calling the latter gives `MODULE_NOT_FOUND`. |
| **`schedule(root)` silently ignores shadow roots** | It does `root instanceof Element ? root : ROOT`, and a `ShadowRoot` is nodeType 11 — not an Element. Use `scan(root)`. |
| **A green assertion is not proof** | A regression was cleared by a check comparing `left` across a line-wrapping run. Verify layout claims visually; open the generated image. |
| **Read failures from stderr** | The harness prints failures via `console.error`. Redirecting with `2>/dev/null` leaves you with a count and no names. Use `2>&1`. |
| **Check exit status, not the tail of the output** | A truncated stack trace can read like success. |
| **A repro matching your hypothesis is not the user's bug** | R5 was a real fix for a bug the user did not have. Their text was a bare text node, unreachable by element-level classification. Reproduce from the reported DOM, not from a plausible one. |
| **Chromium path** | Set `HAMSOO_CHROME` if Playwright cannot find a browser. |

**Prove a guard by breaking the fix.** Comment out the fix, confirm the new test fails with
exactly the expected failures, restore it, confirm green. A guard that has never failed has
not been shown to guard anything.

---

## 9. Known open items

**Authoritative list:** [`docs/GROUND-TRUTH.md`](docs/GROUND-TRUTH.md) (all H01–H15 items resolved).
Implement via [`docs/HANDOVER.md`](docs/HANDOVER.md). Do not use `docs/archive/` as a backlog.

Still true:

- **Selector drift is the most likely real-world failure** after H01–H15. Chat sites change
  their DOM frequently. When a site breaks, check selectors first.
- `welcome.png` is embedded by `README.md` but has no `publish-assets.mjs` slot (§5c).

---

## 10. Where to look first

| Question | File |
| :--- | :--- |
| What should I implement next? | `docs/HANDOVER.md` then `docs/GROUND-TRUTH.md` (H01–H15) |
| Why is this historical code written this way? | `docs/DEBUGGING-REPORT.md` (R1–R6 only) |
| What changed for users? | `hamsoo-addon/CHANGELOG.md` |
| How do I contribute? | `.github/CONTRIBUTING.md` |
| How do I report a vulnerability? | `.github/SECURITY.md` |
| What does the extension support? | `README.md` / `README.fa.md` |
