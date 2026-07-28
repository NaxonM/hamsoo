'use strict';
/**
 * In-browser assertions for the two reported Kimi defects, executed inside
 * headless Chromium by test/kimi.test.js.
 *
 * 1. Kimi renders markdown paragraphs as <div class="paragraph">, which matched
 *    no SELECTOR entry, so they were never classified.
 * 2. Kimi sets font-size/line-height/font-family directly on those paragraphs
 *    and on the <em>/<strong> inside them, so typography set on a marked
 *    ancestor never reached the visible text and the readability sliders looked
 *    like no-ops.
 *
 * Results are serialized as base64 JSON into document.title and read back with
 * --dump-dom.
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

  // Let the content script initialize and run its first scan.
  await new Promise(r => setTimeout(r, 900));

  const el = id => document.getElementById(id);
  const markOf = id => el(id).getAttribute('data-hamsoo');
  const dirOf = id => getComputedStyle(el(id)).direction;
  const sizeOf = id => Math.round(parseFloat(getComputedStyle(el(id)).fontSize));
  const famOf = id => getComputedStyle(el(id)).fontFamily;

  // --- Defect 1: the paragraph divs were never collected -------------------
  check('kimi paragraph div is processed, not skipped', () => {
    const mark = markOf('kFa1');
    if (mark !== 'rtl') {
      throw new Error('data-hamsoo=' + mark + ' (element was never classified)');
    }
    return true;
  });

  check('every kimi paragraph in a persian answer is classified', () => {
    for (const id of ['kFa1', 'kFa2', 'kFa3']) {
      if (markOf(id) !== 'rtl') {
        throw new Error(id + ' data-hamsoo=' + markOf(id));
      }
    }
    return true;
  });

  // The bilingual paragraph from the report: English opens and closes it, so it
  // keeps an LTR base, but its Persian run must still be styled.
  check('kimi bilingual paragraph is classified, not skipped', () => {
    const mark = markOf('kMixed');
    if (mark !== 'ltr-mixed') throw new Error('data-hamsoo=' + mark);
    return true;
  });

  check('kimi bilingual paragraph keeps an ltr base', () =>
    dirOf('kMixed') === 'ltr');

  // Counter-case: paragraphs with no Persian at all must stay untouched, or
  // adding '.paragraph' to SELECTOR would restyle every Kimi answer.
  check('latin-only kimi paragraph is left untouched', () => {
    for (const id of ['kIntro', 'kHead', 'kTrHead']) {
      if (markOf(id) !== null) throw new Error(id + ' data-hamsoo=' + markOf(id));
    }
    return true;
  });

  check('kimi translation list still promotes its bullets to the right', () =>
    el('kList').getAttribute('data-hamsoo-box') === 'rtl');

  // --- Defect 2: readability could not reach the text ----------------------
  // Kimi's own rule sets 13px on the <em>; the site-scoped deep rule must win
  // and hand it the configured size (default 15px).
  check('readability reaches text that kimi styles directly', () => {
    const size = sizeOf('kEm');
    if (size !== 15) {
      throw new Error('font-size=' + size + 'px (kimi sets 13px; readability never reached it)');
    }
    return true;
  });

  check('the persian font reaches text that kimi styles directly', () => {
    const fam = famOf('kEm');
    if (/KimiSans/.test(fam)) {
      throw new Error('font-family=' + fam + ' (still kimi own font)');
    }
    if (fam !== famOf('kFa1')) {
      throw new Error('font-family=' + fam + ' but marked blocks use ' + famOf('kFa1'));
    }
    return true;
  });

  // --- Scoping: deep descendant styling is per-host by design -------------
  // Removing the host key must switch the deep rules off again, proving they
  // are scoped and are not silently restyling every site's inner nodes. This
  // mutates the document, so it runs last.
  check('deep styling is scoped: it stops when the host is not listed', () => {
    document.documentElement.removeAttribute('data-hamsoo-site');
    const size = sizeOf('kEm');
    if (size !== 13) {
      throw new Error('font-size=' + size + 'px with no site key; deep rule is not host-scoped');
    }
    return true;
  });

  // ...while the ordinary block-level rule, which is NOT host-scoped, still
  // applies to the marked paragraph itself.
  check('block-level readability survives without the site scope', () => {
    const size = sizeOf('kFa1');
    if (size !== 15) throw new Error('font-size=' + size + 'px on the marked block');
    return true;
  });

  const json = JSON.stringify(results);
  document.title = 'HAMSOO_RESULTS:' + btoa(unescape(encodeURIComponent(json)));
})();
