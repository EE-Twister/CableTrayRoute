const terser = require('@rollup/plugin-terser');

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
  '404': 'src/404.js'
};

module.exports = Object.entries(entries).map(([name, input]) => ({
  input,
  output: {
    file: `dist/${name}.js`,
    format: 'iife',
    sourcemap: false
  },
  plugins: [terser()]
}));
