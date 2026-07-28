<div align="center">

<img src="assets/logo.png" width="112" height="112" alt="Hamsoo logo">

# Hamsoo &nbsp;·&nbsp; هم‌سو

**Persian and RTL typography for AI chat interfaces.**

AI assistants write excellent Persian and then render it like an afterthought — left-aligned,
cramped, with punctuation thrown to the wrong end of the line. Hamsoo fixes the typography
in place, in your browser, without touching the words.

[![Firefox Add-ons](https://img.shields.io/amo/v/hamsoo-%D9%87%D9%85-%D8%B3%D9%88?label=Firefox%20Add-ons&logo=firefox&color=FF7139)](https://addons.mozilla.org/en-US/firefox/addon/hamsoo-%D9%87%D9%85-%D8%B3%D9%88/)
[![Platform](https://img.shields.io/badge/Platform-Chromium%20%7C%20Firefox-brightgreen.svg)](#installation)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-informational.svg)](hamsoo-addon/package.json)
[![Dependencies](https://img.shields.io/badge/Dependencies-none-success.svg)](#development)
[![Website](https://img.shields.io/badge/Website-naxonm.github.io%2Fhamsoo-purple.svg)](https://naxonm.github.io/hamsoo)

**[فارسی](README.fa.md)** · [Live demo](https://naxonm.github.io/hamsoo) · [Changelog](hamsoo-addon/CHANGELOG.md)

</div>

---

![Before and after Hamsoo on a Persian AI chat page](assets/screenshots/comparison.png)

<div align="center"><sub>The same page and the same scroll position, rendered twice — see <a href="#screenshots">Screenshots</a>.</sub></div>

---

## Contents

[What it does](#what-it-does) ·
[Features](#features) ·
[Screenshots](#screenshots) ·
[Installation](#installation) ·
[Settings](#settings) ·
[Supported sites](#supported-sites) ·
[Privacy and permissions](#privacy-and-permissions) ·
[Development](#development) ·
[Contributing](#contributing) ·
[License](#license)

---

## What it does

Chat interfaces are built for left-to-right text. When the answer is Persian, the page keeps
its Latin assumptions and the result is subtly wrong in ways that are tiring to read:

| The problem | What Hamsoo does |
| :--- | :--- |
| Persian paragraphs left-aligned in an LTR column | Detects the base direction per element and flips it |
| A sentence's final `.` or `:` jumping to the wrong end | Correct bidirectional resolution, so punctuation lands where it belongs |
| Bullets and table columns mirrored the wrong way | Lists and tables flip as a unit, not item by item |
| Code blocks flipped along with the prose | Code, inline code and links stay left-to-right |
| Default Latin fonts rendering Persian poorly | Six bundled Persian fonts, or any font you supply |
| Cramped line spacing built for Latin glyphs | Independent size, line-height, weight, spacing and width controls |
| Latin digits inside Persian sentences | Optional conversion to `۱۲۳` or `١٢٣` |
| Your typing direction flipping around in the composer | Direction hint applied to the input, from the first character |

Direction follows the **first strong character** of a line, the same way browsers decide it for
mixed text. That detail matters: a Persian sentence quoting a long German phrase is still a
Persian sentence.

---

## Features

### Typography

| Feature | Detail |
| :--- | :--- |
| Bundled Persian fonts | Vazirmatn, Estedad, Sahel, Shabnam, Samim, Gandom |
| Custom fonts | Load your own `.woff2`, `.ttf` or `.otf` — up to 12 files, 4 MB each |
| Readability controls | Font size, line height, font weight, letter spacing, alignment, reading width |
| Per-site overrides | Different typography on different sites, remembered per host |

### Direction and text

| Feature | Detail |
| :--- | :--- |
| Automatic RTL detection | Per element, re-evaluated as streaming answers arrive |
| Mixed-content handling | Latin runs inside Persian keep their own direction instead of reversing |
| Code-safe | `pre`, `code`, links and editable fields are never flipped |
| Localized digits | Persian `۱۲۳` or Arabic-Indic `١٢٣`, reversible instantly |
| Composer direction | Input boxes get a direction hint, correct from the first character typed |
| Paste cleanup | Invisible bidi control characters are stripped from pasted text |
| Shadow DOM support | Open shadow roots are styled too, which most RTL extensions miss |

### Control

| Feature | Detail |
| :--- | :--- |
| Instant on/off | Enabling and disabling fully applies and fully reverts, with no page reload |
| Keyboard shortcut | `Alt+Shift+R`, customizable |
| Any website | Add any site from the popup, not just the bundled list |
| Element picker | Right-click any element to fix it permanently on that site |
| Options page | Full settings, custom sites, picked elements and shortcuts in one tab |
| Settings backup | Export and import your configuration, validated on the way in |
| Cross-device sync | Settings follow your browser profile, with conflicts resolved automatically |
| Interface languages | Persian, English and Arabic |
| Welcome tour | Opens once on install, explains every control, and demonstrates them on a sample paragraph |
| Help and bug reporting | Self-serve fixes for a site that looks wrong, then a prefilled issue or email if that fails |

---

## Screenshots

Every image below is a real render of the extension, not a mock-up. The comparison shots are
the same page captured twice in one browser session — once untouched, once with Hamsoo applied
— and the interface shots are the actual pages in their actual languages.

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/popup.png" alt="Hamsoo popup, light theme"></td>
    <td width="50%"><img src="assets/screenshots/popup-dark.png" alt="Hamsoo popup, dark theme"></td>
  </tr>
  <tr>
    <td><sub><b>Popup</b> — quick controls</sub></td>
    <td><sub><b>Popup</b> — dark theme</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/options.png" alt="Hamsoo options page"></td>
    <td width="50%"><img src="assets/screenshots/fonts.png" alt="Hamsoo font manager"></td>
  </tr>
  <tr>
    <td><sub><b>Options</b> — full settings, custom sites, backup</sub></td>
    <td><sub><b>Fonts</b> — bundled and custom fonts</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="assets/screenshots/welcome.png" alt="Hamsoo welcome tour, shown once on install"></td>
  </tr>
  <tr>
    <td colspan="2"><sub><b>Welcome tour</b> — opens once on install, with a live demo of every control</sub></td>
  </tr>
</table>

A stacked version of the comparison, for narrow screens, is at
[`assets/screenshots/comparison-stacked.png`](assets/screenshots/comparison-stacked.png).

---

## Installation

### Firefox — from the add-ons store (recommended)

**[Add to Firefox](https://addons.mozilla.org/en-US/firefox/addon/hamsoo-%D9%87%D9%85-%D8%B3%D9%88/)** — one click, automatic updates. Requires Firefox 140 or newer.

### Chromium browsers — Chrome, Edge, Brave, Opera

1. Clone the repository and build:
   ```bash
   git clone https://github.com/NaxonM/hamsoo.git
   cd hamsoo/hamsoo-addon
   npm run build
   ```
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select `dist/hamsoo-chromium`.

### From a release ZIP

Download `hamsoo-chromium.zip` or `hamsoo-firefox.zip` from
[Releases](https://github.com/NaxonM/hamsoo/releases), unzip it, and load the folder with the
**Load unpacked** steps above.

---

## Settings

| Setting | Range | Default |
| :--- | :--- | :--- |
| Font size | 12–22 px | 15 |
| Line height | 1.3–2.5 | 1.9 |
| Font weight | 300–800 | 400 |
| Letter spacing | 0–1.5 px | 0 |
| Reading width | 40–100 ch, or off | off |
| Text alignment | Start or justified | Start |
| Digit style | Persian `۱۲۳` or Arabic-Indic `١٢٣` | Persian |
| Interface language | Auto, Persian, English, Arabic | Auto |

Every setting can be overridden per site, so a site that already handles Persian well can be
left alone while others are corrected.

---

## Supported sites

Enabled out of the box:

| | | |
| :--- | :--- | :--- |
| ChatGPT — `chatgpt.com` | Claude — `claude.ai` | Gemini — `gemini.google.com` |
| DeepSeek — `chat.deepseek.com` | Grok — `grok.com` | Perplexity — `perplexity.ai` |
| Copilot — `copilot.microsoft.com` | AI Studio — `aistudio.google.com` | Qwen — `chat.qwen.ai` |
| Kimi — `kimi.moonshot.cn`, `kimi.com` | Poe — `poe.com` | NotebookLM — `notebooklm.google.com` |

Hamsoo is not limited to these. **Add this site** in the popup enables it anywhere, including
sites on non-standard ports such as a local development server.

---

## Privacy and permissions

Everything runs locally in your browser. There is no analytics, no telemetry, no remote server
and no network request of any kind. Your settings and any fonts you add stay in your own
browser profile.

| Permission | Why it is needed |
| :--- | :--- |
| `storage`, `unlimitedStorage` | Save your settings and custom font files locally |
| `contextMenus` | The right-click element picker |
| `activeTab`, `scripting` | Apply styling to a site you have enabled |
| `*://*/*` (optional) | **Not** granted at install. Requested only for the specific site you add, at the moment you add it |

Security reports: see [`SECURITY.md`](.github/SECURITY.md).

---

## Development

Zero third-party npm dependencies — everything is built on Node.js built-ins.

```bash
cd hamsoo-addon

npm run check     # static checks: JS syntax, JSON validity, i18n parity and content
npm run build     # build the Chromium and Firefox outputs
npm test          # 217 tests, including real headless-browser tests
npm run verify    # check + build + test
npm run zip       # package release ZIPs
npm run preview   # screenshot the popup, options and font pages for visual QA
npm run version:check  # report every place the version is written, and fail on drift
npm run release:notes  # release notes and store copy, generated from the changelog
```

`npm test` runs unit tests plus behavioral tests that drive a real headless Chromium, covering
direction classification on streamed content, digit conversion, shadow DOM, popup layout
metrics, and full teardown when the extension is disabled.

**Layout of the repository**

| Path | Contents |
| :--- | :--- |
| `hamsoo-addon/src/` | Extension source |
| `hamsoo-addon/test/` | Published test suite. `X.test.js` drives Node; the paired `X-checks.js` runs in-page |
| `hamsoo-addon/scripts/` | Build, check, packaging and preview tooling |
| `hamsoo-addon/website/` | Project website |
| `assets/` | Images used by these READMEs |
| `docs/DEBUGGING-REPORT.md` | Regression ledger. Source comments cite its R-numbers |

Internal debugging harnesses live in `dev/` and are deliberately excluded from the repository;
they are development instruments, not part of the shipped product or its test suite.

---

## Contributing

Issues and pull requests are welcome — see [`CONTRIBUTING.md`](.github/CONTRIBUTING.md).
Please run `npm run verify` before opening a pull request.

---

## Credits

Bundled fonts are open-source and remain under their own licenses: **Vazirmatn** (Saber
Rastikerdar), **Estedad** (Aviny Fonts), **Sahel**, **Shabnam**, **Samim** and **Gandom** (Saber
Rastikerdar).

Built by **[NaxonM](https://github.com/NaxonM)**.

---

## License

[GNU Affero General Public License v3.0](LICENSE) or later.
