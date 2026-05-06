/**
 * Tests for analysis/hazAreaClassification.mjs
 *
 * Covers: constant shapes, classifyArea (NEC and IEC validation, normalisation),
 * checkEquipmentCompatibility (protection type vs zone, group hierarchy, T-rating),
 * checkAllEquipment (batch pass/fail/warn routing), classificationReport (summary
 * aggregation), and runHazAreaStudy (integration + validation errors).
 */
import assert from 'assert';
import {
  NEC_CLASSES,
  NEC_DIVISIONS,
  NEC_GAS_GROUPS,
  NEC_DUST_GROUPS,
  IEC_GAS_ZONES,
  IEC_DUST_ZONES,
  IEC_EQUIPMENT_GROUPS,
  EX_PROTECTION_TYPES,
  T_RATINGS,
  NEC_DIV_TO_IEC_ZONE,
  classifyArea,
  checkEquipmentCompatibility,
  checkAllEquipment,
  classificationReport,
  runHazAreaStudy,
} from '../analysis/hazAreaClassification.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name, err.message || err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
describe('Constants', () => {
  it('NEC_CLASSES contains I, II, III', () => {
    const vals = NEC_CLASSES.map(c => c.value);
    assert.ok(vals.includes('I') && vals.includes('II') && vals.includes('III'));
  });

  it('NEC_DIVISIONS contains 1 and 2', () => {
    const vals = NEC_DIVISIONS.map(d => d.value);
    assert.ok(vals.includes('1') && vals.includes('2'));
  });

  it('NEC_GAS_GROUPS has A, B, C, D', () => {
    const vals = NEC_GAS_GROUPS.map(g => g.value);
    ['A','B','C','D'].forEach(v => assert.ok(vals.includes(v), `missing ${v}`));
  });

  it('NEC_DUST_GROUPS has E, F, G', () => {
    const vals = NEC_DUST_GROUPS.map(g => g.value);
    ['E','F','G'].forEach(v => assert.ok(vals.includes(v), `missing ${v}`));
  });

  it('IEC_GAS_ZONES has 0, 1, 2', () => {
    const vals = IEC_GAS_ZONES.map(z => z.value);
    ['0','1','2'].forEach(v => assert.ok(vals.includes(v), `missing Zone ${v}`));
  });

  it('IEC_DUST_ZONES has 20, 21, 22', () => {
    const vals = IEC_DUST_ZONES.map(z => z.value);
    ['20','21','22'].forEach(v => assert.ok(vals.includes(v), `missing Zone ${v}`));
  });

  it('T_RATINGS has T1 through T6 with maxTempC decreasing', () => {
    assert.strictEqual(T_RATINGS.length, 6);
    for (let i = 0; i < T_RATINGS.length - 1; i++) {
      assert.ok(T_RATINGS[i].maxTempC > T_RATINGS[i + 1].maxTempC,
        `T${i+1} max temp should be > T${i+2}`);
    }
  });

  it('EX_PROTECTION_TYPES includes d, e, ia, ib, n, t', () => {
    const vals = EX_PROTECTION_TYPES.map(p => p.value);
    ['d','e','ia','ib','n','t'].forEach(v => assert.ok(vals.includes(v), `missing Ex ${v}`));
  });

  it('NEC_DIV_TO_IEC_ZONE maps I-1 to zones 0 and 1', () => {
    assert.ok(NEC_DIV_TO_IEC_ZONE['I-1'].includes('0'));
    assert.ok(NEC_DIV_TO_IEC_ZONE['I-1'].includes('1'));
  });

  it('NEC_DIV_TO_IEC_ZONE maps I-2 to zone 2', () => {
    assert.deepStrictEqual(NEC_DIV_TO_IEC_ZONE['I-2'], ['2']);
  });

  it('Ex ia zones include Zone 0', () => {
    const ia = EX_PROTECTION_TYPES.find(p => p.value === 'ia');
    assert.ok(ia && ia.zones.includes('0'));
  });

  it('Ex n zones do NOT include Zone 0 or Zone 1', () => {
    const n = EX_PROTECTION_TYPES.find(p => p.value === 'n');
    assert.ok(n && !n.zones.includes('0') && !n.zones.includes('1'));
  });

  it('Ex t dust zones include Zone 20', () => {
    const t = EX_PROTECTION_TYPES.find(p => p.value === 't');
    assert.ok(t && t.dustZones.includes('20'));
  });
});

