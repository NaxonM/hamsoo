> **SUPERSEDED.** Historical only. Do not implement from “Status: Open” below.
> Current work is H01–H15 in [`../GROUND-TRUTH.md`](../GROUND-TRUTH.md) and [`../HANDOVER.md`](../HANDOVER.md).
> Many B-items here were already fixed in 1.3.0.

# Hamsoo — Independent Bug Review (2026-07-29)

Independent source review of the attached Hamsoo zip. **Did not run the project test suite.** Findings from reading `content.js`, `background.js`, `popup.js`, `settings-util.js`, and related UI scripts.

---

## Status

- **Scope:** `hamsoo-addon/src` (+ shared util)
- **Method:** static review + small independent probes (not project tests)
- **Last updated:** 2026-07-29

---

## Critical

### B1 — Popup `normalize()` drops `support` and `onboardedVersion`

**Where:** `popup.js` → `normalize()` return object; used by `init()`, import, and `storage.onChanged`.

**What:** Rebuilds settings from a fixed field list and never copies `support` or `onboardedVersion`.

**How it bites:**

1. Background records usage days into `settings.support`
2. User opens popup → `settings = normalize(stored)` → fields vanish in memory
3. Any save (toggle/slider) → `persistSettings(settings)` writes the stripped object
4. Engagement, dismiss, snooze, and install clock are wiped

`resolveSupport()` can write `support` once; the next normal save deletes it again.

**Impact:** Feedback ask never stabilizes; “don’t ask again” / snooze can reset; usage engagement lost on popup save.

**Fix:** Preserve both fields in `normalize()`:

```jsx
onboardedVersion: HamsooUtil.normalizeOnboardedVersion(raw.onboardedVersion),
support: HamsooUtil.normalizeSupport(raw.support, Date.now()),
```

**Status:** Open

---

## High

### B2 — Localized digits stick when a block leaves the RTL path

**Where:** `content.js` → `classify()`

**What:** `localizeDigits` / `restoreDigits` run only on the RTL branch. LTR / mixed / unmark paths never restore.

**Impact:** After streaming edits, list promotion, or reclassification, Persian/Arabic-Indic digits can remain in host DOM text.

**Fix:** Call `restoreDigits(el)` on every non-RTL exit for non-editables.

**Status:** Open

---

### B3 — Element picker bypasses the persist funnel

**Where:** `background.js` → `startElementPicker` click handler

**What:** Writes with raw `storage.local.set({ settings })` — no `persistSettings`, no `syncVersion` bump, no sync mirror.

**Impact:**

- Picked selectors may not sync cross-device
- Later sync pull can overwrite local `customSelectors`
- RMW races with toggle / usage recording

**Fix:** Route through background + `persistSettings` (merge-write).

**Status:** Open

---

### B4 — Full-object read-modify-write races

**Where:** `recordUsageDay`, `toggleEnabled`, element picker, `openWelcomePage`

**What:** Each loads the whole `settings` object, mutates one field, writes it back. Last writer wins.

**Example:** Usage-day write can undo a concurrent toggle; toggle can drop a just-picked selector.

**Fix:** Serialize settings writes in the background, or apply merge-patches.

**Status:** Open

---

## Medium

### B5 — `looksLikeCode()` HTML false positives

**Where:** `content.js` → `CODE_STRONG_RE`

**Pattern:** `/<\/?[a-z][\s\S]*?>/i`

**Probed hits on prose:**

- `Use the <b>bold</b> option` → code
- `Compare x <a and then y> z` → code

**Impact:** RTL prose mis-marked as code → forced LTR / skipped Persian handling.

**Fix:** Tighten tag matcher or drop the loose alternative.

**Status:** Open

---

### B6 — Paste bidi strip vs React controlled inputs

**Where:** `content.js` paste listener

**What:** `preventDefault` + assign `target.value` + synthetic `input` event.

**Impact:** On React-controlled composers (ChatGPT etc.), framework state often ignores the assignment; cleaned text snaps back or DOM/state diverges.

**Fix:** Native value setter on `HTMLInputElement` / `HTMLTextAreaElement.prototype`, then proper bubbling `input` / `InputEvent`.

**Status:** Open

---

### B7 — `openWelcomePage` writes a partial settings object

**Where:** `background.js` → `openWelcomePage`

**What:** May write only `{ onboardedVersion: 1 }` via raw `storage.local.set`, skipping schema migration shape and sync mirror.

**Impact:** Widens RMW/sync window; non-schema payload until next full save.

**Status:** Open

---

## Lower / polish

### B8 — Accented Latin ignored by direction heuristics

`firstStrongDirection` only treats `[A-Za-z]` as LTR. Leading `É` / `ü` / `café…` count as neutral → mis-classify with Persian.

