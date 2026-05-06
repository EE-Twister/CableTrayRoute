const fs = require('fs');
const path = require('path');
const terser = require('@rollup/plugin-terser');
const json = require('@rollup/plugin-json');

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
  workflowdashboard: 'src/workflowDashboard.js',
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
  procurementschedule: 'src/procurementschedule.js',
  seismicBracing: 'src/seismicBracing.js',
  cableFaultBracing: 'src/cableFaultBracing.js',
  trayhardwarebom: 'src/trayhardwarebom.js',
  intlCableSize: 'src/intlCableSize.js',
  groundgrid: 'src/groundgrid.js',
  capacitorbank: 'src/capacitorbank.js',
  cathodicprotection: 'src/cathodicprotection.js',
  dissimilarmetals: 'src/dissimilarmetals.js',
  battery: 'src/battery.js',
  generatorsizing: 'src/generatorsizing.js',
  dcshortcircuit: 'src/dcshortcircuit.js',
  ibr: 'src/ibr.js',
  derinterconnect: 'src/derinterconnect.js',
  heattracesizing: 'src/heattracesizing.js',
  frequencyscan: 'src/frequencyscan.js',
  voltageflicker: 'src/voltageflicker.js',
  iec60287: 'src/iec60287.js',
  iec60909: 'src/iec60909.js',
  autosize: 'src/autosize.js',
  submittal: 'src/submittal.js',
  projectreport: 'src/projectreport.js',
  reliability: 'src/reliability.js',
  costestimate: 'src/costestimate.js',
  emf: 'src/emf.js',
  differentialprotection: 'src/differentialProtection.js',
  clashdetect: 'src/clashdetect.js',
  designrulechecker: 'src/designrulechecker.js',
  designcoach: 'src/designCoach.js',
  equipmentevaluation: 'src/equipmentEvaluation.js',
  spoolsheets: 'src/spoolsheets.js',
  windload: 'src/windload.js',
  structuralcombinations: 'src/structuralcombinations.js',
  seismicwindcombined: 'src/seismicwindcombined.js',
  loadCombinations: 'src/loadCombinations.js',
  transientstability: 'src/transientstability.js',
  voltagestability: 'src/voltageStability.js',
  voltagedropstudy: 'src/voltagedropstudy.js',
  productconfig: 'src/productconfig.js',
  fieldview: 'src/fieldview.js',
  scenariocomparison: 'src/scenarioComparison.js',
  '404': 'src/404.js',
  validation: 'src/validation.js',
  samplegallery: 'src/sampleGallery.js',
  demandschedule: 'src/demandschedule.js',
  conduitbend: 'src/conduitbend.js',
  busdust: 'src/busDuct.js',
  sustainability: 'src/sustainability.js',
  quasidynamic: 'src/quasiDynamic.js',
  bessHazard: 'src/bessHazard.js'
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
  plugins: [json(), terser()]
};
