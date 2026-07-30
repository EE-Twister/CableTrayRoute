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
import { runLoadFlow } from './loadFlow.js';
import { runReliability } from './reliability.js';
import { calculateMotorStartCase } from './motorStartCalc.mjs';
import { computeIEC60909Bus } from './iec60909.mjs';
import { calcAmpacity } from './iec60287.mjs';
import { runFrequencyScan } from './frequencyScan.mjs';
import {
  equalAreaCriterion,
  findCriticalClearingTime,
  initialRotorAngle,
} from './transientStability.mjs';
import { DEFAULT_FLEET, runOptimalPowerFlow } from './optimalPowerFlow.mjs';

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

  {
    id: 'LFLOW-001',
    label: 'Two-bus radial load-flow known answer',
    studyType: 'Load Flow',
    standardRef: 'Newton-Raphson power-flow equations',
    description:
      'A 13.8 kV slack bus supplies a 1,000 kW / 400 kvar PQ load through a 0.01 + j0.04 pu branch. ' +
      'The live solver must converge and reproduce the independently recorded receiving-bus voltage.',
    run() {
      const result = runLoadFlow({
        buses: [
          { id: 'S', type: 'slack', baseKV: 13.8, Vm: 1, Va: 0 },
          { id: 'L', type: 'PQ', baseKV: 13.8, load: { kw: 1000, kvar: 400 } }
        ],
        branches: [
          { id: 'F', from: 'S', to: 'L', impedance: { r: 0.01, x: 0.04 } }
        ]
      }, { baseMVA: 100 });
      return {
        converged: result.converged,
        receiving_voltage_pu: result.buses.find(bus => bus.id === 'L')?.Vm
      };
    },
    checks: [
      { key: 'converged', description: 'Solver converges', expectedVal: true, tolerance: 0, type: 'boolean' },
      { key: 'receiving_voltage_pu', description: 'Receiving bus voltage (pu)', expectedVal: 0.9998634, tolerance: 0.000001 }
    ]
  },

  {
    id: 'REL-001',
    label: 'Radial breaker N-1 availability',
    studyType: 'Reliability',
    standardRef: 'IEEE Std 493 availability arithmetic',
    description:
      'A source, breaker, and load each have 1,000-hour MTBF and 10-hour MTTR. ' +
      'The live reliability engine must include all components and identify the breaker as the radial N-1 failure.',
    run() {
      const result = runReliability([
        { id: 'source', type: 'bus', mtbf: 1000, mttr: 10, connections: [{ target: 'breaker' }] },
        { id: 'breaker', type: 'breaker', mtbf: 1000, mttr: 10, connections: [{ target: 'source' }, { target: 'load' }] },
        { id: 'load', type: 'bus', mtbf: 1000, mttr: 10, connections: [{ target: 'breaker' }] }
      ]);
      return {
        complete: result.ready,
        analyzed_count: result.analyzedCount,
        breaker_n1: result.n1Failures.includes('breaker')
      };
    },
    checks: [
      { key: 'complete', description: 'All reliability inputs included', expectedVal: true, tolerance: 0, type: 'boolean' },
      { key: 'analyzed_count', description: 'Components analyzed', expectedVal: 3, tolerance: 0 },
      { key: 'breaker_n1', description: 'Breaker identified as N-1 failure', expectedVal: true, tolerance: 0, type: 'boolean' }
    ]
  },

  {
    id: 'MSTART-001',
    label: '100 hp direct-on-line starting screen',
    studyType: 'Motor Starting',
    standardRef: 'Thevenin equivalent motor-starting screening model',
    description:
      'A 100 hp, 480 V motor at 0.90 power factor and efficiency uses 6× locked-rotor current ' +
      'behind 0.01 + j0.02 ohm source impedance. The live engine must reproduce starting current and sag.',
    run() {
      const result = calculateMotorStartCase({
        id: 'M1',
        label: 'M1',
        hp: 100,
        volts: 480,
        powerFactor: 0.9,
        efficiency: 0.9,
        inrushMultiple: 6,
        theveninR: 0.01,
        theveninX: 0.02,
        inertia: 2,
        speedRpm: 1800,
        type: 'dol',
        vfdCurrentLimitPu: 1.1,
        initialVoltagePu: 0.3,
        rampTimeSec: 10,
        wyeDeltaSwitchTimeSec: 5,
        autotransformerTap: 0.65
      }, { maxVoltageSagPct: 15, maxAccelerationTimeSec: 10 });
      return {
        ready: result.ready,
        inrush_ka: result.inrushKA,
        voltage_sag_pct: result.voltageSagPct
      };
    },
    checks: [
      { key: 'ready', description: 'Input case accepted', expectedVal: true, tolerance: 0, type: 'boolean' },
      { key: 'inrush_ka', description: 'Starting current (kA)', expectedVal: 0.665, tolerance: 0.001 },
      { key: 'voltage_sag_pct', description: 'Voltage sag (%)', expectedVal: 3.10, tolerance: 0.01 }
    ]
  },

  {
    id: 'IEC60909-001',
    fixtureId: 'iec60909-short-circuit',
    label: 'IEC 60909 sequence-impedance fault-current case',
    studyType: 'IEC Short Circuit',
    standardRef: 'IEC 60909-0:2016 (version-pinned regression; 2026 edition not yet claimed)',
    sourceUrl: 'https://webstore.iec.ch/en/publication/24100',
    description:
      'A 10 kV bus with positive-, negative-, and zero-sequence impedance 0.0397 + j0.397 ohm ' +
      'uses the maximum voltage factor. This executable case checks initial symmetrical current, ' +
      'peak factor, and peak current. It is intentionally pinned to the implemented 2016 edition.',
    run() {
      const z1 = { r: 0.0397, x: 0.397 };
      const result = computeIEC60909Bus({
        z1,
        z2: z1,
        z0: z1,
        prefaultKV: 10,
        cMode: 'max',
        faultDurationS: 1,
      });
      return {
        c_factor: result.cFactor,
        kappa: result.kappa,
        ik3_ka: result.threePhaseKA,
        peak_ka: result.ip,
      };
    },
    checks: [
      { key: 'c_factor', description: 'Maximum voltage factor c', expectedVal: 1.1, tolerance: 0.001 },
      { key: 'kappa', description: 'Peak factor κ', expectedVal: 1.746, tolerance: 0.001 },
      { key: 'ik3_ka', description: 'Initial symmetrical three-phase current (kA)', expectedVal: 15.92, tolerance: 0.02 },
      { key: 'peak_ka', description: 'Peak short-circuit current (kA)', expectedVal: 39.3, tolerance: 0.1 },
    ],
  },

  {
    id: 'IEC60287-001',
    fixtureId: 'iec60287-cable-rating',
    label: 'IEC 60287 direct-buried cable rating',
    studyType: 'Cable Ampacity',
    standardRef: 'IEC 60287-1-1:2023 steady-state current-rating equations',
    sourceUrl: 'https://webstore.iec.ch/en/publication/68118',
    description:
      'A 95 mm² copper, three-core XLPE cable is evaluated at IEC reference soil and ambient ' +
      'conditions. The live thermal-resistance engine must reproduce the independently recorded ' +
      'continuous rating and conductor-temperature reverse check.',
    run() {
      const result = calcAmpacity({
        sizeMm2: 95,
        material: 'Cu',
        insulation: 'XLPE',
        insulThickMm: 1.6,
        nCores: 3,
        installMethod: 'direct-burial',
        burialDepthMm: 800,
        soilResistivity: 1,
        ambientTempC: 20,
        frequencyHz: 50,
      });
      return {
        ampacity_a: result.I_rated,
        conductor_temp_c: result.thetaConductorActual,
        grouping_factor: result.f_group,
      };
    },
    checks: [
      { key: 'ampacity_a', description: 'Continuous current rating (A)', expectedVal: 315.8, tolerance: 0.2 },
      { key: 'conductor_temp_c', description: 'Conductor temperature at rated current (°C)', expectedVal: 90, tolerance: 0.2 },
      { key: 'grouping_factor', description: 'Single-circuit grouping factor', expectedVal: 1, tolerance: 0 },
    ],
  },

  {
    id: 'FSCAN-001',
    label: 'Source-capacitor parallel-resonance screen',
    studyType: 'Frequency Scan',
    standardRef: 'Parallel resonance h ≈ √(Ssc / Qc), frequency-domain screening',
    description:
      'A 4.16 kV bus with 50 MVA short-circuit strength and a 600 kvar capacitor bank has an ' +
      'analytical resonance near harmonic order √(50,000/600) = 9.13. The half-order scan must ' +
      'identify the nearest peak at h = 9.',
    run() {
      const result = runFrequencyScan({
        baseFreqHz: 60,
        systemKv: 4.16,
        scMva: 50,
        xrRatio: 10,
        capacitorBanks: [{ kvar: 600, label: 'CB-1' }],
        filters: [],
        cables: [],
        harmonicRange: { min: 1, max: 20 },
      });
      const peak = result.resonances.find(item => item.type === 'parallel');
      return {
        resonance_order: peak?.h,
        resonance_frequency_hz: peak?.freqHz,
        peak_impedance_ohm: peak?.zMagOhm,
      };
    },
    checks: [
      { key: 'resonance_order', description: 'Detected parallel-resonance order', expectedVal: 9, tolerance: 0 },
      { key: 'resonance_frequency_hz', description: 'Detected resonance frequency (Hz)', expectedVal: 540, tolerance: 0 },
      { key: 'peak_impedance_ohm', description: 'Peak impedance (ohm)', expectedVal: 89.7481, tolerance: 0.01 },
    ],
  },

  {
    id: 'TRANSIENT-001',
    label: 'OMIB critical-clearing-time known answer',
    studyType: 'Transient Stability',
    standardRef: 'Classical swing equation and equal-area criterion',
    description:
      'A one-machine infinite-bus case with H = 5 s is checked using both the equal-area estimate ' +
      'and the independent numerical bisection search. The numerical CCT must be 0.3434 s and remain ' +
      'within 0.03 s of the analytical estimate.',
    run() {
      const inputs = {
        H: 5,
        f: 60,
        Pm: 0.8,
        Pmax_pre: 2,
        Pmax_fault: 0.5,
        Pmax_post: 1.5,
        t_clear: 0.1,
        t_end: 2,
      };
      const equalArea = equalAreaCriterion(inputs);
      const cct = findCriticalClearingTime({
        ...inputs,
        delta0: initialRotorAngle(inputs.Pm, inputs.Pmax_pre),
        t_fault: 0,
      }, { tMax: 1 });
      return {
        eac_cct_s: equalArea.eac_cct_s,
        numerical_cct_s: cct.cct_s,
        converged: cct.converged,
      };
    },
    checks: [
      { key: 'eac_cct_s', description: 'Equal-area CCT estimate (s)', expectedVal: 0.3192, tolerance: 0.001 },
      { key: 'numerical_cct_s', description: 'Numerical CCT (s)', expectedVal: 0.3434, tolerance: 0.001 },
      { key: 'converged', description: 'Numerical CCT search converges', expectedVal: true, tolerance: 0, type: 'boolean' },
    ],
  },

  {
    id: 'OPF-001',
    label: 'Three-unit equal-incremental-cost dispatch',
    studyType: 'Optimal Power Flow',
    standardRef: 'Wood, Wollenberg & Sheblé §3; IEEE Std 399-1997 system economics',
    sourceUrl: 'https://standards.ieee.org/ieee/Collection/10871/',
    description:
      'The standard three-unit quadratic-cost demonstration fleet serves 850 MW. All unconstrained ' +
      'units must settle at the same incremental cost while total generation balances demand.',
    run() {
      const result = runOptimalPowerFlow(DEFAULT_FLEET, 850, { lossPercent: 0 });
      return {
        feasible: result.feasible,
        generation_mw: result.totalGenMW,
        system_lambda: result.systemLambda,
        cost_per_hour: result.totalCostPerHr,
      };
    },
    checks: [
      { key: 'feasible', description: 'Dispatch is feasible', expectedVal: true, tolerance: 0, type: 'boolean' },
      { key: 'generation_mw', description: 'Generation balances demand (MW)', expectedVal: 850, tolerance: 0.001 },
      { key: 'system_lambda', description: 'Equal incremental cost ($/MWh)', expectedVal: 9.1483, tolerance: 0.001 },
      { key: 'cost_per_hour', description: 'Total production cost ($/h)', expectedVal: 8194.36, tolerance: 0.05 },
    ],
  }
];
