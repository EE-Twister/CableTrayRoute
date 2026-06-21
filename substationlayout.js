import {
  runSubstationLayout,
  extractEquipment,
} from './analysis/substationLayout.mjs';
import { getStudies, setStudies, getOneLine } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { initStudyBasisPanel } from './src/components/studyBasis.js';
import { escapeHtml } from './src/htmlUtils.mjs';

const TYPE_OPTIONS = [
  ['transformer', 'Power Transformer'],
  ['circuit_breaker', 'Circuit Breaker'],
  ['disconnect_switch', 'Disconnect Switch'],
  ['switchgear', 'Switchgear / MCC'],
  ['capacitor_bank', 'Capacitor Bank'],
  ['reactor', 'Reactor'],
  ['generator', 'Generator'],
  ['motor', 'Motor'],
  ['surge_arrester', 'Surge Arrester'],
  ['instrument_transformer', 'Instrument Transformer'],
  ['control_building', 'Control Building'],
  ['other', 'Other'],
];

const SAMPLE_EQUIPMENT = [
  { tag: 'TX-1', type: 'transformer', voltageKv: 138 },
  { tag: 'CB-1', type: 'circuit_breaker', voltageKv: 138 },
  { tag: 'DS-1', type: 'disconnect_switch', voltageKv: 138 },
  { tag: 'AR-1', type: 'surge_arrester', voltageKv: 138 },
  { tag: 'CB-2', type: 'circuit_breaker', voltageKv: 13.8 },
  { tag: 'SWGR-1', type: 'switchgear', voltageKv: 13.8 },
  { tag: 'CAP-1', type: 'capacitor_bank', voltageKv: 13.8 },
  { tag: 'CTRL', type: 'control_building', voltageKv: 0.48 },
];

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  initStudyBasisPanel('substationLayout', {
    standard: 'IEEE Std 1119 (fence safety clearances); NESC (IEEE C2) §124; IEEE Std 605 (physical layout)',
    clause: 'Voltage-lane equipment placement with working-clearance envelopes from the one-line topology',
    formulas: [
      'Envelope = footprint + 2 × clearance(voltage)',
      'Equipment grouped into lanes by voltage level (HV → LV)',
      'Fence = equipment bounding box + clearance(maxV) + 10 ft',
      'Ground grid polygon = fence + 3 ft',
    ],
    assumptions: [
      'Single-bus, single-row-per-voltage screening arrangement',
      'Footprints are typical screening sizes (refine against vendor GA drawings)',
      'IEEE 1119 / NESC working clearances by maximum system voltage',
    ],
    limitations: [
      'No bay-internal phase spacing, road/crane access, or oil-containment sizing',
      'Single row per voltage; multi-row yards need manual arrangement',
      'A starting point for civil/structural and ground-grid design, not a final GA',
    ],
  });

  initStudyApprovalPanel('substationLayout');

  const form        = document.getElementById('sl-form');
  const tbody       = document.getElementById('equipment-rows');
  const addBtn      = document.getElementById('add-row-btn');
  const sampleBtn   = document.getElementById('load-sample-btn');
  const onelineBtn  = document.getElementById('load-oneline-btn');
  const resultsDiv  = document.getElementById('results');
  const errorsDiv   = document.getElementById('calc-errors');
  const exportBtn   = document.getElementById('export-csv-btn');

  function rowHtml(e = {}) {
    const opts = TYPE_OPTIONS.map(([v, l]) =>
      `<option value="${v}"${e.type === v ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('');
    return `<tr class="equip-row">
      <td><input type="text" class="e-tag" value="${escapeHtml(String(e.tag ?? ''))}" aria-label="Equipment tag" placeholder="TX-1"></td>
      <td><select class="e-type" aria-label="Equipment type">${opts}</select></td>
      <td><input type="number" class="e-kv" value="${e.voltageKv ?? ''}" step="any" min="0" aria-label="Voltage kV"></td>
      <td><button type="button" class="btn btn-small remove-row" aria-label="Remove">✕</button></td>
    </tr>`;
  }

  function fillEquipmentTable(list) {
    tbody.innerHTML = list.map(rowHtml).join('');
  }

  function readEquipment() {
    return Array.from(tbody.querySelectorAll('.equip-row')).map((row, i) => {
      const tag = row.querySelector('.e-tag')?.value.trim() || `EQ${i + 1}`;
      const type = row.querySelector('.e-type')?.value || 'other';
      const kv = parseFloat(row.querySelector('.e-kv')?.value);
      return { id: tag, tag, type, voltageKv: Number.isFinite(kv) ? kv : 0 };
    });
  }

  tbody.addEventListener('click', e => {
    if (e.target.closest('.remove-row')) e.target.closest('.equip-row').remove();
  });
  addBtn.addEventListener('click', () => tbody.insertAdjacentHTML('beforeend', rowHtml()));
  sampleBtn.addEventListener('click', () => fillEquipmentTable(SAMPLE_EQUIPMENT));
  onelineBtn.addEventListener('click', () => {
    try {
      const eq = extractEquipment(getOneLine());
      if (!eq.length) {
        showModal('No Equipment', '<p>No placeable apparatus found on the one-line. Add transformers, breakers, or switchgear on the One-Line page first.</p>', 'info');
        return;
      }
      fillEquipmentTable(eq);
    } catch (err) {
      showModal('Load Error', `<p>${escapeHtml(err.message)}</p>`, 'error');
    }
  });

  // Restore saved, else seed the sample.
  const saved = getStudies().substationLayout;
  if (saved && saved.inputs && Array.isArray(saved.inputs.equipment)) {
    fillEquipmentTable(saved.inputs.equipment);
    renderResults(saved);
    exportBtn.hidden = false;
  } else {
    fillEquipmentTable(SAMPLE_EQUIPMENT);
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const runBtn = document.getElementById('run-btn');
    runBtn.disabled = true;
    runBtn.textContent = 'Generating…';

    let result;
    try {
      const equipment = readEquipment();
      if (equipment.length === 0) throw new Error('Add at least one piece of equipment.');
      result = runSubstationLayout({ equipment });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to generate the layout.';
      errorsDiv.hidden = false;
      errorsDiv.textContent = msg;
      showModal('Input Error', `<p>${escapeHtml(msg)}</p>`, 'error');
      runBtn.disabled = false;
      runBtn.textContent = 'Generate Layout';
      return;
    }

    errorsDiv.hidden = true;
    errorsDiv.textContent = '';

    const studies = getStudies();
    studies.substationLayout = result;
    setStudies(studies);

    renderResults(result);
    exportBtn.hidden = false;
    runBtn.disabled = false;
    runBtn.textContent = 'Generate Layout';
  });

  exportBtn.addEventListener('click', () => {
    const s = getStudies().substationLayout;
    if (s) download('substation-layout.csv', resultToCsv(s), 'text/csv');
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  function renderResults(r) {
    const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');

    const rows = r.footprints.map(p => `
      <tr>
        <td>${escapeHtml(p.tag)}</td>
        <td>${escapeHtml(p.label)}</td>
        <td>${f(p.voltageKv, 2)}</td>
        <td>${f(p.x, 1)}, ${f(p.y, 1)}</td>
        <td>${f(p.w, 0)} × ${f(p.h, 0)}</td>
        <td>${f(p.setback, 0)}</td>
      </tr>`).join('');

    const warningHtml = r.warnings.length
      ? `<ul class="drc-findings">${r.warnings.map(w =>
          `<li class="drc-finding drc-warn"><span class="drc-msg">${escapeHtml(w)}</span></li>`).join('')}</ul>`
      : '<p class="field-hint">No warnings.</p>';

    const ggW = Math.abs(r.groundGridPolygon[1].x - r.groundGridPolygon[0].x);
    const ggH = Math.abs(r.groundGridPolygon[2].y - r.groundGridPolygon[0].y);

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Substation Layout</h2>

        <div class="result-group">
          <h3>Site Summary</h3>
          <div class="result-cards">
            <div class="result-card">
              <div class="result-card-label">Equipment placed</div>
              <div class="result-card-value">${r.equipmentCount}</div>
              <div class="result-card-sub">${r.voltages.length} voltage lane(s)</div>
            </div>
            <div class="result-card">
              <div class="result-card-label">Fenced area</div>
              <div class="result-card-value">${f(r.fence.width, 0)} × ${f(r.fence.height, 0)}</div>
              <div class="result-card-sub">ft (${f(r.fence.width * r.fence.height / 43560, 2)} acre)</div>
            </div>
            <div class="result-card">
              <div class="result-card-label">Max voltage</div>
              <div class="result-card-value">${f(r.maxVoltageKv, 1)}</div>
              <div class="result-card-sub">kV</div>
            </div>
            <div class="result-card">
              <div class="result-card-label">Ground grid</div>
              <div class="result-card-value">${f(ggW, 0)} × ${f(ggH, 0)}</div>
              <div class="result-card-sub">ft perimeter (seeds Ground Grid)</div>
            </div>
          </div>
        </div>

        <div class="result-group">
          <h3>Plan View</h3>
          <div id="sl-plan">${planSvg(r)}</div>
          <p class="field-hint">Dashed orange = security fence · dashed green = ground-grid perimeter · dashed grey = working-clearance envelope.</p>
        </div>

        <div class="result-group">
          <h3>Equipment Placement</h3>
          <div class="table-scroll">
            <table class="data-table" aria-label="Equipment placement">
              <thead><tr><th>Tag</th><th>Type</th><th>kV</th><th>Position (ft)</th><th>Footprint (ft)</th><th>Clearance (ft)</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>

        <div class="result-group">
          <h3>Warnings</h3>
          ${warningHtml}
        </div>
      </section>`;
  }

  function planSvg(r) {
    const gp = r.groundGridPolygon;
    const minX = Math.min(...gp.map(p => p.x));
    const minY = Math.min(...gp.map(p => p.y));
    const maxX = Math.max(...gp.map(p => p.x));
    const maxY = Math.max(...gp.map(p => p.y));
    const worldW = maxX - minX || 1;
    const worldH = maxY - minY || 1;
    const VW = 760, pad = 12;
    const scale = (VW - 2 * pad) / worldW;
    const VH = Math.min(560, worldH * scale + 2 * pad);
    const sx = x => pad + (x - minX) * scale;
    const sy = y => pad + (y - minY) * scale;

    const gg = `<polygon points="${gp.map(p => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')}"
        fill="none" stroke="#2e8b57" stroke-width="1.5" stroke-dasharray="6 4"></polygon>`;
    const fence = `<rect x="${sx(r.fence.x).toFixed(1)}" y="${sy(r.fence.y).toFixed(1)}"
        width="${(r.fence.width * scale).toFixed(1)}" height="${(r.fence.height * scale).toFixed(1)}"
        fill="none" stroke="#d9822b" stroke-width="1.5" stroke-dasharray="5 3"></rect>`;

    const items = r.footprints.map(p => {
      const ex = sx(p.envX), ey = sy(p.envY), ew = p.envW * scale, eh = p.envH * scale;
      const fx = sx(p.x), fy = sy(p.y), fw = p.w * scale, fh = p.h * scale;
      const fill = p.voltageKv >= 100 ? '#3a7bd5' : p.voltageKv >= 10 ? '#5aa469' : '#9b59b6';
      const showLabel = fw > 26;
      return `<g>
        <rect x="${ex.toFixed(1)}" y="${ey.toFixed(1)}" width="${ew.toFixed(1)}" height="${eh.toFixed(1)}"
          fill="none" stroke="#888" stroke-width="0.75" stroke-dasharray="2 2"></rect>
        <rect x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}"
          fill="${fill}" opacity="0.8" rx="1"></rect>
        ${showLabel ? `<text x="${(fx + fw / 2).toFixed(1)}" y="${(fy + fh / 2 + 3).toFixed(1)}" text-anchor="middle" font-size="9" fill="#fff">${escapeHtml(p.tag)}</text>` : ''}
      </g>`;
    }).join('');

    return `<svg width="${VW}" height="${VH.toFixed(0)}" viewBox="0 0 ${VW} ${VH.toFixed(0)}" role="img"
        aria-label="Substation plan view with equipment footprints, fence, and ground-grid perimeter">
        <title>Generated substation arrangement (plan view, feet)</title>
        ${gg}${fence}${items}
      </svg>`;
  }

  // -------------------------------------------------------------------------
  // CSV export
  // -------------------------------------------------------------------------
  function resultToCsv(r) {
    const lines = [];
    lines.push('# Substation Physical Layout');
    lines.push(`# Fenced area (ft),${r.fence.width.toFixed(1)},x,${r.fence.height.toFixed(1)}`);
    const ggW = Math.abs(r.groundGridPolygon[1].x - r.groundGridPolygon[0].x);
    const ggH = Math.abs(r.groundGridPolygon[2].y - r.groundGridPolygon[0].y);
    lines.push(`# Ground grid perimeter (ft),${ggW.toFixed(1)},x,${ggH.toFixed(1)}`);
    lines.push('Tag,Type,kV,X_ft,Y_ft,Width_ft,Depth_ft,Clearance_ft');
    r.footprints.forEach(p => lines.push(
      [p.tag, p.label, p.voltageKv, p.x.toFixed(1), p.y.toFixed(1), p.w, p.h, p.setback].join(',')));
    return lines.join('\n');
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
});
