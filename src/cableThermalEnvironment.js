/**
 * Cable Thermal Environment — Page orchestration (Gap #75)
 *
 * Reads form inputs, runs the unified-thermal-environment analysis, and
 * renders KPI strip, installation comparison table, per-installation
 * derating waterfalls, and the optional load-profile timeline.
 */
import '../site.js';

import {
  runThermalEnvironment,
  INSTALLATION_KEYS,
} from '../analysis/cableThermalEnvironment.mjs';
import { getStudies, setStudies } from '../dataStore.mjs';
import { initStudyBasisPanel } from './components/studyBasis.js';
import { initStudyApprovalPanel } from './components/studyApproval.js';

const STUDY_KEY = 'cableThermalEnvironment';

const PROFILE_PRESETS = {
  flat:        Array.from({ length: 24 }, () => 1.0),
  'daily-peak':[0.5,0.5,0.5,0.5,0.5,0.5,0.6,0.7,0.9,1.0,1.0,1.0,1.0,1.0,1.0,0.9,0.8,0.8,0.7,0.6,0.6,0.5,0.5,0.5],
  industrial:  [0.4,0.4,0.4,0.4,0.5,0.6,0.8,1.0,1.0,1.0,1.0,0.9,0.7,0.9,1.0,1.0,1.0,0.9,0.7,0.6,0.5,0.5,0.4,0.4],
};

document.addEventListener('DOMContentLoaded', () => {
  if (typeof globalThis.initSettings === 'function')   globalThis.initSettings();
  if (typeof globalThis.initDarkMode === 'function')   globalThis.initDarkMode();
  if (typeof globalThis.initCompactMode === 'function') globalThis.initCompactMode();
  if (typeof globalThis.initNavToggle === 'function')  globalThis.initNavToggle();

  initStudyBasisPanel(STUDY_KEY, {
    standard: 'IEC 60287-1-1:2023 + NEC 310 (composite)',
    clause: '§3 Current rating; NEC 310.15(B)(1)(a) ambient; NEC 392.80(A) tray fill',
    formulas: [
      'I = sqrt{ [Δθ − W_d(0.5·T1 + n(T2+T3+T4))] / [R_ac(T1 + n(1+λ1)·T2 + n(1+λ1+λ2)(T3+T4))] }',
      'I_derated = I_base × f_ambient × f_grouping × f_installation',
    ],
    assumptions: [
      'Steady-state thermal equilibrium (single operating point).',
      'IEC 60287-2-1 grouping factors applied per cable count.',
      'Identical cables in any group; symmetric duct-bank geometry.',
      'Single-layer tray; touching trefoil for >3-core groups.',
    ],
    limitations: [
      'No transient overload analysis beyond first-order RC screening.',
      'Soil thermal resistivity static (no moisture or drying).',
      'No mutual heating between adjacent duct banks.',
      'Sheath bonding fixed at single-point (λ1=0).',
      'Full IEC 60853 cyclic ratings out of scope.',
    ],
    benchmarkId: 'cable-thermal-env-unified',
  }, 'study-basis-container');

  initStudyApprovalPanel(STUDY_KEY, 'study-approval-container');

  const runBtn        = document.getElementById('ctenv-run-btn');
  const exportBtn     = document.getElementById('ctenv-export-csv-btn');
  const resetBtn      = document.getElementById('ctenv-reset-btn');
  const presetSelect  = document.getElementById('ct-profile-preset');

  let lastStudy = null;

  // Hydrate from saved study if present
  const existing = (getStudies() || {})[STUDY_KEY];
  if (existing && existing.inputs) {
    hydrateForm(existing.inputs);
    lastStudy = existing;
    renderAll(existing);
  }

  runBtn.addEventListener('click', () => {
    try {
      const rawInputs = readForm();
      const study = runThermalEnvironment(rawInputs);
      lastStudy = study;
      const studies = getStudies() || {};
      studies[STUDY_KEY] = study;
      setStudies(studies);
      renderAll(study);
    } catch (err) {
      alert(`Cable Thermal Environment error: ${err.message}`);
    }
  });

  exportBtn.addEventListener('click', () => {
    if (!lastStudy) return;
    downloadCsv(lastStudy);
  });

  resetBtn.addEventListener('click', () => {
    document.getElementById('ctenv-form').reset();
  });

  presetSelect.addEventListener('change', () => {
    const preset = PROFILE_PRESETS[presetSelect.value];
    if (preset) {
      document.getElementById('ct-profile-hourly').value = preset.join(',');
      document.getElementById('ct-profile-basis').value = 'per-unit';
    }
  });
});

