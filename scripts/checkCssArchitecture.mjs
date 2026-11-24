import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const CSS_LAYER_ORDER = Object.freeze([
  'tokens',
  'base',
  'layout',
  'components',
  'pages',
  'utilities',
  'overrides'
]);

export const CSS_LINE_BUDGETS = Object.freeze({
  'style.css': 5260,
  'src/styles/oneline.css': 4394,
  'src/styles/panel-schedule.css': 3991,
  // Raised from 260 for the theme-following alias table that replaced 63
  // undefined custom properties (application review U1, 2026-11-23).
  'src/styles/tokens.css': 315
});

const REQUIRED_TOKENS = [
  '--control-height',
  '--control-radius',
  '--panel-padding',
  '--motion-fast',
  '--motion-standard',
  '--focus-ring'
];

// Custom properties that only ever receive a value from JavaScript (inline
// `style="--x: …"` templates or `style.setProperty('--x', …)`), so no
// stylesheet defines them. Every other `var(--x)` must resolve to a
// declaration in the scanned CSS/HTML; theme-sensitive names belong in
// src/styles/tokens.css. Remove an entry when its writer is removed.
export const JS_SET_CUSTOM_PROPERTIES = Object.freeze({
  '--bar-pct': 'src/cableThermalEnvironment.js result bar width',
  '--component-color': 'heattracesizing.js component chip accent',
  '--component-fill': 'heattracesizing.js component chip fill',
  '--corrosion-pit-opacity': 'dissimilarmetals.js pitting visual',
  '--corrosion-progress': 'dissimilarmetals.js corrosion progress bar',
  '--haz-row-accent': 'hazareaclassification.js row classification accent',
  '--panel-bus-span': 'src/panelSchedule.js bus geometry',
  '--panel-device-pole-count': 'src/panelSchedule.js device geometry',
  '--panel-device-row-count': 'src/panelSchedule.js device geometry',
  '--panel-rail-count': 'src/panelSchedule.js rail geometry',
  '--route-comparison-width': 'app.mjs route comparison bar width',
  '--section-pct': 'spoolsheets.js section progress width',
  '--sticky-left': 'tableUtils.mjs sticky column offset',
  '--studies-width': 'src/one-line/eventBindingController.mjs studies panel resize'
});

// Names whose consumers need incompatible colours, so no single token alias is
// safe. Each stays on its per-use fallback until the consumers are split.
export const CONFLICTING_CUSTOM_PROPERTIES = Object.freeze({
  // copilot.css paints amber under #000 text; scenarioComparison.css paints
  // blue under #fff text. Give copilot its own token, then alias this one to
  // --color-primary in tokens.css.
  '--color-accent': 'copilot.css amber vs scenarioComparison.css/dashboard.css blue'
});

export const CUSTOM_PROPERTY_ALLOWLIST = Object.freeze({
  ...JS_SET_CUSTOM_PROPERTIES,
  ...CONFLICTING_CUSTOM_PROPERTIES
});

export function countCssLines(source) {
  const normalized = String(source || '').trimEnd();
  return normalized ? normalized.split(/\r?\n/).length : 0;
}

function stripCssComments(source) {
  return String(source || '').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

// Returns the CSS that a root HTML page carries: <style> blocks and inline
// style attributes (both can define and consume custom properties).
export function extractHtmlCss(html) {
  const source = String(html || '').replace(/<!--[\s\S]*?-->/g, ' ');
  const blocks = [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1]);
  const inline = [...source.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)]
    .map(match => `{${match[1] ?? match[2]}}`);
  return [...blocks, ...inline].join('\n');
}

