'use strict';
/**
 * In-browser assertions for picked-element selectors (settings.customSelectors),
 * executed inside headless Chromium by test/selectors.test.js.
 *
 * The stub seeds selectors under the '' host key, which matches
 * location.hostname on file:// fixture pages. One deliberately invalid
 * selector is seeded alongside to prove that a bad stored string cannot
 * break scanning.
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

  check('picked element marked rtl', () =>
    document.getElementById('picked').getAttribute('data-hamsoo') === 'rtl');

  check('picked element computed direction is rtl', () =>
    getComputedStyle(document.getElementById('picked')).direction === 'rtl');

  check('unpicked sibling div stays unmarked', () =>
    document.getElementById('control').getAttribute('data-hamsoo') === null);

  check('invalid stored selector does not break scanning', () =>
    document.getElementById('lightP').getAttribute('data-hamsoo') === 'rtl');

  const json = JSON.stringify(results);
  document.title = 'HAMSOO_RESULTS:' + btoa(unescape(encodeURIComponent(json)));
})();