// ---------------------------------------------------------------------------
// Form ↔ inputs
// ---------------------------------------------------------------------------

function readForm() {
  const hourlyRaw = (document.getElementById('ct-profile-hourly').value || '').trim();
  const hourly = hourlyRaw
    ? hourlyRaw.split(/[,\s]+/).map(v => Number(v)).filter(v => !Number.isNaN(v))
    : null;

  return {
    cable: {
      sizeMm2:      Number(document.getElementById('ct-size').value),
      material:     document.getElementById('ct-material').value,
      insulation:   document.getElementById('ct-insulation').value,
      nCores:       Number(document.getElementById('ct-cores').value),
      voltageClass: document.getElementById('ct-voltageclass').value,
    },
    ambient: {
      tempC:       Number(document.getElementById('ct-ambient-air').value),
      soilTempC:   Number(document.getElementById('ct-ambient-soil').value),
      frequencyHz: Number(document.getElementById('ct-frequency').value),
    },
    grouping: {
      nCables:     Number(document.getElementById('ct-ncables').value),
      arrangement: document.getElementById('ct-arrangement').value,
    },
    installations: {
      tray:            { included: document.getElementById('ct-inst-tray').checked },
      conduit:         {
        included:       document.getElementById('ct-inst-conduit').checked,
        conduitOD_mm:   Number(document.getElementById('ct-conduit-od').value),
        burialDepthMm:  Number(document.getElementById('ct-burial-depth').value),
      },
      'duct-bank':     {
        included:       document.getElementById('ct-inst-duct').checked,
        ductCount:      Number(document.getElementById('ct-duct-count').value),
        spacingMm:      Number(document.getElementById('ct-duct-spacing').value),
        conduitOD_mm:   Number(document.getElementById('ct-conduit-od').value),
        burialDepthMm:  Number(document.getElementById('ct-burial-depth').value),
      },
      'direct-burial': {
        included:        document.getElementById('ct-inst-burial').checked,
        burialDepthMm:   Number(document.getElementById('ct-burial-depth').value),
        soilResistivity: Number(document.getElementById('ct-soil-rho').value),
      },
    },
    loadProfile: hourly && hourly.length > 0 ? {
      hourly,
      basis:    document.getElementById('ct-profile-basis').value,
      peakAmps: Number(document.getElementById('ct-profile-peak').value) || null,
    } : null,
    designCurrentA: Number(document.getElementById('ct-design-current').value) || null,
  };
}