**Status:** Open

### B9 — Popup `DEFAULTS.schemaVersion: 2` while util is `3`

Footgun if anything trusts `DEFAULTS` as live schema (normalize/migrate usually paper over it).

**Status:** Open

### B10 — Shadow CSS incomplete vs `content.css`

`shadowCss()` mirrors core marks/typography but not NotebookLM/Kimi deep descendant overrides. Open-shadow hosts on those apps may stay partially unstyled.

**Status:** Open

---

## Suggested fix order

1. **B1** — data loss, user-visible (also unblocks feedback-ask product)
2. **B2 + B11** — digit corruption in DOM
3. **B3 + B4 + B17** — single settings write funnel / serialized merges
4. **B12 + B13** — host coverage gaps (users simply never get injection)
5. **B5 + B6 + B14** — classifier / paste / pattern validation
6. **B7, B15–B20** — hardening / polish

---

## Deeper pass (B11+)

Continued review of nested scan behavior, host maps, match-pattern validation, font removal, sync merge, export path, and src/dist/i18n parity. **i18n key parity and src↔dist text drift are clean** (en/fa/ar DICT 177/177/177; `_locales` match; zero src/dist JS/CSS/HTML drift in the shipped trees).

### B11 — High: Ancestor RTL digit walk corrupts LTR descendants

**Where:** `content.js` → `classify()` + `localizeDigits()`

**What:** `SELECTOR` includes both wrappers (`.markdown`, `.prose`, `[data-message-author-role]`, …) **and** leaf blocks (`p`, `li`, …). Scan order is outer-first. When a wrapper is RTL, `localizeDigits(wrapper)` TreeWalks **all** descendant text nodes and converts ASCII digits — including inside later-classified LTR children.

Those LTR children take the `markLTR` / unmark path and **never** `restoreDigits` (see B2).

**Repro shape:**

- Parent `.markdown` mostly Persian → RTL → digits localized under whole tree
- Child English `p` (“Price is 12 dollars”) → LTR mark, digits stay `۱۲`

**Impact:** English/code-adjacent numbers inside mixed threads become Persian/Arabic-Indic and are not reverted.

**Fix:** Only localize digits on the element’s **own** text (or skip nodes whose nearest classified block is not RTL); always restore on non-RTL exits (B2).

**Status:** Open

---

### B12 — High: `kimi.com` apex not covered

**Where:** `manifest.base.json` content_scripts; `SITE_HOSTS` in `content.js` / `popup.js`

**What:** Manifest matches `www.kimi.com` and `kimi.moonshot.cn` only. Bare `kimi.com` is absent from manifest and `SITE_HOSTS`. `siteKey()` suffix check does **not** treat `kimi.com` as `www.kimi.com`.

Already noted historically in `docs/DEBUGGING-REPORT.md` minor items — **still present** in this tree.

**Impact:** Users on `https://kimi.com/...` get no content script; popup treats the tab as an unlisted custom site.

**Fix:** Add `https://kimi.com/*` to manifest matches and `'kimi.com': 'kimi'` to both `SITE_HOSTS` maps.

**Status:** Open

---

### B13 — Medium/High: Missing `www.` (and similar) host variants

**Where:** manifest `content_scripts.matches` vs real redirects

**Missing from manifest (examples):**

- `www.chatgpt.com` (only `chatgpt.com`)
- `www.claude.ai`
- `www.grok.com`
- `www.poe.com`

Note: `siteKey()` *would* resolve `www.chatgpt.com` → `chatgpt` **if** the script were injected — but without a match pattern, injection never runs.

`www.perplexity.ai` and apex `perplexity.ai` are both listed (good). Kimi is the inverse problem (www yes, apex no) — B12.

**Impact:** Depending on how each product redirects, some users land on a host where Hamsoo silently does nothing.

**Fix:** Add the common `www.` / apex pair for every built-in site; consider `*.domain` only where safe.

**Status:** Open

---

### B14 — Medium: `isValidMatchPattern` accepts over-broad / dubious patterns

**Where:** `settings-util.js` → `MATCH_PATTERN_RE`

**Probed:**

- `https://*.com/*` → **accepted**
- `https://*.co.uk/*` → **accepted**
- `https://a_b.com/*` → rejected (underscores)
- `https://[::1]/*` → rejected (IPv6)

**Impact:** Import or a crafted custom site can request extremely broad host permissions; browser may reject at register time (partial failure path) or grant more than the user intends if accepted.

**Fix:** Reject single-label public suffixes after `*.`; optionally align with browser’s own match-pattern parser.

**Status:** Open

---

