import {
  runDERInterconnectStudy,
  HARMONIC_CURRENT_LIMITS_PCT,
} from './analysis/derInterconnect.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  initStudyApprovalPanel('derInterconnect');

  const form = document.getElementById('der-study-form');
  form.addEventListener('submit', handleStudySubmit);

  document.getElementById('reset-form-btn').addEventListener('click', () => {
    form.reset();
    document.getElementById('study-results').classList.add('hidden');
  });

  document.getElementById('import-ibr-btn').addEventListener('click', importFromIBR);
  document.getElementById('export-csv-btn').addEventListener('click', exportCSV);

  // Restore saved state
  const saved = getStudies().derInterconnect;
  if (saved) {
    if (saved.inputs) restoreForm(saved.inputs);
    if (saved.result) renderResults(saved.result);
  }
});

// ---------------------------------------------------------------------------
// Form submission
// ---------------------------------------------------------------------------

function handleStudySubmit(e) {
  e.preventDefault();

  const inputs = readInputs();
  if (!inputs) return;

  let result;
  try {
    result = runDERInterconnectStudy({
      pcc_voltage: {
        v_pcc_pu: inputs.v_pcc_pu,
        der_rated_kW: inputs.der_kw,
        der_rated_kVAR: inputs.der_kvar,
        sc_MVA: inputs.sc_mva,
        r_pu: inputs.line_r,
        x_pu: inputs.line_x,
      },
      fault_impact: {
        der_rated_kVA: inputs.der_kva,
        v_ll_kV: inputs.pcc_kv,
        existing_fault_kA: inputs.existing_fault_ka,
        device_interrupting_kA: inputs.device_int_ka,
        k_limit: inputs.k_limit,
      },
      anti_islanding: {
        category: inputs.category_1547,
        trip_time_s: inputs.ai_trip_time,
        monitoring_type: inputs.ai_method,
      },
      ride_through: {
        category: inputs.rt_category,
        v_rt_lo_pu: inputs.v_rt_lo,
        v_rt_hi_pu: inputs.v_rt_hi,
        f_rt_lo_hz: inputs.f_rt_lo,
        f_rt_hi_hz: inputs.f_rt_hi,
        frequency_hz: inputs.freq_hz,
      },
      harmonics: {
        thd_pct: inputs.thd_pct,
        individual_harmonics: inputs.individual_harmonics,
      },
    });
  } catch (err) {
    showModal('Calculation Error', `<p>${escHtml(err.message)}</p>`, 'error');
    return;
  }

  renderResults(result);

  const studies = getStudies();
  studies.derInterconnect = { inputs, result };
  setStudies(studies);
}

// ---------------------------------------------------------------------------
// Read form inputs
// ---------------------------------------------------------------------------

