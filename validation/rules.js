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


  // Current transformer (CT) required field completeness and physical validity
  components.forEach(c => {
    const isCt = c?.subtype === 'ct' || c?.type === 'ct';
    if (!isCt) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];

    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    const ratioPrimary = Number(props.ratio_primary);
    const ratioSecondary = Number(props.ratio_secondary);
    if (!Number.isFinite(ratioPrimary) || ratioPrimary <= 0) missing.push('ratio_primary');
    if (!Number.isFinite(ratioSecondary) || ratioSecondary <= 0) missing.push('ratio_secondary');
    if (Number.isFinite(ratioPrimary) && Number.isFinite(ratioSecondary) && ratioPrimary < ratioSecondary) {
      missing.push('ratio_primary>=ratio_secondary');
    }

    if (!`${props.accuracy_class ?? ''}`.trim()) missing.push('accuracy_class');
    const burdenVa = Number(props.burden_va);
    if (!Number.isFinite(burdenVa) || burdenVa <= 0) missing.push('burden_va');
    const kneePointV = Number(props.knee_point_v);
    if (!Number.isFinite(kneePointV) || kneePointV <= 0) missing.push('knee_point_v');
    if (!`${props.polarity ?? ''}`.trim()) missing.push('polarity');

    const locationContext = `${props.location_context ?? ''}`.trim().toLowerCase();
    if (!['metering', 'protection'].includes(locationContext)) missing.push('location_context');

    if (missing.length) {
      issues.push({
        component: c.id,
        message: `Current transformer missing/invalid attributes: ${missing.join(', ')}.`
      });
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

  // Battery required field completeness for DC short-circuit and battery studies
  components.forEach(c => {
    const isBattery = c?.type === 'battery' || c?.subtype === 'battery';
    if (!isBattery) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    if (!`${props.description ?? ''}`.trim()) missing.push('description');
    if (!`${props.manufacturer ?? ''}`.trim()) missing.push('manufacturer');
    if (!`${props.model ?? ''}`.trim()) missing.push('model');
    const nominalVoltageVdc = Number(props.nominal_voltage_vdc);
    if (!Number.isFinite(nominalVoltageVdc) || nominalVoltageVdc <= 0) missing.push('nominal_voltage_vdc');
    if (!`${props.cell_chemistry ?? ''}`.trim()) missing.push('cell_chemistry');
    const cellCount = Number(props.cell_count);
    if (!Number.isFinite(cellCount) || cellCount <= 0) missing.push('cell_count');
    const capacityAh = Number(props.capacity_ah);
    if (!Number.isFinite(capacityAh) || capacityAh <= 0) missing.push('capacity_ah');
    const internalResistanceOhm = Number(props.internal_resistance_ohm);
    if (!Number.isFinite(internalResistanceOhm) || internalResistanceOhm < 0) missing.push('internal_resistance_ohm');
    const initialSocPct = Number(props.initial_soc_pct);
    if (!Number.isFinite(initialSocPct) || initialSocPct < 0 || initialSocPct > 100) missing.push('initial_soc_pct');
    const minSocPct = Number(props.min_soc_pct);
    if (!Number.isFinite(minSocPct) || minSocPct < 0 || minSocPct > 100) missing.push('min_soc_pct');
    const maxChargeCurrentA = Number(props.max_charge_current_a);
    if (!Number.isFinite(maxChargeCurrentA) || maxChargeCurrentA <= 0) missing.push('max_charge_current_a');
    const maxDischargeCurrentA = Number(props.max_discharge_current_a);
    if (!Number.isFinite(maxDischargeCurrentA) || maxDischargeCurrentA <= 0) missing.push('max_discharge_current_a');
    if (missing.length) {
      issues.push({
        component: c.id,
        message: `Battery missing required attributes: ${missing.join(', ')}.`
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
    const subtype = `${c?.subtype ?? ''}`.trim().toLowerCase();
    const isPanel = (c?.type === 'panel' || subtype === 'panel') && subtype !== 'mcc';
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


  // MCC required field completeness for lineup and study metadata
  components.forEach(c => {
    const isMcc = c?.subtype === 'mcc' || c?.type === 'mcc';
    if (!isMcc) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    if (!`${props.description ?? ''}`.trim()) missing.push('description');
    if (!`${props.manufacturer ?? ''}`.trim()) missing.push('manufacturer');
    if (!`${props.model ?? ''}`.trim()) missing.push('model');
    const ratedVoltageKv = Number(props.rated_voltage_kv);
    if (!Number.isFinite(ratedVoltageKv) || ratedVoltageKv <= 0) missing.push('rated_voltage_kv');
    const busRatingA = Number(props.bus_rating_a);
    if (!Number.isFinite(busRatingA) || busRatingA <= 0) missing.push('bus_rating_a');
    if (!`${props.main_device_type ?? ''}`.trim()) missing.push('main_device_type');
    const sccrKa = Number(props.sccr_ka);
    if (!Number.isFinite(sccrKa) || sccrKa <= 0) missing.push('sccr_ka');
    const bucketCount = Number(props.bucket_count);
    if (!Number.isFinite(bucketCount) || bucketCount <= 0) missing.push('bucket_count');
    const spareBucketCount = Number(props.spare_bucket_count);
    if (!Number.isFinite(spareBucketCount) || spareBucketCount < 0 || (Number.isFinite(bucketCount) && spareBucketCount > bucketCount)) {
      missing.push('spare_bucket_count');
    }
    if (!`${props.form_type ?? ''}`.trim()) missing.push('form_type');
    if (missing.length) {
      issues.push({
        component: c.id,
        message: `MCC missing required attributes: ${missing.join(', ')}.`
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

  // Cable required field completeness for feeder/path impedance studies
  components.forEach(c => {
    const isCable = c?.type === 'cable' || c?.subtype === 'cable';
    if (!isCable) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    if (!`${props.description ?? ''}`.trim()) missing.push('description');
    if (!`${props.manufacturer ?? ''}`.trim()) missing.push('manufacturer');
    if (!`${props.model ?? ''}`.trim()) missing.push('model');
    const lengthFt = Number(props.length_ft);
    if (!Number.isFinite(lengthFt) || lengthFt <= 0) missing.push('length_ft');
    if (!`${props.material ?? ''}`.trim()) missing.push('material');
    if (!`${props.insulation_type ?? ''}`.trim()) missing.push('insulation_type');
    const tempRatingC = Number(props.temp_rating_c);
    if (!Number.isFinite(tempRatingC) || tempRatingC <= 0) missing.push('temp_rating_c');
    if (!`${props.size_awg_kcmil ?? ''}`.trim()) missing.push('size_awg_kcmil');
    const parallelSets = Number(props.parallel_sets);
    if (!Number.isFinite(parallelSets) || parallelSets <= 0) missing.push('parallel_sets');
    const rOhmPerKft = Number(props.r_ohm_per_kft);
    if (!Number.isFinite(rOhmPerKft) || rOhmPerKft < 0) missing.push('r_ohm_per_kft');
    const xOhmPerKft = Number(props.x_ohm_per_kft);
    if (!Number.isFinite(xOhmPerKft) || xOhmPerKft < 0) missing.push('x_ohm_per_kft');
    if (missing.length) {
      issues.push({
        component: c.id,
        message: `Cable missing required attributes: ${missing.join(', ')}.`
      });
    }
  });

  // Busway required field completeness for feeder/path impedance studies
  components.forEach(c => {
    const isBusway = c?.type === 'busway' || c?.subtype === 'busway';
    if (!isBusway) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    const lengthFt = Number(props.length_ft);
    if (!Number.isFinite(lengthFt) || lengthFt <= 0) missing.push('length_ft');
    if (!`${props.material ?? ''}`.trim()) missing.push('material');
    if (!`${props.insulation_type ?? ''}`.trim()) missing.push('insulation_type');
    if (!`${props.enclosure_rating ?? ''}`.trim()) missing.push('enclosure_rating');
    const buswayType = `${props.busway_type ?? ''}`.trim().toLowerCase();
    if (!['feeder', 'plug-in'].includes(buswayType)) missing.push('busway_type');
    const ampacityA = Number(props.ampacity_a);
    if (!Number.isFinite(ampacityA) || ampacityA <= 0) missing.push('ampacity_a');
    const rOhmPerKft = Number(props.r_ohm_per_kft);
    if (!Number.isFinite(rOhmPerKft) || rOhmPerKft <= 0) missing.push('r_ohm_per_kft');
    const xOhmPerKft = Number(props.x_ohm_per_kft);
    if (!Number.isFinite(xOhmPerKft) || xOhmPerKft <= 0) missing.push('x_ohm_per_kft');
    const shortCircuitRatingKa = Number(props.short_circuit_rating_ka);
    if (!Number.isFinite(shortCircuitRatingKa) || shortCircuitRatingKa <= 0) missing.push('short_circuit_rating_ka');
    if (missing.length) {
      issues.push({
        component: c.id,
        message: `Busway missing required attributes: ${missing.join(', ')}.`
      });
    }
  });

  // Generator required field completeness for short-circuit/transient/dispatch studies
  components.forEach(c => {
    const subtype = `${c?.subtype ?? ''}`.trim().toLowerCase();
    const type = `${c?.type ?? ''}`.trim().toLowerCase();
    const isGenerator = type === 'generator' || subtype === 'generator' || subtype === 'synchronous' || subtype === 'asynchronous';
    if (!isGenerator) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    if (!`${props.description ?? ''}`.trim()) missing.push('description');
    if (!`${props.manufacturer ?? ''}`.trim()) missing.push('manufacturer');
    if (!`${props.model ?? ''}`.trim()) missing.push('model');
    const ratedMva = Number(props.rated_mva);
    if (!Number.isFinite(ratedMva) || ratedMva <= 0) missing.push('rated_mva');
    const ratedKv = Number(props.rated_kv);
    if (!Number.isFinite(ratedKv) || ratedKv <= 0) missing.push('rated_kv');
    const xdppPu = Number(props.xdpp_pu);
    if (!Number.isFinite(xdppPu) || xdppPu <= 0) missing.push('xdpp_pu');
    const xdpPu = Number(props.xdp_pu);
    if (!Number.isFinite(xdpPu) || xdpPu <= 0) missing.push('xdp_pu');
    const xdPu = Number(props.xd_pu);
    if (!Number.isFinite(xdPu) || xdPu <= 0) missing.push('xd_pu');
    const hConstant = Number(props.h_constant_s);
    if (!Number.isFinite(hConstant) || hConstant <= 0) missing.push('h_constant_s');
    if (!`${props.governor_mode ?? ''}`.trim()) missing.push('governor_mode');
    if (!`${props.avr_mode ?? ''}`.trim()) missing.push('avr_mode');
    const minKw = Number(props.min_kw);
    if (!Number.isFinite(minKw) || minKw < 0) missing.push('min_kw');
    const maxKw = Number(props.max_kw);
    if (!Number.isFinite(maxKw) || maxKw <= 0 || (Number.isFinite(minKw) && minKw > maxKw)) missing.push('max_kw');
    const rampKwPerMin = Number(props.ramp_kw_per_min);
    if (!Number.isFinite(rampKwPerMin) || rampKwPerMin <= 0) missing.push('ramp_kw_per_min');
    if (missing.length) {
      issues.push({
        component: c.id,
        message: `Generator missing required attributes: ${missing.join(', ')}.`
      });
    }
  });

  // Capacitor/reactor required tuning metadata completeness
  components.forEach(c => {
    const subtype = `${c?.subtype ?? ''}`.trim().toLowerCase();
    const type = `${c?.type ?? ''}`.trim().toLowerCase();
    const isCapacitorOrReactor = subtype === 'shunt_capacitor_bank'
      || subtype === 'reactor'
      || subtype === 'capacitorbank'
      || type === 'shunt_capacitor_bank'
      || type === 'reactor';
    if (!isCapacitorOrReactor) return;

    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    if (!`${props.description ?? ''}`.trim()) missing.push('description');
    if (!`${props.manufacturer ?? ''}`.trim()) missing.push('manufacturer');
    if (!`${props.model ?? ''}`.trim()) missing.push('model');

    const ratedKvar = Number(props.rated_kvar);
    if (!Number.isFinite(ratedKvar) || ratedKvar <= 0) missing.push('rated_kvar');
    const ratedKv = Number(props.rated_kv);
    if (!Number.isFinite(ratedKv) || ratedKv <= 0) missing.push('rated_kv');
    const steps = Number(props.steps);
    if (!Number.isFinite(steps) || steps <= 0) missing.push('steps');

    const hasDetuned = typeof props.detuned === 'boolean';
    if (!hasDetuned) {
      missing.push('detuned');
    }

    if (!`${props.switching_transient_class ?? ''}`.trim()) missing.push('switching_transient_class');

    const validatePositiveOptionalNumber = (value, key) => {
      if (value === '' || value === null || value === undefined) return;
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) missing.push(key);
    };

    if (props.detuned === true) {
      const tuningHz = Number(props.tuning_hz);
      if (!Number.isFinite(tuningHz) || tuningHz <= 0) missing.push('tuning_hz');
      const reactorPct = Number(props.reactor_pct);
      if (!Number.isFinite(reactorPct) || reactorPct <= 0) missing.push('reactor_pct');
    } else {
      validatePositiveOptionalNumber(props.tuning_hz, 'tuning_hz');
      validatePositiveOptionalNumber(props.reactor_pct, 'reactor_pct');
    }

    if (missing.length) {
      issues.push({
        component: c.id,
        message: `Capacitor/reactor missing required attributes: ${missing.join(', ')}.`
      });
    }
  });


  // Differential relay (87) required field completeness
  components.forEach(c => {
    const isRelay87 = c?.subtype === 'relay_87';
    if (!isRelay87) return;
    const props = c.props && typeof c.props === 'object' ? c.props : c;
    const missing = [];
    if (!`${props.tag ?? ''}`.trim()) missing.push('tag');
    if (!`${props.description ?? ''}`.trim()) missing.push('description');
    if (!`${props.manufacturer ?? ''}`.trim()) missing.push('manufacturer');
    if (!`${props.model ?? ''}`.trim()) missing.push('model');
    const zone = `${props.protected_zone_type ?? ''}`.trim();
    if (!['bus', 'transformer', 'generator'].includes(zone)) missing.push('protected_zone_type');
    const pickupPu = Number(props.pickup_pu);
    if (!Number.isFinite(pickupPu) || pickupPu <= 0) missing.push('pickup_pu');
    const slope1 = Number(props.slope1_pct);
    if (!Number.isFinite(slope1) || slope1 <= 0) missing.push('slope1_pct');
    const slope2 = Number(props.slope2_pct);
    if (!Number.isFinite(slope2) || slope2 <= 0) missing.push('slope2_pct');
    const breakpointPu = Number(props.breakpoint_pu);
    if (!Number.isFinite(breakpointPu) || breakpointPu <= 0) missing.push('breakpoint_pu');
    if (typeof props.inrush_blocking_enabled !== 'boolean') missing.push('inrush_blocking_enabled');
    const secondHarmonic = Number(props.second_harmonic_pct);
    if (!Number.isFinite(secondHarmonic) || secondHarmonic < 0) missing.push('second_harmonic_pct');
    if (missing.length) {
      issues.push({
        component: c.id,
        message: `Differential relay missing required attributes: ${missing.join(', ')}.`
      });
    }
  });

  // TCC duty/coordination violations from studies
  Object.entries(studies.duty || {}).forEach(([id, msgs = []]) => {
    msgs.forEach(msg => issues.push({ component: id, message: msg }));
  });

  return issues;
}
