'use strict';
/**
 * Bare-text bidi isolation checks in real headless Chromium (H11).
 *
 * Why this file exists
 * --------------------
 * Element-level classification sets dir="rtl" on the parent paragraph, but
 * bare English/German text nodes inside that block still inherit the parent's base
 * direction. Under the Unicode Bidi Algorithm, trailing neutral punctuation
 * (colons, dots, quotes) resolves at the RTL embedding level, throwing it to
 * the far left margin (e.g. ":Let's look at...").
 *
 * content.js isolates those bare runs in <span dir="ltr" data-hamsoo-run="ltr">
 * using the pure boundary planner planLTRIsolates (settings-util.js).
 * These checks assert:
 * 1. Pure range planning, bracket balancing, full-text reconstruction, and invariants.
 * 2. Real layout positions in headless browser rendering for both standard English
 *    runs and mixed Persian/German list fixtures (H11 regression).
 * 3. Exact author DOM and text restoration on disable and re-enable.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, assert } = require('./harness');
const { findChrome, createHarnessDir } = require('../scripts/uiharness');
const util = require(path.join(__dirname, '..', 'src', 'shared', 'settings-util'));

test('H11: content.css declares isolate rule for data-hamsoo-run="ltr"', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.css'), 'utf8');
  assert.ok(css.includes('[data-hamsoo-run="ltr"]'));
  assert.ok(css.includes('unicode-bidi: isolate !important'));
});

test('H11: content.js includes isolateBareLTRRuns, restoreBareLTRRuns, and planLTRIsolates', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
  assert.ok(js.includes('isolateBareLTRRuns'));
  assert.ok(js.includes('restoreBareLTRRuns'));
  assert.ok(js.includes('planLTRIsolates'));
  assert.ok(js.includes('[data-hamsoo-run="ltr"]'));
});

// Pure unit tests for planLTRIsolates
test('H11 unit: planLTRIsolates isolates "der" in "مذکر (der):"', () => {
  const res = util.planLTRIsolates('مذکر (der):');
  assert.equal(res.length, 1);
  assert.equal(res[0].text, 'der');
});

test('H11 unit: planLTRIsolates isolates "Experten, pl." in "(Experten, pl.) — کارشناس"', () => {
  const res = util.planLTRIsolates('(Experten, pl.) — کارشناس');
  assert.equal(res.length, 1);
  assert.equal(res[0].text, 'Experten, pl.');
});

test('H11 unit: planLTRIsolates isolates "n-Deklination" in "ضعیف/n-Deklination) — پسر"', () => {
  const res = util.planLTRIsolates('ضعیف/n-Deklination) — پسر');
  assert.equal(res.length, 1);
  assert.equal(res[0].text, 'n-Deklination');
});

test('H11 unit: planLTRIsolates isolates German sentence leaving Persian translation outside', () => {
  const text = 'Ich kenne den kleinen Jungen. (من آن پسربچه را می‌شناسم.)';
  const res = util.planLTRIsolates(text);
  assert.equal(res.length, 1);
  assert.equal(res[0].text, 'Ich kenne den kleinen Jungen.');
});

test('H11 unit: planLTRIsolates leaves outer parens and brackets outside around single Latin words', () => {
  const r1 = util.planLTRIsolates('یک پروسه جداگانه (process) برای آن باز می‌کند.');
  assert.equal(r1.length, 1);
  assert.equal(r1[0].text, 'process');

  const r2 = util.planLTRIsolates('[process]:');
  assert.equal(r2.length, 1);
  assert.equal(r2[0].text, 'process');
});

test('H11 unit: planLTRIsolates retains internal balanced brackets within Latin runs', () => {
  const r1 = util.planLTRIsolates('call(x)');
  assert.equal(r1.length, 1);
  assert.equal(r1[0].text, 'call(x)');

  const r2 = util.planLTRIsolates('Version (beta) works.');
  assert.equal(r2.length, 1);
  assert.equal(r2[0].text, 'Version (beta) works.');
});

test('H11 unit: planLTRIsolates preserves English sentence-final punctuation, quotes, and contractions', () => {
  const t1 = "Let's look at a critical issue with bidirectional text in extensions:";
  const r1 = util.planLTRIsolates(t1);
  assert.equal(r1.length, 1);
  assert.equal(r1[0].text, t1);

  const t2 = 'The main component is the manifest.json file which contains metadata like "name", "version", and crucially, "permissions".';
  const r2 = util.planLTRIsolates(t2);
  assert.equal(r2.length, 1);
  assert.equal(r2[0].text, t2);
});

test('H11 unit: planLTRIsolates splits across RTL-enclosing brackets', () => {
  const res = util.planLTRIsolates('foo(فارسی)bar');
  assert.equal(res.length, 2);
  assert.equal(res[0].text, 'foo');
  assert.equal(res[1].text, 'bar');
});

test('H11 unit: full-text reconstruction and non-overlapping range invariants', () => {
  const samples = [
    'مذکر (der):',
    '(Experten, pl.) — کارشناس',
    'ضعیف/n-Deklination) — پسر',
    ' (Jungen, pl. — اسم با پایان ضعیف/n-Deklination) — پسر / پسربچه — Ich kenne den kleinen Jungen. (من آن پسربچه را می‌شناسم.)',
    ' (Experten, pl.) — کارشناس / متخصص — Der Experte gibt Feedback. (کارشناس نظر و بازخورد می‌دهد.)',
    'یک پروسه جداگانه (process) برای آن باز می‌کند.',
    'تنظیمات نسخه 3.2.1 در فایل config.json ذخیره می‌شود.',
    'call(x)',
    'Version (beta) works.',
    "Let's look at a critical issue with bidirectional text in extensions:",
    'The main component is the manifest.json file which contains metadata like "name", "version", and crucially, "permissions".',
    'بدون هیچ کلمه لاتین'
  ];

  for (const str of samples) {
    const ranges = util.planLTRIsolates(str);
    let cur = 0;
    let reconstructed = '';
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i];
      assert.ok(r.start >= cur, 'range overlap or out of order');
      assert.ok(r.start < r.end, 'empty or negative range');
      assert.ok(r.end <= str.length, 'range exceeds text length');
      assert.ok(!/^\s|\s$/.test(r.text), 'range text has leading/trailing whitespace');
      // No invisible bidi control characters
      assert.ok(!/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/.test(r.text), 'contains bidi control characters');

      reconstructed += str.slice(cur, r.start);
      reconstructed += str.slice(r.start, r.end);
      cur = r.end;
    }
    reconstructed += str.slice(cur);
    assert.equal(reconstructed, str, 'reconstruction mismatch');
  }
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
          '<div class="markdown" data-message-author-role="assistant" id="fixture">',
          '  <ul>',
          '    <li>',
          '      <p id="fix-header" data-path-to-node="4,0,0"><b data-path-to-node="4,0,0" data-index-in-node="0">مذکر (der):</b></p>',
          '      <ul data-path-to-node="4,0,1">',
          '        <li><p id="fix-junge" data-path-to-node="4,0,1,0,0"><b data-path-to-node="4,0,1,0,0" data-index-in-node="0">der Junge</b> (Jungen, pl. — اسم با پایان ضعیف/n-Deklination) — پسر / پسربچه — Ich kenne den kleinen Jungen. (من آن پسربچه را می‌شناسم.)</p></li>',
          '        <li><p id="fix-experte" data-path-to-node="4,0,1,1,0"><b data-path-to-node="4,0,1,1,0" data-index-in-node="0">der Experte</b> (Experten, pl.) — کارشناس / متخصص — Der Experte gibt Feedback. (کارشناس نظر و بازخورد می‌دهد.)</p></li>',
          '      </ul>',
          '    </li>',
          '  </ul>',
          '</div>',
          '<script src="stub.js"></script>',
          '<script>',
          '(function(){',
          '  var listeners = [];',
          '  chrome.storage.onChanged = { addListener: function(fn){ listeners.push(fn); } };',
          '  window.__push = function(s){',
          '    chrome.storage.local.set({ settings: s });',
          '    for (var i = 0; i < listeners.length; i++) {',
          '      listeners[i]({ settings: { newValue: s } }, "local");',
          '    }',
          '  };',
          '})();',
          '</script>',
          '<script src="shared/settings-util.js"></script>',
          '<script src="content.js"></script>',
          '<script>',
          '(async () => {',
          '  const results = [];',
          '  async function check(name, fn) {',
          '    try {',
          '      const v = await fn();',
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
          '  const fixHeader = document.getElementById("fix-header");',
          '  const fixJunge = document.getElementById("fix-junge");',
          '  const fixExperte = document.getElementById("fix-experte");',
          '',
          '  await check("P1: trailing colon in bare English line sits at the right end of the line", () => {',
          '    const first = rect(p1, "Let\'s", 5);',
          '    const colon = rect(p1, "extensions:", 1, "extensions".length);',
          '    if (!first || !colon) throw new Error("could not find text in P1");',
          '    if (colon.left <= first.left) {',
          '      throw new Error("colon at left=" + colon.left + " <= first at left=" + first.left);',
          '    }',
          '    return true;',
          '  });',
          '',
          '  await check("P2: trailing period in English sentence sits to the right of permissions", () => {',
          '    const perm = rect(p2, "permissions", "permissions".length);',
          '    const dot = rect(p2, \'"permissions".\', 1, \'"permissions"\'.length);',
          '    if (!perm || !dot) throw new Error("could not find text in P2");',
          '    if (dot.left <= perm.left) {',
          '      throw new Error("dot at left=" + dot.left + " <= permissions at left=" + perm.left);',
          '    }',
          '    return true;',
          '  });',
          '',
          '  await check("P3: outer parentheses around English word preserve correct visual order", () => {',
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
          '  await check("P4: digits inside isolated English run remain ASCII despite digitsEnabled", () => {',
          '    const run = p4.querySelector(\'[data-hamsoo-run="ltr"]\');',
          '    if (!run) throw new Error("no isolated run found in P4");',
          '    if (!/config\\.json/.test(run.textContent)) throw new Error("unexpected run text: " + run.textContent);',
          '    return true;',
          '  });',
          '',
          '  await check("Fixture: header colon sits to the left of isolated der in RTL prose", () => {',
          '    const der = rect(fixHeader, "der", 3);',
          '    const colon = rect(fixHeader, ":", 1);',
          '    if (!der || !colon) throw new Error("could not find der or colon in fixHeader");',
          '    if (der.top !== colon.top) throw new Error("der and colon wrapped across different lines");',
          '    if (colon.left >= der.left) {',
          '      throw new Error("colon at left=" + colon.left + " >= der at left=" + der.left + " (colon should be to the left of der)");',
          '    }',
          '    return true;',
          '  });',
          '',
          '  await check("Fixture: German phrase in Experten item visually encloses term without mangled dash", () => {',
          '    const openP = rect(fixExperte, "(", 1);',
          '    const closeP = rect(fixExperte, ")", 1);',
          '    const dash = rect(fixExperte, "—", 1);',
          '    const exp = rect(fixExperte, "Experten, pl.", 13);',
          '    if (!openP || !closeP || !dash || !exp) throw new Error("could not find text elements in fixExperte");',
          '    if (openP.top !== exp.top || closeP.top !== exp.top) {',
          '      throw new Error("parens wrapped across lines");',
          '    }',
          '    if (!(closeP.left < exp.left && exp.left < openP.left)) {',
          '      throw new Error("parens distorted around Experten: close=" + closeP.left + " exp=" + exp.left + " open=" + openP.left);',
          '    }',
          '    if (dash.left > closeP.left) {',
          '      throw new Error("dash jumped inside parentheses: dash=" + dash.left + " close=" + closeP.left);',
          '    }',
          '    return true;',
          '  });',
          '',
          '  await check("Fixture: German sentence final dot stays with sentence and precedes Persian translation", () => {',
          '    const jungen = rect(fixJunge, "Jungen.", "Jungen".length);',
          '    const dot = rect(fixJunge, "Jungen.", 1, "Jungen".length);',
          '    const openParen = rect(fixJunge, "(من", 1);',
          '    if (!jungen || !dot || !openParen) throw new Error("could not find Jungen sentence in fixJunge");',
          '    if (jungen.top !== dot.top) throw new Error("sentence wrapped before dot");',
          '    if (dot.left <= jungen.left) {',
          '      throw new Error("German dot at left=" + dot.left + " <= Jungen at left=" + jungen.left);',
          '    }',
          '    return true;',
          '  });',
          '',
          '  await check("Teardown: disabling removes all data-hamsoo-run elements and restores original text", async () => {',
          '    window.__push({ enabled: false });',
          '    await wait(600);',
          '    const remaining = document.querySelectorAll("[data-hamsoo-run]");',
          '    if (remaining.length > 0) throw new Error("left behind " + remaining.length + " data-hamsoo-run elements");',
          '    if (p1.querySelectorAll("span").length > 0) throw new Error("span wrappers left in P1");',
          '    if (fixHeader.querySelectorAll("span").length > 0) throw new Error("span wrappers left in fixHeader");',
          '    if (fixJunge.querySelectorAll("span").length > 0) throw new Error("span wrappers left in fixJunge");',
          '    if (!fixHeader.querySelector("b")) throw new Error("<b> tag missing from fixHeader after teardown");',
          '    return true;',
          '  });',
          '',
          '  await check("Re-enabling: restores data-hamsoo-run without duplicate spans", async () => {',
          '    window.__push({ enabled: true, digitsEnabled: false });',
          '    await wait(600);',
          '    const runs = p1.querySelectorAll(\'[data-hamsoo-run="ltr"]\');',
          '    if (runs.length !== 2) throw new Error("expected 2 runs in P1, got " + runs.length);',
          '    const fixRuns = fixHeader.querySelectorAll(\'[data-hamsoo-run="ltr"]\');',
          '    if (fixRuns.length !== 1) throw new Error("expected 1 run in fixHeader, got " + fixRuns.length);',
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
          '--window-size=1200,900',
          '--virtual-time-budget=12000', '--dump-dom', url
        ], { encoding: 'utf8', timeout: 45000 });

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
    'Fixture: header colon sits to the left of isolated der in RTL prose',
    'Fixture: German phrase in Experten item visually encloses term without mangled dash',
    'Fixture: German sentence final dot stays with sentence and precedes Persian translation',
    'Teardown: disabling removes all data-hamsoo-run elements and restores original text',
    'Re-enabling: restores data-hamsoo-run without duplicate spans'
  ];

  for (const name of BROWSER_CHECKS) {
    test('H11 browser: ' + name, async () => {
      const results = await browserResults();
      const item = results.find(r => r.name === name);
      assert.ok(item, 'browser check did not run: ' + name);
      assert.ok(item.ok, item.msg || 'failed in browser');
    });
  }
}
