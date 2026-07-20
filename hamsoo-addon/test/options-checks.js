'use strict';
/**
 * In-browser assertions for the dedicated options page (options.html),
 * executed inside headless Chromium by test/options.test.js via the
 * scripts/uiharness.js copy.
 *
 * Seeded state (see options.test.js): lang 'en', duplicate customSites
 * entries, and one picked selector for gemini.google.com.
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

  // Let init() finish (settings load + first render).
  await new Promise(r => setTimeout(r, 300));

  check('EN settings title in header', () =>
    document.querySelector('.title-row h1').textContent === 'Settings');

  check('custom sites listed and deduped', () => {
    const rows = document.querySelectorAll('#customSiteList .custom-site-row');
    return document.getElementById('customSites').hidden === false && rows.length === 2;
  });

  check('custom site hosts stripped of scheme/wildcard', () => {
    const hosts = Array.from(
      document.querySelectorAll('#customSiteList .host'),
      el => el.textContent
    );
    return hosts.indexOf('a.example') !== -1 && hosts.indexOf('b.example') !== -1;
  });

  check('picked element row rendered', () => {
    const rows = Array.from(
      document.querySelectorAll('#pickedList .custom-site-row .host'),
      el => el.textContent
    );
    return rows.length === 1 &&
      rows[0].indexOf('gemini.google.com') !== -1 &&
      rows[0].indexOf('div.follow-up-text') !== -1;
  });

  // Interaction: remove the picked element, then wait out the debounced save.
  const removeBtn = document.querySelector('#pickedList .custom-site-row button');
  if (removeBtn) removeBtn.click();
  await new Promise(r => setTimeout(r, 1200));

  check('removing a picked element persists and shows the empty hint', () => {
    const saved = globalThis.__HAMSOO_LAST_SET__ && globalThis.__HAMSOO_LAST_SET__.settings;
    return !!saved &&
      Object.keys(saved.customSelectors || {}).length === 0 &&
      document.getElementById('pickedElements').hidden === true &&
      document.getElementById('pickedEmpty').hidden === false;
  });

  // Interaction: the appearance card lives here now and must stay functional.
  document.querySelector('#modeSeg button[data-mode="dark"]').click();
  check('dark mode button applies the dark theme', () =>
    document.documentElement.classList.contains('dark'));

  check('backup controls present', () =>
    Boolean(
      document.getElementById('exportBtn') &&
      document.getElementById('importBtn') &&
      document.getElementById('importFile')
    ));

  const json = JSON.stringify(results);
  document.title = 'HAMSOO_RESULTS:' + btoa(unescape(encodeURIComponent(json)));
})();
