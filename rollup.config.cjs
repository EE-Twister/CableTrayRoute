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
  submittal: 'src/submittal.js',
  projectreport: 'src/projectreport.js',
  reliability: 'src/reliability.js',
  costestimate: 'src/costestimate.js',
  emf: 'src/emf.js',
  clashdetect: 'src/clashdetect.js',
  spoolsheets: 'src/spoolsheets.js',
  windload: 'src/windload.js',
  transientstability: 'src/transientstability.js',
  productconfig: 'src/productconfig.js',
  '404': 'src/404.js'
};

/**
 * Split frequently-shared internal modules into named vendor chunks so that
 * browsers only download and parse them once regardless of how many pages the
 * user visits.  Each key becomes the chunk file name; the value is a list of
 * module IDs (resolved absolute paths or partial path fragments) whose code
 * should be grouped into that chunk.
 *
 * Only group modules that are genuinely shared by ≥3 entry points; smaller
 * groupings are handled by Rollup's automatic code-splitting.
 */
function manualChunks(id) {
  // Core project state — imported by nearly every page
  if (id.includes('projectStorage') || id.includes('dataStore') || id.includes('dirtyTracker')) {
    return 'core-storage';
  }
  // Shared UI primitives
  if (id.includes('/src/components/') || id.includes('workflowStatus') || id.includes('site.js')) {
    return 'core-ui';
  }
  // Analysis utilities shared across study pages
  if (id.includes('/analysis/loadFlow') || id.includes('/analysis/loadFlowModel')) {
    return 'analysis-loadflow';
  }
}

module.exports = {
  input: entries,
  output: {
    dir: 'dist',
    format: 'es',
    sourcemap: false,
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/[name]-[hash].js',
    manualChunks,
  },
  plugins: [terser()]
};
