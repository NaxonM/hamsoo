'use strict';
/**
 * In-browser popup LAYOUT assertions, executed inside headless Chromium by
 * test/layout.test.js.
 *
 * Why this file exists
 * --------------------
 * A browser-action popup has no fixed viewport. The browser lays the document
 * out in a small provisional window and then sizes the popup FROM the
 * document. Any percentage height on html / body / .shell is therefore
 * circular: the shell can never grow past that provisional measurement, and
 * because `.content` is `flex: 1 1 auto; overflow-y: auto` it is the element
 * that absorbs the collapse -- the user gets a header, a bare scrollbar
 * sliver, and a footer spilling out of the popup frame.
 *
 * That shipped once (see docs/DEBUGGING-REPORT.md, Regression R1) with every
 * static check and behavioral test green, because nothing asserted box
 * metrics. These checks run with a deliberately short window (see
 * layout.test.js: --window-size=372,150) so a re-introduced percentage height
 * fails loudly instead of silently.
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

  // Let init() finish (settings load + first render) so the cards exist.
  await new Promise(r => setTimeout(r, 400));

  const box = sel => {
    const el = document.querySelector(sel);
    if (!el) throw new Error('missing element: ' + sel);
    return el.getBoundingClientRect();
  };

  check('shell grows with content, not with the viewport', () => {
    const shell = box('.shell').height;
    if (shell <= window.innerHeight + 1) {
      throw new Error(
        'shell height ' + Math.round(shell) + 'px is pinned to the ' +
        window.innerHeight + 'px provisional viewport -- a percentage height ' +
        'on html/body/.shell is back (see docs/DEBUGGING-REPORT.md R1)'
      );
    }
    return true;
  });

  check('no percentage height on html, body or .shell', () => {
    for (const sel of ['html', 'body', '.shell']) {
      const el = document.querySelector(sel);
      const h = getComputedStyle(el).height;
      // Computed height resolving to exactly the viewport height is the
      // signature of `height: 100%` in a popup context.
      if (Math.abs(parseFloat(h) - window.innerHeight) < 1) {
        throw new Error(sel + ' resolves to the viewport height (' + h + ')');
      }
    }
    return true;
  });

  check('scroll area keeps a usable height', () => {
    const h = box('#content').height;
    if (h < 200) throw new Error('#content collapsed to ' + Math.round(h) + 'px');
    return true;
  });

  check('scroll area is actually scrollable, not clipped away', () => {
    const el = document.querySelector('#content');
    // scrollHeight must exceed clientHeight (there is more content than fits)
    // AND clientHeight must be a real height, not a sliver.
    return el.scrollHeight > el.clientHeight && el.clientHeight >= 200;
  });

  check('preview footer stays inside the shell', () => {
    const shell = box('.shell');
    const footer = box('.preview');
    const overflow = Math.round(footer.bottom - shell.bottom);
    if (overflow > 1) throw new Error('footer overflows the shell by ' + overflow + 'px');
    return true;
  });

  check('header, content and footer stack in order without gaps', () => {
    const header = box('#headerMain');
    const content = box('#content');
    const footer = box('.preview');
    return Math.abs(content.top - header.bottom) < 2 &&
      Math.abs(footer.top - content.bottom) < 2;
  });

  check('settings cards are visible, not trapped behind the fold', () => {
    const content = box('#content');
    const cards = Array.from(document.querySelectorAll('#viewMain > .card:not([hidden])'));
    if (!cards.length) throw new Error('no cards rendered');
    const firstCard = cards[0].getBoundingClientRect();
    // The first card must be fully painted inside the visible scroll area.
    return firstCard.height > 0 && firstCard.top >= content.top - 1 &&
      firstCard.bottom <= content.bottom + 1;
  });

  const json = JSON.stringify(results);
  document.title = 'HAMSOO_RESULTS:' + btoa(unescape(encodeURIComponent(json)));
})();