// ---------------------------------------------------------------------------
describe('classifyArea — NEC', () => {
  it('accepts valid Class I Div 1 area', () => {
    const { valid, errors } = classifyArea({
      id: 'pump', label: 'Pump Room', standard: 'NEC',
      necClass: 'I', necDivision: '1', gasGroup: 'D',
    });
    assert.ok(valid, errors.join('; '));
  });

  it('accepts valid Class II Div 2 area', () => {
    const { valid } = classifyArea({
      id: 'silo', label: 'Grain Silo', standard: 'NEC',
      necClass: 'II', necDivision: '2', dustGroup: 'G',
    });
    assert.ok(valid);
  });

  it('rejects missing necClass', () => {
    const { valid, errors } = classifyArea({ id: 'x', standard: 'NEC', necDivision: '1' });
    assert.ok(!valid);
    assert.ok(errors.some(e => /necClass/.test(e)));
  });

  it('rejects invalid gas group Z', () => {
    const { valid, errors } = classifyArea({
      id: 'x', standard: 'NEC', necClass: 'I', necDivision: '1', gasGroup: 'Z',
    });
    assert.ok(!valid);
    assert.ok(errors.some(e => /gasGroup/.test(e)));
  });

  it('populates _iecZoneEquiv for Class I Div 1', () => {
    const { area } = classifyArea({
      id: 'x', standard: 'NEC', necClass: 'I', necDivision: '1',
    });
    assert.ok(Array.isArray(area._iecZoneEquiv));
    assert.ok(area._iecZoneEquiv.includes('0'));
  });
});

// ---------------------------------------------------------------------------
describe('classifyArea — IEC', () => {
  it('accepts valid Zone 1 area with IIB group', () => {
    const { valid, errors } = classifyArea({
      id: 'z1', standard: 'IEC', iecZone: '1', gasGroup: 'IIB', tRating: 'T3',
    });
    assert.ok(valid, errors.join('; '));
  });

  it('accepts valid Zone 20 dust area', () => {
    const { valid } = classifyArea({ id: 'z20', standard: 'IEC', dustZone: '20' });
    assert.ok(valid);
  });

  it('rejects IEC area with no zone or dustZone', () => {
    const { valid, errors } = classifyArea({ id: 'x', standard: 'IEC' });
    assert.ok(!valid);
    assert.ok(errors.length > 0);
  });

  it('rejects invalid iecZone 3', () => {
    const { valid, errors } = classifyArea({ id: 'x', standard: 'IEC', iecZone: '3' });
    assert.ok(!valid);
    assert.ok(errors.some(e => /iecZone/.test(e)));
  });

  it('rejects invalid T-rating T7', () => {
    const { valid, errors } = classifyArea({
      id: 'x', standard: 'IEC', iecZone: '1', tRating: 'T7',
    });
    assert.ok(!valid);
    assert.ok(errors.some(e => /tRating/.test(e)));
  });
});

// ---------------------------------------------------------------------------
describe('checkEquipmentCompatibility — protection type vs zone', () => {
  const zone0 = { id: 'z0', standard: 'IEC', iecZone: '0' };
  const zone1 = { id: 'z1', standard: 'IEC', iecZone: '1' };
  const zone2 = { id: 'z2', standard: 'IEC', iecZone: '2' };
  const zone20 = { id: 'z20', standard: 'IEC', dustZone: '20' };

  it('Ex ia passes Zone 0', () => {
    const { pass } = checkEquipmentCompatibility(
      { id: 'e1', label: 'Sensor', exProtection: 'ia' }, zone0
    );
    assert.ok(pass);
  });

  it('Ex e fails Zone 0 (not rated for continuous exposure)', () => {
    const { pass, failures } = checkEquipmentCompatibility(
      { id: 'e1', label: 'JB', exProtection: 'e' }, zone0
    );
    assert.ok(!pass);
    assert.ok(failures.length > 0);
  });

  it('Ex e passes Zone 1', () => {
    const { pass } = checkEquipmentCompatibility(
      { id: 'e1', label: 'JB', exProtection: 'e' }, zone1
    );
    assert.ok(pass);
  });

  it('Ex n passes Zone 2', () => {
    const { pass } = checkEquipmentCompatibility(
      { id: 'e1', label: 'Motor', exProtection: 'n' }, zone2
    );
    assert.ok(pass);
  });

  it('Ex n fails Zone 1', () => {
    const { pass, failures } = checkEquipmentCompatibility(
      { id: 'e1', label: 'Motor', exProtection: 'n' }, zone1
    );
    assert.ok(!pass);
    assert.ok(failures.length > 0);
  });

  it('Ex t passes Zone 20 (dust)', () => {
    const { pass } = checkEquipmentCompatibility(
      { id: 'e1', label: 'Enclosure', exProtection: 't' }, zone20
    );
    assert.ok(pass);
  });

  it('Ex e fails Zone 20 (dust zone — no dust protection)', () => {
    const { pass } = checkEquipmentCompatibility(
      { id: 'e1', label: 'JB', exProtection: 'e' }, zone20
    );
    assert.ok(!pass);
  });

  it('no exProtection generates warning not failure', () => {
    const { pass, warnings, failures } = checkEquipmentCompatibility(
      { id: 'e1', label: 'Unknown' }, zone1
    );
    assert.ok(!pass);
    assert.ok(warnings.length > 0);
    assert.strictEqual(failures.length, 0);
  });
});

