# Changelog

## [1.4.1] - 2026-09-08

Hotfix release addressing an issue introduced in version 1.4.0 with delimiter and parenthesis handling in mixed-language lists.

### Highlights

- Parentheses and punctuation around Latin words in RTL text now stay in their correct visual positions.
- Section separators and colons next to bracketed vocabulary terms remain outside the Latin isolate.
- Dynamic page text updates are preserved cleanly without overwriting host content during digit restoration.
- Settings removals update targeted site records without overwriting concurrent edits.
- Font operations and imports use safe rollback to prevent custom font data loss on write failure.

### Fixed

- **Bidirectional delimiter and parenthesis isolation**: In version 1.4.0, Latin run wrapping in right-to-left blocks inadvertently swallowed outer parentheses, section separators (such as em-dashes), and trailing colons into LTR spans when terms were wrapped in brackets (for example, vocabulary definitions like "مذکر (der):", "(Experten, pl.) — کارشناس", and "(Jungen, pl. — اسم با پایان ضعیف/n-Deklination)"). This caused closing brackets and punctuation to jump to the wrong side of the line. Version 1.4.1 resolves this with a delimiter-aware boundary planner that balances bracket pairs with a stack over the original text, keeps outer parentheses and boundary separators in the surrounding context, and ensures punctuation stays glued to the intended phrase.
- **Dynamic host text updates and digit restoration**: Fixed text restoration so digit localization respects node ownership and does not overwrite newer text updated dynamically by host pages, and ensures mixed paragraphs cleanly restore original digits when Hamsoo is disabled.
- **Settings persistence concurrency**: Narrowed site and selector removals to update only targeted items without clobbering concurrent background or popup changes.
- **Transactional font operations**: Font additions, removals, and backup imports now feature transactional rollback to preserve existing custom fonts if persistence fails.
- **Writing field direction restoration**: Turning off input direction assistance cleanly restores the author's original direction on chat textareas and inputs without computed right-to-left overrides.

### Changed

- **Input writing direction assistance toggle**: The input direction assistance control has been relocated from the main screen into Advanced Settings under "Adjust writing direction".
- **Preserved clipboard contents**: Removed silent clipboard paste interception, ensuring text pasted into chat fields remains untouched.

## [1.4.0] - 2026-09-07

Serialized settings writes, strict backup validation, improved teardown, and punctuation alignment for mixed-language text.

### Highlights

- Embedded Latin text runs in RTL paragraphs now keep trailing punctuation at the correct side.
- Settings writes are serialized so concurrent popup and options edits do not overwrite each other.
- Settings backups are strictly validated on import with automatic rollback on storage failure.
- Custom site and element removals now immediately unstyle matching elements in open tabs.
- Selection fix no longer styles unselected sibling elements, and teardown faithfully restores original author styling.
- Custom fonts are validated with magic-byte format checking.

### Added

- **Format validation for custom fonts.** Uploaded fonts are now verified via format magic bytes (TTF, OTF, WOFF, WOFF2) before saving.
- **Immediate live element unstyling.** When a custom selector or custom site is removed in settings, open tabs immediately tear down and restore the original DOM state.
- **Backup import validation.** Importing an empty or unrecognized JSON file is rejected with a clear error and cannot silently reset preferences.
- **Embedded text punctuation isolation.** Latin phrases sitting directly in Persian paragraphs are isolated so punctuation stays glued to the phrase instead of jumping to the wrong margin.

### Fixed

- **Settings write collisions.** Simultaneous updates between popup cards and background tasks no longer race or overwrite each other.
- **Selection fix partial containers.** Right-clicking to fix a selection inside a shared container no longer force-flips unselected sibling elements.
- **Teardown style restoration.** Disabling Hamsoo or undoing a selection fix restores the page's exact prior inline styles rather than removing them outright.
- **Keyboard navigation for custom fonts.** The font upload dropzone is now fully reachable and operable via keyboard.
- **Screen reader labels.** Added localized accessibility labels across popup switches and segmented controls in English, Persian, and Arabic.

### Changed

- **Local-first settings storage.** Settings are managed reliably in local storage with export/import files for cross-device transfer.

This file is written for people who use Hamsoo. It is also the source of the release notes on
GitHub and the "what's new" text in the store listings, so it describes what changed for you,
not how it was built.


## [1.3.0] - 2026-07-30

