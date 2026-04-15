import assert from 'assert';
import { runValidation } from '../validation/rules.js';

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

describe('runValidation - basic', () => {
  it('returns empty array for empty component list', () => {
    const issues = runValidation([], {});
    assert.deepStrictEqual(issues, []);
  });

  it('returns empty array when no violations exist', () => {
    const components = [
      { id: 'bus-1', type: 'bus', connections: [{ target: 'bus-2' }] },
      { id: 'bus-2', type: 'bus', connections: [{ target: 'bus-1' }] }
    ];
    const issues = runValidation(components, {});
    assert.deepStrictEqual(issues, []);
  });
});

describe('runValidation - unconnected bus detection', () => {
  it('flags a bus with no inbound and no outbound connections', () => {
    const components = [
      { id: 'isolated-bus', type: 'bus', connections: [] }
    ];
    const issues = runValidation(components, {});
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].component, 'isolated-bus');
    assert.ok(issues[0].message.toLowerCase().includes('unconnected'));
  });

  it('does not flag a bus with at least one outbound connection', () => {
    const components = [
      { id: 'source-bus', type: 'bus', connections: [{ target: 'load-bus' }] },
      { id: 'load-bus', type: 'bus', connections: [] }
    ];
    const issues = runValidation(components, {});
    // load-bus has inbound from source-bus, so not unconnected; source-bus has outbound
    assert.deepStrictEqual(issues, []);
  });

  it('does not flag a bus missing connections array (treated as empty)', () => {
    const components = [
      { id: 'ref-bus', type: 'bus' },
      { id: 'target-bus', type: 'bus', connections: [{ target: 'ref-bus' }] }
    ];
    // ref-bus has inbound from target-bus, so not flagged
    const issues = runValidation(components, {});
    assert.deepStrictEqual(issues, []);
  });

  it('does not flag non-bus components that have no connections', () => {
    const components = [
      { id: 'breaker-1', type: 'breaker', connections: [] }
    ];
    const issues = runValidation(components, {});
    assert.deepStrictEqual(issues, []);
  });
});

describe('runValidation - transformer overload', () => {
  it('flags a transformer where load exceeds rating', () => {
    const components = [
      { id: 'xfmr-1', type: 'transformer', load_kva: 1500, kva: 1000 }
    ];
    const issues = runValidation(components, {});
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].component, 'xfmr-1');
    assert.ok(issues[0].message.includes('overload'));
    assert.ok(issues[0].message.includes('1500kVA'));
    assert.ok(issues[0].message.includes('1000kVA'));
  });

  it('does not flag a transformer where load equals rating', () => {
    const components = [
      { id: 'xfmr-2', type: 'transformer', load_kva: 1000, kva: 1000 }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });

  it('does not flag a transformer where load is below rating', () => {
    const components = [
      { id: 'xfmr-3', type: 'transformer', load_kva: 750, kva: 1000 }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });

  it('does not flag when rating is 0 (unrated)', () => {
    const components = [
      { id: 'xfmr-4', type: 'transformer', load_kva: 500, kva: 0 }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });

  it('uses load/rating field name fallbacks', () => {
    const components = [
      { id: 'xfmr-5', type: 'transformer', load: 2000, rating: 1500 }
    ];
    const issues = runValidation(components, {});
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].component, 'xfmr-5');
  });

  it('does not flag when neither load nor rating is defined', () => {
    const components = [
      { id: 'xfmr-6', type: 'transformer' }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });
});

