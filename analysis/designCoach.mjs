/**
 * Cross-Study Design Coach (Gap #79)
 *
 * Pure computation module — no DOM, no direct storage access.
 * Aggregates violations from all study domains and returns ranked,
 * actionable recommendations with deterministic ids.
 *
 * Caller is responsible for supplying aggregated project data.
 */

import { NEC_AMPACITY_TABLE } from './autoSize.mjs';
import { runVoltageDropStudy, NEC_LIMITS } from './voltageDropStudy.mjs';
import { trayFillPercent } from './designRuleChecker.mjs';
import { evaluateEquipment, EVAL_STATUS } from './equipmentEvaluation.mjs';

/**
 * @typedef {{
 *   id: string,
 *   sourceStudy: string,
 *   severity: 'safety'|'compliance'|'efficiency'|'missing_data',
 *   title: string,
 *   detail: string,
 *   location: string,
 *   studyPage: string,
 *   safe_to_apply: boolean,
 *   suggestedValue?: string,
 *   tradeoffs?: string,
 * }} Recommendation
 */

export const SEVERITY_ORDER = ['safety', 'compliance', 'efficiency', 'missing_data'];

const SEVERITY_RANK = { safety: 0, compliance: 1, efficiency: 2, missing_data: 3 };

// ---------------------------------------------------------------------------
// Conductor upsize helper
// ---------------------------------------------------------------------------

/**
 * Return the next larger conductor size from the NEC ampacity table.
 * @param {string} currentSize - e.g. '1/0 AWG'
 * @returns {string|null}
 */
export function nextLargerConductor(currentSize) {
  const idx = NEC_AMPACITY_TABLE.findIndex(r => r.size === currentSize);
  if (idx < 0 || idx >= NEC_AMPACITY_TABLE.length - 1) return null;
  return NEC_AMPACITY_TABLE[idx + 1].size;
}

// ---------------------------------------------------------------------------
// Rule extractors
// ---------------------------------------------------------------------------

/**
 * Voltage-drop recommendations from cable schedule.
 * Calls runVoltageDropStudy internally — caller passes raw cables array.
 * @param {object[]} cables
 * @returns {Recommendation[]}
 */
export function extractVoltageDropRecs(cables) {
  if (!Array.isArray(cables) || !cables.length) return [];
  const { results } = runVoltageDropStudy(cables);
  const recs = [];

  for (const r of results) {
    if (r.status === 'fail') {
      const next = nextLargerConductor(r.conductorSize);
      const tag = r.tag || r.cable_id || 'unknown';
      recs.push({
        id: `vd:${tag}`,
        sourceStudy: 'voltageDropStudy',
        severity: 'compliance',
        title: `Increase cable ${tag} conductor${next ? ` to ${next}` : ''}`,
        detail: `Voltage drop ${r.dropPct.toFixed(1)}% exceeds the NEC ${r.circuitType} limit of ${r.limit}%. ` +
          (next
            ? `Upsizing from ${r.conductorSize} to ${next} will reduce resistance and drop.`
            : `Consider shortening the route or splitting the load.`),
        location: tag,
        studyPage: 'voltagedropstudy.html',
        safe_to_apply: !!next,
        suggestedValue: next || undefined,
        tradeoffs: next ? 'Larger conductor increases material cost and tray fill.' : undefined,
      });
    } else if (r.status === 'warn') {
      const tag = r.tag || r.cable_id || 'unknown';
      recs.push({
        id: `vd-warn:${tag}`,
        sourceStudy: 'voltageDropStudy',
        severity: 'efficiency',
        title: `Cable ${tag} approaching voltage drop limit (${r.dropPct.toFixed(1)}%)`,
        detail: `Voltage drop ${r.dropPct.toFixed(1)}% is within 20% of the NEC ${r.circuitType} limit of ${r.limit}%. ` +
          `Monitor during final load calculations.`,
        location: tag,
        studyPage: 'voltagedropstudy.html',
        safe_to_apply: false,
      });
    }
  }

  return recs;
}

/**
 * Arc flash recommendations from stored arc flash results.
 * @param {object} arcFlashResults - value from getStudies().arcFlash
 * @returns {Recommendation[]}
 */