function readInputs() {
  const derKw = parseFloat(document.getElementById('der-kw').value);
  const derKva = parseFloat(document.getElementById('der-kva').value);
  const pccKv = parseFloat(document.getElementById('pcc-kv').value);
  const scMva = parseFloat(document.getElementById('sc-mva').value);
  const deviceIntKa = parseFloat(document.getElementById('device-int-ka').value);
  const existingFaultKa = parseFloat(document.getElementById('existing-fault-ka').value);

  if (!Number.isFinite(derKw) || derKw <= 0) {
    showModal('Input Error', '<p>Rated active power P<sub>rated</sub> must be greater than zero.</p>', 'error');
    return null;
  }
  if (!Number.isFinite(derKva) || derKva <= 0) {
    showModal('Input Error', '<p>Inverter apparent power S<sub>rated</sub> must be greater than zero.</p>', 'error');
    return null;
  }
  if (!Number.isFinite(pccKv) || pccKv <= 0) {
    showModal('Input Error', '<p>PCC line-to-line voltage must be greater than zero.</p>', 'error');
    return null;
  }
  if (!Number.isFinite(scMva) || scMva <= 0) {
    showModal('Input Error', '<p>Short-circuit MVA must be greater than zero.</p>', 'error');
    return null;
  }
  if (!Number.isFinite(deviceIntKa) || deviceIntKa <= 0) {
    showModal('Input Error', '<p>Device interrupting rating must be greater than zero.</p>', 'error');
    return null;
  }
  if (!Number.isFinite(existingFaultKa) || existingFaultKa <= 0) {
    showModal('Input Error', '<p>Existing fault current must be greater than zero.</p>', 'error');
    return null;
  }

  const individualHarmonics = [];
  document.querySelectorAll('.harm-input').forEach(el => {
    const order = parseInt(el.dataset.order, 10);
    const pct = parseFloat(el.value) || 0;
    individualHarmonics.push({ order, pct });
  });

  return {
    der_type: document.getElementById('der-type').value,
    der_label: document.getElementById('der-label').value,
    der_kw: derKw,
    der_kva: derKva,
    der_kvar: parseFloat(document.getElementById('der-kvar').value) || 0,
    category_1547: document.getElementById('der-1547-category').value,
    rt_category: document.getElementById('der-rt-category').value,
    pcc_kv: pccKv,
    v_pcc_pu: parseFloat(document.getElementById('pcc-v-pu').value) || 1.0,
    sc_mva: scMva,
    line_r: parseFloat(document.getElementById('line-r').value) || 0,
    line_x: parseFloat(document.getElementById('line-x').value) || 0,
    device_int_ka: deviceIntKa,
    existing_fault_ka: existingFaultKa,
    k_limit: parseFloat(document.getElementById('k-limit').value) || 1.1,
    freq_hz: parseFloat(document.getElementById('system-freq').value) || 60,
    ai_trip_time: parseFloat(document.getElementById('ai-trip-time').value),
    ai_method: document.getElementById('ai-method').value,
    v_rt_lo: parseFloat(document.getElementById('v-rt-lo').value),
    v_rt_hi: parseFloat(document.getElementById('v-rt-hi').value),
    f_rt_lo: parseFloat(document.getElementById('f-rt-lo').value),
    f_rt_hi: parseFloat(document.getElementById('f-rt-hi').value),
    thd_pct: parseFloat(document.getElementById('harm-thd').value) || 0,
    individual_harmonics: individualHarmonics,
  };
}

// ---------------------------------------------------------------------------
// Render results
// ---------------------------------------------------------------------------

