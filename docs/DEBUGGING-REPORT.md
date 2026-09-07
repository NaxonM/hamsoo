# Hamsoo — Debugging Report & Regression Ledger

> **Not the current backlog.** Open work is H01–H15 in [`GROUND-TRUTH.md`](GROUND-TRUTH.md)
> and [`HANDOVER.md`](HANDOVER.md) (7 Sep 2026 audit). This file is the historical
> R1–R6 ledger. Source comments cite those R-numbers. Keep the guards; do not
> re-open items listed here as “fixed.”

Permanent record of the pre-1.3.0 debugging audit, the fixes that resolved it, and
the regressions the fix work itself introduced. This file is part of the code
base on purpose: each entry names the failure mode, the fix, and the guard that
now prevents it from coming back.

**If you are about to change popup layout CSS, read [Regression R1](#r1--popup-scroll-area-collapsed-to-a-sliver) first.**

- Audit target: Hamsoo WebExtension, pre-1.3.0 development build (single-source build for Chromium + Firefox)
- Status: all 19 audit issues fixed; 1 regression introduced during the fix work, fixed and guarded. A second, independent audit (see [below](#second-audit--pre-130)) found and fixed 9 more issues. R5 (a streaming-order survivor of the R4-b fix) was reported from a screenshot and fixed afterwards.
- Guards: `npm run verify` (= `scripts/check.js` + `build.js` + `test/run.js`)

---

## How the audit was done

Every finding was reproduced with purpose-built instrumentation rather than the
project's own `test/` directory, because the suite was green throughout:

1. **Structural audit** — HTML asset references, both i18n systems, manifest
   `__MSG_*` keys, and the manifest ↔ `content.js` ↔ `popup.js` site-key map.
2. **Runtime simulation** — the real `background.js` executed in a VM against a
   stubbed WebExtension API with working `storage.local` / `storage.sync`.
3. **Real-browser probe** — the real `content.js` and `fonts.html` in headless
   Chromium against synthetic chat markup, reading back computed styles.
4. **Regex fuzzing** — the live code-detection regex against a labeled
   Persian-prose / code corpus.

Those throwaway harnesses (`fixes/phase*.py`, `verification/`) have been
removed. Everything they proved is now either a permanent test in `test/` or a
note in this file.

---

## Fixed issues

### Cluster A — Settings & sync

Root cause: **four independent settings writers with three different rule sets.**
The `syncVersion` conflict-resolution design assumes a single funnel.

| Writer (before) | Normalized? | Bumped syncVersion? | Wrote to sync? |
| --- | --- | --- | --- |
| `popup.save()` | yes | yes | **no** |
| `popup.persistNow()` | yes | yes | yes |
| `fonts.saveSettings()` | **no** | **no** | **no** |
| `background.toggleEnabled()` | **no** | **no** | no |

| # | Issue | Fix |
| --- | --- | --- |
| 1 | Sync pull destroyed custom-font metadata and dropped device-local fonts — `getSlimSettingsForSync()` strips `customFonts` to `{id, name}`, and a shallow `Object.assign` let the slim array replace the full local one | `mergeCustomFonts()` in `src/shared/settings-util.js` merges by `id` and preserves local `format` / `size` / `added`; device-local entries survive a remote pull |
| 2 | Keyboard toggle never synced and could be silently reverted — `toggleEnabled()` wrote `enabled` straight to `storage.local` with no version bump | `background.toggleEnabled()` routes through `HamsooUtil.persistSettings()` |
| 3 | The popup's main save path never wrote to `storage.sync` | Single `writeSettings()` funnel in `popup.js`, bumping `syncVersion` and writing both areas |
| 8 | Chained crash: after a sync pull, `fonts.js` `render()` called `font.format.toUpperCase()` on a stripped entry, threw after `fontList.textContent = ''`, and left a permanently blank font manager the user could not recover from | `render()` falls back to `'—'` when `format` is missing, so broken rows stay listed and removable |
| 10 | `fonts.js` wrote settings outside the sync/normalize path, clobbering concurrent popup edits | `fonts.js` saves through the shared funnel |

**Rule:** there is exactly one settings write path — `HamsooUtil.persistSettings()`.
Never call `storage.local.set({ settings })` directly. Covered by
`test/settings-util.test.js`.

### Cluster B — Rendering & text direction

Root cause: **direction was decided by character presence rather than by
structure or ratio.**

| # | Issue | Fix |
| --- | --- | --- |
| 4, 9 | `REAL_CODE_RE` contained a bare `[{};]` alternation, so one ASCII `;` or `{}` classified a block as code and forced LTR. Fuzzing measured a **33% false-positive rate** on Persian prose (5/15 samples); single characters `{`, `}`, `;` alone flipped prose to code. The Persian semicolon `؛` was handled correctly — it broke exactly when text was pasted from a Latin-keyboard context | Strong/weak signal scoring plus `hasCodeAttrs()` (language/highlighter classes and `data-lang*` attributes); brace *pairs* are counted, and 2 pairs only count alongside another weak signal |
| 5 | `RTL_RE.test(text)` was a pure "any RTL char present" test — one Persian word flipped a whole English paragraph to RTL | `isRTLBlock()` uses `RTL_RATIO_THRESHOLD = 0.3` over RTL vs Latin letters; text with no Latin at all still resolves RTL |
| 6 | Digit localization corrupted visible URLs — displayed `…/v۲/page۱۲۳` while the `href` read `…/v2/page123` | The tree walker rejects `[href]` alongside `pre, code, textarea, input, [contenteditable]` |
| 7 | Disabling Persian digits never restored the text — `localizeDigits()` overwrote `nodeValue` in place with no original retained, so only a page reload recovered | `originalDigitText` WeakMap records pre-conversion values; `restoreDigits()` makes the toggle a lossless, instant revert like every other setting |

**Rule:** direction and code detection are *ratio and structure* decisions, never
"does this string contain character X". Covered by `test/digits.test.js`,
`test/dom.test.js`, `test/selectors.test.js`.

### Cluster C — Custom-site registration

Root cause: **match patterns were built from `url.origin`, which includes the
port — but WebExtension match patterns forbid ports in the host component.**
Failures were then batched and silently swallowed.

| # | Issue | Fix |
| --- | --- | --- |
| 11 | "Add this site" could never work on a non-default port; `permissions.request()` threw on the invalid pattern, `catch` set `granted = false`, and the user saw a generic "permission denied" for a prompt that was never shown | The pattern is built from `url.hostname` (port stripped) |
| 12 | One bad pattern silently disabled *every* custom site: browsers validate a batched `registerContentScripts()` call as a unit, so one invalid entry rejected all of them. Note the asymmetry that hid it — the `unregisterContentScripts` call directly above **was** wrapped in `try/catch` | `isValidMatchPattern()` pre-filter plus one-at-a-time registration inside `try/catch`; failures are collected and returned |
| 13 | Registration failures reached nobody: startup used `void syncCustomSites()` (rejection lost inside the service worker) and all three popup call sites discarded `ok: false`, so the UI always showed "added, please reload" | `syncCustomSitesReporting()` replaces the fire-and-forget calls and logs partial failures; the popup inspects the response |

**Rule:** never `void` a promise in the service worker, and never batch
registrations that a single bad entry can reject as a unit.

### Cluster D — Settings import

Root cause: **`importSettings()` trusted the file.** `normalize()` checked types
but never values, and the import path enforced none of the limits the UI enforces.

| # | Issue | Fix |
| --- | --- | --- |
| 14 | Import accepted arbitrary site patterns (`not-a-url-at-all`, `<all_urls>`, ported origins) and requested no permissions, bypassing the consent step the interactive path enforces — and feeding straight into Issue 12 | Imported patterns go through `permissions.request()`; denied sites are dropped and reported |
| 15 | Import bypassed both custom-font limits (UI caps 12 fonts / 4 MB; a backup declaring 40 fonts at 9.99 MB each was written straight to IndexedDB) | `MAX_CUSTOM_FONTS` / `MAX_FONT_BYTES` enforced, decoded byte length trusted over the declared `size`, metadata dropped for fonts that were not stored |
| 16 | An imported `syncVersion: 99` silently won every future conflict on every device | The counter is re-based to the local value before `persistNow()` bumps it |

**Rule:** an imported file is untrusted input. It must satisfy every constraint
the interactive UI enforces — permissions, counts, sizes, and version bounds.

### Cluster E — Keyboard shortcut

Root cause: **the recorder wrote a shortcut string only one of the two
enforcement mechanisms could honor**, and neither validated it.

| # | Issue | Fix |
| --- | --- | --- |
| 17 | `commands.update()` is Firefox-only. On Chromium the old `Alt+Shift+R` stayed globally bound while the new combo worked only on Hamsoo-enabled sites — two live shortcuts, one of them invisible in the UI | `updateBrowserCommandShortcut()` reports whether the change went global; `shortcutGlobalWarning` discloses the site-only scope |
| 18 | `formatShortcutEvent()` accepted combos the command API rejects: Shift-only combos, `Meta` instead of `Command`, and malformed keys like `Arrowup`. Firefox threw, the empty `catch` swallowed it, and the shortcut was saved and displayed anyway | `isValidCommandShortcut()` / `toBrowserCommandString()` validate against the real grammar before any `commands.update()` attempt |
| 19 | No conflict detection against host-page shortcuts — the capture-phase listener calls `preventDefault()`, so recording e.g. `Ctrl+K` silently broke the site's own shortcut | `isLikelyHostConflict()` shows `shortcutConflictWarning`; it warns, never silently blocks |

**Rule:** validate a shortcut against the browser command grammar *before*
saving it, and never let an empty `catch` decide what the user is told.

### Minor items

- **`scripts/zip.js` portability** — shells out to `python`, absent on most
  modern Linux distros (only `python3`). The `try/catch` falls back to `zip`, so
  packaging works, but the POSIX-forward-slash guarantee the docblock cites is
  silently lost on that path.
- **`kimi.com` coverage gap** — the README advertises `kimi.com`, but the
  manifest only matches `www.kimi.com` and `kimi.moonshot.cn`, and `siteKey()`'s
  suffix check will not resolve a bare `kimi.com`.
- **`preview.js` seeded a non-existent settings key** — it set `fontFamily`,
  while the real setting is `font`, so the QA screenshots never exercised font
  selection.

---

## Regressions introduced during the fix work

### R1 — Popup scroll area collapsed to a sliver

**Severity: high — the extension's entire UI was unreachable.**
Introduced alongside the Cluster A–E fixes, in `src/popup.css`:

```diff
-html, body { margin: 0; padding: 0; }
+html, body { margin: 0; padding: 0; height: 100%; }
 body {
   width: 372px;
+  height: 100%;
-.shell { display: flex; flex-direction: column; max-height: 600px; }
+.shell { display: flex; flex-direction: column; height: 100%; max-height: 600px; }
```

**Why it breaks.** A browser-action popup has no fixed viewport. The browser
lays the document out in a small provisional window and then sizes the popup
*from* the document. A percentage height is therefore circular: the shell can
never grow past that provisional measurement. Because `.content` is
`flex: 1 1 auto; overflow-y: auto`, it is the element that absorbs the collapse,
so the user sees a header, a bare scrollbar sliver where every settings card
should be, and a footer spilling out of the popup frame.

Measured in headless Chromium at 372px wide with a short provisional window:

| | with `height: 100%` | without |
| --- | --- | --- |
| `.shell` height | 150px (pinned to viewport) | 600px (grows to content) |
| `#content` height | **24px** | 405px |
| `#content` scrollHeight | 970px | 930px |
| footer | overflows the shell | inside the shell |

**Why nothing caught it.** `npm run check` is static (syntax, JSON, i18n
parity), and no JS error was thrown, so `pageerror` listeners stayed silent.
Worse, `test/dom.test.js` injects
`.shell{max-height:none}.content{overflow-y:visible}` so it can inspect every
card at once — it deliberately unclamps exactly the layout under test. Nothing
in the suite asserted a box metric.

**Fix.** Reverted the three declarations; `.shell` keeps `max-height: 600px`
only. A comment at each site in `popup.css` explains why.

**Guard.** `test/layout.test.js` + `test/layout-checks.js` run the *clamped*
popup in headless Chromium with `--window-size=372,150` and assert that the
shell grows past the viewport, that `#content` keeps ≥ 200px, that the footer
stays inside the shell, and that no percentage height resolves on
`html` / `body` / `.shell`.

### R3 — Ragged Persian lists: bullets stranded on the wrong margin

**Severity: high — the extension's core feature, on its core content.**
Introduced by the Issue 5 fix itself.

Issue 5 replaced a naive "contains an RTL character" test with an RTL letter
**ratio**, so a lone Persian word could no longer flip an English paragraph.
That over-corrected. Real Persian content embeds long Latin runs — language
learning, code identifiers, product names — so lines that are unmistakably
Persian score far below the 0.3 threshold:

| Line (from a real Gemini German-grammar answer) | RTL ratio | Ratio verdict | Correct |
| --- | --- | --- | --- |
| `جمع: mit + meinen / den + Nomen + n` | 0.14 | LTR | **RTL** |
| `مذکر: ohne + meinen / einen / den` | 0.18 | LTR | **RTL** |
| `مؤنث: mit + meiner / einer / der` | 0.19 | LTR | **RTL** |
| `مؤنث: ohne + meine / eine / die` | 0.20 | LTR | **RTL** |
| `خنثی: ohne + mein / ein / das` | 0.22 | LTR | **RTL** |
| `مذکر و خنثی: mit + meinem / einem / dem` | 0.35 | RTL | RTL |

Five of six sibling items in one list fell on the wrong side of the threshold
— and the sixth did not. Two failure modes compounded:

1. Each failing item was inside an RTL ambient context, so `classify()` took
   the `else if` branch and marked it **strict LTR**, pushing it to the left
   margin while its neighbor stayed right. The list rendered visibly ragged,
   items alternating between margins.
2. `promoteContainer()` required **every** item to be RTL before flipping the
   container, so a single sub-threshold item left the whole `<ul>` LTR and put
   every bullet marker on the left.

**Why nothing caught it.** The suite asserted that RTL text *gets marked*, never
that a realistic mixed-language block does — every fixture was either pure
Persian or pure English, the two cases a ratio never gets wrong. Nothing
asserted list geometry either, so the bullet side was untested.

**Fix.** Direction now leads with the **first strong directional character**,
the same signal UAX #9 (P2/P3) and the browser's own `dir="auto"` use. The
ratio survives only as a rescue for blocks that *open* in Latin but are
overwhelmingly Persian. The Issue 5 case stays fixed: a Persian word in the
middle of an English paragraph neither opens the block nor clears the ratio.
`promoteContainer()` now uses a majority vote instead of unanimity, so one
Latin-heavy row cannot strand the bullets of an otherwise-Persian list, while
genuinely bilingual lists are still left alone.

**Guard.** `test/direction.test.js` + `test/direction-checks.js` rebuild the
reported Gemini list verbatim and assert that every item resolves RTL, that
items share one direction (no ragged mix), that the container is promoted, and
that the marker gutter is on the right — plus the two counter-cases (the Issue 5
English paragraph, and a genuinely bilingual list that must not be promoted).

### R4 — Persian text rendered backwards, and periods wandering to the wrong end

Two separate bugs, both surfaced by the same Gemini answer (a German-grammar
explanation with Persian glosses), and both *introduced by the R3 fix work* or
exposed by it.

#### R4-a — `unicode-bidi: isolate-override` reversed real Persian text

The worst-looking bug in the whole audit: the line

> `Ich fahre nie ohne meinen Koffer در تعطیلات.`

rendered its Persian tail as `رد تالیطعت` — every letter in visual reverse
order, i.e. genuinely unreadable text, not merely misaligned text.

**Cause.** `content.css` carried:

```css
[data-hamsoo="ltr"] { direction: ltr; text-align: start; unicode-bidi: isolate-override; }
```

with a comment asserting the mark was "only applied to elements verified to
contain zero RTL characters." **That invariant was never true.** `classify()`
applied `ltr` to *any* block judged non-RTL that sat in an RTL context:

```js
else if (text.trim() && inRTLContext(el)) mark(el, 'ltr');
```

A Latin-leading mixed line reaches that branch: first strong character is
Latin and the RTL ratio is 0.26 (< 0.30), so `isRTLBlock()` correctly returns
false — and then the `ltr` mark forces `isolate-override` onto it.
`isolate-override` does not *nudge* direction; it discards the Unicode
bidirectional algorithm entirely and lays every character out left-to-right,
including Arabic-script ones. The CSS comment documented an invariant that no
code enforced, and nothing tested it.

This bug predates R3 (the old ratio-only classifier reached the same branch) —
R3 simply did not rescue Latin-leading lines, so it survived.

**Fix.** Split the mark in two, and derive it from the text instead of trusting
a comment:

```js
function markLTR(el, text) {
  mark(el, RTL_RE.test(text) ? 'ltr-mixed' : 'ltr');
}
```

| mark | applies to | `unicode-bidi` |
| --- | --- | --- |
| `ltr` | text with **zero** RTL characters | `isolate-override` |
| `ltr-mixed` | LTR-base text containing RTL runs | `isolate` |

`isolate` keeps the LTR base direction (so the line still starts on the left
and the sentence-final period stays put) while letting the bidi algorithm lay
out the Persian run right-to-left, which is the correct rendering. All three
call sites — `classify()`, `classifyPre()`, `classifyInlineCode()` — now go
through `markLTR()`, so the invariant is enforced by the only function that can
emit the mark. The same split is mirrored in `shadowCss()`, and the
`pre`/`code` isolation rule now covers `code[data-hamsoo="ltr-mixed"]`.

Note this also fixed a quieter case: a code block containing a Persian string
literal (`const msg = "سلام دنیا";`) was being reversed the same way.

#### R4-b — stale classification after container promotion

In the second screenshot the pure-German bullets were right-aligned with their
trailing period thrown to the *left* end: `.Ich habe einen Traum`.

**Cause.** A cache/ordering bug created by R3's majority-vote promotion.
Promotion is triggered by a *later* RTL sibling, so a pure-Latin `<li>` is
classified *before* its container is promoted. At that moment `inRTLContext()`
is false, so it takes the `unmark()` branch. When the `<ul>` subsequently gains
`data-hamsoo-box="rtl"`, that item silently *inherits* RTL — and `textCache`
then prevents it from ever being reclassified for the life of the page.

**Fix.** Promotion changes the ambient direction of every child, so it must
invalidate their cached decisions:

```js
box.setAttribute('data-hamsoo-box', 'rtl');
for (const kid of kids) { textCache.delete(kid); classify(kid); }
```

Re-entry is safe: the recursive `promoteContainer()` call returns immediately
because the box attribute is already set.

**A tie is not a majority.** Building the fixture caught a real property of the
R3 rule: a 50/50 list (`rtlKids * 2 <= votingKids`) is deliberately left
unpromoted. That is the conservative choice and is intended — the fixture was
changed to be Persian-majority, matching the reported content, rather than
loosening the rule.

**Guard.** Five checks in `test/direction-checks.js`, over a fixture that
reproduces the reported list (pure-German item, German item with a Persian
tail, Persian glosses) plus a Persian-literal code block. Override presence is
asserted directly (`getComputedStyle(el).unicodeBidi` must not match
`/override/`), and visual order is asserted with Range geometry — the rect of
`در` must sit to the *right* of the rect of `تعطیلات`, which is the only
assertion that can actually detect reversed text. Each fix was reverted
independently to confirm the checks fail without it: reverting `markLTR` alone
fails 3 checks, reverting the reclassify loop alone fails 2.

### R5 — Streaming: an English line inherits RTL mid-answer

Reported from a screenshot pair. With the extension off, the opening line
`Let's look at a critical issue with bidirectional text in extensions:`
rendered normally. With it on, the same line was pushed to the right margin
with its colon thrown to the *left* end: `:Let's look at a critical issue…`.
Everything else on the page — the Persian paragraphs, an inline code span, the
final Persian sentence's period — was correct.

**Cause.** R4-b again, one level up, and outside the code that was fixed for
it. A chat answer arrives token by token, so the opening English line is
classified while the message container still holds nothing but Latin text. At
that moment `inRTLContext()` is false, so the line correctly takes the
`unmark()` branch. The Persian body then streams in underneath it, the
container (`.markdown`, `[data-message-author-role]`, … — all in `SELECTOR`)
flips to `data-hamsoo="rtl"`, and the unmarked line silently *inherits* that
base direction. Because the line's own text never changed, its `textCache`
signature still matches and `classify()` early-returns forever after.

R4-b's invalidation loop only ever ran inside `promoteContainer()`, which
handles `table, ul, ol` → `li, td, th`. Nothing invalidated descendants when an
*ordinary* element gained the `rtl` mark. Standing rule 13 already described
the correct behavior; it was simply implemented in one place instead of all of
them.

**Fix.** Detect the *transition*, not the current state, and generalize the
invalidation to any element whose mark changes to or from `rtl`:

```js
const wasRTL = el.getAttribute('data-hamsoo') === 'rtl';
…
mark(el, 'rtl');
if (!wasRTL) reclassifyDescendants(el);   // and the mirror case on unmark/markLTR
```

`reclassifyDescendants()` clears the cache for descendant `SELECTOR` elements
and inline `code`, then reclassifies. Recursion terminates because a descendant
only re-invalidates when its *own* mark transitions, which happens at most once
per text change; elements with no element children return immediately.

**Why the existing tests missed it.** The R4-b fixture is static — the whole
list is in the HTML before the content script runs. Injecting this exact markup
all at once produces the correct result (`ltr`); only the *arrival order*
reproduces the bug. The first reproduction attempt also failed for a second
reason worth recording: it wrapped the text in a bare `<div>`, which is not in
`SELECTOR`, so no RTL ancestor was ever created and the English line was
correctly left alone. A fixture that is not shaped like the real page proves
nothing.

**Guard.** Two checks in `test/direction-checks.js` that build the message by
streaming (English line, wait for a scan, then append the Persian body). One
asserts the mark is `ltr`; the other asserts with Range geometry that the
trailing `:` renders to the *right* of the first word — the mark alone cannot
detect an inherited base. Reverting the one-line fix fails exactly these 2
checks and no others.

### R2 — Whole-file line-ending churn

The fix scripts rewrote `popup.css`, `popup.js`, `content.js`, `i18n.js`,
`ADDING-FONTS.md` and `README-fa.md` to CRLF. `git diff --stat` reported ~4,300
changed lines for roughly 100 lines of real edits, which is exactly the
condition under which a three-line layout regression slips through review.

**Fix.** All source normalized back to LF, and a repo-root `.gitattributes` now
pins `text eol=lf` so no tool can reintroduce the churn.

---

### R6 — Disabling Hamsoo left the page dirty until reload

Reported by the user: *"I really don't think all our injections get removed
after disabling hamsoo, the page needs a reload for the injected tags to
disappear completely."* Correct, and the problem was wider than it looked.

The inactive branch of `applySettings()` did essentially one thing:

```js
ROOT.removeAttribute('data-hamsoo-on');
syncShadowStyles();
return;
```

Every rule in `content.css` is gated on that attribute, so removing it makes
the page *look* untouched instantly. That is why this survived two audits and a
release: visually it is indistinguishable from a real teardown. But CSS gating
can only undo things done with CSS, and the content script writes plenty that
is not CSS. A probe built for this (`dev/harness/teardown-probe.mjs`) found
eight distinct classes of leftovers after a disable:

| Left behind on disable | Why CSS gating misses it |
| --- | --- |
| `data-hamsoo-typo/read/weight/ls/justify/measure` on `<html>` | attributes, not styles |
| Six `--hamsoo-*` custom properties on `<html>` | inline style properties |
| `data-hamsoo` / `data-hamsoo-box` marks on every element | attributes |
| Localized digits (`۲۰۲۴`) in page text | the DOM text was rewritten |
| `dir="auto"` written onto editable fields | an attribute we authored |
| A site's own `dir="rtl"`, destroyed and not restored | never recorded |
| The `<style>` / adopted stylesheet inside every shadow root | not gated by `<html>` |
| The loaded `FontFace` | a document-level resource |

The `dir` row is the worst of them: the extension overwrote an attribute the
*site author* had set and had no memory of the previous value, so a reload was
the only way back.

**Fix.** A real teardown, `removeInjections()`, plus `cleanTree(root)` which
restores digits, restores editable `dir`, and strips element marks. The
author's original `dir` is now recorded in an `originalEditableDir` WeakMap
before being overwritten — the same shape as the existing `originalDigitText`
map — and put back on teardown (removed entirely when the author had set none).
Shadow roots get their injected `<style>` removed, the adopted sheet filtered
out of `adoptedStyleSheets`, and their contents cleaned. `dropLoadedFont()`
releases the FontFace.

Teardown is only half of it: an undo that cannot be redone is a worse bug than
the one it replaces. Re-enabling now re-adopts styling into every known shadow
root and re-scans them. Two mistakes surfaced there and are worth recording,
because both were invisible in the product and only the probe caught them:

1. Re-enable re-attached shadow *styling* but never re-*scanned* shadow
   content, because `discoverShadowRoots()` deliberately skips roots it has
   already seen. Shadow text came back unstyled.
2. The obvious fix, `schedule(root, 0)`, silently did nothing: `schedule()`
   coerces any non-`Element` to `ROOT`, and a `ShadowRoot` is nodeType 11, so
   the call re-scanned `<html>` instead. The working call is `scan(root)`.

**Guards.** `test/teardown.test.js` + `test/teardown-checks.js` — nine checks in
real headless Chromium covering all six teardown classes and both re-enable
paths, including a fixture guard so the assertions cannot pass vacuously if the
extension fails to apply. The shared harness stub makes `storage.onChanged` a
no-op, so the fixture installs a shim that delivers a settings change the way
the popup does. Proven honest by reverting `removeInjections()`: exactly the
six disable checks fail (86 passed / 6 failed), and the re-enable checks
correctly stay green, since nothing was torn down for them to restore.

A related gap found in the same pass: `applyEditableDir()` only ran on elements
that had already been classified RTL, so an **empty** composer never received
`dir="auto"` — precisely the case the UI advertises with "while typing" /
«هنگام تایپ». The hint was describing behavior that did not exist. `dir="auto"`
is now applied to every editable, which is safe because `auto` resolves to the
content's own direction; a Latin-only field still computes `ltr`, asserted
directly rather than assumed.

---

## Second audit — pre-1.3.0

A follow-up full-project audit, covering every module again from a cold start.
As with the first pass, `test/` stayed green throughout and was deliberately
not relied on. New throwaway harnesses proved each finding and were discarded
once the fixes landed:

- A CommonJS probe driving `shared/settings-util.js` directly (57 assertions,
  later extended to 81 covering the new migration/font/shortcut behavior).
- The real `content.js` and `content.css` loaded in headless Chromium against
  synthetic chat markup (35 DOM assertions).
- The real `background.js` executed in a VM against a stubbed WebExtension API
  covering the full install/toggle/sync lifecycle.
- The real `popup.html`, `fonts.html`, and `options.html` served over HTTP and
  driven with Playwright.
- Negative tests that mutate `i18n.js` (garbled value, empty value, missing
  key, function/string type drift, reindented dictionary) and assert
  `scripts/check.js` rejects each one, then confirm the source file was
  restored exactly.

- Audit target: Hamsoo WebExtension, pre-1.3.0 development build
- Status: 9 issues found and fixed

| # | Issue | Fix |
| --- | --- | --- |
| 20 | Switching the digit-localization script (Persian ↔ Arabic-Indic) while digits were already converted left stale digits on screen until the setting was toggled off and back on — `originalDigitText` recorded only whether a node had been converted, not which script it was converted to, so the tree walker skipped nodes that only needed a re-script | `originalDigitText` now stores `{ text, script }`; the walker accepts a node when the digit script changed even if it was already converted, and always re-derives the converted text from the pristine original |
| 21 | If the background service worker was evicted and restarted right as the user pressed the toggle shortcut twice in quick succession, the enabled state could flip twice instead of once, because the in-memory de-dupe guard was reset along with the worker | `toggleEnabled()` claims the toggle synchronously in memory first, then confirms uniqueness against `storage.session`, which survives worker eviction |
| 22 | A custom site added on another device stayed unregistered on this device until the browser restarted, because `_pullFromSync()` only reacted to the sync version counter changing, not to the site list itself changing | `_pullFromSync()` diffs the site list before/after the pull and re-registers content scripts only when it actually changed |
| 23 | Fonts synced from another device but never uploaded to this one looked selectable and "active" in the UI but produced no styling, because there were no font bytes for them in this device's store | `mergeCustomFonts()` marks remote-only entries; the popup's font picker hides them and the font manager lists them as unavailable with an explanation instead of a broken preview |
| 24 | Recording a keyboard shortcut with the Windows/Command key saved silently as a site-only shortcut with no explanation, because the browser's commands API rejects `Meta` and the failure was swallowed | `describeShortcutLimitation()` classifies the rejection reason; the popup now tells the user their browser doesn't support that key combination as a global shortcut |
| 25 | Ten Arabic UI strings were garbled by dropped or reordered letters (`اللِّفة`, `أتناء`, `فير صالح`, `تعيير`, `إلعاء`, `اضطط`, and others) | Corrected to `اللغة`, `أثناء`, `غير صالح`, `تغيير`, `إلغاء`, `اضغط`, etc. |
| 26 | `npm run check`'s i18n validator only compared key names, scraped with an indentation-anchored regex; it could not have caught Issue 25, an empty value, a value equal to its own key, or a value that silently changed from a function to a plain string (which drops any arguments callers pass) | The checker now executes the dictionary in a VM sandbox and validates values: empty/placeholder strings, function-vs-string type drift across languages, duplicate keys in source, and a known-garbled-Arabic-fragment blacklist |
| 27 | "Add this site" on a URL with a non-default port granted the permission silently, with no indication that browser match patterns can't target a single port — a user could believe the grant was port-specific | The success message now explicitly states the permission applies to every port on that host |
| 28 | Upgrading a v1 settings object skipped de-duplicating `customSites` unless the v0 migration step also ran in the same pass, because the dedupe lived inside the `if (from < 1)` branch instead of running unconditionally | The de-dupe now runs on every migration, regardless of the starting schema version |

**Rule:** issues 23, 24, and 27 are all the same failure class as R1 — a
setting is technically applied correctly, but nothing tells the user what
actually happened. Silence is a bug even when the underlying logic is correct.

---

## Standing rules

1. **Never set a percentage height in `popup.css`** on `html`, `body`, or
   `.shell`. Popups size from content; use `max-height` only. (R1)
2. **One settings writer.** Everything goes through
   `HamsooUtil.persistSettings()`. (Cluster A)
3. **Direction is decided by first strong character first, ratio second** —
   never by "contains character X" (too loose, Issue 5) and never by ratio
   alone (too strict on Persian text carrying Latin terms, R3). Any change here
   must keep both counter-cases in `test/direction.test.js` green.
   (Cluster B, R3)
4. **Match patterns come from `hostname`, never `origin`** — origins carry
   ports, which match patterns forbid. Register scripts one at a time.
   (Cluster C)
5. **Imported files are untrusted input** and must satisfy every limit the
   interactive UI enforces. (Cluster D)
6. **No empty `catch` that changes what the user is told**, and never `void` a
   promise in the service worker. (Clusters C, E)
7. **A green suite is not evidence of a working UI.** If a test harness relaxes
   a constraint to make assertions easier, something else must assert the real
   constrained layout. (R1)
8. **Test the messy middle, not the clean poles.** Pure-Persian and
   pure-English fixtures pass under every classifier ever written; the bugs all
   live in mixed content. Every direction heuristic needs a fixture that is
   genuinely mixed, and layout features need geometric assertions, not just
   attribute checks. (R3)
9. **Keep diffs reviewable** — LF endings, no whole-file rewrites. (R2)
10. **A fix for an over-broad rule can easily become an over-narrow one.** Three
    of the four regressions (R1, R3, R4) were introduced *by* fix work, not by
    the original code. When tightening a heuristic, add the counter-case test in
    the same change. (R1, R3, R4)
11. **`unicode-bidi: *-override` is only ever valid on text containing zero RTL
    characters.** Override discards the bidi algorithm, so on mixed text it does
    not misalign the text — it renders it backwards. Never widen the
    `[data-hamsoo="ltr"]` selector; mixed LTR-base text gets `ltr-mixed`
    (`isolate`). Emit both marks only via `markLTR()`, so the rule lives in code
    rather than in a comment. (R4)
12. **An invariant stated only in a comment is not an invariant.** The
    `[data-hamsoo="ltr"]` rule documented "zero RTL characters" for two releases
    while the code applied it to mixed lines. If a CSS rule is only safe under a
    precondition, the precondition must be checked by the function that applies
    it and asserted by a test. (R4)
13. **Changing an element's ambient context invalidates its cached
    classification.** Anything that mutates direction on an ancestor (container
    promotion, `dir` changes) must `textCache.delete()` and reclassify the
    affected descendants; children are frequently visited *before* the ancestor
    is promoted. (R4)
14. **A standing rule must be implemented everywhere it applies, not only where
    it was first observed.** Rule 13 was written after R4-b and implemented only
    inside `promoteContainer()`; the identical bug then shipped on ordinary
    streamed content. When adding a rule, grep for every site that can trigger
    the condition and fix them together. (R5)
15. **Static fixtures cannot catch ordering bugs — stream them.** Content that
    is present before the first scan exercises a completely different code path
    than content that arrives token by token, and chat pages are the second
    kind. Any classifier that caches per element needs at least one fixture
    built incrementally, and the fixture must use elements the scanner actually
    matches. (R5)
16. **A setting that silently "applies" but visibly does nothing is a bug.**
    Phantom synced fonts, a downgraded shortcut, and a port permission that
    reaches further than implied all left the underlying logic correct but the
    user uninformed. Any state the UI can reach that differs from what the user
    asked for must say so. (Second audit, Issues 23/24/27)
17. **A validator that only checks structure (keys) and not content (values)
    will not catch content bugs.** The i18n checker had parity coverage for two
    releases and still shipped ten garbled Arabic strings, because parity was
    never the failure mode. When adding a static check, ask what class of bug
    it can *not* catch. (Second audit, Issue 26)
18. **CSS gating cannot undo non-CSS writes.** Hiding every styled effect
    behind one attribute on `<html>` makes a disable look perfect while
    attributes, custom properties, rewritten text nodes, authored `dir`
    values, shadow-root stylesheets and loaded fonts all stay behind. Anything
    written outside the stylesheet needs an explicit teardown, anything
    overwritten needs its previous value recorded first, and anything torn down
    needs a matching re-apply path — the undo and the redo are one feature, not
    two. (R6)
