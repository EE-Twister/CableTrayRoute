/**
 * Report Package Builder — section registry, preset configs, and package assembly.
 *
 * This module is pure computation (no DOM, no dataStore imports) so it can be
 * tested in Node without a browser environment.  The page script
 * (src/projectreport.js) is responsible for reading project data and passing
 * it in via buildReportPackage().
 */

// ---------------------------------------------------------------------------
// Section registry
// ---------------------------------------------------------------------------

/**
 * @typedef {{ key: string, label: string, group: string, studyKey?: string }} SectionDef
 */

/** All sections that can appear in a report package, in default display order. */
export const SECTION_REGISTRY = [
  // ── Meta ──────────────────────────────────────────────────────────────────
  { key: 'cover',       label: 'Cover Sheet',         group: 'Meta' },
  { key: 'toc',         label: 'Table of Contents',   group: 'Meta' },
  { key: 'revisions',   label: 'Revision History',    group: 'Meta' },
  { key: 'assumptions', label: 'Assumptions / Basis', group: 'Meta' },
  // ── Construction ──────────────────────────────────────────────────────────
  { key: 'cables',      label: 'Cable Schedule',      group: 'Construction' },
  { key: 'equipment',   label: 'Equipment Schedule',  group: 'Construction' },
  { key: 'loads',       label: 'Load Schedule',       group: 'Construction' },
  { key: 'raceways',    label: 'Raceway Schedule',    group: 'Construction' },
  { key: 'routing',     label: 'Routing Summary',     group: 'Construction' },
  { key: 'fill',        label: 'Raceway Fill',         group: 'Construction' },
  { key: 'clashes',     label: 'Clash Detection',      group: 'Construction' },
  { key: 'spools',      label: 'Spool Sheets',         group: 'Construction' },
  { key: 'pullPlans',   label: 'Pull Plans',           group: 'Construction' },
  { key: 'procurement', label: 'Procurement Register', group: 'Construction' },
  { key: 'costEstimate', label: 'Cost Estimate',        group: 'Construction' },
  { key: 'fieldExecution', label: 'Field Execution Register', group: 'Construction' },
  { key: 'deliverables', label: 'Deliverable Register', group: 'Construction' },
  { key: 'drc',         label: 'Design Rule Check',   group: 'Construction' },
  // ── Studies ───────────────────────────────────────────────────────────────
  { key: 'arcFlash',      label: 'Arc Flash',           group: 'Studies', studyKey: 'arcFlash' },
  { key: 'shortCircuit',  label: 'Short Circuit',       group: 'Studies', studyKey: 'shortCircuit' },
  { key: 'loadFlow',      label: 'Load Flow',           group: 'Studies', studyKey: 'loadFlow' },
  { key: 'harmonics',     label: 'Harmonics',           group: 'Studies', studyKey: 'harmonics' },
  { key: 'motorStart',    label: 'Motor Starting',      group: 'Studies', studyKey: 'motorStart' },
  { key: 'voltageDrop',   label: 'Voltage Drop Study',  group: 'Studies', studyKey: 'voltageDropStudy' },
  { key: 'reliability',   label: 'Reliability Analysis', group: 'Studies', studyKey: 'reliability' },
  { key: 'quasiDynamic',  label: 'Quasi-Dynamic Load Flow', group: 'Advanced Studies', studyKey: 'quasiDynamic' },
  { key: 'probabilisticLoadFlow', label: 'Probabilistic Load Flow', group: 'Advanced Studies', studyKey: 'probabilisticLoadFlow' },
  { key: 'contingency',    label: 'N-1 Contingency', group: 'Advanced Studies', studyKey: 'contingency' },
  { key: 'voltageStability', label: 'Voltage Stability', group: 'Advanced Studies', studyKey: 'voltageStability' },
  { key: 'frequencyScan',  label: 'Frequency Scan', group: 'Advanced Studies', studyKey: 'frequencyScan' },
  { key: 'transientStability', label: 'Transient Stability', group: 'Advanced Studies', studyKey: 'transientStability' },
  { key: 'optimalPowerFlow', label: 'Optimal Power Flow', group: 'Advanced Studies', studyKey: 'optimalPowerFlow' },
  { key: 'heatTrace',       label: 'Heat Trace',            group: 'Studies', studyKey: 'heatTraceSizing' },
  { key: 'sustainability',  label: 'Sustainability Footprint', group: 'Studies', studyKey: 'sustainabilityFootprint' },
  { key: 'tccSettings',     label: 'TCC Settings Manifest', group: 'Studies', studyKey: 'tcc' },
  { key: 'hazAreaClass',    label: 'Hazardous Area Classification', group: 'Studies', studyKey: 'hazAreaClassification' },
  { key: 'insulationCoord', label: 'Insulation Coordination (BIL/SIL)', group: 'Studies', studyKey: 'insulationCoordination' },
  { key: 'lighting',        label: 'Egress Lighting (NFPA 101)',       group: 'Studies', studyKey: 'lighting' },
];

