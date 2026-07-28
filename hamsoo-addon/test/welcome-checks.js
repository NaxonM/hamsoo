'use strict';
/**
 * In-browser assertions for the welcome tour, executed inside headless Chromium
 * by test/welcome.test.js (via the scripts/uiharness.js copy).
 *
 * The page is opened with ?uilang=en so the copy under test is deterministic
 * regardless of the machine's UI language.
 *
 * The single most valuable assertion here is the last one: the tour must never
 * write to storage. It is the only page that runs before the user has touched
 * anything, and a demo that silently saved state would be a genuine betrayal of
 * the "nothing leaves this device, nothing changes behind your back" promise.
 *
 * Results are serialized as base64 JSON into document.title and read back with
 * --dump-dom, matching test/dom-checks.js.
 */
(async () => {
  const results = [];
  function check(name, fn) {
    try {
      const v = fn();
      if (v === false) throw new Error('check returned false');
      results.push({ name: name, ok: true });
    } catch (e) {
      results.push({ name: name, ok: false, msg: String((e && e.message) || e) });
    }
  }

  const $ = (id) => document.getElementById(id);

  // Let welcome.js apply the dictionary and the first demo render.
  await new Promise(r => setTimeout(r, 300));

  const sample = $('demoSample');
  const original = sample ? sample.textContent : '';

  function flip(id) {
    const el = $(id);
    el.checked = !el.checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  check('welcome tour renders the hero and the demo', () =>
    !!sample && !!document.querySelector('.hero-figure img[src="welcome-hero.webp"]'));

  check('welcome copy is localized', () =>
    document.querySelector('.hero h1').textContent === 'Hamsoo is installed');

  // The sample must open in the state the user suffers from, or the demo proves
  // nothing: Persian text forced left-to-right in the browser's default font.
  check('demo sample starts in the unfixed state', () =>
    !sample.classList.contains('is-rtl') &&
    getComputedStyle(sample).direction === 'ltr');

  flip('demoDir');
  check('direction toggle changes only direction', () =>
    sample.classList.contains('is-rtl') &&
    getComputedStyle(sample).direction === 'rtl' &&
    !sample.classList.contains('is-font') &&
    !sample.classList.contains('is-read'));

  flip('demoFont');
  check('font toggle applies the bundled font', () =>
    sample.classList.contains('is-font') &&
    /Vazirmatn/.test(getComputedStyle(sample).fontFamily));

  // Asserts all three effects of the readability toggle. These are plain
  // computed values because welcome.css deliberately does not transition
  // font-size or line-height: a CSS transition is invisible to this harness,
  // since virtual time never advances the animation clock and getComputedStyle
  // would report the pre-toggle value indefinitely.
  flip('demoRead');
  check('readability toggle changes size and spacing', () => {
    const cs = getComputedStyle(sample);
    return sample.classList.contains('is-read') &&
      cs.fontSize === '17px' &&
      cs.lineHeight !== '22.5px' &&
      cs.maxWidth !== 'none';
  });

  flip('demoDigits');
  check('digits toggle localizes digits', () =>
    sample.textContent.indexOf('\u06F2\u06F0\u06F2\u06F4') !== -1 &&
    sample.textContent.indexOf('2024') === -1);

  // Reversibility is the project's core promise, so even the demo honors it.
  flip('demoDigits');
  check('digits toggle is losslessly reversible', () =>
    sample.textContent === original);

  // Catches a control row whose dictionary key was never added: applyDom leaves
  // the element empty rather than throwing, which is easy to miss by eye.
  check('every control row has a localized description', () => {
    const rows = Array.from(document.querySelectorAll('.controls dd'));
    return rows.length === 6 && rows.every(dd => dd.textContent.trim().length > 0);
  });

  /* ---------- language switch ---------- */

  function pickLang(lang) {
    $('welcomeLangSeg').querySelector('button[data-lang="' + lang + '"]').click();
  }

  // This page opens on install, and 'auto' resolves from the browser's UI
  // language -- English for much of this audience even when Persian is wanted.
  // So the switch has to exist, sit above the copy it changes, and offer the
  // same four options as the popup.
  check('language switch is offered above the tour', () => {
    const seg = $('welcomeLangSeg');
    const hero = document.querySelector('.hero');
    const langs = Array.from(seg.querySelectorAll('button[data-lang]'))
      .map(b => b.getAttribute('data-lang'));
    const segComesFirst = !!(seg.compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_FOLLOWING);
    return langs.join(',') === 'auto,fa,en,ar' && segComesFirst;
  });

  check('switching language re-localizes the page and marks the choice', () => {
    pickLang('fa');
    const html = document.documentElement;
    const h1 = document.querySelector('.hero h1').textContent;
    const seg = $('welcomeLangSeg');
    return html.getAttribute('lang') === 'fa' &&
      html.getAttribute('dir') === 'rtl' &&
      h1.length > 0 &&
      h1 !== 'Hamsoo is installed' &&
      seg.querySelector('button[data-lang="fa"]').getAttribute('aria-checked') === 'true' &&
      seg.querySelector('button[data-lang="auto"]').getAttribute('aria-checked') === 'false';
  });

  // The sample paragraph is itself a dictionary string, so a language switch has
  // to re-read it. If it did not, the digit swap would rebuild the *previous*
  // language's sentence and silently undo the switch. Arabic also proves the
  // digit script follows the language: Arabic-Indic, not Persian.
  check('switching language rebinds the demo sample', () => {
    pickLang('ar');
    const arabicCopy = sample.textContent;
    flip('demoDigits');
    const localized = sample.textContent.indexOf('\u0662\u0660\u0662\u0664') !== -1;
    flip('demoDigits');
    return localized && sample.textContent === arabicCopy && arabicCopy !== original;
  });

  // Still true with the language switch in place, and deliberately checked after
  // it has been used three times: the switch forwards the choice to the
  // background rather than writing settings here, so this page remains a page
  // that cannot change behavior by itself.
  check('the tour never writes to storage', () =>
    globalThis.__HAMSOO_LAST_SET__ === null);

  const json = JSON.stringify(results);
  document.title = 'HAMSOO_RESULTS:' + btoa(unescape(encodeURIComponent(json)));
})();
