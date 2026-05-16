/**
 * Sample Project Gallery registry and utilities for Gap #81.
 * Pure ESM module — no DOM dependencies.
 */

export const SCHEMA_VERSION = 1;

export const SAMPLE_REGISTRY = [
  {
    id: 'project-workflow-core',
    title: 'Project Workflow Core',
    industry: 'Industrial Electrical',
    description: 'A complete project path from equipment and loads through one-line reconciliation, cable schedule, raceways, routing readiness, study results, and report snapshot.',
    tags: ['workflow', 'equipment', 'loads', 'one-line', 'routing'],
    image: 'assets/sample-projects/project-workflow-core.jpg',
    imageAlt: 'Integrated electrical workflow workspace with one-line, schedules, routing, and report visuals.',
    projectFile: 'samples/project-workflow-core.json',
    pagesUsed: ['equipmentlist.html', 'loadlist.html', 'oneline.html', 'workflowdashboard.html', 'cableschedule.html', 'racewayschedule.html', 'projectreport.html'],
    guidedChecklist: [
      { step: 1, label: 'Review equipment list', page: 'equipmentlist.html', hint: 'Confirm switchboard, MCC, transformer, panel, and process equipment tags.' },
      { step: 2, label: 'Review load list', page: 'loadlist.html', hint: 'Check source links back to equipment tags and confirm required electrical fields.' },
      { step: 3, label: 'Open one-line', page: 'oneline.html', hint: 'Review linked components and run Reconcile Schedules if pending.' },
      { step: 4, label: 'Check dashboard', page: 'workflowdashboard.html', hint: 'Use blockers and project health to confirm the workflow path.' },
      { step: 5, label: 'Review deliverables', page: 'projectreport.html', hint: 'Inspect the saved report snapshot and release package context.' },
    ],
  },
  {
    id: 'industrial-plant',
    title: 'Industrial Plant',
    industry: 'Oil & Gas / Industrial',
    description: '480 V MCC feeders, motor cables, VFD shielded outputs, and instrument triads in hazardous-area ladder and solid-bottom trays.',
    tags: ['routing', 'tray-fill', 'arc-flash', 'tcc'],
    image: 'assets/sample-projects/industrial-plant.jpg',
    imageAlt: 'Industrial electrical room with MCC cabinets, routed cable tray, and process equipment.',
    projectFile: 'samples/industrial-plant.json',
    pagesUsed: ['cableschedule.html', 'racewayschedule.html', 'cabletrayfill.html', 'arcFlash.html', 'tcc.html'],
    guidedChecklist: [
      { step: 1, label: 'Review cable schedule', page: 'cableschedule.html', hint: 'Inspect the pre-loaded MCC feeders, motor cables, and instrument triads.' },
      { step: 2, label: 'Inspect raceway schedule', page: 'racewayschedule.html', hint: 'Check the power, instrument, and control tray layout.' },
      { step: 3, label: 'Verify tray fill', page: 'cabletrayfill.html', hint: 'Confirm all trays are below their rated fill limit.' },
      { step: 4, label: 'Run arc flash study', page: 'arcFlash.html', hint: 'Review incident energy for each bus using IEEE 1584-2018.' },
      { step: 5, label: 'Check TCC coordination', page: 'tcc.html', hint: 'Verify relay and fuse curves maintain selectivity.' },
    ],
  },
  {
    id: 'commercial-office-fitout',
    title: 'Commercial Office Fitout',
    industry: 'Commercial / Tenant Improvement',
    description: 'A tenant improvement package with service distribution, panelboards, lighting, receptacle, and RTU loads carried through schedules, one-line, raceways, and voltage-drop review.',
    tags: ['workflow', 'commercial', 'equipment', 'loads', 'voltage-drop'],
    image: 'assets/sample-projects/commercial-office-fitout.jpg',
    imageAlt: 'Commercial office electrical room connected to ceiling raceways and rooftop HVAC equipment.',
    projectFile: 'samples/commercial-office-fitout.json',
    pagesUsed: ['equipmentlist.html', 'loadlist.html', 'oneline.html', 'cableschedule.html', 'racewayschedule.html', 'demandschedule.html', 'voltagedropstudy.html', 'projectreport.html'],
    guidedChecklist: [
      { step: 1, label: 'Review office equipment', page: 'equipmentlist.html', hint: 'Check the main distribution panel, transformer, panelboards, and rooftop unit records.' },
      { step: 2, label: 'Validate tenant loads', page: 'loadlist.html', hint: 'Confirm lighting, receptacle, and HVAC loads are sourced from the correct panel tags.' },
      { step: 3, label: 'Open the one-line', page: 'oneline.html', hint: 'Review the service-to-panel workflow and linked component references.' },
      { step: 4, label: 'Check cable and raceway schedules', page: 'cableschedule.html', hint: 'Confirm schedule-ready and routing-ready feeder and branch circuit rows.' },
      { step: 5, label: 'Review voltage drop and report snapshot', page: 'voltagedropstudy.html', hint: 'Use the saved study metadata and report snapshot to test deliverable handoff.' },
    ],
  },
  {
    id: 'water-treatment-pump-station',
    title: 'Water Treatment Pump Station',
    industry: 'Water / Wastewater',
    description: 'A pump station power package with switchgear, MCC, VFD-fed pumps, PLC controls, ductbank routing, motor-start context, and arc-flash study metadata.',
    tags: ['workflow', 'pump-station', 'mcc', 'ductbank', 'motor-start', 'arc-flash'],
    image: 'assets/sample-projects/water-treatment-pump-station.jpg',
    imageAlt: 'Water treatment pump station with switchgear, MCC, pumps, and underground ductbank cutaway.',
    projectFile: 'samples/water-treatment-pump-station.json',
    pagesUsed: ['equipmentlist.html', 'loadlist.html', 'oneline.html', 'cableschedule.html', 'racewayschedule.html', 'ductbankroute.html', 'motorStart.html', 'arcFlash.html', 'projectreport.html'],
    guidedChecklist: [
      { step: 1, label: 'Review pump station equipment', page: 'equipmentlist.html', hint: 'Check switchgear, MCC, VFD, PLC, and pump equipment tags.' },
      { step: 2, label: 'Review process loads', page: 'loadlist.html', hint: 'Confirm pump, mixer, and controls loads are linked back to MCC and PLC sources.' },
      { step: 3, label: 'Inspect ductbank and tray routing', page: 'ductbankroute.html', hint: 'Validate underground conduit geometry and the gallery tray handoff.' },
      { step: 4, label: 'Open motor-start and arc-flash context', page: 'motorStart.html', hint: 'Use the seeded study metadata to test study pages without starting empty.' },
      { step: 5, label: 'Review deliverable snapshot', page: 'projectreport.html', hint: 'Inspect the saved report snapshot and release package context.' },
    ],
  },
  {
    id: 'ev-charging-depot',
    title: 'EV Charging Depot',
    industry: 'EV Infrastructure',
    description: 'A fleet charging depot with utility service, transformer, charger distribution boards, high-power EVSE feeders, demand management, routing, harmonics, and voltage-drop context.',
    tags: ['workflow', 'ev', 'load-flow', 'demand', 'routing', 'harmonics'],
    image: 'assets/sample-projects/ev-charging-depot.jpg',
    imageAlt: 'EV charging depot with canopy chargers, switchboard, and routed feeder infrastructure.',
    projectFile: 'samples/ev-charging-depot.json',
    pagesUsed: ['equipmentlist.html', 'loadlist.html', 'oneline.html', 'cableschedule.html', 'racewayschedule.html', 'loadFlow.html', 'harmonics.html', 'voltagedropstudy.html', 'workflowdashboard.html'],
    guidedChecklist: [
      { step: 1, label: 'Review charging equipment', page: 'equipmentlist.html', hint: 'Check the utility service, transformer, switchboard, charger boards, and EVSE tags.' },
      { step: 2, label: 'Review managed charging loads', page: 'loadlist.html', hint: 'Confirm demand factors and source panel references for each charger.' },
      { step: 3, label: 'Inspect one-line links', page: 'oneline.html', hint: 'Review charger feeders and component references before reconciling schedules.' },
      { step: 4, label: 'Check routing readiness', page: 'workflowdashboard.html', hint: 'Use the dashboard health metrics to confirm cable and raceway readiness.' },
      { step: 5, label: 'Review load-flow and harmonics context', page: 'loadFlow.html', hint: 'Use the seeded study metadata to test analysis-page handoffs.' },
    ],
  },
  {
    id: 'data-center',
    title: 'Data Center',
    industry: 'Data Center / IT',
    description: 'Redundant A/B 480 V UPS feeds, 208 V PDU branches, overhead OM4/OS2 fiber backbone, and Cat6A horizontal distribution in hot/cold aisle layout.',
    tags: ['routing', 'tray-fill', 'load-flow', 'voltage-drop'],
    image: 'assets/sample-projects/data-center.jpg',
    imageAlt: 'Data center server aisles with overhead power trays, fiber trays, UPS, and PDU equipment.',
    projectFile: 'samples/data-center.json',
    pagesUsed: ['cableschedule.html', 'racewayschedule.html', 'cabletrayfill.html', 'loadFlow.html', 'voltagedropstudy.html'],
    guidedChecklist: [
      { step: 1, label: 'Review cable schedule', page: 'cableschedule.html', hint: 'Inspect the A/B redundant power feeds and fiber backbone runs.' },
      { step: 2, label: 'Inspect raceway schedule', page: 'racewayschedule.html', hint: 'Check hot-aisle power trays, cold-aisle fiber tray, and under-floor data trays.' },
      { step: 3, label: 'Verify tray fill', page: 'cabletrayfill.html', hint: 'Confirm cable fill in hot-aisle and cold-aisle trays.' },
      { step: 4, label: 'Run load flow', page: 'loadFlow.html', hint: 'Check bus voltages across the A and B power paths.' },
      { step: 5, label: 'Check voltage drop', page: 'voltagedropstudy.html', hint: 'Verify PDU branch drops stay within ASHRAE/data-center limits.' },
    ],
  },
  {
    id: 'substation-grounding',
    title: 'Substation Ground Grid',
    industry: 'Transmission & Substation',
    description: '115 kV / 13.8 kV substation with IEEE 80 ground grid design: mesh conductor, ground rods, touch/step voltage compliance, and GPR calculation.',
    tags: ['grounding', 'ground-grid', 'safety'],
    image: 'assets/sample-projects/substation-grounding.jpg',
    imageAlt: 'Outdoor substation yard with a below-grade copper ground grid visualization.',
    projectFile: 'samples/substation-grounding.json',
    pagesUsed: ['groundgrid.html', 'shortCircuit.html', 'arcFlash.html'],
    guidedChecklist: [
      { step: 1, label: 'Open ground grid study', page: 'groundgrid.html', hint: 'Review the mesh spacing, rod placement, and soil model.' },
      { step: 2, label: 'Check touch & step voltages', page: 'groundgrid.html', hint: 'Confirm computed values are below IEEE 80 tolerable limits.' },
      { step: 3, label: 'Review short circuit inputs', page: 'shortCircuit.html', hint: 'Verify the fault current used for GPR calculation.' },
      { step: 4, label: 'Review arc flash results', page: 'arcFlash.html', hint: 'Check incident energy at the 13.8 kV switchgear.' },
    ],
  },
  {
    id: 'heat-trace-pipe',
    title: 'Heat Trace Pipe Run',
    industry: 'Process / Petrochemical',
    description: 'Freeze-protection heat trace for a 200 ft process pipe: watt-density sizing, product scheduling, BOM, and controller list.',
    tags: ['heat-trace', 'sizing', 'bom'],
    image: 'assets/sample-projects/heat-trace-pipe.jpg',
    imageAlt: 'Insulated process pipe with heat trace cable, junction box, and controller equipment.',
    projectFile: 'samples/heat-trace-pipe.json',
    pagesUsed: ['heattracesizing.html'],
    guidedChecklist: [
      { step: 1, label: 'Open heat trace sizing', page: 'heattracesizing.html', hint: 'Review the pipe dimensions, insulation, and ambient design temperature.' },
      { step: 2, label: 'Check watt-density output', page: 'heattracesizing.html', hint: 'Confirm required watts-per-foot and selected product.' },
      { step: 3, label: 'Review BOM', page: 'heattracesizing.html', hint: 'Export the heat trace bill of materials and controller schedule.' },
    ],
  },
  {
    id: 'ductbank-network',
    title: 'Underground Ductbank',
    industry: 'Utility / Civil',
    description: 'Three-circuit 15 kV underground ductbank with concrete encasement, IEC 60287 thermal derating, and conduit fill check.',
    tags: ['routing', 'ductbank', 'conduit-fill', 'ampacity'],
    image: 'assets/sample-projects/ductbank-network.jpg',
    imageAlt: 'Concrete-encased underground ductbank cutaway with conduits, cables, and soil layers.',
    projectFile: 'samples/ductbank-network.json',
    pagesUsed: ['ductbankroute.html', 'conduitfill.html', 'iec60287.html'],
    guidedChecklist: [
      { step: 1, label: 'Open ductbank route', page: 'ductbankroute.html', hint: 'Review the ductbank geometry, conduit arrangement, and soil thermal resistivity.' },
      { step: 2, label: 'Check conduit fill', page: 'conduitfill.html', hint: 'Verify each conduit is within the NEC 40% fill limit.' },
      { step: 3, label: 'Run IEC 60287 ampacity', page: 'iec60287.html', hint: 'Confirm derating for soil temperature and mutual heating.' },
    ],
  },
  {
    id: 'coordination-study',
    title: 'Protective Device Coordination',
    industry: 'Industrial / Commercial',
    description: 'Medium-voltage one-line with overcurrent relay, fuse, and molded-case breaker coordination for a 4.16 kV industrial distribution system.',
    tags: ['tcc', 'arc-flash', 'short-circuit', 'protection'],
    image: 'assets/sample-projects/coordination-study.jpg',
    imageAlt: 'Protective device coordination workspace with breakers, relay equipment, and study visuals.',
    projectFile: 'samples/coordination-study.json',
    pagesUsed: ['tcc.html', 'shortCircuit.html', 'arcFlash.html', 'oneline.html'],
    guidedChecklist: [
      { step: 1, label: 'Open one-line diagram', page: 'oneline.html', hint: 'Review the 4.16 kV distribution one-line with source, transformer, and loads.' },
      { step: 2, label: 'Run short circuit study', page: 'shortCircuit.html', hint: 'Verify fault currents for relay and fuse setting selection.' },
      { step: 3, label: 'Check TCC curves', page: 'tcc.html', hint: 'Confirm relay, fuse, and breaker curves are selective at all fault levels.' },
      { step: 4, label: 'Review arc flash results', page: 'arcFlash.html', hint: 'Check incident energy and PPE requirements at each bus.' },
    ],
  },
];

