import { getOneLine, getStudies, setStudies } from '../dataStore.mjs';
import { downloadCSV } from '../reports/reporting.mjs';
import {
  calculateMotorStartCase,
  getStarterProfile,
  isMotorComponent,
  normalizeMotorStartInput,
  runMotorStart,
  validateMotorStartInput
} from './motorStartCalc.mjs';

export {
  calculateMotorStartCase,
  getStarterProfile,
  isMotorComponent,
  normalizeMotorStartInput,
  runMotorStart,
  validateMotorStartInput
};

const STARTER_OPTIONS = [
  ['dol', 'Direct-on-line'],
  ['vfd', 'Variable-frequency drive'],
  ['soft_starter', 'Soft starter'],
  ['wye_delta', 'Wye-delta'],
  ['autotransformer', 'Autotransformer']
];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getComponents() {
  const { sheets = [] } = getOneLine();
  const components = Array.isArray(sheets[0]?.components)
    ? sheets.flatMap(sheet => sheet.components || [])
    : sheets;
  return (Array.isArray(components) ? components : []).filter(isMotorComponent);
}

function valueOrBlank(value) {
  return Number.isFinite(value) && value !== 0 ? value : '';
}

function buildMotorRows(components) {
  return components.map(component => {
    const input = normalizeMotorStartInput(component);
    const pf = input.powerFactor > 0 ? input.powerFactor : 0.9;
    const efficiency = input.efficiency > 0 ? input.efficiency : 0.9;
    const multiple = input.inrushMultiple > 0 ? input.inrushMultiple : 6;
    const setting = input.type === 'vfd'
      ? input.vfdCurrentLimitPu
      : input.type === 'soft_starter'
        ? input.initialVoltagePu
        : input.type === 'autotransformer'
          ? input.autotransformerTap
          : 1;
    const time = input.type === 'wye_delta' ? input.wyeDeltaSwitchTimeSec : input.rampTimeSec;
    const options = STARTER_OPTIONS.map(([value, label]) => (
      `<option value="${value}"${input.type === value ? ' selected' : ''}>${label}</option>`
    )).join('');
    return `<tr data-id="${escapeHtml(component.id)}">
      <td><input class="motor-selected" type="checkbox" checked aria-label="Include ${escapeHtml(input.label)}"></td>
      <td><strong>${escapeHtml(input.label)}</strong><br><small>${escapeHtml(component.id)}</small></td>
      <td><input class="motor-hp" type="number" min="0.1" step="0.1" value="${escapeHtml(valueOrBlank(input.hp))}" aria-label="Horsepower for ${escapeHtml(input.label)}"></td>
      <td><input class="motor-volts" type="number" min="1" step="1" value="${escapeHtml(valueOrBlank(input.volts))}" aria-label="Voltage for ${escapeHtml(input.label)}"></td>
      <td><input class="motor-pf" type="number" min="0.01" max="1" step="0.01" value="${escapeHtml(pf)}" aria-label="Power factor for ${escapeHtml(input.label)}"></td>
      <td><input class="motor-eff" type="number" min="0.01" max="1" step="0.01" value="${escapeHtml(efficiency)}" aria-label="Efficiency for ${escapeHtml(input.label)}"></td>
      <td><input class="motor-inrush" type="number" min="0.1" step="0.1" value="${escapeHtml(multiple)}" aria-label="Locked rotor current multiple for ${escapeHtml(input.label)}"></td>
      <td><input class="motor-r" type="number" min="0" step="0.001" value="${escapeHtml(valueOrBlank(input.theveninR))}" aria-label="Thevenin resistance for ${escapeHtml(input.label)}"></td>
      <td><input class="motor-x" type="number" min="0" step="0.001" value="${escapeHtml(valueOrBlank(input.theveninX))}" aria-label="Thevenin reactance for ${escapeHtml(input.label)}"></td>
      <td><input class="motor-inertia" type="number" min="0" step="0.01" value="${escapeHtml(valueOrBlank(input.inertia))}" aria-label="Combined inertia for ${escapeHtml(input.label)}"></td>
      <td><select class="motor-starter" aria-label="Starting method for ${escapeHtml(input.label)}">${options}</select></td>
      <td><input class="motor-setting" type="number" min="0.01" step="0.01" value="${escapeHtml(setting)}" aria-label="Starter setting for ${escapeHtml(input.label)}"></td>
      <td><input class="motor-time" type="number" min="0.1" step="0.1" value="${escapeHtml(time)}" aria-label="Starter time for ${escapeHtml(input.label)}"></td>
    </tr>`;
  }).join('');
}

