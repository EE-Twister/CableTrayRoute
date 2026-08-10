import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs']);
const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.playwright-mcp',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'playwright-tests',
  'scripts',
  'test-results',
  'tests',
  'vendor'
]);

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

export function extractLocalModuleSpecifiers(source) {
  const specifiers = new Set();
  for (const match of source.matchAll(/^\s*import\s+(?!\()([\s\S]*?);/gm)) {
    const clause = match[1];
    const specifier = clause.match(/\sfrom\s*['"]([^'"]+)['"]/)?.[1]
      || clause.match(/^['"]([^'"]+)['"]/)?.[1];
    if (specifier?.startsWith('.')) specifiers.add(specifier);
  }
  for (const match of source.matchAll(/^\s*export\s+(?:\*|\{)[\s\S]*?\sfrom\s*['"]([^'"]+)['"]/gm)) {
    if (match[1].startsWith('.')) specifiers.add(match[1]);
  }
  const sourceWithoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of sourceWithoutBlockComments.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (match[1].startsWith('.')) specifiers.add(match[1]);
  }
  return [...specifiers];
}

async function collectSourceFiles(baseDir) {
  const files = [];
  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) await walk(path.join(directory, entry.name));
        continue;
      }
      if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(path.join(directory, entry.name));
    }
  }
  await walk(baseDir);
  return files;
}

function resolveSpecifier(importer, specifier, knownFiles) {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
  const unresolved = path.resolve(path.dirname(importer), cleanSpecifier);
  const candidates = path.extname(unresolved)
    ? [unresolved]
    : [unresolved, `${unresolved}.js`, `${unresolved}.mjs`, path.join(unresolved, 'index.js'), path.join(unresolved, 'index.mjs')];
  return candidates.find(candidate => knownFiles.has(path.normalize(candidate))) || null;
}

function canonicalCycle(cycle) {
  const nodes = cycle.slice(0, -1);
  const rotations = nodes.map((_, index) => [...nodes.slice(index), ...nodes.slice(0, index)]);
  rotations.sort((left, right) => left.join('\0').localeCompare(right.join('\0')));
  return [...rotations[0], rotations[0][0]];
}

export async function inspectModuleCycles(baseDir = root) {
  const files = await collectSourceFiles(baseDir);
  const knownFiles = new Set(files.map(file => path.normalize(file)));
  const graph = new Map();
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    const dependencies = extractLocalModuleSpecifiers(source)
      .map(specifier => resolveSpecifier(file, specifier, knownFiles))
      .filter(Boolean);
    graph.set(path.normalize(file), [...new Set(dependencies)]);
  }

  const state = new Map();
  const stack = [];
  const cycles = new Map();
  function visit(file) {
    state.set(file, 'visiting');
    stack.push(file);
    for (const dependency of graph.get(file) || []) {
      if (state.get(dependency) === 'visiting') {
        const start = stack.indexOf(dependency);
        const relativeCycle = [...stack.slice(start), dependency]
          .map(item => normalizePath(path.relative(baseDir, item)));
        const canonical = canonicalCycle(relativeCycle);
        cycles.set(canonical.join(' -> '), canonical);
      } else if (!state.has(dependency)) {
        visit(dependency);
      }
    }
    stack.pop();
    state.set(file, 'visited');
  }

  [...graph.keys()].sort().forEach(file => {
    if (!state.has(file)) visit(file);
  });
  return { cycles: [...cycles.values()], filesInspected: files.length };
}

async function main() {
  const result = await inspectModuleCycles();
  if (result.cycles.length) {
    result.cycles.forEach(cycle => console.error(`[architecture] circular dependency: ${cycle.join(' -> ')}`));
    process.exitCode = 1;
    return;
  }
  console.log(`[architecture] ${result.filesInspected} production modules inspected; no circular dependencies.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(`[architecture] cycle inspection failed: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}
