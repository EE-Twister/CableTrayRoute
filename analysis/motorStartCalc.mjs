/**
 * Motor Starting Calculation — pure logic, no rendering dependencies.
 *
 * This module contains only the calculation functions from analysis/motorStart.js
 * and can be safely imported in Node.js server-side contexts where CDN URLs
 * (used by the browser-only d3 import in motorStart.js) are unavailable.
 *
 * The browser entry point (analysis/motorStart.js) re-exports these functions
 * and adds d3-based chart rendering on top.
 *
 * @module analysis/motorStartCalc
 */

import { getOneLine } from '../dataStore.mjs';

function parseNum(val) {
  if (typeof val === 'number') return val;
  const m = String(val || '').match(/([0-9.]+)/);
  return m ? Number(m[1]) : 0;
}

function parseTorqueCurve(spec) {
  if (!spec) return () => 0;
  const pts = [];
  if (Array.isArray(spec)) {
    spec.forEach(p => {
      const [s, t] = p.split(':');
      pts.push({ s: Number(s), t: Number(t) });
    });
  } else if (typeof spec === 'string') {
    spec.split(/[,\s]+/).forEach(p => {
      if (!p) return;
      const [s, t] = p.split(':');
      pts.push({ s: Number(s), t: Number(t) });
    });
  }
  pts.sort((a, b) => a.s - b.s);
  return (speedFrac) => {
    const sp = speedFrac * 100;
    let p1 = pts[0] || { s: 0, t: 0 };
    let p2 = pts[pts.length - 1] || { s: 100, t: 100 };
    for (let i = 0; i < pts.length - 1; i++) {
      if (sp >= pts[i].s && sp <= pts[i + 1].s) {
        p1 = pts[i];
        p2 = pts[i + 1];
        break;
      }
    }
    const ratio = (sp - p1.s) / ((p2.s - p1.s) || 1);
    const torquePct = p1.t + (p2.t - p1.t) * ratio;
    return torquePct / 100;
  };
}

/**
 * Return starting profile parameters for a motor component.
 * Supported starter_type values:
 *   'dol'             – Direct-on-line (default)
 *   'vfd'             – Variable-frequency drive
 *   'soft_starter'    – Reduced-voltage ramp
 *   'wye_delta'       – Wye-start, delta-run
 *   'autotransformer' – Autotransformer reduced-voltage start
 */
export function getStarterProfile(c) {
  const type = (
    c.starter_type
    ?? c.props?.starter_type
    ?? 'dol'
  ).toString().toLowerCase().replace(/[-\s]/g, '_');
  return {
    type,
    vfdCurrentLimitPu: Number(c.vfd_current_limit_pu ?? c.props?.vfd_current_limit_pu ?? c.current_limit_pu ?? c.props?.current_limit_pu) || 1.1,
    initialVoltagePu:  Number(c.initial_voltage_pu   ?? c.props?.initial_voltage_pu)   || 0.3,
    rampTimeSec:       Number(c.ramp_time_s           ?? c.props?.ramp_time_s)           || 10,
    wyeDeltaSwitchTimeSec: Number(c.wye_delta_switch_time_s ?? c.props?.wye_delta_switch_time_s) || 5,
    autotransformerTap: Number(c.autotransformer_tap  ?? c.props?.autotransformer_tap)   || 0.65,
  };
}

export function isMotorComponent(component) {
  const subtype = `${component?.subtype || ''}`.toLowerCase();
  const type = `${component?.type || ''}`.toLowerCase();
  return subtype === 'motor_load'
    || type === 'motor_load'
    || subtype === 'motor'
    || type === 'motor'
    || type === 'motor_controller'
    || type === 'motor_starter'
    || subtype === 'vfd'
    || subtype === 'soft_starter'
    || subtype.includes('starter')
    || Boolean(component?.motor);
}

export function normalizeMotorStartInput(component = {}, overrides = {}) {
  const merged = { ...component, ...overrides, props: { ...(component.props || {}), ...(overrides.props || {}) } };
  const props = merged.props;
  const voltageKv = Number(props.rated_voltage_kv ?? props.baseKV);
  const pfRaw = Number(merged.pf ?? merged.power_factor ?? props.full_load_pf ?? props.pf ?? props.power_factor);
  const effRaw = Number(merged.efficiency ?? merged.eff ?? props.full_load_efficiency_pct ?? props.efficiency ?? props.eff);
  return {
    id: merged.id,
    label: merged.tag || merged.name || merged.label || merged.id || 'Motor',
    hp: parseNum(merged.rating || merged.hp || props.rated_hp || props.hp),
    volts: Number(merged.voltage ?? merged.volts ?? props.voltage ?? props.volts) || (voltageKv ? voltageKv * 1000 : 0),
    powerFactor: pfRaw > 1 ? pfRaw / 100 : pfRaw,
    efficiency: effRaw > 1 ? effRaw / 100 : effRaw,
    inrushMultiple: Number(merged.inrushMultiple ?? merged.lr_current_pu ?? props.inrushMultiple ?? props.lr_current_pu),
    theveninR: Number(merged.thevenin_r ?? props.thevenin_r ?? merged.theveninR ?? props.theveninR),
    theveninX: Number(merged.thevenin_x ?? props.thevenin_x ?? merged.theveninX ?? props.theveninX),
    inertia: Number(merged.inertia ?? props.inertia),
    speedRpm: Number(merged.speed ?? props.synchronous_speed_rpm ?? props.speed) || 1800,
    ...getStarterProfile(merged)
  };
}

