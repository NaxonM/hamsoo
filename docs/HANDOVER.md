# Handover — implement remaining H-items

You are taking over Hamsoo after a **read-only** 7 Sep 2026 audit, a purge of browser `storage.sync`, and **H01** (settings writes go through background patches). Remaining work is H02, H04, H05, H08–H15. H03, H06, H07 are cancelled with cloud sync.

## Read in this order

1. This file.
2. [`GROUND-TRUTH.md`](GROUND-TRUTH.md) — the only current backlog.
3. The Notion audit (same findings, with reproduction, fix guide, regression gate). If you do not have Notion, GROUND-TRUTH.md plus the original source is enough to start; do not invent extra tickets from `docs/archive/`.
4. Root [`AGENTS.md`](../AGENTS.md) — how to build, test, and avoid known traps.
5. [`DEBUGGING-REPORT.md`](DEBUGGING-REPORT.md) **only** when a source comment cites R1–R6, or you are changing popup layout CSS (read R1 first).

Do **not** treat `docs/archive/` or any “Status: Open” B1–B44 text as the backlog.

## Non-negotiable rules

- **One source tree:** `hamsoo-addon/src/`. No bundler. What you read is what ships.
- **Register tests in `hamsoo-addon/test/run.js`.** Adding `foo.test.js` without registering it is a silent no-op.
- **Fail first.** For each H-item, add a reproduction that fails on current code, then fix, then prove the test fails if the fix is reverted.
- **`npm run verify` must stay green.** Never commit red. CI is the same three steps as verify.
- **Do not hand-edit version numbers.** `npm run bump`. Registry: `hamsoo-addon/scripts/version-sites.js`.
- **One settings mutation owner.** Background owns writes via `HAMSOO_PATCH_SETTINGS` / `updateStoredSettings`. Do not add another `storage.local.set({ settings })` caller.
- **Keep README.md and README.fa.md in parity** if user-facing docs change.
- **Do not reference `dev/`** from tracked docs (gitignored; GitHub would 404).
- **Do not delete `docs/DEBUGGING-REPORT.md`.** Source comments cite R-numbers.
- **Persian/English/Arabic i18n:** new UI strings need all three dictionaries plus `data-i18n` / `data-i18n-attr` as appropriate.
- **Do not rebuild `storage.sync`.** Settings are `storage.local` only. Cross-device move is export/import (H02). `syncCustomSites` is content-script registration, not cloud sync — keep it.

## Implementation order

Do not start P2 while P1 still loses user data.

### Wave 1 — settings integrity (H01, H02)

H01 is the architectural fix: background is the only writer; UI sends narrow commands; popup pending edits rebase on `storage.onChanged` instead of being replaced. H02 is import validation + confirm + no side effects on garbage JSON. Do these together; import is another full-object writer.

### Wave 2 — user control (H04, H10)

Custom-site removal must teardown the open tab. Selection fix must not inherit onto unselected siblings and must restore original inline styles.

### Wave 3 — fonts / picked elements (H05, H08, H09)

Picked-element cleanup; reject undecodable fonts; never announce success on a failed save.

### Wave 4 — rendering / a11y / polish (H11, H12, H13, H15, H14)

Bare-text bidi (hard; keep it last among P2). Keyboard font upload. Localized aria names. Shadow/light CSS parity. Theme tokens on the fonts page.

## Suggested commit shape

One commit per H-id (or per tightly coupled pair, e.g. H01+H02 if they share the write funnel):

```text
fix(H01): serialize settings writes through background
```

Include the failing test in the same commit as the fix. Mention the H-id so the audit can be checked off.

## How to run

From `hamsoo-addon/` (or repo root forwarder):

```bash
npm run check      # syntax, JSON, i18n, version sites
npm test           # registered suite; Playwright/Chromium
npm run verify     # check + build + test — required before commit
```

Set `HAMSOO_CHROME` if Playwright cannot find Chromium.

Unpatched 1.3.0 zip (7 Sep 2026): **276 passed, 0 failed**. After the sync purge the count is lower because cloud-merge tests were removed; do not restore them. `publishable.test.js` is skipped without git. After you add tests, update AGENTS.md from `test/run.js`, not from memory.

## Out of scope until remaining H-items are done

- Live authenticated ChatGPT/Claude/Gemini sweeps (do a pass after wave 2/4, not instead of fixtures).
- Firefox permission/command QA (required before release, not before the first H01 test).
- Rebuilding cross-device `storage.sync` (explicitly removed).
- New features, store listing copy, version bump, or drive-by refactors.
- Re-opening B1, B2, B6, B12, B13, H03, H06, H07, etc. because an old file says “Open”.

## Done when

- Every remaining H-item regression gate in the 7 Sep audit has an automated test that failed on unpatched 1.3.0 and passes after the fix.
- `npm run verify` is green.
- Fonts/popup/background no longer persist a stale full settings object.
- Import of `{}` does not reset settings.
- Removing a custom site or picked selector undoes live styling in that document.
- Invalid fonts and failed saves cannot show success.
- AGENTS.md §9 lists no remaining H-items (or only explicitly deferred follow-ups).
