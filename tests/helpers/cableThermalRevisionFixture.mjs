import { faultEvolutionFixture } from './faultEvolutionFixture.mjs';

/** Synthetic conductor-trial network; clearing/profile claims are mathematical test inputs. */
export function cableThermalRevisionFixture({ count = 25, selected = false, maxRevisions = 3, r = 0.02, x = 0.06, width = count === 50 ? 48 : 24, bypass = false, endpoint = false } = {}) {
  const input = faultEvolutionFixture(count, false);
  input.criteria.loadFlow = { maxRevisions };
  input.faultStudy.sources[0].impedance = { rOhm: r, xOhm: x };
  input.corridors.edges.find(edge => edge.id === 'DOWN').widthIn = width;
  if (bypass) {
    input.corridors.nodes.push({ id: 'NB', x: 15, y: 30, z: 0 });
    input.corridors.edges.push(
      { id: 'BYPASS-1', from: 'NP', to: 'NB', widthIn: 48, depthIn: 6, permitted: true },
      { id: 'BYPASS-2', from: 'NB', to: 'NL', widthIn: 48, depthIn: 6, permitted: true },
    );
  }
  if (endpoint) {
    input.equipment[0].y = 0.5;
    input.criteria.endpointInstallation = { method: 'dedicated-emt', minimumTradeSize: '1/2', maximumTradeSize: '4' };
  }
  input.cableFaultWithstand = {
    schemaVersion: '1.0.0', cableSelection: selected ? { mode: 'selected', cableIds: ['C-L-01'] } : { mode: 'all-modeled' },
    faultSelection: { mode: 'all-generated-bus-fault-cases' },
    clearing: { maximumTotalClearingTimeS: 0.1, reference: 'Synthetic bounded total clearing for arithmetic acceptance', applicabilityReference: 'Synthetic sole-source applicability', appliesToAllModeledSources: true },
    thermal: { conductorMaterial: 'copper', maximumInitialTemperatureC: 90, finalTemperatureC: 250, singleEvent: true, adequateRecoveryBeforeEvent: true, reference: 'Synthetic recovered initial conductor condition' },
  };
  return input;
}

const literalArea = { '#8 AWG': 16510, '#6 AWG': 26240, '#4 AWG': 41740, '#3 AWG': 52620, '#2 AWG': 66360, '#1 AWG': 83690, '1/0 AWG': 105600, '2/0 AWG': 133100, '3/0 AWG': 167800, '4/0 AWG': 211600, '250 kcmil': 250000, '350 kcmil': 350000, '500 kcmil': 500000, '600 kcmil': 600000, '750 kcmil': 750000 };

/** Independent per-phase single-source radial circuit equation, not a production solver/integrator. */
export function independentCableThermalRows(proposal, input, integralSeconds = 0.1) {
  const feeder = proposal.cables.find(row => row.to === 'DP-01');
  const source = input.faultStudy.sources[0];
  const impedance = cable => ({ r: cable.r_ohm_per_kft * cable.lengthFt / 1000, x: cable.x_ohm_per_kft * cable.lengthFt / 1000 });
  const upstream = impedance(feeder);
  return proposal.cableFaultWithstandValidation.cases.map(row => {
    const faultBranch = proposal.cables.find(cable => cable.to === row.faultBusId && cable.id !== feeder.id);
    const active = row.faultBusId === 'DP-01' ? row.cableId === feeder.id : !!faultBranch && [feeder.id, faultBranch.id].includes(row.cableId);
    const downstream = faultBranch ? impedance(faultBranch) : { r: 0, x: 0 };
    const r = source.impedance.rOhm + upstream.r + downstream.r;
    const x = source.impedance.xOhm + upstream.x + downstream.x;
    const exposure = active ? (source.emfPhaseV.re ** 2 + source.emfPhaseV.im ** 2) / (r ** 2 + x ** 2) * integralSeconds : 0;
    const cable = proposal.cables.find(item => item.id === row.cableId);
    return { ...row, expectedExposure: exposure, expectedAllowance: (literalArea[cable.conductor_size] * 0.0719) ** 2 };
  });
}