/** Lookup a section definition by key. */
export function getSectionDef(key) {
  return SECTION_REGISTRY.find(s => s.key === key) || null;
}

// ---------------------------------------------------------------------------
// Preset configurations
// ---------------------------------------------------------------------------

/**
 * @typedef {{ label: string, description: string, sections: string[] }} PresetConfig
 */

/** Named preset configurations that pre-select a curated set of sections. */
export const PRESET_CONFIGS = {
  electrical: {
    label: 'Electrical Studies',
    description: 'Protection coordination, arc flash, load flow, voltage drop, reliability, harmonics, and motor starting results.',
    sections: [
      'cover', 'toc', 'revisions', 'arcFlash', 'shortCircuit', 'loadFlow', 'harmonics', 'motorStart',
      'voltageDrop', 'reliability',
      'quasiDynamic', 'probabilisticLoadFlow', 'contingency', 'voltageStability',
      'frequencyScan', 'transientStability', 'optimalPowerFlow', 'tccSettings',
    ],
  },
  construction: {
    label: 'Construction Cable Package',
    description: 'Equipment, load, cable, raceway, routing, pull, procurement, field, and design-check records.',
    sections: [
      'cover', 'toc', 'revisions', 'assumptions', 'equipment', 'loads', 'cables',
      'raceways', 'routing', 'fill', 'clashes', 'spools', 'pullPlans',
      'procurement', 'costEstimate', 'fieldExecution', 'deliverables', 'drc',
    ],
  },
  heatTrace: {
    label: 'Heat Trace Package',
    description: 'Heat trace line list, BOM, and controller schedule.',
    sections: ['cover', 'toc', 'revisions', 'assumptions', 'heatTrace'],
  },
  grounding: {
    label: 'Grounding Report',
    description: 'Ground grid design basis and assumptions.',
    sections: ['cover', 'toc', 'revisions', 'assumptions'],
  },
  ownerTurnover: {
    label: 'Owner Turnover',
    description: 'Complete project deliverable package — all available sections.',
    sections: SECTION_REGISTRY.map(s => s.key),
  },
  bimHandoff: {
    label: 'IFC / BIM Handoff',
    description: 'Cable and raceway data for BIM coordination and COBie handover.',
    sections: ['cover', 'toc', 'cables', 'fill'],
  },
  sustainability: {
    label: 'Sustainability Report',
    description: 'Embodied CO₂e (Scope 3) and operating CO₂e (Scope 2) footprint with category breakdown and grid factor basis.',
    sections: ['cover', 'toc', 'revisions', 'assumptions', 'sustainability', 'cables'],
  },
  hazardousArea: {
    label: 'Hazardous Area Report',
    description: 'NEC 500–505 / IEC 60079 area classification drawing, equipment compatibility matrix, and Ex-protection register.',
    sections: ['cover', 'toc', 'revisions', 'assumptions', 'hazAreaClass', 'drc'],
  },
  egress: {
    label: 'Egress Lighting Report',
    description: 'NFPA 101 §7.9.2 egress illuminance compliance — lumen method summary and point-by-point grid.',
    sections: ['cover', 'toc', 'revisions', 'assumptions', 'lighting'],
  },
};

