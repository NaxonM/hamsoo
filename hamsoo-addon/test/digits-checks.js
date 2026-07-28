'use strict';
/**
 * In-browser assertions for the per-locale digit conversion feature
 * (settings.digitsEnabled + settings.digitsScript), executed inside headless
 * Chromium by test/digits.test.js.
 *
 * Results are serialized as base64 JSON into document.title and read back
 * with --dump-dom.
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

  check('arabic-indic digits applied to rtl prose', () =>
    document.getElementById('prose').textContent.includes('\u0661\u0662\u0663'));

  check('latin digits no longer present in rtl prose', () =>
    !/[0-9]/.test(document.getElementById('prose').textContent));

  check('code block digits are left untouched', () =>
    document.getElementById('code').textContent.includes('123'));

  check('editable field digits are left untouched', () =>
    document.getElementById('editable').textContent.includes('123'));

  // Arabic-Indic digit range, used to prove a block was NOT converted.
  const AR_DIGIT_RE = /[\u0660-\u0669]/;

  check('nested rtl paragraph inside an rtl wrapper is converted', () =>
    document.getElementById('fa-nested').textContent.includes('\u0661\u0662\u0663'));

  check('nested latin paragraph inside an rtl wrapper keeps ascii digits', () => {
    const el = document.getElementById('en-nested');
    if (AR_DIGIT_RE.test(el.textContent)) throw new Error('ancestor converted a nested LTR block: ' + el.textContent);
    return el.textContent.includes('456');
  });

  check('bare contenteditable digits are left untouched', () =>
    document.getElementById('ce-bare').textContent.includes('123'));

  // Drop the Persian run so #flip is no longer RTL. The digits inside #keep
  // were localized on the first pass and must be handed back, because digits
  // are only ever localized inside RTL blocks.
  const flip = document.getElementById('flip');
  const keep = document.getElementById('keep');
  const localizedFirst = keep.textContent.includes('\u0661\u0662\u0663');
  const tail = document.getElementById('tail');
  if (tail) tail.remove();
  await new Promise(r => setTimeout(r, 900));

  check('digits are restored when a block stops being rtl', () => {
    if (!localizedFirst) throw new Error('precondition failed: digits were never localized');
    if (AR_DIGIT_RE.test(flip.textContent)) throw new Error('still localized after losing RTL: ' + flip.textContent);
    return keep.textContent.includes('123');
  });

  const json = JSON.stringify(results);
  document.title = 'HAMSOO_RESULTS:' + btoa(unescape(encodeURIComponent(json)));
})();
