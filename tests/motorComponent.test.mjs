/**
 * Tests for the motor one-line component:
 *  - library schema validation (librarySchema.mjs)
 *  - motorStartCalc.mjs reading from motor component props
 */
import assert from 'assert';
import { validateLibraryPayload } from '../src/validation/librarySchema.mjs';
import { getStarterProfile } from '../analysis/motorStartCalc.mjs';

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
// Minimal valid motor component for schema tests
// ---------------------------------------------------------------------------
function makeMotorComp(overrides = {}) {
  return {
    type: 'motor',
    subtype: 'motor',
    label: 'Motor',
    icon: 'icons/components/Motor.svg',
    category: 'load',
    props: {
      tag: 'M-101',
      description: 'Cooling tower fan motor',
      manufacturer: 'Nidec',
      model: 'NEMA-B-100HP',
      rated_hp: 100,
      rated_voltage_kv: 0.48,
      phases: 3,
      synchronous_speed_rpm: 1800,
      design_class: 'B',
      code_letter: 'G',
      locked_rotor_kva_per_hp: 5.6,
      full_load_efficiency_pct: 95.0,
      full_load_pf: 0.90,
      service_factor: 1.15,
      starter_type: 'dol',
      vfd_current_limit_pu: 1.1,
      initial_voltage_pu: 0.3,
      ramp_time_s: 10,
      wye_delta_switch_time_s: 5,
      autotransformer_tap: 0.65,
      lr_current_pu: 6.0,
      thevenin_r: 0.02,
      thevenin_x: 0.08,
      inertia: 0.5,
      load_torque_curve: '0:0 100:100',
      commissioning_state: 'in_service',
      service_status: 'normal',
      notes: '',
      ...overrides,
    },
  };
}

function makePayload(motorProps = {}) {
  return {
    categories: ['load'],
    components: [makeMotorComp(motorProps)],
    icons: { motor: 'icons/components/Motor.svg' },
  };
}

// ---------------------------------------------------------------------------
describe('motor component — library schema validation', () => {
  it('valid motor component passes validation', () => {
    const result = validateLibraryPayload(makePayload());
    const errs = result.errors.filter(e => e.severity !== 'warning');
    assert.ok(result.valid, `Expected valid but got errors: ${JSON.stringify(errs)}`);
  });

  it('rejects missing rated_hp', () => {
    const result = validateLibraryPayload(makePayload({ rated_hp: undefined }));
    assert.ok(!result.valid);
    const err = result.errors.find(e => e.path.includes('rated_hp'));
    assert.ok(err, 'Expected rated_hp error');
  });

  it('rejects rated_hp of zero', () => {
    const result = validateLibraryPayload(makePayload({ rated_hp: 0 }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.path.includes('rated_hp')));
  });

  it('rejects negative rated_voltage_kv', () => {
    const result = validateLibraryPayload(makePayload({ rated_voltage_kv: -0.48 }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.path.includes('rated_voltage_kv')));
  });

  it('rejects full_load_pf > 1', () => {
    const result = validateLibraryPayload(makePayload({ full_load_pf: 1.1 }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.path.includes('full_load_pf')));
  });

  it('rejects full_load_pf of 0', () => {
    const result = validateLibraryPayload(makePayload({ full_load_pf: 0 }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.path.includes('full_load_pf')));
  });

  it('rejects full_load_efficiency_pct > 100', () => {
    const result = validateLibraryPayload(makePayload({ full_load_efficiency_pct: 101 }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.path.includes('full_load_efficiency_pct')));
  });

  it('rejects invalid NEMA design_class', () => {
    const result = validateLibraryPayload(makePayload({ design_class: 'Z' }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.path.includes('design_class')));
  });

  it('accepts all valid NEMA design classes A B C D', () => {
    for (const dc of ['A', 'B', 'C', 'D']) {
      const result = validateLibraryPayload(makePayload({ design_class: dc }));
      const errs = result.errors.filter(e => e.severity !== 'warning' && e.path.includes('design_class'));
      assert.strictEqual(errs.length, 0, `design_class ${dc} should be valid`);
    }
  });

  it('rejects unknown starter_type', () => {
    const result = validateLibraryPayload(makePayload({ starter_type: 'star_delta' }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.path.includes('starter_type')));
  });

  it('accepts all valid starter types', () => {
    const types = ['dol', 'vfd', 'soft_starter', 'wye_delta', 'autotransformer'];
    for (const t of types) {
      const result = validateLibraryPayload(makePayload({ starter_type: t }));
      const errs = result.errors.filter(e => e.severity !== 'warning' && e.path.includes('starter_type'));
      assert.strictEqual(errs.length, 0, `starter_type ${t} should be valid`);
    }
  });

  it('rejects invalid commissioning_state', () => {
    const result = validateLibraryPayload(makePayload({ commissioning_state: 'unknown' }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.path.includes('commissioning_state')));
  });

  it('accepts valid commissioning states', () => {
    for (const state of ['in_service', 'spare', 'decommissioned']) {
      const result = validateLibraryPayload(makePayload({ commissioning_state: state }));
      const errs = result.errors.filter(e => e.severity !== 'warning' && e.path.includes('commissioning_state'));
      assert.strictEqual(errs.length, 0, `commissioning_state ${state} should be valid`);
    }
  });

  it('motor validation is independent of mcc validation — mcc errors do not appear', () => {
    const result = validateLibraryPayload(makePayload());
    assert.ok(!result.errors.some(e => e.message.includes('mcc.')));
  });
});