// ---------------------------------------------------------------------------
// Available-section detection
// ---------------------------------------------------------------------------

/**
 * Return the set of section keys that have data in the current project.
 * Meta sections (cover, toc, revisions, assumptions) are always available.
 * Construction sections (cables, fill, clashes, spools, drc) are available
 * when the corresponding arrays are non-empty.
 * Study sections are available when the study results object is non-null.
 *
 * @param {{ studies: object, cables: any[], trays: any[], drcResults: any[] }} projectData
 * @returns {Set<string>}
 */
export function getAvailableSections({
  studies = {},
  cables = [],
  trays = [],
  conduits = [],
  ductbanks = [],
  equipment = [],
  loads = [],
  routeResults = [],
  pullPlans = [],
  procurement = [],
  costEstimate = null,
  fieldExecution = [],
  deliverables = [],
  drcResults = [],
} = {}) {
  const available = new Set();

  // Meta always available
  available.add('cover');
  available.add('toc');
  available.add('revisions');
  available.add('assumptions');

  // Construction
  if (cables.length > 0) available.add('cables');
  if (equipment.length > 0) available.add('equipment');
  if (loads.length > 0) available.add('loads');
  if (trays.length > 0 || conduits.length > 0 || ductbanks.length > 0) available.add('raceways');
  if ((Array.isArray(routeResults) && routeResults.length > 0) || (!Array.isArray(routeResults) && routeResults && Object.keys(routeResults).length > 0)) available.add('routing');
  if ((Array.isArray(pullPlans) && pullPlans.length > 0) || (!Array.isArray(pullPlans) && pullPlans && Object.keys(pullPlans).length > 0)) available.add('pullPlans');
  if (Array.isArray(procurement) && procurement.length > 0) available.add('procurement');
  if (costEstimate && typeof costEstimate === 'object' && Object.keys(costEstimate).length > 0) available.add('costEstimate');
  if (Array.isArray(fieldExecution) && fieldExecution.length > 0) available.add('fieldExecution');
  if (Array.isArray(deliverables) && deliverables.length > 0) available.add('deliverables');
  if (trays.length > 0)  { available.add('fill'); available.add('clashes'); available.add('spools'); }
  if (drcResults.length > 0) available.add('drc');

  // Studies — available when the study key exists and is non-null
  for (const def of SECTION_REGISTRY) {
    if (def.studyKey && studies[def.studyKey] != null) {
      available.add(def.key);
    }
  }

  return available;
}

// ---------------------------------------------------------------------------
// Cover sheet / revision builders
// ---------------------------------------------------------------------------

/**
 * Build a normalized cover sheet data object from user-entered fields.
 *
 * @param {object} fields
 * @returns {{ projectName, client, engineer, license, date, revisionNumber, notes }}
 */
export function buildCoverSheet(fields = {}) {
  return {
    projectName:    String(fields.projectName    || 'Untitled Project'),
    client:         String(fields.client         || ''),
    engineer:       String(fields.engineer       || ''),
    license:        String(fields.license        || ''),
    date:           String(fields.date           || new Date().toISOString().slice(0, 10)),
    revisionNumber: String(fields.revisionNumber || '0'),
    notes:          String(fields.notes          || ''),
  };
}

/**
 * Build a validated revision history array.
 * Input rows that are missing rev number or date are filtered out.
 * Output is sorted ascending by revision number.
 *
 * @param {Array<{ rev: string|number, date: string, description: string, by: string }>} rows
 * @returns {Array<{ rev: string, date: string, description: string, by: string }>}
 */
export function buildRevisionTable(rows = []) {
  return rows
    .filter(r => r && (r.rev != null && r.rev !== '') && r.date)
    .map(r => ({
      rev:         String(r.rev),
      date:        String(r.date),
      description: String(r.description || ''),
      by:          String(r.by || ''),
    }))
    .sort((a, b) => {
      const na = parseFloat(a.rev);
      const nb = parseFloat(b.rev);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.rev.localeCompare(b.rev);
    });
}

