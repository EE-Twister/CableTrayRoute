/**
 * Tests for analysis/productConfig.mjs
 *
 * Verifies load class selection, width selection, material and tray type
 * recommendations, and the full configure() function.
 */
import assert from 'assert';
import {
  NEMA_LOAD_CLASSES,
  MATERIALS,
  TRAY_TYPES,
  STANDARD_WIDTHS_IN,
  requiredRatedLoad,
  selectLoadClass,
  recommendMaterials,
  recommendTrayTypes,
  selectMinWidth,
  configure,
} from '../analysis/productConfig.mjs';

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

// ---------------------------------------------------------------------------
// NEMA_LOAD_CLASSES
// ---------------------------------------------------------------------------
describe('NEMA_LOAD_CLASSES', () => {
  it('defines the traditional span/load class combinations', () => {
    ['8A', '8B', '8C', '12A', '12B', '12C', '16A', '16B', '16C', '20A', '20B', '20C'].forEach(c =>
      assert.ok(NEMA_LOAD_CLASSES[c], `${c} must exist`)
    );
  });

  it('maps numeric prefixes to spans and letters to load families', () => {
    Object.entries(NEMA_LOAD_CLASSES).forEach(([id, def]) => {
      assert.strictEqual(def.ratedSpan, parseInt(id, 10));
      assert.strictEqual(def.ratedLoad, { A: 50, B: 75, C: 100 }[id.at(-1)]);
    });
  });
});

// ---------------------------------------------------------------------------
// requiredRatedLoad
// ---------------------------------------------------------------------------
describe('requiredRatedLoad', () => {
  it('at 12 ft span, required load equals cable weight', () => {
    assert.strictEqual(requiredRatedLoad(10, 12), 10);
  });

  it('does not reinterpret span as load', () => {
    assert.strictEqual(requiredRatedLoad(10, 8), 10);
    assert.strictEqual(requiredRatedLoad(10, 20), 10);
  });

  it('throws for non-positive span', () => {
    assert.throws(() => requiredRatedLoad(10, 0), /positive/);
    assert.throws(() => requiredRatedLoad(10, -1), /positive/);
  });

  it('throws for negative cable weight', () => {
    assert.throws(() => requiredRatedLoad(-1, 10), /≥ 0/);
  });

  it('returns 0 for zero cable weight', () => {
    assert.strictEqual(requiredRatedLoad(0, 10), 0);
  });
});

// ---------------------------------------------------------------------------
// selectLoadClass
// ---------------------------------------------------------------------------
describe('selectLoadClass', () => {
  it('selects 12A for a default 12 ft span', () => {
    const r = selectLoadClass(0);
    assert.strictEqual(r.classId, '12A');
  });

  it('selects exact class when load matches rated exactly', () => {
    const r = selectLoadClass(50, 12);
    assert.strictEqual(r.classId, '12A');
  });

  it('selects next class up when slightly over', () => {
    const r = selectLoadClass(50.1, 12);
    assert.strictEqual(r.classId, '12B');
  });

  it('selects the requested span family', () => {
    const r = selectLoadClass(40, 16);
    assert.strictEqual(r.classId, '16A');
  });

  it('returns null when required load exceeds all classes', () => {
    const r = selectLoadClass(101, 12);
    assert.strictEqual(r, null);
  });
});

// ---------------------------------------------------------------------------
// selectMinWidth
// ---------------------------------------------------------------------------
describe('selectMinWidth', () => {
  it('returns 6 in when cable CSA is very small', () => {
    // 6 × 4 × 0.5 = 12 in² allowed; 1 in² fits easily
    assert.strictEqual(selectMinWidth(1, 4, 0.5), 6);
  });

  it('steps up to next standard width as CSA grows', () => {
    // 6 × 4 × 0.5 = 12 in² — a 12.1 in² fill needs 9 in width
    // 9 × 4 × 0.5 = 18 in²  ≥ 12.1
    assert.strictEqual(selectMinWidth(12.1, 4, 0.5), 9);
  });

  it('returns -1 when no standard width is sufficient', () => {
    // 36 × 4 × 0.5 = 72 in² max; 100 in² exceeds
    assert.strictEqual(selectMinWidth(100, 4, 0.5), -1);
  });

  it('throws for negative CSA', () => {
    assert.throws(() => selectMinWidth(-1, 4, 0.5), /≥ 0/);
  });

  it('throws for non-positive depth', () => {
    assert.throws(() => selectMinWidth(5, 0, 0.5), /positive/);
  });

  it('throws for fill fraction out of range', () => {
    assert.throws(() => selectMinWidth(5, 4, 0),   /fill/i);
    assert.throws(() => selectMinWidth(5, 4, 1.1), /fill/i);
  });
});

// ---------------------------------------------------------------------------
// recommendMaterials
// ---------------------------------------------------------------------------
describe('recommendMaterials', () => {
  it('returns an array for every valid environment', () => {
    ['indoorDry', 'indoorWet', 'outdoor', 'corrosive'].forEach(env => {
      const result = recommendMaterials(env);
      assert.ok(Array.isArray(result) && result.length > 0, `${env} should return materials`);
    });
  });

  it('includes fiberglass for corrosive environment', () => {
    assert.ok(recommendMaterials('corrosive').includes('fiberglass'));
  });

  it('includes pregalvanized for indoor dry only', () => {
    const indoorDry = recommendMaterials('indoorDry');
    const outdoor   = recommendMaterials('outdoor');
    assert.ok(indoorDry.includes('pregalvanized'));
    assert.ok(!outdoor.includes('pregalvanized'));
  });
});

