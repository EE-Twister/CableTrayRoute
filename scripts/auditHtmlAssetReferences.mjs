import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ATTR_RE = /\b(src|href)\s*=\s*(['"])([^'"]+)\2/gi;
const FINGERPRINT_RE = /\.[0-9a-f]{8,}(\.[A-Za-z0-9]+)$/;

function toPosixPath(value) {
  return value.replace(/\\/g, '/');
}

function isIgnoredUrl(value) {
  return !value
    || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value)
    || /^(?:data|mailto|javascript|tel):/i.test(value)
    || value.startsWith('#');
}

function splitUrl(value) {
  const hashIndex = value.indexOf('#');
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const queryIndex = withoutHash.indexOf('?');
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : '';
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  return { pathname, query, hash };
}

function stripFingerprint(basename) {
  return basename.replace(FINGERPRINT_RE, '$1');
}

export function logicalAssetUrl(value) {
  if (isIgnoredUrl(value)) return value;
  const { pathname, query, hash } = splitUrl(value);
  const leadingDot = pathname.startsWith('./') ? './' : '';
  const normalizedPathname = pathname.slice(leadingDot.length);
  if (!normalizedPathname.startsWith('dist/')) return value;

  const dirname = path.posix.dirname(normalizedPathname);
  const basename = path.posix.basename(normalizedPathname);
  const logicalBasename = stripFingerprint(basename);
  if (logicalBasename === basename) return value;

  const logicalPath = dirname === '.'
    ? logicalBasename
    : `${dirname}/${logicalBasename}`;
  return `${leadingDot}${logicalPath}${query}${hash}`;
}

export function listRootHtmlFiles(root = ROOT) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.html'))
    .map(entry => path.join(root, entry.name))
    .sort();
}

function classifyReference(value, root) {
  if (isIgnoredUrl(value)) return null;
  const { pathname } = splitUrl(value);
  const normalizedPathname = pathname.replace(/^\.\//, '');
  if (!normalizedPathname.startsWith('dist/')) return null;

  const logicalUrl = logicalAssetUrl(value);
  if (logicalUrl !== value) {
    const target = path.join(root, toPosixPath(normalizedPathname));
    return {
      code: 'fingerprinted-root-asset',
      message: 'Root HTML source should reference logical dist assets; build output applies fingerprints.',
      logicalUrl,
      targetExists: fs.existsSync(target)
    };
  }

  const target = path.join(root, toPosixPath(normalizedPathname));
  if (!fs.existsSync(target)) {
    return {
      code: 'missing-logical-asset',
      message: 'Root HTML references a logical dist asset that does not exist.',
      logicalUrl,
      targetExists: false
    };
  }

  return null;
}

export function collectHtmlAssetReferenceIssues({ root = ROOT, files = listRootHtmlFiles(root) } = {}) {
  const issues = [];
  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = ATTR_RE.exec(html))) {
      const [, attribute, , url] = match;
      const issue = classifyReference(url, root);
      if (!issue) continue;
      issues.push({
        file: toPosixPath(path.relative(root, file)),
        attribute,
        url,
        ...issue
      });
    }
  }
  return issues;
}

export function normalizeHtmlAssetReferences(content) {
  let changed = false;
  const next = content.replace(ATTR_RE, (match, attribute, quote, value) => {
    const logicalUrl = logicalAssetUrl(value);
    if (logicalUrl === value) return match;
    changed = true;
    return `${attribute}=${quote}${logicalUrl}${quote}`;
  });
  return { content: next, changed };
}

export function fixHtmlAssetReferences({ root = ROOT, files = listRootHtmlFiles(root) } = {}) {
  const changedFiles = [];
  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    const { content, changed } = normalizeHtmlAssetReferences(original);
    if (!changed) continue;
    fs.writeFileSync(file, content);
    changedFiles.push(toPosixPath(path.relative(root, file)));
  }
  return changedFiles;
}

function formatIssues(issues) {
  return issues.map(issue => {
    const targetState = issue.targetExists ? 'exists' : 'missing';
    return `  - ${issue.file}: ${issue.url} -> ${issue.logicalUrl} (${issue.code}, target ${targetState})`;
  }).join('\n');
}

function main() {
  const fix = process.argv.includes('--fix');
  if (fix) {
    const changedFiles = fixHtmlAssetReferences();
    console.log(changedFiles.length
      ? `[html-assets] normalized ${changedFiles.length} HTML files.`
      : '[html-assets] no HTML asset references needed normalization.');
  }

  const issues = collectHtmlAssetReferenceIssues();
  if (!issues.length) {
    console.log('[html-assets] root HTML asset references are source-safe.');
    return 0;
  }

  console.error([
    `[html-assets] Found ${issues.length} root HTML asset reference issue(s):`,
    formatIssues(issues),
    '',
    'Run `node scripts/auditHtmlAssetReferences.mjs --fix` to restore logical dist asset paths.'
  ].join('\n'));
  return 1;
}

const entryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entryUrl === import.meta.url) {
  process.exitCode = main();
}