function renderResults(result) {
  const section = document.getElementById('study-results');
  section.classList.remove('hidden');

  // Overall badge
  const badge = document.getElementById('overall-badge');
  if (result.overall_pass) {
    badge.className = 'compliance-badge result-ok';
    badge.textContent = '✓ INTERCONNECTION APPROVED — All criteria pass';
  } else {
    badge.className = 'compliance-badge result-fail';
    badge.textContent = '✗ INTERCONNECTION REJECTED — One or more criteria fail';
  }

  // Summary table
  const tbody = document.getElementById('summary-tbody');
  const rows = [
    {
      name: 'PCC Voltage Impact',
      standard: 'ANSI C84.1-2020',
      limit: 'Range A: 0.95–1.05 pu',
      actual: `${fmt(result.pcc_voltage.v_with_der_pu, 4)} pu (Δ${fmt(result.pcc_voltage.delta_v_pct, 3)}%)`,
      pass: result.pcc_voltage.pass,
    },
    {
      name: 'Fault Current Contribution',
      standard: 'IEEE 1547-2018 §6.4',
      limit: `≤ ${fmt(result.fault_impact.total_fault_kA + (result.fault_impact.interrupting_margin_pct / 100) * (result.fault_impact.total_fault_kA / (1 - result.fault_impact.interrupting_margin_pct / 100)), 1)} kA device rating`,
      actual: `${fmt(result.fault_impact.total_fault_kA, 3)} kA total (margin: ${fmt(result.fault_impact.interrupting_margin_pct, 1)}%)`,
      pass: result.fault_impact.pass,
    },
    {
      name: 'Anti-Islanding',
      standard: 'IEEE 1547-2018 §8.1',
      limit: `≤ ${result.anti_islanding.limit_s} s (Category ${result.anti_islanding.category})`,
      actual: `${fmt(result.anti_islanding.trip_time_s, 2)} s, method: ${result.anti_islanding.monitoring_method_valid ? 'valid' : 'NONE'}`,
      pass: result.anti_islanding.pass,
    },
    {
      name: 'Voltage Ride-Through',
      standard: 'IEEE 1547-2018 Table 3',
      limit: `${result.ride_through.v_requirement.lo}–${result.ride_through.v_requirement.hi} pu (Cat ${result.ride_through.category})`,
      actual: result.ride_through.voltage_rt_pass ? 'Settings compliant' : 'Settings too narrow',
      pass: result.ride_through.voltage_rt_pass,
    },
    {
      name: 'Frequency Ride-Through',
      standard: 'IEEE 1547-2018 Table 5',
      limit: `${result.ride_through.f_requirement.lo}–${result.ride_through.f_requirement.hi} Hz (Cat ${result.ride_through.category})`,
      actual: result.ride_through.freq_rt_pass ? 'Settings compliant' : 'Settings too narrow',
      pass: result.ride_through.freq_rt_pass,
    },
    {
      name: 'Harmonic Compliance (THD)',
      standard: 'IEEE 1547-2018 Table 2',
      limit: '≤ 5.0%',
      actual: `${fmt(result.harmonics.thd_pct, 2)}%`,
      pass: result.harmonics.thd_pass,
    },
  ];

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${escHtml(r.name)}</td>
      <td>${escHtml(r.standard)}</td>
      <td>${escHtml(r.limit)}</td>
      <td>${escHtml(r.actual)}</td>
      <td class="${r.pass ? 'result-ok' : 'result-fail'}">${r.pass ? 'PASS' : 'FAIL'}</td>
    </tr>
  `).join('');

  // Detail cards
  const cards = document.getElementById('detail-cards');
  cards.innerHTML = `
    <div class="result-card ${result.pcc_voltage.rangeA_pass ? '' : 'result-card--warn'}">
      <span class="result-label">V with DER</span>
      <span class="result-value">${fmt(result.pcc_voltage.v_with_der_pu, 4)} pu</span>
    </div>
    <div class="result-card">
      <span class="result-label">Voltage Rise</span>
      <span class="result-value">${fmt(result.pcc_voltage.delta_v_pct, 3)}%</span>
    </div>
    <div class="result-card">
      <span class="result-label">ANSI Range A</span>
      <span class="result-value ${result.pcc_voltage.rangeA_pass ? 'result-ok' : 'result-fail'}">${result.pcc_voltage.rangeA_pass ? 'PASS' : 'FAIL'}</span>
    </div>
    <div class="result-card">
      <span class="result-label">ANSI Range B</span>
      <span class="result-value ${result.pcc_voltage.rangeB_pass ? 'result-ok' : 'result-fail'}">${result.pcc_voltage.rangeB_pass ? 'PASS' : 'FAIL'}</span>
    </div>
    <div class="result-card">
      <span class="result-label">IBR Rated Current</span>
      <span class="result-value">${fmt(result.fault_impact.ibr_rated_A, 1)} A</span>
    </div>
    <div class="result-card">
      <span class="result-label">IBR Fault Current</span>
      <span class="result-value">${fmt(result.fault_impact.ibr_fault_A, 1)} A</span>
    </div>
    <div class="result-card ${result.fault_impact.pass ? '' : 'result-card--warn'}">
      <span class="result-label">Total Fault at PCC</span>
      <span class="result-value">${fmt(result.fault_impact.total_fault_kA, 3)} kA</span>
    </div>
    <div class="result-card">
      <span class="result-label">Interrupting Margin</span>
      <span class="result-value">${fmt(result.fault_impact.interrupting_margin_pct, 1)}%</span>
    </div>
    <div class="result-card ${result.harmonics.thd_pass ? '' : 'result-card--warn'}">
      <span class="result-label">THD</span>
      <span class="result-value">${fmt(result.harmonics.thd_pct, 2)}%</span>
    </div>
    ${result.harmonics.violations.length > 0 ? `
    <div class="result-card result-card--warn">
      <span class="result-label">Harmonic Violations</span>
      <span class="result-value">${result.harmonics.violations.map(v => `${v.order}th: ${v.actual_pct}% > ${v.limit_pct}%`).join('; ')}</span>
    </div>` : ''}
  `;
}

// ---------------------------------------------------------------------------
// Import from IBR study
// ---------------------------------------------------------------------------

function importFromIBR() {
  const ibrStudy = getStudies().ibr;
  if (!ibrStudy) {
    showModal('No IBR Study', '<p>No saved IBR study found. Run the <a href="ibr.html">IBR Modeling</a> study first, then return here to import settings.</p>', 'info');
    return;
  }

  // Pull ride-through category and limits from IBR fault contribution inputs
  const faultInputs = ibrStudy.faultInputs;
  if (faultInputs) {
    if (faultInputs.sRated_kVA) setValue('der-kva', faultInputs.sRated_kVA);
    if (faultInputs.v_ll_kV) setValue('pcc-kv', faultInputs.v_ll_kV);
    if (faultInputs.k_limit) setValue('k-limit', faultInputs.k_limit);
  }

  showModal('IBR Settings Imported', '<p>Inverter rating and fault current settings imported from the saved IBR study. Review and adjust system data fields as needed.</p>', 'success');
}

// ---------------------------------------------------------------------------
// Export CSV
// ---------------------------------------------------------------------------

function exportCSV() {
  const saved = getStudies().derInterconnect;
  if (!saved || !saved.result) {
    showModal('No Results', '<p>Run the study first, then export.</p>', 'info');
    return;
  }

  const r = saved.result;
  const lines = [
    'Criterion,Standard,Limit,Actual,Status',
    `PCC Voltage Impact,ANSI C84.1-2020,"Range A: 0.95-1.05 pu","${r.pcc_voltage.v_with_der_pu} pu (delta ${r.pcc_voltage.delta_v_pct}%)",${r.pcc_voltage.pass ? 'PASS' : 'FAIL'}`,
    `Fault Current,IEEE 1547-2018 §6.4,Device interrupting rating,"${r.fault_impact.total_fault_kA} kA total",${r.fault_impact.pass ? 'PASS' : 'FAIL'}`,
    `Anti-Islanding,IEEE 1547-2018 §8.1,"<= ${r.anti_islanding.limit_s} s","${r.anti_islanding.trip_time_s} s",${r.anti_islanding.pass ? 'PASS' : 'FAIL'}`,
    `Voltage Ride-Through,IEEE 1547-2018 Table 3,"${r.ride_through.v_requirement.lo}-${r.ride_through.v_requirement.hi} pu",${r.ride_through.voltage_rt_pass ? 'Compliant' : 'Non-compliant'},${r.ride_through.voltage_rt_pass ? 'PASS' : 'FAIL'}`,
    `Frequency Ride-Through,IEEE 1547-2018 Table 5,"${r.ride_through.f_requirement.lo}-${r.ride_through.f_requirement.hi} Hz",${r.ride_through.freq_rt_pass ? 'Compliant' : 'Non-compliant'},${r.ride_through.freq_rt_pass ? 'PASS' : 'FAIL'}`,
    `Harmonic THD,IEEE 1547-2018 Table 2,<= 5.0%,"${r.harmonics.thd_pct}%",${r.harmonics.thd_pass ? 'PASS' : 'FAIL'}`,
    `Overall,,,,${r.overall_pass ? 'PASS' : 'FAIL'}`,
  ];

  downloadText(lines.join('\n'), 'der-interconnect-study.csv', 'text/csv');
}

// ---------------------------------------------------------------------------
// Restore form
// ---------------------------------------------------------------------------

function restoreForm(inputs) {
  setValue('der-label', inputs.der_label);
  setSelect('der-type', inputs.der_type);
  setValue('der-kw', inputs.der_kw);
  setValue('der-kva', inputs.der_kva);
  setValue('der-kvar', inputs.der_kvar);
  setSelect('der-1547-category', inputs.category_1547);
  setSelect('der-rt-category', inputs.rt_category);
  setValue('pcc-kv', inputs.pcc_kv);
  setValue('pcc-v-pu', inputs.v_pcc_pu);
  setValue('sc-mva', inputs.sc_mva);
  setValue('line-r', inputs.line_r);
  setValue('line-x', inputs.line_x);
  setValue('device-int-ka', inputs.device_int_ka);
  setValue('existing-fault-ka', inputs.existing_fault_ka);
  setValue('k-limit', inputs.k_limit);
  setSelect('system-freq', inputs.freq_hz);
  setValue('ai-trip-time', inputs.ai_trip_time);
  setSelect('ai-method', inputs.ai_method);
  setValue('v-rt-lo', inputs.v_rt_lo);
  setValue('v-rt-hi', inputs.v_rt_hi);
  setValue('f-rt-lo', inputs.f_rt_lo);
  setValue('f-rt-hi', inputs.f_rt_hi);
  setValue('harm-thd', inputs.thd_pct);
  if (inputs.individual_harmonics) {
    inputs.individual_harmonics.forEach(h => {
      const el = document.querySelector(`.harm-input[data-order="${h.order}"]`);
      if (el) el.value = h.pct;
    });
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function fmt(v, dec = 2) {
  return Number.isFinite(v) ? v.toFixed(dec) : '—';
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined && val !== null) el.value = val;
}

function setSelect(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined) el.value = val;
}

function downloadText(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
