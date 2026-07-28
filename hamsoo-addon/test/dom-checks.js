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

  check('settings view hidden by default in popup', () =>
    Boolean(document.getElementById('viewSettings')) && document.getElementById('viewSettings').hidden === true);

  check('settings gear button present', () =>
    Boolean(document.getElementById('openSettingsBtn')));

  check('help button present', () =>
    Boolean(document.getElementById('openHelpBtn')));

  // Opening help must swap the view AND its header (the router used to be a
  // single boolean, so a third view is exactly where it would break), and the
  // digest must be readable before the user sends it.
  document.getElementById('openHelpBtn').click();

  check('help view opens with a readable settings digest', () => {
    const help = document.getElementById('viewHelp');
    const main = document.getElementById('viewMain');
    const hHelp = document.getElementById('headerHelp');
    const hMain = document.getElementById('headerMain');
    const digest = document.getElementById('helpDigest').textContent;
    return help.hidden === false && main.hidden === true &&
      hHelp.hidden === false && hMain.hidden === true &&
      digest === 'hamsoo on, font + readability + punctuation';
  });

  check('help view offers the email fallback address as text', () => {
    const addr = document.querySelector('#viewHelp .support-email-addr');
    return Boolean(addr) && addr.textContent.indexOf('@') > 0;
  });

  document.getElementById('backFromHelpBtn').click();

  check('leaving help restores the main view', () =>
    document.getElementById('viewHelp').hidden === true &&
    document.getElementById('viewMain').hidden === false);

  // #viewHelp shipped missing from the #viewMain/#viewSettings flex rule, so
  // its two cards had no gap between them and the help screen looked like a
  // different product. Every existing check passed, because they all asserted
  // help's *content* and never its *box metrics*. Compare the two views' own
  // stacking, not the cards, so the failure message points at the CSS rule.
  check('help view uses the same card spacing as the main view', () => {
    // Read main while it is visible; a hidden element computes display: none.
    const main = getComputedStyle(document.getElementById('viewMain'));
    const mainGap = main.rowGap;
    const mainDirection = main.flexDirection;
    document.getElementById('openHelpBtn').click();
    const help = getComputedStyle(document.getElementById('viewHelp'));
    const helpDisplay = help.display;
    const helpGap = help.rowGap;
    const helpDirection = help.flexDirection;
    document.getElementById('backFromHelpBtn').click();
    if (helpDisplay !== 'flex') {
      throw new Error('help view display is ' + helpDisplay + ', not flex');
    }
    if (helpGap !== mainGap) {
      throw new Error('help row-gap ' + helpGap + ' != main row-gap ' + mainGap);
    }
    if (helpDirection !== mainDirection) {
      throw new Error('help flex-direction ' + helpDirection + ' != ' + mainDirection);
    }
    return true;
  });

  // The shortcuts button used to call tabs.create on a privileged URL and
  // ignore the result, so it silently did nothing at all. It is now offered
  // only where it can matter: a runtime whose commands API cannot rebind the
  // real command. The harness stub does expose commands.update, so it stands in
  // for Firefox, and Chromium is simulated by taking that away.
  const extApi = globalThis.chrome || globalThis.browser;
  const shortcutBtn = document.getElementById('openBrowserShortcutsBtn');
  const shortcutHint = document.getElementById('shortcutManualHint');
  const hintStartedHidden = Boolean(shortcutHint) && shortcutHint.hidden === true;
  const realCreate = extApi.tabs.create;
  const realUpdate = extApi.commands.update;

  // Firefox-like: the popup recorder rebinds the command itself, so the link
  // into browser settings has nothing left to offer and must stay away.
  const linkHiddenWhenRebindable = shortcutBtn.hidden === true;

  // Chromium-like: no commands.update at all, so chrome://extensions/shortcuts
  // is the only place the real global command can change. The link is required,
  // and Chrome refuses the navigation by throwing synchronously.
  delete extApi.commands.update;
  // globalThis.browser is deliberately LEFT IN PLACE while simulating
  // Chromium: recent Chromium defines it, and a check that removes it is
  // simulating a browser that no longer exists. Removing it here is exactly
  // what hid the wrong-address bug -- the code read that global to decide it
  // was on Firefox, and on real Chrome it offered about:addons.
  renderShortcut();
  const linkShownWhenStuck = shortcutBtn.hidden === false;
  extApi.tabs.create = () => { throw new Error('Cannot create a tab with that URL.'); };
  shortcutBtn.click();
  const revealedOnThrow = Boolean(shortcutHint) && shortcutHint.hidden === false;
  const chromeUrl = document.getElementById('shortcutManualUrl').textContent;
  if (shortcutHint) shortcutHint.hidden = true;

  // Some refusals arrive as a rejected promise instead; a try/catch alone would
  // miss those entirely.
  extApi.tabs.create = () => Promise.reject(new Error('Illegal URL'));
  shortcutBtn.click();
  await new Promise(r => setTimeout(r, 60));
  const revealedOnRejection = Boolean(shortcutHint) && shortcutHint.hidden === false;
  if (shortcutHint) shortcutHint.hidden = true;

  // And when the browser does allow it, the hint must stay out of the way.
  extApi.tabs.create = realCreate;
  shortcutBtn.click();
  await new Promise(r => setTimeout(r, 60));
  const quietOnSuccess = Boolean(shortcutHint) && shortcutHint.hidden === true;

  // Back to the stub shape: the link disappears again and takes any fallback
  // address it had revealed with it, so no orphaned instructions are left.
  extApi.commands.update = realUpdate;
  if (shortcutHint) shortcutHint.hidden = false;
  renderShortcut();
  const linkHiddenAgain = shortcutBtn.hidden === true;
  const hintClearedWithLink = Boolean(shortcutHint) && shortcutHint.hidden === true;
  extApi.tabs.create = realCreate;

  // The badge printed the recorded combo unconditionally, so on Chromium it
  // could read "Alt+Shift+R" while the browser's own shortcuts page said "Not
  // set": the manifest's suggested_key is applied at install time and is
  // silently dropped when that combo is already taken.
  const realGetAll = extApi.commands.getAll;
  extApi.commands.getAll = cb => {
    const res = [{ name: 'toggle-hamsoo', shortcut: '' }];
    if (cb) cb(res);
    return Promise.resolve(res);
  };
  browserCommandChecked = false;
  settings.shortcutIsGlobal = true;
  await syncBrowserCommandState();
  const badge = document.getElementById('shortcutDisplay');
  const warnedWhenUnset = document.getElementById('shortcutGlobalWarning').hidden === false;
  const warnKeyWhenUnset = document.getElementById('shortcutGlobalWarning').getAttribute('data-i18n');
  const badgeMarkedWhenUnset = badge.classList.contains('site-only');
  const badgeKeptRecordedCombo = badge.textContent.trim() === 'Alt+Shift+R';

  extApi.commands.getAll = realGetAll;
  browserCommandChecked = false;
  settings.shortcutIsGlobal = true;
  await syncBrowserCommandState();
  const quietWhenRegistered = document.getElementById('shortcutGlobalWarning').hidden === true;
  const warnKeyWhenRegistered = document.getElementById('shortcutGlobalWarning').getAttribute('data-i18n');
  const badgeCleanWhenRegistered = badge.classList.contains('site-only') === false;

  check('unregistered browser command is disclosed, not implied to work', () => {
    if (!warnedWhenUnset) {
      throw new Error('the browser had no shortcut registered and nothing said so');
    }
    if (!badgeMarkedWhenUnset) throw new Error('badge did not mark itself site-only');
    // The old copy said the PREVIOUS browser-wide shortcut was still active,
    // which is false when the browser has none registered.
    if (warnKeyWhenUnset !== 'shortcutNoGlobal') {
      throw new Error('warning claimed a previous browser-wide shortcut: ' + warnKeyWhenUnset);
    }
    if (!badgeKeptRecordedCombo) {
      throw new Error('badge lost the recorded combo: ' + JSON.stringify(badge.textContent));
    }
    return true;
  });

  check('badge stops warning once the browser reports the same combo', () => {
    if (!quietWhenRegistered) throw new Error('warning stayed up when the browser agreed');
    if (!badgeCleanWhenRegistered) throw new Error('site-only mark stuck after agreement');
    if (warnKeyWhenRegistered !== 'shortcutGlobalWarning') {
      throw new Error('wording stayed on the not-registered variant: ' + warnKeyWhenRegistered);
    }
    return true;
  });

  check('blocked shortcuts page falls back to a copyable address', () => {
    if (!shortcutHint) throw new Error('no #shortcutManualHint in the markup');
    if (!hintStartedHidden) throw new Error('fallback hint should start hidden');
    if (!revealedOnThrow) {
      throw new Error('a synchronous refusal (Chrome) left the button doing nothing');
    }
    if (!revealedOnRejection) {
      throw new Error('a rejected promise left the button doing nothing');
    }
    if (!quietOnSuccess) {
      throw new Error('fallback hint appeared even though the tab opened fine');
    }
    if (chromeUrl !== 'chrome://extensions/shortcuts') {
      throw new Error('unexpected Chromium address: ' + JSON.stringify(chromeUrl));
    }
    return true;
  });

  // A button that cannot change anything the popup did not already change is
  // worse than no button: on Firefox it pointed at a page with no shortcut row.
  check('browser shortcut link is hidden when the popup can rebind the command', () => {
    if (!linkHiddenWhenRebindable) {
      throw new Error('browser-settings link offered even though commands.update() works');
    }
    if (!linkShownWhenStuck) {
      throw new Error('no way to reach browser settings on a runtime that cannot rebind');
    }
    if (!linkHiddenAgain) {
      throw new Error('link stayed visible after the rebind capability came back');
    }
    if (!hintClearedWithLink) {
      throw new Error('fallback address outlived the button that revealed it');
    }
    return true;
  });

  // Reported from the field: the tour re-entry card read as a tall block with a
  // stray left-aligned button. Measured against the card, never the viewport --
  // window.innerWidth includes the scrollbar.
  document.getElementById('openSettingsBtn').click();
  const welcomeCard = document.getElementById('welcomeCard');
  const replayBtn = document.getElementById('replayWelcomeBtn');
  const welcomeBody = welcomeCard ? welcomeCard.querySelector('.card-body') : null;
  const welcomeHint = welcomeCard ? welcomeCard.querySelector('.scope-hint') : null;
  const bodyAlign = welcomeBody ? getComputedStyle(welcomeBody).alignItems : null;
  const hintAlign = welcomeHint ? getComputedStyle(welcomeHint).textAlign : null;
  let btnOffsets = null;
  if (welcomeCard && replayBtn) {
    const c = welcomeCard.getBoundingClientRect();
    const b = replayBtn.getBoundingClientRect();
    btnOffsets = { left: b.left - c.left, right: c.right - b.right, width: b.width };
  }
  document.getElementById('backToMainBtn').click();

  check('welcome replay card centers its button', () => {
    if (!welcomeBody) throw new Error('no #welcomeCard .card-body in the markup');
    if (bodyAlign !== 'center') throw new Error('card body align-items: ' + bodyAlign);
    if (hintAlign !== 'center') throw new Error('caption text-align: ' + hintAlign);
    if (!btnOffsets || btnOffsets.width <= 0) throw new Error('replay button has no box');
    if (Math.abs(btnOffsets.left - btnOffsets.right) > 2) {
      throw new Error('button not centered: ' + Math.round(btnOffsets.left) + 'px left vs ' + Math.round(btnOffsets.right) + 'px right');
    }
    return true;
  });

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

  // The header version chip is static markup in popup.html that popup.js
  // overwrites from the manifest. If that wiring breaks, the popup quietly
  // advertises an old version -- the same drift that was live on the website.
  check('version chip matches the built version', () => {
    const el = document.querySelector('.version');
    if (!el) return false;
    const ascii = String(el.textContent)
      .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/\u066B/g, '.')
      .trim();
    const expected = String(chrome.runtime.getManifest().version || '')
      .split('.').slice(0, 2).join('.');
    return !!expected && ascii === expected;
  });

  const json = JSON.stringify(results);
  document.title = 'HAMSOO_RESULTS:' + btoa(unescape(encodeURIComponent(json)));
})();
