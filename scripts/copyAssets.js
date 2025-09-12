const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const docs = path.join(root, 'docs');

function copy(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}

copy(path.join(root, 'icons'), path.join(dist, 'icons'));
copy(path.join(root, 'data'), path.join(dist, 'data'));
copy(path.join(root, 'icons'), path.join(docs, 'icons'));
copy(path.join(root, 'reports', 'templates'), path.join(dist, 'templates'));
copy(path.join(root, 'reports', 'templates'), path.join(docs, 'templates'));
['componentLibrary.json', 'manufacturerLibrary.json'].forEach(file => {
  const src = path.join(root, file);
  fs.copyFileSync(src, path.join(dist, file));
  fs.copyFileSync(src, path.join(docs, file));
});
