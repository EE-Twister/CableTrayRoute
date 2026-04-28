import { getOneLine, getStudies, setStudies } from '../dataStore.mjs';
import { generateArcFlashReport } from '../reports/arcFlashReport.mjs';
import {
  buildArcFlashEquipmentRows,
  buildArcFlashStudyPackage,
  normalizeArcFlashStudyCase,
  renderArcFlashStudyHTML,
  runArcFlashStudyCase,
} from '../analysis/arcFlashStudyCase.mjs';

const SCENARIO_DEFINITIONS = [
  { id: 'baseline', name: 'Baseline', type: 'baseline', enabled: true, clearingTimeMultiplier: 1, faultCurrentMultiplier: 1 },
  { id: 'maintenance-mode', name: 'Maintenance Mode', type: 'maintenanceMode', enabled: false, clearingTimeMultiplier: 0.5, faultCurrentMultiplier: 1 },
  { id: 'zsi', name: 'Zone Selective Interlocking', type: 'zsi', enabled: false, clearingTimeMultiplier: 0.7, faultCurrentMultiplier: 1 },
  { id: 'current-limiting', name: 'Current-Limiting Device', type: 'currentLimiting', enabled: false, clearingTimeMultiplier: 1, faultCurrentMultiplier: 0.7 },
  { id: 'arc-flash-sensing', name: 'Arc-Flash Sensing', type: 'arcFlashSensing', enabled: false, clearingTimeMultiplier: 0.25, faultCurrentMultiplier: 1 },
];

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getProjectName() {
  return typeof document !== 'undefined' && document.body?.dataset?.projectName
    ? document.body.dataset.projectName
    : 'Untitled Project';
}

function downloadText(filename, mimeType, text) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function studyCaseFromForm(form) {
  const data = new FormData(form);
  return normalizeArcFlashStudyCase({
    reportPreset: data.get('reportPreset'),
    labelTemplate: data.get('labelTemplate'),
    includeDcArcFlashNote: data.get('includeDcArcFlashNote') === 'on',
    includeHighVoltageNote: data.get('includeHighVoltageNote') === 'on',
    notes: data.get('notes'),
  });
}

function renderEquipmentEditor(container, rows) {
  if (!container) return;
  container.innerHTML = `
    <table class="data-table" id="arcflash-equipment-table">
      <thead><tr><th>Include</th><th>Tag</th><th>Type</th><th>Electrode</th><th>Enclosure</th><th>Gap mm</th><th>Work Dist mm</th><th>HxWxD mm</th><th>Clearing s</th><th>Voltage V</th><th>Upstream</th><th>Defaulted</th><th>Notes</th></tr></thead>
      <tbody>${rows.length ? rows.map(row => `<tr data-equipment-id="${escapeHtml(row.equipmentId)}">
        <td><input type="checkbox" data-field="include" ${row.include !== false ? 'checked' : ''} aria-label="Include ${escapeHtml(row.equipmentTag)}"></td>
        <td><input data-field="equipmentTag" value="${escapeHtml(row.equipmentTag)}"></td>
        <td><input data-field="equipmentType" value="${escapeHtml(row.equipmentType)}"></td>
        <td><select data-field="electrodeConfiguration">
          ${['VCB', 'VCBB', 'HCB', 'VOA', 'HOA'].map(value => `<option value="${value}" ${row.electrodeConfiguration === value ? 'selected' : ''}>${value}</option>`).join('')}
        </select></td>
        <td><select data-field="enclosureType">
          ${['box', 'open'].map(value => `<option value="${value}" ${row.enclosureType === value ? 'selected' : ''}>${value}</option>`).join('')}
        </select></td>
        <td><input data-field="gapMM" type="number" min="1" step="1" value="${escapeHtml(row.gapMM)}"></td>
        <td><input data-field="workingDistanceMM" type="number" min="1" step="1" value="${escapeHtml(row.workingDistanceMM)}"></td>
        <td class="inline-fields">
          <input data-field="enclosureHeightMM" type="number" min="1" step="1" value="${escapeHtml(row.enclosureHeightMM)}" aria-label="Height">
          <input data-field="enclosureWidthMM" type="number" min="1" step="1" value="${escapeHtml(row.enclosureWidthMM)}" aria-label="Width">
          <input data-field="enclosureDepthMM" type="number" min="1" step="1" value="${escapeHtml(row.enclosureDepthMM)}" aria-label="Depth">
        </td>
        <td><input data-field="clearingTimeOverrideS" type="number" min="0" step="0.001" value="${escapeHtml(row.clearingTimeOverrideS)}"></td>
        <td><input data-field="nominalVoltageV" type="number" min="1" step="1" value="${escapeHtml(row.nominalVoltageV)}"></td>
        <td><input data-field="upstreamDeviceBasis" value="${escapeHtml(row.upstreamDeviceBasis)}"></td>
        <td>${escapeHtml((row.defaultedFields || []).join(', ') || 'none')}</td>
        <td><input data-field="notes" value="${escapeHtml(row.notes)}"></td>
      </tr>`).join('') : '<tr><td colspan="13">No one-line equipment rows found. Add equipment on the one-line page, then rerun this study.</td></tr>'}</tbody>
    </table>`;
}

