import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import {
  CSS_LAYER_ORDER,
  CSS_LINE_BUDGETS,
  JS_SET_CUSTOM_PROPERTIES,
  collectCustomProperties,
  countCssLines,
  extractHtmlCss,
  findUndefinedCustomProperties,
  inspectCssArchitecture
} from '../scripts/checkCssArchitecture.mjs';

const fixtureDirs = [];

// Smallest tree that satisfies every inspectCssArchitecture rule, so a test can
// add one defect and see exactly that failure.
async function createFixture({ componentCss = '', pageHtml = '' } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'css-architecture-'));
  fixtureDirs.push(dir);
  await fs.mkdir(path.join(dir, 'src/styles'), { recursive: true });
  await fs.writeFile(path.join(dir, 'style.css'), [
    '@import "./src/styles/tokens.css" layer(tokens);',
    '@import "./src/styles/components.css" layer(components);',
    `@layer ${CSS_LAYER_ORDER.join(', ')};`,
    '@layer pages {',
    '.page { color: var(--color-text); }',
    '}'
  ].join('\n'));
  await fs.writeFile(path.join(dir, 'src/styles/tokens.css'), [
    ':root {',
    '  --color-text: #0f172a;',
    '  --control-height: 2.5rem;',
    '  --control-radius: 6px;',
    '  --panel-padding: 1rem;',
    '  --motion-fast: 100ms;',
    '  --motion-standard: 150ms;',
    '  --focus-ring: 0 0 0 3px blue;',
    '}'
  ].join('\n'));
  await fs.writeFile(path.join(dir, 'src/styles/components.css'), componentCss);
  await fs.writeFile(path.join(dir, 'src/styles/oneline.css'), '.oneline {}\n');
  await fs.writeFile(path.join(dir, 'src/styles/panel-schedule.css'), '.panel {}\n');
  if (pageHtml) await fs.writeFile(path.join(dir, 'page.html'), pageHtml);
  return dir;
}

after(async () => {
  await Promise.all(fixtureDirs.map(dir => fs.rm(dir, { recursive: true, force: true })));
});

describe('CSS architecture', () => {
  it('enforces ordered layers, shared tokens, and ratcheted stylesheet budgets', async () => {
    const result = await inspectCssArchitecture();
    assert.deepEqual(result.failures, []);
    assert.ok(result.localImportCount >= 25);
    Object.entries(CSS_LINE_BUDGETS).forEach(([relativePath, budget]) => {
      assert.ok(result.measurements[relativePath].lines <= budget);
    });
  });

  it('keeps cascade layers ordered from foundations to overrides', () => {
    assert.deepEqual(CSS_LAYER_ORDER, [
      'tokens',
      'base',
      'layout',
      'components',
      'pages',
      'utilities',
      'overrides'
    ]);
    assert.equal(countCssLines('one\ntwo\n'), 2);
  });
});

describe('CSS custom property definitions', () => {
  it('counts nested fallbacks as references and ignores commented-out code', () => {
    const { defined, used } = collectCustomProperties([{
      file: 'a.css',
      css: [
        '/* .old { color: var(--commented-out); } */',
        ':root { --surface: #fff; }',
        '@property --angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }',
        '.card { background: var(--surface-2, var(--surface, #fff)); }'
      ].join('\n')
    }]);
    assert.ok(defined.has('--surface'));
    assert.ok(defined.has('--angle'));
    assert.deepEqual([...used.keys()].sort(), ['--surface', '--surface-2']);
  });

  it('reads <style> blocks and inline style attributes but not HTML comments', () => {
    const css = extractHtmlCss([
      '<!-- <style>.x { color: var(--hidden); }</style> -->',
      '<style>.y { color: var(--from-block); }</style>',
      '<div style="--inline-def: 1px; margin: var(--from-attr)"></div>'
    ].join('\n'));
    const { defined, used } = collectCustomProperties([{ file: 'page.html', css }]);
    assert.ok(defined.has('--inline-def'));
    assert.deepEqual([...used.keys()].sort(), ['--from-attr', '--from-block']);
  });

  it('reports undefined names, accepts allowlisted JS-set names, and flags stale allowlist entries', async () => {
    const dir = await createFixture({
      componentCss: '.a { color: var(--missing, #fff); width: var(--js-width); }',
      pageHtml: '<style>.b { background: var(--color-text); }</style>'
    });
    const result = await findUndefinedCustomProperties(dir, {
      '--js-width': 'set from JS',
      '--no-longer-used': 'set from JS'
    });
    assert.deepEqual(result.undefinedProperties, [{ name: '--missing', files: ['src/styles/components.css'] }]);
    assert.deepEqual(result.staleAllowlist, ['--no-longer-used']);
  });

  it('fails the architecture check on any var() without a definition', async () => {
    const options = { customPropertyAllowlist: {} };
    const clean = await createFixture({ componentCss: '.a { color: var(--color-text); }' });
    assert.deepEqual((await inspectCssArchitecture(clean, options)).failures, []);

    const broken = await createFixture({ pageHtml: '<p style="background: var(--surface-subtle, #f4f7fb)">x</p>' });
    const { failures, undefinedCustomPropertyCount } = await inspectCssArchitecture(broken, options);
    assert.equal(undefinedCustomPropertyCount, 1);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /^page\.html: var\(--surface-subtle\) has no definition/);
  });

  it('documents every JS-set allowlist entry with its writer', () => {
    Object.entries(JS_SET_CUSTOM_PROPERTIES).forEach(([name, writer]) => {
      assert.match(name, /^--[\w-]+$/);
      assert.ok(writer.length > 0);
    });
  });
});
