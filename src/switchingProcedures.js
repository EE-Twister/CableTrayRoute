import { getOneLine, getSwitchingProcedures, setSwitchingProcedures } from '../dataStore.mjs';
import { exportSwitchingProcedureCsv, extractSwitchingDevices, normalizeSwitchingProcedure, SWITCHING_STEP_TYPES, validateSwitchingProcedure } from '../analysis/switchingProcedures.mjs';
import { mountPersistentNavigation } from './components/navigation.js';
import '../site.js';

const typeLabels = {
  [SWITCHING_STEP_TYPES.operate]: 'Operate device',
  [SWITCHING_STEP_TYPES.verify]: 'Verify absence of voltage',
  [SWITCHING_STEP_TYPES.ground]: 'Apply protective grounds',
  [SWITCHING_STEP_TYPES.removeGround]: 'Remove protective grounds',
  [SWITCHING_STEP_TYPES.hold]: 'Independent hold point',
};

let procedures = getSwitchingProcedures().map(normalizeSwitchingProcedure);
let activeId = procedures[0]?.id || '';
let pendingStepDevice = { id: '', label: '' };

function text(value) { return String(value ?? '').trim(); }

function now() { return new Date().toISOString(); }

function makeId() {
  return `sw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function save() {
  setSwitchingProcedures(procedures);
}

function activeProcedure() {
  return procedures.find(procedure => procedure.id === activeId) || null;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function deviceOptions(selectedId = '') {
  const devices = extractSwitchingDevices(getOneLine());
  const options = ['<option value="">Select One-Line device</option>', ...devices.map(device => `<option value="${esc(device.id)}" ${device.id === selectedId ? 'selected' : ''}>${esc(`${device.label} (${device.sheet})`)}</option>` )];
  return options.join('');
}

function render() {
  const procedure = activeProcedure();
  const select = document.getElementById('procedure-select');
  const editor = document.getElementById('procedure-editor');
  const empty = document.getElementById('procedure-empty');
  select.replaceChildren(...procedures.map(item => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.title || 'Untitled procedure';
    option.selected = item.id === activeId;
    return option;
  }));
  empty.hidden = Boolean(procedure);
  editor.hidden = !procedure;
  if (!procedure) return;

  document.getElementById('procedure-title').value = procedure.title;
  document.getElementById('procedure-status').value = procedure.status;
  document.getElementById('procedure-prepared-by').value = procedure.preparedBy;
  document.getElementById('procedure-reviewed-by').value = procedure.reviewedBy;
  document.getElementById('procedure-notes').value = procedure.notes;
  const validation = validateSwitchingProcedure(procedure);
  const summary = document.getElementById('procedure-validation');
  summary.className = validation.ready ? 'procedure-validation ready' : 'procedure-validation blocked';
  summary.textContent = validation.ready ? 'Planning checks passed. Site authorization and an independent review are still required before field use.' : `${validation.issues.filter(issue => issue.severity === 'error').length} planning check(s) require attention.`;
  const issueList = document.getElementById('procedure-issues');
  issueList.replaceChildren(...validation.issues.map(issue => {
    const item = document.createElement('li');
    item.className = issue.severity;
    item.textContent = issue.message;
    return item;
  }));
  const body = document.getElementById('procedure-steps-body');
  body.replaceChildren(...procedure.steps.map((step, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${index + 1}</td><td>${esc(typeLabels[step.type] || step.type)}</td><td>${esc(step.deviceLabel || step.deviceId || '—')}</td><td>${esc(step.type === SWITCHING_STEP_TYPES.operate ? step.action : '—')}</td><td>${esc(step.instruction)}</td><td><label><input type="checkbox" data-complete-step="${esc(step.id)}" ${step.completed ? 'checked' : ''}> Logged</label></td><td><button type="button" class="btn" data-remove-step="${esc(step.id)}">Remove</button></td>`;
    return row;
  }));
  const device = document.getElementById('step-device');
  device.innerHTML = deviceOptions();
}

function updateProcedure(fields) {
  const procedure = activeProcedure();
  if (!procedure) return;
  Object.assign(procedure, fields, { updatedAt: now() });
  procedures = procedures.map(item => item.id === procedure.id ? normalizeSwitchingProcedure(procedure) : item);
  save();
  render();
}

function addStep() {
  const procedure = activeProcedure();
  if (!procedure) return;
  const type = document.getElementById('step-type').value;
  const deviceSelect = document.getElementById('step-device');
  const selectedDevice = deviceSelect.selectedOptions[0];
  const deviceId = pendingStepDevice.id || text(deviceSelect.value);
  const deviceLabel = pendingStepDevice.label || (deviceId ? text(selectedDevice?.textContent).replace(/\s+\([^)]*\)$/, '') : '');
  const action = document.getElementById('step-action').value;
  const instruction = text(document.getElementById('step-instruction').value);
  procedure.steps.push({ id: makeId(), type, deviceId, deviceLabel, action, instruction });
  pendingStepDevice = { id: '', label: '' };
  updateProcedure({ steps: procedure.steps });
  document.getElementById('step-instruction').value = '';
}

function downloadCsv() {
  const procedure = activeProcedure();
  if (!procedure) return;
  const url = URL.createObjectURL(new Blob([exportSwitchingProcedureCsv(procedure)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(procedure.title || 'switching-procedure').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'switching-procedure'}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function init() {
  mountPersistentNavigation();
  document.getElementById('new-procedure').addEventListener('click', () => {
    const procedure = normalizeSwitchingProcedure({ id: makeId(), title: 'New switching procedure', createdAt: now(), updatedAt: now(), steps: [] });
    procedures.push(procedure);
    activeId = procedure.id;
    save();
    render();
  });
  document.getElementById('procedure-select').addEventListener('change', event => { activeId = event.target.value; render(); });
  document.getElementById('procedure-editor').addEventListener('input', event => {
    const target = event.target;
    if (!target.matches('[data-procedure-field]')) return;
    const procedure = activeProcedure();
    if (!procedure) return;
    procedure[target.dataset.procedureField] = target.value;
    procedure.updatedAt = now();
    save();
  });
  document.getElementById('procedure-editor').addEventListener('change', event => {
    const target = event.target;
    if (target.id === 'step-device') {
      pendingStepDevice = {
        id: text(target.value),
        label: text(target.selectedOptions[0]?.textContent).replace(/\s+\([^)]*\)$/, '')
      };
      return;
    }
    if (target.matches('[data-procedure-field]')) updateProcedure({ [target.dataset.procedureField]: target.value });
    if (target.matches('[data-complete-step]')) {
      const procedure = activeProcedure();
      const step = procedure?.steps.find(item => item.id === target.dataset.completeStep);
      if (step) updateProcedure({ steps: procedure.steps.map(item => item.id === step.id ? { ...item, completed: target.checked, completedAt: target.checked ? now() : '' } : item) });
    }
  });
  document.getElementById('procedure-editor').addEventListener('click', event => {
    const removeId = event.target.closest('[data-remove-step]')?.dataset.removeStep;
    if (removeId) {
      const procedure = activeProcedure();
      updateProcedure({ steps: procedure.steps.filter(step => step.id !== removeId) });
    }
  });
  document.getElementById('add-step').addEventListener('click', addStep);
  document.getElementById('export-procedure').addEventListener('click', downloadCsv);
  render();
}

init();