// ---------------------------------------------------------------------------
describe('checkEquipmentCompatibility — equipment group hierarchy', () => {
  const zone1_iic = { id: 'z1', standard: 'IEC', iecZone: '1', gasGroup: 'IIC' };
  const zone1_iib = { id: 'z1', standard: 'IEC', iecZone: '1', gasGroup: 'IIB' };

  it('Group IIC equipment passes IIC area', () => {
    const { pass } = checkEquipmentCompatibility(
      { id: 'e1', label: 'Dev', exProtection: 'ia', exGroup: 'IIC' }, zone1_iic
    );
    assert.ok(pass);
  });

  it('Group IIB equipment fails IIC area', () => {
    const { pass, failures } = checkEquipmentCompatibility(
      { id: 'e1', label: 'Dev', exProtection: 'ia', exGroup: 'IIB' }, zone1_iic
    );
    assert.ok(!pass);
    assert.ok(failures.some(f => /IIB.*IIC|IIC.*higher/.test(f)));
  });

  it('Group IIC equipment passes IIB area (higher covers lower)', () => {
    const { pass } = checkEquipmentCompatibility(
      { id: 'e1', label: 'Dev', exProtection: 'ia', exGroup: 'IIC' }, zone1_iib
    );
    assert.ok(pass);
  });
});

// ---------------------------------------------------------------------------
describe('checkEquipmentCompatibility — T-rating', () => {
  const zone_t4 = { id: 'z1', standard: 'IEC', iecZone: '1', tRating: 'T4' };

  it('T4 equipment passes T4 area requirement', () => {
    const { pass } = checkEquipmentCompatibility(
      { id: 'e1', label: 'Motor', exProtection: 'e', tRating: 'T4' }, zone_t4
    );
    assert.ok(pass);
  });

  it('T6 equipment (85°C) passes T4 area (135°C) — more restrictive T6 is fine', () => {
    const { pass } = checkEquipmentCompatibility(
      { id: 'e1', label: 'Motor', exProtection: 'e', tRating: 'T6' }, zone_t4
    );
    assert.ok(pass);
  });

  it('T2 equipment (300°C) fails T4 area (135°C) — surface temp too high', () => {
    const { pass, failures } = checkEquipmentCompatibility(
      { id: 'e1', label: 'Heater', exProtection: 'e', tRating: 'T2' }, zone_t4
    );
    assert.ok(!pass);
    assert.ok(failures.some(f => /T2/.test(f) && /T4/.test(f)));
  });

  it('missing T-rating on equipment generates warning when area requires T-rating', () => {
    const { warnings } = checkEquipmentCompatibility(
      { id: 'e1', label: 'Device', exProtection: 'e' }, zone_t4
    );
    assert.ok(warnings.some(w => /T-rating/.test(w) || /T4/.test(w)));
  });
});

