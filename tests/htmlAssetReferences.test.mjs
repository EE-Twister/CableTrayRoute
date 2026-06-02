import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectHtmlAssetReferenceIssues,
  logicalAssetUrl,
  normalizeHtmlAssetReferences
} from '../scripts/auditHtmlAssetReferences.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name, err.message || err);
    process.exitCode = 1;
  }
}

describe('HTML asset reference audit', () => {
  it('maps fingerprinted dist assets back to logical source references', () => {
    assert.equal(logicalAssetUrl('dist/style.aaaaaaaaaaaa.css'), 'style.css');
    assert.equal(logicalAssetUrl('dist/style.css'), 'style.css');
    assert.equal(logicalAssetUrl('./dist/scenarios.bbbbbbbbbbbb.js?debug=1'), './dist/scenarios.js?debug=1');
    assert.equal(logicalAssetUrl('dist/vendor/handlebars.min.dddddddddddd.js'), 'dist/vendor/handlebars.min.js');
  });

  it('leaves logical, external, and non-dist references unchanged', () => {
    assert.equal(logicalAssetUrl('dist/scenarios.js'), 'dist/scenarios.js');
    assert.equal(logicalAssetUrl('dirtyTracker.js'), 'dirtyTracker.js');
    assert.equal(logicalAssetUrl('https://cdn.example.com/app.aaaaaaaaaaaa.js'), 'https://cdn.example.com/app.aaaaaaaaaaaa.js');
    assert.equal(logicalAssetUrl('#main-content'), '#main-content');
  });

  it('normalizes multiple HTML attributes in one pass', () => {
    const input = [
      '<link rel="stylesheet" href="dist/style.aaaaaaaaaaaa.css">',
      '<script type="module" src="dist/samplegallery.bbbbbbbbbbbb.js" defer></script>',
      '<script src="dirtyTracker.js"></script>'
    ].join('\n');
    const { content, changed } = normalizeHtmlAssetReferences(input);
    assert.equal(changed, true);
    assert.ok(content.includes('href="style.css"'), content);
    assert.ok(content.includes('src="dist/samplegallery.js"'), content);
    assert.ok(content.includes('src="dirtyTracker.js"'), content);
  });

  it('keeps root HTML source free of generated fingerprint references', () => {
    const issues = collectHtmlAssetReferenceIssues({ root: ROOT });
    assert.deepEqual(issues, []);
  });

  it('exposes a package script for local checks', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['check:html-assets'], 'node scripts/auditHtmlAssetReferences.mjs');
  });
});
