/**
 * Design Rule Checker (DRC) — Electrical Cable Routing Validation
 *
 * Runs a post-routing validation pass and reports violations at three severity
 * levels: ERROR, WARNING, and INFO.
 *
 * Rules implemented:
 *   DRC-01  NEC 392.22(A)  — Tray fill exceeds 40 % of usable cross-section
 *   DRC-02  NEC 392.6(H)   — Voltage-class segregation (mixed cable groups)
 *   DRC-03  NEC 310.15     — Cable exceeds rated ampacity (with tray derating)
 *   DRC-04  NEC 250.122    — Power cables have no EGC, or selected EGC is undersized
 *   DRC-05  (advisory)     — Cables with no assigned route (unrouted cables)
 *   DRC-06  TIA-568.0-D §4.5 — Structured cabling (Data/Fiber) shares tray with Power cables
 *   DRC-07  NEC 310.10(H) — Parallel conductor requirements (min size, equal length)
 *   DRC-08  NEC 500/IEC 60079 — Equipment Ex protection type or T-rating incompatible with classified area
 *   DRC-09  NEC 240.4 / 240.6(A) — Conductor OCPD protection screening
 *   DRC-10  NEC Chapter 9 Table 1 / Informative Annex C - Conduit fill screening
 *
 * @module designRuleChecker
 */

import {
  buildConduitCableMap,
  evaluateConduitFill,
  recordId,
} from './conduitFill.mjs';
import {
  inferTerminalTempRating,
  nextStandardOcpd,
  normalizeConductorMaterial,
  normalizeTemperatureRating,
  smallConductorMaxOcpd,
  tableAmpacity,
} from './autoSize.mjs';

// ---------------------------------------------------------------------------
// Severity constants
// ---------------------------------------------------------------------------
export const DRC_SEVERITY = {
  ERROR:   'error',    // Code violation — must resolve before construction
  WARNING: 'warning',  // Code advisory or best-practice concern
  INFO:    'info',     // Informational / optimization opportunity
};

// ---------------------------------------------------------------------------
// NEC 392.22(A) fill limit for cable trays
//   Ladder / ventilated-trough trays: 40 % of (inside_width × tray_depth)
//   Single-layer power cable trays: 50 % (simplified; DRC uses 40 % default)
// ---------------------------------------------------------------------------
const NEC_TRAY_FILL_LIMIT = 0.40;

// ---------------------------------------------------------------------------
// NEC 310.15(B)(3)(a) — Tray derating factors for power cables
//   When installed in a cable tray the "bundling" derating factor applies to
//   the number of current-carrying conductors in the tray section.  We use
//   a simplified stepped table (Table 310.15(C)(1) equivalent).
// ---------------------------------------------------------------------------
const TRAY_DERATING_FACTORS = [
  { maxConductors:  3, factor: 1.00 },
  { maxConductors:  6, factor: 0.80 },
  { maxConductors:  9, factor: 0.70 },
  { maxConductors: 20, factor: 0.50 },
  { maxConductors: 30, factor: 0.45 },
  { maxConductors: Infinity, factor: 0.40 },
];

// ---------------------------------------------------------------------------
// NEC Table 310.16 baseline ampacity (formerly 310.15(B)(16)) — 75 °C copper, used as default
// when cable record lacks explicit ampacity data.
// ---------------------------------------------------------------------------
const BASELINE_AMPACITY = {
  '#14 AWG': 20,  '#12 AWG': 25,  '#10 AWG': 35,   '#8 AWG':  50,
  '#6 AWG':  65,  '#4 AWG':  85,  '#3 AWG': 100,   '#2 AWG': 115,
  '#1 AWG': 130, '1/0 AWG': 150, '2/0 AWG': 175,  '3/0 AWG': 200,
  '4/0 AWG': 230, '250 kcmil': 255, '350 kcmil': 310,
  '500 kcmil': 380, '750 kcmil': 475, '1000 kcmil': 545,
};

// ---------------------------------------------------------------------------
// Selected NEC 250.122 copper equipment grounding conductor minimums.
// These are common OCPD rating breakpoints used for DRC screening only; final
// EGC sizing must still account for conductor material, upsized phase
// conductors, parallel equipment grounding conductors, and AHJ requirements.
// ---------------------------------------------------------------------------
const EGC_SIZE_ORDER = [
  '#22 AWG', '#20 AWG', '#18 AWG', '#16 AWG', '#14 AWG', '#12 AWG',
  '#10 AWG', '#8 AWG', '#6 AWG', '#4 AWG', '#3 AWG', '#2 AWG',
  '#1 AWG', '1/0 AWG', '2/0 AWG', '3/0 AWG', '4/0 AWG',
  '250 kcmil', '350 kcmil', '400 kcmil', '500 kcmil', '700 kcmil',
  '800 kcmil',
];

const EGC_SIZE_RANK = new Map(EGC_SIZE_ORDER.map((size, index) => [size, index]));

const COPPER_EGC_MINIMUMS_BY_OCPD = [
  { maxOcpd: 15, size: '#14 AWG' },
  { maxOcpd: 20, size: '#12 AWG' },
  { maxOcpd: 60, size: '#10 AWG' },
  { maxOcpd: 100, size: '#8 AWG' },
  { maxOcpd: 200, size: '#6 AWG' },
  { maxOcpd: 300, size: '#4 AWG' },
  { maxOcpd: 400, size: '#3 AWG' },
  { maxOcpd: 500, size: '#2 AWG' },
  { maxOcpd: 600, size: '#1 AWG' },
  { maxOcpd: 800, size: '1/0 AWG' },
  { maxOcpd: 1000, size: '2/0 AWG' },
  { maxOcpd: 1200, size: '3/0 AWG' },
];

const EGC_SIZE_FIELDS = [
  'ground_size',
  'egc_size',
  'ground_conductor',
  'grounding_conductor',
  'equipment_grounding_conductor',
];

const EGC_MATERIAL_FIELDS = [
  'ground_material',
  'egc_material',
  'ground_conductor_material',
  'grounding_conductor_material',
  'equipment_grounding_conductor_material',
];

