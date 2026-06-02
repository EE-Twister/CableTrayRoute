/**
 * rewriteHtmlForManifest.cjs
 *
 * Build-time step that rewrites <link href="..."> and <script src="..."> URLs
 * in repository HTML files so they point to the fingerprinted asset names
 * recorded in dist/asset-manifest.json. This makes the fingerprint manifest
 * — already produced by scripts/copyAssets.cjs — actually drive cache
 * invalidation, instead of relying on hand-edited "?v=…" query strings or
 * "{{COMMIT_SHA}}" template placeholders.
 *
 * Run: node scripts/rewriteHtmlForManifest.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const MANIFEST_FILE = path.join(DIST, 'asset-manifest.json');

const FINGERPRINT_RE = /\.[0-9a-f]{8,}(\.[A-Za-z0-9]+)$/;
const ATTR_RE = /\b(src|href)\s*=\s*(['"])([^'"]+)\2/gi;
const ROOT_SCOPED_ASSETS = new Set(['style.css']);

function loadManifest() {
  if (!fs.existsSync(MANIFEST_FILE)) {
    console.warn(`[rewrite-html] ${MANIFEST_FILE} not found; skipping rewrite.`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  } catch (err) {
    console.warn(`[rewrite-html] failed to parse manifest: ${err.message}`);
    return null;
  }
}

function listHtmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.html'))
    .map(entry => path.join(dir, entry.name));
}

function stripFingerprintFromBasename(basename) {
  return basename.replace(FINGERPRINT_RE, '$1');
}

function dropVersionParam(query) {
  if (!query) return '';
  const params = query.replace(/^\?/, '').split('&').filter(part => part && !/^v=/i.test(part));
  return params.length ? `?${params.join('&')}` : '';
}

function rewriteUrl(rawUrl, manifest) {
  if (!rawUrl) return rawUrl;
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(rawUrl)) return rawUrl;
  if (/^(?:data|mailto|javascript|tel):/i.test(rawUrl)) return rawUrl;
  if (rawUrl.startsWith('#')) return rawUrl;

  const hashIdx = rawUrl.indexOf('#');
  const tailHash = hashIdx >= 0 ? rawUrl.slice(hashIdx) : '';
  const noHash = hashIdx >= 0 ? rawUrl.slice(0, hashIdx) : rawUrl;
  const qIdx = noHash.indexOf('?');
  const pathOnly = qIdx >= 0 ? noHash.slice(0, qIdx) : noHash;
  const query = qIdx >= 0 ? noHash.slice(qIdx) : '';

  const leadingDot = pathOnly.startsWith('./') ? './' : '';
  let workPath = pathOnly.slice(leadingDot.length);

  let distPrefix = '';
  if (workPath.startsWith('dist/')) {
    distPrefix = 'dist/';
    workPath = workPath.slice(5);
  }

  const lastSlash = workPath.lastIndexOf('/');
  const dir = lastSlash >= 0 ? workPath.slice(0, lastSlash + 1) : '';
  const base = lastSlash >= 0 ? workPath.slice(lastSlash + 1) : workPath;
  const logicalKey = dir + stripFingerprintFromBasename(base);

  if (!distPrefix && ROOT_SCOPED_ASSETS.has(logicalKey)) {
    return logicalKey + dropVersionParam(query) + tailHash;
  }

  if (!Object.prototype.hasOwnProperty.call(manifest, logicalKey)) {
    return rawUrl;
  }

  // The manifest lives at dist/, so any HTML reference that did not already
  // include a "dist/" prefix needs one to reach the fingerprinted file.
  const outPrefix = leadingDot + (distPrefix || 'dist/');
  return outPrefix + dir + manifest[logicalKey] + dropVersionParam(query) + tailHash;
}

function rewriteHtml(content, manifest) {
  let changed = false;
  const next = content.replace(ATTR_RE, (match, attr, quote, value) => {
    const updated = rewriteUrl(value, manifest);
    if (updated === value) return match;
    changed = true;
    return `${attr}=${quote}${updated}${quote}`;
  });
  return { content: next, changed };
}

function main() {
  const manifest = loadManifest();
  if (!manifest) return;

  const htmlFiles = listHtmlFiles(ROOT);
  let touched = 0;
  for (const file of htmlFiles) {
    const original = fs.readFileSync(file, 'utf8');
    const { content, changed } = rewriteHtml(original, manifest);
    if (!changed) continue;
    fs.writeFileSync(file, content);
    touched += 1;
    console.log(`[rewrite-html] updated ${path.relative(ROOT, file)}`);
  }
  console.log(`[rewrite-html] ${touched} of ${htmlFiles.length} HTML files updated`);
}

if (require.main === module) {
  main();
}

module.exports = { rewriteUrl, rewriteHtml };