/**
 * Returns all samples that include the given tag.
 * @param {string} tag
 * @returns {Array}
 */
export function getSamplesByTag(tag) {
  return SAMPLE_REGISTRY.filter(s => s.tags.includes(tag));
}

/**
 * Returns the sample with the given id, or undefined.
 * @param {string} id
 * @returns {object|undefined}
 */
export function getSampleById(id) {
  return SAMPLE_REGISTRY.find(s => s.id === id);
}

/**
 * Validates a project JSON object against the required sample schema.
 * @param {*} obj
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSampleProject(obj) {
  const errors = [];
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, errors: ['Project must be a non-null object'] };
  }
  if (typeof obj.schemaVersion !== 'number') errors.push('Missing or invalid schemaVersion');
  if (typeof obj.id !== 'string' || !obj.id) errors.push('Missing id');
  if (typeof obj.title !== 'string' || !obj.title) errors.push('Missing title');
  if (!Array.isArray(obj.cables)) errors.push('Missing cables array');
  const hasNestedRaceways = obj.raceways && typeof obj.raceways === 'object';
  const hasTopLevelRaceways = Array.isArray(obj.trays) && Array.isArray(obj.conduits) && Array.isArray(obj.ductbanks);
  if (!hasNestedRaceways && !hasTopLevelRaceways) {
    errors.push('Missing raceway arrays');
  } else if (hasNestedRaceways) {
    if (!Array.isArray(obj.raceways.trays)) errors.push('Missing raceways.trays array');
    if (!Array.isArray(obj.raceways.conduits)) errors.push('Missing raceways.conduits array');
    if (!Array.isArray(obj.raceways.ductbanks)) errors.push('Missing raceways.ductbanks array');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Migrates a project object to the current SCHEMA_VERSION.
 * Returns a new object; does not mutate the input.
 * @param {object} obj
 * @returns {object}
 */