// ---------------------------------------------------------------------------
describe('checkEquipmentCompatibility — NEC Division', () => {
  const necI1 = { id: 'n1', standard: 'NEC', necClass: 'I', necDivision: '1' };
  const necI2 = { id: 'n2', standard: 'NEC', necClass: 'I', necDivision: '2' };

  it('Ex ia passes NEC Class I Div 1 (equivalent to Zone 0+1)', () => {
    const { pass } = checkEquipmentCompatibility(
      { id: 'e1', label: 'Sensor', exProtection: 'ia' }, necI1
    );
    assert.ok(pass);
  });

  it('Ex e fails NEC Class I Div 1 (needs Zone 0 coverage)', () => {
    const { pass } = checkEquipmentCompatibility(
      { id: 'e1', label: 'JB', exProtection: 'e' }, necI1
    );
    assert.ok(!pass);
  });

  it('Ex n passes NEC Class I Div 2 (equivalent to Zone 2)', () => {
    const { pass } = checkEquipmentCompatibility(
      { id: 'e1', label: 'Motor', exProtection: 'n' }, necI2
    );
    assert.ok(pass);
  });
});

// ---------------------------------------------------------------------------
describe('checkAllEquipment', () => {
  const areas = [
    { id: 'z1', standard: 'IEC', iecZone: '1', gasGroup: 'IIB', tRating: 'T3' },
  ];

  it('counts pass and fail correctly', () => {
    const equipment = [
      { id: 'e1', label: 'OK Device', hazAreaId: 'z1', exProtection: 'e', exGroup: 'IIB', tRating: 'T3' },
      { id: 'e2', label: 'Bad Device', hazAreaId: 'z1', exProtection: 'n', exGroup: 'IIB', tRating: 'T3' },
    ];
    const { passCount, failCount, results } = checkAllEquipment(equipment, areas);
    assert.strictEqual(passCount, 1);
    assert.strictEqual(failCount, 1);
    assert.strictEqual(results.length, 2);
  });

  it('warns when area ID not found', () => {
    const equipment = [{ id: 'e1', label: 'Ghost', hazAreaId: 'missing-area' }];
    const { warnCount, results } = checkAllEquipment(equipment, areas);
    assert.ok(warnCount > 0);
    assert.ok(results[0].warnings.some(w => /not found/.test(w)));
  });

  it('returns empty results for empty equipment list', () => {
    const { results, passCount, failCount } = checkAllEquipment([], areas);
    assert.strictEqual(results.length, 0);
    assert.strictEqual(passCount, 0);
    assert.strictEqual(failCount, 0);
  });
});

// ---------------------------------------------------------------------------
describe('classificationReport', () => {
  const areas = [{ id: 'z1', label: 'Zone 1 Area', standard: 'IEC', iecZone: '1' }];
  const equipment = [{ id: 'e1', label: 'JB', hazAreaId: 'z1', exProtection: 'e' }];

  it('returns correct summary structure', () => {
    const checkResult = checkAllEquipment(equipment, areas);
    const report = classificationReport(areas, equipment, checkResult);
    assert.ok(report.summary);
    assert.strictEqual(report.summary.totalAreas, 1);
    assert.strictEqual(report.summary.totalEquipment, 1);
    assert.ok(['PASS','FAIL','WARN'].includes(report.summary.status));
  });

  it('area designation is formatted correctly for IEC Zone', () => {
    const checkResult = checkAllEquipment([], areas);
    const report = classificationReport(areas, [], checkResult);
    assert.ok(report.areas[0].designation.includes('Zone 1'));
  });

  it('area designation is formatted correctly for NEC', () => {
    const necAreas = [{ id: 'n1', label: 'NEC Area', standard: 'NEC', necClass: 'I', necDivision: '1' }];
    const checkResult = checkAllEquipment([], necAreas);
    const report = classificationReport(necAreas, [], checkResult);
    assert.ok(report.areas[0].designation.includes('Class I'));
    assert.ok(report.areas[0].designation.includes('Div 1'));
  });

  it('overall status is FAIL when any equipment fails', () => {
    const badEquip = [{ id: 'e1', label: 'Bad', hazAreaId: 'z1', exProtection: 'n' }];
    const checkResult = checkAllEquipment(badEquip, areas);
    const report = classificationReport(areas, badEquip, checkResult);
    assert.strictEqual(report.summary.status, 'FAIL');
  });

  it('overall status is PASS when all equipment passes with full cert data', () => {
    const goodEquip = [{ id: 'e1', label: 'Good', hazAreaId: 'z1', exProtection: 'ia', exGroup: 'IIB', tRating: 'T3', certNumber: 'IECEx TEST 22.0001' }];
    const checkResult = checkAllEquipment(goodEquip, areas);
    const report = classificationReport(areas, goodEquip, checkResult);
    assert.strictEqual(report.summary.status, 'PASS');
  });
});

