/**
 * Bounded independent evidence for fault-current and protection calculations.
 *
 * Expected values in this file are recorded constants from the cited source or
 * from the separately stated equations. They are deliberately not obtained by
 * calling the production calculation and then copying its result.
 */

import { runShortCircuit } from '../shortCircuit.mjs';
import { computeIEC60909Bus } from '../iec60909.mjs';
import { evaluateTimeCurrentCurve } from '../timeCurrentCurve.mjs';

const ACCESSED_ON = '2026-09-17';

const EATON_MODEL = [
  {
    id: 'EATON-X1',
    type: 'bus',
    subtype: 'Bus',
    kV: 0.48,
    z1: { r: 0, x: 0.0048384 },
    z2: { r: 0, x: 0.0048384 },
    z0: { r: 0, x: 0.0048384 },
    v_factor: 1,
    method: 'ANSI'
  }
];

const IEC_UNEQUAL_SEQUENCE_INPUTS = {
  z1: { r: 0.01, x: 0.10 },
  z2: { r: 0.02, x: 0.12 },
  z0: { r: 0.03, x: 0.30 },
  prefaultKV: 13.8,
  cMode: 'max',
  faultDurationS: 1,
  freqHz: 50,
  xrOverride: null
};

// Actual source points transcribed from the cited workbook range. The 28
// duplicate-current points are retained with their published times; they are
// not synthesized as a linear range.
const SMU_20_25E_POINTS = [
  { current: 49.4486, time: 39.7197 },
  { current: 49.4981, time: 49.0013 },
  { current: 49.5476, time: 65.03 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 602.961 },
  { current: 49.5972, time: 577.006 },
  { current: 49.5972, time: 520.533 },
  { current: 49.5972, time: 429.17 },
  { current: 49.5972, time: 227.887 },
  { current: 49.5972, time: 169.839 },
  { current: 49.5972, time: 123.451 },
  { current: 49.5972, time: 85.443 },
  { current: 49.5972, time: 32.1639 },
  { current: 49.6468, time: 306.081 },
  { current: 49.9956, time: 26.4921 },
  { current: 50.5991, time: 22.0397 }
];

const GENERATOR_TRANSFORMER_MODEL = [
  {
    id: 'GEN-13K8',
    type: 'generator',
    subtype: 'synchronous',
    rated_kv: 13.8,
    rated_mva: 10,
    xdpp_pu: 0.2,
    pf: 0.8,
    xr_ratio: 20,
    connections: [{ target: 'XF-13K8-480', sourcePort: 0, targetPort: 0 }]
  },
  {
    id: 'XF-13K8-480',
    type: 'transformer',
    subtype: 'two_winding',
    percent_secondary: 5,
    kva_secondary: 10000,
    volts_primary: 13800,
    volts_secondary: 480,
    xr_ratio: 20,
    connections: [{ target: 'BUS-480', sourcePort: 1, targetPort: 0 }]
  },
  { id: 'BUS-480', type: 'bus', subtype: 'Bus', kV: 0.48 }
];

/**
 * Each entry intentionally keeps source, inputs, units, checks, and limits in
 * one place so a fixture JSON export can be generated without losing context.
 */
