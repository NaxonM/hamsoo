'use strict';
/**
 * Visual QA: screenshots the real popup and options pages in headless
 * Chromium across languages (fa/en/ar) and color modes (light/dark).
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

// Seed demo state so custom sites & picked elements render too.
const dir = createHarnessDir({
  seedSettings: {
    enabled: true,
    fontEnabled: true,
    fontFamily: 'Vazirmatn',
    readabilityEnabled: true,
    customSites: [
      'https://chat.example.ir/*',
      'https://rtl-demo.example.org/*',
      'https://ai.workspace.dev/*',
      'https://llm.internal.corp/*'
    ],
    customSelectors: {
      'gemini.google.com': ['div.follow-up-text', 'p.query-text'],
      'chatgpt.com': ['div.markdown-prose'],
      'claude.ai': ['div.font-claude-message']
    }
  }
});

fs.mkdirSync(OUT, { recursive: true });

const SHOTS = [];
for (const lang of ['fa', 'en', 'ar']) {
  for (const mode of ['light', 'dark']) {
    // 1. Side-by-Side Main Interface (Top View + Scrolled View)
    SHOTS.push({
      name: 'popup-' + lang + '-' + mode + '.png',
      url: `wrapper.html?page=popup&uilang=${lang}&uimode=${mode}`,
      size: '1280,680',
      mode
    });
    // 2. Side-by-Side Settings Page (Top View + Scrolled View)
    SHOTS.push({
      name: 'options-' + lang + '-' + mode + '.png',
      url: `wrapper.html?page=options&uilang=${lang}&uimode=${mode}`,
      size: '1280,680',
      mode
    });
    // 3. Full Page Custom Font Manager
    SHOTS.push({
      name: 'fonts-' + lang + '-' + mode + '.png',
      url: `fonts.html?uilang=${lang}&uimode=${mode}`,
      size: '1280,780',
      mode
    });
    // 4. First-run welcome tour. Taller window than the other pages because it
    // is a scrolling document, not a fixed-size panel; --screenshot captures
    // the viewport, so the window size is what decides how much is in frame.
    SHOTS.push({
      name: 'welcome-' + lang + '-' + mode + '.png',
      url: `welcome.html?uilang=${lang}&uimode=${mode}`,
      size: '1160,1480',
      mode
    });
  }
}

for (const shot of SHOTS) {
  const url = 'file://' + path.join(dir, shot.url);
  const out = path.join(OUT, shot.name);
  const flags = [
    '--headless', '--no-sandbox', '--disable-gpu', '--allow-file-access-from-files',
    '--window-size=' + shot.size, '--force-device-scale-factor=2',
    '--virtual-time-budget=15000'
  ];
  if (shot.mode === 'dark') flags.push('--force-dark-mode');
  flags.push('--screenshot=' + out, url);
  execFileSync(chromeBin, flags, { stdio: 'ignore', timeout: 60000 });
  // Chromium can exit 0 having written no file at all -- observed once in a
  // 24-shot run. Because stdio is ignored, the only symptom was a success line
  // for an image that did not exist, which is exactly the kind of thing that
  // ends up published as a broken README image.
  if (!fs.existsSync(out)) {
    throw new Error('chromium reported success but wrote no file: ' + shot.name);
  }
  console.log('  . ' + shot.name);
}

console.log('\n' + SHOTS.length + ' screenshots generated in ' + path.relative(ROOT, OUT) + path.sep);