Getting started and getting help, support for Qwen, Kimi, and Perplexity typography, plus a large pass over text direction, syncing between
devices, and turning Hamsoo off cleanly.

**There is no 1.2.x release.** The version was skipped, so 1.3.0 follows directly from
1.1.0 and carries everything that had accumulated since.

### Highlights

- Persian typography support for Qwen, Kimi, and Perplexity answers.
- Welcome tour with a live demo of every control for new installs.
- Help view in the popup with one-click bug reporting.
- Improved text direction: mixed Persian and English lines no longer render backwards.
- Clean toggle teardown and reliable settings sync across devices.

### Added

- **First-run welcome tour.** A single scrolling page that opens once, when you install Hamsoo, and never on an update. It shows a real before/after comparison, explains what each of the six controls does, and points out the toolbar pin and the `Alt+Shift+R` shortcut. You can reopen it at any time from Settings -> Welcome tour.
- **A live demo on the welcome page.** Four switches (direction, font, readability, localized digits) restyle a sample paragraph that deliberately starts in the broken state, so you see the problem before the fix. The demo changes nothing on any website, saves nothing, and its digit conversion is fully reversible.
- **A language switch on the welcome tour**, above the tour itself. The page opens right after installation, before you have had any chance to choose a language, so you can correct it on the spot.
- **Help view in the popup**, opened with a `?` beside the gear. It leads with the three things that fix most site problems: turn Hamsoo off for that one site, right-click to fix selected text, or right-click to pick an element that should always be fixed.
- **One-click bug reporting.** Opens a prefilled GitHub issue carrying the extension version, your browser, the interface language, the current site's domain, and a one-line summary of which features you have enabled (for example `hamsoo on, font + readability + punctuation`). The summary is shown to you before you send it, and it is a closed list: your custom font filenames, your custom site list and your per-site settings are never included.
- **Email as a second way to report** (`hamsoo@bellamor.ir`), carrying the same short list of details. `mailto:` links do nothing when no mail app is set up, which is common on desktop Chrome with webmail, so the address is also shown as selectable text you can copy.
- **Feedback card in the popup.** Dismissible, and shown only after Hamsoo has been installed for 7 days and has actually styled pages on 3 different days. It asks a neutral question first -- "Enjoying Hamsoo?" -- and "Not really" opens the help view rather than a rating box. Two asks at most, ever; "Later" waits 30 days; "Don't show again" is permanent and follows your profile to your other devices. On Firefox it asks for a review on AMO, on Chrome and Edge for a star on GitHub.
- **"When to turn it off" hints** for the font and readability controls, placed outside the collapsible section so they stay readable when the control is switched off.

### Changed

- **The interface language now falls back to your timezone.** `Auto` used to read the browser's language only, and both Firefox and Chrome ship to Iran with an English interface -- so the people Hamsoo is written for were getting an English interface by default. The order is now: a language you chose yourself, then a Persian or Arabic browser language, then an Iranian timezone, then English. Arabic is deliberately not guessed from a timezone, because those zones are shared with several other languages.
- **Your settings carry over untouched when you update**, and an existing installation is treated as having already seen the welcome tour, so updating never opens a new tab. The counters that decide when the feedback card appears stay on the device they were earned on; only "don't show again" and the number of times you have been asked follow your profile to other devices, and neither is included in a settings backup.
- **"Manage shortcuts in browser settings" is no longer shown on Firefox.** Firefox lets Hamsoo change the real shortcut for you, so on Firefox that button could only repeat something already done -- and the page it opened has no shortcut setting on it. It now appears only on browsers where Hamsoo cannot change the browser-wide shortcut itself (Chrome, Edge and other Chromium browsers), which is the only place it ever helped.

### Fixed

#### Direction and text

