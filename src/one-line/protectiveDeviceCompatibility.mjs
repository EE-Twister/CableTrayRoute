import { normalizeVoltageToVolts } from '../../utils/voltage.js';

function text(value) {
  return String(value ?? '').trim().toLowerCase();
}

function readField(component, names) {
  for (const name of names) {
    const direct = component?.[name];
    if (direct !== undefined && direct !== null && direct !== '') return direct;
    const nested = component?.props?.[name];
    if (nested !== undefined && nested !== null && nested !== '') return nested;
  }
  return null;
}

export function componentProtectionKind(component) {
  const type = text(component?.type);
  const subtype = text(component?.subtype);
  if (type === 'breaker' || subtype.endsWith('_cb')) return 'breaker';
  if (type === 'fuse' || subtype.includes('fuse')) return 'fuse';
  if (type === 'recloser' || subtype === 'recloser') return 'recloser';
  if (type === 'relay' && (subtype === 'relay_87' || subtype.endsWith('_relay_87'))) return 'relay_87';
  if (type === 'relay') return 'relay';
  if (type === 'switch' && (subtype === 'fused_disconnect' || subtype.endsWith('_fused_disconnect'))) return 'fuse';
  return null;
}

export function componentVoltageClass(component) {
  const kv = Number(readField(component, ['rated_voltage_kv', 'kV', 'baseKV', 'ac_voltage_kv']));
  if (Number.isFinite(kv) && kv > 0) return kv <= 1 ? 'LV' : 'MV';
  const volts = normalizeVoltageToVolts(readField(component, ['voltage', 'volts', 'nominal_voltage_vdc']));
  if (Number.isFinite(volts) && volts > 0) return volts <= 1000 ? 'LV' : 'MV';
  return null;
}

export function protectiveDeviceMatchesComponent(device, component) {
  if (!device || !component) return false;
  const kind = componentProtectionKind(component);
  const deviceType = text(device.type);
  const deviceSubtype = text(device.subtype);
  if (!kind) return false;
  if (kind === 'relay_87') {
    if (deviceType !== 'relay' || deviceSubtype !== 'relay_87') return false;
  } else if (kind === 'relay') {
    if (deviceType !== 'relay' || deviceSubtype === 'relay_87') return false;
  } else if (deviceType !== kind) {
    return false;
  }
  const componentClass = componentVoltageClass(component);
  const deviceClass = String(device.voltageClass || '').trim().toUpperCase();
  if (componentClass && deviceClass && componentClass !== deviceClass) return false;
  return true;
}

export function compatibleProtectiveDevices(devices, component) {
  return (Array.isArray(devices) ? devices : [])
    .filter(device => protectiveDeviceMatchesComponent(device, component));
}
