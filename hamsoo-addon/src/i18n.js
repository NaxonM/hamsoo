'use strict';

// Hamsoo shared UI i18n for the runtime-switchable popup and options pages.
// The manifest metadata and the background context-menu use browser _locales
// (browser.i18n); this dictionary powers the in-popup language switch
// (Auto / فارسی / English), which browser _locales cannot change at runtime.
(function () {
  const DICT = {
    fa: {
      subtitle: 'راست‌چین‌ساز سایت‌های هوش مصنوعی',
      enableTitle: 'روشن یا خاموش کردن هم‌سو',
      scopeCardTitle: 'فقط برای این سایت',
      sitesTitle: 'سایت‌ها',
      fontTitle: 'فونت',
      manageFonts: 'مدیریت فونت‌های شخصی ←',
      readTitle: 'خوانایی',
      sizeLabel: 'اندازه قلم',
      lineLabel: 'فاصله خط‌ها',
      weightLabel: 'ضخامت قلم',
      letterLabel: 'فاصله حروف',
      alignLabel: 'چینش متن',
      alignStart: 'راست‌چین',
      alignJustify: 'هم‌تراز',
      widthLabel: 'عرض ستون',
      widthOff: 'کامل',
      widthNarrow: 'باریک',
      widthMedium: 'متوسط',
      widthWide: 'پهن',
      appearanceTitle: 'ظاهر',
      modeSystem: 'سیستم',
      modeLight: 'روشن',
      modeDark: 'تیره',
      accentBlue: 'آبی',
      accentTeal: 'سبزآبی',
      accentViolet: 'بنفش',
      accentAmber: 'کهربایی',
      langTitle: 'زبان',
      langAuto: 'خودکار',
      langFa: 'فارسی',
      langEn: 'English',
      digitsTitle: 'ارقام فارسی',
      digitsHint: 'ارقام لاتین در پاسخ‌ها به فارسی (۱۲۳) تبدیل می‌شوند.',
      punctTitle: 'اصلاح نشانه‌گذاری',
      punctHint: 'جهت نشانه‌گذاری در کادرهای نوشتن هنگام تایپ و چسباندن اصلاح می‌شود.',
      backupTitle: 'پشتیبان‌گیری',
      exportBtn: 'برون‌بری تنظیمات',
      importBtn: 'درون‌ریزی تنظیمات',
      saved: 'ذخیره شد',
      saveError: 'خطا در ذخیره‌سازی',
      exported: 'برون‌بری شد',
      imported: 'درون‌ریزی شد',
      invalidFile: 'فایل نامعتبر است',
      permissionDenied: 'دسترسی داده نشد',
      addedReload: 'افزوده شد — صفحه را تازه‌سازی کنید',
      activeHere: 'هم‌سو در این سایت فعال است',
      inactiveHere: 'در این سایت غیرفعال است',
      disable: 'غیرفعال کن',
      enable: 'فعال کن',
      customActive: 'به‌عنوان سایت شخصی فعال است',
      removeSite: 'حذف این سایت',
      notListed: 'این سایت در فهرست نیست',
      addSite: 'افزودن این سایت',
      suggestAdd: 'این صفحه فارسی زیادی دارد — افزودن؟',
      scopeOn: function (host) { return 'فونت و خوانایی برای «' + host + '» جداگانه ذخیره می‌شود.'; },
      scopeOff: 'فونت و خوانایی برای همه سایت‌ها اعمال می‌شود.',
      siteCount: function (on, total) { return on + ' از ' + total + ' فعال'; },
      optTitle: 'فونت‌های شخصی',
      optDesc: 'فایل فونت دلخواه خود (TTF، OTF، WOFF یا WOFF2) را اضافه کنید و سپس از پنجره هم‌سو انتخابش کنید.',
      dropTitle: 'افزودن فونت',
      dropHint: 'فایل را اینجا رها کنید یا برای انتخاب کلیک کنید (حداکثر ۴ مگابایت، ۱۲ فونت)',
      remove: 'حذف',
      sampleText: 'نمونه متن فارسی ۱۲۳',
      emptyFonts: 'هنوز فونت شخصی اضافه نکرده‌اید.',
      defaultFontName: 'فونت شخصی',
      saveSettingsError: 'خطا در ذخیره‌سازی تنظیمات',
      maxFonts: function (n) { return 'حداکثر ' + n + ' فونت شخصی مجاز است'; },
      unsupported: function (name) { return 'قالب فایل «' + name + '» پشتیبانی نمی‌شود'; },
      tooBig: function (name) { return 'فایل «' + name + '» بزرگتر از ۴ مگابایت است'; },
      addedFont: function (name) { return 'فونت «' + name + '» اضافه شد'; },
      addFailed: function (name) { return 'افزودن «' + name + '» ناموفق بود'; },
      removedFont: function (name) { return 'فونت «' + name + '» حذف شد'; },
      shortcutTitle: 'کلید میان‌بر',
      changeShortcut: 'تغییر میان‌بر',
      resetShortcut: 'بازنشانی',
      cancel: 'انصراف',
      shortcutHint: 'برای تغییر، روی دکمه کلیک کنید و کلید ترکیبی جدید را روی کیبورد فشار دهید.',
      shortcutRecording: 'کلیدها را فشار دهید...',
      recordingHint: 'کلید ترکیبی موردنظر (مانند Ctrl+Shift+H) را روی کیبورد فشار دهید.',
      openBrowserShortcuts: 'مدیریت میان‌بر در تنظیمات مرورگر ←',
      madeWith: 'ساخته‌شده با ❤️ توسط NaxonM'
    },
    en: {
      subtitle: 'RTL for Persian on AI chat sites',
      enableTitle: 'Turn Hamsoo on or off',
      scopeCardTitle: 'Only for this site',
      sitesTitle: 'Sites',
      fontTitle: 'Font',
      manageFonts: 'Manage custom fonts →',
      readTitle: 'Readability',
      sizeLabel: 'Font size',
      lineLabel: 'Line spacing',
      weightLabel: 'Font weight',
      letterLabel: 'Letter spacing',
      alignLabel: 'Text alignment',
      alignStart: 'Right',
      alignJustify: 'Justify',
      widthLabel: 'Reading width',
      widthOff: 'Full',
      widthNarrow: 'Narrow',
      widthMedium: 'Medium',
      widthWide: 'Wide',
      appearanceTitle: 'Appearance',
      modeSystem: 'System',
      modeLight: 'Light',
      modeDark: 'Dark',
      accentBlue: 'Blue',
      accentTeal: 'Teal',
      accentViolet: 'Violet',
      accentAmber: 'Amber',
      langTitle: 'Language',
      langAuto: 'Auto',
      langFa: 'فارسی',
      langEn: 'English',
      digitsTitle: 'Persian digits',
      digitsHint: 'Convert Latin digits to Persian (۱۲۳) in responses.',
      punctTitle: 'Punctuation fix',
      punctHint: 'Corrects punctuation direction in text boxes while typing and pasting.',
      backupTitle: 'Backup',
      exportBtn: 'Export settings',
      importBtn: 'Import settings',
      saved: 'Saved',
      saveError: 'Could not save',
      exported: 'Exported',
      imported: 'Imported',
      invalidFile: 'Invalid file',
      permissionDenied: 'Permission denied',
      addedReload: 'Added — reload the page',
      activeHere: 'Hamsoo is active on this site',
      inactiveHere: 'Disabled on this site',
      disable: 'Disable',
      enable: 'Enable',
      customActive: 'Active as a custom site',
      removeSite: 'Remove this site',
      notListed: 'This site is not in the list',
      addSite: 'Add this site',
      suggestAdd: 'This page has lots of Persian — add it?',
      scopeOn: function (host) { return 'Font & readability are saved separately for “' + host + '”.'; },
      scopeOff: 'Font & readability apply to all sites.',
      siteCount: function (on, total) { return on + ' of ' + total + ' active'; },
      optTitle: 'Custom fonts',
      optDesc: 'Add your own font file (TTF, OTF, WOFF or WOFF2), then pick it from the Hamsoo popup.',
      dropTitle: 'Add font',
      dropHint: 'Drop a file here or click to choose (max 4 MB, 12 fonts)',
      remove: 'Remove',
      sampleText: 'Sample Persian text ۱۲۳',
      emptyFonts: 'No custom fonts yet.',
      defaultFontName: 'Custom font',
      saveSettingsError: 'Could not save settings',
      maxFonts: function (n) { return 'Up to ' + n + ' custom fonts allowed'; },
      unsupported: function (name) { return 'File “' + name + '” format is not supported'; },
      tooBig: function (name) { return 'File “' + name + '” is larger than 4 MB'; },
      addedFont: function (name) { return 'Font “' + name + '” added'; },
      addFailed: function (name) { return 'Adding “' + name + '” failed'; },
      removedFont: function (name) { return 'Font “' + name + '” removed'; },
      shortcutTitle: 'Keyboard shortcut',
      changeShortcut: 'Change shortcut',
      resetShortcut: 'Reset',
      cancel: 'Cancel',
      shortcutHint: 'Click button above and press your new key combination.',
      shortcutRecording: 'Press keys...',
      recordingHint: 'Press your key combination (e.g. Ctrl+Shift+H) on your keyboard.',
      openBrowserShortcuts: 'Manage shortcuts in browser settings →',
      madeWith: 'Made with ❤️ by NaxonM'
    }
  };

  function resolveLang(pref) {
    if (pref === 'fa' || pref === 'en') return pref;
    let ui = 'en';
    try {
      const api = globalThis.browser || globalThis.chrome;
      ui = (api && api.i18n && api.i18n.getUILanguage && api.i18n.getUILanguage()) ||
        (globalThis.navigator && navigator.language) || 'en';
    } catch (_) {
      ui = (globalThis.navigator && navigator.language) || 'en';
    }
    return /^(fa|per|prs)/i.test(ui) ? 'fa' : 'en';
  }

  function t(key, lang) {
    const l = resolveLang(lang);
    const table = DICT[l] || DICT.en;
    if (table[key] != null) return table[key];
    if (DICT.fa[key] != null) return DICT.fa[key];
    return key;
  }

  function applyDom(root, lang) {
    const l = resolveLang(lang);
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      const val = t(el.getAttribute('data-i18n'), l);
      if (typeof val === 'string') el.textContent = val;
    });
    scope.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        const parts = pair.split(':');
        const attr = (parts[0] || '').trim();
        const key = (parts[1] || '').trim();
        if (!attr || !key) return;
        const val = t(key, l);
        if (typeof val === 'string') el.setAttribute(attr, val);
      });
    });
    const html = document.documentElement;
    if (html) {
      html.setAttribute('lang', l);
      html.setAttribute('dir', l === 'fa' ? 'rtl' : 'ltr');
    }
    return l;
  }

  globalThis.HamsooI18n = { DICT: DICT, resolveLang: resolveLang, t: t, applyDom: applyDom };
})();