- **Qwen answers kept the site's own font and spacing.** Qwen wraps every paragraph of an answer in a container Hamsoo did not know to look at, so Persian text inside those answers was never styled, no matter which controls were switched on.
- **Kimi answers were only styled when the whole answer was Persian.** Kimi wraps its paragraphs the same way. An answer written entirely in Persian still looked correct, because the block around it was recognized as Persian as a whole, but an answer that moved between Persian and English was left untouched, which is why the problem looked intermittent rather than constant.
- **The font and readability controls had no visible effect on Kimi.** Kimi applies its own font, size and line height directly to the text of every answer, which stopped your settings from reaching it. Kimi now receives the same deeper styling that Google NotebookLM already used, so size, line height, weight and the Persian font all apply. This also covers lines that mix Persian and English, not only fully Persian ones.
- **A mixed Persian and English line on Perplexity was skipped.** A line with a short Persian phrase inside a longer English sentence has too little Persian to count as a Persian line, so it was passed over entirely. Such a line now receives the Persian font and spacing while keeping its English direction, so the English opening stays on the left and nothing is reversed.
- A Persian line that opens with an English or German word — a term followed by its Persian meaning, for example — no longer jumps to the left edge while the rest of the answer stays on the right. A line that ends in Persian now follows the text around it, and sentences that really are English keep their left-to-right flow.
- Persian text inside a mostly-English line was rendered **backwards** (for example "در تعطیلات" appearing as "رد تالیطعت"). Mixed lines now keep their English left-to-right flow while the Persian words inside them read right-to-left. Code blocks containing a Persian phrase were affected the same way and are also fixed.
- English-only bullets inside a Persian list were right-aligned with their final period thrown to the left end.
- An English line at the start of a streaming chat answer was right-aligned with its final colon thrown to the left end (`:Let's look at…`). The line was judged before the Persian body had finished arriving underneath it, and the first judgment stuck for the rest of the page's life. Text is now re-examined when the direction around it changes.
- Persian lines containing long stretches of Latin text were pushed to the left margin, so bullets in a single Persian list ended up split between both margins. Direction now follows the first strong character of the line, the way browsers decide it for mixed text, and a list flips as a whole rather than item by item.
- Code containing a lone semicolon or brace is no longer mistaken for Persian text, and Persian sentences with ordinary punctuation are no longer forced into left-to-right code styling.
- A single Persian word inside an otherwise English paragraph no longer flips the whole paragraph to right-to-left.

#### Turning Hamsoo off, and digits

- Turning Hamsoo off now completely undoes everything it added, instead of only hiding it until you reload the page. Localized digits revert to the original numbers, the direction hints added to text boxes are removed, and the fonts and spacing it applied are cleaned up, including inside site components that keep their content in a separate layer. Turning it back on restores everything without a reload.
- Localized (Persian) digits no longer corrupt the visible text of links; link text and the actual destination now always match.
- Turning off digit localization now instantly restores the original digits, instead of requiring a page reload.
- Switching the digit style (Persian to Arabic-Indic, or back) while digits were already converted left the old digits on screen until you toggled the setting off and on again.
- Toggling Hamsoo very quickly after the browser had put it to sleep in the background could flip it twice instead of once.

#### Sync, settings and fonts

- Syncing settings from another device could delete your custom font files, or drop fonts that only existed on this device. Fonts from both devices are now merged instead of one copy overwriting the other.
- The keyboard-shortcut setting, and most other popup settings, now reach your other devices right away instead of staying local until your next backup and import.
- Fixed the font manager going permanently blank after certain sync states; a font with missing or outdated information now shows a placeholder instead of breaking the page.
- Custom fonts that synced from another device but were never uploaded on this one looked selectable and active while producing no styling at all; they are now clearly marked unavailable, with an explanation.
- Importing a settings backup no longer accepts unsafe or invalid site patterns without asking for permission first.
- Importing a settings backup now respects the same limits on the number and size of custom fonts as the font manager, instead of bypassing them.
- Importing a backup can no longer keep newer settings, saved on another device, from ever arriving on this one.
- Duplicate custom sites left behind by an older version are now cleaned up whenever your settings are upgraded, rather than only in some cases.

#### Keyboard shortcut

- On Chrome and Edge, “Manage shortcuts in browser settings” showed the Firefox address instead of the Chrome one, and never even tried to open Chrome’s shortcuts page. It now opens the right page, and falls back to the right address when the browser refuses.
- The note under the shortcut said the previous browser-wide shortcut was still active, even when the browser had no shortcut for Hamsoo at all. It now says which of the two is actually the case.
- On Chrome and Edge the shortcut shown in the popup could differ from the one the browser had actually registered: those browsers assign the suggested combination only while the extension is being installed, and quietly skip it when another extension already uses it. Hamsoo now asks the browser what is really registered, and says so when the shortcut will only work on pages Hamsoo is enabled for.
- Choosing a new keyboard shortcut on Chrome or Edge now says clearly when the old browser-wide shortcut is still active as well (a limitation of those browsers), instead of leaving both working with no explanation.
- New key combinations are now checked against the browser's own rules before they are saved, instead of being accepted and then silently failing to work.
- Recording a shortcut that uses the Windows or Command key saved it as a shortcut that only worked on pages Hamsoo had already styled, with no explanation. The popup now tells you the browser does not accept that combination browser-wide.
- Hamsoo now warns you when a shortcut you have chosen is likely to clash with one the website itself uses.
- **"Manage shortcuts in browser settings" did nothing at all.** No browser lets an extension open its own settings page, and the button gave no tab, no error and no feedback. When the browser refuses, the address is now shown as selectable text so you can open it yourself.

