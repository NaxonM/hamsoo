'use strict';
/**
 * Base-direction regression tests for mixed Persian/Latin content, run in real
 * headless Chromium (zero npm dependencies).
 *
 * Why this file exists
 * --------------------
 * Issue 5 replaced a naive "contains an RTL character" test with an RTL letter
 * ratio, so a lone Persian word could no longer flip an English paragraph.
 * That over-corrected: real Persian content embeds long Latin runs (language
 * learning, code identifiers, product names), so lines like
 * "مذکر: ohne + meinen / einen / den" score only 18% RTL and were classified
 * LTR. Inside a Persian list that stranded individual bullets on the left
 * margin while their neighbors stayed right, and blocked container promotion
 * entirely -- a visibly ragged list. See docs/DEBUGGING-REPORT.md (R3).
 *
 * The fixture below reproduces that exact content, and the checks assert both
 * directions of the trade-off: Persian-led lines must resolve RTL, and the
 * original Issue 5 counter-case must stay fixed.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, assert } = require('./harness');
const { findChrome, createHarnessDir } = require('../scripts/uiharness');

const EXPECTED_CHECKS = [
  'persian-labeled latin formula is rtl despite low rtl ratio',
  'every formula item in the list resolves rtl',
  'list items share one direction, no ragged mix',
  'list container promoted so bullets sit on the right',
  'bullet gutter sits on the right, not the left',
  'persian paragraph with embedded latin term stays rtl',
  'line opening in latin but mostly persian is rescued by ratio',
  'lone persian word in english paragraph does not flip it',
  'genuinely bilingual list is not promoted',
  'mixed latin-leading line is never bidi-overridden',
  'persian run inside a latin-leading line still reads right-to-left',
  'latin-only item in a promoted list is explicitly marked ltr',
  'latin-only item in a promoted list renders ltr, not inherited rtl',
  'code block with a persian literal is not bidi-overridden',
  'latin-led line closing in persian follows its rtl container',
  'latin-led line closing in latin keeps an ltr base in an rtl container',
  'streamed latin line is reclassified when its message turns rtl',
  'streamed latin line keeps its trailing colon at the end of the line',
  'qwen paragraph div is processed, not skipped',
  'qwen paragraph div renders right-to-left',
  'qwen heading and paragraph agree, no half-styled answer',
  'bilingual line on an ltr site is classified, not skipped',
  'bilingual line keeps its ltr base so the english opening stays left',
  'bilingual line is never bidi-overridden',
  'persian typography reaches a bilingual line',
  'a lone persian word still leaves an english paragraph unstyled'
];

const chromeBin = findChrome();

if (!chromeBin) {
  console.log('  ! direction tests skipped: no Chromium/Chrome binary found (set HAMSOO_CHROME to enable).');
} else {
  let promise = null;
  function browserResults() {
    if (!promise) {
      promise = Promise.resolve().then(() => {
        const dir = createHarnessDir({ seedSettings: { lang: 'fa' } });
        fs.copyFileSync(
          path.join(__dirname, 'direction-checks.js'),
          path.join(dir, 'direction-checks.js')
        );
        fs.writeFileSync(path.join(dir, 'direction-fixture.html'), [
          '<!doctype html>',
          '<html><head><meta charset="utf-8"><title>fixture</title>',
          '<link rel="stylesheet" href="content.css">',
          '<style>body{width:900px;margin:0;font:16px sans-serif}</style>',
          '</head><body>',
          // Verbatim from the reported Gemini answer.
          '<p id="prose">\u062d\u0631\u0641 \u0627\u0636\u0627\u0641\u0647 ohne (\u0628\u062f\u0648\u0646) \u0647\u0645\u06cc\u0634\u0647 \u0648 \u0628\u062f\u0648\u0646 \u0627\u0633\u062a\u062b\u0646\u0627 \u0645\u0641\u0639\u0648\u0644 \u062e\u0648\u062f \u0631\u0627 \u0628\u0647 \u062d\u0627\u0644\u062a \u0622\u06a9\u0648\u0632\u0627\u062a\u06cc\u0648 \u0645\u06cc\u200c\u0628\u0631\u062f.</p>',
          '<ul id="formulaList">',
          '<li id="f1">\u0645\u0630\u06a9\u0631: ohne + meinen / einen / den</li>',
          '<li id="f2">\u062e\u0646\u062b\u06cc: ohne + mein / ein / das</li>',
          '<li id="f3">\u0645\u0624\u0646\u062b: ohne + meine / eine / die</li>',
          '<li id="f4">\u0645\u0630\u06a9\u0631 \u0648 \u062e\u0646\u062b\u06cc: mit + meinem / einem / dem</li>',
          '<li id="f5">\u0645\u0624\u0646\u062b: mit + meiner / einer / der</li>',
          '<li id="f6">\u062c\u0645\u0639: mit + meinen / den + Nomen + n</li>',
          '</ul>',
          // Opens in Latin, but overwhelmingly Persian: the ratio rescue path.
          '<p id="mixedOpen">ohne meinen Laptop (\u0628\u062f\u0648\u0646 \u0644\u067e\u200c\u062a\u0627\u067e\u0645 - \u0622\u06a9\u0648\u0632\u0627\u062a\u06cc\u0648 \u0645\u0630\u06a9\u0631)</p>',
          // Issue 5 counter-case: must NOT flip.
          '<p id="english">The German preposition is called \u062d\u0631\u0641 in Persian, and it always takes the accusative case in every sentence we have seen.</p>',
          // Genuinely bilingual list: must NOT be promoted.
          '<ul id="bilingualList">',
          '<li>This entire row is written in English only.</li>',
          '<li>Another fully English row without any Persian at all.</li>',
          '<li>\u0627\u06cc\u0646 \u0633\u0637\u0631 \u06a9\u0627\u0645\u0644\u0627\u064b \u0641\u0627\u0631\u0633\u06cc \u0627\u0633\u062a</li>',
          '</ul>',
          // R4 fixture: a Persian-majority list that also holds a pure-German
          // sentence and a German sentence ending in a Persian gloss. Mirrors
          // the reported Gemini structure, where each German example sentence
          // is followed by Persian "\u0633\u0627\u062e\u062a\u0627\u0631" / "\u062a\u0631\u062c\u0645\u0647" glosses, so Persian items
          // outnumber Latin ones. (A 50/50 list is a tie and is deliberately
          // left unpromoted -- see the bilingual list above.)
          '<ul id="sentenceList">',
          '<li id="sLatin">Ich habe einen Traum. Ich m\u00f6chte gl\u00fccklich sein.</li>',
          '<li id="sMixed">Ich fahre nie ohne meinen Koffer \u062f\u0631 \u062a\u0639\u0637\u06cc\u0644\u0627\u062a.</li>',
          '<li id="sFa1">\u062a\u0631\u062c\u0645\u0647: \u0645\u0646 \u06cc\u06a9 \u0631\u0648\u06cc\u0627 \u062f\u0627\u0631\u0645.</li>',
          '<li id="sFa2">\u062a\u0631\u062c\u0645\u0647: \u0645\u0646 \u0647\u0631\u06af\u0632 \u0628\u062f\u0648\u0646 \u0686\u0645\u062f\u0627\u0646\u0645 \u0633\u0641\u0631 \u0646\u0645\u06cc\u200c\u0631\u0648\u0645.</li>',
          '<li id="sFa3">\u0633\u0627\u062e\u062a\u0627\u0631: \u0645\u0646\u0641\u06cc \u06a9\u0631\u062f\u0646 \u062c\u0645\u0644\u0647 \u0628\u0627 \u0642\u06cc\u062f nie (\u0647\u0631\u06af\u0632).</li>',
          '</ul>',
          // Reported case: a Persian answer whose opening line quotes a
          // German term before its gloss, so the line opens in Latin while
          // every sibling around it is Persian.
          '<div id="glossBox" class="markdown prose">',
          '<p id="glossLead"><strong>stecken bleiben</strong> \u06cc\u0639\u0646\u06cc:</p>',
          '<p id="glossFa1"><strong>\u00ab\u06af\u06cc\u0631 \u06a9\u0631\u062f\u0646 / \u0645\u062a\u0648\u0642\u0641 \u0634\u062f\u0646\u00bb</strong></p>',
          '<p id="glossFa2">\u06a9\u0627\u0631\u0628\u0631\u062f\u0647\u0627: \u062f\u0631 \u062c\u0645\u0644\u0647\u200c\u0647\u0627\u06cc \u0631\u0648\u0632\u0645\u0631\u0647 \u0628\u0633\u06cc\u0627\u0631 \u062a\u06a9\u0631\u0627\u0631 \u0645\u06cc\u200c\u0634\u0648\u062f.</p>',
          // Counter-case in the SAME container: opens in Latin and closes in
          // Latin, so it must keep an LTR base.
          '<p id="glossEnglish">The verb is separable in German, so \u06af\u06cc\u0631 appears in the gloss and the prefix moves to the end of the clause.</p>',
          '</div>',
          // Reported Qwen answer. Qwen renders body paragraphs as a bare
          // <div class="qwen-markdown-paragraph"> while its headings are real
          // <h3>. The heading therefore matched the semantic selector list and
          // was styled, and the paragraph matched nothing and was skipped, so a
          // Qwen answer rendered half-processed. The site authors dir="rtl"
          // itself, which is why this is invisible unless you check data-hamsoo.
          '<div id="qwenBox">',
          '<div id="qwenPara" class="qwen-markdown-paragraph" dir="rtl"><span class="qwen-markdown-text">\u0632\u06cc\u0631\u0633\u06cc\u0633\u062a\u0645 \u0648\u06cc\u0646\u062f\u0648\u0632 \u0628\u0631\u0627\u06cc \u0644\u06cc\u0646\u0648\u06a9\u0633 (WSL) \u06f2 \u0647\u0645\u0686\u0646\u0627\u0646 \u0628\u0647 \u06af\u0633\u062a\u0631\u0634 \u067e\u0634\u062a\u06cc\u0628\u0627\u0646\u06cc \u062e\u0648\u062f \u0627\u0632 \u062a\u0648\u0632\u06cc\u0639\u200c\u0647\u0627\u06cc \u0627\u0635\u0644\u06cc \u0644\u06cc\u0646\u0648\u06a9\u0633 \u0627\u062f\u0627\u0645\u0647 \u0645\u06cc\u200c\u062f\u0647\u062f.</span></div>',
          '<h3 id="qwenHeading" class="qwen-markdown-heading" dir="rtl"><span class="qwen-markdown-text">\u062a\u0648\u0636\u06cc\u062d\u0627\u062a:</span></h3>',
          '</div>',
          // Reported Perplexity case: an English sentence carrying a real
          // Persian clause, then an English quote after a <br>. About 26% RTL
          // letters -- under RTL_RATIO_THRESHOLD -- with Latin first-strong AND
          // Latin last-strong, on a site whose own UI is LTR. So isRTLBlock(),
          // closesInRTL() and inRTLContext() all declined it and the element
          // reached unmark(): no isolation, no font, no readability. The Tailwind
          // class list is kept verbatim to show it is not the cause.
          '<p id="pplxMixed" class="my-2 [&+p]:mt-4 [&_strong:has(+br)]:inline-block">'
            + 'And in that silence, \u06cc\u0647 \u0635\u062f\u0627\u06cc \u0622\u0631\u0648\u0645 \u062a\u0648\u06cc \u062f\u0644\u0645 \u06af\u0641\u062a:'
            + '<br>\u201cKeep going\u2026 even when you don\u2019t understand why.\u201d</p>',
          '<pre id="codeFa"><code>const msg = "\u0633\u0644\u0627\u0645 \u062f\u0646\u06cc\u0627";</code></pre>',
          '<script src="stub.js"></script>',
          '<script src="shared/settings-util.js"></script>',
          '<script src="content.js"></script>',
          '<script src="direction-checks.js"></script>',
          '</body></html>'
        ].join('\n'));
        const url = 'file://' + path.join(dir, 'direction-fixture.html');
        const out = execFileSync(chromeBin, [
          '--headless', '--no-sandbox', '--disable-gpu',
          '--window-size=900,800',
          '--virtual-time-budget=8000', '--dump-dom', url
        ], { encoding: 'utf8', timeout: 90000, maxBuffer: 32 * 1024 * 1024 });
        const m = /HAMSOO_RESULTS:([A-Za-z0-9+/=]+)/.exec(out);
        if (!m) throw new Error('no HAMSOO_RESULTS marker in dumped DOM');
        return JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
      });
    }
    return promise;
  }

  for (const name of EXPECTED_CHECKS) {
    test('direction: ' + name, async () => {
      const results = await browserResults();
      const item = results.find(r => r.name === name);
      assert.ok(item, 'browser check did not run: ' + name);
      assert.ok(item.ok, item.msg || 'failed in browser');
    });
  }
}
