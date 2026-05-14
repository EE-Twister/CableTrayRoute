import { runConduitBendSchedule, BEND_TYPES, OFFSET_TABLE } from './analysis/conduitBendSchedule.mjs';
import {
  buildConduitBendVisualModel,
  normalizeBendLayout,
  normalizeConduitRunLayout,
  normalizePullBoxPosition
} from './analysis/conduitBendVisualModel.mjs';
import { sizePullBox, STANDARD_BOX_SIZES } from './analysis/pullBoxSizing.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { escapeHtml } from './src/htmlUtils.mjs';
import { renderIsometricSvg } from './src/utils/isometricSvg.js';

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
  const isoCanvas     = document.getElementById('conduit-iso-canvas');
  const isoSummary    = document.getElementById('conduit-iso-summary');
  const isoStatus     = document.getElementById('conduit-iso-status');
  const isoInspector  = document.getElementById('conduit-iso-inspector');

  let latestVisualModel = null;
  let selectedIsoId = '';
  let runCount = 0;
  let pbCount = 0;
  const TRADE_SIZES = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4];
  const OFFSET_ANGLES = Object.keys(OFFSET_TABLE).map(Number);

  addRunBtn.addEventListener('click', () => addRunCard());
  addPullboxBtn.addEventListener('click', () => addPullBoxCard());
  runBtn.addEventListener('click', calculate);
  exportBtn.addEventListener('click', exportCsv);
  document.getElementById('runs-container').addEventListener('input', renderLivePreviewFromInputs);
  document.getElementById('runs-container').addEventListener('change', renderLivePreviewFromInputs);
  document.getElementById('runs-container').addEventListener('click', handleLayoutInputSelection);
  document.getElementById('pullbox-container').addEventListener('input', renderLivePreviewFromInputs);
  document.getElementById('pullbox-container').addEventListener('change', renderLivePreviewFromInputs);
  document.getElementById('pullbox-container').addEventListener('click', handleLayoutInputSelection);
  isoCanvas?.addEventListener('click', handleIsoSelection);
  isoCanvas?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    handleIsoSelection(event);
  });

  // Restore saved state
  const saved = getStudies().conduitBendSchedule;
  if (saved && saved._inputs) {
    restoreInputs(saved._inputs);
    renderResults(saved);
    exportBtn.disabled = false;
  } else if (saved && saved.runs) {
    const legacyInputs = legacyInputsFromResult(saved);
    restoreInputs(legacyInputs);
    renderResults({ ...saved, _inputs: legacyInputs });
    exportBtn.disabled = false;
  } else {
    addRunCard('Conduit Run 1', 1, [{ type: 'offset', dimension: 6, angle: 45 }]);
    addPullBoxCard('Pull Box 1', 'straight', [1], [], { xFt: 0, yFt: -8, zFt: 0 });
    renderLivePreviewFromInputs();
  }

  // -------------------------------------------------------------------
  // Run card builder
  // -------------------------------------------------------------------

  function addRunCard(label = '', tradeSize = 1, bends = [], layout = null) {
    runCount++;
    const id  = `run-${runCount}`;
    const container = document.getElementById('runs-container');
    const normalizedLayout = normalizeConduitRunLayout({ layout: layout || {} }, { bends }, runCount - 1);

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
      <details class="conduit-layout-details" open>
        <summary>Physical layout</summary>
        <div class="conduit-layout-grid">
          <label>Start X (ft)
            <input type="number" class="run-start-x" step="0.1" value="${formatNumber(normalizedLayout.start.xFt)}" aria-label="Run start X in feet">
          </label>
          <label>Start Y (ft)
            <input type="number" class="run-start-y" step="0.1" value="${formatNumber(normalizedLayout.start.yFt)}" aria-label="Run start Y in feet">
          </label>
          <label>Start Z (ft)
            <input type="number" class="run-start-z" step="0.1" value="${formatNumber(normalizedLayout.start.zFt)}" aria-label="Run start Z in feet">
          </label>
          <label>End X (ft)
            <input type="number" class="run-end-x" step="0.1" value="${formatNumber(normalizedLayout.end.xFt)}" aria-label="Run end X in feet">
          </label>
          <label>End Y (ft)
            <input type="number" class="run-end-y" step="0.1" value="${formatNumber(normalizedLayout.end.yFt)}" aria-label="Run end Y in feet">
          </label>
          <label>End Z (ft)
            <input type="number" class="run-end-z" step="0.1" value="${formatNumber(normalizedLayout.end.zFt)}" aria-label="Run end Z in feet">
          </label>
          <label>Heading (deg)
            <input type="number" class="run-heading" step="1" value="${formatNumber(normalizedLayout.headingDeg)}" aria-label="Run heading degrees">
          </label>
          <label>End tolerance (ft)
            <input type="number" class="run-tolerance" min="0" step="0.1" value="${formatNumber(normalizedLayout.endToleranceFt)}" aria-label="Run end tolerance in feet">
          </label>
        </div>
      </details>
      <div class="bends-list" aria-label="Bends for this run" role="list"></div>
      <button type="button" class="btn btn-sm add-bend-btn">+ Add Bend</button>
    `;

    card.querySelector('.remove-run-btn').addEventListener('click', () => {
      card.remove();
      renderLivePreviewFromInputs();
    });
    card.querySelector('.add-bend-btn').addEventListener('click', () =>
      addBendRow(card.querySelector('.bends-list'), {})
    );

    container.appendChild(card);

    const bendsList = card.querySelector('.bends-list');
    for (const [bendIndex, b] of bends.entries()) addBendRow(bendsList, b, bendIndex);
    if (bends.length === 0) addBendRow(bendsList, {}, 0);
  }

  function addBendRow(list, bend = {}, bendIndex = null) {
    const type = bend.type || 'offset';
    const dimension = bend.dimension ?? '';
    const angle = bend.angle ?? 45;
    const normalizedLayout = normalizeBendLayout(bend, bend, bendIndex ?? list.querySelectorAll('.dynamic-row').length);
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
      <label>Station (ft)
        <input type="number" class="bend-station" min="0" step="0.1" value="${formatNumber(normalizedLayout.stationFt)}" aria-label="Bend station from run start in feet">
      </label>
      <label>Plane
        <select class="bend-plane" aria-label="Bend plane">
          <option value="horizontal" ${normalizedLayout.plane === 'horizontal' ? 'selected' : ''}>Horizontal</option>
          <option value="vertical" ${normalizedLayout.plane === 'vertical' ? 'selected' : ''}>Vertical</option>
        </select>
      </label>
      <label>Direction
        <select class="bend-direction" aria-label="Bend direction">
          ${directionOptions(normalizedLayout.plane, normalizedLayout.direction)}
        </select>
      </label>
      <button type="button" class="btn btn-sm remove-bend-btn" aria-label="Remove this bend">&times;</button>
    `;

    const typeSelect = row.querySelector('.bend-type');
    const angleLabel = row.querySelector('.angle-label');
    const planeSelect = row.querySelector('.bend-plane');
    const directionSelect = row.querySelector('.bend-direction');
    function toggleAngle() {
      const t = typeSelect.value;
      angleLabel.hidden = (t === '90' || t === 'saddle');
    }
    typeSelect.addEventListener('change', toggleAngle);
    toggleAngle();

    planeSelect.addEventListener('change', () => {
      directionSelect.innerHTML = directionOptions(planeSelect.value, directionSelect.value);
    });
    row.querySelector('.remove-bend-btn').addEventListener('click', () => {
      row.remove();
      renderLivePreviewFromInputs();
    });
    list.appendChild(row);
    renderLivePreviewFromInputs();
  }

  // -------------------------------------------------------------------
  // Pull-box card builder
  // -------------------------------------------------------------------

  function addPullBoxCard(label = '', pullType = 'straight', wallA = [], wallB = [], position = null, wallAName = 'Wall A', wallBName = 'Wall B') {
    pbCount++;
    const container = document.getElementById('pullbox-container');
    const normalizedPosition = normalizePullBoxPosition({ position: position || {} }, pbCount - 1);

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
      <div class="conduit-layout-grid">
        <label>Box X (ft)
          <input type="number" class="pb-x" step="0.1" value="${formatNumber(normalizedPosition.xFt)}" aria-label="Pull box X coordinate in feet">
        </label>
        <label>Box Y (ft)
          <input type="number" class="pb-y" step="0.1" value="${formatNumber(normalizedPosition.yFt)}" aria-label="Pull box Y coordinate in feet">
        </label>
        <label>Box Z (ft)
          <input type="number" class="pb-z" step="0.1" value="${formatNumber(normalizedPosition.zFt)}" aria-label="Pull box Z coordinate in feet">
        </label>
        <label>Wall A label
          <input type="text" class="pb-walla-name" value="${escapeHtml(wallAName || 'Wall A')}" aria-label="Pull box wall A label">
        </label>
        <label>Wall B label
          <input type="text" class="pb-wallb-name" value="${escapeHtml(wallBName || 'Wall B')}" aria-label="Pull box wall B label">
        </label>
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

    card.querySelector('.remove-pb-btn').addEventListener('click', () => {
      card.remove();
      renderLivePreviewFromInputs();
    });
    container.appendChild(card);
    renderLivePreviewFromInputs();
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
      layout: {
        start: {
          xFt: parseNumber(card.querySelector('.run-start-x').value),
          yFt: parseNumber(card.querySelector('.run-start-y').value),
          zFt: parseNumber(card.querySelector('.run-start-z').value),
        },
        end: {
          xFt: parseNumber(card.querySelector('.run-end-x').value),
          yFt: parseNumber(card.querySelector('.run-end-y').value),
          zFt: parseNumber(card.querySelector('.run-end-z').value),
        },
        headingDeg: parseNumber(card.querySelector('.run-heading').value),
        endToleranceFt: parseNumber(card.querySelector('.run-tolerance').value),
      },
      bends: Array.from(card.querySelectorAll('.bends-list .dynamic-row')).map(row => ({
        type:      row.querySelector('.bend-type').value,
        dimension: parseFloat(row.querySelector('.bend-dim').value),
        angle:     parseFloat(row.querySelector('.bend-angle').value),
        layout: {
          stationFt: parseNumber(row.querySelector('.bend-station').value),
          plane: row.querySelector('.bend-plane').value,
          direction: row.querySelector('.bend-direction').value,
        },
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
          position: readPullBoxPosition(card),
          wallAName: card.querySelector('.pb-walla-name').value.trim(),
          wallBName: card.querySelector('.pb-wallb-name').value.trim(),
        };
      }
      const parseWall = el => el.value.split(/[\s,]+/).map(parseFloat).filter(v => v > 0);
      return {
        label:    card.querySelector('.pb-label').value.trim(),
        pullType: card.querySelector('.pb-type').value,
        wallA:    parseWall(card.querySelector('.pb-walla')),
        wallB:    parseWall(card.querySelector('.pb-wallb')),
        position: readPullBoxPosition(card),
        wallAName: card.querySelector('.pb-walla-name').value.trim(),
        wallBName: card.querySelector('.pb-wallb-name').value.trim(),
      };
    });
  }

  function readPullBoxPosition(card) {
    return {
      xFt: parseNumber(card.querySelector('.pb-x').value),
      yFt: parseNumber(card.querySelector('.pb-y').value),
      zFt: parseNumber(card.querySelector('.pb-z').value),
    };
  }

  // -------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------

  function renderResults(result) {
    renderViolations(result);
    renderBendSchedule(result.runs || []);
    renderPullBoxResults(result.pullBoxResults || []);
    renderIsoPreview(result);
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

  function renderLivePreviewFromInputs() {
    const runsInput = readRunInputs();
    const pullboxInput = readPullBoxInputs();
    const result = {
      ...runConduitBendSchedule(runsInput),
      pullBoxResults: pullboxInput.map(pb => {
        try { return sizePullBox(pb); }
        catch (e) { return { label: pb.label, error: e.message }; }
      }),
      _inputs: { runs: runsInput, pullBoxes: pullboxInput },
    };
    renderIsoPreview(result);
  }

  function renderIsoPreview(result) {
    if (!isoCanvas) return;
    latestVisualModel = buildConduitBendVisualModel(result);
    isoCanvas.innerHTML = renderIsometricSvg(latestVisualModel, {
      titleId: 'conduit-iso-svg-title',
      descId: 'conduit-iso-svg-desc',
      selectedId: selectedIsoId,
      title: 'Conduit bend 3D run layout',
      desc: 'Isometric layout of conduit runs, bend stations, and pull-box coordinates.'
    });
    const summary = latestVisualModel.summary;
    isoSummary.textContent = `${summary.runs} run${summary.runs === 1 ? '' : 's'}, ${summary.bends} bend${summary.bends === 1 ? '' : 's'}, ${summary.pullBoxes} pull point${summary.pullBoxes === 1 ? '' : 's'} shown from physical layout fields.`;
    isoStatus.innerHTML = latestVisualModel.summary.hasWarnings
      ? '<span class="fill-badge fill-warn">Review layout warnings</span>'
      : '<span class="fill-badge fill-ok">Layout aligned</span>';
    syncLayoutSelectionClasses();
    renderIsoInspector();
  }

  function handleIsoSelection(event) {
    const target = event.target.closest?.('[data-iso-id]');
    if (!target) return;
    event.preventDefault();
    selectedIsoId = target.dataset.isoId;
    if (latestVisualModel) {
      isoCanvas.innerHTML = renderIsometricSvg(latestVisualModel, {
        titleId: 'conduit-iso-svg-title',
        descId: 'conduit-iso-svg-desc',
        selectedId: selectedIsoId,
        title: 'Conduit bend 3D run layout',
        desc: 'Isometric layout of conduit runs, bend stations, and pull-box coordinates.'
      });
    }
    syncLayoutSelectionClasses();
    renderIsoInspector();
  }

  function handleLayoutInputSelection(event) {
    if (event.target.closest('button')) return;
    const bendRow = event.target.closest('#runs-container .dynamic-row');
    if (bendRow) {
      const runCard = bendRow.closest('#runs-container .dynamic-card');
      const runCards = [...document.querySelectorAll('#runs-container .dynamic-card')];
      const runIndex = runCards.indexOf(runCard);
      const bendIndex = [...runCard.querySelectorAll('.dynamic-row')].indexOf(bendRow);
      if (runIndex >= 0 && bendIndex >= 0) {
        selectedIsoId = `run-${runIndex}-bend-${bendIndex}`;
        renderIsoPreview({
          ...runConduitBendSchedule(readRunInputs()),
          pullBoxResults: readPullBoxInputs().map(pb => {
            try { return sizePullBox(pb); }
            catch (e) { return { label: pb.label, error: e.message }; }
          }),
          _inputs: { runs: readRunInputs(), pullBoxes: readPullBoxInputs() }
        });
      }
      return;
    }

    const pullBoxCard = event.target.closest('#pullbox-container .dynamic-card');
    if (pullBoxCard) {
      const index = [...document.querySelectorAll('#pullbox-container .dynamic-card')].indexOf(pullBoxCard);
      if (index >= 0) {
        selectedIsoId = `pullbox-${index}`;
        renderLivePreviewFromInputs();
      }
    }
  }

  function syncLayoutSelectionClasses() {
    document.querySelectorAll('#runs-container .dynamic-row').forEach(row => {
      const runCard = row.closest('#runs-container .dynamic-card');
      const runIndex = [...document.querySelectorAll('#runs-container .dynamic-card')].indexOf(runCard);
      const bendIndex = [...runCard.querySelectorAll('.dynamic-row')].indexOf(row);
      row.classList.toggle('iso-linked-selected', selectedIsoId === `run-${runIndex}-bend-${bendIndex}`);
    });
    document.querySelectorAll('#pullbox-container .dynamic-card').forEach((card, index) => {
      card.classList.toggle('iso-linked-selected', selectedIsoId === `pullbox-${index}`);
    });
  }

  function renderIsoInspector() {
    if (!isoInspector || !latestVisualModel) return;
    const selected = [
      ...(latestVisualModel.markers || []),
      ...(latestVisualModel.segments || [])
    ].find(item => item.id === selectedIsoId);
    const warnings = latestVisualModel.warnings || [];
    if (!selected) {
      isoInspector.innerHTML = `
        <strong>Layout Inspector</strong>
        <p class="field-hint">Select a bend, endpoint, segment, or pull box in the visual to inspect it.</p>
        ${warnings.length ? `<ul class="iso-warning-list">${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>` : ''}`;
      return;
    }
    isoInspector.innerHTML = `
      <strong>${escapeHtml(selected.label || selected.id)}</strong>
      <dl class="iso-facts">
        <div><dt>Type</dt><dd>${escapeHtml(selected.kind || 'layout item')}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(selected.status || 'ok')}</dd></div>
      </dl>
      ${warnings.length ? `<ul class="iso-warning-list">${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>` : ''}`;
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

  function legacyInputsFromResult(result) {
    return {
      runs: (result.runs || []).map((run, index) => ({
        label: run.label || `Conduit Run ${index + 1}`,
        tradeSize: run.tradeSize || 1,
        layout: normalizeConduitRunLayout({}, run, index),
        bends: (run.bends || []).map((bend, bendIndex) => ({
          type: bend.type || 'offset',
          dimension: bend.dimension ?? '',
          angle: bend.angle || 45,
          layout: normalizeBendLayout({}, bend, bendIndex),
        })),
      })),
      pullBoxes: (result.pullBoxResults || []).map((box, index) => ({
        label: box.label || `Pull Box ${index + 1}`,
        pullType: box.pullType || 'straight',
        largestTradeSize: 1,
        wallA: [1],
        wallB: [],
        position: normalizePullBoxPosition({}, index),
        wallAName: 'Wall A',
        wallBName: 'Wall B',
      })),
    };
  }

  function restoreInputs(inputs) {
    if (!inputs) return;
    const { runs = [], pullBoxes = [] } = inputs;
    for (const r of runs) addRunCard(r.label, r.tradeSize, r.bends || [], r.layout || null);
    for (const pb of pullBoxes) {
      addPullBoxCard(pb.label, pb.pullType,
        pb.wallA || (pb.largestTradeSize ? [pb.largestTradeSize] : []),
        pb.wallB || [],
        pb.position || null,
        pb.wallAName || 'Wall A',
        pb.wallBName || 'Wall B');
    }
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  function parseNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function formatNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? String(Math.round(number * 100) / 100) : '';
  }

  function tradeSizeOptions(selected = 1) {
    return TRADE_SIZES.map(ts =>
      `<option value="${ts}" ${ts === parseFloat(selected) ? 'selected' : ''}>${ts}"</option>`
    ).join('');
  }

  function angleOptions(selected = 45) {
    return OFFSET_ANGLES.map(a =>
      `<option value="${a}" ${a === parseFloat(selected) ? 'selected' : ''}>${a}°</option>`
    ).join('');
  }

  function directionOptions(plane = 'horizontal', selected = '') {
    const options = plane === 'vertical'
      ? [['rise', 'Rise'], ['drop', 'Drop']]
      : [['left', 'Left'], ['right', 'Right']];
    const selectedValue = options.some(([value]) => value === selected) ? selected : options[0][0];
    return options.map(([value, label]) =>
      `<option value="${value}" ${value === selectedValue ? 'selected' : ''}>${label}</option>`
    ).join('');
  }
});
