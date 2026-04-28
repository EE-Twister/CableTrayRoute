const d3 = globalThis.d3;
import { getOneLine, getStudies, setStudies } from '../dataStore.mjs';
import { resolveCtForComponent } from './ctMetadata.mjs';
import {
  buildHarmonicStudyPackage,
  HARMONIC_STUDY_CASE_VERSION,
  normalizeHarmonicSourceRows,
  renderHarmonicStudyHTML,
  runHarmonicStudyCase,
} from './harmonicStudyCase.mjs';

// Convert spectrum description to a map of harmonic order to percent
export function parseSpectrum(spec) {
  const map = {};
  if (!spec) return map;
  if (Array.isArray(spec)) {
    spec.forEach((v, i) => {
      const val = Number(v);
      if (!isNaN(val) && val) map[i + 1] = val;
    });
    return map;
  }
  if (typeof spec === 'string') {
    spec.split(/[\,\s]+/).forEach(p => {
      if (!p) return;
      const parts = p.split(':');
      const order = Number(parts[0]);
      const val = Number(parts[1] || parts[0]);
      if (!isNaN(order) && !isNaN(val) && order > 1) map[order] = val;
    });
  }
  return map;
}

function limitForVoltage(kv) {
  if (kv < 69) return 5;
  if (kv < 161) return 8;
  return 12;
}

/**
 * Frequency‑domain harmonic study. For each component flagged as a harmonic
 * source, a rudimentary admittance aggregation is performed to estimate bus
 * voltage distortion per IEEE 519. Capacitor banks and tuned filters may be
 * provided as shunt admittances.
 *
 * @returns {Object<string,{ithd:number,vthd:number,limit:number,warning:boolean}>}
 */
export function runHarmonics() {
  const { sheets } = getOneLine();
  const comps = (Array.isArray(sheets[0]?.components)
    ? sheets.flatMap(s => s.components)
    : sheets).filter(c => c && c.type !== 'annotation' && c.type !== 'dimension');
  const results = {};

  comps.forEach(c => {
    if (!c.harmonicSource) return;
    const spectrum = parseSpectrum(c.harmonics);
    const V = Number(c.voltage) || (Number(c.baseKV) || 0) * 1000;
    const P = Number(c.load?.kw || c.load?.P || c.kw || 0);
    const I1 = V ? P * 1000 / (Math.sqrt(3) * V) : 0;

    // Base short‑circuit admittance if provided (scMVA) else assume 1 pu
    const scMVA = Number(c.scMVA) || 0;
    const yBase = V ? (scMVA ? scMVA / ((V / 1000) ** 2) : 1) : 1;

    // Shunt capacitor banks
    const capB = (c.capacitors || []).reduce((sum, cap) => {
      const kvar = Number(cap.kvar) || 0;
      const kv = Number(cap.kv) || (V / 1000) || 1;
      return sum + (kvar / (kv * kv));
    }, 0);

    // Tuned filters provide large admittance at a specific harmonic order
    const filterMap = {};
    (c.filters || []).forEach(f => {
      const ord = Number(f.order);
      if (!ord) return;
      const kvar = Number(f.kvar) || 0;
      const kv = Number(f.kv) || (V / 1000) || 1;
      const q = Number(f.q) || 1; // quality factor approximation
      const adm = (kvar / (kv * kv)) * q;
      filterMap[ord] = (filterMap[ord] || 0) + adm;
    });

    let i2 = 0;
    let v2 = 0;
    Object.entries(spectrum).forEach(([ordStr, pct]) => {
      const h = Number(ordStr);
      if (h <= 1) return;
      const Ih = I1 * (pct / 100);
      i2 += Ih * Ih;
      const y = yBase + capB * h + (filterMap[h] || 0);
      const Vh = y ? Ih / y : 0;
      v2 += (Vh / V) * (Vh / V);
    });

    const ithd = I1 ? Math.sqrt(i2) / I1 * 100 : 0;
    const vthd = Math.sqrt(v2) * 100;
    const limit = limitForVoltage(V / 1000);
    const ct = resolveCtForComponent(c, comps);
    results[c.id] = {
      ithd: Number(ithd.toFixed(2)),
      vthd: Number(vthd.toFixed(2)),
      limit,
      warning: vthd > limit,
      ct
    };
  });

  return results;
}

