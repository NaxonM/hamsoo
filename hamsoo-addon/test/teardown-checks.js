'use strict';
/**
 * In-browser assertions for the disable teardown, executed inside headless
 * Chromium by test/teardown.test.js.
 *
 * Turning Hamsoo off used to drop the data-hamsoo-on attribute and return.
 * That gates everything driven by content.css, so the page LOOKS untouched --
 * but CSS gating cannot reach anything that is not CSS. Converted digits, the
 * dir attributes written onto editable fields, the element marks, the
 * stylesheet adopted into shadow roots and the loaded FontFace all survived a
 * disable and only went away on reload. Reported by a user as "the page needs
 * a reload for the injected tags to disappear completely".
 *
 * These checks also verify the reverse direction: a teardown that cannot be
 * undone would trade one bug for a worse one, so re-enabling must restore
 * everything -- including inside shadow roots, which the main-document scan
 * does not reach.
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

  const SEED = {
    enabled: true, fontEnabled: true, readabilityEnabled: true,
    digitsEnabled: true, digitsScript: 'fa', punctuationFixEnabled: true,
    fontSize: 17, lineHeight: 2, fontWeight: 500, letterSpacing: 0.4,
    textAlign: 'justify', maxWidth: 70, customSites: [], schemaVersion: 2
  };
  const withOverride = (over) => Object.assign({}, SEED, over);
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  const html = document.documentElement;
  const hamsooAttrs = () => Array.prototype.slice.call(html.attributes)
    .map(a => a.name).filter(n => n.indexOf('data-hamsoo') === 0);
  const cssVars = () => ((html.getAttribute('style') || '').match(/--hamsoo-[a-z]+/g) || []);
  const marks = () => document.querySelectorAll('[data-hamsoo], [data-hamsoo-box]').length;
  const shadow = () => document.getElementById('host').shadowRoot;
  const proseText = () => document.getElementById('prose').textContent;

  // Let the content script initialize and run its first scan.
  await wait(900);

  // Guard the guard: if the extension never applied, every teardown assertion
  // below would pass vacuously.
  check('teardown fixture: extension applied before disabling', () => {
    if (!html.hasAttribute('data-hamsoo-on')) throw new Error('data-hamsoo-on missing');
    if (marks() === 0) throw new Error('no elements were marked');
    if (/[0-9]/.test(proseText())) throw new Error('digits were not localized: ' + proseText());
    return true;
  });

  // B24: "Fix this selection" (context menu) writes inline !important
  // direction styles straight onto page elements. Nothing recorded them, so
  // they survived a disable and could only be cleared by reloading the page.
  // Reproduce exactly what the injected fixSelection() applies, including the
  // marker that tells teardown what it owns.
  const fixAdded = document.createElement('p');
  fixAdded.id = 'fixAdded';
  fixAdded.textContent = 'Hello world';
  const fixKept = document.createElement('p');
  fixKept.id = 'fixKept';
  fixKept.textContent = 'Hello world';
  fixKept.setAttribute('dir', 'ltr'); // the SITE's own attribute
  document.body.appendChild(fixAdded);
  document.body.appendChild(fixKept);
  for (const el of [fixAdded, fixKept]) {
    const priorDir = el.getAttribute('dir');
    el.setAttribute('data-hamsoo-fix', priorDir === null ? 'dir' : 'keep:' + priorDir);
    el.setAttribute('dir', 'rtl');
    el.style.setProperty('direction', 'rtl', 'important');
    el.style.setProperty('text-align', 'start', 'important');
    el.style.setProperty('unicode-bidi', 'isolate', 'important');
  }

  window.__push(withOverride({ enabled: false }));
  await wait(700);

  check('disabling undoes a context-menu selection fix', () => {
    const el = document.getElementById('fixAdded');
    if (el.hasAttribute('data-hamsoo-fix')) throw new Error('marker attribute left behind');
    if (el.hasAttribute('dir')) throw new Error('dir="rtl" left behind');
    const left = ['direction', 'text-align', 'unicode-bidi']
      .filter(p => el.style.getPropertyValue(p));
    if (left.length) throw new Error('inline styles left: ' + left.join(', '));
    return true;
  });

  check('undoing a selection fix keeps the page\u2019s own dir attribute', () => {
    // Cleanup must remove only what the fix added. Stripping a dir= the site
    // itself set would break the page in the opposite direction.
    const el = document.getElementById('fixKept');
    if (el.getAttribute('dir') !== 'ltr') {
      throw new Error('author dir="ltr" came back as ' + JSON.stringify(el.getAttribute('dir')));
    }
    if (el.hasAttribute('data-hamsoo-fix')) throw new Error('marker attribute left behind');
    return true;
  });

  const fixStyled = document.createElement('p');
  fixStyled.id = 'fixStyled';
  fixStyled.textContent = 'Hello world';
  fixStyled.style.setProperty('direction', 'ltr');
  fixStyled.style.setProperty('text-align', 'center');
  document.body.appendChild(fixStyled);
  fixStyled.setAttribute('data-hamsoo-fix', JSON.stringify({
    dir: null,
    direction: ['ltr', ''],
    textAlign: ['center', ''],
    unicodeBidi: null
  }));
  fixStyled.setAttribute('dir', 'rtl');
  fixStyled.style.setProperty('direction', 'rtl', 'important');
  fixStyled.style.setProperty('text-align', 'start', 'important');
  fixStyled.style.setProperty('unicode-bidi', 'isolate', 'important');
  window.__push(withOverride({ enabled: false }));
  await wait(700);

  check('undoing a selection fix restores original inline styles', () => {
    const el = document.getElementById('fixStyled');
    if (el.hasAttribute('data-hamsoo-fix')) throw new Error('marker attribute left behind');
    if (el.hasAttribute('dir')) throw new Error('dir left behind');
    if (el.style.getPropertyValue('direction') !== 'ltr') {
      throw new Error('author direction came back as ' + JSON.stringify(el.style.getPropertyValue('direction')));
    }
    if (el.style.getPropertyValue('text-align') !== 'center') {
      throw new Error('author text-align came back as ' + JSON.stringify(el.style.getPropertyValue('text-align')));
    }
    if (el.style.getPropertyValue('unicode-bidi')) throw new Error('unicode-bidi left behind');
    return true;
  });

  check('disabling removes every data-hamsoo attribute from <html>', () => {
    const left = hamsooAttrs();
    if (left.length) throw new Error('stranded: ' + left.join(', '));
    return true;
  });

  check('disabling removes every --hamsoo custom property from <html>', () => {
    const left = cssVars();
    if (left.length) throw new Error('stranded: ' + left.join(', '));
    return true;
  });

  check('disabling removes element direction marks', () => {
    if (marks() !== 0) throw new Error(marks() + ' elements still marked');
    return true;
  });

  check('disabling restores localized digits to ascii', () => {
    if (!/[0-9]/.test(proseText())) throw new Error('still localized: ' + proseText());
    return true;
  });

  check('disabling restores a site-authored dir attribute', () => {
    const el = document.getElementById('siteDir');
    const dir = el.getAttribute('dir');
    if (dir !== 'rtl') throw new Error('author dir="rtl" came back as ' + JSON.stringify(dir));
    if (el.hasAttribute('data-hamsoo-dir')) throw new Error('tracking attribute left behind');
    return true;
  });

  check('disabling detaches injected styling from shadow roots', () => {
    const root = shadow();
    const styles = root.querySelectorAll('style[data-hamsoo-style]').length;
    const adopted = root.adoptedStyleSheets.length;
    if (styles || adopted) throw new Error('styles=' + styles + ' adopted=' + adopted);
    if (root.querySelectorAll('[data-hamsoo]').length) throw new Error('shadow marks remain');
    return true;
  });

  window.__push(withOverride({}));
  await wait(900);

  check('re-enabling restores marks and digits', () => {
    if (!html.hasAttribute('data-hamsoo-on')) throw new Error('data-hamsoo-on missing');
    if (marks() === 0) throw new Error('marks did not come back');
    if (/[0-9]/.test(proseText())) throw new Error('digits not re-localized: ' + proseText());
    return true;
  });

  check('re-enabling restores styling and marks inside shadow roots', () => {
    const root = shadow();
    const styled = root.querySelectorAll('style[data-hamsoo-style]').length + root.adoptedStyleSheets.length;
    if (!styled) throw new Error('shadow styling not re-attached');
    if (!root.querySelectorAll('[data-hamsoo]').length) throw new Error('shadow content not re-classified');
    return true;
  });

  document.title = 'HAMSOO_RESULTS:' + btoa(unescape(encodeURIComponent(JSON.stringify(results))));
})();