// ---------------------------------------------------------------------------
// recommendTrayTypes
// ---------------------------------------------------------------------------
describe('recommendTrayTypes', () => {
  it('returns an array for every valid application', () => {
    ['power', 'control', 'instrumentation', 'communication', 'data', 'mixed', 'corrosive'].forEach(app => {
      const result = recommendTrayTypes(app);
      assert.ok(Array.isArray(result), `${app} should return an array`);
    });
  });

  it('includes ladder for power application', () => {
    assert.ok(recommendTrayTypes('power').includes('ladder'));
  });

  it('includes solidBottom for instrumentation', () => {
    assert.ok(recommendTrayTypes('instrumentation').includes('solidBottom'));
  });

  it('includes wireMesh for data application', () => {
    assert.ok(recommendTrayTypes('data').includes('wireMesh'));
  });
});

// ---------------------------------------------------------------------------
// configure — integration
// ---------------------------------------------------------------------------
describe('configure — basic integration', () => {
  const baseInputs = {
    cableWeightLbFt:  8,
    spanFt:           10,
    totalCableCsaIn2: 15,
    environment:      'indoorDry',
    application:      'power',
    depthIn:          4,
    fillFraction:     0.5,
  };

  it('returns a structured result object', () => {
    const r = configure(baseInputs);
    assert.strictEqual(r.calculationStatus, 'screening-only');
    assert.strictEqual(r.standardCompliance, null);
    assert.ok(r.requiredInputs.length >= 2);
    assert.ok(r.loadClass, 'missing loadClass');
    assert.ok(r.geometry,  'missing geometry');
    assert.ok(r.trayType,  'missing trayType');
    assert.ok(r.material,  'missing material');
    assert.ok(typeof r.specificationText === 'string', 'missing specificationText');
  });

  it('selects a valid NEMA load class for moderate load at 10 ft span', () => {
    const r = configure(baseInputs);
    assert.strictEqual(r.loadClass.id, '12A');
    assert.ok(NEMA_LOAD_CLASSES[r.loadClass.id], 'loadClass.id must be a valid NEMA class');
    assert.ok(!r.loadClass.exceeded, 'should not exceed all classes');
  });

  it('recommends 12 in width for 15 in² CSA in a 4 in deep tray at 50%', () => {
    // 6×4×0.5=12 < 15; 9×4×0.5=18 ≥ 15  → width = 9 in
    const r = configure(baseInputs);
    assert.strictEqual(r.geometry.widthIn, 9);
  });

  it('recommends ladder tray for power application', () => {
    const r = configure(baseInputs);
    assert.strictEqual(r.trayType.primary.key, 'ladder');
  });

  it('generates specification text that includes NEMA class and width', () => {
    const r = configure(baseInputs);
    assert.ok(r.specificationText.includes('NEMA'), 'spec should mention NEMA');
    assert.ok(r.specificationText.length > 50, 'spec should be non-trivial');
  });
});

describe('configure — corrosive environment', () => {
  const corrosiveInputs = {
    cableWeightLbFt:  5,
    spanFt:           10,
    totalCableCsaIn2: 10,
    environment:      'corrosive',
    application:      'corrosive',
    depthIn:          4,
    fillFraction:     0.5,
  };

  it('recommends fiberglass tray type for corrosive environment', () => {
    const r = configure(corrosiveInputs);
    assert.strictEqual(r.trayType.primary.key, 'fiberglass');
  });

  it('recommends fiberglass material for corrosive environment', () => {
    const r = configure(corrosiveInputs);
    assert.strictEqual(r.material.primary.key, 'fiberglass');
  });
});

describe('configure — heavy load at long span', () => {
  it('flags exceeded when load class is insufficient', () => {
    // Very heavy load at a long span to exceed all NEMA classes
    const r = configure({
      cableWeightLbFt:  100,
      spanFt:           30,
      totalCableCsaIn2: 10,
      environment:      'indoorDry',
      application:      'power',
      depthIn:          4,
      fillFraction:     0.5,
    });
    assert.ok(r.loadClass.exceeded, 'should flag exceeded for extreme load');
  });

  it('flags width insufficient when CSA is enormous', () => {
    const r = configure({
      cableWeightLbFt:  5,
      spanFt:           10,
      totalCableCsaIn2: 500,
      environment:      'indoorDry',
      application:      'power',
      depthIn:          4,
      fillFraction:     0.5,
    });
    assert.ok(r.geometry.widthInsufficient, 'should flag widthInsufficient');
  });
});

describe('configure — input validation', () => {
  it('throws for negative cable weight', () => {
    assert.throws(() => configure({
      cableWeightLbFt: -1, spanFt: 10, totalCableCsaIn2: 10,
      environment: 'indoorDry', application: 'power',
    }), /non-negative/);
  });

  it('throws for zero span', () => {
    assert.throws(() => configure({
      cableWeightLbFt: 5, spanFt: 0, totalCableCsaIn2: 10,
      environment: 'indoorDry', application: 'power',
    }), /positive/);
  });

  it('throws for negative CSA', () => {
    assert.throws(() => configure({
      cableWeightLbFt: 5, spanFt: 10, totalCableCsaIn2: -1,
      environment: 'indoorDry', application: 'power',
    }), /non-negative/);
  });

  it('throws for an unknown environment', () => {
    assert.throws(() => configure({
      cableWeightLbFt: 5, spanFt: 10, totalCableCsaIn2: 10,
      environment: 'space', application: 'power',
    }), /environment/i);
  });

  it('throws for an unknown application', () => {
    assert.throws(() => configure({
      cableWeightLbFt: 5, spanFt: 10, totalCableCsaIn2: 10,
      environment: 'indoorDry', application: 'magic',
    }), /application/i);
  });
});
