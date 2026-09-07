<div align="center">

<img src="assets/logo.png" width="112" height="112" alt="Hamsoo logo">

# Hamsoo &nbsp;·&nbsp; هم‌سو

**RTL and Persian typography fix for AI chat interfaces.**

AI chat platforms often struggle with Persian and right-to-left (RTL) text — displaying left-aligned paragraphs, broken punctuation, and cramped default fonts. Hamsoo fixes text direction, font rendering, and line spacing across AI web chats directly in your browser without altering your content.

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

---

## Contents

[Features](#features) ·
[Screenshots](#screenshots) ·
[Supported Sites](#supported-sites) ·
[Installation](#installation) ·
[Settings](#settings) ·
[Privacy & Permissions](#privacy--permissions) ·
[Development](#development) ·
[License](#license)

---

## Features

### Text Direction & Layout
* **Automatic RTL Detection**: Resolves base direction per element using first-strong-character detection (`dir="auto"` standard), updated dynamically on streaming AI responses.
* **Smart Bidi & Mixed Content**: Persian sentences with embedded English terms maintain proper reading direction without flipping or reversing words.
* **Code Protection**: `pre`, `code`, links, inline code, and URLs remain strictly left-to-right.
* **Input Box Handling**: Automatically sets composer direction from the first character typed.
* **Reversible Digit Conversion**: Convert Latin numbers to Persian (`۱۲۳`) or Arabic-Indic (`١٢٣`) digits on demand.

### Typography & Readability
* **Bundled Persian Fonts**: Includes Vazirmatn, Estedad, Sahel, Shabnam, Samim, and Gandom.
* **Custom Font Uploads**: Load your own `.woff2`, `.ttf`, or `.otf` font files (up to 12 custom fonts).
* **Fine-Grained Controls**: Customize font size, line height, font weight, letter spacing, text alignment, and reading column width.
* **Per-Host Overrides**: Save unique typography configurations for individual domains.

### Management & Usability
* **Instant Toggle**: Enable/disable Hamsoo cleanly without page reloads (restores original DOM state immediately).
* **Keyboard Shortcut**: `Alt+Shift+R` (customizable in browser settings).
* **Custom Sites & Element Picker**: Enable Hamsoo on any non-standard website or right-click specific DOM elements to fix target containers.
* **Backups**: Export and import a settings file, including custom fonts.
* **Multi-Language UI**: Full Persian, English, and Arabic interface support with dark mode.

---

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/popup.png" alt="Hamsoo popup, light theme"></td>
    <td width="50%"><img src="assets/screenshots/popup-dark.png" alt="Hamsoo popup, dark theme"></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Popup</b> — Quick controls (Light / Dark)</sub></td>
    <td align="center"><sub><b>Popup</b> — Dark theme</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/options.png" alt="Hamsoo options page"></td>
    <td width="50%"><img src="assets/screenshots/fonts.png" alt="Hamsoo font manager"></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Settings</b> — Domain overrides & backup</sub></td>
    <td align="center"><sub><b>Font Manager</b> — Custom fonts</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="assets/screenshots/welcome.png" alt="Hamsoo welcome tour"></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><sub><b>Welcome Tour</b> — First-run onboarding & live interactive demo</sub></td>
  </tr>
</table>

Stacked vertical comparison available at [`assets/screenshots/comparison-stacked.png`](assets/screenshots/comparison-stacked.png).

---

## Supported Sites

Pre-configured out of the box:

| | | |
| :--- | :--- | :--- |
| ChatGPT (`chatgpt.com`) | Claude (`claude.ai`) | Gemini (`gemini.google.com`) |
| DeepSeek (`chat.deepseek.com`) | Grok (`grok.com`) | Perplexity (`perplexity.ai`) |
| Copilot (`copilot.microsoft.com`) | AI Studio (`aistudio.google.com`) | Qwen (`chat.qwen.ai`) |
| Kimi (`kimi.moonshot.cn`, `kimi.com`) | Poe (`poe.com`) | NotebookLM (`notebooklm.google.com`) |

Use **Add this site** in the popup to enable Hamsoo on any other domain or local development server.

---

## Installation

### Firefox (Recommended)
Install from **[Firefox Add-ons (AMO)](https://addons.mozilla.org/en-US/firefox/addon/hamsoo-%D9%87%D9%85-%D8%B3%D9%88/)**.

### Chromium Browsers (Chrome, Edge, Brave, Opera)
1. Clone repository and build:
   ```bash
   git clone https://github.com/NaxonM/hamsoo.git
   cd hamsoo/hamsoo-addon
   npm run build
   ```
2. Open `chrome://extensions` (or `edge://extensions`) and enable **Developer mode**.
3. Click **Load unpacked** and select `dist/hamsoo-chromium`.

Alternatively, download `hamsoo-chromium.zip` from [Releases](https://github.com/NaxonM/hamsoo/releases), unpack it, and load it via **Load unpacked**.

---

## Settings

| Setting | Range | Default |
| :--- | :--- | :--- |
| Font size | 12–22 px | 15 |
| Line height | 1.3–2.5 | 1.9 |
| Font weight | 300–800 | 400 |
| Letter spacing | 0–1.5 px | 0 |
| Reading column width | 40–100 ch, or Off | Off |
| Alignment | Start or Justified | Start |
| Digit style | Persian (`۱۲۳`) or Arabic-Indic (`١٢٣`) | Persian |
| Interface language | Auto, Persian, English, Arabic | Auto |

---

## Privacy & Permissions

Hamsoo runs entirely in your browser without telemetry, analytics, tracking, or network requests.

* `storage`, `unlimitedStorage`: Save user settings and local font files.
* `contextMenus`: Right-click element picker.
* `activeTab`, `scripting`: Inject styling into active tabs.
* `*://*/*` (*optional*): Requested only when explicitly clicking "Add this site" for custom domains.

Security details: [`SECURITY.md`](.github/SECURITY.md).

---

## Development

Built without external runtime npm dependencies using pure Web APIs and Node.js built-ins.

```bash
cd hamsoo-addon

npm run check         # Syntax, manifest validation, and i18n checks
npm run build         # Build Chromium and Firefox targets
npm test              # Run 280 automated headless tests
npm run verify        # Check + build + test gate
npm run zip           # Package release archives
npm run preview       # Generate UI screenshots
```

**Project Structure**

* `hamsoo-addon/src/`: Extension source files (content script, background, popup, options).
* `hamsoo-addon/test/`: Test suite (Node runner and browser check scripts).
* `hamsoo-addon/scripts/`: Build, packaging, and validation utilities.
* `hamsoo-addon/website/`: Project landing page.
* `assets/`: Documentation assets.
* `docs/HANDOVER.md` / `docs/GROUND-TRUTH.md`: Current open work (H01–H15).
* `docs/DEBUGGING-REPORT.md`: Historical R1–R6 regression ledger.

---

## Contributing & License

Contributions and bug reports are welcome. See [`CONTRIBUTING.md`](.github/CONTRIBUTING.md) for details. Please run `npm run verify` before submitting pull requests.

Bundled fonts: **Vazirmatn**, **Estedad**, **Sahel**, **Shabnam**, **Samim**, and **Gandom** (licensed under OFL / SIL).

Created by **[NaxonM](https://github.com/NaxonM)**. Released under [AGPL-3.0-or-later](LICENSE).