/**
 * Per-phase unbalanced harmonic study.
 *
 * Each harmonic source component may carry independent per-phase spectra via
 * `harmonicsA`, `harmonicsB`, and `harmonicsC` fields. The caller may also
 * supply a `phaseData` override map keyed by component id:
 *   { [id]: { harmonicsA?, harmonicsB?, harmonicsC? } }
 *
 * Triplen harmonic orders (3, 6, 9 … = zero-sequence) do not cancel in the
 * neutral conductor of a 4-wire system — they sum arithmetically from all three
 * phases.  This function computes the resulting neutral RMS current and flags
 * overload (neutral > 100 % of phase FLA).
 *
 * @param {Object} [phaseData={}] Optional per-component per-phase override map.
 * @returns {Object<string,{
 *   phaseA:{ithd:number,vthd:number},
 *   phaseB:{ithd:number,vthd:number},
 *   phaseC:{ithd:number,vthd:number},
 *   neutral:{ithd_pct_of_phase:number,rms_amps:number,dominant_order:number,overload_warning:boolean},
 *   balanced:boolean,
 *   phase_imbalance_flag:boolean,
 *   limit:number,
 *   warning:boolean
 * }>}
 */
export function runHarmonicsUnbalanced(phaseData = {}) {
  const { sheets } = getOneLine();
  const comps = (Array.isArray(sheets[0]?.components)
    ? sheets.flatMap(s => s.components)
    : sheets).filter(c => c && c.type !== 'annotation' && c.type !== 'dimension');
  const results = {};

  comps.forEach(c => {
    if (!c.harmonicSource) return;

    const V = Number(c.voltage) || (Number(c.baseKV) || 0) * 1000;
    const P = Number(c.load?.kw || c.load?.P || c.kw || 0);
    const I1 = V ? P * 1000 / (Math.sqrt(3) * V) : 0;
    const kv = V / 1000;

    // Per-phase spectra — fall back to balanced single spectrum
    const override = phaseData[c.id] || {};
    const specA = parseSpectrum(override.harmonicsA ?? c.harmonicsA ?? c.harmonics);
    const specB = parseSpectrum(override.harmonicsB ?? c.harmonicsB ?? c.harmonics);
    const specC = parseSpectrum(override.harmonicsC ?? c.harmonicsC ?? c.harmonics);
    const balanced = !override.harmonicsA && !override.harmonicsB && !override.harmonicsC
      && !c.harmonicsA && !c.harmonicsB && !c.harmonicsC;

    // Admittance network (same as runHarmonics)
    const scMVA = Number(c.scMVA) || 0;
    const yBase = V ? (scMVA ? scMVA / (kv ** 2) : 1) : 1;
    const capB = (c.capacitors || []).reduce((sum, cap) => {
      const kvar = Number(cap.kvar) || 0;
      const cv = Number(cap.kv) || kv || 1;
      return sum + (kvar / (cv * cv));
    }, 0);
    const filterMap = {};
    (c.filters || []).forEach(f => {
      const ord = Number(f.order);
      if (!ord) return;
      const kvar = Number(f.kvar) || 0;
      const fv = Number(f.kv) || kv || 1;
      const q = Number(f.q) || 1;
      filterMap[ord] = (filterMap[ord] || 0) + (kvar / (fv * fv)) * q;
    });

    // Compute ITHD and VTHD for a single phase spectrum
    function phaseResult(spectrum) {
      let i2 = 0, v2 = 0;
      Object.entries(spectrum).forEach(([ordStr, pct]) => {
        const h = Number(ordStr);
        if (h <= 1) return;
        const Ih = I1 * (pct / 100);
        i2 += Ih * Ih;
        const y = yBase + capB * h + (filterMap[h] || 0);
        const Vh = y ? Ih / y : 0;
        v2 += (Vh / V) * (Vh / V);
      });
      const ithd = I1 ? Math.sqrt(i2) / I1 * 100 : 0;
      const vthd = V ? Math.sqrt(v2) * 100 : 0;
      return { ithd: Number(ithd.toFixed(2)), vthd: Number(vthd.toFixed(2)) };
    }

    const phaseA = phaseResult(specA);
    const phaseB = phaseResult(specB);
    const phaseC = phaseResult(specC);

    // Neutral current: triplen (zero-sequence) orders sum arithmetically
    const allOrders = new Set(
      [...Object.keys(specA), ...Object.keys(specB), ...Object.keys(specC)]
        .map(Number).filter(h => h > 1 && h % 3 === 0)
    );
    let neutralI2 = 0;
    let dominantOrder = 0;
    let dominantContrib = 0;
    allOrders.forEach(h => {
      const IAh = I1 * ((specA[h] || 0) / 100);
      const IBh = I1 * ((specB[h] || 0) / 100);
      const ICh = I1 * ((specC[h] || 0) / 100);
      const INh = IAh + IBh + ICh;
      neutralI2 += INh * INh;
      if (INh > dominantContrib) { dominantContrib = INh; dominantOrder = h; }
    });
    const neutralRms = Math.sqrt(neutralI2);
    const neutralPct = I1 ? neutralRms / I1 * 100 : 0;

    // Phase imbalance: flag if per-phase ITHD range exceeds 10 percentage points
    const ithdValues = [phaseA.ithd, phaseB.ithd, phaseC.ithd];
    const ithdRange = Math.max(...ithdValues) - Math.min(...ithdValues);

    const limit = limitForVoltage(kv);
    const worstVthd = Math.max(phaseA.vthd, phaseB.vthd, phaseC.vthd);

    const ct = resolveCtForComponent(c, comps);
    results[c.id] = {
      phaseA,
      phaseB,
      phaseC,
      ct,
      neutral: {
        ithd_pct_of_phase: Number(neutralPct.toFixed(2)),
        rms_amps: Number(neutralRms.toFixed(2)),
        dominant_order: dominantOrder,
        overload_warning: neutralPct > 100
      },
      balanced,
      phase_imbalance_flag: ithdRange > 10,
      limit,
      warning: worstVthd > limit
    };
  });

  return results;
}