const OCPD_RATING_FIELDS = [
  'ocpd_rating',
  'ocpd_amps',
  'ocpd_size',
  'ocpdRating',
  'breaker_size',
  'breaker_amps',
  'breakerAmps',
  'fuse_size',
  'fuse_amps',
  'fuseAmps',
  'protective_device_rating',
  'protectiveDeviceRating',
  'protection_amps',
  'protection_size',
  'overcurrent_device_rating',
  'overcurrent_protection_amps',
  'max_ocpd',
  'maxOcpd',
  'mocp',
];

const CONDUCTOR_SIZE_FIELDS = [
  'conductor_size',
  'conductorSize',
  'cable_size',
  'wire_size',
  'conductor',
  'size',
  'awg',
];

const CONDUCTOR_MATERIAL_FIELDS = [
  'conductor_material',
  'conductorMaterial',
  'material',
  'phase_conductor_material',
  'phaseConductorMaterial',
  'wire_material',
];

const TERMINAL_TEMP_FIELDS = [
  'terminal_temp_rating',
  'terminalTempRating',
  'terminal_rating',
  'termination_temp_rating',
  'terminationTempRating',
  'equipment_terminal_temp',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the tray fill percentage (0–100) for a tray.
 *
 * @param {object} tray  Raceway schedule row.
 * @param {number} [fillInSqIn]  Override for current fill area (sq in).
 *   If omitted the tray's stored `current_fill` field is used.
 * @returns {number|null}  Fill percentage, or null if dimensions are unknown.
 */
export function trayFillPercent(tray, fillInSqIn) {
  const width = parseFloat(tray.inside_width ?? tray.width) || 0;
  const depth = parseFloat(tray.tray_depth ?? tray.height) || 0;
  if (width <= 0 || depth <= 0) return null;
  const numSlots = Math.max(1, parseInt(tray.num_slots) || 1);
  const totalArea = (width * depth) / numSlots;
  const fill = fillInSqIn !== undefined ? fillInSqIn : (parseFloat(tray.current_fill) || 0);
  return (fill / totalArea) * 100;
}

/**
 * Return the fill percentage (0–100) for a single slot of a multi-compartment tray.
 *
 * @param {object} tray        Raceway schedule row (must have width/height dimensions).
 * @param {number} slotIndex   Zero-based slot index.
 * @param {number} slotFillSqIn  Current fill area for this slot in square inches.
 * @returns {number|null}  Fill percentage, or null if dimensions are unknown.
 */
export function traySlotFillPercent(tray, slotIndex, slotFillSqIn) {
  const width = parseFloat(tray.inside_width ?? tray.width) || 0;
  const depth = parseFloat(tray.tray_depth ?? tray.height) || 0;
  if (width <= 0 || depth <= 0) return null;
  const numSlots = Math.max(1, parseInt(tray.num_slots) || 1);
  if (slotIndex < 0 || slotIndex >= numSlots) return null;
  const slotArea = (width * depth) / numSlots;
  return (slotFillSqIn / slotArea) * 100;
}

/**
 * Return the derating factor for a given number of current-carrying conductors.
 * @param {number} conductorCount
 * @returns {number}
 */
function derateFactor(conductorCount) {
  for (const entry of TRAY_DERATING_FACTORS) {
    if (conductorCount <= entry.maxConductors) return entry.factor;
  }
  return TRAY_DERATING_FACTORS[TRAY_DERATING_FACTORS.length - 1].factor;
}

/**
 * Look up the baseline 75 °C ampacity for a conductor size string.
 * Returns null if unrecognised.
 * @param {string} size
 * @returns {number|null}
 */
function baselineAmpacity(size) {
  if (!size) return null;
  const key = size.trim();
  return BASELINE_AMPACITY[key] ?? null;
}

function firstDefinedText(record, fields) {
  for (const field of fields) {
    const value = record[field];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function parsePositiveNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const direct = Number.parseFloat(text);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeEgcSize(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const normalized = text.replace(/\s+/g, ' ').toUpperCase();
  const awg = normalized.match(/^#?\s*(22|20|18|16|14|12|10|8|6|4|3|2|1)\s*(AWG)?$/);
  if (awg) return `#${awg[1]} AWG`;
  const zeroAwg = normalized.match(/^(1\/0|2\/0|3\/0|4\/0)\s*(AWG)?$/);
  if (zeroAwg) return `${zeroAwg[1]} AWG`;
  const kcmil = normalized.match(/^(250|350|400|500|700|800)\s*(KCMIL|MCM)?$/);
  if (kcmil) return `${kcmil[1]} kcmil`;
  const bare = normalized.match(/^(\d+)$/);
  if (bare) {
    const numeric = Number.parseInt(bare[1], 10);
    if (EGC_SIZE_RANK.has(`#${numeric} AWG`)) return `#${numeric} AWG`;
    if (numeric >= 250) return `${numeric} kcmil`;
  }
  return null;
}

function normalizeConductorSize(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const normalized = text.replace(/\s+/g, ' ').toUpperCase();
  const awg = normalized.match(/^#?\s*(14|12|10|8|6|4|3|2|1)\s*(AWG)?$/);
  if (awg) return `#${awg[1]} AWG`;
  const zeroAwg = normalized.match(/^(1\/0|2\/0|3\/0|4\/0)\s*(AWG)?$/);
  if (zeroAwg) return `${zeroAwg[1]} AWG`;
  const kcmil = normalized.match(/^(250|300|350|400|500|600|750|1000)\s*(KCMIL|MCM)?$/);
  if (kcmil) return `${kcmil[1]} kcmil`;
  return null;
}

function cableEgcMaterial(cable) {
  const text = firstDefinedText(cable, EGC_MATERIAL_FIELDS).toLowerCase();
  if (!text) return '';
  if (text === 'cu' || text.includes('copper')) return 'copper';
  if (text === 'al' || text.includes('alum')) return 'aluminum';
  return text;
}

function requiredCopperEgcSize(ocpdRating) {
  const rating = parsePositiveNumber(ocpdRating);
  if (!rating) return null;
  const row = COPPER_EGC_MINIMUMS_BY_OCPD.find(entry => rating <= entry.maxOcpd);
  return row?.size ?? null;
}

function compareEgcSizes(actualSize, requiredSize) {
  const actualRank = EGC_SIZE_RANK.get(actualSize);
  const requiredRank = EGC_SIZE_RANK.get(requiredSize);
  if (actualRank == null || requiredRank == null) return null;
  return actualRank - requiredRank;
}

function cableOcpdRating(cable) {
  for (const field of OCPD_RATING_FIELDS) {
    const rating = parsePositiveNumber(cable[field]);
    if (rating) return rating;
  }
  return null;
}

function cableConductorMaterial(cable) {
  const text = firstDefinedText(cable, CONDUCTOR_MATERIAL_FIELDS);
  if (text) return normalizeConductorMaterial(text);
  const sizeText = firstDefinedText(cable, CONDUCTOR_SIZE_FIELDS);
  return /(^|\s)(AL|ALUM|ALUMINUM)(\s|$)/i.test(sizeText)
    ? 'aluminum'
    : 'copper';
}

function cableTerminalTempRating(cable, ocpdRating) {
  const text = firstDefinedText(cable, TERMINAL_TEMP_FIELDS);
  if (text) return normalizeTemperatureRating(text, inferTerminalTempRating({ requiredOcpd: ocpdRating }));
  return inferTerminalTempRating({ requiredOcpd: ocpdRating });
}

function hasCircuitSpecificOcpdAllowance(cable) {
  const text = [
    cable.circuit_type,
    cable.load_type,
    cable.service_description,
    cable.notes,
    cable.engineer_note,
  ].map(value => String(value ?? '').toLowerCase()).join(' ');
  return /\b(motor|hvac|air conditioning|refrigeration|transformer|tap)\b/.test(text);
}

function normalizedCableType(cable) {
  return (cable.cable_type ?? cable.type ?? '').toLowerCase();
}

function isPowerCable(cable) {
  const cableType = normalizedCableType(cable);
  return cableType === '' || cableType === 'power' || cableType === 'pwr';
}

// ---------------------------------------------------------------------------
// Rule implementations
// ---------------------------------------------------------------------------

/**
 * DRC-01 — Tray fill > NEC limit
 * @param {object[]} trays
 * @param {object}   [options]
 * @param {number}   [options.fillLimit=0.40]  Fractional fill limit (0–1).
 * @returns {DrcFinding[]}
 */
function checkTrayFill(trays, options = {}) {
  const limit = options.fillLimit ?? NEC_TRAY_FILL_LIMIT;
  const findings = [];
  for (const tray of trays) {
    // Per-slot DRC-01 when routing system has provided slotFills[]
    if (Array.isArray(tray.slotFills) && tray.slotFills.length > 1) {
      const numSlots = tray.slotFills.length;
      for (let i = 0; i < numSlots; i++) {
        const pct = traySlotFillPercent(tray, i, tray.slotFills[i]);
        if (pct === null) continue;
        const slotLabel = tray.slotGroups?.get?.(i) ?? `slot ${i}`;
        if (pct / 100 > limit) {
          findings.push({
            ruleId: 'DRC-01',
            severity: DRC_SEVERITY.ERROR,
            location: `${tray.tray_id} (${slotLabel})`,
            message:
              `Slot fill ${pct.toFixed(1)} % exceeds NEC 392.22(A) limit of ${(limit * 100).toFixed(0)} % ` +
              `in compartment "${slotLabel}" of tray "${tray.tray_id}".`,
            detail: `Slot ${i} fill: ${tray.slotFills[i].toFixed(2)} in².`,
            reference: 'NEC 392.22(A)',
            remediation: 'Reroute cables from this slot to a tray with available capacity, or widen the tray.',
          });
        } else if (pct / 100 > limit * 0.9) {
          findings.push({
            ruleId: 'DRC-01',
            severity: DRC_SEVERITY.WARNING,
            location: `${tray.tray_id} (${slotLabel})`,
            message:
              `Slot fill ${pct.toFixed(1)} % is within 10 % of the NEC 392.22(A) limit ` +
              `in compartment "${slotLabel}" of tray "${tray.tray_id}".`,
            reference: 'NEC 392.22(A)',
            remediation: 'Monitor future cable additions to this slot.',
          });
        }
      }
      continue; // slot-level checks replace the whole-tray check
    }

    const pct = trayFillPercent(tray);
    if (pct === null) continue;
    if (pct / 100 > limit) {
      findings.push({
        ruleId: 'DRC-01',
        severity: DRC_SEVERITY.ERROR,
        location: tray.tray_id,
        message:
          `Tray fill ${pct.toFixed(1)} % exceeds NEC 392.22(A) limit of ${(limit * 100).toFixed(0)} %.`,
        detail: `Inside width: ${tray.inside_width ?? tray.width ?? '?'} in, ` +
                `depth: ${tray.tray_depth ?? tray.height ?? '?'} in, ` +
                `fill: ${parseFloat(tray.current_fill).toFixed(2)} in².`,
        reference: 'NEC 392.22(A)',
        remediation: 'Widen or deepen the tray, add a parallel tray segment, or use the Optimal Route page to reroute cables to adjacent trays with available capacity.',
      });
    } else if (pct / 100 > limit * 0.9) {
      findings.push({
        ruleId: 'DRC-01',
        severity: DRC_SEVERITY.WARNING,
        location: tray.tray_id,
        message:
          `Tray fill ${pct.toFixed(1)} % is within 10 % of the NEC 392.22(A) limit.`,
        reference: 'NEC 392.22(A)',
        remediation: 'Monitor future cable additions to this tray. Consider reserving a parallel tray for overflow capacity.',
      });
    }
  }
  return findings;
}

/**
 * DRC-02 — Voltage-class segregation check.
 * Flags tray segments where cables from different cable groups share the same tray
 * without a physical divider being modelled.
 *
 * @param {object[]}                trays          Raceway schedule rows.
 * @param {Map<string, object[]>}   trayCableMap   Map of tray_id → cable objects.
 * @returns {DrcFinding[]}
 */
function checkSegregation(trays, trayCableMap) {
  const findings = [];
  for (const tray of trays) {
    const cables = trayCableMap.get(tray.tray_id) ?? [];
    if (cables.length < 2) continue;

    const groups = new Set(
      cables
        .map(c => (c.allowed_cable_group ?? c.cable_group ?? '').trim())
        .filter(Boolean)
    );

    if (groups.size > 1) {
      // Suppress DRC-02 when the tray is physically compartmented with a valid
      // slot_groups mapping — mixed groups are intentional in that configuration
      // because a listed metallic divider strip separates the voltage classes.
      const numSlots = Math.max(1, parseInt(tray.num_slots) || 1);
      if (numSlots > 1) {
        const rawSlotGroups = tray.slot_groups;
        let slotGroupsValid = false;
        if (rawSlotGroups) {
          try {
            const parsed = typeof rawSlotGroups === 'string'
              ? JSON.parse(rawSlotGroups)
              : rawSlotGroups;
            // Valid if at least one slot has a group assignment
            slotGroupsValid = Object.keys(parsed).length > 0;
          } catch { /* malformed JSON — not valid */ }
        }
        // Also accept a slotGroups Map (from the routing system)
        if (!slotGroupsValid && tray.slotGroups instanceof Map) {
          slotGroupsValid = tray.slotGroups.size > 0;
        }
        if (slotGroupsValid) continue;
      }

      const trayGroup = (tray.allowed_cable_group ?? '').trim();
      findings.push({
        ruleId: 'DRC-02',
        severity: DRC_SEVERITY.ERROR,
        location: tray.tray_id,
        message:
          `Voltage segregation violation: cables from groups [${[...groups].join(', ')}] ` +
          `share tray "${tray.tray_id}" (allowed group: "${trayGroup || 'any'}").`,
        detail:
          `Cables: ${cables.slice(0, 5).map(c => c.name ?? c.tag).join(', ')}` +
          (cables.length > 5 ? ` … +${cables.length - 5} more` : '.'),
        reference: 'NEC 392.6(H)',
        remediation: 'Assign each cable group to a dedicated tray, or install a listed metallic divider strip to physically separate voltage classes within the same tray.',
      });
    }
  }
  return findings;
}

/**
 * DRC-03 — Cable ampacity with tray bundling derating.
 * For each power cable, computes derated ampacity and compares against
 * the cable's rated ampacity (or baseline NEC table value).
 *
 * @param {object[]}                cables        Cable schedule rows.
 * @param {Map<string, object[]>}   trayCableMap  Map of tray_id → cable objects.
 * @returns {DrcFinding[]}
 */
function checkAmpacity(cables, trayCableMap) {
  const findings = [];

  // Build a map of cable name → tray_ids containing that cable
  const cableTrayMap = new Map();
  for (const [trayId, cabs] of trayCableMap) {
    for (const c of cabs) {
      const key = c.name ?? c.tag;
      if (!key) continue;
      if (!cableTrayMap.has(key)) cableTrayMap.set(key, []);
      cableTrayMap.get(key).push(trayId);
    }
  }

  for (const cable of cables) {
    const name = cable.name ?? cable.tag;
    if (!name) continue;

    // Only check power cables (not control/signal — those are not ampacity-rated)
    if (!isPowerCable(cable)) continue;

    const ratedAmpacity =
      parseFloat(cable.ampacity) ||
      baselineAmpacity(cable.conductor_size ?? cable.conductor) ||
      null;

    if (ratedAmpacity === null) continue;

    // Parallel sets multiply the effective ampacity (NEC 310.10(H))
    const parallelCount = Math.max(1, parseInt(cable.parallel_count) || 1);
    const aggregateAmpacity = ratedAmpacity * parallelCount;

    const trayIds = cableTrayMap.get(name) ?? [];
    for (const trayId of trayIds) {
      const cohabitants = trayCableMap.get(trayId) ?? [];
      // Count current-carrying conductors (power cables × conductors × parallel sets)
      const conductorCount = cohabitants.reduce((sum, c) => {
        if (!isPowerCable(c)) return sum;
        const conductors = parseInt(c.conductors, 10) || 3;
        const parallelSets = Math.max(1, parseInt(c.parallel_count) || 1);
        return sum + conductors * parallelSets;
      }, 0);

      const factor = derateFactor(conductorCount);
      const deratedAmpacity = aggregateAmpacity * factor;
      const designCurrent = parseFloat(cable.design_current ?? cable.load_amps) || null;
      const parallelLabel = parallelCount > 1 ? ` (${parallelCount} × ${ratedAmpacity} A)` : '';

      if (designCurrent !== null && designCurrent > deratedAmpacity) {
        findings.push({
          ruleId: 'DRC-03',
          severity: DRC_SEVERITY.ERROR,
          location: `${name} @ ${trayId}`,
          message:
            `Cable "${name}" design current ${designCurrent} A exceeds derated ampacity ` +
            `${deratedAmpacity.toFixed(1)} A (${aggregateAmpacity} A aggregate${parallelLabel} × ${factor} derating).`,
          detail:
            `${conductorCount} current-carrying conductors in tray "${trayId}" ` +
            `(NEC 310.15 derating factor ${factor}).`,
          reference: 'NEC 310.15',
          remediation: `Upgrade the conductor to the next larger standard size, increase the number of parallel sets (NEC 310.10(H)), split into a separate tray to reduce bundling derating, or reduce the design load current for "${name}".`,
        });
      } else if (factor < 1.0) {
        // Advisory: derating applied even if not over limit
        findings.push({
          ruleId: 'DRC-03',
          severity: DRC_SEVERITY.INFO,
          location: `${name} @ ${trayId}`,
          message:
            `Tray bundling derating applied: ${aggregateAmpacity} A aggregate${parallelLabel} → ${deratedAmpacity.toFixed(1)} A ` +
            `(factor ${factor}, ${conductorCount} current-carrying conductors).`,
          reference: 'NEC 310.15',
          remediation: 'No action required if the derated ampacity remains above the design current. Consider segregating conductors into separate tray sections to reduce derating.',
        });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// NEC 310.10(H)(1) — AWG sizes smaller than 1/0 AWG are too small for parallel
// conductor sets.  The metric threshold is 50 mm² (≈ 1/0 AWG).
// ---------------------------------------------------------------------------
const PARALLEL_UNDERSIZED_AWG = new Set([
  '#14 AWG', '#12 AWG', '#10 AWG', '#8 AWG',
  '#6 AWG', '#4 AWG', '#3 AWG', '#2 AWG', '#1 AWG',
]);

/**
 * DRC-07 — NEC 310.10(H) parallel conductor requirements.
 * When a cable record specifies parallel_count > 1, validate:
 *   (a) Conductor size is at least 1/0 AWG (NEC 310.10(H)(1)).
 *   (b) A cable length is recorded so equal-length compliance can be verified.
 *
 * @param {object[]} cables  Cable schedule rows.
 * @returns {DrcFinding[]}
 */
function checkParallelConductors(cables) {
  const findings = [];
  for (const cable of cables) {
    const name = cable.name ?? cable.tag;
    if (!name) continue;
    const parallelCount = parseInt(cable.parallel_count) || 1;
    if (parallelCount <= 1) continue;

    const size = (cable.conductor_size ?? cable.conductor ?? '').trim();

    // (a) Minimum size check — AWG sizes below 1/0 AWG are not permitted
    if (size && PARALLEL_UNDERSIZED_AWG.has(size)) {
      findings.push({
        ruleId: 'DRC-07',
        severity: DRC_SEVERITY.ERROR,
        location: name,
        message:
          `Cable "${name}" uses ${parallelCount} parallel sets of ${size}, ` +
          `but NEC 310.10(H)(1) requires each parallel conductor to be 1/0 AWG or larger.`,
        detail:
          `Conductor size "${size}" is below the NEC 310.10(H)(1) minimum of 1/0 AWG ` +
          `for parallel conductor sets.`,
        reference: 'NEC 310.10(H)(1)',
        remediation:
          `Upsize the conductor to at least 1/0 AWG, or redesign as a single larger conductor. ` +
          `Parallel sets are intended for large feeders where a single conductor of adequate ` +
          `ampacity is not available or practical.`,
      });
    }

    // (b) Length not recorded — cannot verify equal-length compliance
    const length = parseFloat(cable.length ?? cable.length_ft);
    if (!(length > 0)) {
      findings.push({
        ruleId: 'DRC-07',
        severity: DRC_SEVERITY.WARNING,
        location: name,
        message:
          `Cable "${name}" has ${parallelCount} parallel sets but no length is recorded. ` +
          `NEC 310.10(H)(1) requires all parallel conductors in a set to be the same length.`,
        reference: 'NEC 310.10(H)(1)',
        remediation:
          `Enter the cable run length in the Cable Schedule. ` +
          `All ${parallelCount} parallel conductors must have the same length, conductor size, ` +
          `insulation type, and conductor material to ensure balanced current sharing.`,
      });
    }
  }
  return findings;
}

/**
 * DRC-04 — Grounding conductor check.
 * Power cables should have an equipment grounding conductor. If a power cable
 * record has no EGC defined, flag it. If the row also includes an OCPD rating,
 * screen the recorded copper EGC size against selected NEC 250.122 breakpoints.
 *
 * @param {object[]} cables  Cable schedule rows.
 * @returns {DrcFinding[]}
 */
function checkGrounding(cables) {
  const findings = [];
  for (const cable of cables) {
    const name = cable.name ?? cable.tag;
    if (!name) continue;
    if (!isPowerCable(cable)) continue;

    const egcRaw = firstDefinedText(cable, EGC_SIZE_FIELDS);
    const egcSize = normalizeEgcSize(egcRaw);
    const hasGround =
      Boolean(egcSize) ||
      String(cable.grounded ?? '').toLowerCase() === 'true' ||
      String(cable.includes_ground ?? '').toLowerCase() === 'true';

    if (!hasGround) {
      findings.push({
        ruleId: 'DRC-04',
        severity: DRC_SEVERITY.WARNING,
        location: name,
        message:
          `Power cable "${name}" has no grounding (EGC) conductor recorded. ` +
          `Verify NEC 250.122 compliance.`,
        remediation: `Add an equipment grounding conductor (EGC) sized per NEC Table 250.122 based on the OCPD rating for cable "${name}". Record the EGC size in the Cable Schedule ground_size column.`,
        reference: 'NEC 250.122',
      });
      continue;
    }

    const ocpdRating = cableOcpdRating(cable);
    const egcMaterial = cableEgcMaterial(cable);
    if (ocpdRating && egcMaterial && egcMaterial !== 'copper') {
      findings.push({
        ruleId: 'DRC-04',
        severity: DRC_SEVERITY.WARNING,
        location: name,
        message:
          `Power cable "${name}" records an ${egcMaterial} EGC. ` +
          `The automated NEC 250.122 sizing screen currently covers selected copper EGC values only.`,
        remediation:
          `Verify the EGC size for cable "${name}" against the applicable NEC 250.122 material row ` +
          `and document the basis in the engineer note.`,
        reference: 'NEC 250.122',
      });
      continue;
    }

    const requiredSize = requiredCopperEgcSize(ocpdRating);
    if (!egcSize || !ocpdRating || !requiredSize) continue;

    const sizeComparison = compareEgcSizes(egcSize, requiredSize);
    if (sizeComparison != null && sizeComparison < 0) {
      findings.push({
        ruleId: 'DRC-04',
        severity: DRC_SEVERITY.ERROR,
        location: name,
        message:
          `Power cable "${name}" EGC ${egcSize} is smaller than the selected ` +
          `NEC 250.122 copper EGC minimum of ${requiredSize} for a ${ocpdRating} A OCPD.`,
        detail:
          `Recorded EGC: ${egcSize}; OCPD rating: ${ocpdRating} A; ` +
          `selected copper EGC minimum: ${requiredSize}.`,
        remediation:
          `Increase the recorded EGC to at least ${requiredSize} copper for cable "${name}", ` +
          `or document the engineered basis for alternate conductor material, upsized phase ` +
          `conductors, parallel EGCs, or other NEC 250.122 conditions.`,
        reference: 'NEC 250.122',
      });
    }
  }
  return findings;
}

/**
 * DRC-09 — Conductor overcurrent protection screening.
 * Screens the selected phase conductor size against small-conductor limits,
 * standard OCPD ratings, and the inferred or recorded terminal temperature
 * ampacity. This is intentionally conservative because Article 240 includes
 * next-size, motor, tap, and equipment-specific rules that still require review.
 *
 * @param {object[]} cables  Cable schedule rows.
 * @returns {DrcFinding[]}
 */
function checkOcpdProtection(cables) {
  const findings = [];
  for (const cable of cables) {
    const name = cable.name ?? cable.tag;
    if (!name) continue;
    if (!isPowerCable(cable)) continue;

    const ocpdRating = cableOcpdRating(cable);
    if (!ocpdRating) continue;

    const conductorSize = normalizeConductorSize(firstDefinedText(cable, CONDUCTOR_SIZE_FIELDS));
    if (!conductorSize) continue;

    const standardOcpd = nextStandardOcpd(ocpdRating);
    if (standardOcpd !== ocpdRating) {
      findings.push({
        ruleId: 'DRC-09',
        severity: DRC_SEVERITY.WARNING,
        location: name,
        message:
          `Cable "${name}" uses ${ocpdRating} A OCPD, which is not listed in the selected NEC 240.6(A) standard rating table.`,
        detail: standardOcpd
          ? `Next higher selected standard rating is ${standardOcpd} A.`
          : 'The OCPD rating is above the selected standard rating range used by this checker.',
        remediation:
          `Verify the protective device for cable "${name}" is a listed standard ampere rating ` +
          `or document the engineered basis for the selected rating.`,
        reference: 'NEC 240.6(A)',
      });
    }

    const material = cableConductorMaterial(cable);
    const terminalTempRating = cableTerminalTempRating(cable, ocpdRating);
    const terminalAmpacity = tableAmpacity(conductorSize, material, terminalTempRating);
    const smallConductorMax = smallConductorMaxOcpd(conductorSize, material);

    if (smallConductorMax !== null && ocpdRating > smallConductorMax) {
      const hasAllowanceCue = hasCircuitSpecificOcpdAllowance(cable);
      findings.push({
        ruleId: 'DRC-09',
        severity: hasAllowanceCue ? DRC_SEVERITY.WARNING : DRC_SEVERITY.ERROR,
        location: name,
        message:
          `Cable "${name}" ${conductorSize} ${material} is protected at ${ocpdRating} A, ` +
          `above the selected NEC 240.4(D) small-conductor maximum of ${smallConductorMax} A.`,
        remediation:
          hasAllowanceCue
            ? `Document the applicable NEC Article 240/430/440/450 exception basis for cable "${name}", ` +
              `or lower the OCPD/upsize the phase conductor if no circuit-specific allowance applies.`
            : `Lower the OCPD to ${smallConductorMax} A or less, upsize the phase conductor, ` +
              `or document the applicable NEC exception if this is a motor, HVAC, tap, or other special circuit.`,
        reference: 'NEC 240.4(D)',
      });
      continue;
    }

    if (terminalAmpacity !== null && ocpdRating > terminalAmpacity) {
      findings.push({
        ruleId: 'DRC-09',
        severity: DRC_SEVERITY.WARNING,
        location: name,
        message:
          `Cable "${name}" ${conductorSize} ${material} has ${terminalAmpacity} A ampacity ` +
          `at the ${terminalTempRating}C terminal column, below the ${ocpdRating} A OCPD rating.`,
        detail:
          `Terminal temperature basis: ${terminalTempRating}C; conductor material: ${material}.`,
        remediation:
          `Verify NEC 240.4(B) next-size conditions or any circuit-specific Article 240/430/440 allowance. ` +
          `If none applies, lower the OCPD or upsize the conductor for cable "${name}".`,
        reference: 'NEC 110.14(C) / 240.4(B)',
      });
    }
  }
  return findings;
}

/**
 * DRC-05 — Unrouted cables.
 * Cables present in the cable schedule but with no entries in trayCableMap
 * and no field route logged.
 *
 * @param {object[]}              cables        Cable schedule rows.
 * @param {Map<string,object[]>}  trayCableMap  Tray → cables map.
 * @param {Set<string>}           [routedNames] Optional set of cable names known to be routed.
 * @returns {DrcFinding[]}
 */
/**
 * DRC-10 - Conduit fill screening.
 *
 * Screens assigned conduit/raceway cables against selected NEC Chapter 9
 * Table 1 fill limits using the internal area and cable OD data available in
 * the project. Missing conduit size/type or cable OD is reported as a warning.
 *
 * @param {object[]}               conduits         Raceway schedule conduit rows.
 * @param {Map<string, object[]>}  conduitCableMap  Conduit -> cables map.
 * @returns {DrcFinding[]}
 */
function checkConduitFill(conduits, conduitCableMap) {
  const findings = [];

  for (const conduit of conduits) {
    const conduitId = recordId(conduit);
    if (!conduitId) continue;
    const assignedCables = conduitCableMap.get(conduitId) ?? [];
    if (assignedCables.length === 0) continue;

    const evaluation = evaluateConduitFill(conduit, assignedCables);
    const label = evaluation.conduitId || conduitId;
    const cableList = evaluation.assignedCableNames.length
      ? evaluation.assignedCableNames.join(', ')
      : `${assignedCables.length} assigned cable${assignedCables.length !== 1 ? 's' : ''}`;

    if (!evaluation.internalAreaIn2) {
      findings.push({
        ruleId: 'DRC-10',
        severity: DRC_SEVERITY.WARNING,
        location: label,
        message:
          `Conduit "${label}" has assigned cables but is missing a recognized conduit type and trade size for fill screening.`,
        detail:
          `Assigned cables: ${cableList}. Enter a supported conduit type and trade size in the Raceway Schedule.`,
        reference: 'NEC Chapter 9, Table 1 / Informative Annex C',
        remediation:
          'Set the conduit/raceway type and trade size, or document the external conduit-fill calculation basis before issuing raceway schedules.',
      });
      continue;
    }

    if (evaluation.missingAreaCables.length > 0) {
      findings.push({
        ruleId: 'DRC-10',
        severity: DRC_SEVERITY.WARNING,
        location: label,
        message:
          `Conduit "${label}" has assigned cables missing outside diameter or area data, so fill cannot be fully verified.`,
        detail:
          `Missing OD/area: ${evaluation.missingAreaCables.join(', ')}. ` +
          `Known cable area: ${evaluation.cableAreaTotalIn2.toFixed(3)} in2.`,
        reference: 'NEC Chapter 9, Table 1 / Informative Annex C',
        remediation:
          'Enter cable OD/diameter or cable area for each assigned cable, then rerun the Design Rule Checker.',
      });
    }

    if (!evaluation.fillLimit || evaluation.fillPercent === null) continue;

    const fillFraction = evaluation.fillPercent / 100;
    if (fillFraction > evaluation.fillLimit) {
      findings.push({
        ruleId: 'DRC-10',
        severity: DRC_SEVERITY.ERROR,
        location: label,
        message:
          `Conduit "${label}" fill ${evaluation.fillPercent.toFixed(1)} % exceeds the selected ` +
          `${(evaluation.fillLimit * 100).toFixed(0)} % NEC Chapter 9 Table 1 limit for ` +
          `${evaluation.cableCount} cable${evaluation.cableCount !== 1 ? 's' : ''}.`,
        detail:
          `${evaluation.conduitType} ${evaluation.tradeSize}: ${evaluation.internalAreaIn2.toFixed(3)} in2 internal area; ` +
          `assigned cable area: ${evaluation.cableAreaTotalIn2.toFixed(3)} in2; cables: ${cableList}.`,
        reference: 'NEC Chapter 9, Table 1 / Informative Annex C',
        remediation:
          'Upsize the conduit, split the cable set across additional raceways, or verify a project-specific conduit-fill calculation basis.',
      });
    } else if (fillFraction > evaluation.fillLimit * 0.9) {
      findings.push({
        ruleId: 'DRC-10',
        severity: DRC_SEVERITY.WARNING,
        location: label,
        message:
          `Conduit "${label}" fill ${evaluation.fillPercent.toFixed(1)} % is within 10 % of the selected ` +
          `${(evaluation.fillLimit * 100).toFixed(0)} % NEC Chapter 9 Table 1 limit.`,
        detail:
          `${evaluation.conduitType} ${evaluation.tradeSize}: ${evaluation.internalAreaIn2.toFixed(3)} in2 internal area; ` +
          `assigned cable area: ${evaluation.cableAreaTotalIn2.toFixed(3)} in2; cables: ${cableList}.`,
        reference: 'NEC Chapter 9, Table 1 / Informative Annex C',
        remediation:
          'Review spare capacity before adding future cables, or reserve a larger/parallel conduit where growth is expected.',
      });
    }
  }

  return findings;
}

function checkUnroutedCables(cables, trayCableMap, routedNames = new Set()) {
  const findings = [];

  // Build set of all cable names present in the tray map
  const inTray = new Set(routedNames);
  for (const cabs of trayCableMap.values()) {
    cabs.forEach(c => { if (c.name ?? c.tag) inTray.add(c.name ?? c.tag); });
  }

  for (const cable of cables) {
    const name = cable.name ?? cable.tag;
    if (!name) continue;
    if (!inTray.has(name)) {
      findings.push({
        ruleId: 'DRC-05',
        severity: DRC_SEVERITY.INFO,
        location: name,
        message: `Cable "${name}" has no assigned route. Run optimal routing or assign manually.`,
        reference: null,
        remediation: `Open the Optimal Route page and run automatic routing, or open the Cable Schedule and manually assign a tray to cable "${name}" in the Allowed Raceways column.`,
      });
    }
  }
  return findings;
}

/**
 * DRC-06 — Structured cabling EMI segregation.
 * Flags tray segments where Data or Fiber cables share space with Power cables.
 * Structured cabling (Category-rated copper and optical fiber) is susceptible to
 * induced noise from nearby power conductors.  TIA-568.0-D §4.5 requires
 * physical separation; NEC Article 800 governs communications cables near power.
 *
 * @param {Map<string, object[]>} trayCableMap  Map of tray_id → cable objects.
 * @returns {DrcFinding[]}
 */
function checkDataCableSegregation(trayCableMap) {
  const findings = [];
  for (const [trayId, cables] of trayCableMap) {
    if (cables.length < 2) continue;
    const hasPower = cables.some(c => isPowerCable(c));
    const hasStructured = cables.some(c => {
      const t = normalizedCableType(c);
      return t === 'data' || t === 'fiber';
    });
    if (!hasPower || !hasStructured) continue;
    const structuredNames = cables
      .filter(c => {
        const t = normalizedCableType(c);
        return t === 'data' || t === 'fiber';
      })
      .map(c => c.name ?? c.tag)
      .filter(Boolean);
    findings.push({
      ruleId: 'DRC-06',
      severity: DRC_SEVERITY.WARNING,
      location: trayId,
      message:
        `EMI segregation: structured cabling [${structuredNames.join(', ')}] ` +
        `shares tray "${trayId}" with power cables.`,
      detail:
        'TIA-568.0-D §4.5 requires separation of Category-rated copper and optical fiber cables ' +
        'from power conductors to prevent induced noise and signal degradation.',
      reference: 'TIA-568.0-D §4.5 / NEC Article 800',
      remediation:
        'Route structured cabling (Data/Fiber) in a dedicated tray separate from power conductors. ' +
        'Maintain ≥ 6 inches of clearance from power trays carrying conductors above 50 V. ' +
        'Where proximity is unavoidable, install a grounded metallic barrier between power and data cables.',
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all DRC rules and return a consolidated finding list.
 *
 * @param {object}   input
 * @param {object[]} input.trays        Raceway schedule rows (from dataStore.getTrays()).
 * @param {object[]} [input.conduits]   Conduit rows (from dataStore.getConduits()).
 * @param {object[]} input.cables       Cable schedule rows (from dataStore.getCables()).
 * @param {object}   input.trayCableMap Plain object { tray_id: cableObj[] } from routing state.
 * @param {object}   [input.conduitCableMap] Plain object { conduit_id: cableObj[] } from routing state.
 * @param {Set<string>} [input.routedCableNames]  Names of cables that have field routes.
 * @param {object}   [options]
 * @param {number}   [options.fillLimit=0.40]   Tray fill fraction limit.
 * @param {boolean}  [options.skipGrounding]    Skip DRC-04 grounding checks.
 * @param {boolean}  [options.skipAmpacity]       Skip DRC-03 ampacity checks.
 * @param {boolean}  [options.skipParallelCheck] Skip DRC-07 parallel conductor checks.
 * @param {boolean}  [options.skipOcpdProtection] Skip DRC-09 conductor/OCPD checks.
 * @param {boolean}  [options.skipConduitFill] Skip DRC-10 conduit fill checks.
 *
 * @returns {{ findings: DrcFinding[], summary: DrcSummary }}
 *
 * @typedef {{
 *   ruleId:       string,
 *   severity:     'error'|'warning'|'info',
 *   location:     string,
 *   message:      string,
 *   detail?:      string,
 *   reference:    string|null,
 *   remediation?: string,
 * }} DrcFinding
 *
 * @typedef {{
 *   errors:   number,
 *   warnings: number,
 *   info:     number,
 *   total:    number,
 *   passed:   boolean,
 * }} DrcSummary
 */
// ---------------------------------------------------------------------------
// DRC-08 — Hazardous area equipment compatibility (NEC 500 / IEC 60079)
// ---------------------------------------------------------------------------

/**
 * Check that equipment assigned to classified hazardous areas has a compatible
 * Ex protection type, equipment group, and T-rating.
 *
 * @param {object[]} equipment  — diagram components with hazAreaId / exProtection fields
 * @param {object[]} areas      — classified area descriptors
 * @param {object}   checkResult — output of checkAllEquipment() from hazAreaClassification.mjs
 * @returns {import('./designRuleChecker.mjs').DrcFinding[]}
 */
export function checkHazAreaCompatibility(equipment, areas, checkResult) {
  const findings = [];
  if (!checkResult || !Array.isArray(checkResult.results)) return findings;

  for (const result of checkResult.results) {
    for (const failure of (result.failures || [])) {
      findings.push({
        ruleId:     'DRC-08',
        severity:   DRC_SEVERITY.ERROR,
        location:   result.label || result.equipId,
        message:    failure,
        reference:  'NEC Art. 500 / IEC 60079-0',
        remediation: 'Select equipment with a compatible Ex protection type, equipment group, and T-rating for the classified area.',
      });
    }
    for (const warning of (result.warnings || [])) {
      findings.push({
        ruleId:     'DRC-08',
        severity:   DRC_SEVERITY.WARNING,
        location:   result.label || result.equipId,
        message:    warning,
        reference:  'NEC Art. 500 / IEC 60079-0',
        remediation: 'Verify equipment certification and T-rating before installation.',
      });
    }
  }

  return findings;
}

export function runDRC(input, options = {}) {
  const {
    trays = [],
    conduits = [],
    cables = [],
    trayCableMap: rawMap = {},
    conduitCableMap: rawConduitMap = {},
    routedCableNames,
  } = input;

  // Convert plain object map to ES Map for internal use
  const trayMap = rawMap instanceof Map
    ? rawMap
    : new Map(Object.entries(rawMap));
  const conduitMap = buildConduitCableMap(conduits, cables, rawConduitMap);
  const routedNames = routedCableNames instanceof Set
    ? new Set(routedCableNames)
    : new Set(routedCableNames ? [...routedCableNames] : []);
  for (const cabs of conduitMap.values()) {
    cabs.forEach(c => { if (c.name ?? c.tag) routedNames.add(c.name ?? c.tag); });
  }

  const findings = [
    ...checkTrayFill(trays, options),
    ...checkSegregation(trays, trayMap),
    ...(options.skipAmpacity ? [] : checkAmpacity(cables, trayMap)),
    ...(options.skipGrounding ? [] : checkGrounding(cables)),
    ...(options.skipOcpdProtection ? [] : checkOcpdProtection(cables)),
    ...(options.skipConduitFill ? [] : checkConduitFill(conduits, conduitMap)),
    ...checkUnroutedCables(cables, trayMap, routedNames),
    ...checkDataCableSegregation(trayMap),
    ...(options.skipParallelCheck ? [] : checkParallelConductors(cables)),
    ...(options.hazAreaCheckResult ? checkHazAreaCompatibility(
        options.hazAreaEquipment || [], options.hazAreas || [], options.hazAreaCheckResult
      ) : []),
  ];

  // Mark each finding with its unique accept-risk key and any matching acceptance.
  const acceptedList = Array.isArray(options.acceptedFindings) ? options.acceptedFindings : [];
  for (const f of findings) {
    f.acceptedKey = `${f.ruleId}:${f.location}`;
    const acceptance = acceptedList.find(a => a.key === f.acceptedKey);
    if (acceptance) {
      f.isAccepted     = true;
      f.acceptanceNote = acceptance.note;
      f.acceptedBy     = acceptance.reviewedBy ?? '';
      f.acceptedAt     = acceptance.acceptedAt ?? '';
    } else {
      f.isAccepted = false;
    }
  }

  const accepted = findings.filter(f => f.isAccepted).length;
  const errors   = findings.filter(f => f.severity === DRC_SEVERITY.ERROR   && !f.isAccepted).length;
  const warnings = findings.filter(f => f.severity === DRC_SEVERITY.WARNING && !f.isAccepted).length;
  const info     = findings.filter(f => f.severity === DRC_SEVERITY.INFO    && !f.isAccepted).length;

  return {
    findings,
    summary: {
      errors,
      warnings,
      info,
      accepted,
      total: findings.length,
      passed: errors === 0,
    },
  };
}

/**
 * Format DRC results as a plain-text report suitable for console output or PDF.
 * @param {{ findings: DrcFinding[], summary: DrcSummary }} result
 * @returns {string}
 */
export function formatDrcReport(result) {
  const { findings, summary } = result;
  const accepted = summary.accepted ?? 0;
  const lines = [
    '=== Design Rule Check Report ===',
    `Status: ${summary.passed ? 'PASSED' : 'FAILED'}`,
    `Errors: ${summary.errors}  Warnings: ${summary.warnings}  Info: ${summary.info}` +
      (accepted > 0 ? `  Accepted Risk: ${accepted}` : ''),
    '',
  ];

  const activeFindings  = findings.filter(f => !f.isAccepted);
  const acceptedFindings = findings.filter(f => f.isAccepted);

  if (activeFindings.length === 0 && acceptedFindings.length === 0) {
    lines.push('No findings. All checks passed.');
    return lines.join('\n');
  }

  for (const f of activeFindings) {
    const prefix = f.severity === 'error' ? '[ERROR]' : f.severity === 'warning' ? '[WARN] ' : '[INFO] ';
    lines.push(`${prefix} ${f.ruleId}  ${f.location}`);
    lines.push(`        ${f.message}`);
    if (f.detail)       lines.push(`        ${f.detail}`);
    if (f.reference)    lines.push(`        Ref: ${f.reference}`);
    if (f.remediation)  lines.push(`        HOW TO FIX: ${f.remediation}`);
    lines.push('');
  }

  if (acceptedFindings.length > 0) {
    lines.push('--- Accepted Risk Findings ---');
    lines.push('');
    for (const f of acceptedFindings) {
      lines.push(`[ACCEPTED RISK] ${f.ruleId}  ${f.location}`);
      lines.push(`        ${f.message}`);
      if (f.reference)     lines.push(`        Ref: ${f.reference}`);
      lines.push(`        ACCEPTANCE NOTE: ${f.acceptanceNote}`);
      if (f.acceptedBy)    lines.push(`        Reviewed by: ${f.acceptedBy}`);
      if (f.acceptedAt)    lines.push(`        Accepted at: ${f.acceptedAt}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
