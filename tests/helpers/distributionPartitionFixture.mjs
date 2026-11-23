import { faultEvolutionFixture } from './faultEvolutionFixture.mjs';

/** Original synthetic all-motor reproduction; panel limits are not tightened. */
export function distributionPartitionFixture(count = 25) {
  const input = faultEvolutionFixture(count);
  input.supply.capacityKva = 2000;
  const motor = structuredClone(input.equipment.at(-1));
  input.equipment = input.equipment.map(row => ({ ...structuredClone(motor), id: row.id, tag: row.tag }));
  const motorSource = input.faultStudy.sources[1];
  input.faultStudy.sources = [input.faultStudy.sources[0], ...input.equipment.map(row => ({ ...structuredClone(motorSource), equipmentId: row.id }))];
  const motorProfile = input.faultEvolution.profiles[1];
  input.faultEvolution.profiles = [input.faultEvolution.profiles[0], ...input.equipment.map(row => ({ ...structuredClone(motorProfile), equipmentId: row.id }))];
  return input;
}

export function nonmotorDistributionPartitionFixture(count = 50) {
  const input = distributionPartitionFixture(count);
  for (const load of input.equipment) delete load.motor;
  delete input.criteria.motorStarter;
  delete input.criteria.motorStarting;
  delete input.supply.motorStartingImpedance;
  input.faultStudy.sources = input.faultStudy.sources.filter(source => source.equipmentId === input.supply.id);
  input.faultEvolution.profiles = input.faultEvolution.profiles.filter(profile => profile.equipmentId === input.supply.id);
  return input;
}