### B15 — Medium: Removing a custom font leaves site overrides pointing at it

**Where:** `fonts.js` remove handler

**What:** On remove, only `settings.font === custom:id` is reset to Vazirmatn. `settings.siteOverrides[*].font` values of `custom:id` are left intact. Content `normalize()` still accepts any `custom:` string without checking IDB/`remoteOnly`.

**Impact:** Per-site override keeps selecting a deleted font → `HAMSOO_GET_FONT` returns null → silent fallback / missing face while UI shows the old name in overrides.

**Fix:** When removing font `id`, scrub global + all overrides; content should fall back if bytes missing.

**Status:** Open

---

### B16 — Medium: Sync merge can reset `onboardedVersion` to 0

**Where:** `settings-util.js` → `mergeSyncedSettings`

**What:** Uses `Math.min(local, remote)` for `onboardedVersion`. A remote/slim copy with `0` or missing (normalizes to 0) pulls a fully onboarded device back to `0`.

**Impact:** Marker lost across devices; interacts badly with B1 (popup already drops the field) and reinstall/tour edge paths. Tour auto-open is install-only, so this is mostly state corruption rather than a popup loop — still wrong.

**Fix:** Prefer `Math.max` (seen-on-any-device stays seen), or treat onboarded as local-only like `usageDays`.

**Status:** Open

---

### B17 — Medium: Standing rule still violated — multiple raw `storage.local.set({ settings })`

**Where:** `background.js` (migrate, pullFromSync, openWelcome, recordUsageDay, picker, toggle fallback, SET_LANG fallback), `fonts.js` fallback, `popup.js` fallback

Their own `DEBUGGING-REPORT.md` rule: *exactly one settings write path — `persistSettings()`*. Several intentional exceptions exist (usage days, sync pull), but **picker + openWelcome** are not justified exceptions and reintroduce Cluster A failure modes.

**Status:** Open (umbrella for B3/B4/B7)

---

### B18 — Low/Medium: Export payload omits `support` / `onboardedVersion` after popup normalize

**Where:** `popup.js` → `exportSettings` uses in-memory `settings` post-`normalize()`

**What:** Because of B1, exports cloned from popup state lack engagement/onboarding fields even if storage still had them (until the next save wipes storage too).

**Impact:** Backups silently drop feedback-ask state; restore cannot preserve dismissals.

**Status:** Open (symptom of B1; fix B1 first)

---

### B19 — Low: Toggle dedupe is TOCTOU across worker generations

**Where:** `background.js` → `toggleEnabled`

**What:** Memory claim then async `storage.session` read/write. Two fresh workers can both observe `lastToggle = 0` before either writes → double toggle → net no-op for one keypress.

**Impact:** Intermittent “shortcut does nothing” on Chromium MV3 under worker eviction (the bug the session guard tried to fix, incompletely).

**Fix:** Atomic compare-and-swap in session storage, or always toggle in one serialized SW queue.

**Status:** Open

---

### B20 — Low: `ensureFont` drops the previous face before the next load finishes

**Where:** `content.js` → `ensureFont`

**What:** On font key change, `dropLoadedFont()` runs immediately, then async load. During the gap, CSS still references the new family name with no face → brief fallback/FOUT. Superseded loads are handled via `fontLoadSeq` (good), but the gap remains.

**Status:** Open

---

### B21 — Low: Content accepts `custom:` fonts that popup would reject

**Where:** `content.js` `normalize()` vs `popup.js` `normalize()`

**Popup:** `custom:` only if `customFonts` has non-`remoteOnly` id.

**Content:** any `custom:` prefix string is kept; load fails soft if IDB miss.

**Impact:** Desync between UI selection and content behavior after sync of slim font metadata (`remoteOnly` rows).

**Status:** Open

---

### Checked clean (this pass)

- `_locales` en/fa/ar key sets identical
- `i18n.js` DICT keys identical across fa/en/ar (177)
- All HTML `data-i18n*` and `t('…')` keys resolve in fa DICT
- `src/` vs `dist/hamsoo-chromium` and `dist/hamsoo-firefox` text assets: **0 diffs** (manifest intentionally differs)
- Build variant parity design (byte-identical non-manifest files) looks sound

---

## Inventory summary

