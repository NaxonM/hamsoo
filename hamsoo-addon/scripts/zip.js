'use strict';
/**
 * Cross-platform extension packager using Python zipfile module
 * to guarantee POSIX forward slashes (/) in ZIP entry paths for Mozilla AMO & Chrome Web Store.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { build } = require('../build.js');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const MAKE_ZIP_PY = path.join(ROOT, 'scripts', 'make_zip.py');

build();

const targets = ['hamsoo-chromium', 'hamsoo-firefox'];

for (const target of targets) {
  const dir = path.join(DIST, target);
  const zipPath = path.join(DIST, `${target}.zip`);

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  try {
    execSync(`python "${MAKE_ZIP_PY}" "${dir}" "${zipPath}"`, { stdio: 'inherit' });
  } catch (e) {
    if (process.platform === 'win32') {
      const psCmd = `Compress-Archive -Path "${dir}\\*" -DestinationPath "${zipPath}" -Force`;
      execSync(`powershell -Command "${psCmd}"`, { stdio: 'inherit' });
    } else {
      execSync(`cd "${DIST}" && zip -rq "${target}.zip" "${target}"`, { stdio: 'inherit' });
    }
  }
  console.log(`created ${target}.zip`);
}