// ---------------------------------------------------------------------------
// Package assembly
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   id: string,
 *   generatedAt: string,
 *   config: { sections: string[], coverSheet: object, revisions: any[], assumptions: string },
 *   sections: { [key: string]: object },
 * }} ReportPackage
 */

/**
 * Assemble a ReportPackage from a config and pre-built section data.
 *
 * @param {{
 *   sections: string[],
 *   coverSheet?: object,
 *   revisions?: any[],
 *   assumptions?: string,
 * }} config
 * @param {{ [sectionKey: string]: object }} sectionData - pre-built section objects keyed by section key
 * @returns {ReportPackage}
 */
export function buildReportPackage(config = {}, sectionData = {}) {
  const {
    sections = [],
    coverSheet = {},
    revisions = [],
    assumptions = '',
  } = config;

  const cover    = buildCoverSheet(coverSheet);
  const revTable = buildRevisionTable(revisions);

  const builtSections = {};
  for (const key of sections) {
    const def = getSectionDef(key);
    if (!def) continue;

    if (key === 'cover') {
      builtSections.cover = { key: 'cover', title: 'Cover Sheet', data: cover };
    } else if (key === 'toc') {
      builtSections.toc = { key: 'toc', title: 'Table of Contents', entries: [] };
    } else if (key === 'revisions') {
      builtSections.revisions = { key: 'revisions', title: 'Revision History', rows: revTable };
    } else if (key === 'assumptions') {
      builtSections.assumptions = { key: 'assumptions', title: 'Assumptions / Basis of Design', text: String(assumptions) };
    } else if (sectionData[key]) {
      builtSections[key] = sectionData[key];
    } else {
      builtSections[key] = {
        key,
        title: def.label,
        unavailable: true,
      };
    }
  }

  if (builtSections.toc) {
    builtSections.toc.entries = sections
      .filter(key => key !== 'cover' && key !== 'toc' && builtSections[key])
      .map(key => ({ key, label: getSectionDef(key)?.label || key }));
  }

  return {
    id: `pkg-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    config: { sections, coverSheet: cover, revisions: revTable, assumptions: String(assumptions) },
    sections: builtSections,
  };
}

// ---------------------------------------------------------------------------
// Snapshot helper
// ---------------------------------------------------------------------------

/**
 * Return a JSON-serializable snapshot of a ReportPackage.
 * Strips any non-serializable values (functions, DOM nodes) defensively.
 *
 * @param {ReportPackage} pkg
 * @returns {object}
 */
export function snapshotPackage(pkg) {
  return JSON.parse(JSON.stringify(pkg));
}

// ---------------------------------------------------------------------------
// XLSX sheet data helpers
// ---------------------------------------------------------------------------

/**
 * Convert a built section into an array-of-arrays suitable for SheetJS
 * `XLSX.utils.aoa_to_sheet`.  Returns null for sections with no tabular data
 * (cover, toc, revisions are handled specially).
 *
 * @param {object} section - a built section object from buildReportPackage
 * @returns {any[][] | null}
 */
export function sectionToAOA(section) {
  if (!section) return null;
  const key = section.key;

  if (key === 'revisions') {
    const rows = section.rows || [];
    if (!rows.length) return [['Rev', 'Date', 'Description', 'By']];
    return [
      ['Rev', 'Date', 'Description', 'By'],
      ...rows.map(r => [r.rev, r.date, r.description, r.by]),
    ];
  }

  if (key === 'assumptions') {
    return [['Assumptions / Basis of Design'], [section.text || '']];
  }

  // Generic: expect section to have { rows: object[], headers?: string[] }
  // or { rows: object[] } where headers are derived from the first row.
  const rows = section.rows || section.cables?.rows || [];
  if (!rows.length) return null;

  const headers = section.headers || Object.keys(rows[0]);
  return [
    headers,
    ...rows.map(r => headers.map(h => r[h] ?? '')),
  ];
}
