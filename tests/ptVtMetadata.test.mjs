import assert from 'assert';
import { resolvePtVtForComponent } from '../analysis/ptVtMetadata.mjs';

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

describe('ptVtMetadata', () => {
  it('resolves PT/VT by explicit id and returns scaling ratio', () => {
    const pt = {
      id: 'pt-1',
      subtype: 'pt_vt',
      props: {
        tag: 'PT-1',
        primary_voltage: 12470,
        secondary_voltage: 120,
        accuracy_class: '0.3',
        burden_va: 50,
        connection_type: 'wye-grounded',
        fuse_protection: 'yes'
      }
    };
    const meter = {
      id: 'meter-1',
      type: 'meter',
      props: { pt_vt_id: 'pt-1', rated_voltage_kv: 12.47 }
    };
    const resolved = resolvePtVtForComponent(meter, [pt, meter]);
    assert.ok(resolved);
    assert.strictEqual(resolved.tag, 'PT-1');
    assert.ok(resolved.ratio);
    assert.strictEqual(Number(resolved.ratio.ratio.toFixed(6)), Number((12470 / 120).toFixed(6)));
    assert.strictEqual(resolved.voltage_base?.compatible, true);
  });

  it('resolves PT/VT by reverse link and reports incompatibility', () => {
    const relay = { id: 'relay-1', type: 'relay', props: { voltage: 480 } };
    const pt = {
      id: 'pt-2',
      subtype: 'pt_vt',
      props: {
        tag: 'PT-2',
        primary_voltage: 12470,
        secondary_voltage: 120,
        accuracy_class: '0.3',
        burden_va: 50,
        connection_type: 'wye-grounded',
        fuse_protection: 'yes',
        relay_id: 'relay-1'
      }
    };
    const resolved = resolvePtVtForComponent(relay, [relay, pt]);
    assert.ok(resolved);
    assert.strictEqual(resolved.voltage_base?.compatible, false);
  });
});
