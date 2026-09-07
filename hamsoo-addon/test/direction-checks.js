'use strict';
/**
 * In-browser assertions for base-direction classification of mixed
 * Persian/Latin content, executed inside headless Chromium by
 * test/direction.test.js.
 *
 * Fixture content is taken verbatim from a real Gemini German-grammar answer
 * (the case that broke in Regression R3): short Persian labels followed by
 * long German formulas. By raw letter count these lines are only 14-22% RTL,
 * so a ratio-only classifier calls them LTR and strands their bullets on the
 * left margin while neighboring items stay right -- a visibly ragged list.
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

  const dirOf = id => getComputedStyle(document.getElementById(id)).direction;
  const markOf = id => document.getElementById(id).getAttribute('data-hamsoo');

  check('persian-labeled latin formula is rtl despite low rtl ratio', () => {
    // "مذکر: ohne + meinen / einen / den" -- 18% RTL letters.
    if (markOf('f1') !== 'rtl') throw new Error('data-hamsoo=' + markOf('f1'));
    return dirOf('f1') === 'rtl';
  });

  check('every formula item in the list resolves rtl', () => {
    const ids = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'];
    const bad = ids.filter(id => markOf(id) !== 'rtl');
    if (bad.length) throw new Error('not rtl: ' + bad.join(', '));
    return true;
  });

  check('list items share one direction, no ragged mix', () => {
    const dirs = new Set(
      Array.from(document.querySelectorAll('#formulaList > li'),
        li => getComputedStyle(li).direction)
    );
    if (dirs.size !== 1) throw new Error('mixed item directions: ' + Array.from(dirs).join(', '));
    return dirs.has('rtl');
  });

  check('list container promoted so bullets sit on the right', () => {
    const list = document.getElementById('formulaList');
    if (list.getAttribute('data-hamsoo-box') !== 'rtl') {
      throw new Error('container not promoted (data-hamsoo-box=' +
        list.getAttribute('data-hamsoo-box') + ')');
    }
    return getComputedStyle(list).direction === 'rtl';
  });

  check('bullet gutter sits on the right, not the left', () => {
    // The marker gutter is the list's padding-inline-start. In an RTL list it
    // is on the RIGHT, so each <li> box is inset from the list's right edge
    // and flush with its left edge. Under the ratio-only regression the list
    // stayed LTR and this was mirrored -- which is precisely what put the
    // bullets on the wrong margin in the reported screenshot.
    const list = document.getElementById('formulaList').getBoundingClientRect();
    const items = Array.from(document.querySelectorAll('#formulaList > li'));
    if (!items.length) throw new Error('no list items');
    for (const li of items) {
      const box = li.getBoundingClientRect();
      const rightGutter = list.right - box.right;
      const leftGutter = box.left - list.left;
      if (rightGutter <= leftGutter) {
        throw new Error(
          'gutter is on the left (right=' + Math.round(rightGutter) +
          'px, left=' + Math.round(leftGutter) + 'px): list is rendering LTR'
        );
      }
    }
    return true;
  });

  check('persian paragraph with embedded latin term stays rtl', () =>
    markOf('prose') === 'rtl');

  check('line opening in latin but mostly persian is rescued by ratio', () =>
    markOf('mixedOpen') === 'rtl');

  // Counter-case: the regression that RTL_RATIO_THRESHOLD was introduced for
  // (Issue 5) must stay fixed. One Persian word in an English paragraph must
  // not flip the paragraph.
  check('lone persian word in english paragraph does not flip it', () => {
    if (markOf('english') === 'rtl') throw new Error('english paragraph flipped to rtl');
    return true;
  });

  check('genuinely bilingual list is not promoted', () =>
    document.getElementById('bilingualList').getAttribute('data-hamsoo-box') !== 'rtl');

  // --- R4: bidi override must never touch text containing RTL characters ---
  // `unicode-bidi: isolate-override` forces every character into LTR order.
  // On mixed text that renders the Persian run BACKWARDS -- "\u062f\u0631 \u062a\u0639\u0637\u06cc\u0644\u0627\u062a"
  // shown as "\u0631\u062f \u062a\u0627\u0644\u06cc\u0637\u0639\u062a" -- i.e. visually corrupted, unreadable text.

  check('mixed latin-leading line is never bidi-overridden', () => {
    const el = document.getElementById('sMixed');
    const bidi = getComputedStyle(el).unicodeBidi;
    if (/override/.test(bidi)) {
      throw new Error(
        'unicode-bidi=' + bidi + ' on text containing Persian: the Persian run ' +
        'will render reversed (data-hamsoo=' + el.getAttribute('data-hamsoo') + ')'
      );
    }
    return true;
  });

  check('persian run inside a latin-leading line still reads right-to-left', () => {
    // Range geometry reveals the actual visual order the bidi algorithm chose.
    // In correct rendering the first Persian word sits to the RIGHT of the
    // last one; under an override the order is mirrored.
    const node = Array.prototype.find.call(document.getElementById('sMixed').childNodes, n => n.nodeType === 3 && n.nodeValue && n.nodeValue.indexOf('\u062f\u0631') >= 0);
    const text = node ? node.nodeValue : null;
    const start = text.indexOf('\u062f\u0631');
    const second = text.indexOf('\u062a\u0639\u0637\u06cc\u0644\u0627\u062a');
    if (start < 0 || second < 0) throw new Error('fixture text changed');
    const rectOf = (from, len) => {
      const r = document.createRange();
      r.setStart(node, from);
      r.setEnd(node, from + len);
      return r.getBoundingClientRect();
    };
    const first = rectOf(start, 2);
    const last = rectOf(second, 8);
    if (first.left <= last.left) {
      throw new Error('persian words render left-to-right (reversed text)');
    }
    return true;
  });

  check('latin-only item in a promoted list is explicitly marked ltr', () => {
    // Must not be left unmarked: an unmarked item silently inherits the
    // promoted container's RTL base and its trailing period jumps to the
    // wrong end of the line.
    const mark = markOf('sLatin');
    if (mark !== 'ltr') throw new Error('data-hamsoo=' + mark);
    return true;
  });

  check('latin-only item in a promoted list renders ltr, not inherited rtl', () => {
    if (document.getElementById('sentenceList').getAttribute('data-hamsoo-box') !== 'rtl') {
      throw new Error('fixture precondition failed: list was not promoted');
    }
    return dirOf('sLatin') === 'ltr';
  });

  check('code block with a persian literal is not bidi-overridden', () => {
    const bidi = getComputedStyle(document.getElementById('codeFa')).unicodeBidi;
    if (/override/.test(bidi)) throw new Error('unicode-bidi=' + bidi);
    return true;
  });

  // --- Streaming regression (R5) -------------------------------------------
  // A chat answer arrives token by token, so an opening English line gets
  // classified while the message still holds nothing but Latin text. It is
  // correctly left unmarked. When the Persian body streams in underneath it,
  // the message container flips to RTL and that unmarked line silently
  // inherits the flip: it right-aligns and its trailing ':' jumps to the left
  // end. The signature cache then pins the stale decision for the life of the
  // page, so the line never recovers.
  //
  // Injecting the same markup all at once does NOT reproduce this -- the
  // arrival order is the bug -- which is why the static fixture above missed
  // it. Build this one by streaming.
  const EN_LINE = "Let's look at a critical issue with bidirectional text in extensions:";
  const stream = document.createElement('div');
  stream.className = 'markdown';
  stream.setAttribute('data-message-author-role', 'assistant');
  stream.innerHTML = '<p id="streamEn">' + EN_LINE + '</p>';
  document.body.appendChild(stream);
  await new Promise(r => setTimeout(r, 700));

  const streamedBody = [
    '\u062a\u0631\u062c\u0645\u0647: \u0645\u0646 \u06cc\u06a9 \u0631\u0648\u06cc\u0627 \u062f\u0627\u0631\u0645.',
    '\u062a\u0631\u062c\u0645\u0647: \u0645\u0646 \u0647\u0631\u06af\u0632 \u0628\u062f\u0648\u0646 \u0686\u0645\u062f\u0627\u0646\u0645 \u0633\u0641\u0631 \u0646\u0645\u06cc\u200c\u0631\u0648\u0645.',
    '\u0633\u0627\u062e\u062a\u0627\u0631: \u0645\u0646\u0641\u06cc \u06a9\u0631\u062f\u0646 \u062c\u0645\u0644\u0647 \u0628\u0627 \u0642\u06cc\u062f nie (\u0647\u0631\u06af\u0632).'
  ];
  for (const line of streamedBody) {
    const p = document.createElement('p');
    p.textContent = line;
    stream.appendChild(p);
  }
  await new Promise(r => setTimeout(r, 700));

  check('streamed latin line is reclassified when its message turns rtl', () => {
    if (stream.getAttribute('data-hamsoo') !== 'rtl') {
      throw new Error('fixture precondition failed: message did not turn rtl');
    }
    const mark = markOf('streamEn');
    if (mark !== 'ltr') throw new Error('data-hamsoo=' + mark);
    return dirOf('streamEn') === 'ltr';
  });

  check('streamed latin line keeps its trailing colon at the end of the line', () => {
    // The mark alone is not enough: assert the glyph actually lands on the
    // right. Geometry is the only assertion that catches an inherited base.
    const node = document.getElementById('streamEn').firstChild;
    const colon = node.textContent.indexOf(':');
    if (colon < 0) throw new Error('fixture text changed');
    const rectAt = (from, len) => {
      const r = document.createRange();
      r.setStart(node, from);
      r.setEnd(node, from + len);
      return r.getBoundingClientRect();
    };
    const firstWord = rectAt(0, 4);
    const trailing = rectAt(colon, 1);
    if (trailing.left <= firstWord.left) {
      throw new Error('trailing colon rendered at the left end (colon left=' +
        Math.round(trailing.left) + ', first word left=' + Math.round(firstWord.left) + ')');
    }
    return true;
  });

  check('latin-led line closing in persian follows its rtl container', () => {
    const box = document.getElementById('glossBox');
    if (box.getAttribute('data-hamsoo') !== 'rtl') {
      throw new Error('fixture precondition failed: container is ' + box.getAttribute('data-hamsoo'));
    }
    const mark = markOf('glossLead');
    if (mark !== 'rtl') throw new Error('data-hamsoo=' + mark);
    if (dirOf('glossLead') !== 'rtl') {
      throw new Error('computed direction is ' + dirOf('glossLead'));
    }
    // Geometry, not just the mark: an inherited or overridden base still shows
    // up as the leading term sitting on the wrong half of the container.
    const term = document.querySelector('#glossLead strong').getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const mid = boxRect.left + boxRect.width / 2;
    if (term.left <= mid) {
      throw new Error('leading term rendered on the left half (left=' +
        Math.round(term.left) + ', mid=' + Math.round(mid) + ')');
    }
    return true;
  });

  check('latin-led line closing in latin keeps an ltr base in an rtl container', () => {
    const mark = markOf('glossEnglish');
    if (mark !== 'ltr-mixed') throw new Error('data-hamsoo=' + mark);
    return dirOf('glossEnglish') === 'ltr';
  });

  // Qwen coverage. The paragraph is the regression: it is a bare <div> whose
  // only handle is its class, so it is skipped entirely if the class selector
  // is missing from SELECTOR. Asserting the mark (not just the rendered
  // direction) is what makes this a real guard -- the site sets dir="rtl"
  // itself, so the text looks correct on screen even when Hamsoo never touched
  // it, and none of Hamsoo's typography, digits or font work is applied.
  check('qwen paragraph div is processed, not skipped', () => {
    const mark = markOf('qwenPara');
    if (mark !== 'rtl') {
      throw new Error('data-hamsoo=' + mark + ' (element was never classified)');
    }
    return true;
  });

  check('qwen paragraph div renders right-to-left', () =>
    dirOf('qwenPara') === 'rtl');

  check('qwen heading and paragraph agree, no half-styled answer', () => {
    const h = markOf('qwenHeading');
    const p = markOf('qwenPara');
    if (h !== p) {
      throw new Error('heading=' + h + ' but paragraph=' + p);
    }
    return true;
  });

  // --- Reported Perplexity case: a bilingual line on an LTR site -----------
  // The classifier is right to keep this line LTR-based (it opens and closes in
  // English), but before the fix it fell through to unmark() and got NOTHING:
  // no bidi isolation and none of Hamsoo's typography, so the Persian clause
  // rendered in the site's Latin fallback font. Perplexity's UI is LTR, so the
  // inRTLContext() rescue that reaches 'ltr-mixed' elsewhere never fires.
  const fontOf = id => getComputedStyle(document.getElementById(id)).fontFamily;

  check('bilingual line on an ltr site is classified, not skipped', () => {
    const mark = markOf('pplxMixed');
    if (mark !== 'ltr-mixed') {
      throw new Error('data-hamsoo=' + mark + ' (expected ltr-mixed)');
    }
    return true;
  });

  check('bilingual line keeps its ltr base so the english opening stays left', () =>
    dirOf('pplxMixed') === 'ltr');

  // Guards CONTRIBUTING rule 8: this block contains Persian, so the strict
  // 'ltr' override would render the Persian clause backwards.
  check('bilingual line is never bidi-overridden', () => {
    const bidi = getComputedStyle(document.getElementById('pplxMixed')).unicodeBidi;
    if (/override/.test(bidi)) throw new Error('unicode-bidi=' + bidi);
    return true;
  });

  check('persian typography reaches a bilingual line', () => {
    // Precondition first: if typography were inactive in this fixture the
    // comparison below would pass vacuously on inherited fonts.
    if (fontOf('glossFa2') === fontOf('english')) {
      throw new Error('typography inactive in fixture; comparison would be vacuous');
    }
    if (fontOf('pplxMixed') !== fontOf('glossFa2')) {
      throw new Error('font=' + fontOf('pplxMixed') + ' but rtl blocks use ' + fontOf('glossFa2'));
    }
    return true;
  });

  // The other half of the trade-off. A single Persian word quoted in a long
  // English paragraph (Issue 5's counter-case) must stay untouched -- restyling
  // a whole English paragraph over one word is exactly what MIXED_MIN_RATIO
  // exists to prevent.
  check('a lone persian word still leaves an english paragraph unstyled', () => {
    const mark = markOf('english');
    if (mark !== null) throw new Error('data-hamsoo=' + mark);
    if (fontOf('english') === fontOf('glossFa2')) {
      throw new Error('english paragraph picked up the persian font');
    }
    return true;
  });

  const json = JSON.stringify(results);
  document.title = 'HAMSOO_RESULTS:' + btoa(unescape(encodeURIComponent(json)));
})();
