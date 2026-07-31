/**
 * Read-only switching-procedure planning helpers.
 *
 * These functions document proposed operations and safety hold points. They do
 * not communicate with field devices or prove an electrically safe work state.
 */

export const SWITCHING_STEP_TYPES = Object.freeze({
  operate: 'operate',
  verify: 'verify',
  ground: 'ground',
  removeGround: 'remove_ground',
  hold: 'hold'
});

const STEP_TYPE_SET = new Set(Object.values(SWITCHING_STEP_TYPES));
const OPERATION_SET = new Set(['open', 'close']);
const PROCEDURE_STATUS_SET = new Set(['draft', 'reviewed']);

function text(value) {
  return String(value ?? '').trim();
}

function cleanStatus(value) {
  const status = text(value).toLowerCase();
  return PROCEDURE_STATUS_SET.has(status) ? status : 'draft';
}

function defaultInstruction(step) {
  if (step.type === SWITCHING_STEP_TYPES.operate) return `${step.action === 'close' ? 'Close' : 'Open'} ${step.deviceLabel || step.deviceId || 'selected device'}.`;
  if (step.type === SWITCHING_STEP_TYPES.verify) return 'Verify absence of voltage using the site-approved method and record the result.';
  if (step.type === SWITCHING_STEP_TYPES.ground) return 'Apply protective grounds only after the approved verification is complete.';
  if (step.type === SWITCHING_STEP_TYPES.removeGround) return 'Remove protective grounds when authorized by the approved switching authority.';
  return 'Stop for an independent hold-point review before continuing.';
}

export function normalizeSwitchingStep(step = {}, index = 0) {
  const rawType = text(step.type).toLowerCase();
  const type = STEP_TYPE_SET.has(rawType) ? rawType : SWITCHING_STEP_TYPES.hold;
  const rawAction = text(step.action).toLowerCase();
  const action = OPERATION_SET.has(rawAction) ? rawAction : 'open';
  const normalized = {
    id: text(step.id) || `step-${index + 1}`,
    type,
    deviceId: text(step.deviceId),
    deviceLabel: text(step.deviceLabel),
    action,
    instruction: text(step.instruction),
    completed: Boolean(step.completed),
    completedBy: text(step.completedBy),
    completedAt: text(step.completedAt),
  };
  normalized.instruction = normalized.instruction || defaultInstruction(normalized);
  return normalized;
}

export function normalizeSwitchingProcedure(procedure = {}) {
  const steps = Array.isArray(procedure.steps) ? procedure.steps.map(normalizeSwitchingStep) : [];
  return {
    id: text(procedure.id) || `procedure-${Date.now()}`,
    title: text(procedure.title),
    status: cleanStatus(procedure.status),
    preparedBy: text(procedure.preparedBy),
    reviewedBy: text(procedure.reviewedBy),
    notes: text(procedure.notes),
    createdAt: text(procedure.createdAt),
    updatedAt: text(procedure.updatedAt),
    steps,
  };
}

export function extractSwitchingDevices(oneLine = {}) {
  const sheets = Array.isArray(oneLine?.sheets) ? oneLine.sheets : [];
  return sheets.flatMap((sheet, sheetIndex) => (Array.isArray(sheet?.components) ? sheet.components : [])
    .filter(component => /breaker|switch|disconnect|fuse|recloser|contactor/i.test([
      component?.subtype,
      component?.type,
      component?.category,
      component?.label,
    ].join(' ')))
    .map(component => ({
      id: text(component?.id),
      label: text(component?.label) || text(component?.id),
      subtype: text(component?.subtype || component?.type),
      sheet: text(sheet?.name) || `Sheet ${sheetIndex + 1}`,
    }))
    .filter(device => device.id))
    .sort((left, right) => left.sheet.localeCompare(right.sheet) || left.label.localeCompare(right.label));
}

export function validateSwitchingProcedure(procedure = {}) {
  const normalized = normalizeSwitchingProcedure(procedure);
  const issues = [];
  if (!normalized.title) issues.push({ severity: 'error', code: 'title-required', message: 'Procedure title is required.' });
  if (!normalized.steps.length) issues.push({ severity: 'error', code: 'steps-required', message: 'Add at least one documented procedure step.' });
  if (normalized.status === 'reviewed' && !normalized.reviewedBy) issues.push({ severity: 'error', code: 'reviewer-required', message: 'A reviewed procedure must name its reviewer.' });
  if (normalized.status === 'draft') issues.push({ severity: 'warning', code: 'draft-only', message: 'Draft procedure: obtain site authorization and an independent review before field use.' });

  let absenceVerified = false;
  let protectiveGroundsApplied = false;
  normalized.steps.forEach((step, index) => {
    const stepNumber = index + 1;
    if (step.type === SWITCHING_STEP_TYPES.operate && !step.deviceId) {
      issues.push({ severity: 'error', code: 'device-required', stepNumber, message: `Step ${stepNumber}: choose the device to operate.` });
    }
    if (step.type === SWITCHING_STEP_TYPES.verify) absenceVerified = true;
    if (step.type === SWITCHING_STEP_TYPES.ground) {
      if (!absenceVerified) issues.push({ severity: 'error', code: 'verify-before-ground', stepNumber, message: `Step ${stepNumber}: verify absence of voltage before applying protective grounds.` });
      protectiveGroundsApplied = true;
    }
    if (step.type === SWITCHING_STEP_TYPES.removeGround) protectiveGroundsApplied = false;
    if (step.type === SWITCHING_STEP_TYPES.operate && step.action === 'close' && protectiveGroundsApplied) {
      issues.push({ severity: 'error', code: 'remove-ground-before-close', stepNumber, message: `Step ${stepNumber}: remove protective grounds before a close operation.` });
    }
  });
  return { procedure: normalized, issues, ready: !issues.some(issue => issue.severity === 'error') };
}

function csvCell(value) {
  const cell = String(value ?? '');
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

export function exportSwitchingProcedureCsv(procedure = {}) {
  const normalized = normalizeSwitchingProcedure(procedure);
  const header = 'procedure_id,procedure_title,status,step,step_type,device_id,device_label,action,instruction';
  const rows = normalized.steps.map((step, index) => [
    normalized.id,
    normalized.title,
    normalized.status,
    index + 1,
    step.type,
    step.deviceId,
    step.deviceLabel,
    step.type === SWITCHING_STEP_TYPES.operate ? step.action : '',
    step.instruction,
  ].map(csvCell).join(','));
  return [header, ...rows].join('\r\n');
}