function readNumber(row, selector) {
  return Number(row.querySelector(selector)?.value);
}

function readMotorInput(row, source) {
  const starterType = row.querySelector('.motor-starter').value;
  const setting = readNumber(row, '.motor-setting');
  const time = readNumber(row, '.motor-time');
  return normalizeMotorStartInput(source, {
    hp: readNumber(row, '.motor-hp'),
    voltage: readNumber(row, '.motor-volts'),
    pf: readNumber(row, '.motor-pf'),
    efficiency: readNumber(row, '.motor-eff'),
    inrushMultiple: readNumber(row, '.motor-inrush'),
    thevenin_r: readNumber(row, '.motor-r'),
    thevenin_x: readNumber(row, '.motor-x'),
    inertia: readNumber(row, '.motor-inertia'),
    starter_type: starterType,
    vfd_current_limit_pu: setting,
    initial_voltage_pu: setting,
    autotransformer_tap: setting,
    ramp_time_s: time,
    wye_delta_switch_time_s: time
  });
}

function renderChart(svgElement, results, maxSag) {
  const d3 = globalThis.d3;
  if (!d3 || !svgElement) return;
  const svg = d3.select(svgElement);
  svg.selectAll('*').remove();
  if (!results.length) return;

  const width = Number(svgElement.getAttribute('width')) || 800;
  const height = Number(svgElement.getAttribute('height')) || 360;
  const margin = { top: 25, right: 25, bottom: 75, left: 65 };
  const x = d3.scaleBand()
    .domain(results.map(result => result.label))
    .range([margin.left, width - margin.right])
    .padding(0.2);
  const yMaximum = Math.max(maxSag, d3.max(results, result => result.voltageSagPct) || 0) * 1.15;
  const y = d3.scaleLinear().domain([0, yMaximum || 1]).nice().range([height - margin.bottom, margin.top]);

  svg.append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
    .attr('transform', 'rotate(-30)')
    .style('text-anchor', 'end');
  svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y).tickFormat(value => `${value}%`));
  svg.append('line')
    .attr('x1', margin.left)
    .attr('x2', width - margin.right)
    .attr('y1', y(maxSag))
    .attr('y2', y(maxSag))
    .attr('stroke', '#b42318')
    .attr('stroke-dasharray', '6 4');
  svg.append('text')
    .attr('x', width - margin.right)
    .attr('y', y(maxSag) - 6)
    .attr('text-anchor', 'end')
    .attr('fill', '#b42318')
    .text(`Limit ${maxSag}%`);
  svg.selectAll('rect')
    .data(results)
    .enter()
    .append('rect')
    .attr('x', result => x(result.label))
    .attr('y', result => y(result.voltageSagPct))
    .attr('width', x.bandwidth())
    .attr('height', result => y(0) - y(result.voltageSagPct))
    .attr('fill', result => result.checks.voltageSag ? '#198754' : '#b42318');
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const loadBtn = document.getElementById('load-motors-btn');
    const runBtn = document.getElementById('run-motors-btn');
    const exportBtn = document.getElementById('export-motors-btn');
    const inputs = document.getElementById('motor-inputs');
    const readiness = document.getElementById('motorstart-readiness');
    const resultsElement = document.getElementById('motorstart-results');
    const chart = document.getElementById('motorstart-chart');
    let sourceById = new Map();
    let lastStudy = null;

    loadBtn?.addEventListener('click', () => {
      const motors = getComponents();
      sourceById = new Map(motors.map(motor => [motor.id, motor]));
      lastStudy = null;
      exportBtn.disabled = true;
      if (!motors.length) {
        inputs.innerHTML = '<p class="result-fail">No motors were found. Add a motor to the One-Line Diagram first.</p>';
        readiness.innerHTML = '<div class="result-card result-warn"><strong>No study inputs available.</strong></div>';
        runBtn.disabled = true;
        return;
      }
      inputs.innerHTML = `<div class="table-scroll"><table class="data-table motor-start-input-table">
        <thead><tr><th>Use</th><th>Motor</th><th>HP</th><th>V</th><th>PF</th><th>Eff.</th><th>LRC × FLA</th><th>Rth (Ω)</th><th>Xth (Ω)</th><th>Inertia</th><th>Method</th><th>Setting (pu)</th><th>Time (s)</th></tr></thead>
        <tbody>${buildMotorRows(motors)}</tbody>
      </table></div>
      <p class="field-hint">Defaults of 0.90 power factor, 0.90 efficiency, and 6× locked-rotor current are screening assumptions. Enter project-specific values where available. Starter setting means current limit for VFD, initial voltage for soft starter, or tap for autotransformer.</p>`;
      readiness.innerHTML = `<div class="result-card result-warn"><strong>${motors.length} motor${motors.length === 1 ? '' : 's'} loaded.</strong><p>Complete Thevenin impedance and combined inertia, then run the selected motors.</p></div>`;
      runBtn.disabled = false;
    });

    runBtn?.addEventListener('click', () => {
      const rows = [...inputs.querySelectorAll('tbody tr')].filter(row => row.querySelector('.motor-selected')?.checked);
      if (!rows.length) {
        readiness.innerHTML = '<div class="result-card result-warn"><strong>Select at least one motor.</strong></div>';
        return;
      }
      const criteria = {
        maxVoltageSagPct: Number(document.getElementById('max-sag-pct').value) || 15,
        maxAccelerationTimeSec: Number(document.getElementById('max-accel-sec').value) || 10
      };
      const cases = rows.map(row => readMotorInput(row, sourceById.get(row.dataset.id)));
      const invalid = cases.map(input => ({ input, validation: validateMotorStartInput(input) })).filter(item => !item.validation.ready);
      if (invalid.length) {
        readiness.innerHTML = `<div class="result-card result-warn"><h3>Input review required</h3><ul>${invalid.map(item => `<li><strong>${escapeHtml(item.input.label)}</strong>: add ${escapeHtml(item.validation.errors.join(', '))}</li>`).join('')}</ul><p><strong>No result was saved.</strong></p></div>`;
        resultsElement.innerHTML = '<p class="field-hint">Complete the required inputs to run this study.</p>';
        exportBtn.disabled = true;
        renderChart(chart, [], criteria.maxVoltageSagPct);
        return;
      }

      const results = cases.map(input => calculateMotorStartCase(input, criteria));
      lastStudy = { runAt: new Date().toISOString(), method: 'Thevenin screening', criteria, results };
      const studies = getStudies();
      studies.motorStart = lastStudy;
      setStudies(studies);
      const passes = results.filter(result => result.status === 'pass').length;
      readiness.innerHTML = `<div class="result-card ${passes === results.length ? 'result-ok' : 'result-warn'}"><strong>${passes} of ${results.length} motors meet both screening criteria.</strong><p>Result saved to this project.</p></div>`;
      resultsElement.innerHTML = `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>Motor</th><th>Method</th><th>FLA (A)</th><th>Start (kA)</th><th>Sag</th><th>Acceleration</th><th>Status</th></tr></thead>
        <tbody>${results.map(result => `<tr class="${result.status === 'pass' ? 'result-ok' : 'result-warn'}"><td>${escapeHtml(result.label)}</td><td>${escapeHtml(result.starterType.replace(/_/g, ' '))}</td><td>${result.fullLoadAmps.toFixed(1)}</td><td>${result.inrushKA.toFixed(3)}</td><td>${result.voltageSagPct.toFixed(2)}% ${result.checks.voltageSag ? '✓' : 'Review'}</td><td>${result.accelTime.toFixed(2)} s ${result.checks.accelerationTime ? '✓' : 'Review'}</td><td><strong>${result.status === 'pass' ? 'Pass' : 'Review'}</strong></td></tr>`).join('')}</tbody>
      </table></div>`;
      renderChart(chart, results, criteria.maxVoltageSagPct);
      exportBtn.disabled = false;
    });

    exportBtn?.addEventListener('click', () => {
      if (!lastStudy) return;
      const headers = ['motor', 'starter', 'fullLoadAmps', 'startingKA', 'voltageSagPct', 'accelerationTimeSec', 'status'];
      const rows = lastStudy.results.map(result => ({
        motor: result.label,
        starter: result.starterType,
        fullLoadAmps: result.fullLoadAmps,
        startingKA: result.inrushKA,
        voltageSagPct: result.voltageSagPct,
        accelerationTimeSec: result.accelTime,
        status: result.status
      }));
      downloadCSV(headers, rows, 'motor-start-results.csv');
    });
  });
}
