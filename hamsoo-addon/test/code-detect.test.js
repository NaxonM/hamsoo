'use strict';
/**
 * Regression tests for the code-vs-prose classifier in src/content.js.
 *
 * Why this file exists
 * --------------------
 * looksLikeCode() decides whether a block is exempt from RTL treatment. The
 * original CODE_STRONG_RE matched any line that merely STARTED with one of ~60
 * keywords -- and most of those keywords ('if', 'for', 'return', 'update',
 * 'select', 'print', 'new', 'class', 'from', 'do', 'case', 'import') are also
 * ordinary English words. Any answer opening with one was declared code and
 * silently denied Persian typography and direction handling. It also treated
 * any "<word>" in prose as an HTML tag.
 *
 * content.js is a DOM-dependent IIFE and cannot be require()d, so the
 * self-contained detection block is sliced out of the source and evaluated
 * directly. That keeps this test dependency-free and, more importantly, keeps
 * it honest: it exercises the SHIPPING source, not a copy.
 */
const fs = require('fs');
const path = require('path');
const { test, assert } = require('./harness');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'content.js'),
  'utf8'
);

// The block spans CODE_STRONG_PATTERNS through the end of looksLikeCode().
const START = 'const CODE_STRONG_PATTERNS = [';
const END = '// Semantic/structural selectors are load-bearing';
const startIdx = SRC.indexOf(START);
const endIdx = SRC.indexOf(END);

test('code detection block can be extracted from content.js', () => {
  assert.ok(startIdx !== -1, 'CODE_STRONG_PATTERNS not found -- update this test');
  assert.ok(endIdx > startIdx, 'end marker not found -- update this test');
});

const block = SRC.slice(startIdx, endIdx);
const looksLikeCode = new Function(block + '\nreturn looksLikeCode;')();

// Ordinary English prose. Every one of these was misclassified as code before
// the tightening, which is why Persian answers opening with a Latin word lost
// their styling.
const PROSE = [
  'If you want to change the font, open the popup.',
  'Return to the menu and pick your language.',
  'For example, Persian text reads right to left.',
  'Update your settings to enable digits.',
  'Do not close the tab while it is loading.',
  'New in this release: better line spacing.',
  'Class of 2020 graduated last spring.',
  'Select an option from the list below.',
  'Print the page if you need a paper copy.',
  'Import duties may apply to this order.',
  'From there, choose the second tab.',
  'Using the app is straightforward.',
  'While you wait, try the keyboard shortcut.',
  'Case in point: the bullets sat on the wrong side.',
  'Try the new layout and tell us what you think.',
  // B5: angle brackets in prose are not markup.
  'Replace <your name here> with your actual name.',
  'The status is <unknown> until the scan finishes.',
  // Mixed Persian/Latin prose must never read as code.
  'VM = \u06a9\u0644\u0627\u0633',
  '\u0633\u0644\u0627\u0645 \u062f\u0646\u06cc\u0627\u06cc \u0631\u0648\u0634\u0646'
];

for (const text of PROSE) {
  test('prose is not code: ' + text.slice(0, 46), () => {
    assert.equal(looksLikeCode(text), false, 'misclassified as code: ' + text);
  });
}

// Real code must still be detected, or Persian string literals and comments
// inside snippets would get reversed.
const CODE = [
  'const x = 1;',
  'let total = a + b;',
  'function greet(name) {',
  'def main():',
  'if (x > 1) {',
  'for (let i = 0; i < n; i += 1) {',
  'return value;',
  'class Foo {',
  'import { useState } from "react";',
  'from os import path',
  'export default App;',
  'public void run() {',
  'const mod = require("fs");',
  '#include <stdio.h>',
  '#!/usr/bin/env node',
  'console.log("hello");',
  '// TODO: fix this before release',
  'try {',
  'except ValueError:',
  '<div class="wrapper">',
  '</section>',
  'SELECT id FROM users WHERE age > 20',
  'a = b; c = d;',
  'x => y => z'
];

for (const text of CODE) {
  test('code is detected: ' + text.slice(0, 46), () => {
    assert.equal(looksLikeCode(text), true, 'real code not detected: ' + text);
  });
}
