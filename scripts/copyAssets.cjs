const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const docs = path.join(root, 'docs');
const FINGERPRINT_REGEX = /\.[0-9a-f]{8,}\.[^.]+$/;

function copy(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}

function fileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}

function fingerprintName(filePath, hash) {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}.${hash}${parsed.ext}`);
}

function removePriorFingerprints(filePath) {
  const parsed = path.parse(filePath);
  const siblingEntries = fs.readdirSync(parsed.dir, { withFileTypes: true });
  const escapedName = parsed.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(`^${escapedName}\\.[0-9a-f]{8,}${parsed.ext.replace('.', '\\.')}$`);
  siblingEntries.forEach(entry => {
    if (!entry.isFile()) return;
    if (matcher.test(entry.name)) {
      fs.rmSync(path.join(parsed.dir, entry.name), { force: true });
    }
  });
}

function createFingerprints(rootDir, files) {
  const manifest = {};
  files.forEach(relPath => {
    const absolute = path.join(rootDir, relPath);
    if (!fs.existsSync(absolute)) return;
    const normalized = relPath.replace(/\\/g, '/');
    const parsed = path.parse(absolute);
    if (FINGERPRINT_REGEX.test(`${parsed.base}`)) return;

    const hash = fileHash(absolute);
    removePriorFingerprints(absolute);
    const fingerprintedPath = fingerprintName(absolute, hash);
    fs.copyFileSync(absolute, fingerprintedPath);
    manifest[normalized] = path.basename(fingerprintedPath);
  });
  return manifest;
}

function listFingerprintCandidates(baseDir) {
  if (!fs.existsSync(baseDir)) return [];
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  return entries
    .filter(entry => {
      if (!entry.isFile()) return false;
      if (FINGERPRINT_REGEX.test(entry.name)) return false;
      return ['.js', '.mjs', '.css'].includes(path.extname(entry.name));
    })
    .map(entry => entry.name);
}

copy(path.join(root, 'icons'), path.join(dist, 'icons'));
copy(path.join(root, 'data'), path.join(dist, 'data'));
copy(path.join(root, 'samples'), path.join(dist, 'samples'));
copy(path.join(root, 'examples', 'sample_oneline.json'), path.join(dist, 'examples', 'sample_oneline.json'));
copy(path.join(root, 'icons'), path.join(docs, 'icons'));
copy(path.join(root, 'samples'), path.join(docs, 'samples'));
copy(path.join(root, 'reports', 'templates'), path.join(dist, 'templates'));
copy(path.join(root, 'reports', 'templates'), path.join(docs, 'templates'));
copy(path.join(dist, 'vendor'), path.join(docs, 'dist', 'vendor'));
['componentLibrary.json', 'manufacturerLibrary.json'].forEach(file => {
  const src = path.join(root, file);
  fs.copyFileSync(src, path.join(dist, file));
  fs.copyFileSync(src, path.join(docs, file));
});

copy(path.join(root, 'examples', 'sample_oneline.json'), path.join(docs, 'examples', 'sample_oneline.json'));

['style.css'].forEach(file => {
  const src = path.join(root, file);
  if (!fs.existsSync(src)) return;
  fs.copyFileSync(src, path.join(dist, file));
  fs.copyFileSync(src, path.join(docs, file));
});

const distRootCandidates = listFingerprintCandidates(dist);
const distVendorCandidates = listFingerprintCandidates(path.join(dist, 'vendor')).map(name => path.posix.join('vendor', name));
const distManifest = createFingerprints(dist, [...distRootCandidates, ...distVendorCandidates]);
fs.writeFileSync(path.join(dist, 'asset-manifest.json'), `${JSON.stringify(distManifest, null, 2)}\n`);

const docsDistCandidates = listFingerprintCandidates(path.join(docs, 'dist')).map(name => path.posix.join('dist', name));
const docsVendorCandidates = listFingerprintCandidates(path.join(docs, 'dist', 'vendor')).map(name => path.posix.join('dist', 'vendor', name));
const docsRootCandidates = listFingerprintCandidates(docs);
const docsManifest = createFingerprints(docs, [...docsRootCandidates, ...docsDistCandidates, ...docsVendorCandidates]);
fs.writeFileSync(path.join(docs, 'asset-manifest.json'), `${JSON.stringify(docsManifest, null, 2)}\n`);
