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
assert.equal(mcc.props.sccr_ka, 65);
assert.equal(mcc.props.bucket_count, 6);
assert.equal(mcc.props.form_type, 'form_2b');

const busway = getComponent('busway');
assert.equal(busway.props.busway_type, 'feeder');
assert.equal(busway.props.short_circuit_rating_ka, 65);

const ct = getComponent('ct');
assert.equal(ct.props.ratio_primary, 600);
assert.equal(ct.props.ratio_secondary, 5);
assert.equal(ct.props.location_context, 'protection');

const ptVt = getComponent('pt_vt');
assert.equal(ptVt.props.primary_voltage, 12470);
assert.equal(ptVt.props.secondary_voltage, 120);

const ups = getComponent('ups');
assert.equal(ups.props.runtime_battery_min, 20);
assert.equal(ups.props.battery_runtime_min, 20);
assert.equal(ups.props.mode_battery_enabled, true);

console.log('✓ projectStorage migrateProject backfills Phase 1 component defaults');
