# Hamsoo 🌌

[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Chromium%20%7C%20Firefox-brightgreen.svg)](#installation)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-informational.svg)](package.json)
[![Website](https://img.shields.io/badge/Website-naxonm.github.io%2Fhamsoo-purple.svg)](https://naxonm.github.io/hamsoo)
[![Persian README](https://img.shields.io/badge/Persian_README-🇮🇷-7c5cff.svg)](README.fa.md)

**Hamsoo (هم‌سو)** is a free, privacy-first, and open-source WebExtension designed to bring beautiful Persian & RTL typography to modern AI chat interfaces (ChatGPT, Claude, Gemini, DeepSeek, Perplexity, and more).

🌐 **Live Showcase & Interactive Demo:** [naxonm.github.io/hamsoo](https://naxonm.github.io/hamsoo)

---

## ✨ Features

- ↔️ **Smart Automatic RTL & Bidi:** Instantly detects Persian text direction without messing up code blocks or English words.
- ✒️ **Beautiful Persian Fonts:** Includes 6 high-quality open-source fonts (**Vazirmatn**, **Estedad**, **Sahel**, **Shabnam**, **Samim**, **Gandom**).
- 🎨 **Custom Font Support:** Load any `.woff2`, `.ttf`, or `.otf` font directly from your computer.
- 🔍 **Readability Controls:** Fine-tune font size, line spacing, font weight, letter spacing, text alignment, and reading width.
- 🔢 **Persian Digits & Punctuation Fix:** Automatically converts numbers to Persian (`۱۲۳`) in AI responses and fixes punctuation direction while typing.
- 🔒 **100% Private & Local:** All processing is done strictly inside your browser. No analytics, tracking, or remote servers.
- ⌨️ **Keyboard Shortcut:** Quick toggle on/off using `Alt+Shift+R` (customizable).

---

## 💻 Supported AI Platforms

| Platform | URL |
| :--- | :--- |
| **ChatGPT** | `chatgpt.com` |
| **Claude** | `claude.ai` |
| **Gemini** | `gemini.google.com` |
| **DeepSeek** | `chat.deepseek.com` |
| **Grok** | `grok.com` |
| **Perplexity** | `perplexity.ai` |
| **Copilot** | `copilot.microsoft.com` |
| **Google AI Studio** | `aistudio.google.com` |
| **Qwen** | `chat.qwen.ai` |
| **Kimi** | `kimi.moonshot.cn` / `kimi.com` |
| **Poe** | `poe.com` |
| **NotebookLM** | `notebooklm.google.com` |

---

## 🚀 Installation

<a id="installation"></a>

### Option 1: Load Unpacked Extension (From Source)

#### For Chromium Browsers (Google Chrome, Microsoft Edge, Brave, Opera)
1. Clone or download this repository:
   ```bash
   git clone https://github.com/NaxonM/hamsoo.git
   cd hamsoo/hamsoo-addon
   ```
2. Build the extension artifacts:
   ```bash
   npm run build
   ```
3. Open your browser and navigate to `chrome://extensions` (or `edge://extensions`).
4. Enable **Developer mode** using the toggle switch in the top right corner.
5. Click **Load unpacked** and select the `dist/hamsoo-chromium` directory.

#### For Mozilla Firefox
1. Clone or download this repository:
   ```bash
   git clone https://github.com/NaxonM/hamsoo.git
   cd hamsoo/hamsoo-addon
   npm run build
   ```
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select `dist/hamsoo-firefox/manifest.json`.

---

### Option 2: Pre-built Release ZIPs

1. Download `hamsoo-chromium.zip` or `hamsoo-firefox.zip` from [GitHub Releases](https://github.com/NaxonM/hamsoo/releases).
2. Unzip the file to a local directory.
3. Follow the **Load unpacked** steps above targeting the extracted folder.

---

## 🛠️ Development & Building

The project is built with zero third-party npm dependencies using Node.js built-ins.

```bash
cd hamsoo-addon

# Run static checks (JS syntax, JSON validity, i18n parity, lint)
npm run check

# Build extension outputs for Chromium and Firefox
npm run build

# Run unit tests
npm test

# Run complete verification (check + build + test)
npm run verify

# Create release zip packages
npm run zip
```

---

## 📄 License

Distributed under the **GNU Affero General Public License v3.0 (AGPLv3)**.  
See [`LICENSE`](LICENSE) for details.

---

## 👤 Author & Credits

Created with ❤️ by **[NaxonM](https://github.com/NaxonM)**  
Repository: [https://github.com/NaxonM/hamsoo](https://github.com/NaxonM/hamsoo)
