import assert from 'node:assert/strict';
import {
  applyTapRatioToOneLine,
  buildPermittedTapRatios,
  evaluateTransformerTapOptimization,
  normalizeTransformerTapConstraints
} from '../analysis/transformerTapOptimization.mjs';

function fixture() {
  return {
    activeSheet: 0,
    sheets: [{
      name: 'Tap Fixture',
      components: [
        { id: 'source', type: 'bus', subtype: 'Bus', busType: 'slack', baseKV: 13.8 },
        { id: 'load-bus', type: 'bus', subtype: 'Bus', busType: 'PQ', baseKV: 0.48 },
        {
          id: 'xfmr-1',
          label: 'XFMR-1',
          type: 'transformer',
          subtype: 'two_winding',
          props: {
            volts_secondary: 480,
            ltc: {
              enabled: true,
              min_tap_volts: 460,
              max_tap_volts: 500,
              step_percent: 0.625,
              setpoint_pu: 1
            }
          },
          connections: [
            { target: 'source', sourcePort: 0 },
            { target: 'load-bus', sourcePort: 1 }
          ]
        },
        { id: 'load-1', type: 'load', kw: 100, kvar: 30, connections: [{ target: 'load-bus' }] }
      ],
      connections: []
    }]
  };
}

const constraints = normalizeTransformerTapConstraints(fixture().sheets[0].components[2]);
assert.equal(constraints.eligible, true);
assert.equal(constraints.stepPercent, 0.625);
assert(Math.abs(constraints.minRatio - 460 / 480) < 1e-12);
assert(Math.abs(constraints.maxRatio - 500 / 480) < 1e-12);

const permitted = buildPermittedTapRatios(constraints);
assert(permitted.length > 1);
assert(permitted.every(ratio => ratio >= constraints.minRatio - 1e-9 && ratio <= constraints.maxRatio + 1e-9));
assert(permitted.every((ratio, index) => index === 0 || Math.abs(ratio - permitted[index - 1] - constraints.stepRatio) < 1e-8));

const original = fixture();
const applied = applyTapRatioToOneLine(original, 'xfmr-1', 1.0125);
assert.notEqual(applied, original);
assert.equal(original.sheets[0].components[2].props.tap_ratio, undefined);
assert.equal(applied.sheets[0].components[2].props.tap_ratio, 1.0125);
assert.equal(applied.sheets[0].components[2].tap_ratio, 1.0125);
assert.equal(applied.sheets[0].components[3].kw, 100);

const objectTapSource = fixture();
const objectTapTransformer = objectTapSource.sheets[0].components[2];
objectTapTransformer.tap_ratio = 1;
objectTapTransformer.props.tap = { ratio: 1, angle: 30, winding: 'primary' };
const objectTapApplied = applyTapRatioToOneLine(objectTapSource, 'xfmr-1', 1.01875);
assert.deepEqual(objectTapApplied.sheets[0].components[2].props.tap, {
  ratio: 1.01875,
  angle: 30,
  winding: 'primary'
});
assert.equal(objectTapApplied.sheets[0].components[2].tap_ratio, 1.01875);
assert.deepEqual(objectTapSource.sheets[0].components[2].props.tap, {
  ratio: 1,
  angle: 30,
  winding: 'primary'
}, 'Applying a recommendation must not mutate or flatten object-form tap metadata');

const calls = [];
const review = await evaluateTransformerTapOptimization(original, {
  baseMVA: 10,
  balanced: true,
  maxIterations: 30,
  runStudy: async snapshot => {
    const transformer = snapshot.sheets[0].components.find(component => component.id === 'xfmr-1');
    const ratio = transformer.props.tap_ratio || transformer.tap_ratio || 1;
    calls.push(ratio);
    return {
      converged: true,
      warnings: [],
      buses: [
        { id: 'source', Vm: 1 },
        { id: 'load-bus', Vm: ratio * 0.98 }
      ]
    };
  }
});

const transformerReview = review.transformers[0];
assert.equal(transformerReview.eligible, true);
assert.equal(transformerReview.controlledBusId, 'load-bus');
assert.equal(calls.length, permitted.length, 'Evaluate current case plus each other permitted step');
assert(transformerReview.cases.every(candidate => candidate.isCurrent || candidate.permitted));
assert(transformerReview.recommendedTapRatio !== null);
assert(transformerReview.cases.find(candidate => candidate.tapRatio === transformerReview.recommendedTapRatio)?.feasible);
assert.equal(original.sheets[0].components[2].props.tap_ratio, undefined, 'Evaluation must not mutate the source One-Line');

const disabledConstraints = normalizeTransformerTapConstraints({
  type: 'transformer',
  props: {
    volts_secondary: 480,
    ltc: { enabled: false },
    min_tap_volts: 460,
    max_tap_volts: 500,
    step_percent: 0.625
  }
});
assert.equal(disabledConstraints.eligible, false);
assert.equal(disabledConstraints.reason, 'ltc_not_enabled', 'An explicit disabled state must override inferred constraints');

const splitMetadataConstraints = normalizeTransformerTapConstraints({
  type: 'transformer',
  volts_secondary: 480,
  ltc: { enabled: true },
  props: {
    ltc: {
      min_tap_volts: 460,
      max_tap_volts: 500,
      step_percent: 0.625
    }
  }
});
assert.equal(splitMetadataConstraints.eligible, true, 'Direct and props LTC metadata should be merged');

const constrainedFixture = fixture();
constrainedFixture.sheets[0].components[2].props.ltc.min_voltage_pu = 0.99;
constrainedFixture.sheets[0].components[2].props.ltc.max_voltage_pu = 1.01;
const constrainedReview = await evaluateTransformerTapOptimization(constrainedFixture, {
  runStudy: async () => ({
    converged: true,
    buses: [
      { id: 'source', Vm: 1 },
      { id: 'load-bus', Vm: 0.98 }
    ]
  })
});
const constrainedTransformer = constrainedReview.transformers[0];
assert.equal(constrainedTransformer.minVoltagePu, 0.99);
assert.equal(constrainedTransformer.maxVoltagePu, 1.01);
assert.equal(constrainedTransformer.cases[0].feasible, false, 'Transformer-specific voltage limits must constrain feasibility');
assert.equal(constrainedTransformer.recommendedTapRatio, null);

const unresolvedFixture = fixture();
unresolvedFixture.sheets[0].components[2].props.ltc.controlled_bus_id = 'missing-bus';
let unresolvedStudyCalls = 0;
const unresolvedReview = await evaluateTransformerTapOptimization(unresolvedFixture, {
  runStudy: async () => {
    unresolvedStudyCalls += 1;
    return {
      converged: true,
      buses: [
        { id: 'source', Vm: 1 },
        { id: 'load-bus', Vm: 0.98 }
      ]
    };
  }
});
assert.equal(unresolvedReview.transformers[0].eligible, false);
assert.equal(unresolvedReview.transformers[0].reason, 'controlled_bus_not_found');
assert.equal(unresolvedStudyCalls, 0, 'An unresolved controlled bus must not fall back to a system-wide average');

const missingRange = normalizeTransformerTapConstraints({
  type: 'transformer',
  props: { ltc: { enabled: true, step_percent: 0.625 } }
});
assert.equal(missingRange.eligible, false);
assert.equal(missingRange.reason, 'missing_tap_range');

console.log('✓ transformer tap optimization constraints, what-if evaluation, and approval payloads');
