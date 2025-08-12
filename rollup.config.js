const { terser } = require('@rollup/plugin-terser');

module.exports = {
  input: {
    index: 'src/index.js',
    cableschedule: 'src/cableschedule.js',
    racewayschedule: 'src/racewayschedule.js',
    ductbankroute: 'src/ductbankroute.js',
    cabletrayfill: 'src/cabletrayfill.js',
    conduitfill: 'src/conduitfill.js',
    optimalRoute: 'src/optimalRoute.js',
    '404': 'src/404.js'
  },
  output: {
    dir: 'dist',
    format: 'iife',
    sourcemap: false
  },
  plugins: [terser()]
};
