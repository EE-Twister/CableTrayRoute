const d3 = globalThis.d3;
import { getOneLine, getStudies, setStudies } from '../dataStore.mjs';
import {
  MOTOR_START_STUDY_CASE_VERSION,
  buildMotorStartEquipmentRows,
  buildMotorStartSequenceEvents,
  runMotorStartStudyCase,
  buildMotorStartStudyPackage,
  renderMotorStartStudyHTML,
} from './motorStartStudyCase.mjs';

function parseNum(val) {
  if (typeof val === 'number') return val;
  const m = String(val || '').match(/([0-9.]+)/);
  return m ? Number(m[1]) : 0;
}

// Parse load torque curve formatted as "speedPct:torquePct" pairs
function parseTorqueCurve(spec) {
  if (!spec) return () => 0;
  const pts = [];
  if (Array.isArray(spec)) {
    spec.forEach(p => {
      const [s, t] = p.split(':');
      pts.push({ s: Number(s), t: Number(t) });
    });
  } else if (typeof spec === 'string') {
    spec.split(/[\,\s]+/).forEach(p => {
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
 *   'dol'             – Direct-on-line (default): full locked-rotor current
 *   'vfd'             – Variable-frequency drive: current capped at vfd_current_limit_pu × Ifl
 *   'soft_starter'    – Reduced-voltage ramp from initial_voltage_pu to 1.0 over ramp_time_s
 *   'wye_delta'       – Wye-phase inrush = Ilr/3 for first wye_delta_switch_time_s seconds
 *   'autotransformer' – Inrush reduced by autotransformer_tap²
 *
 * @param {Object} c - Component object from the one-line diagram
 * @returns {{ type: string, vfdCurrentLimitPu: number, initialVoltagePu: number,
 *             rampTimeSec: number, wyeDeltaSwitchTimeSec: number, autotransformerTap: number }}
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
 * Motors may define inrushMultiple, thevenin_r, thevenin_x, inertia, load_torque,
 * and starter_type ('dol'|'vfd'|'soft_starter'|'wye_delta'|'autotransformer').
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
    const type = typeof c.type === 'string' ? c.type.toLowerCase() : '';
    const isMotor = subtype === 'motor_load'
      || type === 'motor_load'
      || subtype === 'motor'
      || type === 'motor'
      || !!c.motor;
    if (!isMotor) return;
    const hp = parseNum(c.rating || c.hp || c.props?.hp);
    const volts = c.voltage ?? c.volts ?? c.props?.voltage ?? c.props?.volts;
    const V = Number(volts) || 480;
    const pfRaw = Number(c.pf ?? c.power_factor ?? c.props?.pf ?? c.props?.power_factor);
    const pf = pfRaw > 1 ? pfRaw / 100 : (pfRaw || 0.9);
    const effRaw = Number(c.efficiency ?? c.eff ?? c.props?.efficiency ?? c.props?.eff);
    const eff = effRaw > 1 ? effRaw / 100 : (effRaw || 0.9);
    const multiple = Number(
      c.inrushMultiple
      ?? c.lr_current_pu
      ?? c.props?.inrushMultiple
      ?? c.props?.lr_current_pu
    ) || 6;
    const Ifl = hp * 746 / (Math.sqrt(3) * V * pf * eff || 1);
    const Ilr = Ifl * multiple;
    const theveninR = Number(
      c.thevenin_r
      ?? c.props?.thevenin_r
      ?? c.theveninR
      ?? c.props?.theveninR
    ) || 0;
    const theveninX = Number(
      c.thevenin_x
      ?? c.props?.thevenin_x
      ?? c.theveninX
      ?? c.props?.theveninX
    ) || 0;
    const Zth = Math.hypot(theveninR, theveninX);
    const inertia = Number(c.inertia ?? c.props?.inertia) || 0;
    const speed = Number(c.speed ?? c.props?.speed) || 1800;
    const baseTorque = hp ? (hp * 746) / (2 * Math.PI * speed / 60) : 0;
    const loadCurve = parseTorqueCurve(
      c.load_torque_curve
      ?? c.load_torque
      ?? c.props?.load_torque_curve
      ?? c.props?.load_torque
    );
    const profile = getStarterProfile(c);

    // VFD: drive limits current; voltage sag is negligible; accel follows ramp time
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

    let w = 0; // mechanical speed rad/s
    const wSync = 2 * Math.PI * speed / 60;
    const dt = 0.01;
    let time = 0;
    let maxDrop = 0;
    while (w < wSync && time < 60) {
      const slip = Math.max(1 - w / wSync, 0.001);

      // Effective locked-rotor current depends on starter type
      let effectiveIlr;
      if (profile.type === 'soft_starter') {
        const rampFrac = Math.min(time / profile.rampTimeSec, 1.0);
        const vRamp = profile.initialVoltagePu + (1.0 - profile.initialVoltagePu) * rampFrac;
        effectiveIlr = Ilr * vRamp * vRamp; // current scales as V²
      } else if (profile.type === 'wye_delta') {
        effectiveIlr = time < profile.wyeDeltaSwitchTimeSec ? Ilr / 3 : Ilr;
      } else if (profile.type === 'autotransformer') {
        const tap = profile.autotransformerTap;
        effectiveIlr = Ilr * tap * tap;
      } else {
        effectiveIlr = Ilr; // 'dol' or unrecognised
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
    const sagPct = (maxDrop / V) * 100;
    results[c.id] = {
      inrushKA: Number((Ilr / 1000).toFixed(2)),
      voltageSagPct: Number(sagPct.toFixed(2)),
      accelTime: Number(time.toFixed(2)),
      starterType: profile.type,
    };
  });
  return results;
}

function ensureMotorStartResults() {
  const studies = getStudies();
  if (studies?.motorStart && Object.keys(studies.motorStart).length) {
    return studies.motorStart;
  }
  const res = runMotorStart();
  studies.motorStart = res;
  setStudies(studies);
  return res;
}

function appendWrappedText(selection, text, { x, y, maxWidth, fill = '#444', lineHeight = 18 }) {
  const textEl = selection.append('text')
    .attr('x', x)
    .attr('y', y)
    .attr('text-anchor', 'middle')
    .attr('fill', fill);
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return { element: textEl, lineCount: 0 };
  let line = [];
  let lineNumber = 0;
  let tspan = textEl.append('tspan').attr('x', x).attr('dy', 0);
  words.forEach(word => {
    line.push(word);
    tspan.text(line.join(' '));
    if (tspan.node().getComputedTextLength() > maxWidth && line.length > 1) {
      line.pop();
      tspan.text(line.join(' '));
      line = [word];
      lineNumber += 1;
      tspan = textEl.append('tspan')
        .attr('x', x)
        .attr('dy', `${lineHeight}px`)
        .text(word);
    }
  });
  return { element: textEl, lineCount: lineNumber + 1 };
}

function renderMotorStartChart(svgEl, data) {
  const width = Number(svgEl.getAttribute('width')) || 800;
  const height = Number(svgEl.getAttribute('height')) || 400;
  const margin = { top: 20, right: 20, bottom: 60, left: 70 };
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  if (!data.length) {
    const messages = [
      { text: 'No motors with starting data found in the active project.', fill: '#666' },
      { text: 'Add a motor starting curve by editing a motor on the One-Line and entering the inrush multiple, Thevenin impedance, inertia, and load torque curve points on the Motor Start tab.' }
    ];
    const maxWidth = Math.max(120, width - margin.left - margin.right);
    let currentY = height / 2 - ((messages.length - 1) * 24);
    messages.forEach(msg => {
      const { lineCount } = appendWrappedText(svg, msg.text, {
        x: width / 2,
        y: currentY,
        maxWidth,
        fill: msg.fill || '#444'
      });
      currentY += lineCount * 18 + 8;
    });
    return;
  }

  const x = d3.scaleBand().domain(data.map(d => d.id)).range([margin.left, width - margin.right]).padding(0.15);
  const yMax = d3.max(data, d => d.sag) || 1;
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([height - margin.bottom, margin.top]);

  svg.append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
    .attr('transform', 'rotate(-35)')
    .style('text-anchor', 'end');

  svg.append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickFormat(d => `${d}%`));

  svg.append('text')
    .attr('x', margin.left + (width - margin.left - margin.right) / 2)
    .attr('y', height - 10)
    .attr('text-anchor', 'middle')
    .attr('fill', '#333')
    .text('Motor ID');

  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -(margin.top + (height - margin.top - margin.bottom) / 2))
    .attr('y', 20)
    .attr('text-anchor', 'middle')
    .attr('fill', '#333')
    .text('Voltage Sag (%)');

  svg.append('g').selectAll('rect').data(data).enter().append('rect')
    .attr('x', d => x(d.id))
    .attr('y', d => y(d.sag))
    .attr('width', x.bandwidth())
    .attr('height', d => y(0) - y(d.sag))
    .attr('fill', 'steelblue');
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadText(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function chartDataFromMotorStart(value = {}) {
  if (value?.version === MOTOR_START_STUDY_CASE_VERSION) {
    return (value.worstCaseRows || []).map(row => ({
      id: row.motorTag || row.motorId,
      sag: row.voltageSagPct || 0,
    }));
  }
  return Object.entries(value || {})
    .filter(([, row]) => row && typeof row === 'object')
    .map(([id, row]) => ({ id, sag: row.voltageSagPct || 0 }));
}

function buildInitialMotorStartPackage() {
  const oneLine = getOneLine();
  const saved = getStudies().motorStart;
  if (saved?.version === MOTOR_START_STUDY_CASE_VERSION) return saved;
  const motorRows = buildMotorStartEquipmentRows({ oneLine });
  if (saved && Object.keys(saved).length) {
    return buildMotorStartStudyPackage({
      projectName: 'Untitled Project',
      motorRows,
      sequenceEvents: buildMotorStartSequenceEvents(motorRows),
      results: saved,
    });
  }
  const sequenceEvents = buildMotorStartSequenceEvents(motorRows);
  const results = runMotorStartStudyCase({ oneLine, motorRows, sequenceEvents });
  return buildMotorStartStudyPackage({
    projectName: 'Untitled Project',
    studyCase: results.studyCase,
    motorRows: results.motorRows,
    sequenceEvents: results.sequenceEvents,
    results,
  });
}

function renderSelect(value, options) {
  return options.map(option => `<option value="${escapeHtml(option)}"${option === value ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('');
}

function renderMotorStartWorkspace(container, pkg, chartEl) {
  const studyCase = pkg.studyCase || {};
  const voltageLimits = studyCase.voltageLimits || {};
  const controls = studyCase.includeControls || {};
  const motorRows = pkg.motorRows || [];
  const events = pkg.sequenceEvents || [];
  const worstRows = pkg.worstCaseRows || [];
  container.innerHTML = `
    <div class="button-row" style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
      <button id="motorstart-run-btn" class="btn" type="button">Run Study Case</button>
      <button id="motorstart-save-btn" class="btn" type="button">Save Study</button>
      <button id="motorstart-add-event-btn" class="btn" type="button">Add Event</button>
      <button id="motorstart-json-btn" class="btn" type="button">Export JSON</button>
      <button id="motorstart-html-btn" class="btn" type="button">Printable HTML</button>
      <span id="motorstart-status" class="muted" role="status"></span>
    </div>
    <div class="grid two-col">
      <label>Source Basis
        <select id="motorstart-source-basis">${renderSelect(studyCase.sourceBasis || 'oneLine', ['oneLine', 'default', 'manual', 'savedLoadFlow'])}</select>
      </label>
      <label>Source Condition
        <select id="motorstart-source-condition">${renderSelect(studyCase.sourceCondition || 'utility', ['utility', 'generator', 'weakGrid', 'emergency'])}</select>
      </label>
      <label>Manual Source Z (ohm)
        <input id="motorstart-source-z" type="number" step="0.001" value="${escapeHtml(studyCase.manualSourceImpedanceOhm ?? 0.025)}">
      </label>
      <label>Start Min Voltage (pu)
        <input id="motorstart-start-min" type="number" step="0.01" value="${escapeHtml(voltageLimits.startMinPu ?? 0.8)}">
      </label>
      <label>Max Acceleration (s)
        <input id="motorstart-max-accel" type="number" step="0.1" value="${escapeHtml(studyCase.maxAccelerationSec ?? 20)}">
      </label>
      <label>Duration / Timestep (s)
        <span style="display:flex;gap:0.5rem;"><input id="motorstart-duration" type="number" step="0.5" value="${escapeHtml(studyCase.simulationDurationSec ?? 30)}"><input id="motorstart-step" type="number" step="0.05" value="${escapeHtml(studyCase.timeStepSec ?? 0.25)}"></span>
      </label>
      <label>Report Preset
        <select id="motorstart-report-preset">${renderSelect(studyCase.reportPreset || 'summary', ['summary', 'sequence', 'fullStudy'])}</select>
      </label>
      <label>Screening Controls
        <span style="display:flex;gap:0.75rem;flex-wrap:wrap;">
          <label><input id="motorstart-capacitors" type="checkbox"${controls.capacitors ? ' checked' : ''}> Capacitors</label>
          <label><input id="motorstart-avr" type="checkbox"${controls.generatorAvr !== false ? ' checked' : ''}> Generator AVR</label>
          <label><input id="motorstart-taps" type="checkbox"${controls.transformerTaps ? ' checked' : ''}> Taps</label>
          <label><input id="motorstart-regulators" type="checkbox"${controls.regulators ? ' checked' : ''}> Regulators</label>
        </span>
      </label>
    </div>
    <h3>Motor Rows</h3>
    <div class="table-scroll">
      <table class="data-table compact" id="motorstart-motor-table">
        <thead><tr><th>Use</th><th>ID</th><th>Tag</th><th>Bus</th><th>HP</th><th>V</th><th>Starter</th><th>LRA x</th><th>Current Limit</th><th>Ramp</th><th>Inertia</th><th>Load Curve</th><th>Motor Curve</th><th>Notes</th></tr></thead>
        <tbody>${motorRows.map((row, index) => `<tr data-index="${index}">
          <td><input data-field="enabled" type="checkbox"${row.enabled !== false ? ' checked' : ''}></td>
          <td><input data-field="id" value="${escapeHtml(row.id)}"></td>
          <td><input data-field="tag" value="${escapeHtml(row.tag)}"></td>
          <td><input data-field="busId" value="${escapeHtml(row.busId)}"></td>
          <td><input data-field="hp" type="number" step="1" value="${escapeHtml(row.hp)}"></td>
          <td><input data-field="voltageV" type="number" step="1" value="${escapeHtml(row.voltageV)}"></td>
          <td><select data-field="starterType">${renderSelect(row.starterType || 'dol', ['dol', 'vfd', 'soft_starter', 'wye_delta', 'autotransformer'])}</select></td>
          <td><input data-field="lockedRotorMultiplier" type="number" step="0.1" value="${escapeHtml(row.lockedRotorMultiplier)}"></td>
          <td><input data-field="currentLimitPu" type="number" step="0.1" value="${escapeHtml(row.currentLimitPu)}"></td>
          <td><input data-field="rampTimeSec" type="number" step="0.5" value="${escapeHtml(row.rampTimeSec)}"></td>
          <td><input data-field="inertiaLbFt2" type="number" step="0.1" value="${escapeHtml(row.inertiaLbFt2)}"></td>
          <td><input data-field="loadTorqueCurve" value="${escapeHtml(row.loadTorqueCurve)}"></td>
          <td><input data-field="motorTorqueCurve" value="${escapeHtml(row.motorTorqueCurve)}"></td>
          <td><input data-field="notes" value="${escapeHtml(row.notes)}"></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    <h3>Sequence Events</h3>
    <div class="table-scroll">
      <table class="data-table compact" id="motorstart-event-table">
        <thead><tr><th>Time</th><th>Action</th><th>Motor ID</th><th>Starter Override</th><th>Load Step %</th><th>Capacitors</th><th>Notes</th></tr></thead>
        <tbody>${events.map((event, index) => `<tr data-index="${index}">
          <td><input data-field="timeSec" type="number" step="0.25" value="${escapeHtml(event.timeSec)}"></td>
          <td><select data-field="action">${renderSelect(event.action || 'start', ['start', 'stop', 'loadStep', 'starterTransition'])}</select></td>
          <td><input data-field="motorId" value="${escapeHtml(event.motorId)}"></td>
          <td><select data-field="starterOverride"><option value=""></option>${renderSelect(event.starterOverride || '', ['dol', 'vfd', 'soft_starter', 'wye_delta', 'autotransformer'])}</select></td>
          <td><input data-field="loadStepPct" type="number" step="1" value="${escapeHtml(event.loadStepPct)}"></td>
          <td><input data-field="capacitors" type="checkbox"${event.compensationState?.capacitors ? ' checked' : ''}></td>
          <td><input data-field="notes" value="${escapeHtml(event.notes)}"></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    <h3>Worst Case Summary</h3>
    <div class="table-scroll">
      <table class="data-table compact">
        <thead><tr><th>Motor</th><th>Starter</th><th>Start</th><th>Inrush kA</th><th>Max kA</th><th>Min V pu</th><th>Sag %</th><th>Accel s</th><th>Status</th><th>Recommendation</th></tr></thead>
        <tbody>${worstRows.length ? worstRows.map(row => `<tr>
          <td>${escapeHtml(row.motorTag || row.motorId)}</td>
          <td>${escapeHtml(row.starterType)}</td>
          <td>${escapeHtml(row.startTimeSec)}</td>
          <td>${escapeHtml(row.inrushKA)}</td>
          <td>${escapeHtml(row.maxStartingCurrentKA)}</td>
          <td>${escapeHtml(row.minVoltagePu)}</td>
          <td>${escapeHtml(row.voltageSagPct)}</td>
          <td>${escapeHtml(row.accelTimeSec)}</td>
          <td>${escapeHtml(row.status)}</td>
          <td>${escapeHtml(row.recommendation)}</td>
        </tr>`).join('') : '<tr><td colspan="10">No motor-start rows. Add motors on the one-line or rerun after importing a project.</td></tr>'}</tbody>
      </table>
    </div>
    <details>
      <summary>Raw Package JSON</summary>
      <pre>${escapeHtml(JSON.stringify(pkg, null, 2))}</pre>
    </details>`;

  let currentPackage = pkg;

  function readStudyCase() {
    return {
      sourceBasis: document.getElementById('motorstart-source-basis').value,
      sourceCondition: document.getElementById('motorstart-source-condition').value,
      manualSourceImpedanceOhm: Number(document.getElementById('motorstart-source-z').value),
      voltageLimits: {
        startMinPu: Number(document.getElementById('motorstart-start-min').value),
      },
      maxAccelerationSec: Number(document.getElementById('motorstart-max-accel').value),
      simulationDurationSec: Number(document.getElementById('motorstart-duration').value),
      timeStepSec: Number(document.getElementById('motorstart-step').value),
      reportPreset: document.getElementById('motorstart-report-preset').value,
      includeControls: {
        capacitors: document.getElementById('motorstart-capacitors').checked,
        generatorAvr: document.getElementById('motorstart-avr').checked,
        transformerTaps: document.getElementById('motorstart-taps').checked,
        regulators: document.getElementById('motorstart-regulators').checked,
      },
    };
  }

  function readMotorRows() {
    return Array.from(container.querySelectorAll('#motorstart-motor-table tbody tr')).map(row => {
      const out = {};
      row.querySelectorAll('[data-field]').forEach(input => {
        const field = input.dataset.field;
        out[field] = input.type === 'checkbox' ? input.checked : input.value;
      });
      return out;
    });
  }

  function readSequenceEvents() {
    return Array.from(container.querySelectorAll('#motorstart-event-table tbody tr')).map((row, index) => {
      const out = { id: `evt-${index + 1}`, order: index + 1, compensationState: {} };
      row.querySelectorAll('[data-field]').forEach(input => {
        const field = input.dataset.field;
        if (field === 'capacitors') out.compensationState.capacitors = input.checked;
        else out[field] = input.type === 'checkbox' ? input.checked : input.value;
      });
      return out;
    });
  }

  function runAndRender(save = false) {
    try {
      const oneLine = getOneLine();
      const results = runMotorStartStudyCase({
        oneLine,
        studyCase: readStudyCase(),
        motorRows: readMotorRows(),
        sequenceEvents: readSequenceEvents(),
      });
      currentPackage = buildMotorStartStudyPackage({
        projectName: 'Untitled Project',
        studyCase: results.studyCase,
        motorRows: results.motorRows,
        sequenceEvents: results.sequenceEvents,
        results,
      });
      if (save) {
        const studies = getStudies();
        studies.motorStart = currentPackage;
        setStudies(studies);
      }
      renderMotorStartChart(chartEl, chartDataFromMotorStart(currentPackage));
      renderMotorStartWorkspace(container, currentPackage, chartEl);
      const status = document.getElementById('motorstart-status');
      if (status) status.textContent = save ? 'Saved motor-start study package.' : 'Study case ran.';
    } catch (err) {
      const status = document.getElementById('motorstart-status');
      if (status) status.textContent = err.message || String(err);
    }
  }

  document.getElementById('motorstart-run-btn')?.addEventListener('click', () => runAndRender(false));
  document.getElementById('motorstart-save-btn')?.addEventListener('click', () => runAndRender(true));
  document.getElementById('motorstart-add-event-btn')?.addEventListener('click', () => {
    const body = container.querySelector('#motorstart-event-table tbody');
    const firstMotor = container.querySelector('#motorstart-motor-table [data-field="id"]')?.value || '';
    const row = document.createElement('tr');
    row.innerHTML = `<td><input data-field="timeSec" type="number" step="0.25" value="0"></td>
      <td><select data-field="action">${renderSelect('start', ['start', 'stop', 'loadStep', 'starterTransition'])}</select></td>
      <td><input data-field="motorId" value="${escapeHtml(firstMotor)}"></td>
      <td><select data-field="starterOverride"><option value=""></option>${renderSelect('', ['dol', 'vfd', 'soft_starter', 'wye_delta', 'autotransformer'])}</select></td>
      <td><input data-field="loadStepPct" type="number" step="1" value="100"></td>
      <td><input data-field="capacitors" type="checkbox"></td>
      <td><input data-field="notes" value=""></td>`;
    body.appendChild(row);
  });
  document.getElementById('motorstart-json-btn')?.addEventListener('click', () => downloadText('motor-start-study-package.json', JSON.stringify(currentPackage, null, 2)));
  document.getElementById('motorstart-html-btn')?.addEventListener('click', () => downloadText('motor-start-study-package.html', `<!doctype html><html><head><meta charset="utf-8"><title>Motor Start Study</title><link rel="stylesheet" href="style.css"></head><body>${renderMotorStartStudyHTML(currentPackage)}</body></html>`, 'text/html'));
}

if (typeof document !== 'undefined') {
  const chartEl = document.getElementById('motorstart-chart');
  if (chartEl) {
    const pkg = buildInitialMotorStartPackage();
    renderMotorStartChart(chartEl, chartDataFromMotorStart(pkg));
    const workspace = document.getElementById('motorstart-study-workspace');
    if (workspace) renderMotorStartWorkspace(workspace, pkg, chartEl);
  }
}
