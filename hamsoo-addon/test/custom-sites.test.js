'use strict';
const fs = require('fs');
const path = require('path');
const util = require(path.join(__dirname, '..', 'src', 'shared', 'settings-util'));
const { test, assert } = require('./harness');

test('H04: exact host pattern matches that host only', () => {
  assert.equal(util.urlMatchesPattern('https://wiki.example/path', 'https://wiki.example/*'), true);
  assert.equal(util.urlMatchesPattern('https://other.example/path', 'https://wiki.example/*'), false);
  assert.equal(util.urlMatchesPattern('http://wiki.example/path', 'https://wiki.example/*'), false);
});

test('H04: wildcard host matches apex and subdomains', () => {
  assert.equal(util.urlMatchesPattern('https://example.com/', 'https://*.example.com/*'), true);
  assert.equal(util.urlMatchesPattern('https://www.example.com/x', 'https://*.example.com/*'), true);
  assert.equal(util.urlMatchesPattern('https://notexample.com/', 'https://*.example.com/*'), false);
});

test('H04: urlMatchesCustomSites is true only while the host remains listed', () => {
  const url = 'https://notes.example/post/1';
  const listed = ['https://other.example/*', 'https://notes.example/*'];
  assert.equal(util.urlMatchesCustomSites(url, listed), true);
  assert.equal(util.urlMatchesCustomSites(url, listed.filter(p => p !== 'https://notes.example/*')), false);
  assert.equal(util.urlMatchesCustomSites(url, []), false);
});

test('H04: content script consults customSites for unlisted http(s) hosts', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
  assert.ok(src.includes('urlMatchesCustomSites'));
  assert.ok(src.includes("protocol !== 'http:'"));
});

test('H04: removing a custom site persists immediately, not via debounce', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'popup.js'), 'utf8');
  const start = src.indexOf('async function removeCustomSite');
  const end = src.indexOf('async function', start + 10);
  const body = src.slice(start, end > start ? end : start + 800);
  assert.ok(body.includes('persistNow()'));
  assert.ok(!/\bsave\(\s*\)/.test(body));
});
