import { summarizeEquipment } from './equipmentWorkflow.mjs';
import { summarizeLoadValidation } from './loadWorkflow.mjs';
import { buildDeliverableReadinessDiagnostics } from './deliverableWorkflow.mjs';
import { normalizeRouteResultState } from './routeResults.mjs';
import { buildDesignBasisReview } from './designBasis.mjs';
import { runDRC } from './designRuleChecker.mjs';
import { countOneLineComponents, getCableReadiness, workflowOrder } from '../src/workflowStatus.js';
import { runValidation } from '../validation/rules.js';

function hasValue(value) {
  if (Array.isArray(value)) return value.some(hasValue);
  if (value && typeof value === 'object') return Object.keys(value).some(key => hasValue(value[key]));
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function meaningfulRecords(records) {
  return Array.isArray(records)
    ? records.filter(row => row && typeof row === 'object' && Object.values(row).some(hasValue))
    : [];
}

function countObjectRecords(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function cableDeliverableReadiness(cables = []) {
  const rows = meaningfulRecords(cables);
  const hasInsulation = row => hasValue(row.insulation_type || row.insulation || row.insulation_material);
  const hasVoltage = row => hasValue(row.voltage_rating || row.cable_rating || row.operating_voltage || row.voltage || row.rated_voltage);
  const missingInsulation = rows.filter(row => !hasInsulation(row)).length;
  const missingVoltage = rows.filter(row => !hasVoltage(row)).length;
  return {
    total: rows.length,
    ready: rows.filter(row => hasInsulation(row) && hasVoltage(row)).length,
    missingInsulation,
    missingVoltage,
    missingFields: missingInsulation + missingVoltage
  };
}

function designRuleSummary(project = {}) {
  const routeState = normalizeRouteResultState(
    project.routeResults || project.latestRouteResults || {},
    { cables: project.cables || [] }
  );
  try {
    return runDRC({
      trays: project.trays || [],
      conduits: project.conduits || [],
      cables: project.cables || [],
      trayCableMap: routeState.trayCableMap,
      routedCableNames: new Set(routeState.routedCableNames)
    }).summary;
  } catch (_) {
    return { errors: 0, warnings: 0, info: 0, accepted: 0, total: 0, passed: true, unavailable: true };
  }
}

function flattenOneLineComponents(oneLine = {}) {
  return (Array.isArray(oneLine?.sheets) ? oneLine.sheets : [])
    .flatMap(sheet => Array.isArray(sheet?.components) ? sheet.components : []);
}

function racewayId(record = {}, type = '') {
  const fields = type === 'ductbank'
    ? ['tag', 'ductbank_id', 'ductbankId', 'id', 'ref']
    : type === 'tray'
      ? ['tray_id', 'trayId', 'tag', 'id', 'ref']
      : ['conduit_id', 'conduitId', 'tag', 'id', 'ref'];
  return fields.map(field => record?.[field]).find(hasValue) || '';
}

function buildRacewayIntegrity({ trays = [], conduits = [], ductbanks = [] } = {}) {
  const records = [
    ...meaningfulRecords(trays).map(row => ({ type: 'tray', row })),
    ...meaningfulRecords(conduits).map(row => ({ type: 'conduit', row })),
    ...meaningfulRecords(ductbanks).map(row => ({ type: 'ductbank', row })),
    ...meaningfulRecords(ductbanks).flatMap(ductbank => meaningfulRecords(ductbank.conduits)
      .map(row => ({ type: 'conduit', row })))
  ];
  const counts = new Map();
  records.forEach(({ type, row }) => {
    const id = String(racewayId(row, type)).trim().toLocaleLowerCase();
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  });
  const duplicateIds = [...counts.values()].reduce((sum, count) => sum + (count > 1 ? count : 0), 0);
  const missingIds = records.filter(({ type, row }) => !hasValue(racewayId(row, type))).length;
  const missingDuctbankEndpoints = meaningfulRecords(ductbanks).filter(ductbank => {
    const from = ductbank.from || ductbank.from_tag || ductbank.fromTag || ductbank.source;
    const to = ductbank.to || ductbank.to_tag || ductbank.toTag || ductbank.destination;
    return !hasValue(from) || !hasValue(to);
  }).length;
  return {
    total: records.length,
    duplicateIds,
    missingIds,
    missingDuctbankEndpoints,
    issues: duplicateIds + missingIds + missingDuctbankEndpoints
  };
}

function makeBlocker(step, severity, label, detail, href) {
  return { step, severity, label, detail, href };
}

function makePrompt(id, severity, label, detail, href, field = '') {
  return {
    id,
    severity,
    label,
    detail,
    href,
    field,
    actionLabel: actionLabelForHref(href)
  };
}

function actionLabelForHref(href = '') {
  const page = String(href || '').split('#')[0];
  const labels = {
    'workflowdashboard.html': 'Review on Dashboard',
    'equipmentlist.html': 'Open Equipment List',
    'loadlist.html': 'Open Load List',
    'oneline.html': 'Open One-Line',
    'cableschedule.html': 'Open Cable Schedule',
    'racewayschedule.html': 'Open Raceway Schedule',
    'cabletrayfill.html': 'Open Fill Review',
    'optimalRoute.html': 'Open Routing',
    'demandschedule.html': 'Open Studies',
    'projectreport.html': 'Open Report Builder'
  };
  return labels[page] || 'Open Step';
}

function uniquePrompts(prompts = []) {
  const seen = new Set();
  return prompts.filter(prompt => {
    const key = prompt.id || `${prompt.href}:${prompt.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matrixItem(id, status, label, detail, href = '') {
  return { id, status, label, detail, href };
}

function groupStatus(items = []) {
  if (items.some(item => item.status === 'fail')) return 'fail';
  if (items.some(item => item.status === 'warn')) return 'warn';
  return 'pass';
}

function matrixGroup(id, label, items = []) {
  return {
    id,
    label,
    status: groupStatus(items),
    items
  };
}

function summarizeMatrix(groups = []) {
  const summary = { pass: 0, warn: 0, fail: 0, total: 0 };
  groups.forEach(group => {
    group.items.forEach(item => {
      summary.total += 1;
      if (item.status === 'fail') summary.fail += 1;
      else if (item.status === 'warn') summary.warn += 1;
      else summary.pass += 1;
    });
  });
  return summary;
}

function makeRunnerStep(id, label, href, status, detail, actionLabel = actionLabelForHref(href)) {
  return { id, label, href, status, detail, actionLabel };
}

function findNextAction(blockers) {
  const critical = blockers.find(item => item.severity === 'critical');
  const warning = blockers.find(item => item.severity === 'warning');
  const item = critical || warning;
  if (item) {
    return {
      step: item.step,
      label: item.label,
      detail: item.detail,
      href: item.href,
      severity: item.severity
    };
  }
  return {
    step: 'Deliverables',
    label: 'Generate deliverables',
    detail: 'Core workflow data is ready for report and release-package review.',
    href: 'projectreport.html',
    severity: 'success'
  };
}

export function buildMissingInformationPrompts(project = {}, diagnostics = buildWorkflowCoreDiagnostics(project)) {
  const prompts = diagnostics.blockers
    .filter(item => item.severity !== 'info')
    .map((item, index) => makePrompt(
      `blocker-${index}-${item.step.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      item.severity,
      `${item.step}: ${item.label}`,
      item.detail,
      item.href,
      item.step
    ));

  const designBasis = diagnostics.designBasis || {};
  (designBasis.missing || []).forEach((detail, index) => {
    prompts.push(makePrompt(
      `design-basis-missing-${index}`,
      'warning',
      'Design Basis: Complete required rule',
      detail,
      'workflowdashboard.html',
      'Design Basis'
    ));
  });
  (designBasis.warnings || []).forEach((detail, index) => {
    prompts.push(makePrompt(
      `design-basis-warning-${index}`,
      'warning',
      'Design Basis: Confirm assumption',
      detail,
      'workflowdashboard.html',
      'Design Basis'
    ));
  });

  (diagnostics.designReview?.openGates || [])
    .filter(gate => gate.blocking || gate.severity !== 'info')
    .forEach(gate => {
      prompts.push(makePrompt(
        `gate-${gate.id}`,
        gate.severity === 'critical' || gate.blocking ? 'critical' : 'warning',
        `Review Gate: ${gate.label}`,
        gate.detail,
        gate.href || 'workflowdashboard.html',
        gate.category || 'Review Gate'
      ));
    });

  return uniquePrompts(prompts);
}

export function buildComplianceMatrix(project = {}, diagnostics = buildWorkflowCoreDiagnostics(project)) {
  const designBasis = diagnostics.designBasis || {};
  const designReview = diagnostics.designReview || {};
  const equipment = diagnostics.equipment || {};
  const loads = diagnostics.loads || {};
  const cables = diagnostics.cables || {};
  const health = diagnostics.health || {};
  const deliverables = diagnostics.deliverables || {};

  const groups = [
    matrixGroup('basis', 'Design Basis', [
      matrixItem(
        'basis-configured',
        designBasis.configured ? 'pass' : 'fail',
        'Project code basis saved',
        designBasis.configured ? designBasis.codeLabel : 'Run the Design Basis Wizard before relying on generated assumptions.',
        'workflowdashboard.html'
      ),
      matrixItem(
        'basis-required-fields',
        designBasis.complete ? 'pass' : 'warn',
        'Required design-basis fields complete',
        designBasis.complete ? 'Jurisdiction, AHJ, sizing defaults, routing defaults, and reviewer rules are populated.' : (designBasis.missing || []).join(' '),
        'workflowdashboard.html'
      ),
      matrixItem(
        'basis-blocking-gates',
        (designReview.blockingGateCount || 0) > 0 ? 'fail' : 'pass',
        'Blocking review gates resolved',
        (designReview.blockingGateCount || 0) > 0 ? `${designReview.blockingGateCount} blocking design-basis gate(s) remain open.` : 'No blocking design-basis gates are open.',
        'workflowdashboard.html'
      ),
      matrixItem(
        'basis-open-gates',
        (designReview.openGateCount || 0) > 0 ? 'warn' : 'pass',
        'Assumptions and review gates tracked',
        (designReview.openGateCount || 0) > 0 ? `${designReview.openGateCount} review gate(s) remain open for user approval.` : 'All active design-basis gates are reviewed or not triggered.',
        'workflowdashboard.html'
      )
    ]),
    matrixGroup('intake', 'Equipment / Loads', [
      matrixItem(
        'equipment-present',
        equipment.total > 0 ? 'pass' : 'fail',
        'Equipment list started',
        equipment.total > 0 ? `${equipment.total} equipment record(s) found.` : 'Add at least one source or equipment record.',
        'equipmentlist.html'
      ),
      matrixItem(
        'equipment-tags',
        equipment.missingTags > 0 || equipment.duplicateTags > 0 ? 'fail' : 'pass',
        'Equipment tags unique',
        equipment.missingTags > 0 || equipment.duplicateTags > 0
          ? `${equipment.missingTags || 0} missing tag(s), ${equipment.duplicateTags || 0} duplicate tag(s).`
          : 'Equipment tags are present and unique.',
        'equipmentlist.html'
      ),
      matrixItem(
        'equipment-voltage',
        equipment.missingVoltage > 0 ? 'warn' : 'pass',
        'Equipment voltage ratings populated',
        equipment.missingVoltage > 0 ? `${equipment.missingVoltage} equipment record(s) need voltage ratings.` : 'Equipment voltage ratings are populated.',
        'equipmentlist.html'
      ),
      matrixItem(
        'loads-present',
        loads.total > 0 ? 'pass' : 'fail',
        'Load list started',
        loads.total > 0 ? `${loads.total} load record(s) found.` : 'Add load records after equipment is established.',
        'loadlist.html'
      ),
      matrixItem(
        'loads-complete',
        loads.total > 0 && loads.incomplete === 0 ? 'pass' : 'fail',
        'Load records complete',
        loads.total > 0 && loads.incomplete === 0 ? `${loads.complete} load record(s) are complete.` : `${loads.incomplete || 0} load record(s) need source, kW, voltage, power factor, or phases.`,
        'loadlist.html'
      )
    ]),
    matrixGroup('model', 'One-Line / Cable Schedule', [
      matrixItem(
        'one-line-components',
        health.oneLineComponents > 0 ? 'pass' : 'warn',
        'One-Line components available',
        health.oneLineComponents > 0 ? `${health.oneLineComponents} one-line component(s) found.` : 'No one-line components are present yet; Auto-Build can seed them from equipment and loads.',
        'oneline.html'
      ),
      matrixItem(
        'one-line-reconcile',
        health.reconcilePending ? 'warn' : 'pass',
        'One-Line schedule reconciliation clear',
        health.reconcilePending ? 'One-Line changes are pending explicit schedule reconciliation.' : 'No one-line schedule reconcile is pending.',
        'oneline.html'
      ),
      matrixItem(
        'one-line-validation',
        health.oneLineIssues > 0 ? 'fail' : 'pass',
        'One-Line validation clear',
        health.oneLineIssues > 0 ? `${health.oneLineIssues} one-line validation issue(s) remain.` : 'No one-line validation issues are open.',
        'oneline.html'
      ),
      matrixItem(
        'cable-schedule-present',
        cables.total > 0 ? 'pass' : 'warn',
        'Cable schedule rows available',
        cables.total > 0 ? `${cables.total} cable row(s) found.` : 'Cable schedule is empty; Auto-Build can seed rows from loads.',
        'cableschedule.html'
      ),
      matrixItem(
        'cable-schedule-ready',
        cables.total > 0 && cables.missingSchedule === 0 ? 'pass' : 'warn',
        'Cable rows schedule-ready',
        cables.total > 0 && cables.missingSchedule === 0 ? `${cables.scheduleReady} cable row(s) are schedule-ready.` : `${cables.missingSchedule || 0} cable row(s) need tag, endpoints, conductor size, or length.`,
        'cableschedule.html'
      )
    ]),
    matrixGroup('routing', 'Raceway / Routing', [
      matrixItem(
        'raceways-present',
        health.raceways > 0 ? 'pass' : 'warn',
        'Raceway records available',
        health.raceways > 0 ? `${health.raceways} raceway record(s) found.` : 'No tray, conduit, or ductbank records are available for routing.',
        'racewayschedule.html'
      ),
      matrixItem(
        'raceway-integrity',
        health.racewayIssues > 0 ? 'fail' : 'pass',
        'Raceway IDs and ductbank parents complete',
        health.racewayIssues > 0 ? `${health.racewayIssues} raceway integrity issue(s) remain.` : 'Raceway IDs are unique and ductbank parent endpoints are complete.',
        'racewayschedule.html'
      ),
      matrixItem(
        'cables-routing-ready',
        cables.scheduleReady > 0 && cables.routingReady === cables.scheduleReady ? 'pass' : 'warn',
        'Schedule-ready cables assigned to raceways',
        cables.scheduleReady > 0 && cables.routingReady === cables.scheduleReady ? `${cables.routingReady} cable row(s) are routing-ready.` : `${cables.missingRaceway || 0} schedule-ready cable row(s) need raceway assignments.`,
        'cableschedule.html'
      ),
      matrixItem(
        'route-results-current',
        cables.routingReady > 0 && cables.missingCoordinates === 0 && health.routeResults >= cables.routingReady ? 'pass' : 'warn',
        'Route results reproducible from current inputs',
        cables.routingReady > 0 && cables.missingCoordinates === 0 && health.routeResults >= cables.routingReady
          ? `${health.routeResults} route result(s) found with complete endpoint coordinates.`
          : (cables.missingCoordinates > 0
              ? `${cables.missingCoordinates} routed cable(s) need endpoint coordinates before recalculation.`
              : 'Run or refresh Optimal Route before deliverables.'),
        'optimalRoute.html'
      )
    ]),
    matrixGroup('studies', 'Studies / Protection', [
      matrixItem(
        'studies-run',
        health.studies > 0 ? 'pass' : 'warn',
        'Study results saved',
        health.studies > 0 ? `${health.studies} saved study result set(s) found.` : 'No saved study results are available yet.',
        'demandschedule.html'
      ),
      matrixItem(
        'protective-settings',
        (designReview.openGates || []).some(gate => gate.id === 'protective-device-settings') ? 'fail' : 'pass',
        'Protective-device settings confirmed',
        (designReview.openGates || []).some(gate => gate.id === 'protective-device-settings') ? 'TCC settings or device settings still require confirmation.' : 'Protective-device settings gate is clear.',
        'tcc.html'
      ),
      matrixItem(
        'arc-flash-inputs',
        (designReview.openGates || []).some(gate => gate.id === 'arc-flash-inputs') ? 'fail' : 'pass',
        'Arc-flash prerequisites confirmed',
        (designReview.openGates || []).some(gate => gate.id === 'arc-flash-inputs') ? 'Arc-flash inputs still require confirmation.' : 'Arc-flash prerequisite gate is clear.',
        'arcFlash.html'
      )
    ]),
    matrixGroup('deliverables', 'Deliverables', [
      matrixItem(
        'deliverable-gates',
        diagnostics.readyForDeliverables ? 'pass' : 'fail',
        'Deliverable review gates resolved',
        diagnostics.readyForDeliverables ? 'No workflow or design-basis gates are blocking export.' : `${diagnostics.issueBlockers?.length || 0} workflow blocker(s) and ${designReview.deliverableBlockers?.length || 0} design-basis deliverable gate(s) block export.`,
        'projectreport.html'
      ),
      matrixItem(
        'report-snapshots',
        health.reportSnapshots > 0 ? 'pass' : 'warn',
        'Report snapshot saved',
        health.reportSnapshots > 0 ? `${health.reportSnapshots} report snapshot(s) saved.` : 'No report snapshot is saved yet.',
        'projectreport.html'
      ),
      matrixItem(
        'release-packages',
        health.lifecyclePackages > 0 ? 'pass' : 'warn',
        'Release package created',
        health.lifecyclePackages > 0 ? `${health.lifecyclePackages} release package(s) found.` : 'No release package is saved yet.',
        'projectreport.html'
      )
    ])
  ];

  return {
    groups,
    summary: summarizeMatrix(groups)
  };
}

export function buildGuidedWorkflowRunner(project = {}) {
  const diagnostics = buildWorkflowCoreDiagnostics(project);
  const prompts = buildMissingInformationPrompts(project, diagnostics);
  const compliance = buildComplianceMatrix(project, diagnostics);
  const health = diagnostics.health;
  const designBasis = diagnostics.designBasis;
  const equipment = diagnostics.equipment;
  const loads = diagnostics.loads;
  const cables = diagnostics.cables;
  const readyForAutoBuild = equipment.total > 0
    && equipment.missingTags === 0
    && equipment.duplicateTags === 0
    && loads.total > 0
    && loads.incomplete === 0;
  const autoBuildRecommended = readyForAutoBuild && (
    health.oneLineComponents === 0
    || cables.total === 0
    || health.raceways === 0
    || cables.missingRaceway > 0
    || (cables.routingReady > 0 && health.routeResults < cables.routingReady)
  );

  const steps = [
    makeRunnerStep(
      'designBasis',
      'Design Basis',
      'workflowdashboard.html',
      !designBasis.configured ? 'fail' : (designBasis.complete && diagnostics.designReview.blockingGateCount === 0 ? 'pass' : 'warn'),
      !designBasis.configured ? 'Capture the project code basis, sizing defaults, routing defaults, and review rules.' : `${designBasis.codeLabel}; ${diagnostics.designReview.openGateCount} review gate(s) open.`,
      'Open Design Basis Wizard'
    ),
    makeRunnerStep(
      'equipmentList',
      workflowOrder.find(step => step.key === 'equipmentList')?.short || 'Equipment',
      'equipmentlist.html',
      equipment.total === 0 || equipment.missingTags > 0 || equipment.duplicateTags > 0 ? 'fail' : (equipment.missingVoltage > 0 ? 'warn' : 'pass'),
      equipment.total === 0 ? 'Add equipment tags, ratings, and locations.' : `${equipment.total} equipment record(s); ${equipment.missingVoltage || 0} missing voltage rating(s).`
    ),
    makeRunnerStep(
      'loadList',
      workflowOrder.find(step => step.key === 'loadList')?.short || 'Loads',
      'loadlist.html',
      loads.total === 0 || loads.incomplete > 0 ? 'fail' : 'pass',
      loads.total === 0 ? 'Add loads and connect them to source equipment.' : `${loads.complete}/${loads.total} load record(s) complete.`
    ),
    makeRunnerStep(
      'autoBuild',
      'Auto-Build Workflow',
      'workflowdashboard.html',
      autoBuildRecommended ? 'warn' : (readyForAutoBuild ? 'pass' : 'pending'),
      readyForAutoBuild ? 'Generate missing one-line, cable, raceway, assignment, and initial route-result records from equipment, loads, and design-basis defaults.' : 'Add valid equipment and complete load rows before Auto-Build can run.',
      'Auto-Build Workflow'
    ),
    makeRunnerStep(
      'oneLineDiagram',
      workflowOrder.find(step => step.key === 'oneLineDiagram')?.short || 'One-Line',
      'oneline.html',
      health.oneLineComponents > 0 && !health.reconcilePending && health.oneLineIssues === 0 ? 'pass' : 'warn',
      health.oneLineComponents > 0 ? `${health.oneLineComponents} one-line component(s) found; ${health.oneLineIssues} validation issue(s)${health.reconcilePending ? '; reconcile is pending.' : '.'}` : 'No one-line components are present yet.'
    ),
    makeRunnerStep(
      'cableSchedule',
      workflowOrder.find(step => step.key === 'cableSchedule')?.short || 'Cables',
      'cableschedule.html',
      cables.total > 0 && cables.missingSchedule === 0 ? 'pass' : 'warn',
      cables.total > 0 ? `${cables.scheduleReady}/${cables.total} cable row(s) schedule-ready.` : 'No cable rows are present yet.'
    ),
    makeRunnerStep(
      'racewaySchedule',
      workflowOrder.find(step => step.key === 'racewaySchedule')?.short || 'Raceways',
      'racewayschedule.html',
      health.raceways > 0 && health.racewayIssues === 0 ? 'pass' : 'warn',
      health.raceways > 0 ? `${health.raceways} parent raceway record(s); ${health.racewayIssues} integrity issue(s).` : 'No raceway records are available yet.'
    ),
    makeRunnerStep(
      'fillRouting',
      workflowOrder.find(step => step.key === 'fillRouting')?.short || 'Fill / Routing',
      'optimalRoute.html',
      cables.routingReady > 0 && cables.missingCoordinates === 0 && health.routeResults >= cables.routingReady ? 'pass' : 'warn',
      cables.routingReady > 0 && cables.missingCoordinates === 0 && health.routeResults >= cables.routingReady
        ? `${health.routeResults} route result(s) are available and reproducible.`
        : (cables.missingCoordinates > 0
            ? `${cables.missingCoordinates} cable row(s) need endpoint coordinates before routing can be reproduced.`
            : 'Assign raceways and run routing before deliverables.')
    ),
    makeRunnerStep(
      'studies',
      workflowOrder.find(step => step.key === 'studies')?.short || 'Studies',
      'demandschedule.html',
      health.studies > 0 ? 'pass' : 'warn',
      health.studies > 0 ? `${health.studies} saved study result set(s) found.` : 'No saved study results are available yet.'
    ),
    makeRunnerStep(
      'deliverables',
      workflowOrder.find(step => step.key === 'deliverables')?.short || 'Deliverables',
      'projectreport.html',
      !diagnostics.readyForDeliverables ? 'fail' : (health.deliverables > 0 ? 'pass' : 'warn'),
      !diagnostics.readyForDeliverables ? `${diagnostics.issueBlockers.length} workflow blocker(s) and ${diagnostics.designReview.deliverableBlockers.length} design-basis gate(s) block export or release.` : 'Build reports, snapshots, and release packages from synchronized project data.'
    )
  ];

  const designSetupNeeded = !designBasis.configured || (designBasis.missing || []).length > 0;
  const currentStep = steps.find(step => step.status === 'fail' && step.id !== 'deliverables')
    || (designSetupNeeded ? steps.find(step => step.id === 'designBasis') : null)
    || (autoBuildRecommended ? steps.find(step => step.id === 'autoBuild') : null)
    || steps.find(step => step.status === 'warn')
    || steps[steps.length - 1];
  const workflowSteps = steps.filter(step => step.id !== 'designBasis' && step.id !== 'autoBuild');

  return {
    currentStep,
    steps: workflowSteps,
    prompts,
    compliance,
    readyForAutoBuild,
    autoBuildRecommended,
    readyForDeliverables: diagnostics.readyForDeliverables && compliance.summary.fail === 0,
    diagnostics
  };
}

export function buildWorkflowCoreDiagnostics(project = {}) {
  const designReview = buildDesignBasisReview({
    designBasis: project.designBasis || null,
    designGateApprovals: project.designGateApprovals || project.reviewGateApprovals || {},
    equipment: project.equipment || [],
    oneLine: project.oneLine || {},
    cables: project.cables || [],
    trays: project.trays || [],
    conduits: project.conduits || [],
    ductbanks: project.ductbanks || [],
    studies: project.studies || {},
    studyApprovals: project.studyApprovals || project.approvals || {},
    routeResults: project.routeResults || project.latestRouteResults || [],
    tccSettings: project.tccSettings || null
  });
  const designBasisSummary = designReview.summary;
  const equipmentSummary = summarizeEquipment(project.equipment || []);
  const loadSummary = summarizeLoadValidation(project.loads || []);
  const cableReadiness = getCableReadiness(project.cables || []);
  const cableDeliverables = cableDeliverableReadiness(project.cables || []);
  const designRules = designRuleSummary(project);
  const oneLineComponents = countOneLineComponents(project.oneLine || {});
  const oneLineValidationIssues = runValidation(flattenOneLineComponents(project.oneLine || {}), project.studies || {});
  const racewayIntegrity = buildRacewayIntegrity({
    trays: project.trays || [],
    conduits: project.conduits || [],
    ductbanks: project.ductbanks || []
  });
  const raceways = meaningfulRecords(project.trays).length
    + meaningfulRecords(project.conduits).length
    + meaningfulRecords(project.ductbanks).length;
  const studies = countObjectRecords(project.studies);
  const deliverables = countObjectRecords(project.reportSnapshots) + countObjectRecords(project.deliverables);
  const deliverableDiagnostics = buildDeliverableReadinessDiagnostics({
    cables: project.cables || [],
    trays: project.trays || [],
    conduits: project.conduits || [],
    ductbanks: project.ductbanks || [],
    studies: project.studies || {},
    routeResults: project.routeResults || project.latestRouteResults || [],
    reportSnapshots: project.reportSnapshots || {},
    lifecyclePackages: project.deliverables || []
  });
  const reconcilePending = Boolean(project.reconcilePending);
  const blockers = [];

  if (!designBasisSummary.configured) {
    blockers.push(makeBlocker('Design Basis', 'warning', 'Set project design basis', 'Run the Design Basis Wizard so Auto-Build defaults, study prerequisites, and approval rules are explicit.', 'workflowdashboard.html'));
  } else if (designBasisSummary.missing.length > 0) {
    blockers.push(makeBlocker('Design Basis', 'warning', 'Complete design basis review rules', designBasisSummary.missing.join(' '), 'workflowdashboard.html'));
  } else if (designReview.blockingGateCount > 0) {
    const gate = designReview.openGates.find(item => item.blocking || item.severity === 'critical');
    blockers.push(makeBlocker('Design Basis', 'warning', gate?.label || 'Resolve design basis gates', gate?.detail || `${designReview.blockingGateCount} blocking approval gate(s) require review.`, gate?.href || 'workflowdashboard.html'));
  } else if (designReview.openGateCount > 0) {
    blockers.push(makeBlocker('Design Basis', 'info', 'Review design basis gates', `${designReview.openGateCount} approval gate(s) remain open for generated records, studies, or deliverables.`, 'workflowdashboard.html'));
  }

  if (equipmentSummary.total === 0) {
    blockers.push(makeBlocker('Equipment List', 'critical', 'Add equipment records', 'Create the major equipment basis before loads and one-line work.', 'equipmentlist.html'));
  } else {
    if (equipmentSummary.missingTags > 0) {
      blockers.push(makeBlocker('Equipment List', 'critical', 'Fix missing equipment tags', `${equipmentSummary.missingTags} equipment records need tags.`, 'equipmentlist.html'));
    }
    if (equipmentSummary.duplicateTags > 0) {
      blockers.push(makeBlocker('Equipment List', 'critical', 'Resolve duplicate equipment tags', `${equipmentSummary.duplicateTags} equipment records share a tag.`, 'equipmentlist.html'));
    }
    if (equipmentSummary.missingVoltage > 0) {
      blockers.push(makeBlocker('Equipment List', 'warning', 'Add equipment voltage ratings', `${equipmentSummary.missingVoltage} equipment records are missing voltage.`, 'equipmentlist.html'));
    }
  }

  if (loadSummary.total === 0) {
    blockers.push(makeBlocker('Load List', 'critical', 'Add load records', 'Create or import loads after equipment is established.', 'loadlist.html'));
  } else if (loadSummary.incomplete > 0) {
    blockers.push(makeBlocker('Load List', 'critical', 'Complete load required fields', `${loadSummary.incomplete} loads need source, kW, voltage, power factor, or phases.`, 'loadlist.html'));
  }

  if (oneLineComponents === 0) {
    blockers.push(makeBlocker('One-Line', 'warning', 'Build or reconcile the one-line', 'No one-line components are present for diagram coordination.', 'oneline.html'));
  } else if (oneLineValidationIssues.length > 0) {
    blockers.push(makeBlocker(
      'One-Line',
      'warning',
      'Resolve one-line validation issues',
      `${oneLineValidationIssues.length} one-line validation issue(s) must be resolved before deliverables can be issued.`,
      'oneline.html'
    ));
  }
  if (reconcilePending) {
    blockers.push(makeBlocker('One-Line', 'warning', 'Reconcile one-line schedule changes', 'One-Line changes are pending explicit schedule reconciliation.', 'oneline.html'));
  }

  if (cableReadiness.total === 0) {
    blockers.push(makeBlocker('Cable Schedule', 'warning', 'Add cable schedule rows', 'Cable schedule is empty; add rows or reconcile from the one-line.', 'cableschedule.html'));
  } else if (cableReadiness.missingSchedule > 0) {
    blockers.push(makeBlocker('Cable Schedule', 'warning', 'Finish schedule-ready cable fields', `${cableReadiness.missingSchedule} cables need tag, endpoints, conductor size, or length.`, 'cableschedule.html'));
  }
  if (cableDeliverables.total > 0 && cableDeliverables.missingFields > 0) {
    const missing = [
      cableDeliverables.missingInsulation ? `${cableDeliverables.missingInsulation} missing insulation type` : '',
      cableDeliverables.missingVoltage ? `${cableDeliverables.missingVoltage} missing cable voltage rating` : ''
    ].filter(Boolean).join('; ');
    blockers.push(makeBlocker('Cable Schedule', 'warning', 'Complete deliverable cable fields', `${missing}. These fields are required for an issue-ready cable schedule.`, 'cableschedule.html'));
  }

  if (raceways === 0) {
    blockers.push(makeBlocker('Raceway Schedule', 'warning', 'Add raceway records', 'No trays, conduits, or ductbanks are available for routing.', 'racewayschedule.html'));
  } else if (racewayIntegrity.issues > 0) {
    const issueParts = [
      racewayIntegrity.duplicateIds ? `${racewayIntegrity.duplicateIds} duplicate ID occurrence(s)` : '',
      racewayIntegrity.missingIds ? `${racewayIntegrity.missingIds} missing ID(s)` : '',
      racewayIntegrity.missingDuctbankEndpoints ? `${racewayIntegrity.missingDuctbankEndpoints} ductbank parent row(s) missing From/To` : ''
    ].filter(Boolean);
    blockers.push(makeBlocker(
      'Raceway Schedule',
      'warning',
      'Resolve raceway schedule integrity issues',
      `${issueParts.join(', ')}.`,
      'racewayschedule.html'
    ));
  }
  if (cableReadiness.scheduleReady > 0 && cableReadiness.routingReady === 0) {
    blockers.push(makeBlocker('Fill / Routing', 'warning', 'Assign raceways to cables', `${cableReadiness.scheduleReady} schedule-ready cables still need raceway assignments.`, 'cableschedule.html'));
  }
  if (cableReadiness.routingReady > 0 && cableReadiness.missingCoordinates > 0) {
    blockers.push(makeBlocker('Fill / Routing', 'warning', 'Complete routing coordinates', `${cableReadiness.missingCoordinates} routed cable(s) need start and end XYZ coordinates before route results can be reproduced.`, 'cableschedule.html'));
  } else if (cableReadiness.routingReady > 0 && deliverableDiagnostics.health.routeResults === 0) {
    blockers.push(makeBlocker('Fill / Routing', 'warning', 'Run routing for deliverables', 'Pull cards and procurement need route results from Optimal Route.', 'optimalRoute.html'));
  } else if (deliverableDiagnostics.missingRouteResultTags.length > 0) {
    blockers.push(makeBlocker('Fill / Routing', 'warning', 'Refresh route results', `${deliverableDiagnostics.missingRouteResultTags.length} schedule-ready cables do not have matching route results.`, 'optimalRoute.html'));
  }

  if (studies === 0) {
    blockers.push(makeBlocker('Studies', 'info', 'Run workflow studies', 'No saved study results are available yet.', 'demandschedule.html'));
  }
  if (designRules.errors > 0) {
    blockers.push(makeBlocker('Design Rule Check', 'critical', 'Resolve design-rule errors', `${designRules.errors} error(s) and ${designRules.warnings} warning(s) are active. Workflow data may be complete, but deliverables are not issue-ready.`, 'designrulechecker.html'));
  } else if (designRules.warnings > 0) {
    blockers.push(makeBlocker('Design Rule Check', 'info', 'Review design-rule warnings', `${designRules.warnings} warning(s) remain. Calculations can continue, but review them before issue.`, 'designrulechecker.html'));
  }
  if (deliverables === 0) {
    blockers.push(makeBlocker('Deliverables', 'info', 'Create report snapshot', 'No report snapshots or release packages are saved yet.', 'projectreport.html'));
  }

  const issueBlockers = blockers.filter(item => item.severity === 'critical' || item.severity === 'warning');
  const readyForDeliverables = issueBlockers.length === 0 && designReview.readyForDeliverables;
  const workflowSteps = [
    {
      key: 'equipmentList',
      complete: equipmentSummary.total > 0 && equipmentSummary.missingTags === 0 && equipmentSummary.duplicateTags === 0,
      label: `${equipmentSummary.total} equipment record(s)`,
      hint: blockers.find(item => item.step === 'Equipment List')?.detail || null
    },
    {
      key: 'loadList',
      complete: loadSummary.total > 0 && loadSummary.incomplete === 0,
      label: `${loadSummary.complete} of ${loadSummary.total} load record(s) complete`,
      hint: blockers.find(item => item.step === 'Load List')?.detail || null
    },
    {
      key: 'oneLineDiagram',
      complete: oneLineComponents > 0 && oneLineValidationIssues.length === 0 && !reconcilePending,
      label: `${oneLineComponents} component(s), ${oneLineValidationIssues.length} issue(s)`,
      hint: blockers.find(item => item.step === 'One-Line')?.detail || null
    },
    {
      key: 'cableSchedule',
      complete: cableReadiness.total > 0 && cableReadiness.missingSchedule === 0,
      label: `${cableReadiness.scheduleReady} of ${cableReadiness.total} schedule-ready`,
      hint: blockers.find(item => item.step === 'Cable Schedule')?.detail || null
    },
    {
      key: 'racewaySchedule',
      complete: raceways > 0 && racewayIntegrity.issues === 0,
      label: `${raceways} parent raceway record(s), ${racewayIntegrity.issues} issue(s)`,
      hint: blockers.find(item => item.step === 'Raceway Schedule')?.detail || null
    },
    {
      key: 'fillRouting',
      complete: cableReadiness.routingReady > 0
        && cableReadiness.missingCoordinates === 0
        && deliverableDiagnostics.health.routeResults >= cableReadiness.routingReady
        && deliverableDiagnostics.missingRouteResultTags.length === 0,
      label: `${deliverableDiagnostics.health.routeResults} route result(s)`,
      hint: blockers.find(item => item.step === 'Fill / Routing')?.detail || null
    },
    {
      key: 'studies',
      complete: studies > 0,
      label: `${studies} study result set(s)`,
      hint: blockers.find(item => item.step === 'Studies')?.detail || null
    },
    {
      key: 'deliverables',
      complete: readyForDeliverables && deliverables > 0,
      label: readyForDeliverables ? `${deliverables} deliverable(s)` : `${issueBlockers.length} workflow blocker(s)`,
      hint: readyForDeliverables ? null : issueBlockers[0]?.detail || 'Resolve workflow blockers before issuing deliverables.'
    }
  ];

  return {
    health: {
      equipment: equipmentSummary.total,
      loads: loadSummary.total,
      completeLoads: loadSummary.complete,
      oneLineComponents,
      cableRows: cableReadiness.total,
      scheduleReady: cableReadiness.scheduleReady,
      routingReady: cableReadiness.routingReady,
      raceways,
      routeResults: deliverableDiagnostics.health.routeResults,
      pullGroups: deliverableDiagnostics.health.pullGroups,
      spoolSheets: deliverableDiagnostics.health.spoolCount,
      reportSnapshots: deliverableDiagnostics.health.reportSnapshots,
      lifecyclePackages: deliverableDiagnostics.health.lifecyclePackages,
      studies,
      deliverables,
      designBasis: designBasisSummary.complete ? 'Configured' : 'Needs review',
      designBasisReviewGates: designReview.openGateCount,
      drcErrors: designRules.errors,
      drcWarnings: designRules.warnings,
      cableDeliverableReady: cableDeliverables.ready,
      cableDeliverableMissing: cableDeliverables.missingFields,
      reconcilePending,
      oneLineIssues: oneLineValidationIssues.length,
      racewayIssues: racewayIntegrity.issues
    },
    designBasis: designBasisSummary,
    designReview,
    equipment: equipmentSummary,
    loads: loadSummary,
    cables: cableReadiness,
    cableDeliverables,
    designRules,
    oneLineValidationIssues,
    racewayIntegrity,
    deliverables: deliverableDiagnostics,
    blockers,
    issueBlockers,
    workflowSteps,
    readyForDeliverables,
    nextAction: findNextAction(blockers)
  };
}
