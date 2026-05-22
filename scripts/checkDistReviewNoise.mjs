import { spawnSync } from 'node:child_process';

const generatedPaths = [
  'dist/',
  'docs/asset-manifest.json',
  'data/protectiveDevices.mjs'
];

function runGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    shell: false
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(' ')} failed`).trim());
  }
  return result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function normalizePath(file) {
  return file.replace(/\\/g, '/');
}

function isGeneratedBuildPath(file) {
  const normalized = normalizePath(file);
  return generatedPaths.some(entry => (
    entry.endsWith('/')
      ? normalized.startsWith(entry)
      : normalized === entry
  ));
}

function changedFilesAgainstBase(baseRef) {
  const range = baseRef.includes('..') ? baseRef : `${baseRef}...HEAD`;
  return runGit(['diff', '--name-only', '--diff-filter=ACDMRTUXB', range, '--']);
}

function changedWorkingTreeFiles() {
  const tracked = runGit(['diff', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--']);
  const untracked = runGit(['ls-files', '--others', '--exclude-standard']);
  return [...tracked, ...untracked];
}

function main() {
  if (process.env.ALLOW_DIST_CHANGES === '1') {
    console.log('[dist-review] ALLOW_DIST_CHANGES=1; generated build artifact changes are allowed.');
    return;
  }

  const baseRef = process.argv[2] || '';
  const files = baseRef ? changedFilesAgainstBase(baseRef) : changedWorkingTreeFiles();
  const generated = [...new Set(files.filter(isGeneratedBuildPath).map(normalizePath))].sort();

  if (!generated.length) {
    console.log('[dist-review] No generated dist/build artifact changes detected.');
    return;
  }

  console.error([
    '[dist-review] Generated build artifacts changed in this feature branch:',
    ...generated.map(file => `  - ${file}`),
    '',
    'Policy: keep dist/ and generated build manifests out of feature PRs.',
    'Run npm run build for verification, but do not commit generated artifacts unless this is a release/static-hosting update.',
    'For release-only updates, rerun with ALLOW_DIST_CHANGES=1 or use a release/* branch.'
  ].join('\n'));
  process.exit(1);
}

main();
