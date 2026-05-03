/**
 * Sample Project Gallery registry and utilities for Gap #81.
 * Pure ESM module — no DOM dependencies.
 */

export const SCHEMA_VERSION = 1;

export const SAMPLE_REGISTRY = [
  {
    id: 'industrial-plant',
    title: 'Industrial Plant',
    industry: 'Oil & Gas / Industrial',
    description: '480 V MCC feeders, motor cables, VFD shielded outputs, and instrument triads in hazardous-area ladder and solid-bottom trays.',
    tags: ['routing', 'tray-fill', 'arc-flash', 'tcc'],
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
    id: 'data-center',
    title: 'Data Center',
    industry: 'Data Center / IT',
    description: 'Redundant A/B 480 V UPS feeds, 208 V PDU branches, overhead OM4/OS2 fiber backbone, and Cat6A horizontal distribution in hot/cold aisle layout.',
    tags: ['routing', 'tray-fill', 'load-flow', 'voltage-drop'],
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
  if (typeof obj.raceways !== 'object' || obj.raceways === null) {
    errors.push('Missing raceways object');
  } else {
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
