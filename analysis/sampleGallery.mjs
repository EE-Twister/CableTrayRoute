import { repairMojibake, repairMojibakeDeep } from '../src/textEncoding.js';
import { normalizeRouteResultState } from './routeResults.mjs';

/**
 * Sample Project Gallery registry and utilities for Gap #81.
 * Pure ESM module — no DOM dependencies.
 */

export const SCHEMA_VERSION = 1;

export function getSampleProjectCopyName(title, existingNames = []) {
  const base = `${String(title || 'Untitled').trim() || 'Untitled'} — Sample`;
  const used = new Set((existingNames || []).map(name => String(name).trim().toLocaleLowerCase()));
  const sampleBase = repairMojibake(base);
  if (!used.has(sampleBase.toLocaleLowerCase())) return sampleBase;
  let copyNumber = 2;
  while (used.has(`${sampleBase} (${copyNumber})`.toLocaleLowerCase())) copyNumber += 1;
  return `${sampleBase} (${copyNumber})`;
}

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
    pagesUsed: ['equipmentlist.html', 'loadlist.html', 'oneline.html', 'cableschedule.html', 'racewayschedule.html', 'optimalRoute.html', 'shortCircuit.html', 'workflowdashboard.html', 'projectreport.html'],
    guidedChecklist: [
      { step: 1, label: 'Review equipment list', page: 'equipmentlist.html', hint: 'Confirm switchboard, MCC, transformer, panel, and process equipment tags.' },
      { step: 2, label: 'Review load list', page: 'loadlist.html', hint: 'Check source links back to equipment tags and confirm required electrical fields.' },
      { step: 3, label: 'Open one-line', page: 'oneline.html', hint: 'Review linked components and run Reconcile Schedules if pending.' },
      { step: 4, label: 'Review cable schedule', page: 'cableschedule.html', hint: 'Confirm each cable has linked endpoints, conductor size, length, and a raceway assignment.' },
      { step: 5, label: 'Review raceway schedule', page: 'racewayschedule.html', hint: 'Inspect the tray and ductbank parent row, then expand the bank to see its conduit.' },
      { step: 6, label: 'Review routed cables', page: 'optimalRoute.html', hint: 'Confirm the four saved route results use the coordinated cable and raceway records.' },
      { step: 7, label: 'Review short-circuit results', page: 'shortCircuit.html', hint: 'Inspect the saved project study basis and rerun the study to compare results.' },
      { step: 8, label: 'Review deliverables', page: 'projectreport.html', hint: 'Confirm shared readiness is clear, then inspect the saved report snapshot and release package context.' },
    ],
  },
  {
    id: 'industrial-plant',
    title: 'Industrial Plant',
    industry: 'Oil & Gas / Industrial',
    description: '480 V MCC feeders, motor cables, VFD shielded outputs, and instrument triads in hazardous-area ladder and solid-bottom trays.',
    tags: ['routing', 'tray-fill', 'arc-flash'],
    image: 'assets/sample-projects/industrial-plant.jpg',
    imageAlt: 'Industrial electrical room with MCC cabinets, routed cable tray, and process equipment.',
    projectFile: 'samples/industrial-plant.json',
    pagesUsed: ['cableschedule.html', 'racewayschedule.html', 'cabletrayfill.html', 'arcFlash.html'],
    guidedChecklist: [
      { step: 1, label: 'Review cable schedule', page: 'cableschedule.html', hint: 'Inspect the pre-loaded MCC feeders, motor cables, and instrument triads.' },
      { step: 2, label: 'Inspect raceway schedule', page: 'racewayschedule.html', hint: 'Check the power, instrument, and control tray layout.' },
      { step: 3, label: 'Verify tray fill', page: 'cabletrayfill.html', hint: 'Confirm all trays are below their rated fill limit.' },
      { step: 4, label: 'Run arc flash study', page: 'arcFlash.html', hint: 'Review incident energy for each bus using IEEE 1584-2018.' },
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
    pagesUsed: ['equipmentlist.html', 'loadlist.html', 'oneline.html', 'cableschedule.html', 'racewayschedule.html', 'ductbankroute.html', 'conduitfill.html', 'iec60287.html'],
    guidedChecklist: [
      { step: 1, label: 'Review equipment basis', page: 'equipmentlist.html', hint: 'Confirm the two sources and three transformer destinations used throughout the sample.' },
      { step: 2, label: 'Review connected loads', page: 'loadlist.html', hint: 'Trace each diversified transformer demand into its feeder current.' },
      { step: 3, label: 'Inspect the connected one-line', page: 'oneline.html', hint: 'Verify all three feeders connect from their source switchgear into the transformer primary ports.' },
      { step: 4, label: 'Review cable assignments', page: 'cableschedule.html', hint: 'Confirm cable endpoints, sizes, loads, and assigned ductbanks.' },
      { step: 5, label: 'Review ductbank schedule', page: 'racewayschedule.html', hint: 'Expand both ductbanks and review their parent data and conduit children.' },
      { step: 6, label: 'Analyze the primary ductbank', page: 'ductbankroute.html?ductbank=DUCTBANK-DB-01', hint: 'Run fill and thermal checks for the two feeders in DUCTBANK-DB-01, then switch to DB-02 for the third circuit.' },
      { step: 7, label: 'Check a populated conduit', page: 'conduitfill.html?conduit=DB01-COND-1', hint: 'Verify UG-CBL-001 is loaded into DB01-COND-1 and remains within the NEC fill limit.' },
      { step: 8, label: 'Run linked IEC 60287 ampacity', page: 'iec60287.html?scope=circuit%3AUG-CBL-001', hint: 'Confirm the 15 kV cable, buried conduit, soil, depth, and grouping assumptions before calculating.' },
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
      { step: 3, label: 'Check TCC curves', page: 'tcc.html?component=BKR-4KV-F1&device=sample_mv_breaker_1200&tccContext=adjacent', hint: 'Confirm relay, fuse, and breaker curves are selective at all fault levels.' },
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

const SAMPLE_COMPONENT_TYPE_ALIASES = {
  source: { type: 'utility_source', subtype: 'utility' },
  utility: { type: 'utility_source', subtype: 'utility' },
  utility_source: { type: 'utility_source', subtype: 'utility' },
  bus: { type: 'bus', subtype: 'bus' },
  breaker: { type: 'breaker', subtype: 'lv_cb' },
  fuse: { type: 'fuse', subtype: 'class_rk1' },
  relay: { type: 'relay', subtype: 'relay' },
  transformer: { type: 'transformer', subtype: 'two_winding' },
  mcc: { type: 'mcc', subtype: 'mcc' },
  motor: { type: 'motor_load', subtype: 'motor_load' },
  load: { type: 'static_load', subtype: 'static_load' },
};

function normalizeSampleToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function sampleDefaultRotationForType(type) {
  const normalized = normalizeSampleToken(type);
  if (normalized === 'bus' || normalized === 'annotation') return 0;
  if (normalized === 'static_load' || normalized === 'motor_load' || normalized === 'load' || normalized.endsWith('_load')) {
    return 270;
  }
  return 90;
}

function isMediumVoltageSampleComponent(component = {}) {
  const joined = [
    component.id,
    component.label,
    component.ref,
    component.voltage,
    component.kV,
    component.baseKV,
    component.rated_voltage_kv,
  ].map(value => String(value || '').toLowerCase()).join(' ');
  return /\b(4kv|4\.16|5kv|13\.8|15kv|mv)\b/.test(joined);
}

function normalizeSampleOneLineComponent(component = {}) {
  const rawType = normalizeSampleToken(component.type || component.category || component.subtype);
  const rawSubtype = normalizeSampleToken(component.subtype);
  const alias = SAMPLE_COMPONENT_TYPE_ALIASES[rawType] || SAMPLE_COMPONENT_TYPE_ALIASES[rawSubtype] || null;
  const type = alias?.type || rawType || rawSubtype || 'equipment';
  let subtype = rawSubtype || alias?.subtype || type;
  if (type === 'breaker' && !rawSubtype && isMediumVoltageSampleComponent(component)) {
    subtype = 'mv_cb';
  }
  const normalized = {
    ...component,
    type,
    subtype,
    connections: Array.isArray(component.connections)
      ? component.connections.map(connection => ({ ...connection }))
      : [],
  };
  if (normalized.rotation === undefined && normalized.rot === undefined) {
    normalized.rotation = sampleDefaultRotationForType(type);
  }
  return normalized;
}

function normalizeSampleOneLine(obj = {}) {
  const oneLine = obj.oneLine || obj.oneline;
  if (Array.isArray(oneLine)) {
    return { activeSheet: 0, sheets: oneLine.map(normalizeOneLineSheet) };
  }
  if (oneLine && Array.isArray(oneLine.sheets)) {
    return { activeSheet: oneLine.activeSheet || 0, sheets: oneLine.sheets.map(normalizeOneLineSheet) };
  }
  if (oneLine && (Array.isArray(oneLine.components) || Array.isArray(oneLine.connections))) {
    return {
      activeSheet: 0,
      sheets: [
        normalizeOneLineSheet({
          id: `${obj.id || 'sample'}-main`,
          name: obj.title || 'Sample One-Line',
          components: Array.isArray(oneLine.components) ? oneLine.components : [],
          connections: Array.isArray(oneLine.connections) ? oneLine.connections : [],
        }),
      ],
    };
  }
  return { activeSheet: 0, sheets: [] };
}

function normalizeOneLineSheet(sheet = {}) {
  const components = Array.isArray(sheet.components)
    ? sheet.components.map(normalizeSampleOneLineComponent)
    : [];
  const byId = new Map(components.map(component => [component.id, component]));
  const sheetConnections = Array.isArray(sheet.connections) ? sheet.connections : [];
  sheetConnections.forEach(connection => {
    if (!connection || typeof connection !== 'object') return;
    const from = connection.from || connection.fromId || connection.source || connection.sourceId;
    const to = connection.to || connection.toId || connection.target || connection.targetId;
    if (!from || !to) return;
    const source = byId.get(from);
    if (!source) return;
    const alreadyLinked = source.connections.some(existing => (
      (existing.target || existing.to || existing.targetId) === to
    ));
    if (alreadyLinked) return;
    const {
      from: _from,
      fromId: _fromId,
      source: _source,
      sourceId: _sourceId,
      to: _to,
      toId: _toId,
      target: _target,
      targetId: _targetId,
      ...rest
    } = connection;
    source.connections.push({ ...rest, target: to });
  });
  return {
    ...sheet,
    components,
    connections: sheetConnections.map(connection => ({ ...connection })),
  };
}

function resolveSampleTccLibraryDevice(device = {}, component = null) {
  const explicit = typeof device.tccId === 'string' && device.tccId.trim()
    ? device.tccId.trim()
    : (typeof device.libraryId === 'string' && device.libraryId.trim() ? device.libraryId.trim() : '');
  if (explicit) return explicit;
  const type = normalizeSampleToken(device.type || component?.type || component?.subtype);
  const curve = normalizeSampleToken(device.curve || device.curveFamily || device.style);
  if (type === 'relay') {
    if (curve.includes('extremely') || curve === 'ei') return 'iec_ei_relay';
    if (curve.includes('very') || curve === 'vi') return 'iec_vi_relay';
    if (curve.includes('long') || curve === 'lti') return 'iec_lti_relay';
    return 'iec_ni_relay';
  }
  if (type === 'fuse') {
    if (curve.includes('65e')) return 'mv_fuse_65e';
    return 'mersen_trs200r';
  }
  if (type === 'breaker') {
    const rating = Number(device.rating ?? device.ampRating ?? device.pickup);
    if (Number.isFinite(rating) && rating >= 1000) return 'sample_mv_breaker_1200';
    if (Number.isFinite(rating) && rating >= 180) return 'mitsubishi_ws_225';
    return 'abb_tmax_160';
  }
  return '';
}

function buildSampleTccOverrides(device = {}, libraryId = '') {
  const overrides = {};
  const type = normalizeSampleToken(device.type);
  const rating = Number(device.rating ?? device.ampRating);
  if (type === 'relay') {
    if (Number.isFinite(Number(device.pickup))) overrides.pickup = Number(device.pickup);
    if (Number.isFinite(Number(device.timeDial))) overrides.tms = Number(device.timeDial);
    if (Number.isFinite(Number(device.tms))) overrides.tms = Number(device.tms);
  } else if (type === 'fuse') {
    if (Number.isFinite(rating)) {
      overrides.ampRating = rating;
    } else if (normalizeSampleToken(device.style).includes('65e')) {
      overrides.ampRating = 65;
    }
  } else if (type === 'breaker') {
    if (Number.isFinite(rating)) overrides.pickup = rating;
    if (Number.isFinite(Number(device.ltDelay))) overrides.time = Number(device.ltDelay);
    if (Number.isFinite(Number(device.stPickup)) && Number.isFinite(rating)) {
      overrides.instantaneous = Number(device.stPickup) * rating;
    } else if (Number.isFinite(Number(device.instantaneous))) {
      overrides.instantaneous = Number(device.instantaneous);
    }
  }
  if (libraryId === 'sample_mv_breaker_1200' && !Number.isFinite(overrides.instantaneous)) {
    overrides.instantaneous = 9600;
  }
  return overrides;
}

function applySampleTccSettings(obj = {}, oneLine, settings) {
  const devices = Array.isArray(obj.studyInputs?.tcc?.devices) ? obj.studyInputs.tcc.devices : [];
  if (!devices.length || !oneLine || !Array.isArray(oneLine.sheets)) return settings;
  const componentMap = new Map();
  oneLine.sheets.forEach(sheet => {
    (sheet.components || []).forEach(component => {
      if (component?.id) componentMap.set(component.id, component);
    });
  });
  const existing = settings.tccSettings && typeof settings.tccSettings === 'object'
    ? settings.tccSettings
    : {};
  const nextDevices = Array.isArray(existing.devices) ? [...existing.devices] : [];
  const componentOverrides = existing.componentOverrides && typeof existing.componentOverrides === 'object'
    ? { ...existing.componentOverrides }
    : {};
  let linkedCount = 0;
  devices.forEach(device => {
    if (!device || typeof device !== 'object' || !device.id) return;
    const component = componentMap.get(device.id);
    if (!component) return;
    const libraryId = resolveSampleTccLibraryDevice(device, component);
    if (!libraryId) return;
    component.tccId = component.tccId || libraryId;
    const overrides = buildSampleTccOverrides(device, libraryId);
    if (Object.keys(overrides).length) {
      component.tccOverrides = { ...(component.tccOverrides || {}), ...overrides };
      componentOverrides[component.id] = { ...(componentOverrides[component.id] || {}), ...overrides };
    }
    const uid = `component:${component.id}`;
    if (!nextDevices.includes(uid)) nextDevices.push(uid);
    linkedCount += 1;
  });
  if (!linkedCount) return settings;
  return {
    ...settings,
    tccSettings: {
      ...existing,
      devices: nextDevices,
      settings: existing.settings && typeof existing.settings === 'object' ? existing.settings : {},
      componentOverrides,
    },
  };
}

const SAMPLE_STUDY_ALIASES = {
  heatTrace: 'heatTraceSizing',
  voltageDrop: 'voltageDropStudy',
};

function sampleOneLineComponents(oneLine = {}) {
  return Array.isArray(oneLine.sheets)
    ? oneLine.sheets.flatMap(sheet => Array.isArray(sheet.components) ? sheet.components : [])
    : [];
}

function sampleOneLineConnections(oneLine = {}) {
  if (!Array.isArray(oneLine.sheets)) return [];
  const explicit = oneLine.sheets.flatMap(sheet => Array.isArray(sheet.connections) ? sheet.connections : []);
  if (explicit.length) return explicit;
  return oneLine.sheets.flatMap(sheet => (sheet.components || []).flatMap(component =>
    (component.connections || []).map(connection => ({ from: component.id, to: connection.target || connection.to })),
  ));
}

function sampleComponentLabel(component = {}) {
  return String(component.description || component.label || component.name || component.id || 'Sample equipment')
    .replace(/\s*\n\s*/g, ' — ')
    .trim();
}

function normalizeSampleCable(cable = {}) {
  const tag = cable.tag || cable.id || cable.name || '';
  const fromTag = cable.from_tag || cable.fromTag || cable.from || cable.source || cable.source_tag || '';
  const toTag = cable.to_tag || cable.toTag || cable.to || cable.destination || cable.target || cable.load_tag || '';
  const explicitRaceways = Array.isArray(cable.raceway_ids)
    ? cable.raceway_ids
    : String(cable.raceway_ids || '').split(/[,;|>]+/).map(value => value.trim()).filter(Boolean);
  const racewayIds = explicitRaceways.length
    ? explicitRaceways
    : [cable.route_preference || cable.raceway_id || cable.conduit_id].filter(Boolean);
  return repairMojibakeDeep({
    ...cable,
    tag,
    from_tag: fromTag,
    to_tag: toTag,
    raceway_ids: racewayIds,
  });
}

function sampleComponentVoltage(component = {}) {
  const value = component.voltage ?? component.secondaryVoltage ?? component.primaryVoltage ?? component.baseKV ?? '';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value || '');
  return numeric >= 1000 ? `${numeric / 1000} kV` : String(numeric);
}

function deriveSampleEquipment(oneLine = {}, cables = []) {
  const excluded = new Set(['bus', 'utility_source', 'breaker', 'fuse', 'relay', 'annotation']);
  const equipment = sampleOneLineComponents(oneLine)
    .filter(component => component?.id && !excluded.has(normalizeSampleToken(component.type)))
    .map(component => ({
      tag: component.id,
      description: sampleComponentLabel(component),
      voltage: sampleComponentVoltage(component),
      category: normalizeSampleToken(component.type).replace(/_/g, ' '),
      subCategory: normalizeSampleToken(component.subtype || component.type).replace(/_/g, ' '),
      arrangement: 'Sample project',
      lineup: component.id,
      manufacturer: 'Sample basis',
      model: 'Demonstration record',
      phases: '3',
    }));
  const knownTags = new Set(equipment.map(row => row.tag));
  cables.flatMap(cable => [cable.from_tag || cable.from, cable.to_tag || cable.to]).filter(Boolean).forEach(tag => {
    if (knownTags.has(tag)) return;
    knownTags.add(tag);
    equipment.push({
      tag,
      description: `${tag} cable endpoint`,
      voltage: '',
      category: 'Cable endpoint',
      subCategory: 'Referenced equipment',
      arrangement: 'Sample project',
      lineup: tag,
      manufacturer: 'Sample basis',
      model: 'Demonstration record',
      phases: '3',
    });
  });
  return equipment;
}

function deriveSampleLoads(oneLine = {}) {
  const components = sampleOneLineComponents(oneLine);
  const incoming = new Map();
  sampleOneLineConnections(oneLine).forEach(connection => {
    const from = connection.from || connection.fromId || connection.source || connection.sourceId;
    const to = connection.to || connection.toId || connection.target || connection.targetId;
    if (from && to && !incoming.has(to)) incoming.set(to, from);
  });
  return components
    .filter(component => ['motor_load', 'static_load'].includes(normalizeSampleToken(component.type)))
    .map(component => {
      const label = sampleComponentLabel(component);
      const labelKw = Number(label.match(/([\d.]+)\s*kW/i)?.[1]);
      const hp = Number(component.hp || label.match(/([\d.]+)\s*HP/i)?.[1]);
      const kw = Number.isFinite(Number(component.kw))
        ? Number(component.kw)
        : (Number.isFinite(labelKw) ? labelKw : (Number.isFinite(hp) ? Number((hp * 0.746).toFixed(1)) : 10));
      return {
        source: incoming.get(component.id) || 'Sample source',
        tag: component.id,
        description: label,
        quantity: '1',
        voltage: sampleComponentVoltage(component) || '480',
        loadType: normalizeSampleToken(component.type) === 'motor_load' ? 'Motor' : 'Process',
        duty: 'Continuous',
        kw: String(kw),
        powerFactor: '0.90',
        loadFactor: '100',
        efficiency: '95',
        demandFactor: '100',
        phases: '3',
        circuit: `${incoming.get(component.id) || 'SAMPLE'}-${component.id}`,
      };
    });
}

function deriveSamplePanels(oneLine = {}) {
  return sampleOneLineComponents(oneLine)
    .filter(component => normalizeSampleToken(component.type) === 'panelboard')
    .map(component => ({
      id: component.id,
      name: component.id,
      voltage: sampleComponentVoltage(component) || '480',
      description: sampleComponentLabel(component),
      circuits: [],
    }));
}

function deriveSampleMccLineups(oneLine = {}) {
  return sampleOneLineComponents(oneLine)
    .filter(component => normalizeSampleToken(component.type) === 'mcc')
    .map(component => ({
      id: component.id,
      tag: component.id,
      name: component.id,
      voltage: sampleComponentVoltage(component) || '480',
      description: sampleComponentLabel(component),
      sections: [],
    }));
}

function seedSampleStudies(obj = {}, settings = {}) {
  const existing = settings.studyResults && typeof settings.studyResults === 'object'
    ? settings.studyResults
    : (settings.studies && typeof settings.studies === 'object' ? settings.studies : {});
  const studyResults = { ...existing };
  Object.entries(existing).forEach(([rawKey, result]) => {
    const key = SAMPLE_STUDY_ALIASES[rawKey];
    if (key && !studyResults[key]) studyResults[key] = result;
  });
  const studyInputs = obj.studyInputs && typeof obj.studyInputs === 'object' ? obj.studyInputs : {};
  Object.entries(studyInputs).forEach(([rawKey, inputs]) => {
    if (rawKey === 'tcc' || !inputs || typeof inputs !== 'object') return;
    const key = SAMPLE_STUDY_ALIASES[rawKey] || rawKey;
    if (studyResults[key]) return;
    studyResults[key] = {
      ...inputs,
      inputs: { ...inputs },
      status: 'Sample inputs ready',
      sample: true,
    };
  });
  return {
    ...settings,
    sampleStudyInputs: { ...studyInputs },
    studyResults,
  };
}

function deriveSampleRouteResults(cables = [], settings = {}) {
  if (settings.latestRouteResults?.batchResults?.length) {
    return {
      ...settings,
      latestRouteResults: normalizeRouteResultState(settings.latestRouteResults, { cables })
    };
  }
  if (!cables.length) return settings;
  const batchResults = cables
    .filter(cable => cable.route_preference || cable.raceway_ids?.length)
    .map(cable => {
      const racewayId = cable.route_preference || cable.raceway_ids[0];
      const length = Number(cable.length_ft ?? cable.length ?? 0);
      return {
        cable: cable.tag || cable.id || cable.name,
        status: 'Routed',
        mode: 'Sample route',
        total_length: length,
        breakdown: [{
          raceway_id: racewayId,
          length,
          start: [cable.start_x, cable.start_y, cable.start_z],
          end: [cable.end_x, cable.end_y, cable.end_z]
        }],
        route_segments: [{
          type: 'raceway',
          raceway_id: racewayId,
          length,
          start: [cable.start_x, cable.start_y, cable.start_z],
          end: [cable.end_x, cable.end_y, cable.end_z]
        }],
      };
    });
  if (!batchResults.length) return settings;
  return {
    ...settings,
    latestRouteResults: normalizeRouteResultState({
      source: 'sample',
      updatedAt: '2026-05-01T12:00:00.000Z',
      batchResults,
    }, { cables }),
  };
}

export function sampleProjectToImportPayload(obj = {}) {
  const raceways = obj.raceways || {};
  const oneLine = normalizeSampleOneLine(obj);
  let settings = { ...(obj.settings || {}) };
  ['studies', 'reportSnapshots', 'lifecyclePackages', 'oneLineScheduleReconcilePending'].forEach(key => {
    if (Object.prototype.hasOwnProperty.call(obj, key) && !Object.prototype.hasOwnProperty.call(settings, key)) {
      settings[key] = obj[key];
    }
  });
  settings = applySampleTccSettings(obj, oneLine, settings);
  settings = seedSampleStudies(obj, settings);
  const cables = Array.isArray(obj.cables) ? obj.cables.map(normalizeSampleCable) : [];
  settings = deriveSampleRouteResults(cables, settings);
  const equipment = Array.isArray(obj.equipment) && obj.equipment.length
    ? obj.equipment
    : deriveSampleEquipment(oneLine, cables);
  const loads = Array.isArray(obj.loads) && obj.loads.length
    ? obj.loads
    : deriveSampleLoads(oneLine);
  return repairMojibakeDeep({
    meta: obj.meta || { version: 1, scenario: 'default', scenarios: ['default'] },
    ductbanks: Array.isArray(obj.ductbanks) ? obj.ductbanks : (Array.isArray(raceways.ductbanks) ? raceways.ductbanks : []),
    conduits: Array.isArray(obj.conduits) ? obj.conduits : (Array.isArray(raceways.conduits) ? raceways.conduits : []),
    trays: Array.isArray(obj.trays) ? obj.trays : (Array.isArray(raceways.trays) ? raceways.trays : []),
    cables,
    cableTypicals: Array.isArray(obj.cableTypicals) ? obj.cableTypicals : [],
    panels: Array.isArray(obj.panels) && obj.panels.length ? obj.panels : deriveSamplePanels(oneLine),
    equipment,
    loads,
    oneLine,
    mccLineups: Array.isArray(obj.mccLineups) && obj.mccLineups.length ? obj.mccLineups : deriveSampleMccLineups(oneLine),
    settings
  });
}

const SAMPLE_PAGE_STUDY_KEYS = {
  'arcFlash.html': 'arcFlash',
  'groundgrid.html': 'groundGrid',
  'heattracesizing.html': 'heatTraceSizing',
  'iec60287.html': 'iec60287',
  'loadFlow.html': 'loadFlow',
  'motorStart.html': 'motorStart',
  'shortCircuit.html': 'shortCircuit',
  'voltagedropstudy.html': 'voltageDropStudy',
};

export function auditSampleDemonstration(sample, obj = {}) {
  const errors = [];
  const payload = sampleProjectToImportPayload(obj);
  const pages = new Set(sample?.pagesUsed || []);
  const components = sampleOneLineComponents(payload.oneLine);
  const connections = sampleOneLineConnections(payload.oneLine);
  const studies = payload.settings.studyResults || {};
  const racewayCount = payload.trays.length + payload.conduits.length + payload.ductbanks.length;
  const equipmentTags = new Set([
    ...payload.equipment.map(row => row.tag || row.id),
    ...payload.loads.map(row => row.tag || row.id),
  ].filter(Boolean));
  const unresolvedEndpoints = payload.cables.flatMap(cable => [cable.from_tag || cable.from, cable.to_tag || cable.to])
    .filter(tag => tag && !equipmentTags.has(tag));
  const racewayIds = new Set([
    ...payload.trays.map(row => row.tray_id || row.id),
    ...payload.conduits.map(row => row.conduit_id || row.id),
    ...payload.ductbanks.map(row => row.ductbank_id || row.id || row.tag),
    ...payload.ductbanks.flatMap(row => (row.conduits || []).map(conduit => conduit.conduit_id || conduit.id)),
  ].filter(Boolean));
  const unresolvedRaceways = payload.cables
    .map(cable => cable.route_preference || cable.raceway_ids?.[0])
    .filter(id => id && !racewayIds.has(id));

  if (payload.cables.length < 2) errors.push('needs at least two cable records');
  if (unresolvedEndpoints.length) errors.push(`unresolved cable endpoints: ${[...new Set(unresolvedEndpoints)].join(', ')}`);
  if (unresolvedRaceways.length) errors.push(`unresolved raceway references: ${[...new Set(unresolvedRaceways)].join(', ')}`);
  if (pages.has('equipmentlist.html') && payload.equipment.length < 3) errors.push('Equipment List needs at least three records');
  if (pages.has('loadlist.html') && payload.loads.length < 2) errors.push('Load List needs at least two records');
  if (pages.has('oneline.html') && (components.length < 4 || connections.length < 3)) {
    errors.push('One-Line needs at least four components and three connections');
  }
  if ([...pages].some(page => ['racewayschedule.html', 'cabletrayfill.html', 'conduitfill.html', 'ductbankroute.html'].includes(page)) && racewayCount < 1) {
    errors.push('raceway demonstrations need at least one raceway');
  }
  if ([...pages].some(page => ['cabletrayfill.html', 'ductbankroute.html'].includes(page)) && !payload.settings.latestRouteResults?.batchResults?.length) {
    errors.push('routing demonstrations need routed cable results');
  }
  Object.entries(SAMPLE_PAGE_STUDY_KEYS).forEach(([page, key]) => {
    if (pages.has(page) && !studies[key]) errors.push(`${page} needs seeded ${key} data`);
  });
  if (pages.has('tcc.html') && (payload.settings.tccSettings?.devices?.length || 0) < 3) {
    errors.push('TCC needs at least three linked protective devices');
  }
  if (pages.has('projectreport.html') && !Object.keys(payload.settings.reportSnapshots || {}).length) {
    errors.push('Project Report needs at least one report snapshot');
  }
  return { adequate: errors.length === 0, errors, payload };
}
