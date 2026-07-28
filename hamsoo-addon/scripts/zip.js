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

// Resolve an interpreter once, preferring python3.
function resolvePython() {
  for (const bin of ['python3', 'python']) {
    try {
      execSync(`${bin} -c "import zipfile"`, { stdio: 'ignore' });
      return bin;
    } catch (_) { /* try the next candidate */ }
  }
  return null;
}

const PYTHON_BIN = resolvePython();

function runPython(bin, script, dir, zipPath) {
  if (!bin) throw new Error('no python interpreter with zipfile available');
  execSync(`${bin} "${script}" "${dir}" "${zipPath}"`, { stdio: 'inherit' });
}

build();

const targets = ['hamsoo-chromium', 'hamsoo-firefox'];

for (const target of targets) {
  const dir = path.join(DIST, target);
  const zipPath = path.join(DIST, `${target}.zip`);

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  try {
    // `python` is not a valid command on most modern Linux distros and on
    // macOS since the Python 2 removal -- only `python3` exists. The bare name
    // threw ENOENT, silently dropping every build into the fallback path
    // below, which is exactly the platform-dependent zip layout make_zip.py
    // was written to avoid. Try python3 first and fall back to python.
    runPython(PYTHON_BIN, MAKE_ZIP_PY, dir, zipPath);
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