describe('runValidation - breaker interrupt rating', () => {
  it('flags a breaker where fault current exceeds interrupt rating', () => {
    const components = [
      { id: 'brk-1', type: 'breaker', fault_current: 50000, interrupt_rating: 42000 }
    ];
    const issues = runValidation(components, {});
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].component, 'brk-1');
    assert.ok(issues[0].message.includes('interrupt'));
    assert.ok(issues[0].message.includes('50000A'));
    assert.ok(issues[0].message.includes('42000A'));
  });

  it('does not flag a breaker where fault current equals interrupt rating', () => {
    const components = [
      { id: 'brk-2', type: 'breaker', fault_current: 42000, interrupt_rating: 42000 }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });

  it('does not flag a breaker where fault current is below interrupt rating', () => {
    const components = [
      { id: 'brk-3', type: 'breaker', fault_current: 30000, interrupt_rating: 42000 }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });

  it('does not flag when interrupt_rating is 0 (unrated)', () => {
    const components = [
      { id: 'brk-4', type: 'breaker', fault_current: 99999, interrupt_rating: 0 }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });

  it('does not flag when fault_current is missing', () => {
    const components = [
      { id: 'brk-5', type: 'breaker', interrupt_rating: 42000 }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });
});

describe('runValidation - meter CT/PT completeness', () => {
  it('flags a meter missing CT/PT ratios when metering studies are enabled', () => {
    const components = [
      {
        id: 'meter-1',
        type: 'meter',
        props: {
          supports_thd: true,
          supports_flicker: false,
          supports_waveform_capture: false,
          ct_ratio: '',
          pt_ratio: ''
        }
      }
    ];
    const issues = runValidation(components, {});
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].component, 'meter-1');
    assert.ok(issues[0].message.includes('CT ratio'));
    assert.ok(issues[0].message.includes('PT ratio'));
  });

  it('does not flag a meter with both CT/PT ratios provided', () => {
    const components = [
      {
        id: 'meter-2',
        type: 'meter',
        props: {
          supports_thd: true,
          ct_ratio: '1200:5',
          pt_ratio: '4160:120'
        }
      }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });

  it('does not flag a meter when metering studies are disabled', () => {
    const components = [
      {
        id: 'meter-3',
        type: 'meter',
        props: {
          supports_thd: false,
          supports_flicker: false,
          supports_waveform_capture: false,
          ct_ratio: '',
          pt_ratio: ''
        }
      }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });
});

describe('runValidation - PT/VT completeness and compatibility', () => {
  it('flags PT/VT with missing required fields', () => {
    const components = [
      {
        id: 'pt-1',
        subtype: 'pt_vt',
        type: 'vt',
        props: {
          tag: '',
          primary_voltage: 0,
          secondary_voltage: '',
          accuracy_class: '',
          burden_va: '',
          connection_type: '',
          fuse_protection: ''
        }
      }
    ];
    const issues = runValidation(components, {});
    assert.ok(issues.some(issue => issue.component === 'pt-1' && issue.message.includes('PT/VT missing/invalid')));
  });

  it('flags PT/VT with incompatible linked consumer voltage base', () => {
    const components = [
      {
        id: 'meter-pt',
        type: 'meter',
        props: { voltage: 480 }
      },
      {
        id: 'pt-2',
        subtype: 'pt_vt',
        type: 'vt',
        props: {
          tag: 'PT-2',
          primary_voltage: 12470,
          secondary_voltage: 120,
          accuracy_class: '0.3',
          burden_va: 50,
          connection_type: 'wye-grounded',
          fuse_protection: 'yes',
          meter_id: 'meter-pt'
        }
      }
    ];
    const issues = runValidation(components, {});
    assert.ok(issues.some(issue => issue.component === 'pt-2' && issue.message.includes('incompatible')));
  });

  it('does not flag PT/VT when linked consumer voltage base is compatible', () => {
    const components = [
      {
        id: 'relay-1',
        type: 'relay',
        props: { rated_voltage_kv: 12.47 }
      },
      {
        id: 'pt-3',
        subtype: 'pt_vt',
        type: 'vt',
        props: {
          tag: 'PT-3',
          primary_voltage: 12470,
          secondary_voltage: 120,
          accuracy_class: '0.3',
          burden_va: 50,
          connection_type: 'wye-grounded',
          fuse_protection: 'yes',
          relay_id: 'relay-1'
        }
      }
    ];
    const issues = runValidation(components, {});
    const ptIssues = issues.filter(issue => issue.component === 'pt-3');
    assert.deepStrictEqual(ptIssues, []);
  });
});



describe('runValidation - CT required attributes', () => {
  it('flags a CT with missing required fields', () => {
    const components = [
      {
        id: 'ct-1',
        subtype: 'ct',
        type: 'ct',
        props: {
          tag: '',
          ratio_primary: 0,
          ratio_secondary: 0,
          accuracy_class: '',
          burden_va: 0,
          knee_point_v: 0,
          polarity: '',
          location_context: ''
        }
      }
    ];
    const issues = runValidation(components, {});
    const ctIssue = issues.find(issue => issue.component === 'ct-1' && issue.message.includes('Current transformer missing/invalid attributes'));
    assert.ok(ctIssue);
    assert.ok(ctIssue.message.includes('tag'));
    assert.ok(ctIssue.message.includes('ratio_primary'));
    assert.ok(ctIssue.message.includes('ratio_secondary'));
    assert.ok(ctIssue.message.includes('accuracy_class'));
    assert.ok(ctIssue.message.includes('burden_va'));
    assert.ok(ctIssue.message.includes('knee_point_v'));
    assert.ok(ctIssue.message.includes('polarity'));
    assert.ok(ctIssue.message.includes('location_context'));
  });

  it('does not flag a CT with all required fields present', () => {
    const components = [
      {
        id: 'ct-2',
        subtype: 'ct',
        type: 'ct',
        props: {
          tag: 'CT-2',
          ratio_primary: 600,
          ratio_secondary: 5,
          accuracy_class: '0.3',
          burden_va: 15,
          knee_point_v: 400,
          polarity: 'H1-X1',
          location_context: 'protection'
        }
      }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });
});
describe('runValidation - battery required attributes', () => {
  it('flags a battery when required fields are missing', () => {
    const components = [
      {
        id: 'battery-1',
        type: 'battery',
        subtype: 'battery',
        props: {
          tag: '',
          description: '',
          manufacturer: '',
          model: '',
          nominal_voltage_vdc: 0,
          cell_chemistry: '',
          cell_count: 0,
          capacity_ah: '',
          internal_resistance_ohm: -1,
          initial_soc_pct: 120,
          min_soc_pct: -5,
          max_charge_current_a: null,
          max_discharge_current_a: ''
        }
      }
    ];
    const issues = runValidation(components, {});
    const batteryIssue = issues.find(issue => issue.component === 'battery-1');
    assert.ok(batteryIssue);
    assert.ok(batteryIssue.message.includes('tag'));
    assert.ok(batteryIssue.message.includes('description'));
    assert.ok(batteryIssue.message.includes('manufacturer'));
    assert.ok(batteryIssue.message.includes('model'));
    assert.ok(batteryIssue.message.includes('nominal_voltage_vdc'));
    assert.ok(batteryIssue.message.includes('cell_chemistry'));
    assert.ok(batteryIssue.message.includes('cell_count'));
    assert.ok(batteryIssue.message.includes('capacity_ah'));
    assert.ok(batteryIssue.message.includes('internal_resistance_ohm'));
    assert.ok(batteryIssue.message.includes('initial_soc_pct'));
    assert.ok(batteryIssue.message.includes('min_soc_pct'));
    assert.ok(batteryIssue.message.includes('max_charge_current_a'));
    assert.ok(batteryIssue.message.includes('max_discharge_current_a'));
  });

  it('does not flag a battery with all required fields present', () => {
    const components = [
      {
        id: 'battery-2',
        type: 'battery',
        subtype: 'battery',
        props: {
          tag: 'BAT-01',
          description: 'UPS battery bank',
          manufacturer: 'Test Manufacturer',
          model: 'LFP-1000',
          nominal_voltage_vdc: 480,
          cell_chemistry: 'li_ion',
          cell_count: 144,
          capacity_ah: 200,
          internal_resistance_ohm: 0.05,
          initial_soc_pct: 75,
          min_soc_pct: 20,
          max_charge_current_a: 100,
          max_discharge_current_a: 120
        }
      }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });
});

describe('runValidation - ups required attributes and consistency checks', () => {
  it('flags a UPS when required fields and runtime consistency checks fail', () => {
    const components = [
      {
        id: 'ups-1',
        type: 'ups',
        subtype: 'ups',
        props: {
          tag: '',
          manufacturer: '',
          model: '',
          topology: '',
          rated_kva: 0,
          input_voltage_kv: 0,
          output_voltage_kv: '',
          efficiency_pct: 120,
          battery_runtime_min: 10,
          battery_dc_v: 0,
          static_bypass_supported: false,
          operating_mode: 'bypass',
          mode_normal_enabled: false,
          mode_battery_enabled: true,
          mode_bypass_enabled: false,
          runtime_normal_min: -1,
          runtime_battery_min: 5,
          runtime_bypass_min: -2
        }
      }
    ];
    const issues = runValidation(components, {});
    const requiredIssue = issues.find(issue => issue.component === 'ups-1' && issue.message.includes('UPS missing/invalid attributes'));
    const consistencyIssue = issues.find(issue => issue.component === 'ups-1' && issue.message.includes('UPS rating/runtime consistency checks failed'));
    assert.ok(requiredIssue);
    assert.ok(requiredIssue.message.includes('tag'));
    assert.ok(requiredIssue.message.includes('manufacturer'));
    assert.ok(requiredIssue.message.includes('model'));
    assert.ok(requiredIssue.message.includes('topology'));
    assert.ok(requiredIssue.message.includes('rated_kva'));
    assert.ok(requiredIssue.message.includes('input_voltage_kv'));
    assert.ok(requiredIssue.message.includes('output_voltage_kv'));
    assert.ok(requiredIssue.message.includes('efficiency_pct'));
    assert.ok(requiredIssue.message.includes('battery_dc_v'));
    assert.ok(requiredIssue.message.includes('runtime_normal_min'));
    assert.ok(requiredIssue.message.includes('runtime_bypass_min'));
    assert.ok(consistencyIssue);
    assert.ok(consistencyIssue.message.includes('runtime_battery_min must match battery_runtime_min'));
    assert.ok(consistencyIssue.message.includes('operating_mode=bypass requires static_bypass_supported=true'));
  });

  it('does not flag a UPS with complete and consistent fields', () => {
    const components = [
      {
        id: 'ups-2',
        type: 'ups',
        subtype: 'ups',
        props: {
          tag: 'UPS-02',
          manufacturer: 'ExamplePower',
          model: 'DP-500',
          topology: 'double_conversion',
          rated_kva: 500,
          input_voltage_kv: 0.48,
          output_voltage_kv: 0.48,
          efficiency_pct: 96,
          battery_runtime_min: 15,
          battery_dc_v: 480,
          static_bypass_supported: true,
          operating_mode: 'normal',
          mode_normal_enabled: true,
          mode_battery_enabled: true,
          mode_bypass_enabled: true,
          runtime_normal_min: 0,
          runtime_battery_min: 15,
          runtime_bypass_min: 60
        }
      }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });
});

describe('runValidation - dc_bus required attributes', () => {
  it('flags a dc_bus when required fields are missing', () => {
    const components = [
      {
        id: 'dc-bus-ref',
        type: 'bus',
        connections: [{ target: 'dc-bus-1' }]
      },
      {
        id: 'dc-bus-1',
        type: 'bus',
        subtype: 'dc_bus',
        connections: [{ target: 'dc-bus-ref' }],
        props: {
          nominal_voltage_vdc: 0,
          grounding_scheme: '',
          max_continuous_current_a: '',
          short_circuit_rating_ka: null
        }
      }
    ];
    const issues = runValidation(components, {});
    const dcIssue = issues.find(issue => issue.component === 'dc-bus-1');
    assert.ok(dcIssue);
    assert.ok(dcIssue.message.includes('nominal_voltage_vdc'));
    assert.ok(dcIssue.message.includes('grounding_scheme'));
    assert.ok(dcIssue.message.includes('max_continuous_current_a'));
    assert.ok(dcIssue.message.includes('short_circuit_rating_ka'));
  });

  it('does not flag a dc_bus with all required fields present', () => {
    const components = [
      {
        id: 'dc-bus-ref-2',
        type: 'bus',
        connections: [{ target: 'dc-bus-2' }]
      },
      {
        id: 'dc-bus-2',
        type: 'bus',
        subtype: 'dc_bus',
        connections: [{ target: 'dc-bus-ref-2' }],
        props: {
          nominal_voltage_vdc: 750,
          grounding_scheme: 'resistance_grounded',
          max_continuous_current_a: 1600,
          short_circuit_rating_ka: 35
        }
      }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });
});

describe('runValidation - panel required attributes', () => {
  it('flags a panel when required fields are missing', () => {
    const components = [
      {
        id: 'panel-ref',
        type: 'bus',
        connections: [{ target: 'panel-1' }]
      },
      {
        id: 'panel-1',
        type: 'panel',
        subtype: 'panel',
        connections: [{ target: 'panel-ref' }],
        props: {
          tag: '',
          description: '',
          manufacturer: '',
          model: '',
          rated_voltage_kv: 0,
          phases: 0,
          bus_rating_a: '',
          main_device_type: '',
          main_interrupting_ka: null,
          grounding_type: '',
          service_type: ''
        }
      }
    ];
    const issues = runValidation(components, {});
    const panelIssue = issues.find(issue => issue.component === 'panel-1');
    assert.ok(panelIssue);
    assert.ok(panelIssue.message.includes('tag'));
    assert.ok(panelIssue.message.includes('description'));
    assert.ok(panelIssue.message.includes('manufacturer'));
    assert.ok(panelIssue.message.includes('model'));
    assert.ok(panelIssue.message.includes('rated_voltage_kv'));
    assert.ok(panelIssue.message.includes('phases'));
    assert.ok(panelIssue.message.includes('bus_rating_a'));
    assert.ok(panelIssue.message.includes('main_device_type'));
    assert.ok(panelIssue.message.includes('main_interrupting_ka'));
    assert.ok(panelIssue.message.includes('grounding_type'));
    assert.ok(panelIssue.message.includes('service_type'));
  });

  it('does not flag a panel with all required fields present', () => {
    const components = [
      {
        id: 'panel-ref-2',
        type: 'bus',
        connections: [{ target: 'panel-2' }]
      },
      {
        id: 'panel-2',
        type: 'panel',
        subtype: 'panel',
        connections: [{ target: 'panel-ref-2' }],
        props: {
          tag: 'PNL-1A',
          description: 'Main lighting panel',
          manufacturer: 'Square D',
          model: 'NQOD',
          rated_voltage_kv: 0.48,
          phases: 3,
          bus_rating_a: 1200,
          main_device_type: 'mcb',
          main_interrupting_ka: 35,
          grounding_type: 'solidly_grounded_wye',
          service_type: 'distribution'
        }
      }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });
});

describe('runValidation - switchboard required attributes', () => {
  it('flags a switchboard when required fields are missing', () => {
    const components = [
      {
        id: 'switchboard-ref',
        type: 'bus',
        connections: [{ target: 'swbd-1' }]
      },
      {
        id: 'swbd-1',
        type: 'switchboard',
        subtype: 'switchboard',
        connections: [{ target: 'switchboard-ref' }],
        props: {
          tag: '',
          description: '',
          manufacturer: '',
          model: '',
          rated_voltage_kv: 0,
          phases: 0,
          bus_rating_a: '',
          withstand_1s_ka: '',
          interrupting_ka: null,
          arc_resistant_type: '',
          maintenance_mode_supported: 'yes'
        }
      }
    ];
    const issues = runValidation(components, {});
    const switchboardIssue = issues.find(issue => issue.component === 'swbd-1');
    assert.ok(switchboardIssue);
    assert.ok(switchboardIssue.message.includes('tag'));
    assert.ok(switchboardIssue.message.includes('description'));
    assert.ok(switchboardIssue.message.includes('manufacturer'));
    assert.ok(switchboardIssue.message.includes('model'));
    assert.ok(switchboardIssue.message.includes('rated_voltage_kv'));
    assert.ok(switchboardIssue.message.includes('phases'));
    assert.ok(switchboardIssue.message.includes('bus_rating_a'));
    assert.ok(switchboardIssue.message.includes('withstand_1s_ka'));
    assert.ok(switchboardIssue.message.includes('interrupting_ka'));
    assert.ok(switchboardIssue.message.includes('arc_resistant_type'));
    assert.ok(switchboardIssue.message.includes('maintenance_mode_supported'));
  });

  it('does not flag a switchboard with all required fields present', () => {
    const components = [
      {
        id: 'switchboard-ref-2',
        type: 'bus',
        connections: [{ target: 'swbd-2' }]
      },
      {
        id: 'swbd-2',
        type: 'switchboard',
        subtype: 'switchboard',
        connections: [{ target: 'switchboard-ref-2' }],
        props: {
          tag: 'SWBD-MAIN',
          description: 'Main LV switchboard',
          manufacturer: 'Eaton',
          model: 'Pow-R-Line',
          rated_voltage_kv: 0.48,
          phases: 3,
          bus_rating_a: 4000,
          withstand_1s_ka: 65,
          interrupting_ka: 65,
          arc_resistant_type: 'type_2b',
          maintenance_mode_supported: true
        }
      }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });
});


describe('runValidation - mcc required attributes', () => {
  it('flags an mcc when required fields are missing', () => {
    const components = [
      {
        id: 'mcc-ref',
        type: 'bus',
        connections: [{ target: 'mcc-1' }]
      },
      {
        id: 'mcc-1',
        type: 'panel',
        subtype: 'mcc',
        connections: [{ target: 'mcc-ref' }],
        props: {
          tag: '',
          description: '',
          manufacturer: '',
          model: '',
          rated_voltage_kv: 0,
          bus_rating_a: 0,
          main_device_type: '',
          sccr_ka: null,
          bucket_count: '',
          spare_bucket_count: -1,
          form_type: ''
        }
      }
    ];
    const issues = runValidation(components, {});
    const mccIssue = issues.find(issue => issue.component === 'mcc-1' && issue.message.startsWith('MCC missing required attributes'));
    assert.ok(mccIssue);
    assert.ok(mccIssue.message.includes('tag'));
    assert.ok(mccIssue.message.includes('description'));
    assert.ok(mccIssue.message.includes('manufacturer'));
    assert.ok(mccIssue.message.includes('model'));
    assert.ok(mccIssue.message.includes('rated_voltage_kv'));
    assert.ok(mccIssue.message.includes('bus_rating_a'));
    assert.ok(mccIssue.message.includes('main_device_type'));
    assert.ok(mccIssue.message.includes('sccr_ka'));
    assert.ok(mccIssue.message.includes('bucket_count'));
    assert.ok(mccIssue.message.includes('spare_bucket_count'));
    assert.ok(mccIssue.message.includes('form_type'));
  });

  it('does not flag an mcc with all required fields present', () => {
    const components = [
      {
        id: 'mcc-ref-2',
        type: 'bus',
        connections: [{ target: 'mcc-2' }]
      },
      {
        id: 'mcc-2',
        type: 'panel',
        subtype: 'mcc',
        connections: [{ target: 'mcc-ref-2' }],
        props: {
          tag: 'MCC-01',
          description: '480 V Process MCC',
          manufacturer: 'Rockwell',
          model: 'CENTERLINE 2500',
          rated_voltage_kv: 0.48,
          bus_rating_a: 1600,
          main_device_type: 'mccb',
          sccr_ka: 65,
          bucket_count: 12,
          spare_bucket_count: 2,
          form_type: 'form_2b'
        }
      }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });
});

describe('runValidation - cable required attributes', () => {
  it('flags a cable when required fields are missing', () => {
    const components = [
      {
        id: 'cable-1',
        type: 'cable',
        subtype: 'cable',
        props: {
          tag: '',
          description: '',
          manufacturer: '',
          model: '',
          length_ft: 0,
          material: '',
          insulation_type: '',
          temp_rating_c: null,
          size_awg_kcmil: '',
          parallel_sets: 0,
          r_ohm_per_kft: -1,
          x_ohm_per_kft: NaN
        }
      }
    ];
    const issues = runValidation(components, {});
    const cableIssue = issues.find(issue => issue.component === 'cable-1');
    assert.ok(cableIssue);
    assert.ok(cableIssue.message.includes('tag'));
    assert.ok(cableIssue.message.includes('description'));
    assert.ok(cableIssue.message.includes('manufacturer'));
    assert.ok(cableIssue.message.includes('model'));
    assert.ok(cableIssue.message.includes('length_ft'));
    assert.ok(cableIssue.message.includes('material'));
    assert.ok(cableIssue.message.includes('insulation_type'));
    assert.ok(cableIssue.message.includes('temp_rating_c'));
    assert.ok(cableIssue.message.includes('size_awg_kcmil'));
    assert.ok(cableIssue.message.includes('parallel_sets'));
    assert.ok(cableIssue.message.includes('r_ohm_per_kft'));
    assert.ok(cableIssue.message.includes('x_ohm_per_kft'));
  });

  it('does not flag a cable with all required fields present', () => {
    const components = [
      {
        id: 'cable-2',
        type: 'cable',
        subtype: 'cable',
        props: {
          tag: 'CBL-MDB-1',
          description: 'Feeder cable to MCC-1',
          manufacturer: 'Prysmian',
          model: 'XHHW-2',
          length_ft: 420,
          material: 'copper',
          insulation_type: 'xlpe',
          temp_rating_c: 90,
          size_awg_kcmil: '500 kcmil',
          parallel_sets: 2,
          r_ohm_per_kft: 0.0216,
          x_ohm_per_kft: 0.015
        }
      }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });
});

describe('runValidation - busway required attributes', () => {
  it('flags a busway when required fields are missing', () => {
    const components = [
      {
        id: 'busway-1',
        type: 'busway',
        subtype: 'busway',
        props: {
          length_ft: 0,
          material: '',
          insulation_type: '',
          enclosure_rating: '',
          busway_type: 'invalid',
          ampacity_a: 0,
          r_ohm_per_kft: 0,
          x_ohm_per_kft: -1,
          short_circuit_rating_ka: null
        }
      }
    ];
    const issues = runValidation(components, {});
    const buswayIssue = issues.find(issue => issue.component === 'busway-1');
    assert.ok(buswayIssue);
    assert.ok(buswayIssue.message.includes('length_ft'));
    assert.ok(buswayIssue.message.includes('material'));
    assert.ok(buswayIssue.message.includes('insulation_type'));
    assert.ok(buswayIssue.message.includes('enclosure_rating'));
    assert.ok(buswayIssue.message.includes('busway_type'));
    assert.ok(buswayIssue.message.includes('ampacity_a'));
    assert.ok(buswayIssue.message.includes('r_ohm_per_kft'));
    assert.ok(buswayIssue.message.includes('x_ohm_per_kft'));
    assert.ok(buswayIssue.message.includes('short_circuit_rating_ka'));
  });

  it('does not flag a busway with all required fields present', () => {
    const components = [
      {
        id: 'busway-2',
        type: 'busway',
        subtype: 'busway',
        props: {
          length_ft: 240,
          material: 'aluminum',
          insulation_type: 'epoxy',
          enclosure_rating: 'NEMA 1',
          busway_type: 'feeder',
          ampacity_a: 1600,
          r_ohm_per_kft: 0.015,
          x_ohm_per_kft: 0.012,
          short_circuit_rating_ka: 65
        }
      }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });
});



describe('runValidation - relay_87 required attributes', () => {
  it('flags a relay_87 when required fields are missing', () => {
    const components = [
      {
        id: 'relay-87-1',
        type: 'relay',
        subtype: 'relay_87',
        props: {
          tag: '',
          description: '',
          manufacturer: '',
          model: '',
          protected_zone_type: 'line',
          pickup_pu: 0,
          slope1_pct: '',
          slope2_pct: null,
          breakpoint_pu: -1,
          inrush_blocking_enabled: 'yes',
          second_harmonic_pct: -5
        }
      }
    ];
    const issues = runValidation(components, {});
    const relayIssue = issues.find(issue => issue.component === 'relay-87-1');
    assert.ok(relayIssue);
    assert.ok(relayIssue.message.includes('protected_zone_type'));
    assert.ok(relayIssue.message.includes('pickup_pu'));
    assert.ok(relayIssue.message.includes('slope1_pct'));
    assert.ok(relayIssue.message.includes('slope2_pct'));
    assert.ok(relayIssue.message.includes('breakpoint_pu'));
    assert.ok(relayIssue.message.includes('inrush_blocking_enabled'));
    assert.ok(relayIssue.message.includes('second_harmonic_pct'));
  });

  it('does not flag a relay_87 with all required fields present', () => {
    const components = [
      {
        id: 'relay-87-2',
        type: 'relay',
        subtype: 'relay_87',
        props: {
          tag: '87R-2',
          description: 'Transformer differential relay',
          manufacturer: 'SEL',
          model: '487E',
          protected_zone_type: 'transformer',
          pickup_pu: 0.35,
          slope1_pct: 25,
          slope2_pct: 45,
          breakpoint_pu: 2.0,
          inrush_blocking_enabled: true,
          second_harmonic_pct: 15
        }
      }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });
});

describe('runValidation - generator required attributes', () => {
  it('flags a generator when required fields are missing', () => {
    const components = [
      {
        id: 'gen-1',
        type: 'generator',
        subtype: 'synchronous',
        props: {
          tag: '',
          description: '',
          manufacturer: '',
          model: '',
          rated_mva: 0,
          rated_kv: 0,
          xdpp_pu: 0,
          xdp_pu: '',
          xd_pu: -1,
          h_constant_s: 0,
          governor_mode: '',
          avr_mode: '',
          min_kw: -5,
          max_kw: 0,
          ramp_kw_per_min: 0
        }
      }
    ];
    const issues = runValidation(components, {});
    const generatorIssue = issues.find(issue => issue.component === 'gen-1');
    assert.ok(generatorIssue);
    assert.ok(generatorIssue.message.includes('tag'));
    assert.ok(generatorIssue.message.includes('description'));
    assert.ok(generatorIssue.message.includes('manufacturer'));
    assert.ok(generatorIssue.message.includes('model'));
    assert.ok(generatorIssue.message.includes('rated_mva'));
    assert.ok(generatorIssue.message.includes('rated_kv'));
    assert.ok(generatorIssue.message.includes('xdpp_pu'));
    assert.ok(generatorIssue.message.includes('xdp_pu'));
    assert.ok(generatorIssue.message.includes('xd_pu'));
    assert.ok(generatorIssue.message.includes('h_constant_s'));
    assert.ok(generatorIssue.message.includes('governor_mode'));
    assert.ok(generatorIssue.message.includes('avr_mode'));
    assert.ok(generatorIssue.message.includes('min_kw'));
    assert.ok(generatorIssue.message.includes('max_kw'));
    assert.ok(generatorIssue.message.includes('ramp_kw_per_min'));
  });

  it('does not flag a generator with all required fields present', () => {
    const components = [
      {
        id: 'gen-2',
        type: 'generator',
        subtype: 'asynchronous',
        props: {
          tag: 'GEN-2',
          description: 'Standby generator',
          manufacturer: 'Generac',
          model: 'SG500',
          rated_mva: 0.625,
          rated_kv: 0.48,
          xdpp_pu: 0.25,
          xdp_pu: 0.35,
          xd_pu: 1.9,
          h_constant_s: 4.2,
          governor_mode: 'droop',
          avr_mode: 'automatic',
          min_kw: 100,
          max_kw: 500,
          ramp_kw_per_min: 75
        }
      }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });
});

describe('runValidation - capacitor/reactor tuning attributes', () => {
  it('flags capacitor/reactor components when required tuning metadata is missing', () => {
    const components = [
      {
        id: 'cap-1',
        type: 'shunt_capacitor_bank',
        subtype: 'shunt_capacitor_bank',
        props: {
          tag: '',
          description: '',
          manufacturer: '',
          model: '',
          rated_kvar: 0,
          rated_kv: '',
          steps: -1,
          detuned: true,
          tuning_hz: '',
          reactor_pct: -5,
          switching_transient_class: ''
        }
      }
    ];
    const issues = runValidation(components, {});
    const capIssue = issues.find(issue => issue.component === 'cap-1');
    assert.ok(capIssue);
    assert.ok(capIssue.message.includes('tag'));
    assert.ok(capIssue.message.includes('description'));
    assert.ok(capIssue.message.includes('manufacturer'));
    assert.ok(capIssue.message.includes('model'));
    assert.ok(capIssue.message.includes('rated_kvar'));
    assert.ok(capIssue.message.includes('rated_kv'));
    assert.ok(capIssue.message.includes('steps'));
    assert.ok(capIssue.message.includes('tuning_hz'));
    assert.ok(capIssue.message.includes('reactor_pct'));
    assert.ok(capIssue.message.includes('switching_transient_class'));
  });

  it('does not flag non-detuned capacitor/reactor entries when optional tuning values are omitted', () => {
    const components = [
      {
        id: 'reactor-2',
        type: 'reactor',
        subtype: 'reactor',
        props: {
          tag: 'R-201',
          description: 'Detuning reactor block',
          manufacturer: 'Eaton',
          model: 'HRC-7',
          rated_kvar: 1200,
          rated_kv: 4.16,
          steps: 6,
          detuned: false,
          tuning_hz: '',
          reactor_pct: '',
          switching_transient_class: 'R1'
        }
      }
    ];
    assert.deepStrictEqual(runValidation(components, {}), []);
  });
});

describe('runValidation - TCC duty violations', () => {
  it('passes through duty violation messages from studies', () => {
    const studies = {
      duty: {
        'comp-A': ['Duty violation at 0.5s', 'Coordination gap detected'],
        'comp-B': ['Upstream device slower than downstream']
      }
    };
    const issues = runValidation([], studies);
    assert.strictEqual(issues.length, 3);
    const compAIssues = issues.filter(i => i.component === 'comp-A');
    assert.strictEqual(compAIssues.length, 2);
    const compBIssues = issues.filter(i => i.component === 'comp-B');
    assert.strictEqual(compBIssues.length, 1);
    assert.strictEqual(compBIssues[0].message, 'Upstream device slower than downstream');
  });

  it('handles missing studies.duty gracefully', () => {
    const issues = runValidation([], {});
    assert.deepStrictEqual(issues, []);
  });

  it('handles studies object being undefined', () => {
    const issues = runValidation([]);
    assert.deepStrictEqual(issues, []);
  });
});

describe('runValidation - multiple simultaneous violations', () => {
  it('reports all violations across mixed component types', () => {
    const components = [
      { id: 'isolated', type: 'bus', connections: [] },
      { id: 'xfmr-ov', type: 'transformer', load_kva: 2000, kva: 1500 },
      { id: 'brk-ov', type: 'breaker', fault_current: 60000, interrupt_rating: 42000 }
    ];
    const studies = { duty: { 'brk-ov': ['TCC coordination issue'] } };
    const issues = runValidation(components, studies);
    assert.strictEqual(issues.length, 4);
    const ids = issues.map(i => i.component);
    assert.ok(ids.includes('isolated'));
    assert.ok(ids.includes('xfmr-ov'));
    const brkIssues = issues.filter(i => i.component === 'brk-ov');
    assert.strictEqual(brkIssues.length, 2); // interrupt + TCC
  });
});
