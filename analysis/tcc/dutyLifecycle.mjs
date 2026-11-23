/** Persist the current plotted TCC duty cache with its pre-plot lifecycle context. */
export function persistDutyPlotResult({
  contextId,
  dutyContextId,
  dutyRunContext,
  selectedDeviceIds,
  getDutyOptions,
  violations = [],
  saveStudyResult,
  assertStudyRunContextCurrent
} = {}) {
  if (!contextId || contextId !== dutyContextId || !dutyRunContext || !saveStudyResult || !assertStudyRunContextCurrent || !getDutyOptions) return false;
  const dutyOptions = getDutyOptions();
  assertStudyRunContextCurrent(dutyRunContext, {
    inputs: { componentId: contextId, selectedDeviceIds: selectedDeviceIds() },
    options: dutyOptions
  });
  // Replace the derived cache rather than freshening sibling rows.
  saveStudyResult('duty', { [contextId]: violations }, dutyRunContext);
  return true;
}

export function renderDutyResult(violations, {
  violationDiv,
  escapeHtml,
  getActiveComponentId,
  dutyContextId,
  dutyRunContext,
  selectedDeviceIds,
  getDutyOptions,
  saveStudyResult,
  assertStudyRunContextCurrent,
} = {}) {
  if (violations.length) violationDiv.innerHTML = violations.map(value => `<p>${escapeHtml(value)}</p>`).join('');
  else violationDiv.textContent = '';
  const contextId = getActiveComponentId();
  if (!contextId || contextId !== dutyContextId) return;
  try {
    persistDutyPlotResult({ contextId, dutyContextId, dutyRunContext, selectedDeviceIds, getDutyOptions, violations, saveStudyResult, assertStudyRunContextCurrent });
  } catch (error) {
    console.warn('[tcc] duty result was not stored:', error?.message || error);
  }
}