// Collects custom property declarations and var() references from
// [{ file, css }] entries. Nested fallbacks such as var(--a, var(--b)) count
// as references to both names.
export function collectCustomProperties(entries) {
  const defined = new Set();
  const used = new Map();
  entries.forEach(({ file, css }) => {
    const source = stripCssComments(css);
    for (const match of source.matchAll(/(?<![\w-])(--[\w-]+)\s*:/g)) defined.add(match[1]);
    for (const match of source.matchAll(/@property\s+(--[\w-]+)/g)) defined.add(match[1]);
    for (const match of source.matchAll(/var\(\s*(--[\w-]+)/g)) {
      const files = used.get(match[1]) || new Set();
      files.add(file);
      used.set(match[1], files);
    }
  });
  return { defined, used };
}

export async function readCustomPropertySources(baseDir = root) {
  const entries = [{ file: 'style.css', css: await fs.readFile(path.join(baseDir, 'style.css'), 'utf8') }];
  const styleDir = path.join(baseDir, 'src/styles');
  for (const name of (await fs.readdir(styleDir)).filter(entry => entry.endsWith('.css')).sort()) {
    entries.push({ file: `src/styles/${name}`, css: await fs.readFile(path.join(styleDir, name), 'utf8') });
  }
  for (const name of (await fs.readdir(baseDir)).filter(entry => entry.endsWith('.html')).sort()) {
    entries.push({ file: name, css: extractHtmlCss(await fs.readFile(path.join(baseDir, name), 'utf8')) });
  }
  return entries;
}

// Lists var(--x) references that no scanned stylesheet defines. Undefined
// names silently fall back to hard-coded light colours, which is how dark mode
// painted light panels under light text (application review U1).
export async function findUndefinedCustomProperties(baseDir = root, allowlist = CUSTOM_PROPERTY_ALLOWLIST) {
  const { defined, used } = collectCustomProperties(await readCustomPropertySources(baseDir));
  const undefinedProperties = [...used.entries()]
    .filter(([name]) => !defined.has(name) && !Object.hasOwn(allowlist, name))
    .map(([name, files]) => ({ name, files: [...files].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const staleAllowlist = Object.keys(allowlist).filter(name => !used.has(name) || defined.has(name)).sort();
  return { undefinedProperties, staleAllowlist };
}

export async function inspectCssArchitecture(baseDir = root, { customPropertyAllowlist = CUSTOM_PROPERTY_ALLOWLIST } = {}) {
  const failures = [];
  const measurements = {};
  const styleSource = await fs.readFile(path.join(baseDir, 'style.css'), 'utf8');
  const layerDeclaration = `@layer ${CSS_LAYER_ORDER.join(', ')};`;
  if (!styleSource.includes(layerDeclaration)) failures.push('style.css: canonical layer order is missing');

  const localImports = [...styleSource.matchAll(/@import\s+["'](\.\/src\/styles\/[^"']+)["']([^;]*);/g)];
  if (!localImports.length) failures.push('style.css: no local style modules were found');
  localImports.forEach(([, specifier, suffix]) => {
    if (!/\blayer\([a-z-]+\)/.test(suffix)) {
      failures.push(`style.css: ${specifier} must declare an import layer`);
    }
  });
  const lastImportEnd = Math.max(...[...styleSource.matchAll(/@import\s+[^;]+;/g)].map(match => match.index + match[0].length));
  if (styleSource.indexOf(layerDeclaration) < lastImportEnd) {
    failures.push('style.css: canonical layer declaration must follow every @import so browsers load all modules');
  }
  if (!/@layer\s+pages\s*\{/.test(styleSource)) {
    failures.push('style.css: remaining page-specific rules must be enclosed in @layer pages');
  }

  const tokensSource = await fs.readFile(path.join(baseDir, 'src/styles/tokens.css'), 'utf8');
  REQUIRED_TOKENS.forEach(token => {
    if (!tokensSource.includes(`${token}:`)) failures.push(`src/styles/tokens.css: missing ${token}`);
  });

  for (const [relativePath, budget] of Object.entries(CSS_LINE_BUDGETS)) {
    const source = relativePath === 'style.css'
      ? styleSource
      : await fs.readFile(path.join(baseDir, relativePath), 'utf8');
    const lines = countCssLines(source);
    measurements[relativePath] = { lines, budget };
    if (lines > budget) failures.push(`${relativePath}: ${lines} lines exceeds the ${budget}-line budget`);
  }

  const { undefinedProperties, staleAllowlist } = await findUndefinedCustomProperties(baseDir, customPropertyAllowlist);
  undefinedProperties.forEach(({ name, files }) => {
    failures.push(`${files.join(', ')}: var(${name}) has no definition; alias it in src/styles/tokens.css`);
  });
  staleAllowlist.forEach(name => {
    failures.push(`scripts/checkCssArchitecture.mjs: ${name} is allowlisted as JS-set but is unused or now defined in CSS`);
  });
  return {
    failures,
    measurements,
    localImportCount: localImports.length,
    undefinedCustomPropertyCount: undefinedProperties.length
  };
}

async function main() {
  const result = await inspectCssArchitecture();
  Object.entries(result.measurements).forEach(([relativePath, { lines, budget }]) => {
    console.log(`[css-architecture] ${relativePath}: ${lines}/${budget} lines`);
  });
  console.log(`[css-architecture] ${result.localImportCount} layered style modules`);
  if (result.failures.length) {
    result.failures.forEach(failure => console.error(`[css-architecture] ${failure}`));
    process.exitCode = 1;
    return;
  }
  console.log('[css-architecture] Layer, token, custom property, and stylesheet budgets pass.');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