/**
 * Frequency sweep — system impedance Z(h) vs harmonic order h.
 *
 * Models the Thevenin source (inductive, from scMVA) in parallel with
 * capacitor banks (untuned) or series-tuned LC filters (with quality factor Q).
 * Identifies parallel resonance peaks (impedance maxima) and series resonance
 * nulls (impedance minima from tuned filters), then classifies each by its
 * proximity to integer harmonic orders per IEEE 519 injection risk.
 *
 * Normalization: Z_pu = Z_abs × ySrc1, so Z_pu = 1 at h=1 with no capacitors
 * (source inductor base). Peak Z_pu ≈ h_res × Q_system at parallel resonance.
 *
 * @param {object}  params
 * @param {number}  params.busVoltageKv    - Bus voltage (kV)
 * @param {number}  params.scMVA           - Short-circuit MVA at bus
 * @param {{mvar:number, kv?:number, tuneOrder?:number, qFactor?:number}[]} [params.capacitorBanks=[]]
 * @param {number}  [params.hMax=25]       - Maximum harmonic order to sweep
 * @param {number}  [params.qSystem=20]    - System quality factor (source damping)
 * @param {number}  [params.step=0.1]      - Sweep step size
 * @returns {{ sweep: {h:number,zPu:number}[], resonances: {hOrder:number,zPu:number,type:string,risk:string,nearestHarmonic:number,detuneRecommendation:string|null}[] }}
 */