| ID | Sev | Area | One-liner |
| --- | --- | --- | --- |
| B1 | Critical | popup normalize | Drops `support`  • `onboardedVersion` on every save |
| B2 | High | content digits | No restore when leaving RTL |
| B3 | High | picker | Raw storage write, no syncVersion |
| B4 | High | settings | Full-object RMW races |
| B5 | Medium | code detect | HTML-ish prose → code |
| B6 | Medium | paste | React controlled inputs |
| B7 | Medium | welcome | Partial settings write |
| B8 | Low | bidi | Accented Latin ignored |
| B9 | Low | schema | DEFAULTS schemaVersion stale |
| B10 | Low | shadow | Incomplete CSS mirror |
| B11 | High | content digits | Ancestor localize hits LTR kids |
| B12 | High | hosts | `kimi.com` apex missing |
| B13 | Med/High | hosts | Missing www variants |
| B14 | Medium | patterns | `*.com` accepted |
| B15 | Medium | fonts | Overrides keep deleted font |
| B16 | Medium | sync | onboardedVersion min→0 |
| B17 | Medium | architecture | Multiple raw settings writers |
| B18 | Low/Med | export | Backup misses support state |
| B19 | Low | toggle | Session dedupe TOCTOU |
| B20 | Low | fonts load | Face drop before load |
| B21 | Low | normalize | Content vs popup custom font rules |

---

## Even deeper pass (B22+)

Third pass: code-detection fuzzing of real English openers, sync quota, context-menu side effects, picker selector breadth, editable coverage, IDB lifecycle, digits-script case folding, and merge wipe semantics.

### B22 — High: `looksLikeCode()` keyword list matches ordinary English sentence openers

**Where:** `content.js` → `CODE_STRONG_RE` / `looksLikeCode()` → `classifyPre` / `classifyInlineCode` only (not plain `p`)

**What:** The strong-keyword alternation is anchored with `(^|\n)\s*`, so **any string that begins with** a listed token is “code”. The list includes everyday English openers: `if`, `for`, `new`, `class`, `from`, `try`, `return`, `case`, `do`, `while`, `public`, `private`, `static`, `void`, `package`, `interface`, `switch`, `catch`, `throw`, `finally`, `update`, `delete`, `select`, `print`, `export`, `import`, `using`, `module`, `require`, `async`, `await`, …

**Independent probe:** **35/35** crafted prose openers hit, including:

- `If you want, I can help.`
- `New features include RTL.`
- `From experience, RTL is hard.`
- `Class schedules differ.`
- `Update your browser.`
- `Delete old files carefully.`

Also still hits (from earlier): HTML-ish spans, `user@x.com` angle emails, `/* … */` prose, multi-`;`, multi-`=>`/`->`/`::`, three `{aside}` pairs.

**Impact:** A `<pre>` / inline `<code>` whose text is Persian explanation that **opens** with English (common in AI answers and tutorials) is forced onto the LTR/code path and skips RTL marking — Persian inside “code-shaped” blocks renders wrong. Scope is pre/code, not every paragraph (narrower than a full-page disaster, still core feature).

**Fix:** Require code keywords to look like code (e.g. trailing `(` / `{` / `=` / `;`, or line-anchored only inside highlighter attrs), and drop prose-common tokens (`new`, `class`, `from`, `if`, …) from the bare strong list. Keep B5 HTML tightening.

**Status:** Open (supersedes/extends B5 severity for pre/code)

---

### B23 — High: `storage.sync` write failures are swallowed; large settings exceed ~8KB item quota

**Where:** `settings-util.js` → `persistSettings`

```jsx
api.storage.sync.set(...).then(() => true, () => true)  // errors → success
```

**Probe:** A realistic “power user” slim payload (many `customSites`, `customSelectors`, `siteOverrides`, 12 font metas) serialized to **~22KB**. Chrome’s `QUOTA_BYTES_PER_ITEM` is **8192**.

**Impact:** Local save looks fine; cross-device sync silently stops. No UI signal (`renderSyncStatus` only shows version, not last error). Users believe sync works (B1/B3 already weaken it further).

**Fix:** Surface sync failure; shard or cap synced fields; omit bulky `customSelectors` from sync or compress; check `chrome.runtime.lastError` / rejection reason.

**Status:** Open

---

### B24 — Medium/High: Context-menu “fix selection” writes permanent inline styles

**Where:** `background.js` → `fixSelection` / `setRTL`

**What:** Sets `dir="rtl"` plus inline `direction` / `text-align` / `unicode-bidi` with `!important` on the selection ancestor and all descendant `p, div, li, span, h1–h6, td, th`.

These are **not** `data-hamsoo*` marks. `removeInjections()` / disable teardown never clears them.

**Impact:** One-shot fix permanently mutates the host page until full reload; disabling Hamsoo does not undo it; can fight the live content script on the same nodes.

**Fix:** Use the same attribute + CSS pipeline as the content script, or record originals and reverse on disable / navigation.

**Status:** Open

---

### B25 — Medium: Element picker prefers broad class selectors

**Where:** `background.js` → `selectorFor`

