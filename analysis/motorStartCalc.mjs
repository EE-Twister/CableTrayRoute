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
    vfdCurrentLimitPu: Number(c.vfd_current_limit_pu ?? c.props?.vfd_current_limit_pu) || 1.1,
    initialVoltagePu:  Number(c.initial_voltage_pu   ?? c.props?.initial_voltage_pu)   || 0.3,
    rampTimeSec:       Number(c.ramp_time_s           ?? c.props?.ramp_time_s)           || 10,
    wyeDeltaSwitchTimeSec: Number(c.wye_delta_switch_time_s ?? c.props?.wye_delta_switch_time_s) || 5,
    autotransformerTap: Number(c.autotransformer_tap  ?? c.props?.autotransformer_tap)   || 0.65,
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
      || subtype === 'motor' || type === 'motor' || !!c.motor;
    if (!isMotor) return;

    const hp = parseNum(c.rating || c.hp || c.props?.hp);
    const V  = Number(c.voltage ?? c.volts ?? c.props?.voltage ?? c.props?.volts) || 480;
    const pfRaw = Number(c.pf ?? c.power_factor ?? c.props?.pf ?? c.props?.power_factor);
    const pf  = pfRaw > 1 ? pfRaw / 100 : (pfRaw || 0.9);
    const effRaw = Number(c.efficiency ?? c.eff ?? c.props?.efficiency ?? c.props?.eff);
    const eff = effRaw > 1 ? effRaw / 100 : (effRaw || 0.9);
    const multiple = Number(c.inrushMultiple ?? c.lr_current_pu
      ?? c.props?.inrushMultiple ?? c.props?.lr_current_pu) || 6;

    const Ifl = hp * 746 / (Math.sqrt(3) * V * pf * eff || 1);
    const Ilr = Ifl * multiple;
    const theveninR = Number(c.thevenin_r ?? c.props?.thevenin_r ?? c.theveninR ?? c.props?.theveninR) || 0;
    const theveninX = Number(c.thevenin_x ?? c.props?.thevenin_x ?? c.theveninX ?? c.props?.theveninX) || 0;
    const Zth = Math.hypot(theveninR, theveninX);
    const inertia = Number(c.inertia ?? c.props?.inertia) || 0;
    const speed   = Number(c.speed   ?? c.props?.speed)   || 1800;
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
        effectiveIlr = Ilr * vRamp * vRamp;
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