export function frequencyScan({
  busVoltageKv = 13.8,
  scMVA = 100,
  capacitorBanks = [],
  hMax = 25,
  qSystem = 20,
  step = 0.1
} = {}) {
  const kv    = Number(busVoltageKv) || 1;
  const sc    = Number(scMVA)        || 1;
  const Qsys  = Number(qSystem)      || 20;

  // Source short-circuit admittance at fundamental (MVAR/kV²)
  const ySrc1 = sc / (kv * kv);

  const banks = (capacitorBanks || []).map(b => {
    const bKv = Number(b.kv) || kv;
    return {
      b1: Number(b.mvar) / (bKv * bKv),   // fundamental cap susceptance (MVAR/kV²)
      ht: Number(b.tuneOrder) || 0,         // tuning order (0 = untuned)
      q:  Number(b.qFactor)  || 30          // filter quality factor
    };
  }).filter(b => b.b1 > 0);

  const hasCapacitors = banks.length > 0;

  // Compute complex admittance at harmonic order h; return { gTotal, bTotal }
  function admittance(h) {
    // Inductive source: Y_src = G_src - j·B_src
    const gSrc = ySrc1 / (h * Qsys);  // conductance (system losses)
    const bSrc = ySrc1 / h;            // inductive susceptance magnitude

    let gCap = 0;
    let bCap = 0;

    banks.forEach(({ b1, ht, q }) => {
      if (ht > 0) {
        // Series-tuned filter: Z = R + j(X_L - X_C) per harmonic h
        // where X_C1 = 1/b1, X_L1 = X_C1/ht², R = ht·X_L1/q = X_C1/(q·ht)
        const xC1  = 1 / b1;
        const xL_h = h * xC1 / (ht * ht);
        const xC_h = xC1 / h;
        const R    = xC1 / (q * ht);
        const xNet = xL_h - xC_h;
        const dSq  = R * R + xNet * xNet;
        gCap += R    / dSq;   // real part of Y_filter
        bCap += -xNet / dSq;  // imaginary part (positive = capacitive below ht)
      } else {
        bCap += b1 * h;       // untuned capacitor: purely capacitive
      }
    });

    // Total admittance: Y = (gSrc + gCap) + j(-bSrc + bCap)
    return { g: gSrc + gCap, b: -bSrc + bCap };
  }

  // Build sweep: Z_pu = ySrc1 / |Y_total|
  const sweep = [];
  const hEnd = Math.round(hMax * 10);
  for (let hi = 10; hi <= hEnd; hi++) {
    const h = hi / 10;
    const { g, b } = admittance(h);
    const yMag = Math.sqrt(g * g + b * b);
    const zPu  = yMag > 0 ? Math.round((ySrc1 / yMag) * 10000) / 10000 : 1e6;
    sweep.push({ h, zPu });
  }

  // Find local extrema → resonances
  const resonances = [];
  for (let i = 1; i < sweep.length - 1; i++) {
    const prev = sweep[i - 1].zPu;
    const curr = sweep[i].zPu;
    const next = sweep[i + 1].zPu;
    const h    = sweep[i].h;

    if (hasCapacitors && curr > prev && curr > next && curr > 1.0) {
      // Parallel resonance (impedance peak)
      const nearestHarmonic = Math.round(h);
      const dist = Math.abs(h - nearestHarmonic);
      const risk = dist <= 0.3 ? 'danger' : 'caution';

      let rec = null;
      if (risk === 'danger') {
        rec = `Parallel resonance at h\u2248${h.toFixed(1)} coincides with the ${nearestHarmonic}th harmonic. Add a detuning reactor to shift the resonant frequency away from this order.`;
      } else {
        rec = `Resonance at h\u2248${h.toFixed(1)} is near the ${nearestHarmonic}th harmonic. Monitor harmonic injection levels; consider detuning if injection is significant.`;
      }

      resonances.push({ hOrder: h, zPu: curr, type: 'parallel', risk, nearestHarmonic, detuneRecommendation: rec });
    }

    if (curr < prev && curr < next && banks.some(b => b.ht > 0)) {
      // Series resonance null (from tuned filter)
      resonances.push({ hOrder: h, zPu: curr, type: 'series', risk: 'safe', nearestHarmonic: Math.round(h), detuneRecommendation: null });
    }
  }

  return { sweep, resonances };
}

function ensureHarmonicResults() {
  const studies = getStudies();
  if (studies?.harmonics && Object.keys(studies.harmonics).length) {
    return studies.harmonics;
  }
  const res = runHarmonics();
  studies.harmonics = res;
  setStudies(studies);
  return res;
}

