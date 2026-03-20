const fs = require('fs');
const path = require('path');
const terser = require('@rollup/plugin-terser');

// Auto-generate an ES module wrapper for JSON data so it can be imported in browsers
const jsonPath = path.resolve(__dirname, 'data/protectiveDevices.json');
const mjsPath = path.resolve(__dirname, 'data/protectiveDevices.mjs');
try {
  const json = fs.readFileSync(jsonPath, 'utf8');
  fs.writeFileSync(mjsPath, `export default ${json};\n`);
} catch (err) {
  console.error('Failed to generate protectiveDevices.mjs', err);
}

const entries = {
  index: 'src/index.js',
  cableschedule: 'src/cableschedule.js',
  panelschedule: 'src/panelSchedule.js',
  racewayschedule: 'src/racewayschedule.js',
  ductbankroute: 'src/ductbankroute.js',
  cabletrayfill: 'src/cabletrayfill.js',
  conduitfill: 'src/conduitfill.js',
  optimalRoute: 'src/optimalRoute.js',
  loadlist: 'src/loadlist.js',
  equipmentlist: 'src/equipmentlist.js',
  projectManager: 'src/projectManager.js',
  scenarios: 'src/scenarios.js',
  supportspan: 'src/supportspan.js',
  pullcards: 'src/pullcards.js',
  seismicBracing: 'src/seismicBracing.js',
  trayhardwarebom: 'src/trayhardwarebom.js',
  intlCableSize: 'src/intlCableSize.js',
  groundgrid: 'src/groundgrid.js',
  autosize: 'src/autosize.js',
  '404': 'src/404.js'
};

module.exports = {
  input: entries,
  output: {
    dir: 'dist',
    format: 'es',
    sourcemap: false,
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/[name]-[hash].js'
  },
  plugins: [terser()]
};