#### Custom sites

- "Add this site" now works for sites on a non-default port (local development, internal servers), and says plainly that the permission covers every port on that host, because browsers cannot grant access to a single port.
- One invalid custom site no longer disables every other custom site.
- A custom site that fails to register now says so, instead of always reporting success.
- A custom site added on another device stayed inactive here until the browser restarted; it now starts working as soon as the setting arrives.

#### Interface

- Choosing “Options” from the extension’s right-click menu on Chrome and Edge opened a blank page instead of the settings. It now opens the settings, and shows a plain link to them if anything gets in the way.
- Corrected a mis-spelled Persian word (“تنظیمات”) in the options page title, in the keyboard-shortcut note and in the store description.
- The popup could open as a header and a footer with no settings in between, with the whole list collapsed to a few pixels.
- The Arabic language name showed as black diamonds in the English interface, and ten other Arabic phrases were garbled.
- The help view had no spacing between its cards, so it looked like a different product from the rest of the popup.
- The welcome tour's "Open settings" and "Report a bug" buttons opened a narrow popup-sized panel in the corner of a full browser window; both now open properly centered.
- The welcome tour opened in English for most people, with no way to change it (see the language change above).
- The "Welcome tour" card in Settings was a tall block with an off-center button; it is now shorter and centered.

### Privacy

- No new permissions, and nothing is sent anywhere on its own. Both ways of reporting a problem only open a prefilled issue form or a prefilled email that you read and send yourself, and the welcome tour makes no network requests at all.

## [1.1.0] - 2026-07-21

Arabic interface support, per-language digits, settings that follow you between devices, and a
tidier popup.

### Added

- Arabic interface language, selectable alongside Auto, Persian and English, with full
  right-to-left layout.
- Digit style: the digit feature is now called "Localized digits" and offers Persian (۱۲۳) or
  Arabic-Indic (١٢٣) numbers.
- A list of your custom sites, with one-click removal that also gives back the site's permission.
- Element picker: right-click to highlight the element under the cursor and save it for that site
  ("always fix this element"). Picked elements are listed in Settings and can be removed in one
  click.
- Support for sites that keep their chat content in a separate layer, so custom interfaces and
  future site redesigns keep working.
- Live preview caption, double-click a slider to reset it, alphabetical site chips, and your own
  sample text on the font page.
- Settings that follow you between devices: whichever device saved last wins, and your font files
  stay on the device they were uploaded to. Settings shows whether syncing is ready.
- English and Persian interface support, applied before the popup is first painted, so an English
  interface never flashes a Persian frame first.
- Grayscale toolbar icons.

### Changed

- Decluttered the popup: appearance, language, keyboard shortcut, backup and the saved
  custom-site and picked-element lists moved to a dedicated Settings page, opened from the gear in
  the popup header.
- The default toggle shortcut is now `Alt+Shift+R` (was `Alt+Shift+H`).

### Fixed

- Bullets and paragraphs starting with English text no longer flip to left-to-right or detach from
  their Persian bullet.
- Custom sites never activated at all.
- Gemini's follow-up suggestion chips were not styled.
- Duplicate custom sites are now merged, fonts no longer occasionally fail to load on a fast page,
  and the font-format list in the Persian interface reads in the correct order.
- Toggle direction in the English interface: off rests on the left and on slides right, mirroring
  the Persian behavior.
- The site count in English now reads "N of M active".
- The popup header no longer rearranges itself when the interface switches to English.

## [1.0.0] - 2026-07-20

First tracked release.

### Added

- Text alignment (right or justified) and reading width, both overridable per site.
- Full keyboard navigation and screen-reader labels across every popup control.

### Fixed

- The popup toggle now reflects whether Hamsoo is really on.
- Keyboard shortcut handling, per-site settings being remembered, and styling keeping up with
  content that loads as you scroll.
- Persian digits and punctuation are now handled in context, and inline code stays left-to-right.
