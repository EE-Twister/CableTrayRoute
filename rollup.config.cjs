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
  '404': 'src/404.js'
};

module.exports = Object.entries(entries).map(([name, input]) => ({
  input,
  output: {
    file: `dist/${name}.js`,
    format: 'es',
    sourcemap: false,
    inlineDynamicImports: true
  },
  plugins: [terser()]
}));
