# هم‌سو (Hamsoo) 🌌

[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Chromium%20%7C%20Firefox-brightgreen.svg)](#installation)
[![English README](https://img.shields.io/badge/English_README-🌐-7c5cff.svg)](README.md)
[![Website](https://img.shields.io/badge/Website-naxonm.github.io%2Fhamsoo-purple.svg)](https://naxonm.github.io/hamsoo)

> افزونهٔ رایگان، حامی حریم خصوصی و متن‌باز مرورگر برای اصلاح و زیباسازی تایپوگرافی فارسی و راست‌چین‌سازی در پلتفرم‌های هوش مصنوعی (ChatGPT، Claude، Gemini، DeepSeek، Perplexity و ...).

---

🌐 **پایگاه اینترنتی و نمایش زنده:** [naxonm.github.io/hamsoo](https://naxonm.github.io/hamsoo)

---

## ✨ امکانات برجسته

- ↔️ **راست‌چین‌سازی هوشمند (Bidi):** تشخیص خودکار و آنی جهت متون فارسی بدون به‌هم‌ریختن کدهای برنامه‌نویسی و واژگان انگلیسی.
- ✒️ **فونت‌های زیبای فارسی:** دارای ۶ فونت متن‌باز و محبوب (**وزیرمتن**، **استعداد**، **ساحل**، **شبنم**، **صمیم**، **گندم**).
- 🎨 **پشتیبانی از فونت شخصی:** امکان بارگذاری هر فایل فونت دلخواه با فرمت `.woff2`، `.ttf` یا `.otf` مستقیماً از روی رایانهٔ شما.
- 🔍 **تنظیمات کامل خوانایی:** کنترل دقیق اندازهٔ قلم، فاصلهٔ سطرها، ضخامت قلم، فاصلهٔ حروف، چینش متن و عرض ستون خوانایی.
- 🔢 **ارقام فارسی و اصلاح نشانه‌گذاری:** تبدیل خودکار اعداد لاتین به فارسی (`۱۲۳`) در پاسخ‌های هوش مصنوعی و اصلاح جهت علائم نگارشی هنگام تایپ.
- 🔒 **۱۰۰٪ محلی و امن:** تمامی پردازش‌ها کاملاً درون مرورگر انجام می‌شود. بدون ردیابی، آنالیتیکس یا انتقال داده به سرور خارج.
- ⌨️ **کلید میان‌بر:** خاموش/روشن کردن سریع با کلید ترکیبی `Alt+Shift+R` (قابل تغییر در تنظیمات مرورگر).

---

## 💻 پلتفرم‌های هوش مصنوعی پشتیبانی‌شده

| پلتفرم | نشانی |
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

## 🚀 راهنمای نصب

<a id="installation"></a>

### روش اول: نصب نسخهٔ سورس (Load Unpacked)

#### مرورگرهای کرومیوم (Google Chrome، Microsoft Edge، Brave، Opera)
۱. مخزن را دریافت یا کلون کنید:
   ```bash
   git clone https://github.com/NaxonM/hamsoo.git
   cd hamsoo/hamsoo-addon
   ```
۲. خروجی افزونه را بسازید:
   ```bash
   npm run build
   ```
۳. در مرورگر خود به نشانی `chrome://extensions` بروید.
۴. گزینه‌ی **Developer mode** را از بالای صفحه روشن کنید.
۵. روی دکمه‌ی **Load unpacked** کلیک کرده و پوشه‌ی `dist/hamsoo-chromium` را انتخاب کنید.

#### مرورگر موزیلا فایرفاکس (Firefox)
۱. مخزن را دریافت و خروجی را بسازید:
   ```bash
   git clone https://github.com/NaxonM/hamsoo.git
   cd hamsoo/hamsoo-addon
   npm run build
   ```
۲. در فایرفاکس به نشانی `about:debugging#/runtime/this-firefox` بروید.
۳. روی دکمه‌ی **Load Temporary Add-on...** کلیک کنید.
۴. فایل `dist/hamsoo-firefox/manifest.json` را انتخاب کنید.

---

### روش دوم: دریافت بسته آماده ZIP

۱. بستهٔ `hamsoo-chromium.zip` یا `hamsoo-firefox.zip` را از بخش [انتشارهای گیت‌هاب (Releases)](https://github.com/NaxonM/hamsoo/releases) دانلود کنید.
۲. آن را از حالت فشرده خارج کنید.
۳. طبق مراحل **Load unpacked** بالا پوشه‌ی استخراج‌شده را بارگذاری کنید.

---

## 🛠️ توسعه و ساخت پروژه

این پروژه بدون هیچ کتابخانه‌ی وابستگی جانبی و تنها با قابلیت‌های استاندارد Node.js ساخته شده است.

```bash
cd hamsoo-addon

# بررسی‌های استاتیک (سنتکس، JSON، سلامت زبان‌ها و لینت)
npm run check

# ساخت خروجی‌های کروم و فایرفاکس
npm run build

# اجرای آزمون‌ها (Tests)
npm test

# اجرای کامل ارزیابی (تست + ساخت + بررسی)
npm run verify

# بسته‌بندی فایل‌های ZIP انتشار
npm run zip
```

---

## 📄 مجوز انتشار (License)

این پروژه تحت مجوز **GNU Affero General Public License v3.0 (AGPLv3)** منتشر شده است.  
برای جزئیات بیشتر فایل [`LICENSE`](LICENSE) را مطالعه کنید.

---

## 👤 سازنده

توسعه‌یافته با ❤️ توسط **[NaxonM](https://github.com/NaxonM)**  
مخزن گیت‌هاب: [https://github.com/NaxonM/hamsoo](https://github.com/NaxonM/hamsoo)
