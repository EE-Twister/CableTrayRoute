import { resolveComponentLabel } from '../utils/componentLabels.js';

export function runValidation(components = [], studies = {}) {
  const issues = [];
  const componentLookup = new Map(components.map(c => [c.id, c]));
  const describe = id => {
    const comp = componentLookup.get(id);
    return resolveComponentLabel(comp, id);
  };

  // Map inbound connections for bus connectivity check
  const inbound = new Map();
  components.forEach(c => {
    if (c.type === 'bus') inbound.set(c.id, 0);
  });
  components.forEach(c => {
    (c.connections || []).forEach(conn => {
      if (inbound.has(conn.target)) {
        inbound.set(conn.target, (inbound.get(conn.target) || 0) + 1);
      }
    });
  });
  inbound.forEach((cnt, id) => {
    const comp = componentLookup.get(id);
    const outbound = Array.isArray(comp?.connections)
      ? comp.connections.filter(conn => conn && conn.target).length
      : 0;
    if (cnt === 0 && outbound === 0) {
      issues.push({ component: id, message: 'Unconnected bus' });
    }
  });

  // Transformer loading check
  components.forEach(c => {
    if (c.type !== 'transformer') return;
    const load = Number(c.load_kva || c.load || 0);
    const rating = Number(c.kva || c.rating || 0);
    if (rating && load > rating) {
      issues.push({ component: c.id, message: `Transformer overloaded (${load}kVA > ${rating}kVA)` });
    }
  });

  // Breaker interrupting rating check
  components.forEach(c => {
    if (c.type !== 'breaker') return;
    const interrupt = Number(c.interrupt_rating || 0);
    const fault = Number(c.fault_current || 0);
    if (interrupt && fault > interrupt) {
      issues.push({ component: c.id, message: `Breaker interrupt rating exceeded (${fault}A > ${interrupt}A)` });
    }
  });

  // Meter ratio completeness for study-enabled metering features
  components.forEach(c => {
    if (c.type !== 'meter') return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const meteringEnabled = Boolean(
      props.supports_thd
      || props.supports_flicker
      || props.supports_waveform_capture
    );
    if (!meteringEnabled) return;
    const ctRatio = `${props.ct_ratio ?? ''}`.trim();
    const ptRatio = `${props.pt_ratio ?? ''}`.trim();
    if (!ctRatio || !ptRatio) {
      issues.push({
        component: c.id,
        message: 'Meter requires both CT ratio and PT ratio when metering studies are enabled.'
      });
    }
  });

  // DC bus required field completeness for DC-focused studies
  components.forEach(c => {
    const isDcBus = c?.subtype === 'dc_bus';
    if (!isDcBus) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    const nominalVoltage = Number(props.nominal_voltage_vdc);
    if (!Number.isFinite(nominalVoltage) || nominalVoltage <= 0) missing.push('nominal_voltage_vdc');
    if (!`${props.grounding_scheme ?? ''}`.trim()) missing.push('grounding_scheme');
    const maxContinuousCurrent = Number(props.max_continuous_current_a);
    if (!Number.isFinite(maxContinuousCurrent) || maxContinuousCurrent <= 0) missing.push('max_continuous_current_a');
    const shortCircuitRating = Number(props.short_circuit_rating_ka);
    if (!Number.isFinite(shortCircuitRating) || shortCircuitRating <= 0) missing.push('short_circuit_rating_ka');
    if (missing.length) {
      issues.push({
        component: c.id,
        message: `DC bus missing required attributes: ${missing.join(', ')}.`
      });
    }
  });

  // Panel required field completeness for panel studies and reports
  components.forEach(c => {
    const isPanel = c?.type === 'panel' || c?.subtype === 'panel' || c?.subtype === 'Panel';
    if (!isPanel) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    if (!`${props.description ?? ''}`.trim()) missing.push('description');
    if (!`${props.manufacturer ?? ''}`.trim()) missing.push('manufacturer');
    if (!`${props.model ?? ''}`.trim()) missing.push('model');
    const ratedVoltageKv = Number(props.rated_voltage_kv);
    if (!Number.isFinite(ratedVoltageKv) || ratedVoltageKv <= 0) missing.push('rated_voltage_kv');
    const phases = Number(props.phases);
    if (!Number.isFinite(phases) || phases <= 0) missing.push('phases');
    const busRatingA = Number(props.bus_rating_a);
    if (!Number.isFinite(busRatingA) || busRatingA <= 0) missing.push('bus_rating_a');
    if (!`${props.main_device_type ?? ''}`.trim()) missing.push('main_device_type');
    const mainInterruptingKa = Number(props.main_interrupting_ka);
    if (!Number.isFinite(mainInterruptingKa) || mainInterruptingKa <= 0) missing.push('main_interrupting_ka');
    if (!`${props.grounding_type ?? ''}`.trim()) missing.push('grounding_type');
    if (!`${props.service_type ?? ''}`.trim()) missing.push('service_type');
    if (missing.length) {
      issues.push({
        component: c.id,
        message: `Panel missing required attributes: ${missing.join(', ')}.`
      });
    }
  });

  // Switchboard required field completeness for fault/protection studies
  components.forEach(c => {
    const isSwitchboard = c?.type === 'switchboard' || c?.subtype === 'switchboard';
    if (!isSwitchboard) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    if (!`${props.description ?? ''}`.trim()) missing.push('description');
    if (!`${props.manufacturer ?? ''}`.trim()) missing.push('manufacturer');
    if (!`${props.model ?? ''}`.trim()) missing.push('model');
    const ratedVoltageKv = Number(props.rated_voltage_kv);
    if (!Number.isFinite(ratedVoltageKv) || ratedVoltageKv <= 0) missing.push('rated_voltage_kv');
    const phases = Number(props.phases);
    if (!Number.isFinite(phases) || phases <= 0) missing.push('phases');
    const busRatingA = Number(props.bus_rating_a);
    if (!Number.isFinite(busRatingA) || busRatingA <= 0) missing.push('bus_rating_a');
    const withstand1sKa = Number(props.withstand_1s_ka);
    if (!Number.isFinite(withstand1sKa) || withstand1sKa <= 0) missing.push('withstand_1s_ka');
    const interruptingKa = Number(props.interrupting_ka);
    if (!Number.isFinite(interruptingKa) || interruptingKa <= 0) missing.push('interrupting_ka');
    if (!`${props.arc_resistant_type ?? ''}`.trim()) missing.push('arc_resistant_type');
    if (typeof props.maintenance_mode_supported !== 'boolean') missing.push('maintenance_mode_supported');
    if (missing.length) {
      issues.push({
        component: c.id,
        message: `Switchboard missing required attributes: ${missing.join(', ')}.`
      });
    }
  });

  // TCC duty/coordination violations from studies
  Object.entries(studies.duty || {}).forEach(([id, msgs = []]) => {
    msgs.forEach(msg => issues.push({ component: id, message: msg }));
  });

  return issues;
}