**What:** If the node has classes, it builds `tag.class1.class2…` and accepts it when `querySelectorAll(sel).length` is **truthy** (any count ≥ 1). IDs require uniqueness (`=== 1`); classes do not.

**Impact:** Picking one chat bubble can save a selector matching every bubble (or shared chrome). Combined with B3 (no sync funnel) and content `extraSelector` union, Hamsoo may restyle far more than the user clicked — including LTR chrome.

**Fix:** Prefer unique selectors; if class-based, require a small match count or a stabilizing ancestor; allow user confirm with match count.

**Status:** Open

---

### B26 — Medium: Reading-measure `max-width: … !important` on all non-table RTL blocks

**Where:** `content.css`

```css
html[data-hamsoo-on][data-hamsoo-measure] [data-hamsoo="rtl"]:not(td):not(th) {
  max-width: var(--hamsoo-measure, 70ch) !important;
}
```

**Impact:** On flex/grid chat UIs, forcing `max-width` on `p`/`li`/wrappers shrinks bubbles, breaks alignment, or leaves awkward empty space. `li` and nested wrappers are included. No exclusion for flex children / message chrome.

**Fix:** Limit measure to article-like blocks (e.g. direct prose containers), or use a softer constraint; exclude `li` and known bubble roles.

**Status:** Open

---

### B27 — Medium: `contenteditable` coverage only matches `="true"`

**Where:** `content.js` `SELECTOR` / `EDITABLE_SELECTOR`

**What:** Only `[contenteditable="true"]`. Misses:

- `contenteditable` (empty boolean attribute)
- `contenteditable="plaintext-only"` (Chromium composers increasingly use this)
- `contenteditable=""`

**Impact:** Punctuation `dir=auto` helper and editable classification never attach on those composers; paste bidi strip already skips contenteditable by design — plaintext-only fields get neither path.

**Fix:** Use `[contenteditable]:not([contenteditable="false"])` (and decide paste policy for plaintext-only).

**Status:** Open

---

### B28 — Medium: Sync merge — remote empty `customSelectors: {}` wipes device picks

**Where:** `mergeSyncedSettings` (base copy then overwrite by remote keys)

**Probe:** Local has selectors; remote `{ customSelectors: {} }` → merged selectors **empty**.

**Impact:** A device that cleared picks (or normalized to `{}`) publishes empty map and erases another device’s picker list on pull. Related to B3 (picks often never syncVersion-bump, so timing is messy either way).

**Fix:** Per-host union merge (like fonts), or treat empty remote as “omit key”.

**Status:** Open

---

### B29 — Low/Medium: `normalizeDigitsScript` is case-sensitive

**Where:** `settings-util.js` → `v === 'ar' ? 'ar' : 'fa'`

**Probe:** `'AR'` / `'Ar'` → **`fa`** (silent). Only exact `'ar'` works.

**Impact:** Hand-edited import/backup or future UI bug can think Arabic-Indic is selected while content runs Persian digits.

**Fix:** Lowercase before compare.

**Status:** Open

---

### B30 — Low: `HamsooFontDB` never closes IndexedDB connections

**Where:** `fontdb.js` — every `put`/`get`/`remove`/`list` opens a new DB and drops the handle

**Impact:** Connection churn under font manager / repeated `HAMSOO_GET_FONT`; possible `Connection leaked` warnings and slower repeated opens in long-lived SW/pages. Not user-visible corruption, but sloppy under load.

**Fix:** Cache one open promise; close on idle if desired.

**Status:** Open

---

### B31 — Low: `fixSelection` over-applies to entire subtrees

**Where:** same as B24

**What:** After targeting the selection ancestor, it runs `querySelectorAll('p, div, li, span, h1…')` and forces RTL on **all** descendants, including pure LTR spans and structure.

**Impact:** One context-menu click can RTL-ize an entire message card (code, English quotes, UI chips nested inside).

**Status:** Open (worsens B24)

---

### B32 — Low: English-leading mixed Hebrew/Persian at ratio ≥ 0.3 becomes RTL base

**Where:** `isRTLBlock`

**Probe:** `Hello שלום` → `rtl=true` (first-strong LTR, ratio ~0.44 ≥ 0.3).

**Impact:** Intentional for “mostly Hebrew line with English lead-in”, but English sentences that merely end with a Hebrew/Persian word near the threshold can flip. Borderline product/heuristic issue; document or add last-strong guard similar to `closesInRTL` inverse.

**Status:** Open (heuristic; confirm with real screenshots before “fixing”)

---

### B33 — Low: Pure Arabic-Indic / Persian digit strings count as RTL letters

**Where:** `RTL_RE` includes `\u0600-\u06FF` (covers `۰-۹` and `٠-٩`)