export function extractArcFlashRecs(arcFlashResults) {
  if (!arcFlashResults) return [];
  const entries = Array.isArray(arcFlashResults) ? arcFlashResults
    : Object.values(arcFlashResults);
  const recs = [];

  for (const entry of entries) {
    const busId = entry.busId || entry.id || entry.bus || 'unknown';
    const ie = Number(entry.incidentEnergy);

    if (Number.isFinite(ie) && ie > 40) {
      recs.push({
        id: `af:${busId}`,
        sourceStudy: 'arcFlash',
        severity: 'safety',
        title: `Reduce arc flash exposure at ${busId} (${ie.toFixed(1)} cal/cm²)`,
        detail: `Incident energy ${ie.toFixed(1)} cal/cm² exceeds the IEEE 1584-2018 PPE Category 4 maximum of 40 cal/cm². ` +
          `Options: add upstream current-limiting fuse, reduce clearing time of protective device, or install remote racking.`,
        location: busId,
        studyPage: 'arcflash.html',
        safe_to_apply: false,
        tradeoffs: 'Reducing clearing time may affect selectivity with downstream devices.',
      });
    }

    if (Array.isArray(entry.requiredInputs) && entry.requiredInputs.length) {
      entry.requiredInputs.forEach(msg => {
        const msgKey = msg.replace(/\W+/g, '-').slice(0, 30);
        recs.push({
          id: `af-data:${busId}:${msgKey}`,
          sourceStudy: 'arcFlash',
          severity: 'missing_data',
          title: `Arc flash at ${busId} needs additional input`,
          detail: msg,
          location: busId,
          studyPage: 'arcflash.html',
          safe_to_apply: false,
        });
      });
    }
  }

  return recs;
}

/**
 * Short-circuit recommendations — forwards bus-level warnings from runShortCircuit results.
 * @param {object} scResults - keyed by bus/component id: { [id]: { warnings?, ... } }
 * @returns {Recommendation[]}
 */
export function extractShortCircuitRecs(scResults) {
  if (!scResults || typeof scResults !== 'object') return [];
  const recs = [];

  for (const [busId, entry] of Object.entries(scResults)) {
    if (Array.isArray(entry.warnings) && entry.warnings.length) {
      entry.warnings.forEach((w, idx) => {
        recs.push({
          id: `sc:${busId}:${idx}`,
          sourceStudy: 'shortCircuit',
          severity: 'compliance',
          title: `Short-circuit warning at ${busId}`,
          detail: w,
          location: busId,
          studyPage: 'shortcircuit.html',
          safe_to_apply: false,
        });
      });
    }
  }

  return recs;
}

/**
 * Tray fill recommendations.
 * @param {object[]} trays
 * @returns {Recommendation[]}
 */
export function extractTrayFillRecs(trays) {
  if (!Array.isArray(trays) || !trays.length) return [];
  const recs = [];

  for (const tray of trays) {
    const pct = trayFillPercent(tray);
    if (pct === null) continue;
    const id = tray.tray_id || tray.id || 'unknown';

    if (pct > 40) {
      recs.push({
        id: `fill:${id}`,
        sourceStudy: 'trayFill',
        severity: 'compliance',
        title: `Reduce fill on tray ${id} (${pct.toFixed(0)}%)`,
        detail: `Tray ${id} is ${pct.toFixed(1)}% full, exceeding the NEC 392.22(A) 40% fill limit. ` +
          `Reroute cables to adjacent trays or increase tray width.`,
        location: id,
        studyPage: 'cabletrayfill.html',
        safe_to_apply: false,
        tradeoffs: 'Rerouting cables may increase cable lengths and material cost.',
      });
    }
  }

  return recs;
}

/**
 * Harmonics recommendations.
 * @param {object} harmonicsResults - value from getStudies().harmonics; keyed by bus id
 * @returns {Recommendation[]}
 */
export function extractHarmonicsRecs(harmonicsResults) {
  if (!harmonicsResults || typeof harmonicsResults !== 'object') return [];
  const recs = [];

  for (const [busId, entry] of Object.entries(harmonicsResults)) {
    const warn = entry.warning ?? (entry.vthd > (entry.limit ?? 5));
    if (warn) {
      const vthd = Number(entry.vthd);
      recs.push({
        id: `harm:${busId}`,
        sourceStudy: 'harmonics',
        severity: 'compliance',
        title: `Harmonic distortion at ${busId} exceeds limit (${vthd.toFixed(1)}% VTHD)`,
        detail: `Voltage THD ${vthd.toFixed(1)}% exceeds the IEEE 519 limit of ${entry.limit ?? 5}% at bus ${busId}. ` +
          `Consider adding passive harmonic filters, derating equipment, or installing an active front-end drive.`,
        location: busId,
        studyPage: 'harmonics.html',
        safe_to_apply: false,
        tradeoffs: 'Passive filters add capacitive reactive power and may cause resonance.',
      });
    }
  }

  return recs;
}

/**
 * Ground grid safety recommendations.
 * @param {object} groundGridResult - value from getStudies().groundGrid
 * @returns {Recommendation[]}
 */
