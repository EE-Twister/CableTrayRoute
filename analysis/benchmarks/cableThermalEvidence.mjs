/**
 * Published cross-tool cable thermal references with fixed supplied losses.
 * These cases exercise the thermal circuit only; they do not validate the
 * supplied electromagnetic loss calculations or complete IEC/CIGRE methods.
 */

import referenceData from '../../data/cableThermalReferenceProfiles.json' with { type: 'json' };
import { calculateCableThermalRating } from '../cableThermalModel.mjs';

export const CABLE_THERMAL_BENCHMARKS = referenceData.profiles.map(profile => ({
  id: profile.id === 'tb880-case0-both-ends' ? 'CABLE-THERMAL-001' : 'CABLE-THERMAL-002',
  fixtureId: profile.id === 'tb880-case0-both-ends' ? 'CABLE-THERMAL-001' : 'CABLE-THERMAL-002',
  label: profile.label,
  studyType: 'Cable thermal detailed model',
  standardRef: 'Cableizer / CIGRE TB 880 published cross-tool thermal reference',
  sourceUrl: profile.cable.source.url,
  source: { title: 'Cableizer/CIGRE TB 880 published case study', url: profile.cable.source.url, locator: `Profile ${profile.id}; source pages ${profile.cable.source.pages}`, accessedOn: '2026-09-18', kind: 'published_values' },
  evidenceClass: 'cross_tool_comparison',
  inputs: { cable: profile.cable, installation: profile.installation },
  inputUnits: { 'cable.sizeMm2': 'mm²', 'cable.acResistanceOhmPerKm': 'Ω/km', 'cable.dielectricLossWPerM': 'W/m', 'cable.outerDiameterMm': 'mm', 'installation.burialDepthMm': 'mm', 'installation.soilResistivityKmPerW': 'K·m/W' },
  description: 'Runs the detailed radial and touching-trefoil thermal circuit with published construction, geometry, and fixed loss inputs.',
  assumptions: [
    'AC resistance, dielectric loss, and sheath loss factor are supplied at stated temperature/frequency and are not recalculated.',
    'Thermal-only cross-tool comparison; not independent validation of electromagnetic loss equations or full IEC/CIGRE implementation.',
  ],
  limitations: [profile.reference.scope],
  independentDerivation: 'T1, T3, touching-trefoil T4, and current rating are evaluated from literal supplied layer geometry and fixed losses; published outputs are rounded.',
  run() {
    const result = calculateCableThermalRating(this.inputs);
    return {
      ampacityA: result.ampacityA,
      T1KmPerW: result.thermalResistances.T1_KmPerW,
      T3BaseKmPerW: result.thermalResistances.T3_KmPerW,
      T3EffectiveKmPerW: result.thermalResistances.T3effective_KmPerW,
      T4EffectiveKmPerW: result.thermalResistances.T4EffectiveByCable_KmPerW[0],
      limitingConductorTempC: result.temperatures.conductorCByPhase[result.limitingPhase],
    };
  },
  checks: [
    { key: 'ampacityA', description: 'Thermal-only current rating', expectedVal: profile.reference.ampacityA, tolerance: profile.reference.ampacityToleranceA, unit: 'A RMS', toleranceBasis: profile.reference.toleranceBasis },
    { key: 'T1KmPerW', description: 'Insulation radial thermal resistance', expectedVal: profile.reference.T1KmPerW, tolerance: profile.reference.thermalToleranceKmPerW, unit: 'K·m/W', toleranceBasis: profile.reference.toleranceBasis },
    { key: 'T3BaseKmPerW', description: 'Jacket radial thermal resistance', expectedVal: profile.reference.T3BaseKmPerW, tolerance: profile.reference.thermalToleranceKmPerW, unit: 'K·m/W', toleranceBasis: profile.reference.toleranceBasis },
    { key: 'T3EffectiveKmPerW', description: 'Touching-trefoil effective jacket resistance', expectedVal: profile.reference.T3EffectiveKmPerW, tolerance: profile.reference.thermalToleranceKmPerW, unit: 'K·m/W', toleranceBasis: profile.reference.toleranceBasis },
    { key: 'T4EffectiveKmPerW', description: 'Touching-trefoil external thermal resistance', expectedVal: profile.reference.T4EffectiveKmPerW, tolerance: profile.reference.thermalToleranceKmPerW, unit: 'K·m/W', toleranceBasis: profile.reference.toleranceBasis },
    { key: 'limitingConductorTempC', description: 'Reverse conductor temperature', expectedVal: 90, tolerance: 1e-9, unit: '°C', toleranceBasis: 'Supplied loss balance is evaluated at maximum conductor temperature.' },
  ],
}));

export default CABLE_THERMAL_BENCHMARKS;