export function migrateSampleProject(obj) {
  const copy = { ...obj };
  if (typeof copy.schemaVersion !== 'number') {
    copy.schemaVersion = SCHEMA_VERSION;
  }
  // Future version bumps go here as: if (copy.schemaVersion < N) { ... copy.schemaVersion = N; }
  return copy;
}

function normalizeSampleOneLine(obj = {}) {
  const oneLine = obj.oneLine || obj.oneline;
  if (Array.isArray(oneLine)) {
    return { activeSheet: 0, sheets: oneLine };
  }
  if (oneLine && Array.isArray(oneLine.sheets)) {
    return { activeSheet: oneLine.activeSheet || 0, sheets: oneLine.sheets };
  }
  if (oneLine && (Array.isArray(oneLine.components) || Array.isArray(oneLine.connections))) {
    return {
      activeSheet: 0,
      sheets: [
        {
          id: `${obj.id || 'sample'}-main`,
          name: obj.title || 'Sample One-Line',
          components: Array.isArray(oneLine.components) ? oneLine.components : [],
          connections: Array.isArray(oneLine.connections) ? oneLine.connections : [],
        },
      ],
    };
  }
  return { activeSheet: 0, sheets: [] };
}

export function sampleProjectToImportPayload(obj = {}) {
  const raceways = obj.raceways || {};
  const settings = { ...(obj.settings || {}) };
  ['studies', 'reportSnapshots', 'lifecyclePackages', 'oneLineScheduleReconcilePending'].forEach(key => {
    if (Object.prototype.hasOwnProperty.call(obj, key) && !Object.prototype.hasOwnProperty.call(settings, key)) {
      settings[key] = obj[key];
    }
  });
  return {
    meta: obj.meta || { version: 1, scenario: 'default', scenarios: ['default'] },
    ductbanks: Array.isArray(obj.ductbanks) ? obj.ductbanks : (Array.isArray(raceways.ductbanks) ? raceways.ductbanks : []),
    conduits: Array.isArray(obj.conduits) ? obj.conduits : (Array.isArray(raceways.conduits) ? raceways.conduits : []),
    trays: Array.isArray(obj.trays) ? obj.trays : (Array.isArray(raceways.trays) ? raceways.trays : []),
    cables: Array.isArray(obj.cables) ? obj.cables : [],
    cableTypicals: Array.isArray(obj.cableTypicals) ? obj.cableTypicals : [],
    panels: Array.isArray(obj.panels) ? obj.panels : [],
    equipment: Array.isArray(obj.equipment) ? obj.equipment : [],
    loads: Array.isArray(obj.loads) ? obj.loads : [],
    oneLine: normalizeSampleOneLine(obj),
    mccLineups: Array.isArray(obj.mccLineups) ? obj.mccLineups : [],
    settings
  };
}
