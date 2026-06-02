'use strict';

const assert = require('assert');
const path = require('path');

const { rewriteUrl, rewriteHtml } = require(path.join(__dirname, '..', 'scripts', 'rewriteHtmlForManifest.cjs'));

const manifest = {
  'style.css': 'style.aaaaaaaaaaaa.css',
  'scenarios.js': 'scenarios.bbbbbbbbbbbb.js',
  'oneline.js': 'oneline.cccccccccccc.js',
  'vendor/handlebars.min.js': 'handlebars.min.dddddddddddd.js',
};

function it(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name, err.message || err);
    process.exitCode = 1;
  }
}

console.log('rewriteHtmlForManifest — rewriteUrl');

it('leaves absolute URLs alone', () => {
  assert.strictEqual(rewriteUrl('https://cdn.example.com/lib.js', manifest), 'https://cdn.example.com/lib.js');
  assert.strictEqual(rewriteUrl('//cdn.example.com/lib.js', manifest), '//cdn.example.com/lib.js');
});

it('leaves data: and anchor URLs alone', () => {
  assert.strictEqual(rewriteUrl('data:text/plain,hi', manifest), 'data:text/plain,hi');
  assert.strictEqual(rewriteUrl('#main', manifest), '#main');
});

it('returns the original URL when no manifest entry matches', () => {
  assert.strictEqual(rewriteUrl('./dataStore.mjs', manifest), './dataStore.mjs');
  assert.strictEqual(rewriteUrl('cdnFallback.js', manifest), 'cdnFallback.js');
});

it('leaves root-scoped CSS at the root so its imports resolve', () => {
  assert.strictEqual(
    rewriteUrl('style.css?v=one-line-datablock-contrast-v1', manifest),
    'style.css'
  );
});

it('rewrites a bare root script asset to its fingerprinted dist path', () => {
  assert.strictEqual(
    rewriteUrl('oneline.js?v=abc', manifest),
    'dist/oneline.cccccccccccc.js'
  );
});

it('rewrites a dist-prefixed asset to its fingerprinted version', () => {
  assert.strictEqual(
    rewriteUrl('./dist/scenarios.js', manifest),
    './dist/scenarios.bbbbbbbbbbbb.js'
  );
  assert.strictEqual(
    rewriteUrl('dist/scenarios.js', manifest),
    'dist/scenarios.bbbbbbbbbbbb.js'
  );
});

it('rewrites a vendor asset, preserving the vendor/ subdirectory', () => {
  assert.strictEqual(
    rewriteUrl('dist/vendor/handlebars.min.js', manifest),
    'dist/vendor/handlebars.min.dddddddddddd.js'
  );
});

it('re-applies the current fingerprint when the URL already carries an old hash', () => {
  assert.strictEqual(
    rewriteUrl('dist/scenarios.deadbeefcafe.js', manifest),
    'dist/scenarios.bbbbbbbbbbbb.js'
  );
});

it('drops only ?v= cache-busters, preserving other query parameters', () => {
  assert.strictEqual(
    rewriteUrl('dist/scenarios.js?v=abc&debug=1', manifest),
    'dist/scenarios.bbbbbbbbbbbb.js?debug=1'
  );
});

console.log('rewriteHtmlForManifest — rewriteHtml');

it('rewrites multiple <link> and <script> attributes in one pass', () => {
  const input = [
    '<link rel="stylesheet" href="style.css?v=one-line-datablock-contrast-v1">',
    '<script src="dist/vendor/handlebars.min.js"></script>',
    '<script type="module" src="./oneline.js"></script>',
    '<script type="module" src="./dataStore.mjs"></script>',
  ].join('\n');
  const { content, changed } = rewriteHtml(input, manifest);
  assert.strictEqual(changed, true);
  assert.ok(content.includes('href="style.css"'), content);
  assert.ok(content.includes('src="dist/vendor/handlebars.min.dddddddddddd.js"'), content);
  assert.ok(content.includes('src="./dist/oneline.cccccccccccc.js"'), content);
  // Bare root asset with no manifest entry is left alone.
  assert.ok(content.includes('src="./dataStore.mjs"'), content);
});

it('reports no change when HTML already uses current fingerprints', () => {
  const input = '<script type="module" src="dist/oneline.cccccccccccc.js"></script>';
  const { changed } = rewriteHtml(input, manifest);
  assert.strictEqual(changed, false);
});
