'use strict';
/**
 * Welcome tour.
 *
 * Deliberately storage-free: the demo toggles restyle one sample paragraph and
 * nothing else. The tour must never be able to change a setting by accident,
 * and it must never be able to regress the reversibility guarantee, so it does
 * not touch the content engine or persist anything.
 *
 * The only extension APIs used are tabs.create and runtime.getURL, both guarded
 * so the page still renders (and the demo still works) when opened standalone
 * in a plain browser tab, which is how the DOM tests drive it.
 */
(function () {
  var api = globalThis.browser || globalThis.chrome;
  var hasAPI = !!(api && api.runtime && api.runtime.id);

  function $(id) { return document.getElementById(id); }

  // Apply the saved UI language. lang-init.js already set <html lang/dir> before
  // first paint; this fills in the actual strings and returns the resolved lang.
  var LANG = 'fa';
  // The raw preference ('auto' | 'fa' | 'en' | 'ar'), kept separate from the
  // resolved LANG so the switch can show which option is actually selected --
  // 'auto' and 'fa' can both resolve to 'fa' and must not look identical.
  var PREF = 'auto';
  try {
    // ?uilang= wins over the stored mirror, matching lang-init.js. That is what
    // makes the preview script and the DOM tests able to pin a language.
    var params = new URLSearchParams(location.search);
    var uilang = params.get('uilang');
    var pref = (uilang === 'fa' || uilang === 'en' || uilang === 'ar')
      ? uilang
      : (localStorage.getItem('hamsoo-lang') || 'auto');
    PREF = pref;
    if (globalThis.HamsooI18n) {
      LANG = globalThis.HamsooI18n.applyDom(document, pref);
    }
  } catch (e) { /* dictionary unavailable: the inline Persian defaults stand */ }

  /* ---------- live demo ---------- */

  var FA_DIGITS = '\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9';
  var AR_DIGITS = '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669';

  var sample = $('demoSample');
  // Captured after applyDom so it is the localized sample, not the inline fallback.
  var sampleText = sample ? sample.textContent : '';

  function localizeDigits(text) {
    var digits = LANG === 'ar' ? AR_DIGITS : FA_DIGITS;
    return text.replace(/[0-9]/g, function (d) { return digits.charAt(Number(d)); });
  }

  // One class per toggle, so a user flipping a single switch sees exactly one
  // change. The digit swap has to touch text rather than style, so it rebuilds
  // from the pristine string every time instead of converting in place -- that
  // way turning it off is lossless.
  function renderDemo() {
    if (!sample) return;
    sample.classList.toggle('is-rtl', !!($('demoDir') && $('demoDir').checked));
    sample.classList.toggle('is-font', !!($('demoFont') && $('demoFont').checked));
    sample.classList.toggle('is-read', !!($('demoRead') && $('demoRead').checked));
    var digits = !!($('demoDigits') && $('demoDigits').checked);
    sample.textContent = digits ? localizeDigits(sampleText) : sampleText;
  }

  ['demoDir', 'demoFont', 'demoRead', 'demoDigits'].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener('change', renderDemo);
  });

  /* ---------- language switch ---------- */

  function markLang(pref) {
    var seg = $('welcomeLangSeg');
    if (!seg) return;
    Array.prototype.forEach.call(seg.querySelectorAll('button[data-lang]'), function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-lang') === pref));
    });
  }

  function setLang(pref) {
    PREF = pref;
    if (globalThis.HamsooI18n) LANG = globalThis.HamsooI18n.applyDom(document, pref);
    // Re-read the sample: applyDom has just replaced it with the new language's
    // string, and the demo's digit swap rebuilds from this pristine copy every
    // time. Skipping this would leave the old language's text as the source and
    // silently undo the switch on the next toggle.
    if (sample) sampleText = sample.textContent;
    renderDemo();
    markLang(pref);
    // Synchronous mirror, so the next page to open paints in the chosen language
    // rather than flipping to it after the async storage read.
    try { localStorage.setItem('hamsoo-lang', pref); } catch (e) { /* private mode */ }
    // The tour still writes no settings of its own: the background owns the
    // persist funnel. Writing storage from here would be a second writer.
    if (hasAPI && api.runtime && api.runtime.sendMessage) {
      try { api.runtime.sendMessage({ type: 'HAMSOO_SET_LANG', lang: pref }); } catch (e) { /* no receiver */ }
    }
  }

  var langSeg = $('welcomeLangSeg');
  if (langSeg) {
    langSeg.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('button[data-lang]') : null;
      if (btn) setLang(btn.getAttribute('data-lang'));
    });
    markLang(PREF);
  }

  /* ---------- footer actions ---------- */

  // The popup pages work as full tabs (options.html already redirects into one),
  // so the tour can hand the user straight to a specific view.
  function openPage(query) {
    if (!hasAPI || !api.tabs || !api.tabs.create) return;
    try {
      // ui=tab centers and unclamps the 372px popup shell. Without it the panel
      // sat in the corner of a full-size window and read as a broken page.
      // Deliberately not action.openPopup(): it cannot deep-link to a view, so
      // "Report a bug" would land on the main screen, and Chrome requires the
      // call to sit inside a user-gesture chain that a message round-trip breaks.
      api.tabs.create({ url: api.runtime.getURL('popup.html' + query + '&ui=tab'), active: true });
    } catch (e) { /* nothing sensible to fall back to */ }
  }

  var settingsBtn = $('openSettingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', function () { openPage('?view=settings'); });
  }

  var reportBtn = $('reportBugBtn');
  if (reportBtn) {
    reportBtn.addEventListener('click', function () { openPage('?view=help'); });
  }

  renderDemo();
})();
