const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

function copy(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}

copy(path.join(root, 'icons'), path.join(dist, 'icons'));
copy(path.join(root, 'data'), path.join(dist, 'data'));
['componentLibrary.json', 'manufacturerLibrary.json'].forEach(file => {
  fs.copyFileSync(path.join(root, file), path.join(dist, file));
});
