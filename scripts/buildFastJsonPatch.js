const fs = require('fs');
const path = require('path');
const { rollup } = require('rollup');

async function build() {
  const input = path.resolve(__dirname, '..', 'node_modules', 'fast-json-patch', 'index.mjs');
  const outputDir = path.resolve(__dirname, '..', 'dist', 'vendor');
  fs.mkdirSync(outputDir, { recursive: true });

  const bundle = await rollup({
    input,
    treeshake: false
  });

  try {
    await bundle.write({
      file: path.join(outputDir, 'fast-json-patch.mjs'),
      format: 'esm',
      sourcemap: false
    });
  } finally {
    await bundle.close();
  }
}

build().catch(err => {
  console.error('Failed to bundle fast-json-patch', err);
  process.exit(1);
});
