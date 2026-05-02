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
  { key: 'fill',        label: 'Raceway Fill',         group: 'Construction' },
  { key: 'clashes',     label: 'Clash Detection',      group: 'Construction' },
  { key: 'spools',      label: 'Spool Sheets',         group: 'Construction' },
  { key: 'drc',         label: 'Design Rule Check',   group: 'Construction' },
  // ── Studies ───────────────────────────────────────────────────────────────
  { key: 'arcFlash',      label: 'Arc Flash',           group: 'Studies', studyKey: 'arcFlash' },
  { key: 'shortCircuit',  label: 'Short Circuit',       group: 'Studies', studyKey: 'shortCircuit' },
  { key: 'loadFlow',      label: 'Load Flow',           group: 'Studies', studyKey: 'loadFlow' },
  { key: 'harmonics',     label: 'Harmonics',           group: 'Studies', studyKey: 'harmonics' },
  { key: 'motorStart',    label: 'Motor Starting',      group: 'Studies', studyKey: 'motorStart' },
  { key: 'voltageDrop',   label: 'Voltage Drop Study',  group: 'Studies', studyKey: 'voltageDropStudy' },
  { key: 'heatTrace',     label: 'Heat Trace',          group: 'Studies', studyKey: 'heatTraceSizing' },
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
    description: 'Protection coordination, arc flash, load flow, harmonics, and motor starting results.',
    sections: ['cover', 'toc', 'revisions', 'arcFlash', 'shortCircuit', 'loadFlow', 'harmonics', 'motorStart'],
  },
  construction: {
    label: 'Construction Cable Package',
    description: 'Cable schedule, raceway fill, clashes, spool sheets, and design rule check.',
    sections: ['cover', 'toc', 'revisions', 'assumptions', 'cables', 'fill', 'clashes', 'spools', 'drc'],
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
export function getAvailableSections({ studies = {}, cables = [], trays = [], drcResults = [] } = {}) {
  const available = new Set();

  // Meta always available
  available.add('cover');
  available.add('toc');
  available.add('revisions');
  available.add('assumptions');

  // Construction
  if (cables.length > 0) available.add('cables');
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
      builtSections.toc = {
        key: 'toc',
        title: 'Table of Contents',
        entries: sections
          .filter(k => k !== 'cover' && k !== 'toc')
          .map(k => {
            const d = getSectionDef(k);
            return { key: k, label: d ? d.label : k };
          }),
      };
    } else if (key === 'revisions') {
      builtSections.revisions = { key: 'revisions', title: 'Revision History', rows: revTable };
    } else if (key === 'assumptions') {
      builtSections.assumptions = { key: 'assumptions', title: 'Assumptions / Basis of Design', text: String(assumptions) };
    } else if (sectionData[key]) {
      builtSections[key] = sectionData[key];
    }
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
