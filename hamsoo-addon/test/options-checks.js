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
    document.querySelector('#headerSettings .title-row h1').textContent === 'Settings');

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

  // Tab mode. popup.html is opened as a full browser tab by both the options
  // page and the welcome tour; without the ui-tab styling a 372px panel sat in
  // the corner of a maximized window under a 600px clamp, which reads as a
  // broken page. The harness loads this page with ?ui=tab, exactly as the two
  // real callers do.
  check('tab mode centers and unclamps the popup shell', () => {
    if (!document.body.classList.contains('ui-tab')) {
      throw new Error('body is missing the ui-tab class (?ui=tab was not honored)');
    }
    const shell = document.querySelector('.shell');
    const maxHeight = getComputedStyle(shell).maxHeight;
    if (maxHeight !== 'none') {
      throw new Error('shell is still clamped to ' + maxHeight + ' in a tab');
    }
    const rect = shell.getBoundingClientRect();
    // clientWidth, not window.innerWidth: the latter includes the vertical
    // scrollbar, which made a correctly centered shell look 15px off-center.
    const viewport = document.documentElement.clientWidth;
    const left = rect.left;
    const right = viewport - rect.right;
    if (Math.abs(left - right) > 2) {
      throw new Error('shell is not centered: ' + Math.round(left) + 'px left vs '
        + Math.round(right) + 'px right');
    }
    return true;
  });

  const json = JSON.stringify(results);
  document.title = 'HAMSOO_RESULTS:' + btoa(unescape(encodeURIComponent(json)));
})();