function renderChart(svgEl, data) {
  const width = Number(svgEl.getAttribute('width')) || 800;
  const height = Number(svgEl.getAttribute('height')) || 400;
  const margin = { top: 20, right: 20, bottom: 60, left: 70 };
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  if (!data.length) {
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#666')
      .text('No harmonic sources found in the active project.');
    return;
  }

  const ids = data.map(d => d.id);
  const x = d3.scaleBand().domain(ids).range([margin.left, width - margin.right]).padding(0.15);
  const yMax = d3.max(data, d => Math.max(d.thd, d.limit)) || 1;
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
    .text('Component ID');

  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -(margin.top + (height - margin.top - margin.bottom) / 2))
    .attr('y', 20)
    .attr('text-anchor', 'middle')
    .attr('fill', '#333')
    .text('Voltage THD (%)');

  const groups = svg.append('g');
  groups.selectAll('rect').data(data).enter().append('rect')
    .attr('x', d => x(d.id))
    .attr('y', d => y(d.thd))
    .attr('width', x.bandwidth())
    .attr('height', d => y(0) - y(d.thd))
    .attr('fill', d => d.thd > d.limit ? 'crimson' : 'steelblue');

  groups.selectAll('line').data(data).enter().append('line')
    .attr('x1', d => x(d.id))
    .attr('x2', d => x(d.id) + x.bandwidth())
    .attr('y1', d => y(d.limit))
    .attr('y2', d => y(d.limit))
    .attr('stroke', 'orange')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '4,2');
}

