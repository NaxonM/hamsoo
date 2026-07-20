# Adding more fonts / افزودن فونت‌های بیشتر

There are two ways to add fonts to Hamsoo. Everything below applies to **both**
the `hamsoo-chromium/` and `hamsoo-firefox/` folders — the font-related files are
identical in the two builds, so make each change once and copy it to the other
folder (or just edit both).

دو راه برای افزودن فونت وجود دارد. موارد زیر برای **هر دو** پوشهٔ
`hamsoo-chromium/` و `hamsoo-firefox/` یکسان است.

---

## Option 1 — No code: add a personal font from the popup
## روش ۱ — بدون کد: افزودن فونت شخصی از داخل افزونه

This needs no rebuild and no store update. It is meant for end users.

1. Open the Hamsoo popup → **Font** → **Manage custom fonts**
   (پنجرهٔ هم‌سو ← فونت ← مدیریت فونت‌های شخصی).
2. Drop or choose a `.ttf`, `.otf`, `.woff`, or `.woff2` file (max 4 MB, up to 12 fonts).
3. The font is stored locally in IndexedDB and appears in the font list in the popup.

Use this when *you as a user* want a one-off font. Use Option 2 when you want a
font to ship **built-in** with the extension for everyone.

---

## Option 2 — Bundle a new built-in font (ships with the extension)
## روش ۲ — افزودن فونت همراه (داخل بسته)

Do this once per font, in each build folder. Prefer **`.woff2`** (smallest). A
single variable-weight woff2 is ideal because Hamsoo can then use every weight
from the font-weight slider.

### Step 1 — Drop the file in `fonts/`
Put the file in `fonts/`, e.g. `fonts/Estedad.woff2`. Keep it well under a few
hundred KB if you can; the whole extension package should stay small.

### Step 2 — Register it for page rendering in `content.js`
Add an entry to `BUILTIN_FONT_FILES` (near the top of `content.js`). The key is
the internal font id, `file` is the path, `format` is `woff2`/`woff`/`truetype`/
`opentype`, and `weight` must describe the weights the file **actually** contains:

- **Single-weight (static) file** → use `weight: 'normal'`. The browser then
  applies synthetic (faux) bold for the heavier slider positions.
- **Variable font (has an `fvar` table)** → use the real axis range, e.g.
  `weight: '100 900'`, for true, smooth weights across the whole slider.

> ⚠️ Do **not** put `'100 900'` on a static single-weight file. The browser then
> assumes the face already covers every weight, maps them all to the one master,
> and skips faux-bold — so the **font-weight slider silently does nothing**. The
> fonts bundled today (Vazirmatn, IRANSansX, Shabnam, Samim, Sahel) are all
> static, so they use `'normal'`. For real weight control, drop in a *variable*
> build of the font and switch its entry to a range.
>
> Quick check: a variable woff2 is usually 150 KB+ and contains an `fvar` table;
> the static files here are ~40–50 KB.

```js
const BUILTIN_FONT_FILES = {
  Vazirmatn: { file: 'fonts/Vazirmatn.woff2', format: 'woff2', weight: 'normal' },
  // ... existing entries ...
  Estedad:   { file: 'fonts/Estedad.woff2',   format: 'woff2', weight: 'normal' },
};
```

### Step 3 — Add the label shown in the popup, in `popup.js`
Add an item to `BUILTIN_FONTS` (near the top of `popup.js`). `key` must match the
key you used in Step 2; `label` is the display name (Persian looks best here).

```js
const BUILTIN_FONTS = [
  { key: 'Vazirmatn', label: 'وزیرمتن' },
  // ... existing entries ...
  { key: 'Estedad',   label: 'استعداد' },
];
```

### Step 4 — (Optional) make the popup preview swatch use the real font
The popup preview loads built-in fonts lazily via the FontFace API, so no CSS is
required. If you want the small “متن نمونه” swatch to render in the new font even
before it is selected, you can add an `@font-face` rule to `popup.css`, but this
is optional.

### Step 5 — Nothing else references the font list
The per-site override validation, import/export, and the options page all read
from the two lists above, so Steps 2–3 are enough for the font to be selectable,
saved, and synced.

### Step 6 — Rebuild and (if publishing) bump the version
Re-zip each build with `manifest.json` at the root:

```bash
cd hamsoo-chromium && zip -r -FS ../hamsoo-chromium.zip . -x '*.DS_Store' -x '__MACOSX/*'
cd ../hamsoo-firefox && zip -r -FS ../hamsoo-firefox.zip . -x '*.DS_Store' -x '__MACOSX/*'
```

If you are publishing to the stores, also raise `version` in **both** manifests
(see `RELEASE-fa.md`).

---

## Licensing — read before you bundle / مجوز — پیش از افزودن بخوانید

Bundling a font redistributes its files, so you must have a license that allows
redistribution in a browser extension.

- **Safe / open-source (SIL OFL, redistributable):** Vazirmatn, Estedad, Sahel,
  Shabnam, Samim, and Gandom are 100% open-source (SIL OFL) and bundled in this extension.
- **Commercial fonts:** Commercial fonts like **IRANSansX** are not bundled in the release package to comply with store guidelines and licensing. Users who hold an IRANSansX license can load their own font file via **Manage custom fonts** in the extension popup.

افزودن فونت به بسته یعنی توزیع فایل آن؛ هم‌سو فقط فونت‌های متن‌باز (وزیرمتن، استعداد، ساحل، شبنم، صمیم، گندم) را به صورت پیش‌فرض شامل می‌شود. فونت‌های تجاری نظیر ایران‌سنس در بسته موجود نیستند، اما کاربران دارای مجوز می‌توانند آن‌ها را از بخش «مدیریت فونت‌های شخصی» بارگذاری کنند.
