// scripts/postbuild.cjs - copy manifest entry to client-entry.js
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const manifestPath = path.join(dist, '.vite', 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.error('[postbuild] manifest.json not found');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entry = manifest['client-entry.tsx'];

if (!entry || !entry.file) {
  console.error('[postbuild] client-entry.tsx not found in manifest');
  console.error('Available keys:', Object.keys(manifest));
  process.exit(1);
}

const srcFile = path.join(dist, entry.file);
const targetFile = path.join(dist, 'client-entry.js');

fs.copyFileSync(srcFile, targetFile);
console.log(`[postbuild] copied ${entry.file} -> client-entry.js`);