import {
  buildSustainabilityReport,
  GRID_EMISSION_FACTORS,
  cableCO2eFactor,
  trayCO2eFactor,
  conduitCO2eFactor,
} from './analysis/sustainabilityFootprint.mjs';
import { getCables, getTrays, getConduits, getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { escapeHtml } from './src/htmlUtils.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();
  initStudyApprovalPanel('sustainabilityFootprint');

  const gridRegionEl   = document.getElementById('grid-region');
  const customFactorEl = document.getElementById('custom-grid-factor');
  const customLabelEl  = document.getElementById('custom-grid-label');
  const projectLifeEl  = document.getElementById('project-life');
  const lossesSourceEl = document.getElementById('losses-source');
  const lossesKwEl     = document.getElementById('losses-kw');
  const altToggleEl    = document.getElementById('alt-compare-toggle');
  const altEditorEl    = document.getElementById('alt-bom-editor');
  const altJsonEl      = document.getElementById('alt-bom-json');
  const calculateBtn   = document.getElementById('calculate-btn');
  const exportBtn      = document.getElementById('export-btn');

  let lastResult = null;
  let lastBom    = [];

  // ── Conditional field visibility ───────────────────────────────────────────

  gridRegionEl.addEventListener('change', () => {
    const isCustom = gridRegionEl.value === 'custom';
    customLabelEl.style.display = isCustom ? '' : 'none';
  });
  customLabelEl.style.display = 'none';

  lossesSourceEl.addEventListener('change', () => {
    const src = lossesSourceEl.value;
    lossesKwEl.disabled = src !== 'manual';
    if (src === 'none') lossesKwEl.value = '0';
  });

  altToggleEl.addEventListener('change', () => {
    altEditorEl.hidden = !altToggleEl.checked;
  });

  // ── Main calculation ───────────────────────────────────────────────────────

  calculateBtn.addEventListener('click', calculate);
  exportBtn.addEventListener('click', exportCsv);

  // Restore previously saved state
  const saved = getStudies().sustainabilityFootprint;
  if (saved && saved._inputs) {
    restoreInputs(saved._inputs);
    renderResults(saved._result, saved._bom);
    exportBtn.disabled = false;
  }

  function calculate() {
    const inputs  = readInputs();
    const bom     = buildBomFromProject();
    const options = buildOptions(inputs, bom);
    const result  = buildSustainabilityReport(bom, options);

    const toStore = { _inputs: inputs, _result: result, _bom: bom };
    const studies = getStudies();
    studies.sustainabilityFootprint = toStore;
    setStudies(studies);

    lastResult = result;
    lastBom    = bom;
    renderResults(result, bom);
    exportBtn.disabled = false;
  }

  // ── Input helpers ──────────────────────────────────────────────────────────

  function readInputs() {
    const lossesSource = lossesSourceEl.value;
    let lossesKw = 0;

    if (lossesSource === 'manual') {
      lossesKw = parseFloat(lossesKwEl.value) || 0;
    } else if (lossesSource === 'study') {
      lossesKw = lossesFromStudyResults();
    }

    let altBom = null;
    if (altToggleEl.checked && altJsonEl.value.trim()) {
      try {
        altBom = JSON.parse(altJsonEl.value.trim());
      } catch {
        altBom = null;
      }
    }

    return {
      gridRegion:          gridRegionEl.value,
      customGridFactor:    parseFloat(customFactorEl.value) || null,
      projectLifeYears:    parseInt(projectLifeEl.value, 10) || 25,
      lossesSource,
      lossesKw,
      altBom,
    };
  }

  function restoreInputs(inp) {
    if (!inp) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
    set('grid-region',       inp.gridRegion);
    set('custom-grid-factor', inp.customGridFactor);
    set('project-life',      inp.projectLifeYears);
    set('losses-source',     inp.lossesSource);
    set('losses-kw',         inp.lossesKw);

    customLabelEl.style.display = inp.gridRegion === 'custom' ? '' : 'none';
    lossesKwEl.disabled = inp.lossesSource !== 'manual';

    if (inp.altBom) {
      altToggleEl.checked = true;
      altEditorEl.hidden  = false;
      altJsonEl.value     = JSON.stringify(inp.altBom, null, 2);
    }
  }

  function buildOptions(inputs, bom) {
    const opts = {
      gridRegion:       inputs.gridRegion,
      projectLifeYears: inputs.projectLifeYears,
    };
    if (inputs.gridRegion === 'custom' && inputs.customGridFactor != null) {
      opts.gridFactorKgPerKwh = inputs.customGridFactor;
    }
    if (inputs.lossesKw > 0) {
      opts.lossesKw = inputs.lossesKw;
    }
    if (Array.isArray(inputs.altBom) && inputs.altBom.length > 0) {
      opts.alternative = inputs.altBom;
    }
    return opts;
  }

  // ── BOM assembly from project data ────────────────────────────────────────

  function buildBomFromProject() {
    const bom = [];

    const cables   = getCables()   || [];
    const trays    = getTrays()    || [];
    const conduits = getConduits() || [];

    for (const c of cables) {
      const size       = c.conductor_size || c.size || '';
      const conductors = Math.max(1, parseInt(c.conductors, 10) || 1);
      const lengthFt   = parseFloat(c.length_ft || c.route_length || 0) || 0;
      const lengthM    = lengthFt * 0.3048;
      const material   = normaliseConductorMaterial(c.conductor_material || c.material || 'Cu');

      if (size && lengthM > 0) {
        const entry = {
          id:          c.tag || c.id || undefined,
          type:        'cable',
          quantity:    lengthM,
          size,
          material,
          conductors,
        };
        if (c.co2eKgPerUnit != null) {
          entry.co2eKgPerUnit = c.co2eKgPerUnit;
          entry.epdSource     = c.epdSource || undefined;
        }
        bom.push(entry);
      }
    }

    for (const t of trays) {
      const widthIn  = parseFloat(t.inside_width || t.width || 0) || 0;
      const lengthFt = parseFloat(t.length_ft || 0) || 0;
      const lengthM  = lengthFt * 0.3048;
      const material = normaliseTrayMaterial(t.tray_material || t.material || 'steel');

      if (widthIn > 0 && lengthM > 0) {
        const entry = {
          id:       t.id || undefined,
          type:     'tray',
          quantity: lengthM,
          widthIn,
          material,
        };
        if (t.co2eKgPerUnit != null) {
          entry.co2eKgPerUnit = t.co2eKgPerUnit;
          entry.epdSource     = t.epdSource || undefined;
        }
        bom.push(entry);
      }
    }

    for (const c of conduits) {
      const tradeSizeIn = parseFloat(c.trade_size || c.diameter || 0) || 0;
      const lengthFt    = parseFloat(c.length_ft || 0) || 0;
      const lengthM     = lengthFt * 0.3048;
      const material    = normaliseConduitType(c.conduit_type || c.material || 'emt');

      if (tradeSizeIn > 0 && lengthM > 0) {
        const entry = {
          id:          c.conduit_id || c.id || undefined,
          type:        'conduit',
          quantity:    lengthM,
          tradeSizeIn,
          material,
        };
        if (c.co2eKgPerUnit != null) {
          entry.co2eKgPerUnit = c.co2eKgPerUnit;
          entry.epdSource     = c.epdSource || undefined;
        }
        bom.push(entry);
      }
    }

    return bom;
  }

  function normaliseConductorMaterial(raw) {
    const s = String(raw || '').toLowerCase().trim();
    if (s.startsWith('al') || s === 'aluminum' || s === 'aluminium') return 'Al';
    return 'Cu';
  }

  function normaliseTrayMaterial(raw) {
    const s = String(raw || '').toLowerCase().trim();
    if (s.includes('al') || s === 'aluminum' || s === 'aluminium') return 'aluminum';
    if (s.includes('frp') || s.includes('fibre') || s.includes('fiber') || s.includes('glass')) return 'frp';
    return 'steel';
  }

  function normaliseConduitType(raw) {
    const s = String(raw || '').toLowerCase().trim();
    if (s.includes('imc')) return 'imc';
    if (s.includes('rgs') || s.includes('rigid') || s.includes('rmc')) return 'rgs';
    if (s.includes('pvc')) return 'pvc';
    return 'emt';
  }

  function lossesFromStudyResults() {
    const studies = getStudies();
    const iec = studies.iec60287;
    if (iec && iec.results && Array.isArray(iec.results)) {
      const total = iec.results.reduce((s, r) => {
        const w = parseFloat(r.I2RLossPerM || r.lossWPerM || 0) * parseFloat(r.lengthM || 0);
        return s + (isFinite(w) ? w : 0);
      }, 0);
      return total / 1000;
    }
    return 0;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function renderResults(result, bom) {
    renderSkippedPanel(result.embodied.skippedItems || []);

    const el = document.getElementById('results');
    el.hidden = false;

    const gridDef = GRID_EMISSION_FACTORS[result.gridRegion] || {};
    const fmtT    = kg => (kg / 1000).toFixed(3);
    const fmtKg   = kg => kg.toFixed(1);

    const opSection = result.operating
      ? `<section class="field-group" aria-label="Operating CO₂e" style="margin-bottom:1.5rem">
          <h3>Operating CO₂e (Scope 2)</h3>
          <table class="results-table" aria-label="Operating losses summary">
            <tbody>
              <tr><td>Annual conductor losses</td><td><strong>${result.operating.annualKwh.toFixed(0).toLocaleString()} kWh/yr</strong></td></tr>
              <tr><td>Grid emission factor</td><td>${result.gridFactorKgPerKwh} kg CO₂e/kWh (${escapeHtml(gridDef.label || result.gridRegion)})</td></tr>
              <tr><td>Project life</td><td>${result.projectLifeYears} years</td></tr>
              <tr><td>Lifetime energy consumption</td><td>${(result.operating.lifetimeKwh / 1000).toFixed(1)} MWh</td></tr>
              <tr><td>Operating CO₂e (Scope 2)</td><td><strong>${fmtKg(result.operating.lifetimeKgCO2e)} kg (${fmtT(result.operating.lifetimeKgCO2e)} t)</strong></td></tr>
            </tbody>
          </table>
        </section>`
      : `<p class="hint" style="margin-bottom:1rem">Operating losses not included (select a losses source in the inputs to add Scope 2 CO₂e).</p>`;

    const altSection = result.alternativeComparison
      ? (() => {
          const ac = result.alternativeComparison;
          const sign = ac.deltaKg >= 0 ? '+' : '';
          const deltaClass = ac.deltaKg < 0 ? 'fill-ok' : ac.deltaKg > 0 ? 'fill-over' : '';
          return `<section class="field-group" aria-label="Alternative comparison" style="margin-bottom:1.5rem">
            <h3>Alternative Design Comparison</h3>
            <table class="results-table" aria-label="Alternative comparison">
              <thead><tr><th>Metric</th><th>Primary design</th><th>Alternative</th><th>Delta</th></tr></thead>
              <tbody>
                <tr>
                  <td>Total CO₂e</td>
                  <td>${fmtKg(result.totalKg)} kg</td>
                  <td>${fmtKg(ac.totalKg)} kg</td>
                  <td><span class="fill-badge ${deltaClass}">${sign}${fmtKg(ac.deltaKg)} kg</span></td>
                </tr>
                <tr>
                  <td>Embodied CO₂e</td>
                  <td>${fmtKg(result.embodied.totalKg)} kg</td>
                  <td>${fmtKg(ac.embodiedKg)} kg</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
            ${ac.skippedItems && ac.skippedItems.length > 0
              ? `<p class="hint">${ac.skippedItems.length} alternative BOM item(s) were skipped — check the JSON for unrecognised types or sizes.</p>`
              : ''}
          </section>`;
        })()
      : '';

    // Build category breakdown from embodied lines
    const byType = {};
    for (const line of result.embodied.lines) {
      const t = line.type || 'other';
      if (!byType[t]) byType[t] = { count: 0, subtotalKg: 0 };
      byType[t].count++;
      byType[t].subtotalKg += line.subtotalKg;
    }

    const categoryRows = Object.entries(byType).map(([type, agg]) => `
      <tr>
        <td style="text-transform:capitalize">${escapeHtml(type)}</td>
        <td>${agg.count}</td>
        <td>${fmtKg(agg.subtotalKg)} kg</td>
        <td>${fmtT(agg.subtotalKg)} t</td>
      </tr>`).join('');

    const lineRows = result.embodied.lines.map(l => `
      <tr>
        <td>${escapeHtml(l.id || '—')}</td>
        <td style="text-transform:capitalize">${escapeHtml(l.type)}</td>
        <td>${l.quantity.toFixed(1)} m</td>
        <td>${l.co2eKgPerUnit.toFixed(4)}</td>
        <td>${escapeHtml(l.source)}</td>
        <td>${fmtKg(l.subtotalKg)} kg</td>
      </tr>`).join('');

    el.innerHTML = `
      <!-- KPI strip -->
      <div class="kpi-strip" style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem">
        <div class="kpi-card">
          <div class="kpi-label">Embodied CO₂e (Scope 3)</div>
          <div class="kpi-value">${fmtT(result.embodied.totalKg)} t</div>
          <div class="kpi-sub">${fmtKg(result.embodied.totalKg)} kg</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Operating CO₂e (Scope 2)</div>
          <div class="kpi-value">${result.operating ? fmtT(result.operating.lifetimeKgCO2e) : '—'} t</div>
          <div class="kpi-sub">${result.operating ? `over ${result.projectLifeYears} yr` : 'not calculated'}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total CO₂e</div>
          <div class="kpi-value"><strong>${fmtT(result.totalKg)} t</strong></div>
          <div class="kpi-sub">${fmtKg(result.totalKg)} kg</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">BOM lines included</div>
          <div class="kpi-value">${result.embodied.lines.length}</div>
          <div class="kpi-sub">${result.embodied.skippedItems.length} skipped</div>
        </div>
      </div>

      <!-- Category breakdown -->
      <section class="field-group" aria-label="Embodied CO₂e by category" style="margin-bottom:1.5rem">
        <h3>Embodied CO₂e by Category (Scope 3, A1–A3)</h3>
        <table class="results-table" aria-label="Category CO₂e breakdown">
          <thead><tr><th>Category</th><th>Items</th><th>CO₂e (kg)</th><th>CO₂e (t)</th></tr></thead>
          <tbody>
            ${categoryRows || '<tr><td colspan="4">No BOM data — import a project with cable, tray, or conduit data.</td></tr>'}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Total embodied</strong></td>
              <td><strong>${result.embodied.lines.length}</strong></td>
              <td><strong>${fmtKg(result.embodied.totalKg)} kg</strong></td>
              <td><strong>${fmtT(result.embodied.totalKg)} t</strong></td>
            </tr>
          </tfoot>
        </table>
      </section>

      ${opSection}
      ${altSection}

      <!-- Line-item detail -->
      <details style="margin-bottom:1.5rem">
        <summary>Line-item detail (${result.embodied.lines.length} items)</summary>
        <table class="results-table" aria-label="BOM CO₂e line items">
          <thead><tr><th>ID</th><th>Type</th><th>Qty (m)</th><th>Factor (kg/m or kg/unit)</th><th>Source</th><th>Subtotal (kg)</th></tr></thead>
          <tbody>${lineRows || '<tr><td colspan="6">No BOM items.</td></tr>'}</tbody>
        </table>
      </details>

      <p class="hint" style="font-size:.8em">
        <strong>Disclaimer:</strong> Embodied factors are representative industry EPD averages (IEC/EN 15804, A1–A3 cradle-to-gate).
        Grid emission factors are national averages. This report is suitable for screening-level design only.
        Verify against manufacturer-specific EPDs and project grid factor before LEED, BREEAM, or formal sustainability submission.
      </p>`;
  }

  function renderSkippedPanel(skipped) {
    const el = document.getElementById('skipped-panel');
    if (!skipped || skipped.length === 0) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = `<div class="warn-panel" role="alert">
      <strong>${skipped.length} BOM item(s) skipped</strong> — unrecognised size, material, or type.
      Add a <code>co2eKgPerUnit</code> field to the item record or use a supported size/material.
      <ul style="margin:.5rem 0 0 1.2rem">
        ${skipped.map(s => `<li>${s.id ? escapeHtml(s.id) + ': ' : ''}${escapeHtml(s.reason)}</li>`).join('')}
      </ul>
    </div>`;
  }

  // ── CSV export ─────────────────────────────────────────────────────────────

  function exportCsv() {
    if (!lastResult) return;

    const rows = [
      ['ID', 'Type', 'Quantity (m)', 'CO2e Factor (kg/m or kg/unit)', 'Factor Source', 'Subtotal CO2e (kg)', 'Subtotal CO2e (t)'],
    ];

    for (const line of lastResult.embodied.lines) {
      rows.push([
        line.id || '',
        line.type,
        line.quantity.toFixed(2),
        line.co2eKgPerUnit.toFixed(6),
        line.source,
        line.subtotalKg.toFixed(3),
        (line.subtotalKg / 1000).toFixed(6),
      ]);
    }

    rows.push([]);
    rows.push(['Summary', '', '', '', '', '', '']);
    rows.push(['Embodied CO₂e (kg)', lastResult.embodied.totalKg.toFixed(3)]);
    if (lastResult.operating) {
      rows.push(['Operating CO₂e (kg)', lastResult.operating.lifetimeKgCO2e.toFixed(3)]);
    }
    rows.push(['Total CO₂e (kg)', lastResult.totalKg.toFixed(3)]);
    rows.push(['Total CO₂e (t)', lastResult.totalTonnes.toFixed(6)]);
    rows.push(['Grid region', lastResult.gridRegion]);
    rows.push(['Grid factor (kg/kWh)', lastResult.gridFactorKgPerKwh]);
    rows.push(['Project life (years)', lastResult.projectLifeYears]);

    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sustainability-footprint.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }
});
