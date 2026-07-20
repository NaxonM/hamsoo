/* Applies the saved UI language synchronously, before first paint, so the
   options (custom fonts) and popup pages don't start in Persian and visibly
   flip to the chosen language after the async storage read. popup.js and
   fonts.js keep a synchronous mirror in localStorage
   (hamsoo-lang: 'auto' | 'fa' | 'en' | 'ar'). */
(function () {
  try {
    var pref = localStorage.getItem('hamsoo-lang') || 'auto';
    var lang;
    if (pref === 'fa' || pref === 'en' || pref === 'ar') {
      lang = pref;
    } else {
      var ui = 'en';
      try {
        var a = globalThis.browser || globalThis.chrome;
        ui = (a && a.i18n && a.i18n.getUILanguage && a.i18n.getUILanguage()) ||
          (navigator && navigator.language) || 'en';
      } catch (e) {
        ui = (navigator && navigator.language) || 'en';
      }
      if (/^(fa|per|prs)/i.test(ui)) lang = 'fa';
      else if (/^ar/i.test(ui)) lang = 'ar';
      else lang = 'en';
    }
    var el = document.documentElement;
    el.setAttribute('lang', lang);
    el.setAttribute('dir', (lang === 'fa' || lang === 'ar') ? 'rtl' : 'ltr');
  } catch (e) { /* fall back to the document's default lang/dir */ }
})();
