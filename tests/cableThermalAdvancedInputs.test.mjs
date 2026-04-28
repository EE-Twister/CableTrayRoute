import assert from 'node:assert/strict';
import {
  applyAdvancedThermalModifiers,
  buildAdjacentThermalInfluenceRows,
  buildAdvancedCableThermalPackage,
  buildCableThermalEnvironmentPackage,
  buildEmergencyThermalProfile,
  buildThermalBackfillZones,
  evaluateCableThermalEnvironment,
  normalizeAdvancedThermalInputs,
  renderCableThermalEnvironmentHTML,
} from '../analysis/cableThermalEnvironment.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

const cable = {
  id: 'C-ADV',
  tag: 'C-ADV <Main>',
  conductor_size: '4/0 AWG',
  conductor_material: 'Cu',
  insulation_type: 'XLPE',
  voltage_rating: '600 V',
  loadAmps: 180,
};

describe('advanced cable thermal inputs', () => {
  it('normalizes advanced inputs deterministically and rejects invalid numeric rows', () => {
    const inputs = normalizeAdvancedThermalInputs({
      advancedInputs: {
        solar: { enabled: true, solarRadiationWm2: 850, absorptivity: 0.82, windSpeedMs: 2 },
        exposureMode: 'riser',
        dryOut: { enabled: true, moistSoilResistivity: 1.1, drySoilResistivity: 2.8, criticalTempC: 55 },
        backfillZones: [{ name: 'Thermal <sand>', thicknessMm: 300, thermalResistivity: 0.9 }],
        adjacentInfluences: [{ label: 'Parallel feeder', distanceMm: 250, heatWm: 40 }],
        emergencyOverloadProfile: [{ hour: 1, durationHours: 2, loadPct: 115 }],
        sheathBondingLossMode: 'bothEndsBonded',
        cyclicRatingMode: 'iec60853Screening',
      },
    });
    assert.equal(inputs.enabled, true);
    assert.equal(inputs.exposureMode, 'riser');
    assert.equal(inputs.backfillZones[0].name, 'Thermal <sand>');
    assert.equal(inputs.adjacentInfluences[0].heatWm, 40);
    assert.throws(() => buildThermalBackfillZones([{ thicknessMm: -1, thermalResistivity: 1.2 }]), /thickness/);
    assert.throws(() => buildAdjacentThermalInfluenceRows([{ distanceMm: 0, heatWm: 10 }]), /distance/);
  });

  it('solar, wind, and riser inputs affect limiting factor and warnings without breaking base rows', () => {
    const [base] = evaluateCableThermalEnvironment({
      cables: [cable],
      installationMethods: ['tray'],
      ambientTempC: 30,
    });
    const [advanced] = evaluateCableThermalEnvironment({
      cables: [cable],
      installationMethods: ['tray'],
      ambientTempC: 30,
      advancedInputs: {
        enabled: true,
        solar: { enabled: true, solarRadiationWm2: 900, absorptivity: 0.8, windSpeedMs: 1 },
        exposureMode: 'riser',
      },
    });
    assert(advanced.allowableAmpacityA < base.allowableAmpacityA);
    assert(advanced.estimatedConductorTempC > base.estimatedConductorTempC);
    assert.equal(advanced.limitingFactor, 'advanced thermal environment');
    assert(advanced.warnings.some(warning => warning.includes('Solar exposure')));
  });

  it('soil dry-out produces dry-out warnings and adjusted underground rows', () => {
    const [row] = evaluateCableThermalEnvironment({
      cables: [{ ...cable, loadAmps: 250 }],
      installationMethods: ['direct-burial'],
      earthTempC: 30,
      advancedInputs: {
        enabled: true,
        dryOut: { enabled: true, moistSoilResistivity: 1.0, drySoilResistivity: 3.0, criticalTempC: 35 },
      },
    });
    assert(row.advancedWarnings.some(warning => warning.includes('Soil dry-out')));
    assert.equal(row.limitingFactor, 'advanced thermal environment');
    assert(row.loadPct > 0);
  });

  it('backfill zones and adjacent heat sources are JSON-safe and included in package output', () => {
    const pkg = buildAdvancedCableThermalPackage({
      projectName: 'Thermal Advanced',
      cables: [cable],
      installationMethods: ['direct-burial'],
      advancedInputs: {
        enabled: true,
        backfillZones: [{ name: 'Thermal sand', thicknessMm: 250, thermalResistivity: 1.8, notes: 'Around cable' }],
        adjacentInfluences: [{ label: 'Steam trace', type: 'heatSource', distanceMm: 150, heatWm: 60, notes: 'Same trench' }],
      },
    });
    assert.equal(pkg.backfillZones.length, 1);
    assert.equal(pkg.adjacentInfluences.length, 1);
    assert(pkg.advancedWarnings.some(warning => warning.includes('Adjacent thermal influence')));
    assert.doesNotThrow(() => JSON.stringify(pkg));
  });

  it('emergency overload and cyclic profiles produce stable rows and flag exceedance', () => {
    const pkg = buildCableThermalEnvironmentPackage({
      cables: [{ ...cable, loadAmps: 240 }],
      installationMethods: ['tray'],
      advancedInputs: {
        enabled: true,
        cyclicRatingMode: 'emergencyProfile',
        emergencyOverloadProfile: [
          { hour: 0, durationHours: 1, loadPct: 100, notes: 'normal' },
          { hour: 1, durationHours: 2, loadPct: 140, notes: 'emergency' },
        ],
      },
    });
    assert(pkg.emergencyProfiles.length > 0);
    assert(pkg.cyclicRatingRows.some(row => row.status === 'fail' || row.status === 'warn'));
    assert(pkg.advancedWarnings.some(warning => warning.includes('Emergency overload')));
    const profile = buildEmergencyThermalProfile(pkg.evaluations[0], pkg.advancedInputs.emergencyOverloadProfile);
    assert.equal(profile.length, 2);
  });

  it('rendered HTML escapes user-entered cable tags, zone names, heat-source labels, and notes', () => {
    const pkg = buildCableThermalEnvironmentPackage({
      projectName: 'Thermal <Demo>',
      cables: [cable],
      installationMethods: ['direct-burial'],
      advancedInputs: {
        enabled: true,
        backfillZones: [{ name: '<zone>', thicknessMm: 200, thermalResistivity: 1.8, notes: '<note>' }],
        adjacentInfluences: [{ label: '<source>', distanceMm: 200, heatWm: 20, notes: '<adjacent>' }],
        emergencyOverloadProfile: [{ hour: 1, durationHours: 1, loadPct: 120, notes: '<emergency>' }],
      },
    });
    const html = renderCableThermalEnvironmentHTML(pkg);
    assert(html.includes('C-ADV &lt;Main&gt;'));
    assert(html.includes('&lt;emergency&gt;'));
    assert(!html.includes('C-ADV <Main>'));
    assert(!html.includes('<emergency>'));
  });
});
