'use strict';
/**
 * Visual QA: screenshots the real popup and options pages in headless
 * Chromium across languages (fa/en) and color modes (light/dark).
 *
 * Usage: npm run preview   (or: node scripts/preview.js)
 * Env:   HAMSOO_CHROME=/path/to/chrome to override the browser binary.
 *
 * Output: preview-shots/*.png (gitignored).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { findChrome, createHarnessDir, ROOT } = require('./uiharness');

const OUT = path.join(ROOT, 'preview-shots');

const chromeBin = findChrome();
if (!chromeBin) {
  console.error('No Chromium/Chrome binary found. Install one or set HAMSOO_CHROME.');
  process.exit(1);
}

console.log('building dist...');
execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'ignore' });

// Seed demo state so conditional UI (custom-sites list, ...) renders too.
const dir = createHarnessDir({
  seedSettings: {
    customSites: ['https://chat.example.ir/*', 'https://rtl-demo.example.org/*']
  }
});

fs.mkdirSync(OUT, { recursive: true });

const SHOTS = [];
for (const lang of ['fa', 'en']) {
  for (const mode of ['light', 'dark']) {
    SHOTS.push({ name: 'popup-' + lang + '-' + mode + '.png', page: 'popup.html', lang, mode, size: '420,1900' });
    SHOTS.push({ name: 'fonts-' + lang + '-' + mode + '.png', page: 'fonts.html', lang, mode, size: '900,700' });
  }
}

for (const shot of SHOTS) {
  const url = 'file://' + path.join(dir, shot.page) + '?uilang=' + shot.lang + '&uimode=' + shot.mode;
  const out = path.join(OUT, shot.name);
  execFileSync(chromeBin, [
    '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--window-size=' + shot.size, '--virtual-time-budget=4000',
    '--screenshot=' + out, url
  ], { stdio: 'ignore', timeout: 60000 });
  console.log('  . ' + shot.name);
}

console.log('\n' + SHOTS.length + ' screenshots in ' + path.relative(ROOT, OUT) + path.sep);