export const FAULT_PROTECTION_BENCHMARKS = [
  {
    id: 'FAULT-EATON-X1-1500KVA',
    fixtureId: 'eaton-system-a-x1-1500kva-480v',
    label: 'Eaton System A X1 — 1,500 kVA, 480 V transformer fault current',
    studyType: 'ANSI Short Circuit',
    evidenceClass: 'published_worked_example',
    standardRef: 'Eaton Bussmann short-circuit current ratings application note',
    source: {
      title: 'Eaton Bussmann Electrical protection handbook, System A Fault X1',
      url: 'https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/fuses/short-circuit-current-ratings/bus-ele-an-3002-spd.pdf',
      locator: 'printed page 238, System A / Fault X1: 1,500 kVA, 480 V, 3.5% impedance, 0.9 impedance allowance; 57,279 A',
      accessedOn: ACCESSED_ON,
      kind: 'published_values'
    },
    sourceUrl: 'https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/fuses/short-circuit-current-ratings/bus-ele-an-3002-spd.pdf',
    inputs: { model: EATON_MODEL, options: { method: 'ANSI' } },
    inputUnits: {
      'model[0].kV': 'kV line-to-line',
      'model[0].z1.r': 'ohm at 480 V fault bus',
      'model[0].z1.x': 'ohm at 480 V fault bus',
      'model[0].z2': 'ohm at 480 V fault bus',
      'model[0].z0': 'ohm at 480 V fault bus',
      'model[0].v_factor': 'per unit',
      'options.method': 'method name'
    },
    independentDerivation:
      'Zbase = V²/S = 0.48²/1.5 = 0.1536 Ω; effective Zpu = 0.035×0.90 = 0.0315; ' +
      'Z = 0.1536×0.0315 = 0.0048384 Ω; I3 = 0.48/(√3×0.0048384) = 57.2768 kA. ' +
      'The published 57,279 A uses 1.732 for √3 and is retained within the stated tolerance.',
    description:
      'The production ANSI path is checked against the Eaton worked value after the source transformer percentage and allowance are independently converted to an ohmic sequence impedance.',
    run() {
      const result = runShortCircuit(this.inputs.model, this.inputs.options)['EATON-X1'];
      return { three_phase_ka: result.threePhaseKA };
    },
    checks: [
      {
        key: 'three_phase_ka',
        description: 'Initial three-phase RMS fault current (kA)',
        expectedVal: 57.279,
        tolerance: 0.01,
        unit: 'kA RMS',
        toleranceBasis: '0.01 kA covers the source whole-amp rounding and the production two-decimal display rounding.'
      }
    ],
    limitations: [
      'The Eaton case is a transformer/source fault-current example; it does not validate motor contribution, breaker asymmetry, arc-flash energy, or installation-specific conductor impedance.',
      'The source uses a 0.9 impedance allowance; this fixture records that allowance explicitly and does not generalize it to other equipment.'
    ]
  },

  {
    id: 'FAULT-IEC-UNEQUAL-SEQUENCE',
    fixtureId: 'iec60909-unequal-sequence-13k8kv',
    label: 'IEC 60909 unequal-sequence fault-current case',
    studyType: 'IEC Short Circuit',
    evidenceClass: 'independent_analytical',
    standardRef: 'IEC 60909-0:2016, §§4.2–4.5 and §4.3.1.1',
    source: {
      title: 'IEC 60909-0:2016 — Short-circuit currents in three-phase AC systems',
      url: 'https://webstore.iec.ch/en/publication/24100',
      locator: 'IEC publication abstract confirms the covered 50/60 Hz three-phase short-circuit scope; exact standard text and equations are not openly accessible here. Clause mapping is provisional and expected values are independently evaluated from the stated equations.',
      accessedOn: ACCESSED_ON,
      kind: 'equation_basis'
    },
    sourceUrl: 'https://webstore.iec.ch/en/publication/24100',
    inputs: IEC_UNEQUAL_SEQUENCE_INPUTS,
    inputUnits: {
      z1: 'ohm at the fault bus',
      z2: 'ohm at the fault bus',
      z0: 'ohm at the fault bus',
      prefaultKV: 'kV line-to-line',
      cMode: 'IEC voltage-factor mode',
      faultDurationS: 's',
      freqHz: 'Hz',
      xrOverride: 'dimensionless; null means derive X/R from z1'
    },
    independentDerivation:
      'V = c·Un/√3 = 1.10×13.8/√3 = 8.764177 kV; |Z1| = 0.100499 Ω; ' +
      'I″k3 = V/|Z1| = 87.2068 kA; I″k2 = √3V/|Z1+Z2| = 68.3673 kA; ' +
      'I″k1 = 3V/|Z1+Z2+Z0| = 50.2293 kA; κ = 1.02 + 0.98e^(−3·R/X) = 1.7460; ' +
      'ip = κ√2I″k3 = 215.3328 kA.',
    description:
      'Unequal positive-, negative-, and zero-sequence impedances exercise the sequence-specific denominators instead of relying on the equal-sequence shortcut.',
    run() {
      const result = computeIEC60909Bus(this.inputs);
      return {
        ik3_ka: result.threePhaseKA,
        ik2_ka: result.lineToLineKA,
        ik1_ka: result.lineToGroundKA,
        peak_ka: result.ip
      };
    },
    checks: [
      { key: 'ik3_ka', description: 'Initial symmetrical three-phase current', expectedVal: 87.21, tolerance: 0.01, unit: 'kA RMS', toleranceBasis: '0.01 kA exceeds only the production two-decimal rounding residual.' },
      { key: 'ik2_ka', description: 'Initial symmetrical two-phase current', expectedVal: 68.37, tolerance: 0.01, unit: 'kA RMS', toleranceBasis: '0.01 kA exceeds only the production two-decimal rounding residual.' },
      { key: 'ik1_ka', description: 'Initial symmetrical line-to-ground current', expectedVal: 50.23, tolerance: 0.01, unit: 'kA RMS', toleranceBasis: '0.01 kA exceeds only the production two-decimal rounding residual.' },
      { key: 'peak_ka', description: 'Peak short-circuit current ip', expectedVal: 215.33, tolerance: 0.02, unit: 'kA peak', toleranceBasis: '0.02 kA covers production rounding after the independently evaluated κ equation.' }
    ],
    limitations: [
      'This is an independent analytical fixture, not a published IEC worked-example output.',
      'It covers the equivalent-voltage-source sequence calculation only; generator decay, transformer correction, network topology, and thermal integration are outside this fixture.'
    ]
  },

  {
    id: 'PROTECTION-SC-SMU20-25E',
    fixtureId: 'sc-smu20-25e-minimum-melting-vertical-segment',
    label: 'S&C SMU-20 25E minimum-melting vertical segment',
    studyType: 'Protective Device Curves',
    evidenceClass: 'manufacturer_data',
    standardRef: 'S&C TCC 153-2, 25E minimum-melting curve',
    source: {
      title: 'S&C Time-Current Characteristic Curves — TCC 153-2 workbook',
      url: 'https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/tcc-number-153-2.xlsx',
      locator: 'worksheet 153_2, source range P10:Q95; 25E minimum-melting curve, duplicate-current vertical segment at 49.5972 A',
      accessedOn: ACCESSED_ON,
      kind: 'published_values'
    },
    sourceUrl: 'https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/tcc-number-153-2.xlsx',
    inputs: { curvePoints: SMU_20_25E_POINTS, currentA: 49.5972, interpolationCurrentA: 49.82089475390822 },
    inputUnits: { curvePoints: 'A and s', currentA: 'A RMS', interpolationCurrentA: 'A RMS' },
    independentDerivation:
      'The manufacturer source has 28 points at exactly 49.5972 A. The lower boundary is the minimum time 32.1639 s; the upper boundary is 602.961 s. The separate interpolation check uses the published neighboring pairs (49.6468 A, 306.081 s) and (49.9956 A, 26.4921 s); at their geometric-mean current, log-current/log-time interpolation independently gives 90.0485 s.',
    description:
      'The curve evaluator must preserve duplicate-current source geometry and select the lower or upper boundary explicitly.',
    run() {
      const lower = evaluateTimeCurrentCurve(this.inputs.curvePoints, this.inputs.currentA, { boundary: 'lower' });
      const upper = evaluateTimeCurrentCurve(this.inputs.curvePoints, this.inputs.currentA, { boundary: 'upper' });
      return {
        minimum_melting_s: lower.time,
        maximum_source_time_s: upper.time,
        matching_points: lower.matchingPointCount,
        boundary_preserved: lower.status === 'duplicate-current-boundary',
        interpolated_s: evaluateTimeCurrentCurve(this.inputs.curvePoints, this.inputs.interpolationCurrentA).time
      };
    },
    checks: [
      { key: 'minimum_melting_s', description: 'Minimum-melting time', expectedVal: 32.1639, tolerance: 0.0001, unit: 's', toleranceBasis: '0.0001 s is below the source four-decimal time precision and catches boundary selection errors.' },
      { key: 'maximum_source_time_s', description: 'Maximum source-point time', expectedVal: 602.961, tolerance: 0.001, unit: 's', toleranceBasis: '0.001 s matches the source three-decimal time precision.' },
      { key: 'matching_points', description: 'Duplicate-current points retained', expectedVal: 28, tolerance: 0, unit: 'points', toleranceBasis: 'Exact integer count from the manufacturer workbook.' },
      { key: 'boundary_preserved', description: 'Vertical segment recognized', expectedVal: true, tolerance: 0, type: 'boolean', unit: 'boolean', toleranceBasis: 'Exact status assertion.' },
      { key: 'interpolated_s', description: 'Log-current/log-time interpolation between published neighboring points', expectedVal: 90.0485, tolerance: 0.001, unit: 's', toleranceBasis: 'At geometric-mean current, log interpolation gives the geometric-mean time; 0.001 s is below source four-decimal precision.' }
    ],
    limitations: [
      'This validates source geometry and boundary semantics only; it does not promote the device record, validate total-clearing behavior, or authorize coordination or arc-flash clearing-time use.',
      'The source curve is for the identified S&C TCC 153-2 configuration; other fuse units, ratings, voltages, or curve families require their own source record.'
    ]
  },

  {
    id: 'FAULT-GENERATOR-TRANSFORMER-LV-BASE',
    fixtureId: 'generator-13k8kv-transformer-480v-voltage-base',
    label: 'Generator through transformer — LV fault-side base and μ ratio',
    studyType: 'IEC Short Circuit',
    evidenceClass: 'independent_analytical',
    standardRef: 'IEC 60909-0:2016, §§6.3.3, 6.6.1 Eq. 18, and 8.1.5.2',
    source: {
      title: 'Schneider Electric Electrical Installation Guide — 3-phase short-circuit current at any point within a LV installation',
      url: 'https://www.electrical-installation.org/enwiki/3-phase_short-circuit_current_(Isc)_at_any_point_within_a_LV_installation',
      locator: 'Network upstream of MV/LV transformer, Fig. G36: Za = U20²/Psc for upstream source expressed at LV; transformer Z = U20²/Sn × Usc/100. These accessible equations support the voltage-base referral; IEC correction and μ terms remain provisional.',
      accessedOn: ACCESSED_ON,
      kind: 'equation_basis'
    },
    additionalSources: [
      {
        title: 'IEC 60909-0:2016 — Short-circuit currents in three-phase AC systems',
        url: 'https://webstore.iec.ch/en/publication/24100',
        locator: 'Public abstract only; exact correction-factor and μ clauses are not openly accessible.',
        accessedOn: ACCESSED_ON,
        kind: 'equation_basis'
      }
    ],
    sourceUrl: 'https://www.electrical-installation.org/enwiki/3-phase_short-circuit_current_(Isc)_at_any_point_within_a_LV_installation',
    inputs: {
      model: GENERATOR_TRANSFORMER_MODEL,
      options: { method: 'IEC', cMode: 'max', minTimeDelayS: 0.05 }
    },
    inputUnits: {
      'model[0].rated_kv': 'kV line-to-line',
      'model[0].rated_mva': 'MVA',
      'model[0].xdpp_pu': 'per unit',
      'model[0].pf': 'per unit',
      'model[1].percent_secondary': '% impedance',
      'model[1].kva_secondary': 'kVA',
      'model[1].volts_primary': 'V line-to-line',
      'model[1].volts_secondary': 'V line-to-line',
      'options.minTimeDelayS': 's'
    },
    independentDerivation:
      'a = 13.8/0.48 = 28.75 and 1/a = 0.0347826. On the 10 MVA base, generator x″ = 0.2×13.8²/10 = 3.8088 Ω; ' +
      'after K_G = 1.1/(1+0.2×0.6) = 0.9821429 and referral by (0.48/13.8)², Z_G,LV = 0.0045257 Ω. ' +
      'Transformer |Z| = 0.05×0.48²/10 = 0.001152 Ω; with X/R = 20, x_T,pu = 0.05×20/√(1+20²) = 0.0499376 and K_T = 1.014599976998, giving Z_T,LV = 0.0011688 Ω. ' +
      'The independently summed |Z_total,LV| = 0.00569453345921647 Ω, I″k3 = 53.5322066883 kA. ' +
      'I_rG on the fault-side base is 12.0281306081 kA, q = 4.45058408762, μ = 0.844187154306 at 0.05 s, and Ib = 45.1912012279 kA.',
    description:
      'This crosses a transformer voltage base and checks that source impedance and generator rated current are referred consistently to the fault-side winding before the near-generator ratio is evaluated.',
    run() {
      const result = runShortCircuit(this.inputs.model, this.inputs.options)['BUS-480'];
      return {
        three_phase_ka: result.threePhaseKA,
        generator_ratio: result.generatorRatioIkgIrg,
        breaking_ka: result.Ib,
        near_generator: result.nearToGenerator
      };
    },
    checks: [
      { key: 'three_phase_ka', description: 'Correctly referred LV initial symmetrical current', expectedVal: 53.53, tolerance: 0.02, unit: 'kA RMS', toleranceBasis: '0.02 kA covers production display rounding after the independent ohmic referral arithmetic.' },
      { key: 'generator_ratio', description: 'Fault-side q = I″kG / I_rG', expectedVal: 4.451, tolerance: 0.002, unit: 'per unit ratio', toleranceBasis: '0.002 covers rounding of K_G, K_T, and the displayed three-decimal q.' },
      { key: 'breaking_ka', description: 'Near-generator breaking current after μ', expectedVal: 45.19, tolerance: 0.02, unit: 'kA RMS', toleranceBasis: '0.02 kA covers production display rounding after the independent μ equation.' },
      { key: 'near_generator', description: 'Fault is classified near-to-generator', expectedVal: true, tolerance: 0, type: 'boolean', unit: 'boolean', toleranceBasis: 'Exact classification implied by q > 2.' }
    ],
    limitations: [
      'The expected values are independent analytical values; IEC TR 60909-4 comparison-network outputs are not used here.',
      'The model contains one synchronous generator and one two-winding transformer; it does not validate multiple-source sharing, transformer phase shift, zero-sequence grounding paths, motor contribution, or time-domain generator decay.',
      'IEC K_S/K_SO power-station-unit corrections are not implemented; the IEC correction coefficients and μ curve mapping remain provisional pending qualified review of the adopted edition.',
      'The generator source path uses the existing magnitude-based reactance/X-over-R approximation; detailed generator R/X and sequence data require separate evidence.',
      'The corrected implementation scope is bounded to explicit two-winding voltage referral and nominal fault-side generator current base; additional winding topologies require separate evidence.'
    ]
  }
];

export default FAULT_PROTECTION_BENCHMARKS;
