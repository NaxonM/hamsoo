# Changelog

## [Unreleased]

Bilingual (Persian/English) UI hardening.

### Added
- English/Persian UI language support with a pre-paint language initializer (`lang-init.js`) that sets direction and translates the popup synchronously, so an English user never sees a Persian frame before the async settings load.
- Grayscale toolbar (action) icons.

### Changed
- Default toggle shortcut is now `Alt+Shift+R` (was `Alt+Shift+H`).

### Fixed
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
