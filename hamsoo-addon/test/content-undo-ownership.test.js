'use strict';
const fs = require('fs');
const path = require('path');
const { test, assert } = require('./harness');

test('content: localizeDigits stores lastWritten and restoreDigits verifies nodeValue matches lastWritten', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
  assert.ok(src.includes('lastWritten: converted'), 'must record lastWritten in WeakMap');
  const restoreStart = src.indexOf('function restoreDigits(el, scope)');
  const restoreBody = src.slice(restoreStart, restoreStart + 800);
  assert.ok(restoreBody.includes('node.nodeValue === record.lastWritten'), 'must check that nodeValue equals lastWritten');
});

test('content: classify restores digits before isolating LTR runs in RTL blocks', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
  const classifyStart = src.indexOf('function classify(el)');
  const classifyBody = src.slice(classifyStart, classifyStart + 1500);
  const restoreDigitsIdx = classifyBody.indexOf('restoreDigits(el)');
  const isolateIdx = classifyBody.indexOf('isolateBareLTRRuns(el)');
  assert.ok(restoreDigitsIdx > 0, 'must call restoreDigits in classify');
  assert.ok(isolateIdx > restoreDigitsIdx, 'must restore digits before isolating bare LTR runs');
});

test('content: unstyleDroppedSelectors restores digits, isolate runs, and editable directions', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
  const start = src.indexOf('function unstyleDroppedSelectors(oldSel, newSel)');
  const body = src.slice(start, start + 1200);
  assert.ok(body.includes("restoreDigits(el, 'tree')"), 'must restore digits on dropped element');
  assert.ok(body.includes("restoreBareLTRRuns(el, 'tree')"), 'must restore bare LTR runs on dropped element');
  assert.ok(body.includes('restoreEditableDir(el)'), 'must restore editable directions on dropped element');
  assert.ok(body.includes('unmark(el)'), 'must unmark dropped element');
});

test('content: editable field with punctuationFix disabled restores author dir and returns early', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
  const classifyStart = src.indexOf('function classify(el)');
  const classifyBody = src.slice(classifyStart, classifyStart + 1200);
  const editableIdx = classifyBody.indexOf('el.matches(EDITABLE_SELECTOR)');
  assert.ok(editableIdx > 0, 'must check EDITABLE_SELECTOR in classify');
  const editableBody = classifyBody.slice(editableIdx, editableIdx + 400);
  assert.ok(editableBody.includes('restoreEditableDir(el)'), 'must restore editable dir when disabled');
  assert.ok(editableBody.includes('unmark(el)'), 'must unmark editable field when disabled');
  assert.ok(editableBody.includes('return;'), 'must return early so direction: rtl is not applied');
});

test('content: silent paste interception listener is removed', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
  assert.ok(!src.includes("addEventListener('paste'"), 'must not silently intercept paste events');
});