// ---------------------------------------------------------------------------
describe('getStarterProfile — reads from motor component props', () => {
  it('reads starter_type from props object', () => {
    const comp = { props: { starter_type: 'vfd' } };
    const profile = getStarterProfile(comp);
    assert.strictEqual(profile.type, 'vfd');
  });

  it('reads vfd_current_limit_pu from props', () => {
    const comp = { props: { starter_type: 'vfd', vfd_current_limit_pu: 1.2 } };
    const profile = getStarterProfile(comp);
    assert.strictEqual(profile.vfdCurrentLimitPu, 1.2);
  });

  it('reads ramp_time_s from props', () => {
    const comp = { props: { starter_type: 'soft_starter', ramp_time_s: 15 } };
    const profile = getStarterProfile(comp);
    assert.strictEqual(profile.rampTimeSec, 15);
  });

  it('reads wye_delta_switch_time_s from props', () => {
    const comp = { props: { starter_type: 'wye_delta', wye_delta_switch_time_s: 8 } };
    const profile = getStarterProfile(comp);
    assert.strictEqual(profile.wyeDeltaSwitchTimeSec, 8);
  });

  it('reads autotransformer_tap from props', () => {
    const comp = { props: { starter_type: 'autotransformer', autotransformer_tap: 0.80 } };
    const profile = getStarterProfile(comp);
    assert.strictEqual(profile.autotransformerTap, 0.80);
  });

  it('defaults to dol when starter_type absent', () => {
    const comp = { props: {} };
    const profile = getStarterProfile(comp);
    assert.strictEqual(profile.type, 'dol');
  });

  it('full motor component props produce correct dol profile', () => {
    const comp = makeMotorComp();
    const profile = getStarterProfile(comp);
    assert.strictEqual(profile.type, 'dol');
    assert.strictEqual(profile.vfdCurrentLimitPu, 1.1);
    assert.strictEqual(profile.rampTimeSec, 10);
    assert.strictEqual(profile.wyeDeltaSwitchTimeSec, 5);
    assert.strictEqual(profile.autotransformerTap, 0.65);
  });
});

// ---------------------------------------------------------------------------
// Verify the motor component is detected as a motor by motorStartCalc.mjs
// by simulating the isMotor check logic from the module
// ---------------------------------------------------------------------------
describe('motor subtype detection for runMotorStart', () => {
  function isMotorComp(c) {
    const subtype = typeof c.subtype === 'string' ? c.subtype.toLowerCase() : '';
    const type    = typeof c.type    === 'string' ? c.type.toLowerCase()    : '';
    return subtype === 'motor_load' || type === 'motor_load'
      || subtype === 'motor' || type === 'motor' || !!c.motor;
  }

  it('motor subtype is detected as a motor component', () => {
    assert.ok(isMotorComp({ subtype: 'motor', type: 'motor' }));
  });

  it('motor_load subtype is still detected', () => {
    assert.ok(isMotorComp({ subtype: 'motor_load', type: 'motor_load' }));
  });

  it('bus subtype is NOT detected as motor', () => {
    assert.ok(!isMotorComp({ subtype: 'bus', type: 'bus' }));
  });

  it('full motor component object is detected', () => {
    assert.ok(isMotorComp(makeMotorComp()));
  });
});
