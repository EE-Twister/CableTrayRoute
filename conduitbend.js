import { runConduitBendSchedule, BEND_TYPES, OFFSET_TABLE } from './analysis/conduitBendSchedule.mjs';
import { sizePullBox, STANDARD_BOX_SIZES } from './analysis/pullBoxSizing.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { escapeHtml } from './src/htmlUtils.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();
  initStudyApprovalPanel('conduitBendSchedule');

  const addRunBtn     = document.getElementById('add-run-btn');
  const addPullboxBtn = document.getElementById('add-pullbox-btn');
  const runBtn        = document.getElementById('run-btn');
  const exportBtn     = document.getElementById('export-btn');

  addRunBtn.addEventListener('click', () => addRunCard());
  addPullboxBtn.addEventListener('click', () => addPullBoxCard());
  runBtn.addEventListener('click', calculate);
  exportBtn.addEventListener('click', exportCsv);

  // Restore saved state
  const saved = getStudies().conduitBendSchedule;
  if (saved && saved._inputs) {
    restoreInputs(saved._inputs);
    renderResults(saved);
  } else {
    addRunCard('Conduit Run 1', 1, [{ type: 'offset', dimension: 6, angle: 45 }]);
  }

  // -------------------------------------------------------------------
  // Run card builder
  // -------------------------------------------------------------------

  let runCount = 0;

  function addRunCard(label = '', tradeSize = 1, bends = []) {
    runCount++;
    const id  = `run-${runCount}`;
    const container = document.getElementById('runs-container');

    const card = document.createElement('div');
    card.className = 'dynamic-card field-group';
    card.dataset.runId = id;
    card.setAttribute('role', 'listitem');

    card.innerHTML = `
      <div class="field-row-inline">
        <label>Run label
          <input type="text" class="run-label" value="${escapeHtml(label || `Conduit Run ${runCount}`)}" aria-label="Conduit run label">
        </label>
        <label>Trade size (inches)
          <select class="run-trade-size" aria-label="Trade size">
            ${tradeSizeOptions(tradeSize)}
          </select>
        </label>
        <button type="button" class="btn btn-sm remove-run-btn" aria-label="Remove this run">Remove Run</button>
      </div>
      <div class="bends-list" aria-label="Bends for this run" role="list"></div>
      <button type="button" class="btn btn-sm add-bend-btn">+ Add Bend</button>
    `;

    card.querySelector('.remove-run-btn').addEventListener('click', () => card.remove());
    card.querySelector('.add-bend-btn').addEventListener('click', () =>
      addBendRow(card.querySelector('.bends-list'))
    );

    container.appendChild(card);

    const bendsList = card.querySelector('.bends-list');
    for (const b of bends) addBendRow(bendsList, b.type, b.dimension, b.angle);
    if (bends.length === 0) addBendRow(bendsList);
  }

  function addBendRow(list, type = 'offset', dimension = '', angle = 45) {
    const row = document.createElement('div');
    row.className = 'dynamic-row field-row-inline';
    row.setAttribute('role', 'listitem');

    row.innerHTML = `
      <label>Type
        <select class="bend-type" aria-label="Bend type">
          <option value="90"     ${type === '90'     ? 'selected' : ''}>90° Stub-up</option>
          <option value="offset" ${type === 'offset' ? 'selected' : ''}>Offset</option>
          <option value="kick"   ${type === 'kick'   ? 'selected' : ''}>Kick</option>
          <option value="saddle" ${type === 'saddle' ? 'selected' : ''}>3-Bend Saddle</option>
        </select>
      </label>
      <label>Dimension (in)
        <input type="number" class="bend-dim" min="0" step="0.25" value="${dimension}" aria-label="Bend dimension">
      </label>
      <label class="angle-label">Angle (°)
        <select class="bend-angle" aria-label="Bend angle">
          ${angleOptions(angle)}
        </select>
      </label>
      <button type="button" class="btn btn-sm remove-bend-btn" aria-label="Remove this bend">&times;</button>
    `;

    const typeSelect = row.querySelector('.bend-type');
    const angleLabel = row.querySelector('.angle-label');
    function toggleAngle() {
      const t = typeSelect.value;
      angleLabel.hidden = (t === '90' || t === 'saddle');
    }
    typeSelect.addEventListener('change', toggleAngle);
    toggleAngle();

    row.querySelector('.remove-bend-btn').addEventListener('click', () => row.remove());
    list.appendChild(row);
  }

  // -------------------------------------------------------------------
  // Pull-box card builder
  // -------------------------------------------------------------------

  let pbCount = 0;

  function addPullBoxCard(label = '', pullType = 'straight', wallA = [], wallB = []) {
    pbCount++;
    const container = document.getElementById('pullbox-container');

    const card = document.createElement('div');
    card.className = 'dynamic-card field-group';
    card.setAttribute('role', 'listitem');

    card.innerHTML = `
      <div class="field-row-inline">
        <label>Label
          <input type="text" class="pb-label" value="${escapeHtml(label || `Pull Box ${pbCount}`)}" aria-label="Pull box label">
        </label>
        <label>Pull type
          <select class="pb-type" aria-label="Pull type">
            <option value="straight" ${pullType === 'straight' ? 'selected' : ''}>Straight Pull</option>
            <option value="angle"    ${pullType === 'angle'    ? 'selected' : ''}>Angle / U Pull</option>
          </select>
        </label>
        <button type="button" class="btn btn-sm remove-pb-btn" aria-label="Remove pull box">Remove</button>
      </div>
      <div class="pb-straight-section">
        <label>Largest conduit trade size (in)
          <select class="pb-straight-ts" aria-label="Largest trade size">
            ${tradeSizeOptions(wallA[0] || 1)}
          </select>
        </label>
      </div>
      <div class="pb-angle-section" hidden>
        <p class="hint">Enter trade sizes of all conduits entering each wall (comma-separated).</p>
        <label>Wall A conduit sizes (in): <input type="text" class="pb-walla" placeholder="e.g. 2, 1.5, 1" value="${wallA.join(', ')}"></label>
        <label>Wall B conduit sizes (in): <input type="text" class="pb-wallb" placeholder="e.g. 2, 1.5"    value="${wallB.join(', ')}"></label>
      </div>
    `;

    const typeSelect    = card.querySelector('.pb-type');
    const straightSec   = card.querySelector('.pb-straight-section');
    const angleSec      = card.querySelector('.pb-angle-section');

    function toggleSections() {
      const isAngle = typeSelect.value !== 'straight';
      straightSec.hidden = isAngle;
      angleSec.hidden    = !isAngle;
    }
    typeSelect.addEventListener('change', toggleSections);
    toggleSections();

    card.querySelector('.remove-pb-btn').addEventListener('click', () => card.remove());
    container.appendChild(card);
  }

  // -------------------------------------------------------------------
  // Calculate
  // -------------------------------------------------------------------

  function calculate() {
    const runsInput    = readRunInputs();
    const pullboxInput = readPullBoxInputs();

    const schedResult = runConduitBendSchedule(runsInput);

    const pbResults = pullboxInput.map(pb => {
      try { return sizePullBox(pb); }
      catch (e) { return { label: pb.label, error: e.message }; }
    });

    const result = {
      ...schedResult,
      pullBoxResults: pbResults,
      _inputs: { runs: runsInput, pullBoxes: pullboxInput },
    };

    const studies = getStudies();
    studies.conduitBendSchedule = result;
    setStudies(studies);

    renderResults(result);
    exportBtn.disabled = false;
  }

  // -------------------------------------------------------------------
  // Input reading
  // -------------------------------------------------------------------

  function readRunInputs() {
    const cards = document.querySelectorAll('#runs-container .dynamic-card');
    return Array.from(cards).map(card => ({
      label:     card.querySelector('.run-label').value.trim(),
      tradeSize: parseFloat(card.querySelector('.run-trade-size').value),
      bends: Array.from(card.querySelectorAll('.bends-list .dynamic-row')).map(row => ({
        type:      row.querySelector('.bend-type').value,
        dimension: parseFloat(row.querySelector('.bend-dim').value),
        angle:     parseFloat(row.querySelector('.bend-angle').value),
      })),
    }));
  }

  function readPullBoxInputs() {
    const cards = document.querySelectorAll('#pullbox-container .dynamic-card');
    return Array.from(cards).map(card => {
      const pullType = card.querySelector('.pb-type').value;
      if (pullType === 'straight') {
        return {
          label:            card.querySelector('.pb-label').value.trim(),
          pullType:         'straight',
          largestTradeSize: parseFloat(card.querySelector('.pb-straight-ts').value),
        };
      }
      const parseWall = el => el.value.split(/[\s,]+/).map(parseFloat).filter(v => v > 0);
      return {
        label:    card.querySelector('.pb-label').value.trim(),
        pullType: card.querySelector('.pb-type').value,
        wallA:    parseWall(card.querySelector('.pb-walla')),
        wallB:    parseWall(card.querySelector('.pb-wallb')),
      };
    });
  }

  // -------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------

  function renderResults(result) {
    renderViolations(result);
    renderBendSchedule(result.runs || []);
    renderPullBoxResults(result.pullBoxResults || []);
  }

  function renderViolations(result) {
    const el  = document.getElementById('violation-summary');
    const viol = result.violations || [];
    const fail = (result.runs || []).filter(r => !r.nec358_24Pass);

    if (viol.length === 0 && fail.length === 0) {
      el.hidden = true;
      return;
    }

    el.hidden = false;
    el.innerHTML = `
      <div class="warning-panel" style="border-left:4px solid var(--color-error,#c00);padding:.75rem 1rem;margin:1rem 0;background:var(--color-bg-warn,#fff3f3)">
        <strong>NEC 358.24 Violations</strong>
        <ul>
          ${fail.map(r => `<li>${escapeHtml(r.label)}: ${escapeHtml(r.nec358_24Message)}</li>`).join('')}
        </ul>
      </div>`;
  }

  function renderBendSchedule(runs) {
    const el = document.getElementById('results');
    if (!runs.length) { el.hidden = true; return; }

    el.hidden = false;
    el.innerHTML = runs.map(run => {
      const passClass = run.nec358_24Pass ? 'fill-ok' : 'fill-over';
      const passLabel = run.nec358_24Pass ? '✓ Pass' : '✗ Fail';
      const rows = (run.bends || []).map((b, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(b.type === '90' ? '90° Stub-up' : b.type.charAt(0).toUpperCase() + b.type.slice(1))}</td>
          <td>${b.dimension}"</td>
          <td>${b.degrees}°</td>
          <td>${b.markSpacing}"</td>
          <td>${b.shrink}"</td>
          <td>${escapeHtml(b.note)}</td>
        </tr>`).join('');

      return `
        <section aria-label="Bend schedule for ${escapeHtml(run.label)}" style="margin-bottom:1.5rem">
          <h3>${escapeHtml(run.label)}
            <span class="fill-badge ${passClass}" style="font-size:.8em;margin-left:.5em">${passLabel} — ${run.totalDegrees}° total</span>
          </h3>
          <p style="font-size:.85em;color:var(--color-text-muted)">${escapeHtml(run.nec358_24Message)}</p>
          ${rows ? `
          <table class="results-table" aria-label="Bend schedule for ${escapeHtml(run.label)}">
            <thead>
              <tr>
                <th>#</th><th>Type</th><th>Dim (in)</th><th>Degrees</th>
                <th>Mark Spacing (in)</th><th>Shrink (in)</th><th>Notes</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <td colspan="3"><strong>Total</strong></td>
                <td><strong>${run.totalDegrees}°</strong></td>
                <td colspan="3"></td>
              </tr>
            </tfoot>
          </table>` : '<p>No bends.</p>'}
        </section>`;
    }).join('');
  }

  function renderPullBoxResults(pbResults) {
    const el = document.getElementById('pullbox-results');
    if (!pbResults.length) { el.hidden = true; return; }

    el.hidden = false;
    el.innerHTML = `
      <h3>Pull-Box Sizing Results (NEC 314.28)</h3>
      ${pbResults.map(pb => {
        if (pb.error) return `<p class="error-msg">${escapeHtml(pb.label)}: ${escapeHtml(pb.error)}</p>`;
        const box = pb.standardBox;
        const adequateClass = box.adequate ? 'fill-ok' : 'fill-over';
        const adequateLabel = box.adequate ? 'Standard size selected' : 'Exceeds catalogue — specify custom box';
        return `
          <div class="field-group" style="margin-bottom:1rem">
            <strong>${escapeHtml(pb.label)}</strong>
            (${escapeHtml(pb.pullType === 'straight' ? 'Straight Pull' : 'Angle / U Pull')})
            <table class="results-table" style="margin-top:.5rem" aria-label="Pull box sizing for ${escapeHtml(pb.label)}">
              <tbody>
                <tr><td>Min length</td><td>${pb.minLength}"</td><td><em>${escapeHtml(pb.formulaLength)}</em></td></tr>
                <tr><td>Min width</td> <td>${pb.minWidth}"</td> <td><em>${escapeHtml(pb.formulaWidth)}</em></td></tr>
                <tr>
                  <td>Standard box</td>
                  <td>${box.length}" × ${box.width}"</td>
                  <td><span class="fill-badge ${adequateClass}">${adequateLabel}</span></td>
                </tr>
              </tbody>
            </table>
          </div>`;
      }).join('')}`;
  }

  // -------------------------------------------------------------------
  // CSV export
  // -------------------------------------------------------------------

  function exportCsv() {
    const saved = getStudies().conduitBendSchedule;
    if (!saved || !saved.runs) return;

    const rows = [['Run', 'Trade Size (in)', 'Bend #', 'Type', 'Dimension (in)',
                   'Degrees', 'Mark Spacing (in)', 'Shrink (in)', 'Total Degrees', 'NEC 358.24', 'Notes']];

    for (const run of saved.runs) {
      if (run.bends.length === 0) {
        rows.push([run.label, run.tradeSize, '', '', '', '', '', '', run.totalDegrees,
                   run.nec358_24Pass ? 'Pass' : 'FAIL', run.nec358_24Message]);
      }
      for (const [i, b] of run.bends.entries()) {
        rows.push([
          run.label, run.tradeSize, i + 1, b.type, b.dimension,
          b.degrees, b.markSpacing, b.shrink,
          i === run.bends.length - 1 ? run.totalDegrees : '',
          i === run.bends.length - 1 ? (run.nec358_24Pass ? 'Pass' : 'FAIL') : '',
          b.note,
        ]);
      }
    }

    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'conduit-bend-schedule.csv' });
    a.click();
    URL.revokeObjectURL(url);
  }

  // -------------------------------------------------------------------
  // Restore
  // -------------------------------------------------------------------

  function restoreInputs(inputs) {
    if (!inputs) return;
    const { runs = [], pullBoxes = [] } = inputs;
    for (const r of runs) addRunCard(r.label, r.tradeSize, r.bends || []);
    for (const pb of pullBoxes) {
      addPullBoxCard(pb.label, pb.pullType,
        pb.wallA || (pb.largestTradeSize ? [pb.largestTradeSize] : []),
        pb.wallB || []);
    }
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  const TRADE_SIZES = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4];

  function tradeSizeOptions(selected = 1) {
    return TRADE_SIZES.map(ts =>
      `<option value="${ts}" ${ts === parseFloat(selected) ? 'selected' : ''}>${ts}"</option>`
    ).join('');
  }

  const OFFSET_ANGLES = Object.keys(OFFSET_TABLE).map(Number);

  function angleOptions(selected = 45) {
    return OFFSET_ANGLES.map(a =>
      `<option value="${a}" ${a === parseFloat(selected) ? 'selected' : ''}>${a}°</option>`
    ).join('');
  }
});
