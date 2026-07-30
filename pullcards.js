import {
  buildPullTable,
  cableQRPayload,
  createPullPlanArtifact,
} from './analysis/pullCards.mjs';
import { parsePullRouteRows } from './analysis/pullCardRouteImport.mjs';
import { buildPullRouteVisualModel } from './analysis/pullCardVisualModel.mjs';
import { buildDeliverableReadinessDiagnostics, filterRouteResultsForProject, normalizeRouteResults } from './analysis/deliverableWorkflow.mjs';
import {
  getTrays,
  getCables,
  getConduits,
  getDuctbanks,
  getStudies,
  getReportSnapshots,
  getLifecyclePackages,
  getProjectInputFingerprint,
  getItem,
  setItem,
  upsertDeliverableArtifact,
  keys,
} from './dataStore.mjs';
import { normalizeDeliverableArtifact } from './analysis/deliverableArtifacts.mjs';
import { renderIsometricSvg } from './src/utils/isometricSvg.js';
import { showAlertModal } from './src/components/modal.js';

document.addEventListener('DOMContentLoaded', () => {
  const PULL_PLAN_KEY = 'pullPlanArtifact';
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const importXlsxBtn = document.getElementById('importXlsxBtn');
  const xlsxFileInput = document.getElementById('xlsxFileInput');
  const loadFromProjectBtn = document.getElementById('loadFromProjectBtn');
  const summarySection = document.getElementById('summarySection');
  const summaryCards = document.getElementById('summaryCards');
  const pullVisualSection = document.getElementById('pullVisualSection');
  const pullIsoCanvas = document.getElementById('pull-iso-canvas');
  const pullIsoSummary = document.getElementById('pull-iso-summary');
  const pullIsoStatus = document.getElementById('pull-iso-status');
  const pullIsoInspector = document.getElementById('pull-iso-inspector');
  const pullTableSection = document.getElementById('pullTableSection');
  const pullTableBody = document.querySelector('#pullTable tbody');
  const pullCardDetail = document.getElementById('pullCardDetail');
  const pullCardTitle = document.getElementById('pullCardTitle');
  const pullCardContent = document.getElementById('pullCardContent');
  const backToTableBtn = document.getElementById('backToTableBtn');
  const exportPullTableBtn = document.getElementById('exportPullTableBtn');
  const exportPullCardsBtn = document.getElementById('exportPullCardsBtn');
  const savePullPlanBtn = document.getElementById('savePullPlanBtn');
  const pullPlanSaveStatus = document.getElementById('pullPlanSaveStatus');
  const pullHandoff = document.getElementById('pull-deliverable-handoff');

  let currentPulls = null;
  let selectedPullNumber = null;
  let currentRouteResults = [];
  let currentCableList = [];
  let currentRouteSource = 'Pull Cards';

  // ---- Import from XLSX ----

  importXlsxBtn.addEventListener('click', () => xlsxFileInput.click());

  xlsxFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!globalThis.XLSX) {
      showAlertModal('XLSX library not loaded. Please refresh and try again.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const routeResults = parseRouteXLSX(wb);
        if (!routeResults.length) {
          showAlertModal('No route data found in the file. Make sure you are importing route_data.xlsx or route_data.csv from the Optimal Route page.');
          return;
        }
        const cableList = getCables();
        generatePullCards(routeResults, cableList, null, file.name);
      } catch (err) {
        showAlertModal(`Failed to parse file: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
    xlsxFileInput.value = '';
  });

  // ---- Load from project route results ----

  loadFromProjectBtn.addEventListener('click', () => {
    const candidate = bestRouteResultCandidate();
    if (candidate) {
      generatePullCards(candidate.routeResults, getCables(), null, candidate.label);
      renderPullDeliverableHandoff(candidate);
      return;
    }
    showAlertModal('No route results found in the current session. Please run cable routing on the Optimal Route page first, or import a route_data.xlsx file.');
  });

  // ---- Parse route XLSX into result-like objects ----

  function parseRouteXLSX(wb) {
    const segSheet = wb.Sheets['Segments'] || wb.Sheets[wb.SheetNames?.[0]];
    if (!segSheet) return [];

    const rows = XLSX.utils.sheet_to_json(segSheet, { defval: '' });
    if (!rows.length) return [];

    const routeSummarySheet = wb.Sheets['Summary'];
    const routeSummaryRows = routeSummarySheet ? XLSX.utils.sheet_to_json(routeSummarySheet, { defval: '' }) : [];
    return parsePullRouteRows(rows, routeSummaryRows);
  }

  // ---- Generate pull cards from results ----

  function readSavedPullArtifact() {
    const saved = getItem(PULL_PLAN_KEY, null);
    return saved && saved.schemaVersion === 1 && saved.pulls && typeof saved.pulls === 'object'
      ? saved
      : null;
  }

  function savedAssumptionsByPull() {
    const saved = readSavedPullArtifact();
    if (!saved) return {};
    return Object.fromEntries(Object.entries(saved.pulls).map(([id, pull]) => [
      id,
      pull?.assumptions || {},
    ]));
  }

  function generatePullCards(routeResults, cableList, assumptionOverrides = null, source = currentRouteSource) {
    currentRouteResults = Array.isArray(routeResults) ? routeResults : [];
    currentCableList = Array.isArray(cableList) ? cableList : [];
    currentRouteSource = source || 'Pull Cards';
    const assumptionsByPull = assumptionOverrides || savedAssumptionsByPull();
    const { pulls, summary } = buildPullTable(currentRouteResults, currentCableList, {
      baseURL: fieldViewBaseURL(),
      assumptionsByPull,
    });
    currentPulls = pulls;
    selectedPullNumber = pulls[0]?.pull_number ?? null;

    // Render summary
    summaryCards.innerHTML = `
      <div class="summary-stat">
        <span class="stat-value">${summary.total_cables}</span>
        <span class="stat-label">Total Cables</span>
      </div>
      <div class="summary-stat">
        <span class="stat-value">${summary.total_pulls}</span>
        <span class="stat-label">Total Pulls</span>
      </div>
      <div class="summary-stat">
        <span class="stat-value">${summary.multi_cable_pulls}</span>
        <span class="stat-label">Multi-Cable Pulls</span>
      </div>
      <div class="summary-stat">
        <span class="stat-value">${summary.single_cable_pulls}</span>
        <span class="stat-label">Single-Cable Pulls</span>
      </div>
      <div class="summary-stat">
        <span class="stat-value">${summary.cables_per_pull_avg}</span>
        <span class="stat-label">Avg Cables/Pull</span>
      </div>
      <div class="summary-stat">
        <span class="stat-value">${summary.pulls_requiring_input}</span>
        <span class="stat-label">Pulls Requiring Input</span>
      </div>`;

    summarySection.hidden = false;

    // Render pull table
    pullTableBody.innerHTML = pulls.map(p => {
      const tagsDisplay = p.cable_tags.length <= 3
        ? esc(p.cable_tags.join(', '))
        : esc(p.cable_tags.slice(0, 3).join(', ')) + ` +${p.cable_tags.length - 3} more`;
      const multiClass = p.cable_count > 1 ? 'multi-cable-pull' : '';
      const selectedClass = p.pull_number === selectedPullNumber ? 'pull-table-selected' : '';
      return `<tr class="${multiClass} ${selectedClass}" data-pull="${p.pull_number}" tabindex="0" aria-selected="${p.pull_number === selectedPullNumber ? 'true' : 'false'}">
        <td>${p.pull_number}</td>
        <td>${esc(p.cable_type)}</td>
        <td>${p.cable_count}</td>
        <td>${tagsDisplay}</td>
        <td>${esc(p.from)}</td>
        <td>${esc(p.to)}</td>
        <td>${p.total_length_ft}</td>
        <td>${formatEngineeringValue(p.total_weight_lb_ft)}</td>
        <td>${formatEngineeringValue(p.estimated_tension_lbs)}</td>
        <td>${esc(p.direction_label)}</td>
        <td><span class="status-badge ${engineeringStatusClass(p)}">${esc(engineeringStatusLabel(p))}</span></td>
        <td>${p.segment_count}</td>
        <td><button class="btn view-pull-btn" data-pull="${p.pull_number}">View</button></td>
      </tr>`;
    }).join('');

    pullTableSection.hidden = false;
    pullCardDetail.hidden = true;
    renderSelectedPullVisual();
    renderPullDeliverableHandoff();
    renderPullPlanSaveStatus();

    // Wire up view buttons
    pullTableBody.querySelectorAll('tr[data-pull]').forEach(row => {
      row.addEventListener('click', (event) => {
        if (event.target.closest('button')) return;
        selectPull(parseInt(row.dataset.pull, 10));
      });
      row.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        selectPull(parseInt(row.dataset.pull, 10));
      });
    });

    pullTableBody.querySelectorAll('.view-pull-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const num = parseInt(btn.dataset.pull, 10);
        selectPull(num);
        showPullCard(num);
      });
    });
  }

  function saveCurrentPullPlan() {
    if (!currentPulls?.length) {
      showAlertModal('No pull data to save. Generate pull cards first.');
      return null;
    }
    const artifact = createPullPlanArtifact(currentPulls, { source: currentRouteSource });
    setItem(PULL_PLAN_KEY, artifact);
    upsertDeliverableArtifact(normalizeDeliverableArtifact({
      id: 'pull-plan-current',
      type: 'pull-plan',
      title: 'Current Cable Pull Plan',
      revision: 'current',
      status: 'draft',
      generatedAt: artifact.generatedAt,
      sourceFingerprint: getProjectInputFingerprint(),
      sourcePage: 'pullcards.html',
      includedSections: ['pullPlans'],
      summary: {
        pulls: Object.keys(artifact.pulls || {}).length,
        warnings: currentPulls.reduce((count, pull) => count + (pull.coverage_warnings?.length || 0), 0),
        failedLimits: currentPulls.filter(pull => pull.tension_status === 'fail' || pull.sidewall_status === 'fail').length,
      },
    }));
    renderPullPlanSaveStatus(artifact);
    return artifact;
  }

  function renderPullPlanSaveStatus(artifact = readSavedPullArtifact()) {
    if (!pullPlanSaveStatus) return;
    if (!artifact) {
      pullPlanSaveStatus.textContent = 'No project pull plan has been saved.';
      return;
    }
    const count = Object.keys(artifact.pulls || {}).length;
    const timestamp = new Date(artifact.generatedAt);
    const savedWhen = Number.isNaN(timestamp.getTime())
      ? 'time unavailable'
      : timestamp.toLocaleString();
    pullPlanSaveStatus.textContent = `Saved ${count} pull plan${count === 1 ? '' : 's'} to this project (${savedWhen}).`;
  }

  savePullPlanBtn?.addEventListener('click', () => {
    const artifact = saveCurrentPullPlan();
    if (artifact) {
      showAlertModal('Pull plan saved to the current project.');
    }
  });

  function addRouteCandidate(candidates, seen, key, label, payload, projectData) {
    const routeResults = filterRouteResultsForProject(normalizeRouteResults(payload), projectData);
    if (!routeResults.length || seen.has(key)) return;
    seen.add(key);
    const updatedAt = payload?.updatedAt || payload?.generatedAt || payload?.createdAt || payload?.timestamp || '';
    candidates.push({
      key,
      label,
      routeResults,
      updatedAt,
      source: payload?.source || label,
    });
  }

  function readSessionRouteCandidates(candidates, seen, projectData) {
    try {
      for (const key of Object.keys(sessionStorage)) {
        const normalized = key.toLowerCase();
        if (!normalized.includes('routecache') && !normalized.includes('routeresult')) continue;
        let payload = null;
        try {
          payload = JSON.parse(sessionStorage.getItem(key));
        } catch {
          payload = null;
        }
        addRouteCandidate(candidates, seen, `session:${key}`, 'Current session route cache', payload, projectData);
      }
    } catch {
      // Session storage can be unavailable in hardened browser contexts.
    }
  }

  function readRouteResultCandidates() {
    const candidates = [];
    const seen = new Set();
    const projectData = {
      cables: getCables(),
      trays: getTrays(),
      conduits: getConduits(),
      ductbanks: getDuctbanks(),
    };
    addRouteCandidate(candidates, seen, 'latestRouteResults', 'Latest project route results', getItem('latestRouteResults', null), projectData);

    for (const key of keys()) {
      const lower = String(key).toLowerCase();
      if (key === 'latestRouteResults') continue;
      if (!lower.includes('routecache') && !lower.includes('routeresult') && !lower.startsWith('route-')) continue;
      addRouteCandidate(candidates, seen, `project:${key}`, `Project route cache (${key})`, getItem(key, null), projectData);
    }

    readSessionRouteCandidates(candidates, seen, projectData);
    return candidates;
  }

  function routeCandidateTime(candidate) {
    const time = Date.parse(candidate?.updatedAt || '');
    return Number.isFinite(time) ? time : 0;
  }

  function bestRouteResultCandidate() {
    const candidates = readRouteResultCandidates();
    if (candidates.length) {
      return candidates.sort((a, b) => {
        const timeDelta = routeCandidateTime(b) - routeCandidateTime(a);
        if (timeDelta) return timeDelta;
        return b.routeResults.length - a.routeResults.length;
      })[0];
    }

    const derived = currentDeliverableDiagnostics([]).routeResults;
    if (!derived.length) return null;
    return {
      key: 'derived-cable-route-segments',
      label: 'Cable schedule route segments',
      routeResults: derived,
      updatedAt: '',
      source: 'cableSchedule',
    };
  }

  function currentDeliverableDiagnostics(routeResults = []) {
    return buildDeliverableReadinessDiagnostics({
      cables: getCables(),
      trays: getTrays(),
      conduits: getConduits(),
      ductbanks: getDuctbanks(),
      studies: getStudies(),
      routeResults,
      reportSnapshots: getReportSnapshots(),
      lifecyclePackages: getLifecyclePackages(),
    });
  }

  function renderPullDeliverableHandoff(candidate = bestRouteResultCandidate()) {
    if (!pullHandoff) return;
    const routeResults = candidate?.routeResults || [];
    const diagnostics = currentDeliverableDiagnostics(routeResults);
    const missing = diagnostics.missingRouteResultTags.length;
    const ready = routeResults.length > 0;
    pullHandoff.classList.toggle('is-warning', !ready || missing > 0);
    pullHandoff.classList.toggle('is-ready', ready && missing === 0);

    if (!ready) {
      pullHandoff.innerHTML = `
        <div>
          <strong>Run routing before creating pull cards.</strong>
          <p>No saved route results are available. Pull cards need route results from Optimal Route or a route_data.xlsx import.</p>
        </div>
        <span class="workflow-next-action__meta">${diagnostics.health.routingReady} routing-ready cable(s)</span>
        <div class="workflow-next-action__actions">
          <a class="btn primary-btn" href="optimalRoute.html">Open Optimal Route</a>
          <a class="btn secondary-btn" href="cableschedule.html">Cable Schedule</a>
        </div>`;
      return;
    }

    const routeLabel = candidate?.label || 'Project route results';
    const missingText = missing
      ? `${missing} schedule-ready cable(s) are missing route results`
      : 'All schedule-ready routed cables have matching route results';
    pullHandoff.innerHTML = `
      <div>
        <strong>Pull-card inputs are available.</strong>
        <p>${esc(routeLabel)}: ${routeResults.length} routed cable(s), ${diagnostics.health.pullGroups} pull group(s). ${esc(missingText)}.</p>
      </div>
      <span class="workflow-next-action__meta">${diagnostics.health.routeCoverage}% route coverage</span>
      <div class="workflow-next-action__actions">
        <button type="button" class="btn primary-btn" data-action="load-project-routes">Load Route Results</button>
        <a class="btn secondary-btn" href="spoolsheets.html">Spool Sheets</a>
        <a class="btn secondary-btn" href="projectreport.html">Project Report</a>
      </div>`;
    pullHandoff.querySelector('[data-action="load-project-routes"]')?.addEventListener('click', () => {
      generatePullCards(routeResults, getCables());
    });
  }

  function selectPull(pullNumber) {
    if (!currentPulls) return;
    const number = Number(pullNumber);
    if (!currentPulls.some(pull => pull.pull_number === number)) return;
    selectedPullNumber = number;
    updatePullTableSelection();
    renderSelectedPullVisual();
  }

  function updatePullTableSelection() {
    pullTableBody.querySelectorAll('tr[data-pull]').forEach(row => {
      const selected = Number(row.dataset.pull) === selectedPullNumber;
      row.classList.toggle('pull-table-selected', selected);
      row.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
  }

  function renderSelectedPullVisual() {
    if (!currentPulls || !currentPulls.length || selectedPullNumber === null) {
      pullVisualSection.hidden = true;
      return;
    }
    const pull = currentPulls.find(p => p.pull_number === selectedPullNumber);
    if (!pull) {
      pullVisualSection.hidden = true;
      return;
    }

    const model = buildPullRouteVisualModel(pull);
    pullVisualSection.hidden = false;
    pullIsoSummary.textContent = `Pull #${pull.pull_number}: ${pull.cable_count} cable${pull.cable_count === 1 ? '' : 's'}, ${pull.total_length_ft} ft, ${formatEngineeringValue(pull.estimated_tension_lbs)} lb estimated tension, ${pull.direction_label}`;
    pullIsoStatus.innerHTML = `
      <span class="status-badge ${model.hasCoordinates ? 'status-ok' : 'status-warning'}">${model.hasCoordinates ? 'Exact coordinates' : 'Coordinate data missing'}</span>
      <span class="status-badge ${engineeringStatusClass(pull)}">${esc(engineeringStatusLabel(pull))}</span>`;
    pullIsoCanvas.innerHTML = renderPullVisualCanvas(model, 'pull-iso-svg-title', 'pull-iso-svg-desc');
    pullIsoInspector.innerHTML = renderPullInspector(model, pull);
  }

  function renderPullVisualCanvas(model, titleId, descId) {
    if (!model.segments.length) {
      return `<div class="iso-empty-state">
        <strong>Coordinate data missing</strong>
        <span>Re-export route_data.xlsx from Optimal Route, then import it here for an exact 3D path.</span>
      </div>`;
    }
    return renderIsometricSvg(model, {
      titleId,
      descId,
      title: model.title,
      desc: model.description
    });
  }

  function renderPullInspector(model, pull) {
    const summary = model.summary || {};
    const traceRows = (pull.tension_trace || []).map(trace => `<li>
      <span>Step ${trace.index + 1}</span>
      <strong>${formatNumber(trace.tensionOut)} lb</strong>
      <small>${formatNumber(trace.sidewallPressure)} lb/ft sidewall</small>
    </li>`).join('');
    const warnings = [...new Set([
      ...(model.warnings || []),
      ...(pull.coverage_warnings || []),
    ])].map(warning => `<li>${esc(warning)}</li>`).join('');
    return `
      <div class="iso-facts">
        <span><strong>${summary.exactSegments || 0}/${summary.segmentCount || 0}</strong> coordinate segments</span>
        <span><strong>${formatEngineeringValue(pull.max_sidewall_pressure)}</strong> lb/ft max sidewall</span>
      </div>
      ${warnings ? `<ul class="iso-warning-list">${warnings}</ul>` : ''}
      <h3>Tension Profile</h3>
      <ul class="iso-trace-list">${traceRows || '<li><span>No tension trace available</span></li>'}</ul>`;
  }

  // ---- Show individual pull card ----

  function showPullCard(pullNumber) {
    if (!currentPulls) return;
    const pull = currentPulls.find(p => p.pull_number === pullNumber);
    if (!pull) return;
    selectPull(pullNumber);

    pullCardTitle.textContent = `Pull Card #${pull.pull_number}`;
    const visualModel = buildPullRouteVisualModel(pull);
    const visualHtml = renderPullVisualCanvas(
      visualModel,
      `pull-card-iso-title-${pull.pull_number}`,
      `pull-card-iso-desc-${pull.pull_number}`
    );

    const cableRows = pull.cables.map(c => {
      const fieldViewUrl = c.field_view_url || cableQRPayload(c.tag, fieldViewBaseURL());
      return `<tr>
      <td>${esc(c.tag)}</td>
      <td>${esc(c.cable_type)}</td>
      <td>${c.conductors}</td>
      <td>${esc(c.conductor_size)}</td>
      <td>${formatEngineeringValue(c.diameter)}</td>
      <td>${formatEngineeringValue(c.weight)}</td>
      <td>${esc(c.allowed_cable_group || '—')}</td>
      <td><a href="${escAttr(fieldViewUrl)}">Open</a></td>
    </tr>`;
    }).join('');

    const routeRows = pull.route_steps.map(s => `<tr>
      <td>${s.step}</td>
      <td>${esc(s.type)}</td>
      <td>${esc(s.id || '—')}</td>
      <td>${s.length}</td>
      <td>${esc(formatPoint(s.start))}</td>
      <td>${esc(formatPoint(s.end))}</td>
    </tr>`).join('');
    const coverageWarnings = (pull.coverage_warnings || [])
      .map(warning => `<li>${esc(warning)}</li>`)
      .join('');
    const assumptions = pull.assumptions || {};
    const forward = pull.direction_comparison?.forward;
    const reverse = pull.direction_comparison?.reverse;
    const jamRatio = pull.jam_check?.ratio === null || pull.jam_check?.ratio === undefined
      ? 'Not calculated'
      : pull.jam_check.ratio;

    pullCardContent.innerHTML = `
      <div class="pull-card-visual iso-detail-panel">
        <div>
          <h3>3D Route</h3>
          <p class="field-hint">${visualModel.hasCoordinates ? 'Exact start/end coordinates from route data.' : 'Route steps are present, but exact segment coordinates are missing.'}</p>
        </div>
        ${visualHtml}
        <aside class="iso-inspector">${renderPullInspector(visualModel, pull)}</aside>
      </div>
      <section class="pull-engineering-panel" aria-labelledby="pull-engineering-title-${pull.pull_number}">
        <div class="pull-engineering-header">
          <div>
            <h3 id="pull-engineering-title-${pull.pull_number}">Pull Engineering Inputs</h3>
            <p class="field-hint">These assumptions apply to this pull only. Apply saves a project pull-plan artifact through project storage.</p>
          </div>
          <span class="status-badge ${engineeringStatusClass(pull)}">${esc(engineeringStatusLabel(pull))}</span>
        </div>
        <form class="pull-assumption-form" data-pull-plan-id="${escAttr(pull.pull_plan_id)}">
          <label>Friction coefficient
            <input name="coeffFriction" type="number" min="0.01" max="2" step="0.01" required value="${engineeringInputValue(assumptions.coeffFriction)}">
          </label>
          <label>Allowable tension (lbf)
            <input name="allowableTensionLbf" type="number" min="0" step="1" value="${engineeringInputValue(assumptions.allowableTensionLbf ?? pull.allowable_tension_lbs)}">
          </label>
          <label>Allowable sidewall pressure (lbf/ft)
            <input name="allowableSidewallPressureLbfFt" type="number" min="0" step="1" value="${engineeringInputValue(assumptions.allowableSidewallPressureLbfFt ?? pull.allowable_sidewall_pressure)}">
          </label>
          <label>Default bend radius (ft)
            <input name="bendRadiusFt" type="number" min="0.01" step="0.01" required value="${engineeringInputValue(assumptions.bendRadiusFt)}">
          </label>
          <label>Default bend angle (degrees)
            <input name="bendAngleDeg" type="number" min="1" max="360" step="1" required value="${engineeringInputValue(assumptions.bendAngleDeg)}">
          </label>
          <label>Conduit inside diameter (in)
            <input name="conduitInnerDiameterIn" type="number" min="0" step="0.01" value="${engineeringInputValue(assumptions.conduitInnerDiameterIn)}">
          </label>
          <label>Incoming tension (lbf)
            <input name="incomingTensionLbf" type="number" min="0" step="1" required value="${engineeringInputValue(assumptions.incomingTensionLbf)}">
          </label>
          <label>Pull direction
            <select name="pullDirection">
              <option value="auto"${assumptions.pullDirection === 'auto' ? ' selected' : ''}>Auto — lower screening demand</option>
              <option value="forward"${assumptions.pullDirection === 'forward' ? ' selected' : ''}>Forward — route start to end</option>
              <option value="reverse"${assumptions.pullDirection === 'reverse' ? ' selected' : ''}>Reverse — route end to start</option>
            </select>
          </label>
          <button type="submit" class="btn primary-btn">Apply &amp; Save Pull Plan</button>
        </form>
        <div class="pull-engineering-results">
          <table class="result-table" aria-label="Pull direction comparison">
            <thead><tr><th scope="col">Direction</th><th scope="col">Max Tension (lbf)</th><th scope="col">Max SWP (lbf/ft)</th></tr></thead>
            <tbody>
              <tr><th scope="row">Forward</th><td>${formatEngineeringValue(forward?.max_tension_lbs)}</td><td>${formatEngineeringValue(forward?.max_sidewall_pressure)}</td></tr>
              <tr><th scope="row">Reverse</th><td>${formatEngineeringValue(reverse?.max_tension_lbs)}</td><td>${formatEngineeringValue(reverse?.max_sidewall_pressure)}</td></tr>
            </tbody>
          </table>
          <div class="pull-jam-result">
            <strong>Jam screening: ${esc(pull.jam_check?.status || 'not-applicable')}</strong>
            <span>Ratio: ${esc(jamRatio)}</span>
            <p>${esc(pull.jam_check?.message || 'No jam screening result.')}</p>
          </div>
        </div>
        ${coverageWarnings ? `<div class="pull-coverage-warning" role="status"><strong>Inputs requiring review</strong><ul>${coverageWarnings}</ul></div>` : '<p class="pull-coverage-complete">Engineering input coverage is complete.</p>'}
      </section>
      <div class="pull-card-grid">
        <div class="pull-card-info">
          <table class="result-table" aria-label="Pull card summary">
            <tbody>
              <tr><th scope="row">Pull Number</th><td>${pull.pull_number}</td></tr>
              <tr><th scope="row">Cable Type</th><td>${esc(pull.cable_type)}</td></tr>
              <tr><th scope="row">Cable Count</th><td>${pull.cable_count}</td></tr>
              <tr><th scope="row">From</th><td>${esc(pull.from)}</td></tr>
              <tr><th scope="row">To</th><td>${esc(pull.to)}</td></tr>
              <tr><th scope="row">Pull Direction</th><td>${esc(pull.direction_label)}</td></tr>
              <tr><th scope="row">Total Length</th><td>${pull.total_length_ft} ft</td></tr>
              <tr><th scope="row">Combined Weight</th><td>${formatEngineeringValue(pull.total_weight_lb_ft)} lbs/ft</td></tr>
              <tr><th scope="row">Max Cable OD</th><td>${formatEngineeringValue(pull.max_diameter_in)} in</td></tr>
              <tr><th scope="row">Total Cross-Section</th><td>${formatEngineeringValue(pull.total_cross_section_area_sqin)} sq in</td></tr>
              <tr><th scope="row">Segment Count</th><td>${pull.segment_count}</td></tr>
              <tr><th scope="row">Estimated Tension</th><td>${formatEngineeringValue(pull.estimated_tension_lbs)} lbs</td></tr>
              <tr><th scope="row">Max Tension</th><td>${formatEngineeringValue(pull.max_tension_lbs)} / ${formatEngineeringValue(pull.allowable_tension_lbs)} lbs (${esc(pull.tension_status)})</td></tr>
              <tr><th scope="row">Max Sidewall Pressure</th><td>${formatEngineeringValue(pull.max_sidewall_pressure)} / ${formatEngineeringValue(pull.allowable_sidewall_pressure)} lbs/ft (${esc(pull.sidewall_status)})</td></tr>
            </tbody>
          </table>
        </div>

        <div class="pull-card-cables">
          <h3>Cables in This Pull</h3>
          <table class="result-table" aria-label="Cables in pull">
            <thead>
              <tr>
                <th scope="col">Tag</th>
                <th scope="col">Type</th>
                <th scope="col">Conductors</th>
                <th scope="col">Size</th>
                <th scope="col">OD (in)</th>
                <th scope="col">Weight (lbs/ft)</th>
                <th scope="col">Group</th>
                <th scope="col">Field View</th>
              </tr>
            </thead>
            <tbody>${cableRows}</tbody>
          </table>
        </div>

        <div class="pull-card-route">
          <h3>Route Detail</h3>
          <table class="result-table" aria-label="Pull route segments">
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">Type</th>
                <th scope="col">Raceway ID</th>
                <th scope="col">Length (ft)</th>
                <th scope="col">Start XYZ (ft)</th>
                <th scope="col">End XYZ (ft)</th>
              </tr>
            </thead>
            <tbody>${routeRows}</tbody>
          </table>
        </div>
      </div>`;

    pullCardContent.querySelector('.pull-assumption-form')?.addEventListener('submit', event => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const pullId = event.currentTarget.dataset.pullPlanId;
      const assumptionMap = Object.fromEntries((currentPulls || []).map(item => [
        item.pull_plan_id,
        { ...item.assumptions },
      ]));
      assumptionMap[pullId] = {
        coeffFriction: formData.get('coeffFriction'),
        allowableTensionLbf: formData.get('allowableTensionLbf'),
        allowableSidewallPressureLbfFt: formData.get('allowableSidewallPressureLbfFt'),
        bendRadiusFt: formData.get('bendRadiusFt'),
        bendAngleDeg: formData.get('bendAngleDeg'),
        conduitInnerDiameterIn: formData.get('conduitInnerDiameterIn'),
        incomingTensionLbf: formData.get('incomingTensionLbf'),
        pullDirection: formData.get('pullDirection'),
      };
      generatePullCards(currentRouteResults, currentCableList, assumptionMap, currentRouteSource);
      saveCurrentPullPlan();
      const updated = currentPulls.find(item => item.pull_plan_id === pullId);
      if (updated) showPullCard(updated.pull_number);
    });

    pullTableSection.hidden = true;
    pullVisualSection.hidden = true;
    pullCardDetail.hidden = false;
  }

  backToTableBtn.addEventListener('click', () => {
    pullCardDetail.hidden = true;
    pullTableSection.hidden = false;
    renderSelectedPullVisual();
  });

  // ---- XLSX Export ----

  exportPullTableBtn.addEventListener('click', () => {
    if (!currentPulls || !currentPulls.length) {
      showAlertModal('No pull data to export. Generate pull cards first.');
      return;
    }
    if (!globalThis.XLSX) {
      showAlertModal('XLSX library not loaded.');
      return;
    }

    const tableRows = currentPulls.map(p => ({
      'Pull #': p.pull_number,
      'Cable Type': p.cable_type,
      'Cable Count': p.cable_count,
      'Cable Tags': p.cable_tags.join(', '),
      'From': p.from,
      'To': p.to,
      'Total Length (ft)': p.total_length_ft,
      'Weight (lbs/ft)': p.total_weight_lb_ft,
      'Max OD (in)': p.max_diameter_in,
      'Cross Section (sq in)': p.total_cross_section_area_sqin,
      'Segments': p.segment_count,
      'Pull Direction': p.direction_label,
      'Forward Max Tension (lbs)': p.direction_comparison?.forward?.max_tension_lbs ?? '',
      'Reverse Max Tension (lbs)': p.direction_comparison?.reverse?.max_tension_lbs ?? '',
      'Est. Tension (lbs)': p.estimated_tension_lbs,
      'Max Tension (lbs)': p.max_tension_lbs,
      'Allowable Tension (lbs)': p.allowable_tension_lbs ?? '',
      'Tension Status': p.tension_status,
      'Max Sidewall (lbs/ft)': p.max_sidewall_pressure,
      'Allowable Sidewall (lbs/ft)': p.allowable_sidewall_pressure ?? '',
      'Sidewall Status': p.sidewall_status,
      'Jam Status': p.jam_check?.status || '',
      'Jam Ratio': p.jam_check?.ratio ?? '',
      'Input Warnings': (p.coverage_warnings || []).join('; '),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(tableRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Pull Table');
    XLSX.writeFile(wb, 'pull_table.xlsx');
  });

  exportPullCardsBtn.addEventListener('click', () => {
    if (!currentPulls || !currentPulls.length) {
      showAlertModal('No pull data to export. Generate pull cards first.');
      return;
    }
    if (!globalThis.XLSX) {
      showAlertModal('XLSX library not loaded.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryRows = currentPulls.map(p => ({
      'Pull #': p.pull_number,
      'Cable Type': p.cable_type,
      'Cable Count': p.cable_count,
      'Cable Tags': p.cable_tags.join(', '),
      'From': p.from,
      'To': p.to,
      'Total Length (ft)': p.total_length_ft,
      'Weight (lbs/ft)': p.total_weight_lb_ft,
      'Est. Tension (lbs)': p.estimated_tension_lbs,
      'Pull Direction': p.direction_label,
      'Engineering Status': engineeringStatusLabel(p),
      'Input Warnings': (p.coverage_warnings || []).join('; '),
    }));
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Pull Summary');

    // Cable detail sheet
    const cableRows = [];
    for (const p of currentPulls) {
      for (const c of p.cables) {
        cableRows.push({
          'Pull #': p.pull_number,
          'Cable Tag': c.tag,
          'Cable Type': c.cable_type,
          'Conductors': c.conductors,
          'Conductor Size': c.conductor_size,
          'OD (in)': c.diameter,
          'Weight (lbs/ft)': c.weight || '',
          'Cable Group': c.allowed_cable_group || '',
          'Field View URL': c.field_view_url || cableQRPayload(c.tag, fieldViewBaseURL()),
        });
      }
    }
    const wsCables = XLSX.utils.json_to_sheet(cableRows);
    XLSX.utils.book_append_sheet(wb, wsCables, 'Cable Detail');

    // Route detail sheet
    const routeRows = [];
    for (const p of currentPulls) {
      for (const s of p.route_steps) {
        routeRows.push({
          'Pull #': p.pull_number,
          'Step': s.step,
          'Type': s.type,
          'Raceway ID': s.id || '',
          'Length (ft)': s.length,
          'Start XYZ (ft)': formatPoint(s.start),
          'End XYZ (ft)': formatPoint(s.end),
        });
      }
    }
    const wsRoute = XLSX.utils.json_to_sheet(routeRows);
    XLSX.utils.book_append_sheet(wb, wsRoute, 'Route Detail');

    const engineeringRows = currentPulls.map(p => ({
      'Pull #': p.pull_number,
      'Pull Plan ID': p.pull_plan_id,
      'Friction Coefficient': p.assumptions.coeffFriction,
      'Allowable Tension (lbf)': p.allowable_tension_lbs ?? '',
      'Allowable Sidewall Pressure (lbf/ft)': p.allowable_sidewall_pressure ?? '',
      'Default Bend Radius (ft)': p.assumptions.bendRadiusFt,
      'Default Bend Angle (deg)': p.assumptions.bendAngleDeg,
      'Conduit Inside Diameter (in)': p.assumptions.conduitInnerDiameterIn ?? '',
      'Incoming Tension (lbf)': p.assumptions.incomingTensionLbf,
      'Direction Mode': p.assumptions.pullDirection,
      'Selected Direction': p.pull_direction,
      'Forward Max Tension (lbf)': p.direction_comparison?.forward?.max_tension_lbs ?? '',
      'Reverse Max Tension (lbf)': p.direction_comparison?.reverse?.max_tension_lbs ?? '',
      'Maximum Sidewall Pressure (lbf/ft)': p.max_sidewall_pressure ?? '',
      'Tension Status': p.tension_status,
      'Sidewall Status': p.sidewall_status,
      'Jam Status': p.jam_check?.status || '',
      'Jam Ratio': p.jam_check?.ratio ?? '',
      'Warnings': (p.coverage_warnings || []).join('; '),
    }));
    const wsEngineering = XLSX.utils.json_to_sheet(engineeringRows);
    XLSX.utils.book_append_sheet(wb, wsEngineering, 'Engineering Inputs');

    XLSX.writeFile(wb, 'pull_cards.xlsx');
  });

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escAttr(s) {
    return esc(s)
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fieldViewBaseURL() {
    try {
      const base = new URL('.', window.location.href);
      return base.href.replace(/\/$/, '');
    } catch {
      return 'https://cabletrayroute.com';
    }
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    return String(Math.round(number * 10) / 10);
  }

  function formatEngineeringValue(value) {
    if (value === null || value === undefined || value === '') return '—';
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return String(Math.round(number * 100) / 100);
  }

  function engineeringInputValue(value) {
    if (value === null || value === undefined || value === '') return '';
    const number = Number(value);
    return Number.isFinite(number) ? escAttr(number) : '';
  }

  function engineeringStatusLabel(pull) {
    if (pull?.tension_status === 'fail' || pull?.sidewall_status === 'fail') return 'Limit exceeded';
    if (!pull?.input_coverage_complete) return 'Input required';
    return 'Engineering inputs complete';
  }

  function engineeringStatusClass(pull) {
    if (pull?.tension_status === 'fail' || pull?.sidewall_status === 'fail') return 'status-error';
    return pull?.input_coverage_complete ? 'status-ok' : 'status-warning';
  }

  function formatPoint(point) {
    if (!Array.isArray(point) || point.length < 3) return 'Missing';
    const values = point.map(value => Number(value));
    if (!values.every(Number.isFinite)) return 'Missing';
    return values.map(value => formatNumber(value)).join(', ');
  }

  renderPullDeliverableHandoff();
  renderPullPlanSaveStatus();
});