export function validateMotorStartInput(input = {}) {
  const errors = [];
  if (!(input.hp > 0)) errors.push('rated horsepower');
  if (!(input.volts > 0)) errors.push('rated voltage');
  if (!(input.powerFactor > 0 && input.powerFactor <= 1)) errors.push('power factor');
  if (!(input.efficiency > 0 && input.efficiency <= 1)) errors.push('efficiency');
  if (!(input.inrushMultiple > 0)) errors.push('locked-rotor current multiple');
  if (!(Math.hypot(input.theveninR, input.theveninX) > 0)) errors.push('Thevenin R or X');
  if (input.type !== 'vfd' && !(input.inertia > 0)) errors.push('combined inertia');
  return {
    ready: errors.length === 0,
    errors
  };
}

export function calculateMotorStartCase(input = {}, criteria = {}) {
  const validation = validateMotorStartInput(input);
  if (!validation.ready) return { ...input, ...validation };

  const fullLoadAmps = input.hp * 746
    / (Math.sqrt(3) * input.volts * input.powerFactor * input.efficiency);
  const lockedRotorAmps = fullLoadAmps * input.inrushMultiple;
  let startingAmps = lockedRotorAmps;
  let accelerationTime;

  if (input.type === 'vfd') {
    startingAmps = fullLoadAmps * input.vfdCurrentLimitPu;
    accelerationTime = input.rampTimeSec;
  } else if (input.type === 'soft_starter') {
    startingAmps = lockedRotorAmps * input.initialVoltagePu;
    accelerationTime = input.rampTimeSec;
  } else if (input.type === 'wye_delta') {
    startingAmps = lockedRotorAmps / 3;
    accelerationTime = input.wyeDeltaSwitchTimeSec;
  } else if (input.type === 'autotransformer') {
    startingAmps = lockedRotorAmps * input.autotransformerTap * input.autotransformerTap;
  }

  if (!Number.isFinite(accelerationTime)) {
    const synchronousSpeed = 2 * Math.PI * input.speedRpm / 60;
    const ratedTorque = (input.hp * 746) / synchronousSpeed;
    const torqueFactor = input.type === 'autotransformer'
      ? input.autotransformerTap * input.autotransformerTap
      : 1;
    accelerationTime = Math.min(60, input.inertia * synchronousSpeed / Math.max(ratedTorque * torqueFactor, 0.001));
  }

  const voltageSagPct = startingAmps * Math.hypot(input.theveninR, input.theveninX) / input.volts * 100;
  const maxVoltageSagPct = Number(criteria.maxVoltageSagPct) || 15;
  const maxAccelerationTimeSec = Number(criteria.maxAccelerationTimeSec) || 10;
  const passes = voltageSagPct <= maxVoltageSagPct && accelerationTime <= maxAccelerationTimeSec;
  return {
    ...input,
    ready: true,
    errors: [],
    fullLoadAmps: Number(fullLoadAmps.toFixed(1)),
    inrushKA: Number((startingAmps / 1000).toFixed(3)),
    voltageSagPct: Number(voltageSagPct.toFixed(2)),
    accelTime: Number(accelerationTime.toFixed(2)),
    starterType: input.type,
    status: passes ? 'pass' : 'review',
    checks: {
      voltageSag: voltageSagPct <= maxVoltageSagPct,
      accelerationTime: accelerationTime <= maxAccelerationTimeSec
    }
  };
}

/**
 * Estimate voltage sag during motor starting using a simple Thevenin model.
 * @returns {Object<string,{inrushKA:number,voltageSagPct:number,accelTime:number,starterType:string}>}
 */