**Probe:** `۱۲۳۴۵` → `isRTLBlock true`.

**Impact:** Digit-only nodes get RTL marks and typography; usually harmless, occasionally odd in tables/scores.

**Status:** Open (polish)

---

### Deeper pass — checked still clean / non-issues

- Support Later/Never buttons **are** bound (via `for` loops) — earlier “unused id” heuristic was a false alarm
- HTML↔JS id refs for popup/welcome/fonts/options: no missing JS targets
- No `innerHTML` assignment in extension JS (i18n uses `textContent`) — good XSS posture
- `applyDom` does not clobber listeners
- Version registry: `package.json` / both `release.json` copies at **1.3.0** (aligned in this tree)
- Popup `height: 100%` regression R1 remains guarded in CSS comments (not reintroduced)
- `extraSelector` empty string is guarded before `querySelectorAll`
- `promoteContainer` short-circuits once `data-hamsoo-box=rtl` is set (no infinite recurse)

---

## Inventory summary (full)

| ID | Sev | Area | One-liner |
| --- | --- | --- | --- |
| B1 | Critical | popup normalize | Drops `support`  • `onboardedVersion` on every save |
| B2 | High | content digits | No restore when leaving RTL |
| B3 | High | picker | Raw storage write, no syncVersion |
| B4 | High | settings | Full-object RMW races |
| B5 | Medium | code detect | HTML-ish prose → code |
| B6 | Medium | paste | React controlled inputs |
| B7 | Medium | welcome | Partial settings write |
| B8 | Low | bidi | Accented Latin ignored |
| B9 | Low | schema | DEFAULTS schemaVersion stale |
| B10 | Low | shadow | Incomplete CSS mirror |
| B11 | High | content digits | Ancestor localize hits LTR kids |
| B12 | High | hosts | `kimi.com` apex missing |
| B13 | Med/High | hosts | Missing www variants |
| B14 | Medium | patterns | `*.com` accepted |
| B15 | Medium | fonts | Overrides keep deleted font |
| B16 | Medium | sync | onboardedVersion min→0 |
| B17 | Medium | architecture | Multiple raw settings writers |
| B18 | Low/Med | export | Backup misses support state |
| B19 | Low | toggle | Session dedupe TOCTOU |
| B20 | Low | fonts load | Face drop before load |
| B21 | Low | normalize | Content vs popup custom font rules |
| B22 | High | code detect | English openers → code in pre/code |
| B23 | High | sync | Quota fail swallowed; slim ≫ 8KB |
| B24 | Med/High | context menu | Permanent inline RTL styles |
| B25 | Medium | picker | Broad class selectors accepted |
| B26 | Medium | CSS measure | `max-width !important` breaks flex bubbles |
| B27 | Medium | editable | Only `contenteditable="true"` |
| B28 | Medium | sync merge | Empty remote selectors wipe local |
| B29 | Low/Med | digits | `AR` silently becomes `fa` |
| B30 | Low | IDB | Connections never closed |
| B31 | Low | context menu | fixSelection nukes whole subtree |
| B32 | Low | bidi heuristic | English+Hebrew ratio flip |
| B33 | Low | bidi | Digit-only strings → RTL |

---

## Updated fix order (after third pass)

1. **B1** — data loss
2. **B2 + B11** — digit DOM corruption
3. **B22 + B5** — pre/code false code detection
4. **B3 + B4 + B17 + B23 + B28** — settings/sync integrity
5. **B12 + B13** — host injection gaps
6. **B24 + B25 + B31** — picker / context-menu blunt instruments
7. **B6 + B14 + B15 + B16 + B26 + B27 + B29** — medium hardening
8. **B7–B10, B18–B21, B30, B32–B33** — polish

---

## Fourth pass — previously unscanned files (B34+)

Static scan of UI HTML/CSS, scripts, website, docs/meta, locale copy, and internal `dev/` tools that earlier passes skipped.

### B34 — Medium: `preview.js` still seeds nonexistent `fontFamily`

**Where:** `hamsoo-addon/scripts/preview.js` → `createHarnessDir({ seedSettings })`

**What:** Seeds `fontFamily: 'Vazirmatn'`. Real setting key is `font`. Already noted in `DEBUGGING-REPORT.md` minor items — **still present**.

**Impact:** Preview/QA screenshots never exercise the real font selection path; visual QA can look “fine” while font UI is wrong.

**Status:** Open

---

### B35 — Medium: `zip.js` invokes `python` (not `python3`); fallback drops slash guarantee

**Where:** `scripts/zip.js` + `scripts/make_zip.py`

