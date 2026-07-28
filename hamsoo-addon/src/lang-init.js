/* Applies the saved UI language synchronously, before first paint, so the
   options (custom fonts) and popup pages don't start in Persian and visibly
   flip to the chosen language after the async storage read. popup.js and
   fonts.js keep a synchronous mirror in localStorage
   (hamsoo-lang: 'auto' | 'fa' | 'en' | 'ar'). */
(function () {
  try {
    var params = new URLSearchParams(location.search);
    var uilang = params.get('uilang');
    var pref = (uilang === 'fa' || uilang === 'en' || uilang === 'ar')
      ? uilang
      : (localStorage.getItem('hamsoo-lang') || 'auto');
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
      /* Keep this rule identical to langFromLocaleAndZone() in i18n.js. The
         duplication is structural: this file runs before first paint and before
         the dictionary is loaded, so it cannot call into it, and if the two
         disagree the page paints in one language and then flips to another.
         test/i18n.test.js asserts both copies stay in step.
         Iran's browsers ship with an English interface, so an English ui
         language is not evidence that an English interface is wanted; the
         timezone is a second, independent signal. */
      var zone = '';
      try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { zone = ''; }
      if (/^ar/i.test(ui)) lang = 'ar';
      else if (/^(fa|per|prs)/i.test(ui)) lang = 'fa';
      else if (/^(Asia\/Tehran|Iran)$/i.test(zone)) lang = 'fa';
      else lang = 'en';
    }
    var el = document.documentElement;
    el.setAttribute('lang', lang);
    el.setAttribute('dir', (lang === 'fa' || lang === 'ar') ? 'rtl' : 'ltr');
  } catch (e) { /* fall back to the document's default lang/dir */ }
})();
