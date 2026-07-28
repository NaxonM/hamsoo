'use strict';
/**
 * Kimi (kimi.com / kimi.moonshot.cn) regression tests, run in real headless
 * Chromium (zero npm dependencies).
 *
 * Two separate reported defects, both visible in one Kimi answer
 * --------------------------------------------------------------
 * 1. UNSTYLED ELEMENTS. Kimi renders every markdown paragraph as a bare
 *    <div class="paragraph">, so those paragraphs matched no entry in SELECTOR
 *    and were never classified -- the same shape of gap as the Qwen one. The
 *    wrapper .markdown IS collected, which is exactly why this hid: a fully
 *    Persian answer resolves RTL as a whole wrapper and looks correct, while a
 *    bilingual answer needs per-paragraph direction and came out untouched.
 *
 * 2. READABILITY MODIFIERS DID NOTHING. Kimi styles its Vue components --
 *    .markdown .paragraph, and the <em>/<strong> inside them -- directly, so
 *    font-size/line-height/font-family set on a marked ancestor never reached
 *    the text. This is the same inheritance blockade NotebookLM has, and the
 *    site-scoped deep rules that solve it were scoped to notebooklm alone.
 *
 * The fixture reproduces the reported markup (including Kimi's own scoped CSS,
 * which is what blocks inheritance) and asserts both fixes, plus that the deep
 * rules stay scoped to listed hosts and that Latin-only paragraphs are left
 * alone. Site-scoped CSS had no test coverage at all before this file.
 *
 * Results are serialized as base64 JSON into document.title and read back with
 * --dump-dom.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, assert } = require('./harness');
const { findChrome, createHarnessDir } = require('../scripts/uiharness');

const EXPECTED_CHECKS = [
  'kimi paragraph div is processed, not skipped',
  'every kimi paragraph in a persian answer is classified',
  'kimi bilingual paragraph is classified, not skipped',
  'kimi bilingual paragraph keeps an ltr base',
  'latin-only kimi paragraph is left untouched',
  'kimi translation list still promotes its bullets to the right',
  'readability reaches text that kimi styles directly',
  'the persian font reaches text that kimi styles directly',
  'deep styling is scoped: it stops when the host is not listed',
  'block-level readability survives without the site scope'
];

const chromeBin = findChrome();

if (!chromeBin) {
  console.log('  ! kimi tests skipped: no Chromium/Chrome binary found (set HAMSOO_CHROME to enable).');
} else {
  let promise = null;
  function browserResults() {
    if (!promise) {
      promise = Promise.resolve().then(() => {
        const dir = createHarnessDir({ seedSettings: { lang: 'fa' } });
        fs.copyFileSync(
          path.join(__dirname, 'kimi-checks.js'),
          path.join(dir, 'kimi-checks.js')
        );
        // data-hamsoo-site is normally written by content.js from the real
        // hostname; a file:// fixture has no matching host, so it is pre-set
        // here. content.js only ever adds this attribute (never clears it
        // outside teardown), so the fixture value survives the scan.
        fs.writeFileSync(path.join(dir, 'kimi-fixture.html'), [
          '<!doctype html>',
          '<html data-hamsoo-site="kimi"><head><meta charset="utf-8"><title>fixture</title>',
          '<link rel="stylesheet" href="content.css">',
          '<style>body{width:900px;margin:0;font:16px sans-serif}',
          '/* Kimi\'s own component CSS: set directly on the inner nodes, which is',
          '   what stops typography inherited from a marked ancestor. */',
          '.markdown .paragraph{font-size:13px;line-height:1.35;font-family:"KimiSans",sans-serif}',
          '.markdown .paragraph em,.markdown .paragraph strong{font-size:13px;font-family:"KimiSans",sans-serif}',
          '</style>',
          '</head><body>',
          // Reported bilingual answer.
          '<div class="markdown-container"><div class="markdown" id="kMd">',
          '<div class="paragraph" id="kIntro" dir="auto">Here is a short mixed Persian-English text:</div>',
          '<hr>',
          '<div class="paragraph" id="kHead" dir="auto"><strong>Morning in Tehran</strong></div>',
          '<div class="paragraph" id="kMixed" dir="auto">I woke up early today. \u0647\u0648\u0627 \u062e\u06cc\u0644\u06cc \u062e\u0648\u0628 \u0628\u0648\u062f \u2014 the air was crisp and the sky was that particular shade of blue you only see in autumn. \u0628\u0639\u062f \u0627\u0632 \u0635\u0628\u062d\u0627\u0646\u0647\u060c I decided to walk down Valiasr Street.</div>',
          '<div class="paragraph" id="kFaLead" dir="auto">\u0627\u0632 \u067e\u0646\u062c\u0631\u0647\u060c \u0628\u0631\u06af\u200c\u0647\u0627\u06cc \u0632\u0631\u062f \u0631\u0648\u06cc \u0632\u0645\u06cc\u0646 were dancing in the wind.</div>',
          '<div class="paragraph" id="kTrHead" dir="auto"><strong>Translation of Persian phrases:</strong></div>',
          '<ul id="kList" start="1">',
          '<li><div class="paragraph" dir="auto"><em id="kEm">\u0647\u0648\u0627 \u062e\u06cc\u0644\u06cc \u062e\u0648\u0628 \u0628\u0648\u062f</em> = The weather was very good</div></li>',
          '<li><div class="paragraph" dir="auto"><em>\u0628\u0639\u062f \u0627\u0632 \u0635\u0628\u062d\u0627\u0646\u0647</em> = After breakfast</div></li>',
          '<li><div class="paragraph" dir="auto"><em>\u0642\u0647\u0648\u0647\u200c\u0627\u06cc \u06af\u0631\u0641\u062a\u0645 \u0627\u0632 \u06cc\u06a9 \u06a9\u0627\u0641\u0647 \u06a9\u0648\u0686\u06a9</em> = I got a coffee from a small cafe</div></li>',
          '</ul>',
          '</div></div>',
          // Reported fully-Persian answer: the wrapper resolves RTL, but each
          // paragraph must be classified in its own right too.
          '<div class="markdown" id="kMdFa">',
          '<div class="paragraph" id="kFa1" dir="auto">\u0627\u06cc\u0646 \u06cc\u06a9 \u0635\u0628\u062d \u067e\u0627\u06cc\u06cc\u0632\u06cc \u062f\u0631 \u062a\u0647\u0631\u0627\u0646 \u0627\u0633\u062a. \u0647\u0648\u0627 \u0633\u0631\u062f \u0627\u0633\u062a \u0648 \u0628\u0648\u06cc \u0646\u0645\u200c\u062e\u0627\u06a9 \u0628\u0644\u0646\u062f \u0645\u06cc\u200c\u0634\u0648\u062f.</div>',
          '<div class="paragraph" id="kFa2" dir="auto">\u062f\u0631 \u0622\u0634\u067e\u0632\u062e\u0627\u0646\u0647\u060c \u06a9\u062a\u0631\u06cc \u0631\u0648\u06cc \u06af\u0627\u0632 \u0627\u0633\u062a \u0648 \u0628\u062e\u0627\u0631\u0634 \u0634\u06cc\u0634\u0647\u200c\u0647\u0627 \u0631\u0627 \u0645\u0647\u200c\u0622\u0644\u0648\u062f \u06a9\u0631\u062f\u0647.</div>',
          '<div class="paragraph" id="kFa3" dir="auto">\u0645\u0646 \u06a9\u0646\u0627\u0631\u0634 \u0645\u06cc\u200c\u0646\u0634\u06cc\u0646\u0645. \u0633\u06a9\u0648\u062a \u0628\u06cc\u0646 \u0645\u0627 \u067e\u0631 \u0627\u0632 \u062d\u0631\u0641\u200c\u0647\u0627\u06cc \u0646\u0627\u06af\u0641\u062a\u0647 \u0627\u0633\u062a.</div>',
          '</div>',
          '<script src="stub.js"></script>',
          '<script src="shared/settings-util.js"></script>',
          '<script src="content.js"></script>',
          '<script src="kimi-checks.js"></script>',
          '</body></html>'
        ].join('\n'));
        const url = 'file://' + path.join(dir, 'kimi-fixture.html');
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
    test('kimi: ' + name, async () => {
      const results = await browserResults();
      const item = results.find(r => r.name === name);
      assert.ok(item, 'browser check did not run: ' + name);
      assert.ok(item.ok, item.msg || 'failed in browser');
    });
  }
}
