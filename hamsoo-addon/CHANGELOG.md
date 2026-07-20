# Changelog

## [1.1.0] - 2026-07-21

Arabic locale support, per-locale digit conversion, cross-device settings sync, and UI improvements.

### Added
- Arabic (`ar`) UI language: a full third locale dictionary and `_locales/ar/messages.json`, selectable from the language control alongside Auto/Persian/English. RTL layout and pre-paint direction detection now recognize `ar` the same way as `fa`.
- Digit-style setting: the digit-conversion feature is now labeled "Localized digits" and offers a Persian (۱۲۳) or Arabic-Indic (١٢٣) digit style, selectable from a segmented control that appears once the feature is turned on.
- Custom-sites management list with one-click removal (also revokes the site's host permission).
- Live-preview caption, double-click slider reset to defaults, alphabetical site chips, and a custom sample-text box on the font-manager page.
- Element picker: a new context-menu action highlights the element under the cursor; clicking saves it per site ("always fix this element"), and the content script styles it now and on future visits. Picked elements are listed on the options page with one-click removal.
- Versioned settings schema: stored settings now carry a `schemaVersion`, upgraded once per install/startup by a background migration (v1 dedupes custom-site patterns and prunes value-less per-site overrides), so future format changes can migrate data safely.
- Shadow DOM support: open shadow roots are discovered on the fly, watched for changes, and styled via a shared adopted stylesheet (with a `<style>` fallback), so custom-element UIs and future site redesigns that render chat content in shadow trees keep working. Mutations targeting a shadow root directly are no longer dropped by the rescan scheduler.
- GitHub Actions CI: static checks, dual-variant build, full test suite, and store zips uploaded as artifacts.
- `npm run preview`: headless-Chromium visual QA screenshots of popup and options pages (fa/en x light/dark).
- Zero-dependency DOM test suite that exercises the real popup in headless Chromium (i18n, rendering, normalization, persistence, slider reset).
- English/Persian UI language support with a pre-paint language initializer (`lang-init.js`) that sets direction and translates the popup synchronously, so an English user never sees a Persian frame before the async settings load.
- Grayscale toolbar (action) icons.

### Added (continued)
- Cross-device settings sync via `storage.sync`: every user-initiated save increments a `syncVersion` counter; on install/startup the background resolves conflicts by taking whichever copy has the higher counter. Font bytes stay in IndexedDB (not synced); if the payload exceeds the per-item quota the sync falls back to a slim copy without per-site overrides. A sync-status indicator on the options page shows readiness and the current version number.
- Settings schema v2: `syncVersion` field added via a non-destructive migration run once per install/startup.

### Changed
- Decluttered the popup: appearance, language, keyboard shortcut, backup, and the saved custom-sites / picked-elements lists now live on a dedicated options page, opened from a new gear button in the popup header. The font manager is linked from both pages.
- Default toggle shortcut is now `Alt+Shift+R` (was `Alt+Shift+H`).

### Fixed
- Custom sites never activated: `HamsooUtil` was missing from the dynamically registered content scripts.
- Gemini follow-up suggestion chips (`.follow-up-text`) were not styled.
- Duplicate custom-site entries are now deduped, a font-loading race in the content script was fixed, and the font-format list on the Persian options page now reads in the correct RTL order.
- Toggle knob direction in the English (LTR) UI: OFF rests on the left and ON slides right (mirror of the RTL behavior).
- Site-count wording in English now reads "N of M active" instead of "N of M on".
- The popup header no longer mirrors when the UI language switches to English; it keeps the Persian arrangement (brand right, master toggle left) in both languages.

## [1.0.0] - 2026-07-20

First tracked release, following the debugging and hardening work.

### Added
- Text alignment control (Right / Justify) and reading-width (measure) options, both per-site overridable.
- Full keyboard navigation (roving tabindex + arrow keys) and ARIA roles across all popup control groups.
- Single-source build system generating the Chromium and Firefox variants from one `src/` tree.
- CI checks (JS syntax, JSON validity, i18n parity, lint), a zero-dependency test suite, and version/changelog tooling.

### Fixed
- Popup toggle state now reflects the real enabled/disabled status.
- Keyboard shortcut wiring, per-site override persistence, and MutationObserver flush behavior.
- Context-aware Persian digit/punctuation handling and inline-code LTR isolation.
- Reduced-motion coverage (transitions and animations) and consistent focus-visible styling.
