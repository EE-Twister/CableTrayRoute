const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const docs = path.join(root, 'docs');

function copy(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}

copy(path.join(root, 'icons'), path.join(dist, 'icons'));
copy(path.join(root, 'data'), path.join(dist, 'data'));
copy(path.join(root, 'icons'), path.join(docs, 'icons'));
copy(path.join(root, 'reports', 'templates'), path.join(dist, 'templates'));
copy(path.join(root, 'reports', 'templates'), path.join(docs, 'templates'));
copy(path.join(dist, 'vendor'), path.join(docs, 'dist', 'vendor'));
['componentLibrary.json', 'manufacturerLibrary.json'].forEach(file => {
  const src = path.join(root, file);
  fs.copyFileSync(src, path.join(dist, file));
  fs.copyFileSync(src, path.join(docs, file));
});