function renderScenarioEditor(container) {
  if (!container) return;
  container.innerHTML = `
    <table class="data-table" id="arcflash-scenario-table">
      <thead><tr><th>Enable</th><th>Scenario</th><th>Type</th><th>Clearing multiplier</th><th>Explicit clearing s</th><th>Current multiplier</th><th>Notes</th></tr></thead>
      <tbody>${SCENARIO_DEFINITIONS.map(row => `<tr data-scenario-id="${escapeHtml(row.id)}">
        <td><input type="checkbox" data-field="enabled" ${row.enabled ? 'checked' : ''} ${row.id === 'baseline' ? 'disabled' : ''}></td>
        <td><input data-field="name" value="${escapeHtml(row.name)}" ${row.id === 'baseline' ? 'readonly' : ''}></td>
        <td><input data-field="type" value="${escapeHtml(row.type)}" readonly></td>
        <td><input data-field="clearingTimeMultiplier" type="number" min="0.001" step="0.001" value="${escapeHtml(row.clearingTimeMultiplier)}"></td>
        <td><input data-field="clearingTimeSeconds" type="number" min="0.001" step="0.001"></td>
        <td><input data-field="faultCurrentMultiplier" type="number" min="0.001" step="0.001" value="${escapeHtml(row.faultCurrentMultiplier)}"></td>
        <td><input data-field="notes" value=""></td>
      </tr>`).join('')}</tbody>
    </table>`;
}

function collectEquipmentRows() {
  return Array.from(document.querySelectorAll('#arcflash-equipment-table tbody tr[data-equipment-id]')).map(row => {
    const read = field => row.querySelector(`[data-field="${field}"]`);
    return {
      equipmentId: row.dataset.equipmentId,
      include: read('include')?.checked !== false,
      equipmentTag: read('equipmentTag')?.value,
      equipmentType: read('equipmentType')?.value,
      electrodeConfiguration: read('electrodeConfiguration')?.value,
      enclosureType: read('enclosureType')?.value,
      gapMM: read('gapMM')?.value,
      workingDistanceMM: read('workingDistanceMM')?.value,
      enclosureHeightMM: read('enclosureHeightMM')?.value,
      enclosureWidthMM: read('enclosureWidthMM')?.value,
      enclosureDepthMM: read('enclosureDepthMM')?.value,
      clearingTimeOverrideS: read('clearingTimeOverrideS')?.value,
      nominalVoltageV: read('nominalVoltageV')?.value,
      upstreamDeviceBasis: read('upstreamDeviceBasis')?.value,
      notes: read('notes')?.value,
      source: 'explicit',
    };
  });
}

function collectMitigationScenarios() {
  return Array.from(document.querySelectorAll('#arcflash-scenario-table tbody tr[data-scenario-id]')).map(row => {
    const read = field => row.querySelector(`[data-field="${field}"]`);
    return {
      id: row.dataset.scenarioId,
      enabled: row.dataset.scenarioId === 'baseline' || read('enabled')?.checked === true,
      name: read('name')?.value,
      type: read('type')?.value,
      clearingTimeMultiplier: read('clearingTimeMultiplier')?.value,
      clearingTimeSeconds: read('clearingTimeSeconds')?.value,
      faultCurrentMultiplier: read('faultCurrentMultiplier')?.value,
      notes: read('notes')?.value,
    };
  });
}

