'use strict';
/**
 * In-browser assertions for the popup, executed inside headless Chromium by
 * test/dom.test.js (via the scripts/uiharness.js preview copy).
 *
 * Seeded state (see dom.test.js): lang 'en', duplicate customSites entries,
 * and a value-less site override that normalize() must prune.
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

  check('EN wordmark in header', () =>
    document.querySelector('.title-row h1').textContent === 'Hamsoo');

  check('LTR direction applied for EN', () =>
    document.documentElement.getAttribute('dir') === 'ltr');

  check('12 site chips rendered alphabetically', () => {
    const labels = Array.from(
      document.querySelectorAll('#siteGrid .site-chip span:last-child'),
      el => el.textContent
    );
    const sorted = labels.slice().sort((a, b) => a.localeCompare(b));
    return labels.length === 12 && labels.join('|') === sorted.join('|');
  });

  // The list-management and set-once cards moved to the dedicated options
  // page (options.html); the popup must stay slim and expose a gear button.
  check('moved cards absent from popup', () =>
    !document.getElementById('modeSeg') &&
    !document.getElementById('langSeg') &&
    !document.getElementById('exportBtn') &&
    !document.getElementById('shortcutDisplay') &&
    !document.getElementById('customSiteList') &&
    !document.getElementById('pickedList'));

  check('settings gear button present', () =>
    Boolean(document.getElementById('openSettingsBtn')));

  // Interaction: toggling a chip re-renders and persists normalized settings.
  const firstChip = document.querySelector('#siteGrid .site-chip');
  const pressedBefore = firstChip.getAttribute('aria-pressed');
  firstChip.click();

  check('site chip toggles aria-pressed', () =>
    document.querySelector('#siteGrid .site-chip').getAttribute('aria-pressed') !== pressedBefore);

  // Wait out the debounced save so storage.set has been called.
  await new Promise(r => setTimeout(r, 1200));

  check('persisted settings: customSites deduped', () => {
    const saved = globalThis.__HAMSOO_LAST_SET__ && globalThis.__HAMSOO_LAST_SET__.settings;
    return !!saved && Array.isArray(saved.customSites) && saved.customSites.length === 2;
  });

  check('persisted settings: value-less site override pruned', () => {
    const saved = globalThis.__HAMSOO_LAST_SET__ && globalThis.__HAMSOO_LAST_SET__.settings;
    return !!saved && !!saved.siteOverrides && Object.keys(saved.siteOverrides).length === 0;
  });

  // Slider: double-click resets to default.
  const slider = document.getElementById('fontSize');
  slider.value = '20';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  slider.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

  check('font-size slider dblclick resets to 15', () =>
    slider.value === '15' && document.getElementById('fontSizeVal').textContent === '15');

  const json = JSON.stringify(results);
  document.title = 'HAMSOO_RESULTS:' + btoa(unescape(encodeURIComponent(json)));
})();