export function extractGroundGridRecs(groundGridResult) {
  if (!groundGridResult || typeof groundGridResult !== 'object') return [];
  const recs = [];

  if (groundGridResult.touchSafe === false) {
    recs.push({
      id: 'gg:touch',
      sourceStudy: 'groundGrid',
      severity: 'safety',
      title: 'Ground grid touch voltage exceeds tolerable limit',
      detail: `Mesh voltage Em (${groundGridResult.Em?.toFixed(1) ?? '?'} V) exceeds tolerable touch voltage ` +
        `Etouch (${groundGridResult.Etouch?.toFixed(1) ?? '?'} V) per IEEE 80. ` +
        `Add ground rods, reduce grid spacing, or install surface gravel layer.`,
      location: 'Ground Grid',
      studyPage: 'groundgrid.html',
      safe_to_apply: false,
      tradeoffs: 'Additional rods and conductors increase installation cost.',
    });
  }

  if (groundGridResult.stepSafe === false) {
    recs.push({
      id: 'gg:step',
      sourceStudy: 'groundGrid',
      severity: 'safety',
      title: 'Ground grid step voltage exceeds tolerable limit',
      detail: `Step voltage Es (${groundGridResult.Es?.toFixed(1) ?? '?'} V) exceeds tolerable step voltage ` +
        `Estep (${groundGridResult.Estep?.toFixed(1) ?? '?'} V) per IEEE 80. ` +
        `Increase crushed-stone surface layer or extend grid beyond equipment boundary.`,
      location: 'Ground Grid',
      studyPage: 'groundgrid.html',
      safe_to_apply: false,
    });
  }

  if (groundGridResult.gprExceedsTouch) {
    recs.push({
      id: 'gg:gpr',
      sourceStudy: 'groundGrid',
      severity: 'compliance',
      title: 'Ground Potential Rise (GPR) exceeds tolerable touch voltage',
      detail: `GPR (${groundGridResult.GPR?.toFixed(0) ?? '?'} V) exceeds Etouch. ` +
        `Remote earth hazard exists. Consider isolating telecommunications cables or installing gradient control conductors.`,
      location: 'Ground Grid',
      studyPage: 'groundgrid.html',
      safe_to_apply: false,
    });
  }

  return recs;
}

/**
 * Load flow recommendations — buses with voltage outside [0.95, 1.05] pu.
 * Handles both balanced (res.buses) and unbalanced (res.phases.A.buses) results.
 * @param {object} loadFlowResult - value from getStudies().loadFlow
 * @returns {Recommendation[]}
 */
