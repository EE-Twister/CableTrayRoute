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
