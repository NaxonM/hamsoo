# Ground truth — open work as of 7 Sep 2026

**Product:** Hamsoo 1.3.0 (attached `hamsoo.zip`).
**Archive SHA-256:** `8e4d0d3c775bab8048d683e052fad10bcd739f5956fd0970d33a7e19fea3e102`
**Baseline (unpatched zip):** `npm run check` OK; `npm test` **276 passed, 0 failed** (git publishability tests skipped; zip has no `.git`). Regenerated `dist/` matched the archive.

**Implementation status:** `storage.sync` purged. All H-items resolved: **H01, H02, H04, H05, H08, H09, H10, H11, H12, H13, H14, H15** done; H03, H06, H07 cancelled with cloud sync.
**Tests:** `npm run check` OK; `npm test` **323 passed, 0 failed** (git publishability skipped without `.git`; 327 in git). i18n 175 keys.

This file is the **only** current open-issue list. Detailed reproduction, root cause, fix steps, and regression gates live in the Notion audit (see `HANDOVER.md`). Older B1–B44 / “Status: Open” text in `docs/archive/` is not current.

Line numbers below are for this 1.3.0 archive, relative to `hamsoo-addon/`, and may have shifted after the sync purge. Search by H-id / symptom, not by stale line numbers.

## Do first (P1)

| ID | Issue | Where |
| --- | --- | --- |
| ~~**H01**~~ | **Done.** Popup/fonts send `HAMSOO_PATCH_SETTINGS`; background applies patches on a fresh read; pending popup edits rebase on `storage.onChanged`. | `src/fonts.js`; `src/popup.js`; `src/background.js`; `src/shared/settings-util.js` |
| ~~**H02**~~ | **Done.** `recognizeImportedSettings` rejects `{}` / unrelated JSON; import confirms, stages fonts, and rolls back on a failed save. | `src/popup.js`; `src/shared/settings-util.js` |
| ~~**H04**~~ | **Done.** Unlisted http(s) tabs stay active only while they match `customSites`; removal persists immediately so the open tab tears down. | `src/content.js`; `src/popup.js`; `src/shared/settings-util.js` |
| ~~**H10**~~ | **Done.** Selection-fix skips partial containers (unselected siblings); teardown restores original inline direction styles from a JSON snapshot. | `src/background.js`; `src/content.js` |

## Then (P2)

| ID | Issue | Where |
| --- | --- | --- |
| ~~**H05**~~ | **Done.** Removing a picked selector persists immediately (`persistNow()`) and content script unstyles dropped selectors. | `src/popup.js`; `src/content.js` |
| ~~**H08**~~ | **Done.** `sniffFontFormat` checks sfnt/WOFF magic bytes; corrupt or renamed files rejected on upload and import. | `src/fonts.js`; import path `src/popup.js`; `src/shared/settings-util.js` |
| ~~**H09**~~ | **Done.** Font remove and add await storage write; toast reports failure if persistence fails rather than claiming success. | `src/fonts.js` |
| ~~**H11**~~ | **Done.** Bare English runs in RTL blocks wrapped in `data-hamsoo-run="ltr"` (`unicode-bidi: isolate`); trailing colons/dots stay right; reversible on teardown. | `src/content.js`; `src/content.css` |
| ~~**H12**~~ | **Done.** Dropzone given `tabindex="0"`; hidden file input clipped with CSS instead of `display:none` so keyboard reaches Add font. | `src/fonts.html`; `src/fonts.css`; `src/fonts.js` |
| ~~**H13**~~ | **Done.** Popup `aria-label`s wired through `data-i18n-attr` so English/Arabic interfaces don't keep hardcoded Persian labels. | `src/popup.html`; `src/i18n.js` |
| ~~**H15**~~ | **Done.** Shadow DOM typography rules exclude `pre` and `code`, matching the light DOM measure rule. | `src/content.js`; `src/content.css` |

## Polish (P3)

| ID | Issue | Where |
| --- | --- | --- |
| ~~**H14**~~ | **Done.** Fonts page follows explicit dark/light and accent from settings via `html.dark`, instead of relying solely on `prefers-color-scheme`. | `src/fonts.css`; `src/fonts.js`; `src/theme-init.js` |

## Cancelled — cloud sync removed

Do **not** re-open these, and do **not** rebuild `storage.sync`, `syncVersion`, merge/tombstones, or `remoteOnly` fonts.

| ID | Why cancelled |
| --- | --- |
| **H03** | Footer “Synced across devices” was a lie about `storage.sync`. The feature and the footer are gone. |
| **H06** | Additive `customSelectors` union only existed to merge cloud copies. Local deletes now just delete. |
| **H07** | `remoteOnly` font metadata only existed because slim sync could not carry font bytes. |

Settings live in `storage.local`. Cross-device move is **export/import** (still needs H02). `syncCustomSites` is **not** cloud sync — it registers content scripts for custom host permissions. Keep it.

On install/startup the background **removes** leftover `storage.sync` `settings` so an old profile copy cannot resurrect. Schema v4 strips leftover `syncVersion` and `remoteOnly` font rows.

## Related, not separate tickets

Fold these into the H-item in parentheses if you touch that code:

- Font remove does not scrub `siteOverrides[*].font` (H01 / H09).
- Custom-site status in the popup can read “active” independent of the global enable switch (H04).

## Closed in 1.3.0 — do not re-open without new evidence

Verified present in this tree during the 7 Sep audit:

- Popup `normalize()` preserves `support` and `onboardedVersion` (old B1).
- `restoreDigits` on non-RTL exits (old B2).
- Native value setter for React-ish paste (old B6).
- `kimi.com` / `www.chatgpt.com` / `www.claude.ai` (and related) host matches (old B12 / B13).
- Background mutations go through `updateStoredSettings` (old “four writers” cluster, **except** popup/fonts which still call `persistSettings` with a full snapshot — that leftover **is** H01).

R1–R6 in `DEBUGGING-REPORT.md` are **fixed and guarded**. Keep those guards. Do not rewrite popup scroll CSS without reading R1.

## Limits of the 7 Sep evidence

Reproduced in Chromium fixtures with mocked extension APIs, or by executing unmodified helpers. **Not** done: installed-extension permission lifecycle, Firefox, authenticated live chat sites, screen readers. A fixture proof is not a live-DOM proof.
