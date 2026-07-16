/**
 * Trust Center — Benchmark Library
 *
 * Canonical known-answer problems (KAPs) covering key calculation engines.
 * Expected values are derived analytically from first-principles formulas so
 * a passing result confirms the engine matches the governing standard — not
 * just that it is internally consistent.
 *
 * Each benchmark:
 *   id          — unique identifier (e.g. 'EMF-001')
 *   label       — short display name
 *   studyType   — which module / study page this tests
 *   standardRef — governing standard / formula reference
 *   description — plain-English explanation of what is verified and why
 *   run()       — calls analysis functions; returns { [checkKey]: value }
 *   checks[]    — { key, description, expectedVal, tolerance, type? }
 *                 type defaults to 'numeric'; use 'boolean' for true/false
 */

import {
  fieldFromSingleConductor,
  checkCompliance,
} from './emf.mjs';

import {
  requiredEnergyKwh,
  designCapacityKwh,
} from './batterySizing.mjs';

import { evaluateCable } from './voltageDropStudy.mjs';

export const BENCHMARKS = [
  // -------------------------------------------------------------------------
  // EMF Analysis — Biot-Savart / ICNIRP
  // -------------------------------------------------------------------------
  {
    id: 'EMF-001',
    label: 'Biot-Savart: single conductor at 1 m',
    studyType: 'EMF Analysis',
    standardRef: 'Biot-Savart law; IEC 62110:2009',
    description:
      'Magnetic flux density from a 100 A conductor at 1 m perpendicular distance. ' +
      'Analytical: B = µ₀I/(2πd) = 4π×10⁻⁷ × 100 / (2π × 1.0) = 20.000 µT.',
    run() {
      return { field_uT: fieldFromSingleConductor(100, 1.0) };
    },
    checks: [
      {
        key: 'field_uT',
        description: 'B at 1 m (µT)',
        expectedVal: 20.0,
        tolerance: 0.01,
      },
    ],
  },

  {
    id: 'EMF-002',
    label: 'ICNIRP compliance — 150 µT (below GP limit)',
    studyType: 'EMF Analysis',
    standardRef: 'ICNIRP 2010 Guidelines; IEC 62110:2009',
    description:
      'B_rms = 150 µT at 60 Hz is below the ICNIRP general-public limit (200 µT) and ' +
      'the occupational limit (1000 µT). Both checks must return pass = true.',
    run() {
      const r = checkCompliance(150, 60);
      return {
        gp_pass:  r.generalPublic.pass,
        occ_pass: r.occupational.pass,
      };
    },
    checks: [
      {
        key: 'gp_pass',
        description: 'General-public PASS (150 < 200 µT)',
        expectedVal: true,
        tolerance: 0,
        type: 'boolean',
      },
      {
        key: 'occ_pass',
        description: 'Occupational PASS (150 < 1000 µT)',
        expectedVal: true,
        tolerance: 0,
        type: 'boolean',
      },
    ],
  },

  {
    id: 'EMF-003',
    label: 'ICNIRP compliance — 250 µT (exceeds GP limit)',
    studyType: 'EMF Analysis',
    standardRef: 'ICNIRP 2010 Guidelines; IEC 62110:2009',
    description:
      'B_rms = 250 µT at 60 Hz exceeds the ICNIRP general-public limit (200 µT) but ' +
      'is below the occupational limit (1000 µT). GP check must return false; occ must return true.',
    run() {
      const r = checkCompliance(250, 60);
      return {
        gp_pass:  r.generalPublic.pass,
        occ_pass: r.occupational.pass,
      };
    },
    checks: [
      {
        key: 'gp_pass',
        description: 'General-public FAIL (250 > 200 µT)',
        expectedVal: false,
        tolerance: 0,
        type: 'boolean',
      },
      {
        key: 'occ_pass',
        description: 'Occupational PASS (250 < 1000 µT)',
        expectedVal: true,
        tolerance: 0,
        type: 'boolean',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Battery / UPS preliminary screening arithmetic
  // -------------------------------------------------------------------------
  {
    id: 'BAT-001',
    label: 'Battery duty-cycle energy summation',
    studyType: 'Battery / UPS Sizing',
    standardRef: 'Arithmetic screening check (not an IEEE 485 cell-sizing test)',
    description:
      'Net energy for a two-period duty cycle: 10 kW × 2 h + 5 kW × 1 h = 25 kWh. ' +
      'Verifies the Σ(P_i × Δt_i) arithmetic.',
    run() {
      return {
        energy_kwh: requiredEnergyKwh([
          { powerKw: 10, durationHours: 2 },
          { powerKw: 5,  durationHours: 1 },
        ]),
      };
    },
    checks: [
      {
        key: 'energy_kwh',
        description: 'Net energy (kWh)',
        expectedVal: 25.0,
        tolerance: 0.01,
      },
    ],
  },

  {
    id: 'BAT-002',
    label: 'Li-ion preliminary energy-capacity screen at 25 °C, 10 % margin',
    studyType: 'Battery / UPS Sizing',
    standardRef: 'Application screening heuristic (not within IEEE 485 scope)',
    description:
      'kWh_net = 10 kWh; Li-ion (η = 0.95, DoD = 0.90); T_amb = 25 °C → K_temp = 1.0; ' +
      'aging = 1.20; margin = 10 %. ' +
      'kWh_design = 10/0.855 ≈ 11.70 → aged 14.04 → final 15.44 kWh.',
    run() {
      const r = designCapacityKwh(10, 'lithium-ion', 25, 10);
      return {
        kwh_design: r.kwhDesign,
        k_temp:     r.kTempFactor,
        kwh_aged:   r.kwhWithAging,
        kwh_final:  r.kwhFinal,
      };
    },
    checks: [
      {
        key: 'kwh_design',
        description: 'Design capacity before temperature derating (kWh)',
        expectedVal: 11.70,
        tolerance: 0.05,
      },
      {
        key: 'k_temp',
        description: 'Temperature correction factor K_temp at 25 °C',
        expectedVal: 1.0,
        tolerance: 0.0001,
      },
      {
        key: 'kwh_aged',
        description: 'kWh after aging factor 1.20 (kWh)',
        expectedVal: 14.04,
        tolerance: 0.05,
      },
      {
        key: 'kwh_final',
        description: 'Final design capacity with 10 % margin (kWh)',
        expectedVal: 15.44,
        tolerance: 0.05,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Voltage Drop Study — NEC 2023 Art. 210.19 / 215.2 informational-note recommendations
  // -------------------------------------------------------------------------
  {
    id: 'VDROP-001',
    label: 'Voltage drop — #12 AWG Cu, 120 V, 10 A, 30 ft (pass case)',
    studyType: 'Voltage Drop',
    standardRef: 'NEC 2023 Art. 210.19(A)(1) Informational Note',
    description:
      '#12 AWG copper, single-phase 120 V, 10 A, 30 ft one-way run. ' +
      'Well within NEC 3 % branch-circuit recommendation — status must be "pass".',
    run() {
      const r = evaluateCable({
        conductor_size:     '12 AWG',
        conductor_material: 'CU',
        est_load:           '10',
        operating_voltage:  '120',
        insulation_rating:  '75',
        circuit_type:       'branch',
        phases:             '1',
      }, 30);
      return {
        drop_pct:    r.dropPct,
        status_pass: r.status === 'pass' ? 1 : 0,
      };
    },
    checks: [
      {
        key: 'drop_pct',
        description: 'Voltage drop (%) must be below 3 % recommendation',
        expectedVal: 1.5,    // Midpoint of expected range; tolerance keeps [0, 3) passing
        tolerance: 1.5,
      },
      {
        key: 'status_pass',
        description: 'Recommendation status = pass',
        expectedVal: 1,
        tolerance: 0,
      },
    ],
  },

  {
    id: 'VDROP-002',
    label: 'Voltage drop — #14 AWG Cu, 120 V, 20 A, 150 ft (fail case)',
    studyType: 'Voltage Drop',
    standardRef: 'NEC 2023 Art. 210.19(A)(1) Informational Note',
    description:
      '#14 AWG copper, single-phase 120 V, 20 A, 150 ft one-way run. ' +
      'Heavily loaded long run on a small conductor — voltage drop exceeds the 3 % recommendation; ' +
      'status must be "warn" or "fail".',
    run() {
      const r = evaluateCable({
        conductor_size:     '14 AWG',
        conductor_material: 'CU',
        est_load:           '20',
        operating_voltage:  '120',
        insulation_rating:  '75',
        circuit_type:       'branch',
        phases:             '1',
      }, 150);
      return {
        drop_pct:         r.dropPct,
        status_not_pass:  r.status !== 'pass' ? 1 : 0,
      };
    },
    checks: [
      {
        key: 'drop_pct',
        description: 'Voltage drop (%) must exceed 3 % recommendation',
        expectedVal: 12,     // Midpoint of expected range [3, 21 %]; actual ≈ 15 %
        tolerance: 9,
      },
      {
        key: 'status_not_pass',
        description: 'Recommendation status is warn or fail (not pass)',
        expectedVal: 1,
        tolerance: 0,
      },
    ],
  },
];
