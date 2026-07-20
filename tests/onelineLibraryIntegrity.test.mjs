import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateLibraryPayload } from '../src/validation/librarySchema.mjs';
import {
  compatibleProtectiveDevices,
  componentProtectionKind,
  protectiveDeviceMatchesComponent
} from '../src/one-line/protectiveDeviceCompatibility.mjs';
import { normalizeComponentElectricalProperties } from '../src/one-line/componentElectricalSchema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const library = JSON.parse(fs.readFileSync(path.join(root, 'componentLibrary.json'), 'utf8'));
const protectiveDevices = JSON.parse(fs.readFileSync(path.join(root, 'data', 'protectiveDevices.json'), 'utf8'));

function check(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

check('bundled component library passes its canonical validator', () => {
  const result = validateLibraryPayload(library);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
});

check('ANSI motor symbol uses a circle, integral M, and top feeder lead', () => {
  const svg = fs.readFileSync(path.join(root, 'icons', 'components', 'Motor.svg'), 'utf8');
  assert.match(svg, /<circle\b[^>]*cx="32"[^>]*cy="36"[^>]*r="22"/);
  assert.match(svg, /<path\b[^>]*d="M32 0v14"/);
  assert.match(svg, /<path\b[^>]*d="M21 46V26l11 14 11-14v20"/);
});

check('ANSI VFD symbol uses a labeled enclosure with top and bottom feeder leads', () => {
  const svg = fs.readFileSync(path.join(root, 'icons', 'components', 'VFD.svg'), 'utf8');
  assert.match(svg, /<rect\b[^>]*x="8"[^>]*y="12"[^>]*width="48"[^>]*height="54"/);
  assert.match(svg, /<path\b[^>]*d="M32 0v12"/);
  assert.match(svg, /<path\b[^>]*d="M32 66v12"/);
  assert.match(svg, />VFD<\/text>/);
});

check('ANSI and IEC panel symbols expose one incoming terminal and no bottom leader', () => {
  const ansiPanel = fs.readFileSync(path.join(root, 'icons', 'components', 'MLO.svg'), 'utf8');
  assert.match(ansiPanel, /<path\b[^>]*d="M32 0v14"/);
  assert.doesNotMatch(ansiPanel, /M32 58v18/);

  const iecPanel = fs.readFileSync(path.join(root, 'icons', 'components', 'iec', 'IEC_Panel.svg'), 'utf8');
  assert.match(iecPanel, /<line\b[^>]*x1="32"[^>]*y1="0"[^>]*x2="32"[^>]*y2="14"/);
  assert.doesNotMatch(iecPanel, /y1="60"[^>]*y2="76"/);

  const panel = library.components.find(component => component.type === 'panel' && component.subtype === 'panel');
  assert.deepEqual(panel.ports, [{ x: 32, y: 0 }]);
});

check('ANSI transformer symbols overlap their winding boundaries at every feeder terminal', () => {
  const twoWinding = fs.readFileSync(path.join(root, 'icons', 'components', 'Transformer.svg'), 'utf8');
  assert.match(twoWinding, /<path\b[^>]*d="M38 0v20"/);
  assert.match(twoWinding, /<path\b[^>]*d="M38 64v20"/);

  const threeWinding = fs.readFileSync(path.join(root, 'icons', 'components', 'Transformer3W.svg'), 'utf8');
  assert.match(threeWinding, /<path\b[^>]*d="M43 0v18"/);
  assert.match(threeWinding, /<path\b[^>]*d="M43 64v12M43 76H26M43 76H60M26 76v16M60 76v16"/);

  const iecTwoWinding = fs.readFileSync(path.join(root, 'icons', 'components', 'iec', 'IEC_Transformer.svg'), 'utf8');
  assert.match(iecTwoWinding, /<line\b[^>]*x1="38"[^>]*y1="0"[^>]*x2="38"[^>]*y2="18"/);
  assert.match(iecTwoWinding, /<line\b[^>]*x1="38"[^>]*y1="66"[^>]*x2="38"[^>]*y2="84"/);

  const iecThreeWinding = fs.readFileSync(path.join(root, 'icons', 'components', 'iec', 'IEC_Transformer3W.svg'), 'utf8');
  assert.match(iecThreeWinding, /<line\b[^>]*x1="43"[^>]*y1="0"[^>]*x2="43"[^>]*y2="18"/);
  assert.match(iecThreeWinding, /<path\b[^>]*d="M43 64v12M43 76H26M43 76H60M26 76v16M60 76v16"/);
});

check('every bundled component has a unique subtype and loadable icon assets', () => {
  const subtypes = new Set();
  library.components.forEach(component => {
    assert.ok(component.subtype, `${component.label} is missing subtype`);
    assert.ok(!subtypes.has(component.subtype), `duplicate subtype: ${component.subtype}`);
    subtypes.add(component.subtype);
    for (const key of ['icon', 'iconIEC']) {
      if (!component[key]) continue;
      assert.ok(fs.existsSync(path.join(root, component[key])), `${component.label} missing ${key}: ${component[key]}`);
    }
  });
});

check('electrically different one-line devices use distinct ANSI symbols', () => {
  const iconFor = subtype => library.components.find(component => component.subtype === subtype)?.icon;
  [
    ['ats', 'single_throw', 'double_throw', 'contactor'],
    ['pv_array', 'pv_inverter'],
    ['battery', 'bess_inverter', 'rectifier', 'ups'],
    ['overcurrent_relay', 'relay_87'],
    ['fvnr_starter', 'fvr_starter']
  ].forEach(group => {
    const icons = group.map(iconFor);
    assert.equal(new Set(icons).size, group.length, `shared icon in ${group.join(', ')}`);
  });
});

check('IEC panel, UPS, and motor symbols terminate at their declared connection ports', () => {
  const affectedSubtypes = ['panel', 'ups', 'motor_load'];
  affectedSubtypes.forEach(subtype => {
    const component = library.components.find(item => item.subtype === subtype);
    assert.ok(component?.iconIEC, `${subtype} is missing an IEC symbol`);
    const svg = fs.readFileSync(path.join(root, component.iconIEC), 'utf8');
    const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    assert.ok(viewBox, `${subtype} IEC symbol is missing a numeric viewBox`);
    assert.equal(Number(viewBox[1]), component.width, `${subtype} IEC viewBox width does not match component width`);
    assert.equal(Number(viewBox[2]), component.height, `${subtype} IEC viewBox height does not match component height`);

    const lineEndpoints = [...svg.matchAll(/<line\b([^>]*)\/>/g)].flatMap(match => {
      const attributes = Object.fromEntries(
        [...match[1].matchAll(/(x1|y1|x2|y2)="([\d.]+)"/g)]
          .map(attribute => [attribute[1], Number(attribute[2])])
      );
      return [
        { x: attributes.x1, y: attributes.y1 },
        { x: attributes.x2, y: attributes.y2 }
      ];
    });
    component.ports.forEach(port => {
      assert.ok(
        lineEndpoints.some(endpoint => endpoint.x === port.x && endpoint.y === port.y),
        `${subtype} IEC symbol does not physically reach port (${port.x}, ${port.y})`
      );
    });
  });
});

check('transfer switches retain two source terminals and one load terminal', () => {
  ['ats', 'double_throw'].forEach(subtype => {
    const component = library.components.find(item => item.subtype === subtype);
    assert.equal(component?.ports?.length, 3, `${subtype} must expose three terminals`);
    assert.deepEqual(
      component.ports.map(port => [port.x, port.y]),
      [[18, 0], [54, 0], [36, 72]],
      `${subtype} terminal geometry is not aligned to its symbol`
    );
  });
});

check('relay records never claim an interrupting rating', () => {
  protectiveDevices.filter(device => device.type === 'relay').forEach(device => {
    assert.equal(device.interruptRating, null, `${device.id} has relay interrupting rating`);
  });
});

check('non-interrupting component templates use SCCR rather than breaker duty aliases', () => {
  library.components
    .filter(component => ['switch', 'contactor', 'motor_controller', 'motor_starter', 'relay'].includes(component.type))
    .forEach(component => {
      assert.equal(component.props?.interruptRatingKA, undefined, `${component.subtype} has interruptRatingKA`);
      assert.equal(component.props?.withstandRatingKA, undefined, `${component.subtype} has unverified withstandRatingKA`);
      assert.equal(component.props?.withstandCycles, undefined, `${component.subtype} has unverified withstandCycles`);
    });
});

check('catalog AIC is not copied into short-time withstand', () => {
  protectiveDevices.filter(device => ['breaker', 'fuse'].includes(device.type)).forEach(device => {
    assert.equal(device.withstandRatingKA, null, `${device.id} has unverified withstand rating`);
  });
});

check('protective-device choices are filtered by kind and voltage class', () => {
  const lvBreaker = { type: 'breaker', subtype: 'lv_cb', rated_voltage_kv: 0.48 };
  const mvBreaker = { type: 'breaker', subtype: 'mv_cb', rated_voltage_kv: 15 };
  const differential = { type: 'relay', subtype: 'relay_87', rated_voltage_kv: 15 };
  const placedDifferential = { type: 'relay', subtype: 'relay_relay_87', rated_voltage_kv: 15 };
  const ct = { type: 'ct', subtype: 'ct', rated_voltage_kv: 15 };
  assert.equal(componentProtectionKind(ct), null);
  assert.ok(compatibleProtectiveDevices(protectiveDevices, lvBreaker).every(device => device.type === 'breaker' && device.voltageClass === 'LV'));
  assert.ok(compatibleProtectiveDevices(protectiveDevices, mvBreaker).every(device => device.type === 'breaker' && device.voltageClass === 'MV'));
  assert.ok(compatibleProtectiveDevices(protectiveDevices, differential).every(device => device.subtype === 'relay_87'));
  assert.ok(compatibleProtectiveDevices(protectiveDevices, placedDifferential).every(device => device.subtype === 'relay_87'));
  assert.equal(compatibleProtectiveDevices(protectiveDevices, ct).length, 0);
  assert.equal(protectiveDeviceMatchesComponent(protectiveDevices.find(device => device.type === 'fuse'), lvBreaker), false);
});

check('component electrical aliases normalize without assigning relay AIC', () => {
  const breaker = normalizeComponentElectricalProperties({
    type: 'breaker',
    props: { rated_voltage_kv: 0.48, interruptRatingKA: 65, withstandRatingKA: 30, withstandCycles: 30 }
  });
  assert.equal(breaker.interrupting_rating_ka, 65);
  assert.equal(breaker.short_time_withstand_ka, 30);
  const relay = normalizeComponentElectricalProperties({ type: 'relay', props: { interruptRatingKA: 50 } });
  assert.equal(relay.interrupting_rating_ka, null);
  assert.equal(relay.props.interrupting_rating_ka, null);
});
