export function hasWorkflowValue(value) {
  if (Array.isArray(value)) return value.some(hasWorkflowValue);
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return value !== null && value !== undefined && String(value).trim() !== '';
}

export function meaningfulHomeRecords(records) {
  if (!Array.isArray(records)) return [];
  return records.filter(record => record && typeof record === 'object'
    && Object.entries(record).some(([key, value]) => !key.startsWith('_') && hasWorkflowValue(value)));
}

export function safeReadHomeData(getter, fallback, onError = error => console.warn('Homepage summary read failed', error)) {
  try {
    return getter();
  } catch (error) {
    onError(error);
    return fallback;
  }
}

export function homeField(record, names) {
  for (const name of names) {
    if (hasWorkflowValue(record?.[name])) return record[name];
  }
  return '';
}

export const homeCableTag = cable => homeField(cable, ['tag', 'id', 'cable_id', 'cableId', 'ref']) || 'Untitled';
export const homeCableFrom = cable => homeField(cable, ['from', 'from_tag', 'fromTag', 'source', 'source_tag']) || '--';
export const homeCableTo = cable => homeField(cable, ['to', 'to_tag', 'toTag', 'destination', 'load', 'load_tag']) || '--';
export const homeCableSize = cable => homeField(cable, ['conductor_size', 'conductorSize', 'cable_size', 'wire_size', 'size']) || '--';

export function countHomeStudies(studies) {
  if (!studies || typeof studies !== 'object') return 0;
  return Object.values(studies).filter(hasWorkflowValue).length;
}

export function countHomeReportSnapshots(snapshots) {
  if (Array.isArray(snapshots)) return snapshots.length;
  if (snapshots && typeof snapshots === 'object') return Object.keys(snapshots).length;
  return 0;
}

export function pluralHome(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function stripWorkflowNumber(label) {
  return String(label || '').replace(/^\d+\.\s*/, '');
}

export function numericPercent(record, names) {
  for (const name of names) {
    const raw = record?.[name];
    if (raw === null || raw === undefined || raw === '') continue;
    const value = Number(String(raw).replace('%', ''));
    if (Number.isFinite(value)) return value;
  }
  return null;
}

export function averageHomeFill(records) {
  const values = records
    .map(record => numericPercent(record, ['fill_pct', 'fillPercent', 'percent_fill', 'percentFill', 'fill', 'tray_fill_pct', 'conduit_fill_pct']))
    .filter(value => Number.isFinite(value));
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function collectHomepageSummary({ readers, services, workflowSteps, onReadError }) {
  const read = (getter, fallback) => safeReadHomeData(getter, fallback, onReadError);
  const equipment = meaningfulHomeRecords(read(readers.getEquipment, []));
  const loads = meaningfulHomeRecords(read(readers.getLoads, []));
  const oneLine = read(readers.getOneLine, { activeSheet: 0, sheets: [] });
  const cables = meaningfulHomeRecords(read(readers.getCables, []));
  const trays = meaningfulHomeRecords(read(readers.getTrays, []));
  const conduits = meaningfulHomeRecords(read(readers.getConduits, []));
  const ductbanks = meaningfulHomeRecords(read(readers.getDuctbanks, []));
  const studies = read(readers.getStudies, {});
  const lifecyclePackages = read(readers.getLifecyclePackages, []);
  const reportSnapshots = read(readers.getReportSnapshots, {});
  const reconcilePending = Boolean(read(readers.getReconcilePending, false));
  const routeResults = read(readers.getRouteResults, null);
  const cableReadiness = services.getCableReadiness(cables);
  const oneLineComponents = services.countOneLineComponents(oneLine);
  const raceways = trays.length + conduits.length + ductbanks.length;
  const workflowDiagnostics = services.buildWorkflowCoreDiagnostics({
    equipment,
    loads,
    oneLine,
    cables,
    trays,
    conduits,
    ductbanks,
    studies,
    routeResults,
    latestRouteResults: routeResults,
    lifecyclePackages,
    deliverables: lifecyclePackages,
    reportSnapshots,
    designBasis: read(readers.getDesignBasis, {}),
    designGateApprovals: read(readers.getDesignGateApprovals, {}),
    studyApprovals: read(readers.getStudyApprovals, {}),
    currentInputFingerprint: read(readers.getProjectInputFingerprint, ''),
    reconcilePending
  });
  const workflowStatusByKey = new Map(workflowDiagnostics.workflowSteps.map(status => [status.key, status]));
  const stepStatuses = workflowSteps.map(step => ({
    ...step,
    status: workflowStatusByKey.get(step.key) || services.getStepStatus(step.key)
  }));
  const completeCount = stepStatuses.filter(step => step.status.complete).length;
  const nextStep = stepStatuses.find(step => !step.status.complete) || stepStatuses[stepStatuses.length - 1];
  const packageCount = Array.isArray(lifecyclePackages) ? lifecyclePackages.length : 0;
  const routeRecords = [...trays, ...conduits, ...ductbanks];

  return {
    equipment,
    loads,
    oneLine,
    oneLineComponents,
    cables,
    trays,
    conduits,
    ductbanks,
    studies,
    studyCount: countHomeStudies(studies),
    lifecyclePackages,
    reportCount: packageCount + countHomeReportSnapshots(reportSnapshots),
    reconcilePending,
    cableReadiness,
    raceways,
    routeRecords,
    averageFill: averageHomeFill(routeRecords),
    routeWarnings: routeRecords.filter(record => {
      const percent = numericPercent(record, ['fill_pct', 'fillPercent', 'percent_fill', 'percentFill', 'fill']);
      return Number.isFinite(percent) && percent > 40;
    }).length,
    workflowDiagnostics,
    stepStatuses,
    completeCount,
    nextStep
  };
}