function renderResults(container, pkg) {
  if (!container) return;
  const rows = Array.isArray(pkg.scenarioComparison) ? pkg.scenarioComparison : [];
  container.innerHTML = `
    <h2>Study Results</h2>
    <p class="field-hint">${escapeHtml(pkg.summary?.includedEquipmentCount || 0)} included equipment row(s), ${escapeHtml(pkg.summary?.highEnergyCount || 0)} high-energy baseline row(s), ${escapeHtml(pkg.summary?.labelReadyCount || 0)} label-ready row(s).</p>
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>Scenario</th><th>Equipment</th><th>Incident Energy</th><th>Delta</th><th>PPE</th><th>Boundary</th><th>Clearing Time</th><th>Label Ready</th><th>Status</th><th>Recommendation</th></tr></thead>
        <tbody>${rows.length ? rows.map(row => `<tr>
          <td>${escapeHtml(row.scenarioName)}</td>
          <td>${escapeHtml(row.equipmentTag)}</td>
          <td>${escapeHtml(row.incidentEnergy)}</td>
          <td>${escapeHtml(row.deltaIncidentEnergy)}</td>
          <td>${escapeHtml(row.ppeCategory)}</td>
          <td>${escapeHtml(row.boundary)}</td>
          <td>${escapeHtml(row.clearingTime)}</td>
          <td>${escapeHtml(row.labelReady ? 'yes' : 'no')}</td>
          <td>${escapeHtml(row.status)}</td>
          <td>${escapeHtml(row.recommendation)}</td>
        </tr>`).join('') : '<tr><td colspan="10">No scenario rows were produced.</td></tr>'}</tbody>
      </table>
    </div>
    ${(pkg.warnings || []).length ? `<div class="alert warning"><strong>Warnings:</strong><ul>${pkg.warnings.map(w => `<li>${escapeHtml(w.message || w)}</li>`).join('')}</ul></div>` : ''}`;
}

export async function runArcFlashStudy(opts = {}) {
  const oneLine = opts.oneLine || getOneLine();
  const execution = await runArcFlashStudyCase({
    oneLine,
    studyCase: opts.studyCase || {},
    equipmentRows: opts.equipmentRows || [],
    mitigationScenarios: opts.mitigationScenarios || [],
  });
  const pkg = buildArcFlashStudyPackage({
    projectName: opts.projectName || getProjectName(),
    ...execution,
  });
  const studies = getStudies();
  studies.arcFlash = pkg;
  setStudies(studies);
  generateArcFlashReport(pkg);
  return pkg;
}

if (typeof document !== 'undefined') {
  const form = document.getElementById('arcflash-form');
  const out = document.getElementById('arcflash-output');
  const results = document.getElementById('arcflash-results');
  const equipmentEditor = document.getElementById('arcflash-equipment-editor');
  const scenarioEditor = document.getElementById('arcflash-scenario-editor');
  let latestPackage = null;

  const rows = buildArcFlashEquipmentRows({ oneLine: getOneLine() });
  renderEquipmentEditor(equipmentEditor, rows);
  renderScenarioEditor(scenarioEditor);

  document.getElementById('arcflash-export-json')?.addEventListener('click', () => {
    if (!latestPackage) return;
    downloadText('arc-flash-study-package.json', 'application/json', JSON.stringify(latestPackage, null, 2));
  });

  document.getElementById('arcflash-export-html')?.addEventListener('click', () => {
    if (!latestPackage) return;
    downloadText('arc-flash-study-package.html', 'text/html', renderArcFlashStudyHTML(latestPackage));
  });

  if (form && out) {
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      try {
        const pkg = await runArcFlashStudy({
          studyCase: studyCaseFromForm(form),
          equipmentRows: collectEquipmentRows(),
          mitigationScenarios: collectMitigationScenarios(),
        });
        latestPackage = pkg;
        renderResults(results, pkg);
        out.textContent = JSON.stringify(pkg, null, 2);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (results) results.innerHTML = `<div class="alert error">${escapeHtml(message)}</div>`;
        out.textContent = message;
      }
    });
  }
}
