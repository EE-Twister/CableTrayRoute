import assert from 'node:assert/strict';
import { migrateProject } from '../projectStorage.js';

const legacyProject = {
  settings: {
    oneLineDiagram: {
      version: 4,
      sheets: [
        {
          name: 'Legacy',
          components: [
            { id: 'm1', subtype: 'mcc', props: {} },
            { id: 'b1', subtype: 'busway', props: {} },
            { id: 'c1', subtype: 'ct', props: {} },
            { id: 'p1', subtype: 'pt_vt', props: {} },
            { id: 'u1', subtype: 'ups', props: { runtime_battery_min: 20 } }
          ]
        }
      ]
    }
  }
};

const migrated = migrateProject(legacyProject);
const components = migrated.settings.oneLineDiagram.sheets[0].components;
const getComponent = (subtype) => components.find((component) => component.subtype === subtype);

const mcc = getComponent('mcc');
assert.equal(mcc.props.sccr_ka, undefined);
assert.equal(mcc.props.bucket_count, undefined);
assert.equal(mcc.props.form_type, undefined);

const busway = getComponent('busway');
assert.equal(busway.props.busway_type, undefined);
assert.equal(busway.props.short_circuit_rating_ka, undefined);

const ct = getComponent('ct');
assert.equal(ct.props.ratio_primary, undefined);
assert.equal(ct.props.ratio_secondary, undefined);
assert.equal(ct.props.location_context, undefined);

const ptVt = getComponent('pt_vt');
assert.equal(ptVt.props.primary_voltage, undefined);
assert.equal(ptVt.props.secondary_voltage, undefined);

const ups = getComponent('ups');
assert.equal(ups.props.runtime_battery_min, 20);
assert.equal(ups.props.battery_runtime_min, 20);
assert.equal(ups.props.mode_battery_enabled, undefined);

console.log('✓ projectStorage migrateProject preserves missing Phase 1 study fields');
