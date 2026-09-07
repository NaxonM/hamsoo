'use strict';
/**
 * Bare-text bidi isolation checks in real headless Chromium (H11).
 *
 * Why this file exists
 * --------------------
 * Element-level classification sets dir="rtl" on the parent paragraph, but
 * bare English text nodes inside that block still inherit the parent's base
 * direction. Under the Unicode Bidi Algorithm, trailing neutral punctuation
 * (colons, dots, quotes) resolves at the RTL embedding level, throwing it to
 * the far left margin (e.g. ":Let's look at...").
 *
 * content.js isolates those bare runs in <span data-hamsoo-run="ltr">.
 * These checks assert real layout positions in headless browser rendering,
 * verify delimiter balancing around parentheses, preserve ASCII digits from
 * digit localization, and confirm clean DOM restoration on disable.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, assert } = require('./harness');
const { findChrome, createHarnessDir } = require('../scripts/uiharness');

test('H11: content.css declares isolate rule for data-hamsoo-run="ltr"', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.css'), 'utf8');
  assert.ok(css.includes('[data-hamsoo-run="ltr"]'));
  assert.ok(css.includes('unicode-bidi: isolate !important'));
});

test('H11: content.js includes isolateBareLTRRuns and restoreBareLTRRuns', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
  assert.ok(js.includes('isolateBareLTRRuns'));
  assert.ok(js.includes('restoreBareLTRRuns'));
  assert.ok(js.includes('[data-hamsoo-run="ltr"]'));
});

const chromeBin = findChrome();

if (!chromeBin) {
  console.log('  ! bare-text-bidi browser tests skipped: no Chromium binary found.');
} else {
  let promise = null;
  function browserResults() {
    if (!promise) {
      promise = Promise.resolve().then(() => {
        const dir = createHarnessDir({
          seedSettings: { enabled: true, digitsEnabled: true, digitsScript: 'fa' }
        });

        const P1 = "Let's look at a critical issue with bidirectional text in extensions:<br>وقتی یک افزونه می‌خواهد متن را تغییر دهد، اگر کدهای HTML دارای ساختار درست نباشند، عبارات انگلیسی مثل <code>const entry = document.createElement('div')</code> در میان متن فارسی کاملاً به‌هم می‌ریزند.";
        const P2 = 'وقتی یک extension را نصب می‌کنید، مرورگر یک پروسه جداگانه برای آن باز می‌کند. The main component is the manifest.json file which contains metadata like "name", "version", and crucially, "permissions". بدون این فایل، مرورگر اصلاً افزونه را نمی‌شناسد.';
        const P3 = 'یک پروسه جداگانه (process) برای آن باز می‌کند.';
        const P4 = 'تنظیمات نسخه 3.2.1 در فایل config.json ذخیره می‌شود.';

        const html = [
          '<!doctype html>',
          '<html><head><meta charset="utf-8">',
          '<link rel="stylesheet" href="content.css">',
          '<style>body{width:900px;margin:0;font:16px/1.9 sans-serif}</style>',
          '</head><body>',
          '<div class="markdown" data-message-author-role="assistant" id="msg">',
          '  <p id="p1">' + P1 + '</p>',
          '  <p id="p2">' + P2 + '</p>',
          '  <p id="p3">' + P3 + '</p>',
          '  <p id="p4">' + P4 + '</p>',
          '</div>',
          '<script src="stub.js"></script>',
          '<script src="shared/settings-util.js"></script>',
          '<script src="content.js"></script>',
          '<script>',
          '(async () => {',
          '  const results = [];',
          '  function check(name, fn) {',
          '    try {',
          '      const v = fn();',
          '      if (v === false) throw new Error("check returned false");',
          '      results.push({ name: name, ok: true });',
          '    } catch (e) {',
          '      results.push({ name: name, ok: false, msg: String((e && e.message) || e) });',
          '    }',
          '  }',
          '  const wait = ms => new Promise(r => setTimeout(r, ms));',
          '  await wait(800);',
          '',
          '  function rect(el, needle, len, off) {',
          '    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);',
          '    let n;',
          '    while ((n = w.nextNode())) {',
          '      const i = n.textContent.indexOf(needle);',
          '      if (i >= 0) {',
          '        const r = document.createRange();',
          '        r.setStart(n, i + (off || 0));',
          '        r.setEnd(n, i + (off || 0) + len);',
          '        const b = r.getBoundingClientRect();',
          '        return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top) };',
          '      }',
          '    }',
          '    return null;',
          '  }',
          '',
          '  const p1 = document.getElementById("p1");',
          '  const p2 = document.getElementById("p2");',
          '  const p3 = document.getElementById("p3");',
          '  const p4 = document.getElementById("p4");',
          '',
          '  check("P1: trailing colon in bare English line sits at the right end of the line", () => {',
          '    const first = rect(p1, "Let\'s", 5);',
          '    const colon = rect(p1, "extensions:", 1, "extensions".length);',
          '    if (!first || !colon) throw new Error("could not find text in P1");',
          '    if (colon.left <= first.left) {',
          '      throw new Error("colon at left=" + colon.left + " <= first at left=" + first.left);',
          '    }',
          '    return true;',
          '  });',
          '',
          '  check("P2: trailing period in English sentence sits to the right of permissions", () => {',
          '    const perm = rect(p2, "permissions", "permissions".length);',
          '    const dot = rect(p2, \'"permissions".\', 1, \'"permissions"\'.length);',
          '    if (!perm || !dot) throw new Error("could not find text in P2");',
          '    if (dot.left <= perm.left) {',
          '      throw new Error("dot at left=" + dot.left + " <= permissions at left=" + perm.left);',
          '    }',
          '    return true;',
          '  });',
          '',
          '  check("P3: outer parentheses around English word preserve correct visual order", () => {',
          '    const openParen = rect(p3, "(", 1);',
          '    const closeParen = rect(p3, ")", 1);',
          '    const word = rect(p3, "process", 7);',
          '    if (!openParen || !closeParen || !word) throw new Error("could not find text in P3");',
          '    if (!(closeParen.left < word.left && word.left < openParen.left)) {',
          '      throw new Error("parens distorted: close=" + closeParen.left + " word=" + word.left + " open=" + openParen.left);',
          '    }',
          '    return true;',
          '  });',
          '',
          '  check("P4: digits inside isolated English run remain ASCII despite digitsEnabled", () => {',
          '    const run = p4.querySelector(\'[data-hamsoo-run="ltr"]\');',
          '    if (!run) throw new Error("no isolated run found in P4");',
          '    if (!/config\\.json/.test(run.textContent)) throw new Error("unexpected run text: " + run.textContent);',
          '    return true;',
          '  });',
          '',
          '  check("Teardown: disabling removes all data-hamsoo-run elements and restores original text", async () => {',
          '    window.__push({ enabled: false });',
          '    await wait(600);',
          '    const remaining = document.querySelectorAll("[data-hamsoo-run]");',
          '    if (remaining.length > 0) throw new Error("left behind " + remaining.length + " data-hamsoo-run elements");',
          '    if (p1.querySelectorAll("span").length > 0) throw new Error("span wrappers left in P1");',
          '    return true;',
          '  });',
          '',
          '  check("Re-enabling: restores data-hamsoo-run without duplicate spans", async () => {',
          '    window.__push({ enabled: true, digitsEnabled: false });',
          '    await wait(600);',
          '    const runs = p1.querySelectorAll(\'[data-hamsoo-run="ltr"]\');',
          '    if (runs.length !== 1) throw new Error("expected 1 run in P1, got " + runs.length);',
          '    return true;',
          '  });',
          '',
          '  document.title = "HAMSOO_RESULTS:" + btoa(unescape(encodeURIComponent(JSON.stringify(results))));',
          '})();',
          '</script>',
          '</body></html>'
        ].join('\n');

        fs.writeFileSync(path.join(dir, 'bare-text-fixture.html'), html);
        const url = 'file://' + path.join(dir, 'bare-text-fixture.html');
        const out = execFileSync(chromeBin, [
          '--headless', '--no-sandbox', '--disable-gpu',
          '--window-size=900,800',
          '--virtual-time-budget=8000', '--dump-dom', url
        ], { encoding: 'utf8', timeout: 30000 });

        const m = /HAMSOO_RESULTS:([A-Za-z0-9+/=]+)/.exec(out);
        if (!m) throw new Error('no HAMSOO_RESULTS marker in dumped DOM');
        return JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
      });
    }
    return promise;
  }

  const BROWSER_CHECKS = [
    'P1: trailing colon in bare English line sits at the right end of the line',
    'P2: trailing period in English sentence sits to the right of permissions',
    'P3: outer parentheses around English word preserve correct visual order',
    'P4: digits inside isolated English run remain ASCII despite digitsEnabled',
    'Teardown: disabling removes all data-hamsoo-run elements and restores original text',
    'Re-enabling: restores data-hamsoo-run without duplicate spans'
  ];

  for (const name of BROWSER_CHECKS) {
    test('H11: ' + name, async () => {
      const results = await browserResults();
      const item = results.find(r => r.name === name);
      assert.ok(item, 'browser check did not run: ' + name);
      assert.ok(item.ok, item.msg || 'failed in browser');
    });
  }
}
