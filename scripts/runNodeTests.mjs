import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_TEST_ROOTS = ['tests', 'analysis'];
const NODE_TEST_FILE_RE = /\.(?:test|spec)\.(?:mjs|cjs|js)$/;

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function walkTestFiles(absDir, cwd, files) {
  if (!fs.existsSync(absDir)) return;

  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const absPath = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      walkTestFiles(absPath, cwd, files);
    } else if (NODE_TEST_FILE_RE.test(entry.name)) {
      files.push(toPosixPath(path.relative(cwd, absPath)));
    }
  }
}

export function discoverNodeTestFiles({ cwd = ROOT, roots = DEFAULT_TEST_ROOTS } = {}) {
  const files = [];
  for (const root of roots) {
    walkTestFiles(path.resolve(cwd, root), cwd, files);
  }
  return [...new Set(files)].sort();
}

export function runNodeTests(files, { cwd = ROOT } = {}) {
  console.log(`[tests] Running ${files.length} Node test files`);

  for (const file of files) {
    console.log(`\n[tests] ${file}`);
    const result = spawnSync(process.execPath, [file], {
      cwd,
      stdio: 'inherit',
      env: process.env,
    });

    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }

  return 0;
}

function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list');
  const explicitFiles = args.filter(arg => arg !== '--list');
  const files = explicitFiles.length > 0
    ? explicitFiles.map(file => toPosixPath(file)).sort()
    : discoverNodeTestFiles();

  if (listOnly) {
    console.log(files.join('\n'));
    return 0;
  }

  return runNodeTests(files);
}

const entryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entryUrl === import.meta.url) {
  process.exitCode = main();
}
