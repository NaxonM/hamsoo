'use strict';
const path = require('path');
const util = require(path.join(__dirname, '..', 'src', 'shared', 'settings-util'));
const { test, assert } = require('./harness');

test('clampSize clamps to 12..22 and defaults to 15', () => {
  assert.equal(util.clampSize(5), 12);
  assert.equal(util.clampSize(30), 22);
  assert.equal(util.clampSize(16), 16);
  assert.equal(util.clampSize(0), 15);
  assert.equal(util.clampSize('nope'), 15);
});

test('clampLineHeight clamps to 1.3..2.5 and defaults to 1.9', () => {
  assert.equal(util.clampLineHeight(1), 1.3);
  assert.equal(util.clampLineHeight(3), 2.5);
  assert.equal(util.clampLineHeight(2), 2);
  assert.equal(util.clampLineHeight(0), 1.9);
});

test('clampWeight clamps to 300..800 and defaults to 400', () => {
  assert.equal(util.clampWeight(100), 300);
  assert.equal(util.clampWeight(900), 800);
  assert.equal(util.clampWeight(500), 500);
  assert.equal(util.clampWeight(0), 400);
});

test('clampLetterSpacing clamps to 0..1.5', () => {
  assert.equal(util.clampLetterSpacing(-1), 0);
  assert.equal(util.clampLetterSpacing(2), 1.5);
  assert.equal(util.clampLetterSpacing(0.5), 0.5);
});

test('clampMeasure: 0/invalid stays off, otherwise 40..100', () => {
  assert.equal(util.clampMeasure(0), 0);
  assert.equal(util.clampMeasure('x'), 0);
  assert.equal(util.clampMeasure(10), 40);
  assert.equal(util.clampMeasure(200), 100);
  assert.equal(util.clampMeasure(65), 65);
});

test('normalizeAlign only allows justify, else start', () => {
  assert.equal(util.normalizeAlign('justify'), 'justify');
  assert.equal(util.normalizeAlign('start'), 'start');
  assert.equal(util.normalizeAlign('center'), 'start');
  assert.equal(util.normalizeAlign(undefined), 'start');
});
