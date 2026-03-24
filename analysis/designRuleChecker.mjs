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
 *   DRC-04  NEC 250.122    — Power cables have no grounding conductor defined
 *   DRC-05  (advisory)     — Cables with no assigned route (unrouted cables)
 *
 * @module designRuleChecker
 */

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
// NEC Table 310.15(B)(16) baseline ampacity — 75 °C copper, used as default
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
  const totalArea = width * depth;
  const fill = fillInSqIn !== undefined ? fillInSqIn : (parseFloat(tray.current_fill) || 0);
  return (fill / totalArea) * 100;
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
    const cableType = (cable.cable_type ?? cable.type ?? '').toLowerCase();
    if (cableType && cableType !== 'power' && cableType !== 'pwr') continue;

    const ratedAmpacity =
      parseFloat(cable.ampacity) ||
      baselineAmpacity(cable.conductor_size ?? cable.conductor) ||
      null;

    if (ratedAmpacity === null) continue;

    const trayIds = cableTrayMap.get(name) ?? [];
    for (const trayId of trayIds) {
      const cohabitants = trayCableMap.get(trayId) ?? [];
      // Count current-carrying conductors (power cables × their conductors per phase)
      const conductorCount = cohabitants.reduce((sum, c) => {
        const type = (c.cable_type ?? c.type ?? '').toLowerCase();
        if (type && type !== 'power' && type !== 'pwr') return sum;
        const conductors = parseInt(c.conductors, 10) || 3;
        return sum + conductors;
      }, 0);

      const factor = derateFactor(conductorCount);
      const deratedAmpacity = ratedAmpacity * factor;
      const designCurrent = parseFloat(cable.design_current ?? cable.load_amps) || null;

      if (designCurrent !== null && designCurrent > deratedAmpacity) {
        findings.push({
          ruleId: 'DRC-03',
          severity: DRC_SEVERITY.ERROR,
          location: `${name} @ ${trayId}`,
          message:
            `Cable "${name}" design current ${designCurrent} A exceeds derated ampacity ` +
            `${deratedAmpacity.toFixed(1)} A (${ratedAmpacity} A × ${factor} derating).`,
          detail:
            `${conductorCount} current-carrying conductors in tray "${trayId}" ` +
            `(NEC 310.15 derating factor ${factor}).`,
          reference: 'NEC 310.15',
          remediation: `Upgrade the conductor to the next larger standard size, reduce the number of bundled conductors by splitting into a separate tray, or reduce the design load current for "${name}".`,
        });
      } else if (factor < 1.0) {
        // Advisory: derating applied even if not over limit
        findings.push({
          ruleId: 'DRC-03',
          severity: DRC_SEVERITY.INFO,
          location: `${name} @ ${trayId}`,
          message:
            `Tray bundling derating applied: ${ratedAmpacity} A → ${deratedAmpacity.toFixed(1)} A ` +
            `(factor ${factor}, ${conductorCount} current-carrying conductors).`,
          reference: 'NEC 310.15',
          remediation: 'No action required if the derated ampacity remains above the design current. Consider segregating conductors into separate tray sections to reduce derating.',
        });
      }
    }
  }
  return findings;
}

/**
 * DRC-04 — Grounding conductor check.
 * Power cables should have a grounding conductor.  If a power cable record
 * has no ground or EGC defined, flag it.
 *
 * @param {object[]} cables  Cable schedule rows.
 * @returns {DrcFinding[]}
 */
function checkGrounding(cables) {
  const findings = [];
  for (const cable of cables) {
    const name = cable.name ?? cable.tag;
    if (!name) continue;
    const cableType = (cable.cable_type ?? cable.type ?? '').toLowerCase();
    if (cableType && cableType !== 'power' && cableType !== 'pwr') continue;

    const hasGround =
      parseFloat(cable.ground_size ?? cable.egc_size ?? cable.ground_conductor) > 0 ||
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all DRC rules and return a consolidated finding list.
 *
 * @param {object}   input
 * @param {object[]} input.trays        Raceway schedule rows (from dataStore.getTrays()).
 * @param {object[]} input.cables       Cable schedule rows (from dataStore.getCables()).
 * @param {object}   input.trayCableMap Plain object { tray_id: cableObj[] } from routing state.
 * @param {Set<string>} [input.routedCableNames]  Names of cables that have field routes.
 * @param {object}   [options]
 * @param {number}   [options.fillLimit=0.40]   Tray fill fraction limit.
 * @param {boolean}  [options.skipGrounding]    Skip DRC-04 grounding checks.
 * @param {boolean}  [options.skipAmpacity]     Skip DRC-03 ampacity checks.
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
export function runDRC(input, options = {}) {
  const { trays = [], cables = [], trayCableMap: rawMap = {}, routedCableNames } = input;

  // Convert plain object map to ES Map for internal use
  const trayMap = rawMap instanceof Map
    ? rawMap
    : new Map(Object.entries(rawMap));

  const findings = [
    ...checkTrayFill(trays, options),
    ...checkSegregation(trays, trayMap),
    ...(options.skipAmpacity ? [] : checkAmpacity(cables, trayMap)),
    ...(options.skipGrounding ? [] : checkGrounding(cables)),
    ...checkUnroutedCables(cables, trayMap, routedCableNames),
  ];

  const errors   = findings.filter(f => f.severity === DRC_SEVERITY.ERROR).length;
  const warnings = findings.filter(f => f.severity === DRC_SEVERITY.WARNING).length;
  const info     = findings.filter(f => f.severity === DRC_SEVERITY.INFO).length;

  return {
    findings,
    summary: {
      errors,
      warnings,
      info,
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
  const lines = [
    '=== Design Rule Check Report ===',
    `Status: ${summary.passed ? 'PASSED' : 'FAILED'}`,
    `Errors: ${summary.errors}  Warnings: ${summary.warnings}  Info: ${summary.info}`,
    '',
  ];

  if (findings.length === 0) {
    lines.push('No findings. All checks passed.');
    return lines.join('\n');
  }

  for (const f of findings) {
    const prefix = f.severity === 'error' ? '[ERROR]' : f.severity === 'warning' ? '[WARN] ' : '[INFO] ';
    lines.push(`${prefix} ${f.ruleId}  ${f.location}`);
    lines.push(`        ${f.message}`);
    if (f.detail)     lines.push(`        ${f.detail}`);
    if (f.reference)  lines.push(`        Ref: ${f.reference}`);
    lines.push('');
  }

  return lines.join('\n');
}
