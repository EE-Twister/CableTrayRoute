const path = require('path');
const terser = require('@rollup/plugin-terser');
const json = require('@rollup/plugin-json');
const { nodeResolve } = require('@rollup/plugin-node-resolve');

const entries = {
  index: 'src/index.js',
  workflowdashboard: 'src/workflowDashboard.js',
  datamanager: 'src/oneLineDataManager.js',
  switchingprocedures: 'src/switchingProcedures.js',
  cableschedule: 'src/cableschedule.js',
  panelschedule: 'src/panelSchedule.js',
  racewayschedule: 'src/racewayschedule.js',
  ductbankroute: 'src/ductbankroute.js',
  cabletrayfill: 'src/cabletrayfill.js',
  conduitfill: 'src/conduitfill.js',
  optimalRoute: 'src/optimalRoute.js',
  routeViewer3D: 'src/routing/viewer/routeViewerEntry.js',
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
  cablethermalenv: 'src/cableThermalEnvironment.js',
  iec60909: 'src/iec60909.js',
  autosize: 'src/autosize.js',
  submittal: 'src/submittal.js',
  projectreport: 'src/projectreport.js',
  shortCircuit: 'src/shortCircuit.js',
  arcFlash: 'src/arcFlash.js',
  tcc: 'src/tcc.js',
  library: 'src/library.js',
  harmonics: 'src/harmonics.js',
  'harmonicNetwork.lazy': 'src/harmonicNetwork.lazy.js',
  loadFlow: 'src/loadFlow.js',
  motorStart: 'src/motorStart.js',
  contingency: 'src/contingency.js',
  reliability: 'src/reliability.js',
  costestimate: 'src/costestimate.js',
  emf: 'src/emf.js',
  differentialprotection: 'src/differentialProtection.js',
  clashdetect: 'src/clashdetect.js',
  designrulechecker: 'src/designrulechecker.js',
  designcoach: 'src/designCoach.js',
  equipmentevaluation: 'src/equipmentEvaluation.js',
  equipmentarrangements: 'src/equipmentarrangements.js',
  mcclineup: 'src/mcclineup.js',
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
  optimalpowerflow: 'src/optimalPowerFlow.js',
  probabilisticloadflow: 'src/probabilisticLoadFlow.js',
  sagtension: 'src/sagTension.js',
  lightningprotection: 'src/lightningProtection.js',
  substationlayout: 'src/substationLayout.js',
  bessHazard: 'src/bessHazard.js',
  hazareaclassification: 'src/hazareaclassification.js',
  admin: 'src/admin.js',
  insulationcoordination: 'src/insulationcoordination.js',
  lighting: 'src/lighting.js',
  trustcenter: 'src/trustcenter.js',
  cybercompliance: 'src/cybercompliance.js',
};

function isHarmonicNetworkLazyId(id) {
  return id === '../src/harmonicNetwork.lazy.js'
    || id.replace(/\\/g, '/').endsWith('/src/harmonicNetwork.lazy.js');
}

function buildEntryConfig([name, input]) {
  const isHarmonicsEntry = name === 'harmonics';
  return {
    input,
    external: isHarmonicsEntry
      ? isHarmonicNetworkLazyId
      : undefined,
    // Keep writes serial so synced Windows workspaces do not intermittently lock dist files.
    maxParallelFileOps: 1,
    output: {
      file: path.join('dist', `${name}.js`),
      format: 'es',
      sourcemap: false,
      inlineDynamicImports: true,
      paths: isHarmonicsEntry
        ? id => isHarmonicNetworkLazyId(id) ? './harmonicNetwork.lazy.js' : id
        : undefined,
    },
    plugins: [nodeResolve({ browser: true }), json(), terser()]
  };
}

module.exports = Object.entries(entries).map(buildEntryConfig);
