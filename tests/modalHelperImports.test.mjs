/**
 * Every browser module that calls showModal() / showAlertModal() must import
 * or define it. A missing import only fails when the dialog is opened (for
 * example on invalid input), so it is invisible to page-load checks.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'tests', '.git', 'playwright-tests', 'scripts', 'artifacts']);
// Modules that receive the helper as an injected dependency.
const INJECTED = new Set(['src/one-line/studyExecutionController.mjs', 'analysis/tcc/componentBrowserModal.mjs']);
const HELPERS = ['showModal', 'showAlertModal'];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (/\.(?:js|mjs)$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function isDeclared(source, name) {
  const scrubbed = source.replace(new RegExp(`(?<!function\\s)\\b${name}\\(`, 'g'), 'X(');
  const importRe = new RegExp(`import\\s*(?:[\\w$]+\\s*,\\s*)?\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`);
  const declRe = new RegExp(`function\\s+${name}\\b|(?:const|let|var)\\s+${name}\\b|\\b${name}\\s*[:=,}]`);
  return importRe.test(source) || declRe.test(scrubbed);
}

const missing = [];
for (const file of walk(root)) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  if (INJECTED.has(rel)) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const name of HELPERS) {
    if (new RegExp(`\\b${name}\\(`).test(source) && !isDeclared(source, name)) {
      missing.push(`${rel}: ${name}`);
    }
  }
}

assert.deepStrictEqual(missing, [], `Modal helpers used without an import:\n${missing.join('\n')}`);
console.log('modalHelperImports tests passed');