function hydrateForm(norm) {
  const set = (id, v) => { const el = document.getElementById(id); if (el != null && v != null) el.value = v; };
  const check = (id, v) => { const el = document.getElementById(id); if (el != null) el.checked = !!v; };
  set('ct-size',          norm.cable?.sizeMm2);
  set('ct-material',      norm.cable?.material);
  set('ct-insulation',    norm.cable?.insulation);
  set('ct-cores',         norm.cable?.nCores);
  set('ct-voltageclass',  norm.cable?.voltageClass);
  set('ct-ambient-air',   norm.ambient?.tempC);
  set('ct-ambient-soil',  norm.ambient?.soilTempC);
  set('ct-frequency',     norm.ambient?.frequencyHz);
  set('ct-ncables',       norm.grouping?.nCables);
  set('ct-arrangement',   norm.grouping?.arrangement);
  set('ct-design-current', norm.designCurrentA);
  check('ct-inst-tray',    norm.installations?.tray?.included);
  check('ct-inst-conduit', norm.installations?.conduit?.included);
  check('ct-inst-duct',    norm.installations?.['duct-bank']?.included);
  check('ct-inst-burial',  norm.installations?.['direct-burial']?.included);
  set('ct-soil-rho',       norm.installations?.['direct-burial']?.soilResistivity);
  set('ct-burial-depth',   norm.installations?.['direct-burial']?.burialDepthMm);
  set('ct-conduit-od',     norm.installations?.conduit?.conduitOD_mm);
  set('ct-duct-count',     norm.installations?.['duct-bank']?.ductCount);
  set('ct-duct-spacing',   norm.installations?.['duct-bank']?.spacingMm);
  if (norm.loadProfile?.hourly) {
    set('ct-profile-hourly', norm.loadProfile.hourly.join(','));
    set('ct-profile-basis',  norm.loadProfile.basis);
    set('ct-profile-peak',   norm.loadProfile.peakAmps ?? '');
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderAll(study) {
  renderKpis(study);
  renderComparison(study);
  renderWaterfalls(study);
  renderTimeline(study);
}

function renderKpis(study) {
  const cases = Array.isArray(study.cases) ? study.cases : [];
  const best = cases.find(c => c.installation === study.comparison?.bestCase);
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  if (best) {
    setText('kpi-base',    `${formatNumber(best.baseAmpacity_A)} A`);
    setText('kpi-derated', `${formatNumber(best.deratedAmpacity_A)} A`);
    setText('kpi-limit',   best.waterfall?.limitingFactor || '—');
    setText('kpi-temp',    best.maxConductorTempC != null ? `${formatNumber(best.maxConductorTempC)} °C` : '—');
  } else {
    setText('kpi-base', '—'); setText('kpi-derated', '—'); setText('kpi-limit', '—'); setText('kpi-temp', '—');
  }
}

function renderComparison(study) {
  const table = document.getElementById('ctenv-compare');
  const body  = document.getElementById('ctenv-compare-body');
  const empty = document.getElementById('ctenv-empty-msg');
  body.innerHTML = '';
  const cases = Array.isArray(study.cases) ? study.cases : [];
  if (!cases.length) {
    table.hidden = true;
    empty.hidden = false;
    return;
  }
  table.hidden = false;
  empty.hidden = true;

  for (const c of cases) {
    const tr = document.createElement('tr');
    if (c.installation === study.comparison?.bestCase)  tr.classList.add('ctenv-row--best');
    if (c.installation === study.comparison?.worstCase) tr.classList.add('ctenv-row--worst');
    const designCurrentA = safeNumber(study.inputs?.designCurrentA);
    const deratedAmpacityA = safeNumber(c.deratedAmpacity_A);
    const margin = designCurrentA != null && deratedAmpacityA != null
      ? (deratedAmpacityA - designCurrentA).toFixed(0)
      : '—';
    tr.innerHTML = `
      <td>${escapeHtml(c.label)}</td>
      <td>${formatNumber(c.baseAmpacity_A)}</td>
      <td><strong>${formatNumber(c.deratedAmpacity_A)}</strong></td>
      <td>${escapeHtml(c.waterfall?.limitingFactor || '—')}</td>
      <td>${formatNumber(c.maxConductorTempC)}</td>
      <td>${margin}</td>
    `;
    body.appendChild(tr);
  }
}

function renderWaterfalls(study) {
  const container = document.getElementById('ctenv-waterfalls');
  container.innerHTML = '';
  const cases = Array.isArray(study.cases) ? study.cases : [];
  for (const c of cases) {
    if (!c.waterfall || !Array.isArray(c.waterfall.steps) || !c.waterfall.steps.length) continue;
    const card = document.createElement('div');
    card.className = 'ctenv-waterfall card';
    const limit = c.waterfall.limitingFactor;
    const stepsHtml = c.waterfall.steps.map(step => {
      const factor = safeNumber(step.factor);
      const pct = factor == null ? 0 : Math.max(0, Math.min(100, Math.round(factor * 100)));
      let cls = 'ctenv-step';
      if (step.label === limit)            cls += ' ctenv-step--limit';
      else if (factor != null && factor < 0.85) cls += ' ctenv-step--warn';
      return `
        <div class="${cls}" style="--bar-pct:${pct}%">
          <div>
            <span class="ctenv-step-label">${escapeHtml(step.label)}</span>
            <span class="ctenv-step-source">${escapeHtml(step.source || '')}</span>
          </div>
          <div class="ctenv-step-bar" aria-label="factor ${escapeHtml(formatNumber(factor, 3))}"></div>
          <div class="ctenv-step-numbers">${formatNumber(factor, 3)} → ${formatNumber(step.value)} A</div>
        </div>`;
    }).join('');
    card.innerHTML = `
      <h3>${escapeHtml(c.label)} — Derating Waterfall</h3>
      ${stepsHtml}
    `;
    container.appendChild(card);
  }
}

function renderTimeline(study) {
  const section = document.getElementById('ctenv-timeline-section');
  const summary = document.getElementById('ctenv-timeline-summary');
  const chart   = document.getElementById('ctenv-timeline-chart');
  if (!study.loadProfile || !Array.isArray(study.loadProfile.timeline)) {
    section.hidden = true;
    return;
  }
  const { timeline, maxTempC, hottestHour, thetaMax, headroomC } = study.loadProfile;
  const safeTimeline = timeline
    .map((p, i) => ({ hour: safeNumber(p?.hour) ?? i, tempC: safeNumber(p?.tempC) }))
    .filter(p => p.tempC != null);
  const safeThetaMax = safeNumber(thetaMax);
  if (!safeTimeline.length || safeThetaMax == null) {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  summary.textContent =
    `Max θ_conductor ${formatNumber(maxTempC)} °C (hour ${formatNumber(hottestHour)}); θ_max ${formatNumber(safeThetaMax)} °C; headroom ${formatNumber(headroomC)} °C.`;

  // Build simple SVG line chart
  const w = 720, h = 240, padL = 50, padR = 16, padT = 16, padB = 32;
  const xs = i => padL + (i / 23) * (w - padL - padR);
  const yMin = Math.min(...safeTimeline.map(p => p.tempC), 0);
  const yMax = Math.max(safeThetaMax + 5, ...safeTimeline.map(p => p.tempC));
  const ys = v => padT + (1 - (v - yMin) / (yMax - yMin)) * (h - padT - padB);

  const linePath = safeTimeline.map((p, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)},${ys(p.tempC).toFixed(1)}`).join(' ');
  const thetaMaxY = ys(safeThetaMax);

  const xTicks = [0, 6, 12, 18, 23].map(h => `<g><line x1="${xs(h)}" x2="${xs(h)}" y1="${padT}" y2="${h === 23 ? 240 - padB : 240 - padB}" stroke="#ddd" stroke-dasharray="2,2"/><text x="${xs(h)}" y="${240 - padB + 14}" font-size="10" text-anchor="middle">${h}h</text></g>`).join('');

  chart.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Conductor temperature over 24 hours">
      <rect x="${padL}" y="${padT}" width="${w - padL - padR}" height="${h - padT - padB}" fill="#fff" stroke="#ccc"/>
      ${xTicks}
      <line x1="${padL}" x2="${w - padR}" y1="${thetaMaxY}" y2="${thetaMaxY}" stroke="#c62828" stroke-dasharray="6,4"/>
      <text x="${w - padR - 4}" y="${thetaMaxY - 4}" text-anchor="end" font-size="10" fill="#c62828">θ_max ${formatNumber(safeThetaMax)} °C</text>
      <path d="${linePath}" fill="none" stroke="#0277bd" stroke-width="2"/>
      <text x="${padL}" y="${padT - 4}" font-size="11" fill="#666">Temperature (°C)</text>
      <text x="${w / 2}" y="${h - 4}" font-size="11" fill="#666" text-anchor="middle">Hour of day</text>
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function downloadCsv(study) {
  const headers = ['Installation', 'Base A', 'Derated A', 'Limiting Factor', 'θ_conductor °C'];
  const rows = study.cases.map(c => [
    c.label,
    c.baseAmpacity_A ?? '',
    c.deratedAmpacity_A ?? '',
    c.waterfall.limitingFactor || '',
    c.maxConductorTempC ?? '',
  ]);

  // Add waterfall detail
  rows.push([]);
  rows.push(['Installation', 'Step', 'Factor', 'Cumulative A', 'Source']);
  for (const c of study.cases) {
    for (const step of (c.waterfall.steps || [])) {
      rows.push([c.label, step.label, step.factor, step.value, step.source || '']);
    }
  }

  const lines = [headers, ...rows]
    .map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([lines], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'cable-thermal-environment.csv' });
  a.click();
  URL.revokeObjectURL(url);
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatNumber(value, digits = null) {
  const n = safeNumber(value);
  if (n == null) return '—';
  return digits == null ? String(n) : n.toFixed(digits);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