function esc(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadText(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function statusBadge(status = '') {
  const cls = status === 'fail'
    ? 'badge-error'
    : status === 'warn' || status === 'missingData' || status === 'review'
      ? 'badge-warn'
      : 'badge-ok';
  return `<span class="badge ${cls}">${esc(status || 'pass')}</span>`;
}

function sourceRowHtml(row = {}) {
  return `<tr>
    <td><input class="harmonic-source-tag" type="text" value="${esc(row.tag || '')}" aria-label="Source tag"></td>
    <td><select class="harmonic-source-type" aria-label="Source type">
      ${['vfd', 'ups', 'rectifier', 'ibr', 'arcFurnace', 'generic'].map(type => `<option value="${type}" ${row.sourceType === type ? 'selected' : ''}>${type}</option>`).join('')}
    </select></td>
    <td><input class="harmonic-source-ref" type="text" value="${esc(row.componentId || row.busId || '')}" aria-label="Bus or component reference"></td>
    <td><input class="harmonic-source-current" type="number" min="0" step="0.1" value="${esc(row.fundamentalCurrentA ?? '')}" aria-label="Fundamental current"></td>
    <td><input class="harmonic-source-kw" type="number" min="0" step="0.1" value="${esc(row.kw ?? '')}" aria-label="Source kW"></td>
    <td><input class="harmonic-source-spectrum" type="text" value="${esc(row.spectrumText || '')}" placeholder="5:35,7:25,11:9" aria-label="Harmonic spectrum"></td>
    <td style="text-align:center;"><input class="harmonic-source-interharmonic" type="checkbox" ${row.interharmonic ? 'checked' : ''} aria-label="Interharmonic source"></td>
    <td><button class="btn harmonic-remove-source" type="button">Remove</button></td>
  </tr>`;
}

function readHarmonicStudyCaseFromDom() {
  return {
    pccBus: document.getElementById('harmonic-pcc-tag')?.value || '',
    pccTag: document.getElementById('harmonic-pcc-tag')?.value || '',
    nominalVoltageKv: document.getElementById('harmonic-nominal-kv')?.value || '',
    utilityScMva: document.getElementById('harmonic-sc-mva')?.value || '',
    utilityXrRatio: document.getElementById('harmonic-xr')?.value || '',
    maximumDemandCurrentA: document.getElementById('harmonic-demand-current')?.value || '',
    demandCurrentBasis: document.getElementById('harmonic-demand-basis')?.value || '',
    complianceBasis: document.getElementById('harmonic-compliance-basis')?.value || 'IEEE519-2022',
    selectedComplianceBasis: document.getElementById('harmonic-compliance-basis')?.value || 'IEEE519-2022',
    transformerPhaseShift: document.getElementById('harmonic-phase-shift')?.value || '',
    triplenTreatment: document.getElementById('harmonic-triplen-treatment')?.value || 'screening',
    zeroSequenceTreatment: document.getElementById('harmonic-triplen-treatment')?.value || 'screening',
    reportPreset: document.getElementById('harmonic-report-preset')?.value || 'summary',
  };
}

function readHarmonicSourceRowsFromDom() {
  return [...document.querySelectorAll('#harmonic-source-tbody tr')].map((tr, index) => {
    const ref = tr.querySelector('.harmonic-source-ref')?.value || '';
    return {
      id: `source-${index + 1}-${ref || tr.querySelector('.harmonic-source-tag')?.value || 'row'}`,
      tag: tr.querySelector('.harmonic-source-tag')?.value || `Source ${index + 1}`,
      sourceType: tr.querySelector('.harmonic-source-type')?.value || 'generic',
      componentId: ref,
      busId: ref,
      fundamentalCurrentA: tr.querySelector('.harmonic-source-current')?.value || '',
      kw: tr.querySelector('.harmonic-source-kw')?.value || '',
      spectrumText: tr.querySelector('.harmonic-source-spectrum')?.value || '',
      interharmonic: tr.querySelector('.harmonic-source-interharmonic')?.checked || false,
    };
  });
}

function renderHarmonicStudyResults(pkg = {}) {
  const target = document.getElementById('harmonic-study-case-results');
  if (!target) return;
  const rows = pkg.complianceRows || [];
  const filters = pkg.filterAlternatives || [];
  target.innerHTML = `
    <h3>IEEE 519 Compliance Rows</h3>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Source</th><th>Check</th><th>Actual</th><th>Limit</th><th>Margin</th><th>Status</th><th>Recommendation</th></tr></thead>
        <tbody>${rows.length ? rows.map(row => `<tr>
          <td>${esc(row.sourceTag)}</td>
          <td>${esc(row.checkType)}</td>
          <td>${esc(row.actualValue ?? 'Missing')}</td>
          <td>${esc(row.limitValue ?? 'Missing')}</td>
          <td>${esc(row.margin ?? 'Missing')}</td>
          <td>${statusBadge(row.status)}</td>
          <td>${esc(row.recommendation)}</td>
        </tr>`).join('') : '<tr><td colspan="7">No compliance rows.</td></tr>'}</tbody>
      </table>
    </div>
    <h3>Filter Alternatives</h3>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Type</th><th>Targets</th><th>Reduction</th><th>Risk</th><th>Status</th><th>Recommendation</th></tr></thead>
        <tbody>${filters.length ? filters.map(row => `<tr>
          <td>${esc(row.name)}</td>
          <td>${esc(row.filterType)}</td>
          <td>${esc((row.targetHarmonics || []).join(', '))}</td>
          <td>${esc(row.expectedThdReductionPct ?? '')}%</td>
          <td>${esc(row.frequencyScanResonanceRisk)}</td>
          <td>${statusBadge(row.status)}</td>
          <td>${esc(row.recommendation)}</td>
        </tr>`).join('') : '<tr><td colspan="7">No filter alternatives generated.</td></tr>'}</tbody>
      </table>
    </div>
    <details>
      <summary>Study Package JSON</summary>
      <pre>${esc(JSON.stringify(pkg, null, 2))}</pre>
    </details>`;
}

function seedHarmonicStudyPanel() {
  const tbody = document.getElementById('harmonic-source-tbody');
  if (!tbody) return;
  const studies = getStudies();
  const saved = studies.harmonicStudyCase || (studies.harmonics?.version === HARMONIC_STUDY_CASE_VERSION ? studies.harmonics : null);
  let pkg = null;
  try {
    if (saved) pkg = buildHarmonicStudyPackage(saved);
  } catch {
    pkg = null;
  }
  if (pkg?.studyCase) {
    document.getElementById('harmonic-pcc-tag').value = pkg.studyCase.pccTag || pkg.studyCase.pccBus || '';
    document.getElementById('harmonic-nominal-kv').value = pkg.studyCase.nominalVoltageKv || 0.48;
    document.getElementById('harmonic-sc-mva').value = pkg.studyCase.utilityScMva ?? '';
    document.getElementById('harmonic-xr').value = pkg.studyCase.utilityXrRatio || 10;
    document.getElementById('harmonic-demand-current').value = pkg.studyCase.maximumDemandCurrentA ?? '';
    document.getElementById('harmonic-demand-basis').value = pkg.studyCase.demandCurrentBasis || '';
    document.getElementById('harmonic-compliance-basis').value = pkg.studyCase.selectedComplianceBasis || pkg.studyCase.complianceBasis || 'IEEE519-2022';
    document.getElementById('harmonic-report-preset').value = pkg.studyCase.reportPreset || 'summary';
    document.getElementById('harmonic-phase-shift').value = pkg.studyCase.transformerPhaseShift || '';
    document.getElementById('harmonic-triplen-treatment').value = pkg.studyCase.triplenTreatment || 'screening';
  }
  const rows = pkg?.sourceRows?.length
    ? pkg.sourceRows
    : normalizeHarmonicSourceRows([], { oneLine: getOneLine() });
  tbody.innerHTML = rows.length
    ? rows.map(sourceRowHtml).join('')
    : sourceRowHtml({ tag: 'PCC Source 1', sourceType: 'generic', spectrumText: '5:20,7:14,11:6' });
  renderHarmonicStudyResults(pkg || { complianceRows: [], filterAlternatives: [] });
}

function runHarmonicStudyCaseFromDom() {
  const studies = getStudies();
  const result = runHarmonicStudyCase({
    oneLine: getOneLine(),
    studyCase: readHarmonicStudyCaseFromDom(),
    sourceRows: readHarmonicSourceRowsFromDom(),
    frequencyScan: studies.frequencyScan || studies.harmonicFrequencyScan || null,
    capacitorBank: studies.capacitorBank || studies.capacitorBankSizing || null,
  });
  const pkg = buildHarmonicStudyPackage({
    projectName: studies.projectName || 'Untitled Project',
    ...result,
    frequencyScan: studies.frequencyScan || studies.harmonicFrequencyScan || null,
    capacitorDutyContext: studies.capacitorBank || studies.capacitorBankSizing || null,
  });
  globalThis.__lastHarmonicStudyPackage = pkg;
  const status = document.getElementById('harmonic-study-case-status');
  if (status) {
    status.textContent = `${pkg.summary.status.toUpperCase()}: ${pkg.summary.sourceCount} source(s), ${pkg.summary.fail} fail, ${pkg.summary.warn} warning, ${pkg.summary.missingData} missing-data compliance row(s).`;
  }
  renderHarmonicStudyResults(pkg);
  return pkg;
}

function bindHarmonicStudyPanel() {
  if (!document.getElementById('harmonic-study-case-section')) return;
  seedHarmonicStudyPanel();
  document.getElementById('harmonic-add-source')?.addEventListener('click', () => {
    document.getElementById('harmonic-source-tbody')?.insertAdjacentHTML('beforeend', sourceRowHtml({ tag: 'New Source', sourceType: 'generic', spectrumText: '5:20,7:14' }));
  });
  document.getElementById('harmonic-source-tbody')?.addEventListener('click', event => {
    const button = event.target.closest?.('.harmonic-remove-source');
    if (button) button.closest('tr')?.remove();
  });
  document.getElementById('harmonic-run-study-case')?.addEventListener('click', () => {
    try {
      runHarmonicStudyCaseFromDom();
    } catch (err) {
      const status = document.getElementById('harmonic-study-case-status');
      if (status) status.textContent = err.message || String(err);
    }
  });
  document.getElementById('harmonic-save-study-case')?.addEventListener('click', () => {
    const pkg = globalThis.__lastHarmonicStudyPackage || runHarmonicStudyCaseFromDom();
    const studies = getStudies();
    studies.harmonicStudyCase = pkg;
    studies.harmonics = pkg.results || studies.harmonics || {};
    setStudies(studies);
    const status = document.getElementById('harmonic-study-case-status');
    if (status) status.textContent = 'Harmonic study case saved to project studies.';
  });
  document.getElementById('harmonic-export-json')?.addEventListener('click', () => {
    const pkg = globalThis.__lastHarmonicStudyPackage || runHarmonicStudyCaseFromDom();
    downloadText('harmonic-study-case.json', JSON.stringify(pkg, null, 2), 'application/json');
  });
  document.getElementById('harmonic-export-html')?.addEventListener('click', () => {
    const pkg = globalThis.__lastHarmonicStudyPackage || runHarmonicStudyCaseFromDom();
    downloadText('harmonic-study-case.html', renderHarmonicStudyHTML(pkg), 'text/html');
  });
}

if (typeof document !== 'undefined') {
  bindHarmonicStudyPanel();
  const chartEl = document.getElementById('harmonics-chart');
  if (chartEl) {
    const results = ensureHarmonicResults();
    const data = Object.entries(results).map(([id, r]) => ({ id, thd: r.vthd, limit: r.limit }));
    renderChart(chartEl, data);
  }
}
