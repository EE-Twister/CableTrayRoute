const fs = require('fs');
const path = require('path');
const { rollup } = require('rollup');

async function build() {
  const outputDir = path.resolve(__dirname, '..', 'dist', 'vendor');
  fs.mkdirSync(outputDir, { recursive: true });
  const vendorCopies = [
    ['xlsx', 'dist', 'xlsx.full.min.js', 'xlsx.full.min.js'],
    ['docx', 'build', 'index.umd.js', 'docx.umd.js'],
    ['handlebars', 'dist', 'handlebars.min.js', 'handlebars.min.js'],
    ['d3', 'dist', 'd3.min.js', 'd3.min.js'],
  ['jspdf', 'dist', 'jspdf.umd.min.js', 'jspdf.umd.min.js'],
  ['pdfjs-dist', 'build', 'pdf.min.js', 'pdf.min.js'],
  ['pdfjs-dist', 'build', 'pdf.worker.min.js', 'pdf.worker.min.js'],
  ['svg2pdf.js', 'dist', 'svg2pdf.es.min.js', 'svg2pdf.es.min.js'],
];

  for (const [pkg, dir, file, dest] of vendorCopies) {
    const src = path.resolve(__dirname, '..', 'node_modules', pkg, dir, file);
    if (!fs.existsSync(src)) {
      throw new Error(`Missing vendor asset: ${src}`);
    }
    fs.copyFileSync(src, path.join(outputDir, dest));
  }

  const input = path.resolve(__dirname, '..', 'node_modules', 'fast-json-patch', 'index.mjs');
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