export function extractLoadFlowRecs(loadFlowResult) {
  if (!loadFlowResult) return [];
  const recs = [];

  const checkBuses = buses => {
    if (!Array.isArray(buses)) return;
    for (const bus of buses) {
      const Vm = Number(bus.Vm);
      if (!Number.isFinite(Vm)) continue;
      if (Vm < 0.95 || Vm > 1.05) {
        const busLabel = bus.label || bus.name || bus.id || 'unknown';
        const direction = Vm < 0.95 ? 'low' : 'high';
        recs.push({
          id: `lf:${bus.id ?? busLabel}`,
          sourceStudy: 'loadFlow',
          severity: 'compliance',
          title: `Bus ${busLabel} voltage ${direction} (${Vm.toFixed(3)} pu)`,
          detail: `Bus ${busLabel} voltage ${Vm.toFixed(3)} pu is outside the ANSI C84.1 Range A band [0.95, 1.05] pu. ` +
            (Vm < 0.95
              ? `Adjust transformer tap, add shunt capacitors, or resize the feeder.`
              : `Reduce generation, lower transformer tap, or add shunt reactors.`),
          location: busLabel,
          studyPage: 'loadflow.html',
          safe_to_apply: false,
        });
      }
    }
  };

  if (Array.isArray(loadFlowResult.buses)) {
    checkBuses(loadFlowResult.buses);
  } else if (loadFlowResult.phases) {
    for (const phase of Object.values(loadFlowResult.phases)) {
      checkBuses(phase?.buses);
    }
  }

  if (Array.isArray(loadFlowResult.warnings) && loadFlowResult.warnings.length) {
    loadFlowResult.warnings.forEach((w, idx) => {
      recs.push({
        id: `lf-warn:${idx}`,
        sourceStudy: 'loadFlow',
        severity: 'missing_data',
        title: 'Load flow convergence issue',
        detail: typeof w === 'string' ? w : (w.message || JSON.stringify(w)),
        location: 'Load Flow',
        studyPage: 'loadflow.html',
        safe_to_apply: false,
      });
    });
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Deduplication and sorting
// ---------------------------------------------------------------------------

/**
 * Remove duplicate recommendation ids, keeping the highest-severity copy.
 * @param {Recommendation[]} recs
 * @returns {Recommendation[]}
 */
export function suppressDuplicates(recs) {
  const map = new Map();
  for (const r of recs) {
    const existing = map.get(r.id);
    if (!existing || (SEVERITY_RANK[r.severity] ?? 4) < (SEVERITY_RANK[existing.severity] ?? 4)) {
      map.set(r.id, r);
    }
  }
  return [...map.values()];
}

function sortRecommendations(recs) {
  return [...recs].sort((a, b) =>
    (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4)
  );
}

// ---------------------------------------------------------------------------
// Equipment evaluation recommendations
// ---------------------------------------------------------------------------

/**
 * Generate design-coach recommendations from equipment duty evaluation results.
 * @param {object[]} components  - one-line components (flat)
 * @param {object[]} cables      - cable schedule
 * @param {object}   studies     - from getStudies()
 * @param {object[]} [catalog]   - protectiveDevices catalog
 * @returns {Recommendation[]}
 */
export function extractEquipmentEvalRecs(components, cables, studies, catalog = []) {
  if (!Array.isArray(components) || components.length === 0) return [];
  let evals;
  try {
    evals = evaluateEquipment(components, cables, studies, catalog);
  } catch (_) {
    return [];
  }
  const recs = [];
  for (const entry of evals) {
    for (const [checkName, result] of Object.entries(entry.checks)) {
      if (!result) continue;
      if (result.status === EVAL_STATUS.FAIL) {
        recs.push({
          id: `equip:${entry.id}:${checkName}`,
          sourceStudy: 'equipmentEvaluation',
          severity: 'compliance',
          title: `${checkLabel(checkName)} failure — ${entry.label}`,
          detail: buildFailDetail(checkName, result, entry),
          location: entry.id,
          studyPage: 'equipmentevaluation.html',
          safe_to_apply: false,
        });
      }
    }
  }
  return recs;
}

function checkLabel(name) {
  const MAP = { aic: 'AIC', withstand: 'Withstand', sccr: 'SCCR', thermal: 'Cable I²t' };
  return MAP[name] ?? name;
}

function buildFailDetail(checkName, result, entry) {
  if (checkName === 'aic')
    return `${entry.label}: fault ${result.faultKA} kA exceeds device interrupting rating ${result.ratingKA} kA. Replace with a higher-rated device.`;
  if (checkName === 'withstand')
    return `${entry.label}: fault ${result.faultKA} kA exceeds adjusted withstand ${result.adjustedRatingKA} kA at clearing time ${result.clearingTimeS} s. Upgrade device or reduce clearing time.`;
  if (checkName === 'sccr')
    return `${entry.label}: fault ${result.faultKA} kA exceeds equipment SCCR ${result.sccrKA} kA. Upgrade the assembly rating.`;
  if (checkName === 'thermal')
    return `${entry.label}: conductor ${result.actualMm2} mm² is below minimum ${result.minMm2} mm² for I²t duty at ${result.faultKA} kA × ${result.clearingTimeS} s.`;
  return `${entry.label}: ${checkName} failure.`;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run the cross-study design coach over the current project data.
 *
 * @param {{
 *   cables?: object[],
 *   trays?: object[],
 *   components?: object[],
 *   studies?: {
 *     arcFlash?: object,
 *     shortCircuit?: object,
 *     harmonics?: object,
 *     groundGrid?: object,
 *     loadFlow?: object,
 *   },
 *   deviceCatalog?: object[],
 * }} projectData
 * @returns {{ recommendations: Recommendation[], summary: object }}
 */
export function runDesignCoach(projectData = {}) {
  const { cables = [], trays = [], components = [], studies = {}, deviceCatalog = [] } = projectData;

  const all = [
    ...extractVoltageDropRecs(cables),
    ...extractArcFlashRecs(studies.arcFlash),
    ...extractShortCircuitRecs(studies.shortCircuit),
    ...extractTrayFillRecs(trays),
    ...extractHarmonicsRecs(studies.harmonics),
    ...extractGroundGridRecs(studies.groundGrid),
    ...extractLoadFlowRecs(studies.loadFlow),
    ...extractEquipmentEvalRecs(components, cables, studies, deviceCatalog),
  ];

  const unique = suppressDuplicates(all);
  const recommendations = sortRecommendations(unique);

  const summary = {
    total: recommendations.length,
    safety: recommendations.filter(r => r.severity === 'safety').length,
    compliance: recommendations.filter(r => r.severity === 'compliance').length,
    efficiency: recommendations.filter(r => r.severity === 'efficiency').length,
    missing_data: recommendations.filter(r => r.severity === 'missing_data').length,
  };

  return { recommendations, summary };
}
