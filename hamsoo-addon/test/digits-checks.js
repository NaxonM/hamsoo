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

  const json = JSON.stringify(results);
  document.title = 'HAMSOO_RESULTS:' + btoa(unescape(encodeURIComponent(json)));
})();