// ---------------------------------------------------------------------------
describe('runHazAreaStudy — validation', () => {
  it('returns invalid when inputs is null', () => {
    const { valid } = runHazAreaStudy(null);
    assert.ok(!valid);
  });

  it('returns invalid when areas is empty', () => {
    const { valid, errors } = runHazAreaStudy({ areas: [], equipment: [] });
    assert.ok(!valid);
    assert.ok(errors.some(e => /area/i.test(e)));
  });

  it('returns invalid when an area has bad data', () => {
    const { valid, errors } = runHazAreaStudy({
      areas: [{ id: 'bad', standard: 'NEC' }],
      equipment: [],
    });
    assert.ok(!valid);
    assert.ok(errors.length > 0);
  });
});

// ---------------------------------------------------------------------------
describe('runHazAreaStudy — integration', () => {
  const goodInputs = {
    areas: [
      { id: 'pump', label: 'Pump Room', standard: 'IEC', iecZone: '1', gasGroup: 'IIB', tRating: 'T3' },
      { id: 'dust', label: 'Dust Zone', standard: 'IEC', dustZone: '21' },
    ],
    equipment: [
      { id: 'jb1', label: 'Junction Box', hazAreaId: 'pump', exProtection: 'e', exGroup: 'IIB', tRating: 'T4', certNumber: 'IECEx ABC 22.0001' },
      { id: 'mo1', label: 'Motor', hazAreaId: 'pump', exProtection: 'd', exGroup: 'IIB', tRating: 'T3', certNumber: 'IECEx XYZ 22.0002' },
      { id: 'ht1', label: 'Heat Trace Panel', hazAreaId: 'dust', exProtection: 'tb', tRating: 'T5' },
    ],
  };

  it('returns valid result for well-formed inputs', () => {
    const { valid, errors, result } = runHazAreaStudy(goodInputs);
    assert.ok(valid, errors.join('; '));
    assert.ok(result);
  });

  it('result contains areas, equipment, and summary', () => {
    const { result } = runHazAreaStudy(goodInputs);
    assert.ok(Array.isArray(result.areas));
    assert.ok(Array.isArray(result.equipment));
    assert.ok(result.summary);
  });

  it('equipment count in area row matches input', () => {
    const { result } = runHazAreaStudy(goodInputs);
    const pumpArea = result.areas.find(a => a.id === 'pump');
    assert.strictEqual(pumpArea.equipCount, 2);
  });

  it('result stores _inputs for persistence', () => {
    const { result } = runHazAreaStudy(goodInputs);
    assert.ok(result._inputs);
    assert.strictEqual(result._inputs.areas.length, goodInputs.areas.length);
  });

  it('equipment with bad group fails correctly in full study', () => {
    const inputs = {
      areas: [{ id: 'z1', standard: 'IEC', iecZone: '1', gasGroup: 'IIC' }],
      equipment: [{ id: 'e1', label: 'Bad Equip', hazAreaId: 'z1', exProtection: 'ia', exGroup: 'IIA' }],
    };
    const { valid, result } = runHazAreaStudy(inputs);
    assert.ok(valid);
    assert.strictEqual(result.summary.failCount, 1);
    assert.strictEqual(result.summary.status, 'FAIL');
  });

  it('study with no equipment returns PASS status', () => {
    const inputs = {
      areas: [{ id: 'z1', standard: 'IEC', iecZone: '2' }],
      equipment: [],
    };
    const { valid, result } = runHazAreaStudy(inputs);
    assert.ok(valid);
    assert.strictEqual(result.summary.failCount, 0);
    assert.strictEqual(result.summary.status, 'PASS');
  });

  it('NEC study with valid Class I Div 2 + Ex n motor passes', () => {
    const inputs = {
      areas: [{ id: 'n1', standard: 'NEC', necClass: 'I', necDivision: '2', gasGroup: 'D' }],
      equipment: [{ id: 'e1', label: 'Motor', hazAreaId: 'n1', exProtection: 'n', exGroup: 'IIA', tRating: 'T3', certNumber: 'UL 123456' }],
    };
    const { valid, result } = runHazAreaStudy(inputs);
    assert.ok(valid);
    assert.strictEqual(result.summary.failCount, 0);
  });
});
