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
  'src/styles/tokens.css': 260
});

const REQUIRED_TOKENS = [
  '--control-height',
  '--control-radius',
  '--panel-padding',
  '--motion-fast',
  '--motion-standard',
  '--focus-ring'
];

export function countCssLines(source) {
  const normalized = String(source || '').trimEnd();
  return normalized ? normalized.split(/\r?\n/).length : 0;
}

export async function inspectCssArchitecture(baseDir = root) {
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
  return { failures, measurements, localImportCount: localImports.length };
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
  console.log('[css-architecture] Layer, token, and stylesheet budgets pass.');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