**What:** `execSync(\'python "…make_zip.py"…\')`. On modern Linux only `python3` exists → catch path runs `zip -rq`, which may not enforce POSIX `/` entry names the way `make_zip.py` does (the reason the Python helper exists for AMO/CWS).

**Impact:** Packaging still “works” but can produce store-rejected or inconsistent zips depending on platform/`zip` version. CI Ubuntu images often have `python3` only.

**Fix:** Prefer `python3` then `python`; fail closed if neither can run `make_zip.py` rather than silently using `zip`.

**Status:** Open

---

### B36 — Medium: Website “Add to Chrome” does not ship a Chromium build link

**Where:** `hamsoo-addon/website/index.html` download CTA

**What:**

- Primary Chrome button → `github.com/…/hamsoo#installation` (docs), **not** the `release.json` chromium zip URL
- Firefox → AMO (good)
- **No** `release.json` fetch; version chips are static `v1.3.0`
- `release.json` has `chromium` + `firefox_github` zip URLs that the page never uses
- `website/images/*` (comparison, with/without, ui-previews) appear **unreferenced** by `index.html`

**Impact:** Marketing site steers Chrome users to manual install docs; direct zip download and before/after assets are orphaned. Easy to ship a site that looks incomplete vs README install story.

**Status:** Open

---

### B37 — Medium: Dual `STORE-LISTING.md` heavily drifted

**Where:**

- Repo root `STORE-LISTING.md` (gitignored, v1.3.0, full EN/FA store fields) — used by `release-notes.js --check`
- `hamsoo-addon/src/STORE-LISTING.md` (tracked, header still **v2.0**, shorter/older copy)

**Impact:** Anyone opening the tracked src copy pastes stale store text. Root file is the real one but invisible on fresh clones / CI. High footgun for store submissions.

**Fix:** Single canonical path (or generate src copy); delete or redirect the stale tracked file.

**Status:** Open

---

### B38 — Medium: `SECURITY.md` only marks `1.0.x` supported

**Where:** `.github/SECURITY.md`

**What:** Support table lists only `1.0.x` while product is **1.3.0**.

**Impact:** Security reporters / users told current release is unsupported; policy looks abandoned.

**Status:** Open

---

### B39 — Medium: `dev/tools/*` hardcode Playwright path to `/vercel/sandbox/...`

**Where:** `dev/tools/compare-shots.mjs`, `dev/tools/publish-assets.mjs`

```jsx
import { chromium } from '/vercel/sandbox/node_modules/playwright/index.mjs';
```

**Impact:** Comparison-shot and asset-publish tooling only runs inside this sandbox image, not on a normal maintainer machine. `dev/README.md` documents `node dev/tools/compare-shots.mjs` as if it were portable.

**Fix:** `import from 'playwright'` / resolve via `createRequire` + local `node_modules`.

**Status:** Open (internal tooling; blocks README screenshot pipeline outside one env)

---

### B40 — Low/Medium: Welcome CSS lacks keyboard focus + reduced-motion affordances

**Where:** `welcome.css` (vs `popup.css` which has `:focus-visible` and `prefers-reduced-motion`)

**What:** Lang segment buttons and primary actions have hover/checked styles but **no** `:focus-visible` rings. No `prefers-reduced-motion` section.

**Impact:** First-run tour is harder to operate via keyboard; motion not reduced for sensitive users. `fonts.css` sample input uses `outline: none` on `:focus` but substitutes border/box-shadow (acceptable). Welcome is the weaker page.

**Status:** Open

---

### B41 — Low/Medium: Align control labels say “Right” but value is CSS `start`

**Where:** `i18n.js` `alignStart` → fa `راست‌چین` / en `Right` / ar `يمين`; popup `data-align="start"`

**What:** Stored value is `start` (logical). Content CSS uses `text-align: start` on RTL marks (correct for Persian). English label **“Right”** describes physical right, which is wrong if the control is ever read as “force right in all directions,” and is inaccurate in an LTR UI chrome sense.

**Impact:** Copy/UX confusion more than layout bug; rename to “Start (logical)” / “Auto side” / keep Persian “راست‌چین” only when UI is fa.

**Status:** Open (copy)

---

### B42 — Low: `uiharness` stub incomplete vs real popup APIs

**Where:** `scripts/uiharness.js` `stubSource`

**Missing vs popup.js:** `permissions` (`contains`/`request`/`remove`), robust `runtime.sendMessage` (stub calls callback only, no Promise/`HAMSOO_SYNC_SITES` result shape), etc.

**Impact:** Headless preview/DOM tests cannot honestly exercise “add this site”, import permission grants, or custom-site push failures — green UI shots with dead code paths (compounded by B34).

**Status:** Open (tooling)

---

