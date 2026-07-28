# Contributing to Hamsoo (هم‌سو) 🌌

Thank you for your interest in contributing to Hamsoo!

## How to Contribute

1. **Fork & Clone**:
   ```bash
   git clone https://github.com/NaxonM/hamsoo.git
   cd hamsoo/hamsoo-addon
   ```
2. **Make Changes**: All shared extension code resides in [`hamsoo-addon/src/`](../hamsoo-addon/src/).
3. **Verify**:
   ```bash
   npm run verify
   ```
4. **Submit a Pull Request**: Create a PR against the `main` branch.

## Before you change anything

Read [`docs/DEBUGGING-REPORT.md`](../docs/DEBUGGING-REPORT.md). It records every
bug found in the pre-1.3.0 audit, how each was fixed, and the regressions the fix
work itself caused. The standing rules at the bottom are short; the ones that
bite hardest:

1. **Never set a percentage height on `html`, `body`, or `.shell` in
   `popup.css`.** A browser-action popup has no fixed viewport — it sizes
   itself from the document — so `height: 100%` is circular and collapses the
   scroll area to a sliver. Use `max-height` only. (Regression R1)
2. **One settings writer:** `HamsooUtil.persistSettings()`. Never call
   `storage.local.set({ settings })` directly.
3. **Direction is decided by the first strong character first, letter ratio
   second** — never by "contains character X" (too loose) and never by ratio
   alone (too strict: a Persian line full of Latin terms scores below any
   sensible threshold). Keep both counter-cases in `test/direction.test.js`
   green. (Regression R3)
4. **Match patterns come from `url.hostname`, never `url.origin`** (origins
   carry ports, which match patterns forbid), and content scripts are
   registered one at a time.
5. **Imported backups are untrusted input** and must satisfy every limit the
   interactive UI enforces.
6. **No empty `catch` that changes what the user is told**, and never `void` a
   promise in the service worker.
7. **A green suite is not evidence of a working UI.** If a harness relaxes a
   constraint to make assertions easier (as `dom.test.js` unclamps the shell),
   something else must assert the real constrained behavior — that is what
   `layout.test.js` is for.
8. **`unicode-bidi: *-override` is only valid on text with zero RTL
   characters.** Override discards the bidi algorithm, so on mixed text it
   renders Persian *backwards*, not merely misaligned. Never widen the
   `[data-hamsoo="ltr"]` selector — LTR-base text that contains a Persian run
   gets `ltr-mixed` (plain `isolate`). Both marks may only be emitted through
   `markLTR()` in `content.js`, so the rule is enforced by code rather than by
   a comment. Any change to `content.css` direction rules must be mirrored in
   `shadowCss()`.
9. **If you change an element's ambient direction, invalidate its children's
   cached classification.** Container promotion runs *after* some children have
   already been classified against a neutral context; those children must be
   `textCache.delete()`d and reclassified or they silently inherit the flip
   forever.
10. **Keep diffs reviewable:** LF endings (enforced by `.gitattributes`), no
    whole-file rewrites.

All contributions are licensed under [AGPLv3](../LICENSE).