export function runMotorStart() {
  const { sheets } = getOneLine();
  const comps = (Array.isArray(sheets[0]?.components)
    ? sheets.flatMap(s => s.components)
    : sheets).filter(c => c && c.type !== 'annotation' && c.type !== 'dimension');
  const results = {};
  comps.forEach(c => {
    const subtype = typeof c.subtype === 'string' ? c.subtype.toLowerCase() : '';
    const type    = typeof c.type    === 'string' ? c.type.toLowerCase()    : '';
    const isMotor = subtype === 'motor_load' || type === 'motor_load'
      || subtype === 'motor' || type === 'motor'
      || type === 'motor_controller' || type === 'motor_starter'
      || subtype === 'vfd' || subtype === 'soft_starter'
      || subtype.includes('starter') || !!c.motor;
    if (!isMotor) return;

    const hp = parseNum(
      c.rating || c.hp || c.props?.rated_hp || c.props?.hp
    );
    const voltageKv = Number(
      c.props?.rated_voltage_kv ?? c.props?.baseKV
    );
    const V = Number(
      c.voltage ?? c.volts ?? c.props?.voltage ?? c.props?.volts
    ) || (voltageKv ? voltageKv * 1000 : 480);
    const pfRaw = Number(
      c.pf ?? c.power_factor
      ?? c.props?.full_load_pf ?? c.props?.pf ?? c.props?.power_factor
    );
    const pf  = pfRaw > 1 ? pfRaw / 100 : (pfRaw || 0.9);
    const effRaw = Number(
      c.efficiency ?? c.eff
      ?? c.props?.full_load_efficiency_pct ?? c.props?.efficiency ?? c.props?.eff
    );
    const eff = effRaw > 1 ? effRaw / 100 : (effRaw || 0.9);
    const multiple = Number(
      c.inrushMultiple ?? c.lr_current_pu
      ?? c.props?.inrushMultiple ?? c.props?.lr_current_pu
    ) || 6;

    const Ifl = hp * 746 / (Math.sqrt(3) * V * pf * eff || 1);
    const Ilr = Ifl * multiple;
    const theveninR = Number(c.thevenin_r ?? c.props?.thevenin_r ?? c.theveninR ?? c.props?.theveninR) || 0;
    const theveninX = Number(c.thevenin_x ?? c.props?.thevenin_x ?? c.theveninX ?? c.props?.theveninX) || 0;
    const Zth = Math.hypot(theveninR, theveninX);
    const inertia = Number(c.inertia ?? c.props?.inertia) || 0;
    const speed   = Number(
      c.speed ?? c.props?.synchronous_speed_rpm ?? c.props?.speed
    ) || 1800;
    const baseTorque = hp ? (hp * 746) / (2 * Math.PI * speed / 60) : 0;
    const loadCurve = parseTorqueCurve(
      c.load_torque_curve ?? c.load_torque ?? c.props?.load_torque_curve ?? c.props?.load_torque
    );
    const profile = getStarterProfile(c);

    if (profile.type === 'vfd') {
      const limitedI = Ifl * profile.vfdCurrentLimitPu;
      const Vdrop = limitedI * Zth;
      results[c.id] = {
        inrushKA: Number((limitedI / 1000).toFixed(2)),
        voltageSagPct: Number(((Vdrop / V) * 100).toFixed(2)),
        accelTime: Number(profile.rampTimeSec.toFixed(2)),
        starterType: 'vfd',
      };
      return;
    }

    let w = 0;
    const wSync = 2 * Math.PI * speed / 60;
    const dt   = 0.01;
    let time   = 0;
    let maxDrop = 0;

    while (w < wSync && time < 60) {
      const slip = Math.max(1 - w / wSync, 0.001);
      let effectiveIlr;
      if (profile.type === 'soft_starter') {
        const rampFrac = Math.min(time / profile.rampTimeSec, 1.0);
        const vRamp = profile.initialVoltagePu + (1.0 - profile.initialVoltagePu) * rampFrac;
        // Induction-motor starting current is approximately proportional to
        // applied voltage. Starting torque is the quantity that scales with V².
        effectiveIlr = Ilr * vRamp;
      } else if (profile.type === 'wye_delta') {
        effectiveIlr = time < profile.wyeDeltaSwitchTimeSec ? Ilr / 3 : Ilr;
      } else if (profile.type === 'autotransformer') {
        const tap = profile.autotransformerTap;
        effectiveIlr = Ilr * tap * tap;
      } else {
        effectiveIlr = Ilr;
      }

      let I = effectiveIlr * slip;
      let Vdrop = I * Zth;
      let Vterm = V - Vdrop;
      I = effectiveIlr * slip * (Vterm / V);
      Vdrop = I * Zth;
      Vterm = V - Vdrop;
      const Tm = baseTorque * (Vterm / V) * (Vterm / V) * slip;
      const Tl = baseTorque * loadCurve(w / wSync);
      const accel = inertia ? (Tm - Tl) / inertia : 0;
      w += accel * dt;
      time += dt;
      if (Vdrop > maxDrop) maxDrop = Vdrop;
      if (slip < 0.01) break;
    }

    results[c.id] = {
      inrushKA: Number((Ilr / 1000).toFixed(2)),
      voltageSagPct: Number(((maxDrop / V) * 100).toFixed(2)),
      accelTime: Number(time.toFixed(2)),
      starterType: profile.type,
    };
  });
  return results;
}