### B43 — Low: Welcome HTML fallback typo `ابزان` (i18n is correct)

**Where:** `welcome.html` inline Persian fallback for pin body

**What:** Fallback text has `نوار ابزان` (missing `ر`). Live `i18n.js` `welcomePinBody` uses correct `نوار ابزار`.

**Impact:** Only visible if `i18n.js` fails to load. Still a landmine for copy-paste and offline HTML open.

**Status:** Open

---

### B44 — Low: Website is FA/EN only; no Arabic; images folder unused

**Where:** `website/index.html` inline dictionary; `website/images/`

**What:** Site i18n is a hand-rolled FA/EN map (not shared with extension `i18n.js`). No `ar`. Five images in `images/` not referenced by the HTML (possibly intended for README/`assets/` pipeline instead).

**Impact:** Arabic users get no site localization; dead weight / confusion about where screenshots live (`assets/screenshots` vs `website/images`).

**Status:** Open (product/docs hygiene)

---

### Fourth pass — checked clean / non-issues

- Extension pages: no inline scripts/handlers; all script/link/img refs resolve under `src/`
- All `<button>` elements set `type=`
- `importFile` is intentionally `hidden` and triggered via `importBtn` (OK)
- Welcome demo checkboxes sit inside `<label>` (OK)
- Manifest `__MSG_*` keys all exist in `_locales`
- i18n fa/en/ar: no empty values; function placeholder probes matched; intentional Arabic script in en for `langFa` / digit samples
- Popup CSS still documents R1 and avoids live `height:100%` on shell
- `pages.yml` deploys `hamsoo-addon/website` and watches that tree + root `release.json`
- Version chips on site match `1.3.0` in this tree

---

## Inventory summary (full, B1–B44)

| ID | Sev | Area | One-liner |
| --- | --- | --- | --- |
| B1 | Critical | popup normalize | Drops `support`  • `onboardedVersion` |
| B2 | High | digits | No restore leaving RTL |
| B3 | High | picker | Raw storage write |
| B4 | High | settings | RMW races |
| B5 | Medium | code detect | HTML-ish → code |
| B6 | Medium | paste | React controlled inputs |
| B7 | Medium | welcome | Partial settings write |
| B8–B10 | Low | various | Accented Latin, schema default, shadow CSS |
| B11 | High | digits | Ancestor walk hits LTR kids |
| B12–B13 | High | hosts | kimi apex / www gaps |
| B14–B21 | Med/Low | sync/fonts/etc. | Patterns, overrides, merge, export… |
| B22 | High | code detect | English openers → code in pre/code |
| B23 | High | sync | Quota fail swallowed |
| B24–B33 | Med/Low | menu/CSS/bidi | Inline fix, picker breadth, measure… |
| B34 | Medium | preview | `fontFamily` seed |
| B35 | Medium | zip | `python` vs `python3` |
| B36 | Medium | website | Chrome CTA / unused release zips |
| B37 | Medium | docs | Dual STORE-LISTING drift |
| B38 | Medium | meta | SECURITY only 1.0.x |
| B39 | Medium | dev tools | Hardcoded Playwright path |
| B40 | Low/Med | welcome CSS | No focus-visible / reduced-motion |
| B41 | Low/Med | i18n | Align label “Right” vs `start` |
| B42 | Low | uiharness | Missing permissions stub |
| B43 | Low | welcome HTML | Fallback typo ابزان |
| B44 | Low | website | No AR; orphan images |

---

## Coverage map (what fourth pass closed)

| Previously unscanned | Status after B34+ pass |
| --- | --- |
| popup/fonts/welcome HTML | Done |
| popup/fonts/welcome CSS | Done |
| scripts (zip, preview, bump, release-notes, uiharness, check, version-sites) | Done |
| website/ | Done |
| STORE-LISTING, SECURITY, AGENTS/README claims | Done |
| i18n/_locales **content** (not just keys) | Done |
| dev/tools | Done (path bug) |
| **Still not done** | Live browser, perf, a11y audit with AT, test-gap matrix run, binary font validation |

---

## Method notes

- Did **not** run `npm test` / project harness (per request).
- Used static reads of `src/**`, independent Node probes of `settings-util` + `CODE_STRONG_RE` + direction heuristics, host/manifest set diffs, HTML↔JS id cross-check, sync payload sizing, and merge simulations.
- Cross-checked against `docs/DEBUGGING-REPORT.md` so “still open” items (e.g. kimi apex, preview `fontFamily`) are called out explicitly when still present.
- Third pass fuzzed prose outside the repo tests (English openers, emails-in-angle-brackets, sync quota stress).
- Fourth pass covered previously skipped UI/scripts/website/docs/dev tooling.