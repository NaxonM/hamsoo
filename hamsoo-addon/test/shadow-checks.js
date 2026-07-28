'use strict';
/**
 * In-browser assertions for shadow DOM support in the content script,
 * executed inside headless Chromium by test/shadow.test.js.
 *
 * The fixture page loads the real content script (with a stubbed extension
 * API). We then build a nested shadow tree on a detached host and append it
 * to the document — the realistic pattern: attachShadow() on an element that
 * is already in the DOM produces no mutation records, so discovery is driven
 * by light-DOM insertions, which is how component frameworks behave.
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

  // Let the content script initialize (async settings load + first scan).
  await new Promise(r => setTimeout(r, 200));

  // Build the shadow tree on a detached host, then insert it: the light-DOM
  // mutation is what must drive shadow-root discovery.
  const host = document.createElement('div');
  host.id = 'host';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = [
    '<p id="sp">\u0627\u06cc\u0646 \u06cc\u06a9 \u0645\u062a\u0646 \u0641\u0627\u0631\u0633\u06cc \u0627\u0633\u062a.</p>',
    '<p id="lp">Plain English only.</p>',
    '<div id="innerHost"></div>'
  ].join('');
  const innerRoot = root.getElementById('innerHost').attachShadow({ mode: 'open' });
  innerRoot.innerHTML = '<p id="np">\u0645\u062a\u0646 \u0641\u0627\u0631\u0633\u06cc \u062a\u0648 \u062f\u0631 \u062a\u0648</p>';
  document.body.appendChild(host);

  // Wait out the scan debounce + max-wait window.
  await new Promise(r => setTimeout(r, 900));

  check('light DOM paragraph marked rtl', () =>
    document.getElementById('lightP').getAttribute('data-hamsoo') === 'rtl');

  check('shadow paragraph marked rtl', () =>
    root.getElementById('sp').getAttribute('data-hamsoo') === 'rtl');

  check('nested shadow paragraph marked rtl', () =>
    innerRoot.getElementById('np').getAttribute('data-hamsoo') === 'rtl');

  check('shadow computed direction is rtl', () =>
    getComputedStyle(root.getElementById('sp')).direction === 'rtl');

  check('nested shadow computed direction is rtl', () =>
    getComputedStyle(innerRoot.getElementById('np')).direction === 'rtl');

  check('ltr-only shadow paragraph keeps ltr direction', () =>
    getComputedStyle(root.getElementById('lp')).direction === 'ltr');

  const json = JSON.stringify(results);
  document.title = 'HAMSOO_RESULTS:' + btoa(unescape(encodeURIComponent(json)));
})();
