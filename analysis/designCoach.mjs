export const DESIGN_COACH_VERSION = 'design-coach-v1';

const CATEGORY_WEIGHT = {
  safety: 0,
  code: 1,
  constructability: 2,
  missingData: 3,
  review: 4,
  cost: 5,
};

const SEVERITY_WEIGHT = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const STUDY_PAGE_HREF = {
  arcFlash: 'arcFlash.html',
  shortCircuit: 'shortCircuit.html',
  loadFlow: 'loadFlow.html',
  harmonics: 'harmonics.html',
  harmonicStudyCase: 'harmonics.html',
  harmonicStudy: 'harmonics.html',
  capacitorBank: 'capacitorbank.html',
  capacitorBankDuty: 'capacitorbank.html',
  reliabilityNetwork: 'reliability.html',
  transientStability: 'transientstability.html',
  ibrPlantController: 'ibr.html',
  emfExposure: 'emf.html',
  emf: 'emf.html',
  cathodicProtectionNetwork: 'cathodicprotection.html',
  cathodicProtection: 'cathodicprotection.html',
  motorStart: 'motorStart.html',
  heatTraceSizing: 'heattracesizing.html',
  heatTraceSizingCircuits: 'heattracesizing.html',
  dissimilarMetals: 'dissimilarmetals.html',
  reliability: 'reliability.html',
  contingency: 'contingency.html',
  optimalPowerFlow: 'optimalpowerflow.html',
  pullConstructability: 'pullcards.html',
  loadDemandGovernance: 'loadlist.html',
  transformerFeederSizing: 'autosize.html',
  voltageDropStudy: 'voltagedropstudy.html',
  voltageFlicker: 'voltageflicker.html',
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function slug(value = '') {
  return String(value || 'item')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value = '') {
  const input = String(value);
  let result = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    result ^= input.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}

function normalizeSeverity(severity = 'medium') {
  const value = String(severity || '').toLowerCase();
  if (['critical', 'high', 'medium', 'low', 'info'].includes(value)) return value;
  if (['error', 'fail', 'failed', 'over', 'blocked'].includes(value)) return 'high';
  if (['warning', 'warn', 'near', 'review'].includes(value)) return 'medium';
  return 'info';
}

function normalizeCategory(category = 'review') {
  return Object.prototype.hasOwnProperty.call(CATEGORY_WEIGHT, category) ? category : 'review';
}

function makeAction({
  title,
  description,
  severity = 'medium',
  category = 'review',
  confidence = 0.75,
  scope = {},
  source = {},
  recommendation = '',
  tradeoffs = '',
  pageHref = 'workflowdashboard.html',
  apply = null,
}) {
  const normalizedSeverity = normalizeSeverity(severity);
  const normalizedCategory = normalizeCategory(category);
  const fingerprint = `${slug(source.type || 'source')}:${slug(source.key || title)}:${hash(stableStringify({ title, scope, recommendation }))}`;
  return {
    id: `coach-${fingerprint}`,
    fingerprint,
    title,
    description,
    severity: normalizedSeverity,
    category: normalizedCategory,
    confidence: Number.isFinite(confidence) ? confidence : 0.75,
    scope,
    source,
    recommendation,
    tradeoffs,
    pageHref,
    ...(apply ? { apply } : {}),
  };
}

function drcAction(finding = {}) {
  const ruleId = finding.ruleId || 'DRC';
  const severity = finding.severity === 'error' ? 'high' : finding.severity === 'warning' ? 'medium' : 'low';
  const category = ruleId === 'DRC-01' || ruleId === 'DRC-02' || ruleId === 'DRC-03' || ruleId === 'DRC-04'
    ? 'code'
    : 'constructability';
  return makeAction({
    title: `${ruleId}: ${finding.location || 'Design finding'}`,
    description: finding.message || 'Design rule checker finding requires review.',
    severity,
    category,
    confidence: finding.isAccepted ? 0.55 : 0.9,
    scope: { location: finding.location || '', ruleId },
    source: { type: 'drc', key: `${ruleId}:${finding.location || ''}` },
    recommendation: finding.remediation || 'Review the design rule checker finding and update the affected inputs.',
    tradeoffs: finding.reference ? `Reference: ${finding.reference}` : 'Engineering judgment may be required before changing the design.',
    pageHref: 'designrulechecker.html',
  });
}

function validationActions(report = {}) {
  return asArray(report.validation?.warnings).map((warning, index) => makeAction({
    title: warning.severity === 'info' ? 'Review project validation note' : 'Resolve project validation warning',
    description: warning.message || 'Project validation warning requires review.',
    severity: warning.severity === 'info' ? 'low' : 'medium',
    category: warning.message?.toLowerCase().includes('no length') || warning.message?.toLowerCase().includes('no raceway')
      ? 'missingData'
      : 'review',
    confidence: 0.85,
    scope: { items: asArray(warning.items).slice(0, 20), validationIndex: index },
    source: { type: 'projectValidation', key: `${warning.severity || 'warning'}:${index}` },
    recommendation: 'Open the affected schedule and complete or correct the listed records.',
    tradeoffs: 'Correcting missing source data improves downstream studies and report confidence.',
    pageHref: 'projectreport.html',
  }));
}

function racewayFillActions(report = {}) {
  const rows = [
    ...asArray(report.fill?.trays).map(row => ({ ...row, class: 'Tray' })),
    ...asArray(report.fill?.conduits).map(row => ({ ...row, class: 'Conduit' })),
  ];
  return rows
    .filter(row => row.status === 'over' || row.status === 'near')
    .map(row => makeAction({
      title: `${row.class} ${row.id} fill is ${row.status === 'over' ? 'over limit' : 'near limit'}`,
      description: `${row.class} ${row.id} is at ${row.usedPct}% used against a ${row.limitPct}% limit.`,
      severity: row.status === 'over' ? 'high' : 'medium',
      category: row.status === 'over' ? 'code' : 'constructability',
      confidence: 0.88,
      scope: { raceway: row.id, usedPct: row.usedPct, limitPct: row.limitPct },
      source: { type: 'racewayFill', key: `${row.id}:${row.status}` },
      recommendation: 'Review routing, tray/conduit sizing, or add parallel capacity before issuing construction documents.',
      tradeoffs: 'Increasing raceway size can affect supports, fill calculations, material cost, and field routing.',
      pageHref: 'cabletrayfill.html',
    }));
}

function clashActions(report = {}) {
  return asArray(report.clashes?.clashes)
    .filter(clash => clash.severity && clash.severity !== 'pass')
    .map((clash, index) => makeAction({
      title: `Resolve ${clash.severity} clash between ${clash.trayA || 'A'} and ${clash.trayB || 'B'}`,
      description: clash.description || 'Clash detection found an interference requiring coordination.',
      severity: clash.severity === 'hard' || clash.severity === 'error' ? 'high' : 'medium',
      category: 'constructability',
      confidence: 0.82,
      scope: { trayA: clash.trayA, trayB: clash.trayB, clashIndex: index },
      source: { type: 'clashDetection', key: `${clash.trayA || ''}:${clash.trayB || ''}:${index}` },
      recommendation: 'Coordinate the affected route elevations or offsets and rerun clash detection.',
      tradeoffs: 'Route changes can affect cable length, supports, tray fill, and construction sequencing.',
      pageHref: 'clashdetect.html',
    }));
}

function heatTraceActions(report = {}) {
  const heatTrace = report.heatTrace || {};
  const warnings = [
    ...asArray(heatTrace.warnings).map((warning, index) => ({
      key: `${warning.source || 'heatTrace'}:${index}`,
      message: warning.message || String(warning),
      source: warning.source || 'Heat Trace',
    })),
    ...asArray(heatTrace.installationPackage?.warnings).map((warning, index) => ({
      key: `package:${index}`,
      message: warning.message || String(warning),
      source: warning.source || 'Heat Trace Package',
    })),
  ];
  const warningActions = warnings.map(warning => makeAction({
    title: `Review ${warning.source} warning`,
    description: warning.message,
    severity: /over|invalid|incompatible|hazard/i.test(warning.message) ? 'high' : 'medium',
    category: /manufacturer|verify|hazard/i.test(warning.message) ? 'review' : 'constructability',
    confidence: 0.8,
    scope: { source: warning.source },
    source: { type: 'heatTrace', key: warning.key },
    recommendation: 'Open the heat-trace sizing/package workflow and resolve or document the warning before release.',
    tradeoffs: 'Final cable family, startup current, hazardous area, and accessory selections may require manufacturer verification.',
    pageHref: 'heattracesizing.html',
  }));
  const advanced = heatTrace.advancedPackage || {};
  const advancedActions = [
    ...asArray(advanced.segmentRows)
      .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
      .slice(0, 20)
      .map(row => makeAction({
        title: `${row.assetTag || row.label} heat-trace segment needs review`,
        description: `${row.label || row.id || 'Segment'} is ${row.status}; installed ${row.installedWatts ?? 'n/a'} W versus required ${row.requiredWatts ?? 'n/a'} W.`,
        severity: row.status === 'fail' ? 'high' : 'medium',
        category: row.status === 'missingData' ? 'missingData' : 'constructability',
        confidence: 0.8,
        scope: { assetTag: row.assetTag, segmentId: row.id, status: row.status },
        source: { type: 'heatTraceAdvanced', key: `segment:${row.caseId}:${row.id}:${row.status}` },
        recommendation: row.recommendation || 'Complete multi-segment insulation, ambient, and watt-density assumptions.',
        tradeoffs: 'Splitting or increasing heat trace can affect panel loading, startup current, control strategy, and installation details.',
        pageHref: 'heattracesizing.html',
      })),
    ...asArray(advanced.controlRows)
      .filter(row => row.status === 'missingData' || row.status === 'warn')
      .slice(0, 20)
      .map(row => makeAction({
        title: `${row.assetTag} heat-trace controls need verification`,
        description: [
          ...asArray(row.missingFields).map(field => `Missing ${field}.`),
          ...asArray(row.warnings),
        ].join(' ') || 'Controller, sensor, high-limit, hazardous-area, or phase metadata requires review.',
        severity: asArray(row.warnings).some(warning => /hazard|T-rating|Constant-wattage/i.test(warning)) ? 'high' : 'medium',
        category: row.status === 'missingData' ? 'missingData' : 'review',
        confidence: 0.82,
        scope: { assetTag: row.assetTag, controllerTag: row.controllerTag },
        source: { type: 'heatTraceAdvanced', key: `control:${row.caseId}:${row.status}` },
        recommendation: row.recommendation || 'Complete controller and sensor placement data before report release.',
        tradeoffs: 'Control changes can affect sheath temperature, nuisance trips, freeze protection margin, and commissioning scope.',
        pageHref: 'heattracesizing.html',
      })),
    ...asArray(advanced.startupProfileRows)
      .filter(row => row.status === 'warn')
      .slice(0, 20)
      .map(row => makeAction({
        title: `${row.assetTag} heat-trace startup current needs review`,
        description: `${row.segmentLabel || row.segmentId} startup estimate is ${row.startupAmps} A with multiplier ${row.coldStartMultiplier}.`,
        severity: 'high',
        category: 'review',
        confidence: 0.78,
        scope: { assetTag: row.assetTag, segmentId: row.segmentId, startupAmps: row.startupAmps },
        source: { type: 'heatTraceAdvanced', key: `startup:${row.caseId}:${row.segmentId}` },
        recommendation: row.recommendation || 'Verify startup current and panel diversity against manufacturer breaker tables.',
        tradeoffs: 'Reducing startup current may require staged energization, circuit splits, or product-family changes.',
        pageHref: 'heattracesizing.html',
      })),
    ...asArray(advanced.panelDiversityRows)
      .filter(row => row.status === 'missingData' || row.status === 'warn')
      .slice(0, 20)
      .map(row => makeAction({
        title: `${row.sourcePanel} heat-trace panel diversity needs review`,
        description: `Phase ${row.panelPhase || 'unassigned'} / group ${row.diversityGroup || 'none'} has ${row.startupAmps} A startup estimate.`,
        severity: row.status === 'missingData' ? 'medium' : 'high',
        category: row.status === 'missingData' ? 'missingData' : 'review',
        confidence: 0.76,
        scope: { sourcePanel: row.sourcePanel, panelPhase: row.panelPhase, diversityGroup: row.diversityGroup },
        source: { type: 'heatTraceAdvanced', key: `diversity:${row.sourcePanel}:${row.panelPhase}:${row.diversityGroup}` },
        recommendation: row.recommendation || 'Assign phases and diversity groups before issuing panel/controller loading.',
        tradeoffs: 'Panel phase balancing may require circuit reassignment or controller grouping changes.',
        pageHref: 'heattracesizing.html',
      })),
  ];
  return [...warningActions, ...advancedActions];
}

function equipmentEvaluationActions(report = {}) {
  return asArray(report.equipmentEvaluation?.rows)
    .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
    .slice(0, 30)
    .map(row => makeAction({
      title: row.status === 'fail'
        ? `${row.equipmentTag} ${row.ratingType} fails duty check`
        : row.status === 'missingData'
          ? `${row.equipmentTag} ${row.ratingType} missing data`
          : `${row.equipmentTag} ${row.ratingType} has low margin`,
      description: row.status === 'missingData'
        ? `Equipment evaluation cannot complete ${row.ratingType} because ${asArray(row.missingFields).join(', ') || 'required data'} is missing.`
        : `${row.ratingType}: required ${row.requiredValue ?? 'n/a'} kA, rated ${row.ratedValue ?? 'n/a'} kA, margin ${row.margin ?? 'n/a'} kA.`,
      severity: row.status === 'fail' ? 'high' : row.status === 'warn' ? 'medium' : 'medium',
      category: row.status === 'fail' ? 'safety' : row.status === 'missingData' ? 'missingData' : 'review',
      confidence: row.status === 'missingData' ? 0.78 : 0.88,
      scope: {
        equipmentTag: row.equipmentTag,
        ratingType: row.ratingType,
        requiredValue: row.requiredValue,
        ratedValue: row.ratedValue,
      },
      source: { type: 'equipmentEvaluation', key: `${row.equipmentTag}:${row.ratingType}:${row.status}` },
      recommendation: row.recommendation || 'Review equipment ratings and saved study results before issuing reports.',
      tradeoffs: 'Changing equipment ratings or reducing available fault current may affect procurement, coordination, and report assumptions.',
      pageHref: 'equipmentlist.html',
    }));
}

function shortCircuitStudyActions(report = {}, studies = {}) {
  const pkg = report.shortCircuit || studies.shortCircuit || null;
  if (!pkg) return [];
  const actions = [];
  if (!pkg.studyCase) {
    actions.push(makeAction({
      title: 'Define short-circuit study case basis',
      description: 'Short-circuit results exist without an auditable study-case basis for method, duty basis, fault types, voltage case, and equipment-duty side.',
      severity: 'medium',
      category: 'review',
      confidence: 0.84,
      scope: { study: 'shortCircuit' },
      source: { type: 'shortCircuit', key: 'missing-study-case' },
      recommendation: 'Open Short Circuit and rerun the study with the Short-Circuit Study Case panel completed.',
      tradeoffs: 'Rerunning may change equipment duty values consumed by equipment evaluation and reports.',
      pageHref: 'shortCircuit.html',
    }));
  }
  if (pkg.studyCase && !asArray(pkg.dutyRows).length) {
    actions.push(makeAction({
      title: 'Short-circuit study scope has no duty rows',
      description: 'The saved short-circuit study case did not produce bus/equipment duty rows, likely because scope filters excluded all buses.',
      severity: 'medium',
      category: 'missingData',
      confidence: 0.86,
      scope: { studyCase: pkg.studyCase },
      source: { type: 'shortCircuit', key: 'no-duty-rows' },
      recommendation: 'Review area, zone, voltage, and include/exclude scope filters, then rerun the short-circuit study.',
      tradeoffs: 'Relaxing filters may add more buses to equipment-duty and report outputs.',
      pageHref: 'shortCircuit.html',
    }));
  }
  asArray(pkg.warnings).forEach((warning, index) => {
    actions.push(makeAction({
      title: 'Review short-circuit study warning',
      description: warning.message || String(warning),
      severity: /no buses|missing|line-side/i.test(warning.message || warning) ? 'medium' : 'low',
      category: /missing|no buses/i.test(warning.message || warning) ? 'missingData' : 'review',
      confidence: 0.78,
      scope: { warningIndex: index },
      source: { type: 'shortCircuit', key: `warning:${index}` },
      recommendation: 'Review the short-circuit study basis and document or resolve the warning before release.',
      tradeoffs: 'Changing the study case can affect equipment duty margins and report assumptions.',
      pageHref: 'shortCircuit.html',
    }));
  });
  if (pkg.studyCase?.equipmentDutySide === 'lineSide') {
    actions.push(makeAction({
      title: 'Confirm line-side equipment duty interpretation',
      description: 'The short-circuit study case is marked for line-side equipment duty, which v1 records as a planning flag without topology mutation.',
      severity: 'medium',
      category: 'review',
      confidence: 0.76,
      scope: { equipmentDutySide: 'lineSide' },
      source: { type: 'shortCircuit', key: 'line-side-duty' },
      recommendation: 'Confirm whether line-side duty requires a separate modeled fault location or manufacturer/equipment review.',
      tradeoffs: 'Line-side duty can increase required equipment ratings and may require different protective-device assumptions.',
      pageHref: 'shortCircuit.html',
    }));
  }
  return actions;
}

function arcFlashStudyActions(report = {}, studies = {}) {
  const pkg = report.arcFlash || studies.arcFlash || null;
  if (!pkg) return [];
  const actions = [];
  if (!pkg.studyCase) {
    actions.push(makeAction({
      title: 'Define arc-flash study case basis',
      description: 'Arc-flash results exist without an auditable study-case package for equipment data, defaults, mitigation scenarios, and label readiness.',
      severity: 'medium',
      category: 'review',
      confidence: 0.84,
      scope: { study: 'arcFlash' },
      source: { type: 'arcFlash', key: 'missing-study-case' },
      recommendation: 'Open Arc Flash and rerun the study with equipment rows and mitigation scenarios saved into the package.',
      tradeoffs: 'Rerunning can change label readiness, mitigation comparison, equipment evaluation context, and report assumptions.',
      pageHref: 'arcFlash.html',
    }));
  }
  const baselineRows = asArray(pkg.scenarioComparison)
    .filter(row => row.scenarioId === 'baseline' || !row.scenarioId);
  baselineRows
    .filter(row => row.incidentEnergy > 40)
    .slice(0, 20)
    .forEach(row => {
      actions.push(makeAction({
        title: `${row.equipmentTag || row.equipmentId} exceeds 40 cal/cm2`,
        description: `Baseline arc-flash incident energy is ${row.incidentEnergy} cal/cm2 with PPE category ${row.ppeCategory}.`,
        severity: 'high',
        category: 'safety',
        confidence: 0.88,
        scope: { equipmentId: row.equipmentId, equipmentTag: row.equipmentTag, incidentEnergy: row.incidentEnergy },
        source: { type: 'arcFlash', key: `${row.equipmentId || row.equipmentTag}:danger` },
        recommendation: 'Verify equipment data, clearing time, and upstream device basis, then evaluate mitigation before issuing labels.',
        tradeoffs: 'Mitigation can require settings studies, maintenance procedures, device changes, or differential/arc-flash sensing coordination.',
        pageHref: 'arcFlash.html',
      }));
    });
  baselineRows
    .filter(row => row.incidentEnergy > 8 && row.incidentEnergy <= 40)
    .slice(0, 20)
    .forEach(row => {
      actions.push(makeAction({
        title: `${row.equipmentTag || row.equipmentId} has high incident energy`,
        description: `Baseline arc-flash incident energy is ${row.incidentEnergy} cal/cm2.`,
        severity: 'medium',
        category: 'safety',
        confidence: 0.82,
        scope: { equipmentId: row.equipmentId, equipmentTag: row.equipmentTag, incidentEnergy: row.incidentEnergy },
        source: { type: 'arcFlash', key: `${row.equipmentId || row.equipmentTag}:high-energy` },
        recommendation: row.recommendation || 'Review clearing time and mitigation scenarios before releasing arc-flash labels.',
        tradeoffs: 'Lower incident energy may require operational mode changes or protective-device setting review.',
        pageHref: 'arcFlash.html',
      }));
    });
  if ((pkg.summary?.defaultedInputCount || 0) > 0 || (pkg.summary?.missingInputCount || 0) > 0) {
    actions.push(makeAction({
      title: 'Complete defaulted arc-flash equipment data',
      description: `${pkg.summary?.defaultedInputCount || 0} defaulted and ${pkg.summary?.missingInputCount || 0} missing arc-flash equipment input(s) are present in the saved study package.`,
      severity: 'medium',
      category: 'missingData',
      confidence: 0.86,
      scope: { defaultedInputCount: pkg.summary?.defaultedInputCount || 0, missingInputCount: pkg.summary?.missingInputCount || 0 },
      source: { type: 'arcFlash', key: 'defaulted-inputs' },
      recommendation: 'Open Arc Flash, replace defaults with verified equipment dimensions, gap, working distance, voltage, and upstream device basis, then rerun.',
      tradeoffs: 'Collecting field/manufacturer data improves labels but may take additional survey and coordination time.',
      pageHref: 'arcFlash.html',
    }));
  }
  if ((pkg.summary?.highEnergyCount || 0) > 0 && (pkg.summary?.scenarioCount || 0) <= 1) {
    actions.push(makeAction({
      title: 'Add mitigation scenarios for high arc-flash energy',
      description: 'High-energy baseline rows exist but no enabled mitigation scenario is saved for comparison.',
      severity: 'medium',
      category: 'review',
      confidence: 0.8,
      scope: { highEnergyCount: pkg.summary?.highEnergyCount || 0, scenarioCount: pkg.summary?.scenarioCount || 0 },
      source: { type: 'arcFlash', key: 'missing-mitigation' },
      recommendation: 'Enable maintenance mode, ZSI, current-limiting, differential, or arc-flash sensing scenarios with explicit modifiers.',
      tradeoffs: 'Mitigation scenarios are planning comparisons and do not automatically change protective-device settings.',
      pageHref: 'arcFlash.html',
    }));
  }
  baselineRows
    .filter(row => row.labelReady === false || row.status === 'missingData')
    .slice(0, 20)
    .forEach(row => {
      actions.push(makeAction({
        title: `${row.equipmentTag || row.equipmentId} arc-flash label is not ready`,
        description: row.recommendation || 'Arc-flash scenario row is missing data required for label issue.',
        severity: 'medium',
        category: 'missingData',
        confidence: 0.8,
        scope: { equipmentId: row.equipmentId, equipmentTag: row.equipmentTag, status: row.status },
        source: { type: 'arcFlash', key: `${row.equipmentId || row.equipmentTag}:label-not-ready` },
        recommendation: 'Complete missing/defaulted arc-flash inputs and rerun before generating labels.',
        tradeoffs: 'Holding labels until data is complete reduces field labeling rework.',
        pageHref: 'arcFlash.html',
      }));
    });
  return actions;
}

function motorStartStudyActions(report = {}, studies = {}) {
  const pkg = report.motorStart || studies.motorStart || null;
  if (!pkg) return [];
  const actions = [];
  if (!pkg.studyCase) {
    actions.push(makeAction({
      title: 'Define motor-start study case basis',
      description: 'Motor-start results exist without an auditable study-case package for source, starter, sequence, torque, and acceleration assumptions.',
      severity: 'medium',
      category: 'review',
      confidence: 0.84,
      scope: { study: 'motorStart' },
      source: { type: 'motorStart', key: 'missing-study-case' },
      recommendation: 'Open Motor Starting and rerun the study with the Motor Start Study Case panel completed.',
      tradeoffs: 'Rerunning can change voltage-dip, acceleration, sequence-event, and report-package outputs.',
      pageHref: 'motorStart.html',
    }));
  }
  asArray(pkg.worstCaseRows)
    .filter(row => row.status === 'fail' || row.status === 'stalled')
    .slice(0, 30)
    .forEach(row => {
      actions.push(makeAction({
        title: `${row.motorTag || row.motorId} motor start requires correction`,
        description: `Motor-start screening status is ${row.status}; minimum voltage is ${row.minVoltagePu} pu with ${row.voltageSagPct}% sag and ${row.accelTimeSec}s acceleration time.`,
        severity: 'high',
        category: row.status === 'stalled' ? 'constructability' : 'safety',
        confidence: 0.86,
        scope: { motorId: row.motorId, motorTag: row.motorTag, status: row.status, minVoltagePu: row.minVoltagePu },
        source: { type: 'motorStart', key: `${row.motorId || row.motorTag}:fail` },
        recommendation: row.recommendation || 'Stagger motor starts, adjust starter controls, verify source impedance, or add source/reactive support.',
        tradeoffs: 'Mitigation can affect generator sizing, load-flow voltage profile, protection settings, and process start sequence.',
        pageHref: 'motorStart.html',
      }));
    });
  asArray(pkg.worstCaseRows)
    .filter(row => row.status === 'warn')
    .slice(0, 30)
    .forEach(row => {
      actions.push(makeAction({
        title: `${row.motorTag || row.motorId} motor start has low voltage margin`,
        description: `Motor-start screening warning: minimum voltage is ${row.minVoltagePu} pu and sag is ${row.voltageSagPct}%.`,
        severity: 'medium',
        category: 'review',
        confidence: 0.8,
        scope: { motorId: row.motorId, motorTag: row.motorTag, minVoltagePu: row.minVoltagePu },
        source: { type: 'motorStart', key: `${row.motorId || row.motorTag}:warn` },
        recommendation: row.recommendation || 'Review source impedance, start order, and reduced-voltage starter settings.',
        tradeoffs: 'Tighter sequencing or starter changes may add controls complexity but reduce voltage dip risk.',
        pageHref: 'motorStart.html',
      }));
    });
  if ((pkg.summary?.missingInputCount || 0) > 0 || (pkg.summary?.defaultedInputCount || 0) > 0) {
    actions.push(makeAction({
      title: 'Complete motor-start source and motor data',
      description: `${pkg.summary?.missingInputCount || 0} missing and ${pkg.summary?.defaultedInputCount || 0} defaulted motor-start input(s) are present.`,
      severity: 'medium',
      category: 'missingData',
      confidence: 0.82,
      scope: { missingInputCount: pkg.summary?.missingInputCount || 0, defaultedInputCount: pkg.summary?.defaultedInputCount || 0 },
      source: { type: 'motorStart', key: 'defaulted-inputs' },
      recommendation: 'Complete motor HP, voltage, FLA/LRA, inertia, torque curves, starter settings, source impedance, and bus references before release.',
      tradeoffs: 'Collecting motor and source data improves study credibility but may require equipment datasheets or field verification.',
      pageHref: 'motorStart.html',
    }));
  }
  asArray(pkg.warnings)
    .filter(warning => /source|control|legacy|sequence|voltage|stalled|missing/i.test(`${warning.code || ''} ${warning.message || warning}`))
    .slice(0, 10)
    .forEach((warning, index) => {
      actions.push(makeAction({
        title: 'Review motor-start study warning',
        description: warning.message || String(warning),
        severity: /voltage|stalled|missing/i.test(`${warning.code || ''} ${warning.message || warning}`) ? 'medium' : 'low',
        category: /missing|source|legacy/i.test(`${warning.code || ''} ${warning.message || warning}`) ? 'missingData' : 'review',
        confidence: 0.76,
        scope: { warningIndex: index },
        source: { type: 'motorStart', key: `warning:${warning.code || index}` },
        recommendation: 'Review the motor-start study basis and document or resolve the warning before release.',
        tradeoffs: 'Changing motor-start assumptions can affect generator sizing, load flow, and operating sequence recommendations.',
        pageHref: 'motorStart.html',
      }));
    });
  return actions;
}

function harmonicStudyActions(report = {}, studies = {}) {
  const pkg = report.harmonicStudy || studies.harmonicStudyCase || (studies.harmonics?.studyCase ? studies.harmonics : null);
  const actions = [];
  if (!pkg && studies.harmonics) {
    actions.push(makeAction({
      title: 'Define harmonic study case basis',
      description: 'Legacy harmonic results exist without PCC, source-spectrum, IEEE 519 demand-current, utility short-circuit, or filter-review assumptions.',
      severity: 'medium',
      category: 'review',
      confidence: 0.82,
      scope: { study: 'harmonics' },
      source: { type: 'harmonicStudy', key: 'legacy-without-study-case' },
      recommendation: 'Open Harmonic Analysis, complete the Harmonic Study Case panel, and save the packaged study before report release.',
      tradeoffs: 'Completing the package improves utility/PCC compliance traceability but may require demand-current and utility short-circuit data.',
      pageHref: 'harmonics.html',
    }));
    return actions;
  }
  if (!pkg) return actions;
  if (!pkg.studyCase) {
    actions.push(makeAction({
      title: 'Define harmonic PCC and compliance basis',
      description: 'Harmonic study package is missing an auditable study-case basis.',
      severity: 'medium',
      category: 'review',
      confidence: 0.82,
      scope: { study: 'harmonicStudy' },
      source: { type: 'harmonicStudy', key: 'missing-study-case' },
      recommendation: 'Open Harmonic Analysis and rerun with PCC, utility, demand-current, transformer, and source-spectrum fields completed.',
      tradeoffs: 'Rerunning can change compliance status, filter alternatives, and report warnings.',
      pageHref: 'harmonics.html',
    }));
  }
  asArray(pkg.complianceRows)
    .filter(row => row.status === 'fail')
    .slice(0, 30)
    .forEach(row => {
      actions.push(makeAction({
        title: `${row.sourceTag || row.sourceId} fails IEEE 519 ${row.checkType}`,
        description: `${row.checkType} is ${row.actualValue ?? 'missing'} against limit ${row.limitValue ?? 'missing'} at ${row.pccTag || 'the PCC'}.`,
        severity: row.checkType === 'TDD' ? 'high' : 'medium',
        category: 'code',
        confidence: 0.84,
        scope: { sourceId: row.sourceId, checkType: row.checkType, pccTag: row.pccTag },
        source: { type: 'harmonicStudy', key: `compliance:${row.sourceId}:${row.checkType}:fail` },
        recommendation: row.recommendation || 'Review nonlinear source spectra and evaluate active/passive filtering or utility PCC basis before release.',
        tradeoffs: 'Filter or source mitigation may affect capacitor duty, cost, space, and equipment procurement.',
        pageHref: 'harmonics.html',
      }));
    });
  asArray(pkg.complianceRows)
    .filter(row => row.status === 'missingData')
    .slice(0, 20)
    .forEach(row => {
      actions.push(makeAction({
        title: `${row.sourceTag || row.sourceId} harmonic compliance needs input data`,
        description: `Missing harmonic compliance fields: ${asArray(row.missingFields).join(', ') || 'PCC/source inputs'}.`,
        severity: 'medium',
        category: 'missingData',
        confidence: 0.82,
        scope: { sourceId: row.sourceId, checkType: row.checkType, missingFields: row.missingFields },
        source: { type: 'harmonicStudy', key: `missing:${row.sourceId}:${row.checkType}` },
        recommendation: 'Add PCC maximum demand current, utility short-circuit MVA, and source current/spectrum inputs for IEEE 519 screening.',
        tradeoffs: 'Collecting utility and demand data improves compliance credibility but may require billing, metering, or utility coordination.',
        pageHref: 'harmonics.html',
      }));
    });
  asArray(pkg.filterAlternatives)
    .filter(row => row.frequencyScanResonanceRisk === 'danger' || row.status === 'review' || row.status === 'recommended')
    .slice(0, 20)
    .forEach(row => {
      actions.push(makeAction({
        title: `${row.name || row.id} harmonic filter review is required`,
        description: `Filter alternative ${row.filterType} has ${row.frequencyScanResonanceRisk || 'review'} resonance risk and status ${row.status}.`,
        severity: row.frequencyScanResonanceRisk === 'danger' ? 'high' : 'medium',
        category: 'review',
        confidence: 0.78,
        scope: { filterId: row.id, targetHarmonics: row.targetHarmonics },
        source: { type: 'harmonicStudy', key: `filter:${row.id}:${row.status}` },
        recommendation: row.recommendation || 'Review frequency scan, capacitor duty, and manufacturer filter application limits.',
        tradeoffs: 'Filtering can improve compliance but may add losses, controls, space, and maintenance requirements.',
        pageHref: 'harmonics.html',
      }));
    });
  asArray(pkg.sourceRows)
    .filter(row => row.interharmonic || asArray(row.nonCharacteristicOrders).length)
    .slice(0, 20)
    .forEach(row => {
      actions.push(makeAction({
        title: `${row.tag || row.id} has non-characteristic harmonic content`,
        description: 'Interharmonic or non-characteristic source content is flagged for engineering review.',
        severity: 'medium',
        category: 'review',
        confidence: 0.76,
        scope: { sourceId: row.id, tag: row.tag },
        source: { type: 'harmonicStudy', key: `source-review:${row.id}` },
        recommendation: 'Verify source spectrum data, transformer treatment, and filter suitability for non-characteristic or interharmonic content.',
        tradeoffs: 'Detailed vendor/source spectra may be required for final mitigation design.',
        pageHref: 'harmonics.html',
      }));
    });
  asArray(pkg.warnings)
    .filter(warning => /demand|utility|pcc|resonance|filter|interharmonic|non-characteristic/i.test(`${warning.code || ''} ${warning.message || warning}`))
    .slice(0, 12)
    .forEach((warning, index) => {
      actions.push(makeAction({
        title: 'Review harmonic study warning',
        description: warning.message || String(warning),
        severity: /fail|danger|utility|demand/i.test(`${warning.code || ''} ${warning.message || warning}`) ? 'medium' : 'low',
        category: /missing|demand|utility|pcc/i.test(`${warning.code || ''} ${warning.message || warning}`) ? 'missingData' : 'review',
        confidence: 0.74,
        scope: { warningIndex: index },
        source: { type: 'harmonicStudy', key: `warning:${warning.code || index}` },
        recommendation: 'Resolve or document the harmonic study warning before issuing the report package.',
        tradeoffs: 'Leaving harmonic warnings unresolved may weaken PCC compliance and filter design traceability.',
        pageHref: 'harmonics.html',
      }));
    });
  return actions;
}

function capacitorBankDutyActions(report = {}, studies = {}) {
  const pkg = report.capacitorBankDuty || studies.capacitorBank || null;
  const actions = [];
  if (!pkg) return actions;
  if (pkg.kvarRequired != null && !pkg.version) {
    actions.push(makeAction({
      title: 'Create capacitor-bank duty package',
      description: 'A legacy capacitor-bank sizing result exists without staged duty, switching, detuning, protection, or discharge basis.',
      severity: 'medium',
      category: 'review',
      confidence: 0.8,
      scope: { studyKey: 'capacitorBank' },
      source: { type: 'capacitorBankDuty', key: 'legacy-without-duty-basis' },
      recommendation: 'Open Capacitor Bank Sizing, add duty/protection settings, run the duty check, and save the packaged result.',
      tradeoffs: 'Leaving this as a sizing-only result weakens procurement, harmonic-risk, and switching-duty traceability.',
      pageHref: 'capacitorbank.html',
    }));
    if (pkg.resonance?.riskLevel === 'danger') {
      actions.push(makeAction({
        title: 'Review capacitor-bank resonance danger',
        description: `Legacy capacitor-bank result has resonance danger at h=${pkg.resonance.harmonicOrder}.`,
        severity: 'high',
        category: 'code',
        confidence: 0.84,
        scope: { harmonicOrder: pkg.resonance.harmonicOrder, nearestDominant: pkg.resonance.nearestDominant },
        source: { type: 'capacitorBankDuty', key: 'legacy-resonance-danger' },
        recommendation: 'Evaluate detuned reactor or harmonic filter duty before energizing the bank.',
        tradeoffs: 'Detuning can reduce resonance risk but changes bank voltage/current duty and cost.',
        pageHref: 'capacitorbank.html',
      }));
    }
    return actions;
  }
  asArray(pkg.dutyRows)
    .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
    .slice(0, 30)
    .forEach(row => actions.push(makeAction({
      title: row.status === 'fail' ? `${row.stageLabel || row.stageId} capacitor duty fails` : `${row.stageLabel || row.stageId} capacitor duty needs review`,
      description: row.recommendation || `${row.checkType} status is ${row.status}.`,
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: row.status === 'missingData' ? 'missingData' : row.status === 'fail' ? 'code' : 'review',
      confidence: 0.82,
      scope: { stageId: row.stageId, checkType: row.checkType, actualValue: row.actualValue, limitValue: row.limitValue },
      source: { type: 'capacitorBankDuty', key: `duty:${row.id || row.stageId}:${row.status}` },
      recommendation: row.recommendation || 'Review capacitor voltage/current/kvar/discharge duty and vendor ratings.',
      tradeoffs: 'Changing capacitor duty settings can affect harmonic filter selection, protection, cost, and switching equipment.',
      pageHref: 'capacitorbank.html',
    })));
  [...asArray(pkg.protectionRows), ...asArray(pkg.switchingRows)]
    .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
    .slice(0, 30)
    .forEach(row => actions.push(makeAction({
      title: row.status === 'missingData' ? 'Complete capacitor-bank protection/switching data' : 'Review capacitor-bank protection/switching duty',
      description: row.recommendation || `${row.id} status is ${row.status}.`,
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: row.status === 'missingData' ? 'missingData' : 'review',
      confidence: 0.8,
      scope: { rowId: row.id, stageId: row.stageId, switchingDevice: row.switchingDevice },
      source: { type: 'capacitorBankDuty', key: `protection-switching:${row.id}:${row.status}` },
      recommendation: 'Record breaker/contactor/fuse, CT/unbalance, inrush/outrush, and discharge basis before releasing the package.',
      tradeoffs: 'Completing protection data improves constructability and commissioning review without selecting manufacturer-specific devices.',
      pageHref: 'capacitorbank.html',
    })));
  asArray(pkg.frequencyScanLinks)
    .filter(row => row.status === 'fail' || row.status === 'warn')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: 'Review linked capacitor-bank resonance context',
      description: row.message || 'Frequency-scan or harmonic-filter context indicates capacitor-bank resonance review is needed.',
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: 'review',
      confidence: 0.78,
      scope: { source: row.source, harmonicOrder: row.harmonicOrder, risk: row.risk },
      source: { type: 'capacitorBankDuty', key: `frequency-link:${row.id}:${row.status}` },
      recommendation: 'Coordinate capacitor-bank detuning with frequency scan and harmonic filter alternatives.',
      tradeoffs: 'Filter changes can affect reactive compensation, resonance, losses, and equipment procurement.',
      pageHref: 'capacitorbank.html',
    })));
  return actions;
}

function reliabilityNetworkActions(report = {}, studies = {}) {
  const pkg = report.reliabilityNetwork || studies.reliability || null;
  const actions = [];
  if (!pkg) return actions;
  if (pkg.componentStats && !pkg.version) {
    actions.push(makeAction({
      title: 'Create reliability network model basis',
      description: 'A legacy availability result exists without customer/load impact, restoration, or reliability-index basis.',
      severity: 'medium',
      category: 'review',
      confidence: 0.8,
      scope: { studyKey: 'reliability' },
      source: { type: 'reliabilityNetwork', key: 'legacy-without-network-model' },
      recommendation: 'Open Reliability Analysis, add customer/load and restoration rows, run the reliability model, and save it to studies.',
      tradeoffs: 'Customer indices make reliability results more reviewable but require explicit customer/load assumptions.',
      pageHref: 'reliability.html',
    }));
    return actions;
  }
  asArray(pkg.indexRows)
    .filter(row => row.status === 'warn' || row.status === 'review' || row.status === 'missingData')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: `${row.label || row.id} reliability index needs review`,
      description: `${row.label || row.id} is ${row.value ?? 'missing'} ${row.unit || ''}.`,
      severity: row.id === 'SAIDI' || row.id === 'SAIFI' ? 'medium' : 'low',
      category: row.status === 'missingData' ? 'missingData' : 'review',
      confidence: 0.78,
      scope: { indexId: row.id, value: row.value, unit: row.unit },
      source: { type: 'reliabilityNetwork', key: `index:${row.id}:${row.status}` },
      recommendation: 'Review failure/repair data, customer impact assignments, and restoration assumptions for this reliability index.',
      tradeoffs: 'Reliability improvements may require redundancy, faster switching, spares, or operational changes.',
      pageHref: 'reliability.html',
    })));
  asArray(pkg.scenarioRows)
    .filter(row => row.status === 'warn' || row.status === 'missingData')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: row.status === 'missingData' ? `${row.componentTag || row.id} has missing customer impact` : `${row.componentTag || row.id} restoration needs review`,
      description: row.recommendation || `${row.scenarioType} scenario status is ${row.status}.`,
      severity: 'medium',
      category: row.status === 'missingData' ? 'missingData' : 'review',
      confidence: 0.8,
      scope: { scenarioId: row.id, componentId: row.componentId, affectedCustomerCount: row.affectedCustomerCount, affectedLoadKw: row.affectedLoadKw },
      source: { type: 'reliabilityNetwork', key: `scenario:${row.id}:${row.status}` },
      recommendation: row.recommendation || 'Review customer assignment, protection zone, tie source, and restoration capacity.',
      tradeoffs: 'Adding restoration paths can improve indices but requires switching procedure, protection, and capacity review.',
      pageHref: 'reliability.html',
    })));
  asArray(pkg.warningRows)
    .slice(0, 20)
    .forEach((warning, index) => actions.push(makeAction({
      title: /customer|component|restoration|missing/i.test(`${warning.code || ''} ${warning.message || ''}`)
        ? 'Complete reliability model data'
        : 'Review reliability model warning',
      description: warning.message || String(warning),
      severity: warning.severity === 'error' ? 'high' : 'medium',
      category: /missing/i.test(`${warning.code || ''} ${warning.message || ''}`) ? 'missingData' : 'review',
      confidence: 0.78,
      scope: { warningIndex: index, code: warning.code, sourceId: warning.sourceId },
      source: { type: 'reliabilityNetwork', key: `warning:${warning.code || index}:${warning.sourceId || ''}` },
      recommendation: 'Complete reliability model assumptions before using customer indices for release decisions.',
      tradeoffs: 'More complete reliability assumptions improve owner review but may expose restoration or redundancy gaps.',
      pageHref: 'reliability.html',
    })));
  return actions;
}

function transientStabilityActions(report = {}, studies = {}) {
  const pkg = report.transientStability || studies.transientStability || null;
  const actions = [];
  if (!pkg) return actions;
  if ((pkg.stable != null || pkg.deltaMax_deg != null || pkg.cct_s != null) && !pkg.version) {
    actions.push(makeAction({
      title: 'Create transient-stability study-case basis',
      description: 'A legacy transient-stability result exists without dynamic model, disturbance event, CCT sweep, or channel-export basis.',
      severity: 'medium',
      category: 'review',
      confidence: 0.78,
      scope: { studyKey: 'transientStability' },
      source: { type: 'transientStability', key: 'legacy-without-study-case' },
      recommendation: 'Open Transient Stability, define dynamic model and disturbance event rows, rerun the study case, and save it to studies.',
      tradeoffs: 'Study-case traceability improves review quality but requires explicit disturbance and model assumptions.',
      pageHref: 'transientstability.html',
    }));
    return actions;
  }
  asArray(pkg.scenarioRows)
    .filter(row => row.status === 'fail' || row.status === 'warn' || row.stable === false)
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: row.status === 'fail' || row.stable === false ? `${row.modelTag || row.modelId} transient stability fails` : `${row.modelTag || row.modelId} has low stability margin`,
      description: row.recommendation || `Transient scenario status is ${row.status}.`,
      severity: row.status === 'fail' || row.stable === false ? 'high' : 'medium',
      category: 'safety',
      confidence: 0.82,
      scope: { modelId: row.modelId, clearingTimeSec: row.clearingTimeSec, cctSec: row.cctSec, cctMarginSec: row.cctMarginSec },
      source: { type: 'transientStability', key: `scenario:${row.id}:${row.status || row.stable}` },
      recommendation: row.recommendation || 'Review relay clearing time, transfer level, and post-fault transfer path.',
      tradeoffs: 'Improving stability can require faster protection, reduced transfer, additional damping, or network reinforcement.',
      pageHref: 'transientstability.html',
    })));
  asArray(pkg.cctSweepRows)
    .filter(row => row.status === 'fail' || row.status === 'warn')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: `${row.modelTag || row.modelId} CCT margin needs review`,
      description: row.recommendation || `CCT margin is ${row.marginSec ?? 'missing'} seconds.`,
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: 'review',
      confidence: 0.8,
      scope: { modelId: row.modelId, clearingTimeSec: row.clearingTimeSec, cctSec: row.cctSec, marginSec: row.marginSec },
      source: { type: 'transientStability', key: `cct:${row.id}:${row.status}` },
      recommendation: row.recommendation || 'Verify clearing time against relay and breaker timing basis.',
      tradeoffs: 'More conservative CCT margins may increase protection speed or equipment requirements.',
      pageHref: 'transientstability.html',
    })));
  asArray(pkg.dynamicModelRows)
    .filter(row => asArray(row.missingFields).length || asArray(row.defaultedFields).length || row.exciterModel || row.governorModel || row.pssModel || row.modelType !== 'synchronousGenerator')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: `${row.tag || row.id} dynamic model basis needs review`,
      description: row.modelType !== 'synchronousGenerator'
        ? `${row.modelType} is metadata-only in V1 transient-stability screening.`
        : `${row.tag || row.id} has missing/defaulted or unsupported control model fields.`,
      severity: 'medium',
      category: asArray(row.missingFields).length ? 'missingData' : 'review',
      confidence: 0.76,
      scope: { modelId: row.id, modelType: row.modelType, missingFields: row.missingFields, defaultedFields: row.defaultedFields },
      source: { type: 'transientStability', key: `model:${row.id}:${row.modelType}` },
      recommendation: 'Complete dynamic model parameters or document the screening-only assumption.',
      tradeoffs: 'Detailed dynamic model fidelity may require vendor parameters or specialist stability software.',
      pageHref: 'transientstability.html',
    })));
  asArray(pkg.warningRows)
    .slice(0, 20)
    .forEach((warning, index) => actions.push(makeAction({
      title: /missing/i.test(`${warning.code || ''} ${warning.message || ''}`) ? 'Complete transient-stability inputs' : 'Review transient-stability warning',
      description: warning.message || String(warning),
      severity: warning.severity === 'error' ? 'high' : 'medium',
      category: /missing/i.test(`${warning.code || ''} ${warning.message || ''}`) ? 'missingData' : 'review',
      confidence: 0.76,
      scope: { warningIndex: index, code: warning.code, sourceId: warning.sourceId },
      source: { type: 'transientStability', key: `warning:${warning.code || index}:${warning.sourceId || ''}` },
      recommendation: 'Resolve or document transient-stability screening assumptions before report release.',
      tradeoffs: 'Some dynamic-model warnings are acceptable for screening but should remain visible in deliverables.',
      pageHref: 'transientstability.html',
    })));
  return actions;
}

function ibrPlantControllerActions(report = {}, studies = {}) {
  const pkg = report.ibrPlantController || studies.ibrPlantController || studies.ibr?.plantControllerPackage || null;
  const actions = [];
  if (!pkg && (studies.ibr || studies.derInterconnect)) {
    actions.push(makeAction({
      title: 'Add DER / IBR plant-controller study basis',
      description: 'Legacy IBR or DER interconnection results exist without resource rows, grid-code curves, scenario cases, and plant-controller priority assumptions.',
      severity: 'medium',
      category: 'review',
      confidence: 0.82,
      scope: { studyKey: studies.ibr ? 'ibr' : 'derInterconnect' },
      source: { type: 'ibrPlantController', key: 'legacy-without-plant-basis' },
      recommendation: 'Open IBR Modeling and save a Plant Controller / Grid-Code Scenarios package before report release.',
      tradeoffs: 'Documenting the basis improves utility review traceability but does not replace manufacturer inverter model validation.',
      pageHref: 'ibr.html',
    }));
    return actions;
  }
  if (!pkg) return actions;
  asArray(pkg.capabilityRows)
    .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: `${row.scenarioLabel || row.scenarioId} IBR capability needs review`,
      description: `Plant controller scenario is ${row.status}; ${row.pTotalKw ?? 'n/a'} kW / ${row.qTotalKvar ?? 'n/a'} kvar at SCR ${row.shortCircuitRatio ?? 'n/a'}.`,
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: row.status === 'missingData' ? 'missingData' : 'review',
      confidence: 0.82,
      scope: { scenarioId: row.scenarioId, controlMode: row.controlMode, shortCircuitRatio: row.shortCircuitRatio },
      source: { type: 'ibrPlantController', key: `capability:${row.scenarioId}:${row.status}` },
      recommendation: row.recommendation || 'Review IBR resource ratings, priority mode, grid-strength assumptions, and dispatch setpoints.',
      tradeoffs: 'Changing priority or curtailment settings can improve voltage/grid-code behavior but may reduce real-power output.',
      pageHref: 'ibr.html',
    })));
  asArray(pkg.gridCodeRows)
    .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: `${row.label || row.checkType} grid-code basis needs review`,
      description: row.recommendation || 'Grid-code curve, ride-through, or dispatch basis needs review.',
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: row.status === 'missingData' ? 'missingData' : 'code',
      confidence: 0.84,
      scope: { checkType: row.checkType, status: row.status },
      source: { type: 'ibrPlantController', key: `grid-code:${row.id}:${row.status}` },
      recommendation: row.recommendation || 'Complete grid-code curve and ride-through point sets.',
      tradeoffs: 'Final grid-code settings may require utility approval and manufacturer configuration limits.',
      pageHref: 'ibr.html',
    })));
  asArray(pkg.warningRows)
    .filter(row => /ramp|clip|curtail|weak|forming|ride|curve|priority|missing/i.test(`${row.code || ''} ${row.message || ''}`))
    .slice(0, 20)
    .forEach((row, index) => actions.push(makeAction({
      title: `Review IBR plant-controller warning: ${row.code || 'warning'}`,
      description: row.message || 'IBR plant-controller warning requires review.',
      severity: row.severity === 'error' ? 'high' : 'medium',
      category: /missing/i.test(`${row.code || ''} ${row.message || ''}`) ? 'missingData' : 'review',
      confidence: 0.78,
      scope: { sourceId: row.sourceId, scenarioId: row.scenarioId },
      source: { type: 'ibrPlantController', key: `warning:${row.code || index}:${row.sourceId || ''}:${row.scenarioId || ''}` },
      recommendation: 'Review the plant-controller package warnings before releasing DER / IBR reports.',
      tradeoffs: 'Resolving warnings may require curtailment, revised controls, utility data, or detailed manufacturer model studies.',
      pageHref: 'ibr.html',
    })));
  return actions;
}

function emfExposureActions(report = {}, studies = {}) {
  const pkg = report.emfExposure || studies.emfExposure || null;
  const actions = [];
  if (!pkg && studies.emf) {
    actions.push(makeAction({
      title: 'Save EMF exposure study-case basis',
      description: 'Legacy EMF results exist without auditable circuit geometry, limit basis, validation, and shielding assumptions.',
      severity: 'medium',
      category: 'review',
      confidence: 0.82,
      scope: { studyKey: 'emf' },
      source: { type: 'emfExposure', key: 'legacy-without-study-case' },
      recommendation: 'Open EMF Analysis and save an EMF Exposure Study Case package before report release.',
      tradeoffs: 'Documenting the basis improves exposure traceability but does not replace certified field assessment.',
      pageHref: 'emf.html',
    }));
    return actions;
  }
  if (!pkg) return actions;
  asArray(pkg.fieldRows)
    .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
    .slice(0, 20)
    .forEach(row => {
      actions.push(makeAction({
        title: row.status === 'fail' ? `Resolve EMF exposure limit failure at ${row.label}` : `Review EMF exposure utilization at ${row.label}`,
        description: `${row.label || 'EMF point'} is ${row.utilizationPct ?? 'n/a'}% of ${row.limitLabel || 'the exposure limit'}.`,
        severity: row.status === 'fail' ? 'high' : 'medium',
        category: row.status === 'missingData' ? 'missingData' : 'safety',
        confidence: 0.86,
        scope: { pointId: row.pointId || row.id, utilizationPct: row.utilizationPct, limit: row.limit_uT },
        source: { type: 'emfExposure', key: `field:${row.id}:${row.status}` },
        recommendation: row.recommendation || 'Review current, phasing, distance/depth, shielding, and exposure basis.',
        tradeoffs: 'Mitigation may require layout changes, load management, shielding verification, or access-control assumptions.',
        pageHref: 'emf.html',
      }));
    });
  asArray(pkg.validationRows)
    .filter(row => row.status === 'warn' || row.status === 'fail' || row.status === 'missingData')
    .slice(0, 12)
    .forEach(row => {
      actions.push(makeAction({
        title: `Review EMF measured/calculated validation for ${row.label}`,
        description: row.status === 'missingData'
          ? 'Measured validation row is missing measured or calculated field data.'
          : `Measured/calculated mismatch is ${row.differencePct ?? 'n/a'}%.`,
        severity: 'medium',
        category: row.status === 'missingData' ? 'missingData' : 'review',
        confidence: 0.8,
        scope: { validationId: row.id, pointId: row.pointId, differencePct: row.differencePct },
        source: { type: 'emfExposure', key: `validation:${row.id}:${row.status}` },
        recommendation: row.recommendation || 'Review measurement point, loading, phasing, and shielding assumptions.',
        tradeoffs: 'Updating the model to match field data can improve traceability but may expose missing source-current or geometry data.',
        pageHref: 'emf.html',
      }));
    });
  asArray(pkg.warningRows)
    .filter(row => row.code === 'shielding-screening' || row.severity === 'missingData')
    .slice(0, 12)
    .forEach((row, index) => {
      actions.push(makeAction({
        title: row.code === 'shielding-screening' ? 'Verify EMF shielding screening assumption' : 'Complete EMF exposure input data',
        description: row.message || 'EMF exposure package warning requires review.',
        severity: row.severity === 'missingData' ? 'medium' : 'low',
        category: row.severity === 'missingData' ? 'missingData' : 'review',
        confidence: 0.76,
        scope: { sourceId: row.sourceId, code: row.code },
        source: { type: 'emfExposure', key: `warning:${row.code || index}:${row.sourceId || ''}` },
        recommendation: row.recommendation || 'Review EMF package warning rows before release.',
        tradeoffs: 'Resolving warnings may require project measurements, layout changes, or detailed modeling.',
        pageHref: 'emf.html',
      }));
    });
  return actions;
}

function cathodicProtectionNetworkActions(report = {}, studies = {}) {
  const pkg = report.cathodicProtectionNetwork || studies.cathodicProtectionNetwork || null;
  const actions = [];
  if (!pkg && studies.cathodicProtection) {
    actions.push(makeAction({
      title: 'Add cathodic-protection network model basis',
      description: 'Legacy CP sizing results exist without structure/anode/rectifier network rows, polarization evidence, and interference profile rows.',
      severity: 'medium',
      category: 'review',
      confidence: 0.82,
      scope: { studyKey: 'cathodicProtection' },
      source: { type: 'cathodicProtectionNetwork', key: 'legacy-without-network-basis' },
      recommendation: 'Open Cathodic Protection and save a CP Network Model package before report release.',
      tradeoffs: 'Network rows improve corrosion review traceability but do not replace field survey or qualified CP design review.',
      pageHref: 'cathodicprotection.html',
    }));
    return actions;
  }
  if (!pkg) return actions;
  asArray(pkg.criteriaRows)
    .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: row.status === 'fail' ? `${row.structureTag || row.rectifierId} CP criterion fails` : `${row.structureTag || row.rectifierId} CP criterion needs review`,
      description: `${row.checkType || 'CP criterion'} is ${row.status}; margin ${row.marginPct ?? 'n/a'}%.`,
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: row.status === 'missingData' ? 'missingData' : 'code',
      confidence: 0.84,
      scope: { rowId: row.id, checkType: row.checkType, zone: row.zone, status: row.status },
      source: { type: 'cathodicProtectionNetwork', key: `criteria:${row.id}:${row.status}` },
      recommendation: row.recommendation || 'Review current demand, source allocation, rectifier capacity, and CP criteria basis.',
      tradeoffs: 'Correcting CP criteria may require added anodes, rectifier changes, coating assumptions, or field verification.',
      pageHref: 'cathodicprotection.html',
    })));
  asArray(pkg.polarizationRows)
    .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: `${row.testStationRef || row.id} CP measurement evidence needs review`,
      description: `Instant-off ${row.instantOffMv ?? 'n/a'} mV and polarization shift ${row.polarizationShiftMv ?? 'n/a'} mV are ${row.status}.`,
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: row.status === 'missingData' ? 'missingData' : 'code',
      confidence: 0.83,
      scope: { rowId: row.id, structureId: row.structureId, status: row.status },
      source: { type: 'cathodicProtectionNetwork', key: `polarization:${row.id}:${row.status}` },
      recommendation: row.recommendation || 'Complete instant-off/polarization data and measurement correction basis.',
      tradeoffs: 'Measurement updates may require field testing, interruption coordination, or reference electrode corrections.',
      pageHref: 'cathodicprotection.html',
    })));
  asArray(pkg.interferenceRows)
    .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: `${row.label || row.id} CP interference risk is unresolved`,
      description: `${row.sourceType || 'Interference source'} risk is ${row.riskLevel || 'unknown'} with mitigation status ${row.mitigationStatus || row.status}.`,
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: 'review',
      confidence: 0.8,
      scope: { sourceId: row.id, sourceType: row.sourceType, riskLevel: row.riskLevel, status: row.status },
      source: { type: 'cathodicProtectionNetwork', key: `interference:${row.id}:${row.status}` },
      recommendation: 'Review bonds, drainage, isolation, mitigation actions, and verification testing for the interference source.',
      tradeoffs: 'Interference mitigation may require third-party coordination and can affect adjacent structures.',
      pageHref: 'cathodicprotection.html',
    })));
  asArray(pkg.potentialProfileRows)
    .filter(row => row.status === 'fail' || row.status === 'warn')
    .slice(0, 12)
    .forEach(row => actions.push(makeAction({
      title: `${row.structureTag || row.structureId} CP potential profile needs review`,
      description: `Estimated station ${row.stationM ?? 'n/a'} m instant-off potential is ${row.estimatedInstantOffMv ?? 'n/a'} mV.`,
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: 'code',
      confidence: 0.76,
      scope: { structureId: row.structureId, stationM: row.stationM, status: row.status },
      source: { type: 'cathodicProtectionNetwork', key: `profile:${row.id}:${row.status}` },
      recommendation: row.recommendation || 'Review potential profile, seasonal soil case, and current allocation.',
      tradeoffs: 'Profile mitigation may require closer anode spacing, more test stations, or field revalidation.',
      pageHref: 'cathodicprotection.html',
    })));
  asArray(pkg.warningRows)
    .filter(row => row.severity === 'missingData' || row.severity === 'fail')
    .slice(0, 12)
    .forEach((row, index) => actions.push(makeAction({
      title: row.severity === 'missingData' ? 'Complete CP network model data' : 'Resolve CP network warning',
      description: row.message || 'CP network package warning requires review.',
      severity: row.severity === 'fail' ? 'high' : 'medium',
      category: row.severity === 'missingData' ? 'missingData' : 'review',
      confidence: 0.76,
      scope: { code: row.code, sourceId: row.sourceId },
      source: { type: 'cathodicProtectionNetwork', key: `warning:${row.code || index}:${row.sourceId || ''}` },
      recommendation: row.recommendation || 'Review CP network warning rows before release.',
      tradeoffs: 'Resolving CP warnings may require field data, third-party coordination, or revised source/anode assumptions.',
      pageHref: 'cathodicprotection.html',
    })));
  return actions;
}

function protectionSettingSheetActions(report = {}, studies = {}) {
  const pkg = report.protectionSettingSheets || studies.protectionSettingSheets || null;
  const actions = [];
  if (!pkg && (studies.tcc || studies.tccSettings)) {
    actions.push(makeAction({
      title: 'Build protection setting-sheet package',
      description: 'TCC settings exist without a saved protection setting-sheet package.',
      severity: 'medium',
      category: 'review',
      confidence: 0.78,
      scope: { study: 'tcc' },
      source: { type: 'protectionSettingSheets', key: 'missing-package' },
      recommendation: 'Open Time-Current Curves, build the Protection Setting Sheet, and save it to studies before report release.',
      tradeoffs: 'Setting-sheet governance adds traceability but does not replace relay commissioning or manufacturer native setting files.',
      pageHref: 'tcc.html',
    }));
    return actions;
  }
  if (!pkg || !pkg.summary) return actions;
  asArray(pkg.deviceRows)
    .filter(row => row.status === 'missingData' || row.status === 'warn')
    .slice(0, 20)
    .forEach(row => {
      actions.push(makeAction({
        title: `${row.deviceTag} protection setting metadata is incomplete`,
        description: asArray(row.missingFields).join(' ') || 'Protection setting-sheet device metadata requires review.',
        severity: row.status === 'missingData' ? 'high' : 'medium',
        category: row.status === 'missingData' ? 'missingData' : 'review',
        confidence: 0.82,
        scope: { componentId: row.componentId, deviceTag: row.deviceTag, catalogDeviceId: row.catalogDeviceId },
        source: { type: 'protectionSettingSheets', key: `device:${row.componentId}:${row.status}` },
        recommendation: row.recommendation || 'Complete catalog link, CT/PT data, revision, and reviewer fields before release.',
        tradeoffs: 'Collecting relay metadata improves traceability but may require field device data or relay setting files.',
        pageHref: 'tcc.html',
      }));
    });
  asArray(pkg.functionRows)
    .filter(row => row.status === 'missingData' || row.status === 'disabled')
    .slice(0, 20)
    .forEach(row => {
      actions.push(makeAction({
        title: `${row.deviceTag} function ${row.functionCode} needs setting review`,
        description: row.status === 'disabled'
          ? 'Expected protection function is disabled or not mapped in the active setting sheet.'
          : `Protection function is missing ${asArray(row.missingFields).join(', ') || 'required setting data'}.`,
        severity: row.status === 'missingData' ? 'high' : 'medium',
        category: row.status === 'missingData' ? 'missingData' : 'review',
        confidence: 0.8,
        scope: { componentId: row.componentId, functionCode: row.functionCode, deviceTag: row.deviceTag },
        source: { type: 'protectionSettingSheets', key: `function:${row.componentId}:${row.functionCode}:${row.status}` },
        recommendation: row.recommendation || 'Review enabled relay functions and setting values before issuing the setting sheet.',
        tradeoffs: 'Enabling or changing functions affects coordination, arc-flash clearing time, and field relay testing.',
        pageHref: 'tcc.html',
      }));
    });
  asArray(pkg.testRows)
    .filter(row => row.status === 'missingData' || row.status === 'fail')
    .slice(0, 20)
    .forEach(row => {
      actions.push(makeAction({
        title: `${row.deviceTag} ${row.functionCode} relay test value is incomplete`,
        description: `Secondary-injection row is missing ${asArray(row.missingFields).join(', ') || 'test data'}.`,
        severity: row.status === 'fail' ? 'high' : 'medium',
        category: 'review',
        confidence: 0.78,
        scope: { componentId: row.componentId, functionCode: row.functionCode, deviceTag: row.deviceTag },
        source: { type: 'protectionSettingSheets', key: `test:${row.componentId}:${row.functionCode}:${row.status}` },
        recommendation: row.recommendation || 'Complete CT data and expected trip-time basis before relay testing.',
        tradeoffs: 'Test values are screening expectations and must be checked against the actual relay test procedure.',
        pageHref: 'tcc.html',
      }));
    });
  if (!pkg.coordinationBasis) {
    actions.push(makeAction({
      title: 'Link protection settings to coordination basis',
      description: 'Protection setting-sheet package was saved without the latest TCC auto-coordination state.',
      severity: 'medium',
      category: 'review',
      confidence: 0.76,
      scope: { deviceCount: pkg.summary.deviceCount },
      source: { type: 'protectionSettingSheets', key: 'coordination-unlinked' },
      recommendation: 'Run TCC auto-coordination or document the coordination basis, then rebuild the setting-sheet package.',
      tradeoffs: 'Linking settings to a coordination basis improves report traceability but may require rerunning the TCC case.',
      pageHref: 'tcc.html',
    }));
  }
  return actions;
}

function pullConstructabilityActions(report = {}, studies = {}) {
  const pkg = report.pullConstructability || studies.pullConstructability || {};
  if (!pkg.summary) return [];
  const rowActions = asArray(pkg.pullRows)
    .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
    .slice(0, 30)
    .map(row => makeAction({
      title: row.status === 'fail'
        ? `Pull ${row.pullNumber} exceeds pulling constructability limits`
        : row.status === 'missingData'
          ? `Pull ${row.pullNumber} needs constructability input data`
          : `Pull ${row.pullNumber} has constructability warnings`,
      description: `Pull ${row.pullNumber}: max tension ${row.maxTensionLbs ?? 'n/a'} lbs, max sidewall ${row.maxSidewallPressureLbsPerFt ?? 'n/a'} lbs/ft, recommended direction ${row.recommendedDirection || 'n/a'}.`,
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: row.status === 'missingData' ? 'missingData' : 'constructability',
      confidence: 0.84,
      scope: {
        pullNumber: row.pullNumber,
        cableTags: row.cableTags,
        maxTensionLbs: row.maxTensionLbs,
        maxSidewallPressureLbsPerFt: row.maxSidewallPressureLbsPerFt,
      },
      source: { type: 'pullConstructability', key: `${row.pullNumber}:${row.status}` },
      recommendation: row.status === 'missingData'
        ? 'Add conduit ID, bend radius, pulling-equipment limit, and sidewall-pressure assumptions before release.'
        : 'Review pull section friction, bend radius, reel direction, lubricant, and field equipment limits before construction release.',
      tradeoffs: 'Changing pull direction or intermediate pull points may affect installation sequence, reel staging, and field labor.',
      pageHref: 'pullcards.html',
    }));
  const warningActions = asArray(pkg.warningRows)
    .filter(row => /reverse|sidewall|jam|conduit|equipment|missing|exceeds/i.test(row.message || ''))
    .slice(0, 20)
    .map(row => makeAction({
      title: `Review pull ${row.pullNumber} constructability warning`,
      description: row.message || 'Pull constructability warning requires review.',
      severity: /exceeds|sidewall|jam/i.test(row.message || '') ? 'high' : 'medium',
      category: /missing|No /.test(row.message || '') ? 'missingData' : 'constructability',
      confidence: 0.78,
      scope: { pullNumber: row.pullNumber },
      source: { type: 'pullConstructability', key: `warning:${row.pullNumber}:${row.id || row.message}` },
      recommendation: row.recommendation || 'Open Pull Cards and resolve or document the constructability warning.',
      tradeoffs: 'Pull constructability screening should be verified against field routing and equipment setup.',
      pageHref: 'pullcards.html',
    }));
  return [...rowActions, ...warningActions];
}

function racewayConstructionActions(report = {}) {
  const pkg = report.racewayConstruction || {};
  const rowActions = asArray(pkg.detailRows)
    .filter(row => row.status === 'fail' || row.status === 'warn')
    .slice(0, 30)
    .map(row => makeAction({
      title: `${row.racewayId} construction details need completion`,
      description: asArray(row.warnings).join(' ') || 'Raceway construction metadata has missing or conflicting fields.',
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: /support|label|drawing|section/i.test(asArray(row.warnings).join(' ')) ? 'missingData' : 'constructability',
      confidence: 0.84,
      scope: { racewayId: row.racewayId, racewayType: row.racewayType, status: row.status },
      source: { type: 'racewayConstruction', key: `detail:${row.racewayType}:${row.racewayId}:${row.status}` },
      recommendation: 'Open the raceway schedule and complete support, label, drawing/detail, section, and construction-status metadata before issuing construction deliverables.',
      tradeoffs: 'Construction metadata improves BOM, BIM handoff, and field pull-card readiness but must be verified against project drawings and vendor support details.',
      pageHref: 'racewayschedule.html',
    }));
  const warningActions = asArray(pkg.warningRows)
    .filter(row => row.severity === 'error' || row.code === 'dividerLaneMismatch' || row.code === 'invalidAccessoryKits')
    .slice(0, 20)
    .map(row => makeAction({
      title: `${row.racewayId} raceway construction warning`,
      description: row.message || 'Raceway construction warning requires review.',
      severity: row.severity === 'error' ? 'high' : 'medium',
      category: row.code === 'dividerLaneMismatch' ? 'constructability' : 'missingData',
      confidence: 0.86,
      scope: { racewayId: row.racewayId, code: row.code },
      source: { type: 'racewayConstruction', key: `warning:${row.code}:${row.racewayId}` },
      recommendation: 'Correct the construction-detail field or document the drawing basis before issuing the report package.',
      tradeoffs: 'Leaving these warnings unresolved can create mismatches between raceway schedules, material takeoff, BIM tags, and field work packages.',
      pageHref: 'racewayschedule.html',
    }));
  return [...rowActions, ...warningActions];
}

function loadDemandGovernanceActions(report = {}, studies = {}) {
  const pkg = report.loadDemandGovernance || studies.loadDemandGovernance || null;
  const actions = [];
  if (!pkg && report.summary) {
    return actions;
  }
  if (!pkg) return actions;
  asArray(pkg.loadRows)
    .filter(row => row.status === 'warn' || row.status === 'missingData')
    .slice(0, 30)
    .forEach(row => {
      const missingClass = asArray(row.warnings).some(warning => warning.code === 'missingLoadClass');
      actions.push(makeAction({
        title: missingClass ? `${row.tag || row.id} needs load classification` : `${row.tag || row.id} needs demand-basis review`,
        description: asArray(row.warnings).map(warning => warning.message || warning.code).join(' ') || 'Load demand governance row requires review.',
        severity: 'medium',
        category: missingClass ? 'missingData' : 'review',
        confidence: 0.82,
        scope: { loadId: row.id, tag: row.tag, loadClass: row.loadClass },
        source: { type: 'loadDemandGovernance', key: `load:${row.id || row.tag}` },
        recommendation: 'Open the Load List and complete load class, demand basis, noncoincident, measured-demand, or managed-load metadata.',
        tradeoffs: 'Demand metadata can change panel, feeder, transformer, and report totals.',
        pageHref: 'loadlist.html',
      }));
    });
  asArray(pkg.panelRows)
    .filter(row => row.status === 'fail' || row.status === 'warn')
    .slice(0, 20)
    .forEach(row => {
      const phaseStatus = row.phaseBalance?.status || 'pass';
      actions.push(makeAction({
        title: row.status === 'fail' ? `${row.panelTag} governed demand needs action` : `${row.panelTag} phase/demand basis needs review`,
        description: `Governed demand is ${row.governedDemandKva || 0} kVA / ${row.governedCurrentA || 0} A. Phase balance status is ${phaseStatus}.`,
        severity: row.status === 'fail' ? 'high' : 'medium',
        category: row.status === 'fail' ? 'code' : 'review',
        confidence: 0.82,
        scope: { panelId: row.panelId, panelTag: row.panelTag, phaseStatus },
        source: { type: 'loadDemandGovernance', key: `panel:${row.panelId}:${row.status}` },
        recommendation: row.status === 'fail'
          ? 'Review governed demand against panel main rating and rebalance or resize before release.'
          : 'Review phase balance, measured demand source, and panel demand-basis metadata.',
        tradeoffs: 'Rebalancing may affect circuit assignment, panel schedule exports, and feeder sizing.',
        pageHref: 'panelschedule.html',
      }));
    });
  asArray(pkg.warnings)
    .filter(warning => /measured|largest|phase|main|basis/i.test(`${warning.code || ''} ${warning.message || warning}`))
    .slice(0, 12)
    .forEach((warning, index) => {
      actions.push(makeAction({
        title: 'Review load demand-governance warning',
        description: warning.message || String(warning),
        severity: warning.severity === 'error' ? 'high' : 'medium',
        category: /missing|measured|basis/i.test(`${warning.code || ''} ${warning.message || warning}`) ? 'missingData' : 'review',
        confidence: 0.78,
        scope: { warningIndex: index },
        source: { type: 'loadDemandGovernance', key: `warning:${warning.code || index}` },
        recommendation: 'Resolve or document demand-governance warnings before issuing panel, feeder, or equipment reports.',
        tradeoffs: 'Leaving demand warnings unresolved weakens downstream sizing and owner-review traceability.',
        pageHref: 'loadlist.html',
      }));
    });
  return actions;
}

function transformerFeederSizingActions(report = {}, studies = {}) {
  const pkg = report.transformerFeederSizing || studies.transformerFeederSizing || null;
  const actions = [];
  if (!pkg) {
    const hasDemand = Boolean(report.loadDemandGovernance || studies.loadDemandGovernance);
    if (hasDemand) {
      actions.push(makeAction({
        title: 'Create transformer and feeder sizing basis package',
        description: 'Governed demand data exists, but no auditable transformer/feeder sizing package is saved for downstream reports.',
        severity: 'medium',
        category: 'review',
        confidence: 0.78,
        scope: { studyKey: 'transformerFeederSizing' },
        source: { type: 'transformerFeederSizing', key: 'missing-package' },
        recommendation: 'Open Auto-Size Equipment, import governed demand, build the sizing package, and save it to studies.',
        tradeoffs: 'Leaving this unsaved weakens transformer, feeder, protection, and procurement traceability.',
        pageHref: 'autosize.html',
      }));
    }
    return actions;
  }
  asArray(pkg.transformerRows)
    .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: row.status === 'fail' ? `${row.caseName || row.id} transformer sizing fails` : `${row.caseName || row.id} transformer sizing needs review`,
      description: `Design load is ${row.designKva || 0} kVA against selected ${row.selectedKva || 0} kVA transformer (${row.loadPct || 0}% loaded).`,
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: row.status === 'fail' ? 'code' : 'review',
      confidence: 0.82,
      scope: { caseName: row.caseName, selectedKva: row.selectedKva, loadPct: row.loadPct },
      source: { type: 'transformerFeederSizing', key: `transformer:${row.id || row.caseName}:${row.status}` },
      recommendation: row.recommendation || 'Review transformer standard size, demand basis, future growth, and emergency allowance.',
      tradeoffs: 'Upsizing can affect footprint, cost, impedance, available fault current, and protection coordination.',
      pageHref: 'autosize.html',
    })));
  asArray(pkg.feederRows)
    .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: row.status === 'fail' ? `${row.caseName || row.id} feeder sizing fails` : `${row.caseName || row.id} feeder sizing needs review`,
      description: `Feeder requires ${row.requiredAmpacityA || 0} A and selected ${row.conductorSize || 'no conductor'} at ${row.installedAmpacityA || 0} A installed ampacity.`,
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: row.status === 'fail' ? 'code' : 'review',
      confidence: 0.82,
      scope: { caseName: row.caseName, conductorSize: row.conductorSize, ocpdRatingA: row.ocpdRatingA },
      source: { type: 'transformerFeederSizing', key: `feeder:${row.id || row.caseName}:${row.status}` },
      recommendation: row.recommendation || 'Review feeder conductor, OCPD, derating, and parallel-set assumptions.',
      tradeoffs: 'Changing feeder sizing can affect raceway fill, pull cards, voltage drop, cost, and coordination.',
      pageHref: 'autosize.html',
    })));
  asArray(pkg.warningRows)
    .filter(warning => /missing|emergency|overload|basis|impedance|bil|rise|feeder/i.test(`${warning.code || ''} ${warning.message || warning}`))
    .slice(0, 20)
    .forEach((warning, index) => {
      const missing = /missing/i.test(`${warning.code || ''} ${warning.message || warning}`);
      actions.push(makeAction({
        title: missing ? 'Complete transformer/feeder sizing basis data' : 'Review transformer/feeder sizing assumption',
        description: warning.message || String(warning),
        severity: warning.severity === 'error' ? 'high' : 'medium',
        category: missing ? 'missingData' : 'review',
        confidence: 0.8,
        scope: { warningIndex: index, code: warning.code },
        source: { type: 'transformerFeederSizing', key: `warning:${warning.code || index}` },
        recommendation: 'Record transformer impedance, BIL, temperature rise, feeder/protection basis, or emergency-overload justification before release.',
        tradeoffs: 'Completing sizing-basis data improves downstream short-circuit, equipment evaluation, procurement, and report traceability.',
        pageHref: 'autosize.html',
      }));
    });
  if (!asArray(pkg.alternativeRows).length) {
    actions.push(makeAction({
      title: 'Add transformer/feeder sizing alternatives audit',
      description: 'The sizing package has no accepted/rejected alternative rows.',
      severity: 'medium',
      category: 'review',
      confidence: 0.76,
      scope: { studyKey: 'transformerFeederSizing' },
      source: { type: 'transformerFeederSizing', key: 'missing-alternatives' },
      recommendation: 'Rebuild the sizing package so selected and rejected standard-size/conductor alternatives are recorded.',
      tradeoffs: 'Alternatives provide owner and reviewer traceability for why a size was selected.',
      pageHref: 'autosize.html',
    }));
  }
  return actions;
}

function voltageDropStudyActions(report = {}, studies = {}) {
  const pkg = report.voltageDropStudy || studies.voltageDropStudy || null;
  const actions = [];
  if (!pkg && report.cables?.summary?.total) {
    actions.push(makeAction({
      title: 'Save voltage-drop study-case basis',
      description: 'The cable schedule has cables, but no voltage-drop criteria and operating-case package is saved for reports.',
      severity: 'medium',
      category: 'review',
      confidence: 0.76,
      scope: { studyKey: 'voltageDropStudy' },
      source: { type: 'voltageDropStudy', key: 'missing-package' },
      recommendation: 'Open Voltage Drop, define normal/emergency/start criteria, run the study, and save it to studies.',
      tradeoffs: 'Leaving the basis unsaved makes normal, emergency, and starting-drop decisions harder to audit.',
      pageHref: 'voltagedropstudy.html',
    }));
    return actions;
  }
  if (!pkg) return actions;
  if (!pkg.criteria || !pkg.operatingCase) {
    actions.push(makeAction({
      title: 'Complete voltage-drop criteria basis',
      description: 'Voltage-drop results exist without a complete criteria or operating-case basis.',
      severity: 'medium',
      category: 'missingData',
      confidence: 0.82,
      scope: { studyKey: 'voltageDropStudy' },
      source: { type: 'voltageDropStudy', key: 'missing-basis' },
      recommendation: 'Re-run the voltage-drop study with explicit limits, source voltage, tap, load PF, and conductor-temperature assumptions.',
      tradeoffs: 'Explicit basis data improves report traceability without changing cable schedule data.',
      pageHref: 'voltagedropstudy.html',
    }));
  }
  asArray(pkg.rows)
    .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
    .slice(0, 30)
    .forEach(row => {
      const missing = row.status === 'missingData';
      const starting = row.caseType === 'start' || /starting|motor/i.test(row.reason || '');
      actions.push(makeAction({
        title: missing ? `${row.tag || row.id} voltage-drop inputs are incomplete`
          : row.status === 'fail' ? `${row.tag || row.id} voltage-drop criterion fails`
            : `${row.tag || row.id} voltage drop is near the limit`,
        description: row.reason || `Voltage-drop row status is ${row.status}.`,
        severity: row.status === 'fail' ? 'high' : 'medium',
        category: missing ? 'missingData' : row.status === 'fail' ? 'code' : 'review',
        confidence: 0.83,
        scope: {
          cableTag: row.tag,
          caseType: row.caseType,
          dropPct: row.dropPct,
          applicableLimitPct: row.applicableLimitPct,
          totalChainDropPct: row.totalChainDropPct,
          startVoltagePu: row.startVoltagePu,
        },
        source: { type: 'voltageDropStudy', key: `row:${row.id || row.tag}:${row.caseType || ''}:${row.status}` },
        recommendation: row.recommendation || (starting
          ? 'Review conductor size, motor-start assumptions, upstream voltage, and starting minimum-voltage criterion.'
          : 'Review conductor size, route length, source voltage/tap, load PF, or upstream segment-chain assumptions.'),
        tradeoffs: 'Changing voltage-drop assumptions can affect conductor sizing, pull constructability, raceway fill, cost, and motor-start acceptance.',
        pageHref: 'voltagedropstudy.html',
      }));
    });
  asArray(pkg.warningRows)
    .slice(0, 20)
    .forEach((warning, index) => actions.push(makeAction({
      title: /criteria|basis/i.test(`${warning.code || ''} ${warning.message || ''}`)
        ? 'Review voltage-drop criteria basis'
        : 'Review voltage-drop warning',
      description: warning.message || String(warning),
      severity: warning.severity === 'error' ? 'high' : 'medium',
      category: /missing/i.test(`${warning.code || ''} ${warning.message || ''}`) ? 'missingData' : 'review',
      confidence: 0.78,
      scope: { warningIndex: index, code: warning.code, sourceId: warning.sourceId },
      source: { type: 'voltageDropStudy', key: `warning:${warning.code || index}:${warning.sourceId || ''}` },
      recommendation: 'Resolve voltage-drop warnings before using the package for construction or procurement decisions.',
      tradeoffs: 'Some screening warnings may be acceptable when backed by project-specific criteria.',
      pageHref: 'voltagedropstudy.html',
    })));
  return actions;
}

function voltageFlickerActions(report = {}, studies = {}) {
  const pkg = report.voltageFlicker || studies.voltageFlicker || null;
  const actions = [];
  if (!pkg) return actions;
  const packaged = pkg.version === 'voltage-flicker-study-v1';
  if (!packaged) {
    actions.push(makeAction({
      title: 'Save voltage flicker study-case basis',
      description: 'Voltage flicker results exist without the packaged PCC, standard, limit, and compliance-row basis.',
      severity: 'medium',
      category: 'review',
      confidence: 0.78,
      scope: { studyKey: 'voltageFlicker' },
      source: { type: 'voltageFlicker', key: 'legacy-result' },
      recommendation: 'Open Voltage Flicker, confirm the PCC/source/limit basis, rerun, and save the packaged study.',
      tradeoffs: 'Packaging does not change the simplified flicker calculation, but it makes the compliance basis reportable.',
      pageHref: 'voltageflicker.html',
    }));
  }
  if (packaged && (!pkg.studyCase?.pccTag || !pkg.studyCase?.sourceShortCircuitKva)) {
    actions.push(makeAction({
      title: 'Complete voltage flicker PCC/source basis',
      description: 'The voltage flicker package is missing PCC identification or source short-circuit strength.',
      severity: 'medium',
      category: 'missingData',
      confidence: 0.82,
      scope: { pccTag: pkg.studyCase?.pccTag, sourceShortCircuitKva: pkg.studyCase?.sourceShortCircuitKva },
      source: { type: 'voltageFlicker', key: 'missing-basis' },
      recommendation: 'Record the PCC bus/tag and utility or short-circuit-study source kVA/MVA before issuing flicker results.',
      tradeoffs: 'The PCC basis determines whether Pst/Plt values are meaningful for utility compliance.',
      pageHref: 'voltageflicker.html',
    }));
  }
  asArray(pkg.complianceRows)
    .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: row.status === 'fail' ? `${row.target} flicker limit fails`
        : row.status === 'warn' ? `${row.target} exceeds planning level`
          : `${row.target} flicker inputs are incomplete`,
      description: `${row.target}: actual ${row.actualValue ?? 'n/a'}, limit ${row.limit ?? 'n/a'}, utilization ${row.utilizationPct ?? 'n/a'}%.`,
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: row.status === 'missingData' ? 'missingData' : row.status === 'fail' ? 'code' : 'review',
      confidence: 0.82,
      scope: { target: row.target, status: row.status, utilizationPct: row.utilizationPct },
      source: { type: 'voltageFlicker', key: `compliance:${row.id}:${row.status}` },
      recommendation: row.recommendation || 'Review disturbance magnitude, repetition rate, source strength, utility limits, or mitigation.',
      tradeoffs: 'Flicker mitigation can require source-strength review, load scheduling, SVC/filter equipment, or operating restrictions.',
      pageHref: 'voltageflicker.html',
    })));
  asArray(pkg.warningRows)
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: row.id === 'estimated-plt' ? 'Replace estimated Plt with measured Pst series' : 'Review voltage flicker study warning',
      description: row.message || String(row),
      severity: row.severity === 'missingData' || row.severity === 'warning' ? 'medium' : 'low',
      category: row.severity === 'missingData' ? 'missingData' : 'review',
      confidence: 0.76,
      scope: { warningId: row.id, severity: row.severity },
      source: { type: 'voltageFlicker', key: `warning:${row.id || row.message}` },
      recommendation: row.recommendation || 'Resolve or document the voltage flicker warning before issuing reports.',
      tradeoffs: 'Some screening assumptions are acceptable for planning, but final PCC compliance may require measured flickermeter data.',
      pageHref: 'voltageflicker.html',
    })));
  return actions;
}

function advancedGroundingActions(report = {}) {
  const pkg = report.advancedGrounding || {};
  const pointActions = asArray(pkg.riskPoints)
    .filter(point => point.status === 'fail' || point.status === 'warn' || point.status === 'missingData')
    .slice(0, 20)
    .map(point => makeAction({
      title: point.status === 'fail'
        ? `${point.label} grounding ${point.check} point exceeds limit`
        : point.status === 'missingData'
          ? `${point.label} grounding point needs calculation data`
          : `${point.label} grounding ${point.check} point has low margin`,
      description: point.status === 'missingData'
        ? 'Advanced grounding package includes a hazard point without complete IEEE 80 result data.'
        : `${point.check} point margin is ${point.marginPct ?? 'unknown'}% against the screening limit.`,
      severity: point.status === 'fail' ? 'high' : 'medium',
      category: point.status === 'missingData' ? 'missingData' : point.check === 'gpr' ? 'review' : 'safety',
      confidence: 0.78,
      scope: {
        label: point.label,
        check: point.check,
        status: point.status,
        marginPct: point.marginPct,
      },
      source: { type: 'advancedGrounding', key: `${point.label}:${point.check}:${point.status}` },
      recommendation: point.recommendation || 'Review grounding hazard map and update the grounding design basis.',
      tradeoffs: 'Grounding changes can affect site footprint, excavation, surface material, fault-current assumptions, and transferred-voltage coordination.',
      pageHref: 'groundgrid.html',
    }));
  const packageActions = [];
  if (pkg.summary?.soilFitStatus === 'poorFit') {
    packageActions.push(makeAction({
      title: 'Improve grounding soil model fit',
      description: 'Advanced grounding soil fit error exceeds the screening threshold.',
      severity: 'medium',
      category: 'missingData',
      confidence: 0.82,
      scope: { soilFitErrorPct: pkg.summary?.soilFitErrorPct },
      source: { type: 'advancedGrounding', key: 'soil-fit:poorFit' },
      recommendation: 'Collect additional Wenner/Schlumberger measurements or use specialist grounding software before release.',
      tradeoffs: 'Additional field measurements and modeling time may be required before final grounding design issue.',
      pageHref: 'groundgrid.html',
    }));
  }
  asArray(pkg.warnings)
    .filter(warning => /transferred|remote/i.test(warning))
    .slice(0, 3)
    .forEach((warning, index) => {
      packageActions.push(makeAction({
        title: 'Review transferred-voltage exposure',
        description: warning,
        severity: 'high',
        category: 'review',
        confidence: 0.8,
        scope: { warning },
        source: { type: 'advancedGrounding', key: `transferred-voltage:${index}` },
        recommendation: 'Check fences, remote electrodes, communications, metallic shields, and external grounding bonds.',
        tradeoffs: 'Mitigations may require isolation, bonding changes, or coordination with telecom/utility stakeholders.',
        pageHref: 'groundgrid.html',
      }));
    });
  const field = pkg.fieldFidelity || {};
  const fieldActions = [];
  if (field.measurementCoverage && field.measurementCoverage.status !== 'pass') {
    fieldActions.push(makeAction({
      title: field.measurementCoverage.status === 'missingData'
        ? 'Add grounding soil field measurements'
        : 'Improve grounding soil measurement coverage',
      description: asArray(field.measurementCoverage.warnings).join(' ') || 'Grounding soil measurement coverage requires review.',
      severity: 'medium',
      category: 'missingData',
      confidence: 0.82,
      scope: { coverage: field.measurementCoverage.spacingCoveragePct, measurementCount: field.measurementCoverage.measurementCount },
      source: { type: 'groundingFieldFidelity', key: `soil-coverage:${field.measurementCoverage.status}` },
      recommendation: field.measurementCoverage.recommendation || 'Collect additional soil resistivity measurements before final grounding release.',
      tradeoffs: 'Additional field testing improves confidence but may affect schedule before final design issue.',
      pageHref: 'groundgrid.html',
    }));
  }
  asArray(field.fallOfPotentialRows)
    .filter(row => row.status === 'fail' || row.status === 'warn')
    .slice(0, 10)
    .forEach(row => {
      fieldActions.push(makeAction({
        title: `${row.testId} fall-of-potential test needs review`,
        description: asArray(row.warnings).join(' ') || `Curve deviation is ${row.curveDeviationPct ?? 'unknown'}%.`,
        severity: row.status === 'fail' ? 'high' : 'medium',
        category: 'review',
        confidence: 0.8,
        scope: { testId: row.testId, curveDeviationPct: row.curveDeviationPct, measuredResistanceOhm: row.measuredResistanceOhm },
        source: { type: 'groundingFieldFidelity', key: `fall-of-potential:${row.testId}:${row.status}` },
        recommendation: row.recommendation || 'Review field resistance test quality before accepting the grounding model basis.',
        tradeoffs: 'Repeating field tests may be needed when probe spacing or curve stability is questionable.',
        pageHref: 'groundgrid.html',
      }));
    });
  asArray(field.seasonalScenarios)
    .filter(row => row.status === 'fail' || row.status === 'warn')
    .slice(0, 10)
    .forEach(row => {
      fieldActions.push(makeAction({
        title: `${row.label} grounding seasonal scenario is ${row.status}`,
        description: `${row.failCount || 0} failed and ${row.warnCount || 0} warning risk point(s) under this seasonal soil case.`,
        severity: row.status === 'fail' ? 'high' : 'medium',
        category: 'safety',
        confidence: 0.76,
        scope: { scenarioId: row.id, rhoOhmM: row.rhoOhmM, multiplier: row.multiplier },
        source: { type: 'groundingFieldFidelity', key: `seasonal:${row.id}:${row.status}` },
        recommendation: row.recommendation || 'Review seasonal soil assumptions and add grounding design margin.',
        tradeoffs: 'Design changes may include more grid conductor, rods, surface layer changes, or revised clearing assumptions.',
        pageHref: 'groundgrid.html',
      }));
    });
  asArray(field.warningRows)
    .filter(row => /transferred|finite-element|fidelity|not modeled|field/i.test(row.message || row.category || ''))
    .slice(0, 10)
    .forEach(row => {
      fieldActions.push(makeAction({
        title: row.category === 'modelFidelity'
          ? 'Document grounding model fidelity limits'
          : 'Review grounding transferred-potential field item',
        description: row.message || 'Grounding field-fidelity warning requires review.',
        severity: row.category === 'transferredPotential' ? 'high' : 'low',
        category: 'review',
        confidence: 0.74,
        scope: { category: row.category, severity: row.severity },
        source: { type: 'groundingFieldFidelity', key: `warning:${row.id || row.message}` },
        recommendation: row.recommendation || 'Document screening assumptions and determine whether specialist grounding modeling is required.',
        tradeoffs: 'Higher-fidelity grounding review can affect design issue schedule but reduces transferred-voltage and site-safety uncertainty.',
        pageHref: 'groundgrid.html',
      }));
    });
  return [...pointActions, ...packageActions, ...fieldActions];
}

function cableThermalEnvironmentActions(report = {}) {
  const pkg = report.cableThermalEnvironment || {};
  const rowActions = asArray(pkg.evaluations)
    .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
    .slice(0, 30)
    .map(row => makeAction({
      title: row.status === 'fail'
        ? `${row.cableTag} thermal screening exceeds limit`
        : row.status === 'missingData'
          ? `${row.cableTag} thermal screening needs input data`
          : `${row.cableTag} thermal screening has low margin`,
      description: row.status === 'missingData'
        ? `Cable thermal environment row is missing data for ${row.installationMethod}.`
        : `${row.installationMethod}: load ${row.loadPct ?? 'n/a'}% of allowable ampacity, estimated conductor temperature ${row.estimatedConductorTempC ?? 'n/a'} C.`,
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: row.status === 'missingData' ? 'missingData' : 'safety',
      confidence: row.status === 'missingData' ? 0.74 : 0.84,
      scope: {
        cableTag: row.cableTag,
        installationMethod: row.installationMethod,
        loadPct: row.loadPct,
        limitingFactor: row.limitingFactor,
      },
      source: { type: 'cableThermalEnvironment', key: `${row.cableTag}:${row.installationMethod}:${row.status}` },
      recommendation: row.recommendation || 'Review cable thermal environment assumptions before release.',
      tradeoffs: 'Thermal mitigations may require larger conductors, lower grouping, thermal backfill, alternate raceway routing, or load management.',
      pageHref: 'cablethermal.html',
    }));
  const advancedActions = asArray(pkg.advancedWarnings)
    .slice(0, 10)
    .map((warning, index) => makeAction({
      title: /dry-out/i.test(warning)
        ? 'Review cable thermal soil dry-out risk'
        : /Adjacent/i.test(warning)
          ? 'Review adjacent thermal influence'
          : /Emergency/i.test(warning)
            ? 'Review emergency cable thermal profile'
            : 'Review advanced cable thermal assumption',
      description: String(warning),
      severity: /exceeds|dry-out|Adjacent/i.test(warning) ? 'medium' : 'low',
      category: /dry-out|Adjacent|Emergency|exceeds/i.test(warning) ? 'safety' : 'review',
      confidence: 0.78,
      scope: { warning },
      source: { type: 'cableThermalEnvironment', key: `advanced-warning:${index}` },
      recommendation: 'Verify advanced thermal assumptions with project-specific calculations before release.',
      tradeoffs: 'Advanced cable thermal mitigations may affect trench/raceway layout, thermal backfill requirements, or operating load limits.',
      pageHref: 'cablethermal.html',
    }));
  const emergencyActions = asArray(pkg.cyclicRatingRows)
    .filter(row => row.status === 'fail' || row.status === 'warn')
    .slice(0, 20)
    .map(row => makeAction({
      title: `${row.cableTag} emergency thermal profile ${row.status === 'fail' ? 'exceeds' : 'approaches'} limit`,
      description: `${row.installationMethod}: maximum emergency temperature ${row.maxEmergencyTempC ?? 'n/a'} C using ${row.cyclicRatingMode || 'screening'} mode.`,
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: 'safety',
      confidence: 0.8,
      scope: { cableTag: row.cableTag, installationMethod: row.installationMethod, maxEmergencyTempC: row.maxEmergencyTempC },
      source: { type: 'cableThermalEnvironment', key: `${row.cableTag}:${row.installationMethod}:emergency:${row.status}` },
      recommendation: row.recommendation || 'Reduce emergency load duration/current or verify transient rating with a detailed calculation.',
      tradeoffs: 'Emergency ratings may require operating procedures, relay/load-shed coordination, or larger conductors.',
      pageHref: 'cablethermal.html',
    }));
  return [...rowActions, ...advancedActions, ...emergencyActions];
}

function loadFlowStudyActions(report = {}, studies = {}) {
  const pkg = report.loadFlow || studies.loadFlow || null;
  if (!pkg) return [];
  const actions = [];
  if (!pkg.studyCase) {
    actions.push(makeAction({
      title: 'Define load-flow study case basis',
      description: 'Load-flow results exist without a packaged study case for mode, voltage limits, phase data, controls, and assumptions.',
      severity: 'medium',
      category: 'review',
      confidence: 0.84,
      scope: { study: 'loadFlow' },
      source: { type: 'loadFlow', key: 'missing-study-case' },
      recommendation: 'Open Load Flow and rerun the study with the Load Flow Study Case panel completed.',
      tradeoffs: 'Rerunning can change voltage profile, OPF feasibility context, and report assumptions.',
      pageHref: 'loadFlow.html',
    }));
  }
  if (pkg.summary?.converged === false || pkg.results?.converged === false) {
    actions.push(makeAction({
      title: 'Resolve non-converged load-flow case',
      description: 'The saved load-flow study case did not converge.',
      severity: 'high',
      category: 'review',
      confidence: 0.88,
      scope: { maxMismatchKW: pkg.results?.maxMismatchKW },
      source: { type: 'loadFlow', key: 'not-converged' },
      recommendation: 'Review source/slack bus, impedances, voltage setpoints, load magnitudes, and control assumptions, then rerun.',
      tradeoffs: 'Convergence fixes may require correcting topology or simplifying controls before downstream studies are trusted.',
      pageHref: 'loadFlow.html',
    }));
  }
  asArray(pkg.voltageViolationRows)
    .slice(0, 30)
    .forEach(row => {
      actions.push(makeAction({
        title: `${row.busTag || row.busId} load-flow voltage ${row.status === 'fail' ? 'violates' : 'approaches'} limit`,
        description: `${row.phase || 'balanced'} voltage is ${row.Vm} pu against ${row.minPu}-${row.maxPu} pu limits.`,
        severity: row.status === 'fail' ? 'high' : 'medium',
        category: row.status === 'fail' ? 'code' : 'review',
        confidence: 0.86,
        scope: { busId: row.busId, phase: row.phase, Vm: row.Vm, status: row.status },
        source: { type: 'loadFlow', key: `${row.busId}:${row.phase}:voltage:${row.status}` },
        recommendation: row.recommendation || 'Review load-flow voltage settings, taps, reactive support, or loading.',
        tradeoffs: 'Voltage corrections may affect losses, equipment ratings, OPF dispatch, and protection assumptions.',
        pageHref: 'loadFlow.html',
      }));
    });
  asArray(pkg.unbalanceRows)
    .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
    .slice(0, 30)
    .forEach(row => {
      actions.push(makeAction({
        title: `${row.busTag || row.busId} voltage unbalance requires review`,
        description: `Voltage unbalance is ${row.voltageUnbalancePct ?? 'unknown'}% with status ${row.status}.`,
        severity: row.status === 'fail' ? 'high' : 'medium',
        category: row.status === 'missingData' ? 'missingData' : 'safety',
        confidence: 0.8,
        scope: { busId: row.busId, voltageUnbalancePct: row.voltageUnbalancePct, status: row.status },
        source: { type: 'loadFlow', key: `${row.busId}:unbalance:${row.status}` },
        recommendation: row.recommendation || 'Review per-phase loads, open-phase assumptions, and transformer/regulator settings.',
        tradeoffs: 'Balancing loads can affect panel schedules, feeder sizing, voltage drop, and field phasing.',
        pageHref: 'loadFlow.html',
      }));
    });
  if ((pkg.summary?.defaultedInputCount || 0) > 0 || (pkg.summary?.missingInputCount || 0) > 0) {
    actions.push(makeAction({
      title: 'Complete load-flow phase and control assumptions',
      description: `${pkg.summary?.defaultedInputCount || 0} defaulted and ${pkg.summary?.missingInputCount || 0} missing load-flow input(s) are present.`,
      severity: 'medium',
      category: 'missingData',
      confidence: 0.82,
      scope: { defaultedInputCount: pkg.summary?.defaultedInputCount || 0, missingInputCount: pkg.summary?.missingInputCount || 0 },
      source: { type: 'loadFlow', key: 'defaulted-inputs' },
      recommendation: 'Complete phase, bus type, voltage setpoint, tap, and control rows before issuing load-flow reports.',
      tradeoffs: 'Completing source data improves report confidence but may require one-line cleanup.',
      pageHref: 'loadFlow.html',
    }));
  }
  if (pkg.studyCase?.openPhase?.enabled) {
    actions.push(makeAction({
      title: 'Review open-phase load-flow screening case',
      description: `Open-phase screening is enabled for ${asArray(pkg.studyCase.openPhase.phases).join('/') || 'selected'} phase paths.`,
      severity: 'medium',
      category: 'review',
      confidence: 0.78,
      scope: { openPhase: pkg.studyCase.openPhase },
      source: { type: 'loadFlow', key: 'open-phase-enabled' },
      recommendation: 'Confirm whether this is a contingency case and keep it clearly separated from normal operating reports.',
      tradeoffs: 'Open-phase cases can exaggerate voltage/unbalance concerns if interpreted as normal operation.',
      pageHref: 'loadFlow.html',
    }));
  }
  asArray(pkg.warnings)
    .filter(warning => /constantCurrent|constantImpedance|mixedZIP|load-model|screening/i.test(`${warning.code || ''} ${warning.message || warning}`))
    .slice(0, 10)
    .forEach((warning, index) => {
      actions.push(makeAction({
        title: 'Review load-flow screening assumption',
        description: warning.message || String(warning),
        severity: 'low',
        category: 'review',
        confidence: 0.72,
        scope: { warningIndex: index },
        source: { type: 'loadFlow', key: `warning:${warning.code || index}` },
        recommendation: 'Document the screening assumption or use equivalent constant-PQ values before release.',
        tradeoffs: 'V1 records advanced load-model intent without replacing the underlying solver.',
        pageHref: 'loadFlow.html',
      }));
    });
  return actions;
}

function optimalPowerFlowActions(report = {}) {
  const pkg = report.optimalPowerFlow || {};
  if (!pkg || !pkg.summary) return [];
  const summaryActions = [];
  if (pkg.summary.feasible === false || pkg.summary.insufficientCapacity > 0) {
    summaryActions.push(makeAction({
      title: pkg.summary.insufficientCapacity > 0 ? 'Resolve insufficient OPF generation capacity' : 'Resolve infeasible OPF dispatch',
      description: pkg.summary.insufficientCapacity > 0
        ? 'Optimal Power Flow found enabled generation capacity below load plus reserve requirements.'
        : 'Optimal Power Flow dispatch did not pass screening feasibility checks.',
      severity: 'high',
      category: pkg.summary.insufficientCapacity > 0 ? 'missingData' : 'review',
      confidence: 0.88,
      scope: {
        feasible: pkg.summary.feasible,
        insufficientCapacity: pkg.summary.insufficientCapacity,
        totalDispatchedKw: pkg.summary.totalDispatchedKw,
      },
      source: { type: 'optimalPowerFlow', key: 'summary-infeasible' },
      recommendation: 'Open Optimal Power Flow, complete generator limits/costs, revise reserve assumptions, and rerun dispatch screening.',
      tradeoffs: 'Adding generation, reducing reserve, or changing topology affects cost, reliability, and downstream load-flow assumptions.',
      pageHref: 'optimalpowerflow.html',
    }));
  }
  const violationActions = asArray(pkg.violations)
    .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
    .slice(0, 30)
    .map(row => makeAction({
      title: row.status === 'missingData'
        ? `${row.targetId} OPF ${row.metric} needs rating data`
        : `${row.targetId} OPF ${row.metric} ${row.status === 'fail' ? 'violates' : 'approaches'} limit`,
      description: row.status === 'missingData'
        ? row.recommendation || 'OPF screening could not evaluate this constraint due to missing data.'
        : `${row.metric}: actual ${row.actualValue ?? 'n/a'}, limit ${row.limit}, margin ${row.margin ?? 'n/a'}.`,
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: row.status === 'missingData' ? 'missingData' : row.metric === 'branchLoadingPct' ? 'safety' : 'code',
      confidence: row.status === 'missingData' ? 0.76 : 0.86,
      scope: {
        targetType: row.targetType,
        targetId: row.targetId,
        metric: row.metric,
        status: row.status,
        margin: row.margin,
      },
      source: { type: 'optimalPowerFlow', key: `${row.targetType}:${row.targetId}:${row.metric}:${row.status}` },
      recommendation: row.recommendation || 'Review OPF constraints and rerun load-flow feasibility after updates.',
      tradeoffs: 'Dispatch or topology changes can affect cost, losses, voltages, and branch loading.',
      pageHref: 'optimalpowerflow.html',
    }));
  const costWarnings = asArray(pkg.warnings)
    .filter(warning => /missing-generator-cost|missing-generator-limit|branch rating|missing/i.test(`${warning.code || ''} ${warning.message || ''}`))
    .slice(0, 10)
    .map((warning, index) => makeAction({
      title: 'Complete OPF generator or branch data',
      description: warning.message || 'Optimal Power Flow reported missing cost, limit, or rating data.',
      severity: 'medium',
      category: 'missingData',
      confidence: 0.78,
      scope: { code: warning.code || '', generatorId: warning.generatorId || '' },
      source: { type: 'optimalPowerFlow', key: `warning:${warning.code || index}:${warning.generatorId || ''}` },
      recommendation: 'Enter generator cost/limit rows and branch ratings before using OPF output in issued reports.',
      tradeoffs: 'Leaving generic values in place can understate dispatch cost or miss binding constraints.',
      pageHref: 'optimalpowerflow.html',
    }));
  return [
    ...summaryActions,
    ...violationActions,
    ...costWarnings,
  ];
}

function productCatalogActions(report = {}) {
  const catalog = report.productCatalog || {};
  const usageActions = asArray(catalog.unapprovedUsage)
    .slice(0, 30)
    .map(row => makeAction({
      title: row.status === 'generic'
        ? `${row.label} uses generic product data`
        : `${row.label} needs catalog governance review`,
      description: row.message || 'Product selection is generic, unapproved, stale, or missing from the governed catalog.',
      severity: row.status === 'stale' ? 'low' : 'medium',
      category: row.status === 'generic' || row.status === 'unmatched' ? 'missingData' : 'review',
      confidence: 0.82,
      scope: {
        label: row.label,
        manufacturer: row.manufacturer,
        catalogNumber: row.catalogNumber,
        category: row.category,
        status: row.status,
      },
      source: { type: 'productCatalog', key: `${row.label}:${row.status}:${row.catalogNumber || 'generic'}` },
      recommendation: 'Open the Product Catalog, import or approve the manufacturer row, and verify datasheet/BIM metadata before issuing reports.',
      tradeoffs: 'Using approved catalog rows improves BOM and submittal confidence but still requires manufacturer/project verification.',
      pageHref: 'productcatalog.html',
    }));
  const duplicateActions = asArray(catalog.duplicates)
    .slice(0, 10)
    .map(row => makeAction({
      title: `Resolve duplicate catalog row ${row.catalogNumber}`,
      description: `The governed catalog has duplicate entries for ${row.manufacturer} ${row.catalogNumber} (${row.category}).`,
      severity: 'medium',
      category: 'review',
      confidence: 0.84,
      scope: row,
      source: { type: 'productCatalog', key: `duplicate:${row.key}` },
      recommendation: 'Merge duplicate catalog rows and keep one approved source of truth.',
      tradeoffs: 'Catalog cleanup avoids conflicting BOM, datasheet, and approval metadata.',
      pageHref: 'productcatalog.html',
    }));
  return [...usageActions, ...duplicateActions];
}

function pricingFeedGovernanceActions(report = {}) {
  const pkg = report.pricingFeedGovernance || {};
  if (!pkg.summary) return [];
  const coverageActions = asArray(pkg.estimateCoverageRows)
    .filter(row => ['unpriced', 'genericDefault', 'conflict', 'unapprovedCatalog', 'stale'].includes(row.status))
    .slice(0, 30)
    .map(row => makeAction({
      title: row.status === 'conflict'
        ? `${row.lineItemId || row.description} has conflicting governed prices`
        : row.status === 'unpriced'
          ? `${row.lineItemId || row.description} has no pricing basis`
          : `${row.lineItemId || row.description} pricing basis needs review`,
      description: asArray(row.warnings).join(' ') || `Estimate line pricing status is ${row.status}.`,
      severity: row.status === 'unpriced' || row.status === 'conflict' ? 'high' : 'medium',
      category: row.status === 'unpriced' ? 'missingData' : row.status === 'genericDefault' ? 'cost' : 'review',
      confidence: 0.82,
      scope: {
        lineItemId: row.lineItemId,
        category: row.category,
        status: row.status,
        pricingSource: row.pricingSource,
      },
      source: { type: 'pricingFeedGovernance', key: `coverage:${row.lineItemId}:${row.status}:${row.pricingRowId || 'none'}` },
      recommendation: 'Open Cost Estimate, import or approve quote/source pricing, and explicitly apply governed pricing before issuing cost reports.',
      tradeoffs: 'Governed pricing improves estimate traceability but still requires procurement or supplier verification before commercial use.',
      pageHref: 'costestimate.html',
    }));
  const rowActions = asArray(pkg.warningRows)
    .filter(row => /expired|stale|currency|uom|catalog|escalation|leadTime|invalid/i.test(`${row.code || ''} ${row.message || ''}`))
    .slice(0, 20)
    .map((row, index) => makeAction({
      title: row.severity === 'error' ? 'Fix invalid pricing feed row' : 'Review pricing source governance warning',
      description: row.message || 'Pricing feed governance reported a quote/source warning.',
      severity: row.severity === 'error' ? 'high' : 'medium',
      category: /currency|uom|missing|invalid/i.test(row.message || '') ? 'missingData' : 'review',
      confidence: 0.8,
      scope: { code: row.code, sourceId: row.sourceId, severity: row.severity },
      source: { type: 'pricingFeedGovernance', key: `warning:${row.code || index}:${row.sourceId || ''}` },
      recommendation: 'Complete pricing source metadata, approval, catalog mapping, and quote verification dates before using governed prices in a report package.',
      tradeoffs: 'Pricing source cleanup reduces commercial ambiguity but does not replace supplier quote acceptance.',
      pageHref: 'costestimate.html',
    }));
  return [...coverageActions, ...rowActions];
}

function cloudLibraryGovernanceActions(report = {}) {
  const pkg = report.cloudLibraryGovernance || {};
  if (!pkg.summary) return [];
  const actions = [];
  if ((pkg.summary.validationFailureCount || 0) > 0) {
    actions.push(makeAction({
      title: 'Fix invalid organization component library release',
      description: 'At least one organization component library release has validation errors.',
      severity: 'high',
      category: 'missingData',
      confidence: 0.82,
      scope: { validationFailureCount: pkg.summary.validationFailureCount },
      source: { type: 'cloudLibraryGovernance', key: 'validation-failure' },
      recommendation: 'Open Library Manager, fix duplicate or malformed component rows, and republish the organization release.',
      tradeoffs: 'Library validation prevents downstream one-line/component assumptions from drifting across projects.',
      pageHref: 'library.html',
    }));
  }
  if (pkg.subscription?.releaseId && !asArray(pkg.releases).some(row => row.id === pkg.subscription.releaseId)) {
    actions.push(makeAction({
      title: 'Project is pinned to an unavailable library release',
      description: `Pinned release ${pkg.subscription.releaseId} is not present in the current organization library package.`,
      severity: 'medium',
      category: 'review',
      confidence: 0.8,
      scope: pkg.subscription,
      source: { type: 'cloudLibraryGovernance', key: `stale-pin:${pkg.subscription.releaseId}` },
      recommendation: 'Load the organization library release list and repin the project to an available approved release.',
      tradeoffs: 'Repinning improves traceability but may require reviewing component diffs before adoption.',
      pageHref: 'library.html',
    }));
  }
  const unapprovedRelease = asArray(pkg.releases).find(row => row.id === pkg.subscription?.releaseId && row.approvalStatus !== 'approved');
  if (unapprovedRelease) {
    actions.push(makeAction({
      title: 'Adopted component library release is not approved',
      description: `${unapprovedRelease.releaseTag || unapprovedRelease.id} approval status is ${unapprovedRelease.approvalStatus}.`,
      severity: 'medium',
      category: 'review',
      confidence: 0.82,
      scope: { releaseId: unapprovedRelease.id, approvalStatus: unapprovedRelease.approvalStatus },
      source: { type: 'cloudLibraryGovernance', key: `unapproved:${unapprovedRelease.id}` },
      recommendation: 'Approve the organization release or adopt an approved release before issuing project reports.',
      tradeoffs: 'Approval metadata is local governance, not formal document control, but it helps avoid personal-only component data in issued packages.',
      pageHref: 'library.html',
    }));
  }
  if ((pkg.summary.adoptionConflictCount || 0) > 0) {
    actions.push(makeAction({
      title: 'Resolve organization library adoption conflicts',
      description: `${pkg.summary.adoptionConflictCount} merge conflict(s) were found between the project library and the selected release.`,
      severity: 'medium',
      category: 'constructability',
      confidence: 0.78,
      scope: pkg.adoptionPreview?.summary || {},
      source: { type: 'cloudLibraryGovernance', key: 'adoption-conflicts' },
      recommendation: 'Review the merge preview in Library Manager and choose replace or merge explicitly before adopting the release.',
      tradeoffs: 'Manual conflict review avoids silently overwriting local component definitions.',
      pageHref: 'library.html',
    }));
  }
  if ((pkg.summary.releaseCount || 0) === 0 && (pkg.summary.warningCount || 0) > 0) {
    actions.push(makeAction({
      title: 'Publish custom component library as an organization release',
      description: 'The project appears to use personal/local component data without an organization release record.',
      severity: 'low',
      category: 'review',
      confidence: 0.72,
      scope: { warningCount: pkg.summary.warningCount },
      source: { type: 'cloudLibraryGovernance', key: 'personal-only-library' },
      recommendation: 'Publish the current component library to an organization workspace release and pin the project to that release.',
      tradeoffs: 'Publishing creates a traceable release record while keeping adoption local and review-only.',
      pageHref: 'library.html',
    }));
  }
  return actions;
}

function fieldCommissioningActions(report = {}) {
  const pkg = report.fieldCommissioning || {};
  return asArray(pkg.openItems)
    .slice(0, 30)
    .map(row => makeAction({
      title: row.status === 'rejected'
        ? `${row.elementTag || row.elementId} field verification rejected`
        : `${row.elementTag || row.elementId} field item requires follow-up`,
      description: row.comments || `${row.observationType} field observation is ${row.status}.`,
      severity: row.priority === 'critical' ? 'critical' : row.priority === 'high' || row.status === 'rejected' ? 'high' : 'medium',
      category: row.observationType === 'asBuilt' ? 'constructability' : row.observationType === 'punch' ? 'review' : 'missingData',
      confidence: 0.86,
      scope: {
        observationId: row.id,
        elementType: row.elementType,
        elementId: row.elementId,
        status: row.status,
        priority: row.priority,
      },
      source: { type: 'fieldCommissioning', key: `${row.id}:${row.status}` },
      recommendation: row.observationType === 'asBuilt'
        ? 'Review the as-built note and update the project model or resolve the discrepancy before package release.'
        : 'Resolve, verify, or reject the field observation in Field View before issuing final reports.',
      tradeoffs: 'Field observations are local coordination records and may require separate formal commissioning signoff.',
      pageHref: `fieldview.html#${row.elementType === 'tray' ? 'tray' : row.elementType === 'cable' ? 'cable' : 'target'}=${encodeURIComponent(row.elementId || row.elementTag || '')}`,
    }));
}

function bimRoundTripActions(report = {}) {
  const pkg = report.bimRoundTrip || {};
  const reconciliation = asArray(pkg.quantityReconciliation?.rows)
    .filter(row => row.status && row.status !== 'matched')
    .slice(0, 30)
    .map(row => makeAction({
      title: `${row.elementType} BIM quantity reconciliation is ${row.status}`,
      description: `${row.elementType} ${row.system || 'Unassigned'} ${row.level || ''} ${row.area || ''}: project ${row.projectQuantity}, BIM ${row.bimQuantity}, delta ${row.delta}.`,
      severity: Math.abs(Number(row.deltaPct) || 0) >= 20 || row.status === 'bimOnly' || row.status === 'projectOnly' ? 'high' : 'medium',
      category: row.status === 'bimOnly' || row.status === 'projectOnly' ? 'constructability' : 'review',
      confidence: 0.82,
      scope: {
        elementType: row.elementType,
        system: row.system,
        level: row.level,
        area: row.area,
        delta: row.delta,
        status: row.status,
      },
      source: { type: 'bimRoundTrip', key: `reconcile:${row.elementType}:${row.system}:${row.level}:${row.area}:${row.status}` },
      recommendation: row.recommendation || 'Review CableTrayRoute quantities against the imported BIM takeoff before model handoff.',
      tradeoffs: 'Reconciliation is advisory; schedule or BIM model changes should be reviewed before either model is updated.',
      pageHref: 'bimcoordination.html',
    }));
  const issues = asArray(pkg.issues)
    .filter(row => row.status === 'open' || row.status === 'assigned' || row.status === 'rejected')
    .slice(0, 30)
    .map(row => makeAction({
      title: row.status === 'rejected' ? `${row.title} was rejected in BIM coordination` : `${row.title} remains open in BIM coordination`,
      description: row.description || `BIM issue ${row.id} is ${row.status}.`,
      severity: row.priority === 'critical' ? 'critical' : row.priority === 'high' || row.status === 'rejected' ? 'high' : 'medium',
      category: 'constructability',
      confidence: 0.86,
      scope: {
        issueId: row.id,
        status: row.status,
        priority: row.priority,
        elementIds: row.elementIds,
      },
      source: { type: 'bimRoundTrip', key: `issue:${row.id}:${row.status}` },
      recommendation: 'Resolve, assign, or close the BIM coordination issue before report handoff.',
      tradeoffs: 'Issue decisions are local BCF-style records and do not update native BIM authoring models automatically.',
      pageHref: 'bimcoordination.html',
    }));
  const unmapped = Number(pkg.summary?.unmappedCount || 0);
  return [
    ...reconciliation,
    ...issues,
    ...(unmapped > 0 ? [makeAction({
      title: 'Map imported BIM elements to project records',
      description: `${unmapped} imported BIM element(s) are not mapped to CableTrayRoute schedules or equipment.`,
      severity: 'medium',
      category: 'missingData',
      confidence: 0.78,
      scope: { unmappedCount: unmapped },
      source: { type: 'bimRoundTrip', key: `unmapped:${unmapped}` },
      recommendation: 'Add stable tags/GUID references or update the imported BIM metadata so project-to-BIM mapping is traceable.',
      tradeoffs: 'Stable mappings improve handoff traceability but may require coordination with the BIM authoring model.',
      pageHref: 'bimcoordination.html',
    })] : []),
  ];
}

function bimConnectorReadinessActions(report = {}) {
  const pkg = report.bimConnectorReadiness || {};
  if (!pkg.summary) return [];
  const actions = [];
  if ((pkg.summary.invalidCount || 0) > 0 || pkg.validation?.valid === false) {
    actions.push(makeAction({
      title: 'Resolve invalid BIM/CAD connector package',
      description: asArray(pkg.validation?.errors).join(' ') || 'The active connector exchange package did not pass validation.',
      severity: 'high',
      category: 'review',
      confidence: 0.9,
      scope: { activePackageId: pkg.summary.activePackageId, invalidCount: pkg.summary.invalidCount || 0 },
      source: { type: 'bimConnectorReadiness', key: `invalid:${pkg.summary.activePackageId || 'none'}` },
      recommendation: 'Preview the connector return package in BIM Coordination and reject or correct invalid rows before accepting it.',
      tradeoffs: 'Connector imports are review-only records and do not update schedules or native BIM models automatically.',
      pageHref: 'bimcoordination.html',
    }));
  }
  if ((pkg.summary.staleCount || 0) > 0) {
    actions.push(makeAction({
      title: 'Refresh stale BIM/CAD connector exchange package',
      description: `${pkg.summary.staleCount} connector exchange package(s) are older than the configured readiness window.`,
      severity: 'medium',
      category: 'review',
      confidence: 0.78,
      scope: { staleCount: pkg.summary.staleCount },
      source: { type: 'bimConnectorReadiness', key: `stale:${pkg.summary.staleCount}` },
      recommendation: 'Export a fresh connector JSON package and reconcile the returned package before issuing downstream reports.',
      tradeoffs: 'Fresh exchanges improve coordination traceability but require a current round trip through the desktop BIM/CAD tool.',
      pageHref: 'bimcoordination.html',
    }));
  }
  asArray(pkg.roundTripDiff?.quantityDeltas)
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: `${row.elementType || 'BIM/CAD'} connector quantity delta requires review`,
      description: `${row.system || 'Unassigned'} ${row.level || ''} ${row.area || ''}: project ${row.projectQuantity}, connector ${row.bimQuantity}, delta ${row.delta}.`,
      severity: Math.abs(Number(row.deltaPct) || 0) >= 20 ? 'high' : 'medium',
      category: 'constructability',
      confidence: 0.82,
      scope: {
        elementType: row.elementType,
        system: row.system,
        level: row.level,
        area: row.area,
        delta: row.delta,
      },
      source: { type: 'bimConnectorReadiness', key: `quantity:${row.elementType}:${row.system}:${row.level}:${row.area}` },
      recommendation: 'Review the connector round-trip quantity delta before updating project schedules or BIM authoring models.',
      tradeoffs: 'Quantity reconciliation is advisory and should be resolved by discipline review before handoff.',
      pageHref: 'bimcoordination.html',
    })));
  const mappingCount = Number(pkg.summary.mappingDeltas || 0);
  if (mappingCount > 0) {
    actions.push(makeAction({
      title: 'Review unmapped BIM/CAD connector elements',
      description: `${mappingCount} connector element mapping delta(s) need stable IDs, tags, or project references.`,
      severity: mappingCount >= 5 ? 'high' : 'medium',
      category: 'missingData',
      confidence: 0.8,
      scope: { mappingDeltas: mappingCount },
      source: { type: 'bimConnectorReadiness', key: `mapping:${mappingCount}` },
      recommendation: 'Add mapping hints or stable identifiers so connector packages can round-trip without ambiguous elements.',
      tradeoffs: 'Improved mappings may require changes in both CableTrayRoute and the external authoring model metadata.',
      pageHref: 'bimcoordination.html',
    }));
  }
  asArray(pkg.activePackage?.issues)
    .filter(issue => issue.status === 'open' || issue.status === 'assigned' || issue.status === 'rejected')
    .slice(0, 20)
    .forEach(issue => actions.push(makeAction({
      title: `${issue.title || issue.id || 'Connector issue'} remains open in connector exchange`,
      description: issue.description || `Connector issue ${issue.id || ''} is ${issue.status || 'open'}.`,
      severity: issue.priority === 'critical' ? 'critical' : issue.priority === 'high' || issue.status === 'rejected' ? 'high' : 'medium',
      category: 'constructability',
      confidence: 0.84,
      scope: { issueId: issue.id, status: issue.status, priority: issue.priority },
      source: { type: 'bimConnectorReadiness', key: `issue:${issue.id || issue.title}:${issue.status}` },
      recommendation: 'Resolve or assign connector issue records before final model handoff.',
      tradeoffs: 'Connector issues are local exchange records and do not close native BIM issue trackers automatically.',
      pageHref: 'bimcoordination.html',
    })));
  return actions;
}

function nativeBimConnectorKitActions(report = {}) {
  const pkg = report.nativeBimConnectorKit || {};
  if (!pkg.summary) return [];
  const actions = [];
  if ((pkg.summary.validDescriptorCount || 0) < (pkg.summary.descriptorCount || 0)) {
    actions.push(makeAction({
      title: 'Validate native BIM/CAD connector descriptors',
      description: 'One or more native connector starter-kit descriptors do not match the current connector contract.',
      severity: 'medium',
      category: 'review',
      confidence: 0.86,
      scope: { descriptorCount: pkg.summary.descriptorCount, validDescriptorCount: pkg.summary.validDescriptorCount },
      source: { type: 'nativeBimConnectorKit', key: `descriptor:${pkg.summary.validDescriptorCount}:${pkg.summary.descriptorCount}` },
      recommendation: 'Regenerate the native connector descriptors from BIM Coordination before handing the starter kit to a desktop add-in developer.',
      tradeoffs: 'Descriptor validation keeps the add-in handoff aligned with the browser connector contract but does not compile or certify an Autodesk plugin.',
      pageHref: 'bimcoordination.html',
    }));
  }
  asArray(pkg.installChecklist)
    .filter(row => row.status !== 'pass')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: `${row.connectorType || 'Native connector'} install readiness item needs review`,
      description: row.item || row.recommendation || 'Native connector starter-kit checklist item is not complete.',
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: row.status === 'missingData' ? 'missingData' : 'review',
      confidence: 0.82,
      scope: { connectorType: row.connectorType, status: row.status, descriptorId: row.descriptorId },
      source: { type: 'nativeBimConnectorKit', key: `checklist:${row.id || row.connectorType}:${row.status}` },
      recommendation: row.recommendation || 'Complete the native connector install/readiness checklist before relying on desktop add-in round trips.',
      tradeoffs: 'The starter kit is SDK-ready source only; compiling and installing it still requires the target desktop environment.',
      pageHref: 'bimcoordination.html',
    })));
  asArray(pkg.warnings)
    .filter(warning => String(warning).toLowerCase().includes('write-back') || String(warning).toLowerCase().includes('mutating'))
    .slice(0, 5)
    .forEach((warning, index) => actions.push(makeAction({
      title: 'Keep native BIM/CAD connector imports review-only',
      description: warning,
      severity: 'medium',
      category: 'review',
      confidence: 0.88,
      scope: { warning },
      source: { type: 'nativeBimConnectorKit', key: `writeback:${index}:${warning}` },
      recommendation: 'Remove write-back assumptions from the starter-kit descriptor and document project-specific authoring changes as future extension work.',
      tradeoffs: 'Review-only imports avoid unintended native model mutations until a certified desktop workflow exists.',
      pageHref: 'bimcoordination.html',
    })));
  return actions;
}

function revitSyncReadinessActions(report = {}) {
  const pkg = report.revitSyncReadiness || {};
  if (!pkg.summary) return [];
  const actions = [];
  if (pkg.summary.validationStatus === 'fail' || (pkg.summary.rejectedPreviewRows || 0) > 0) {
    actions.push(makeAction({
      title: 'Resolve Revit bridge validation failures',
      description: `${pkg.summary.rejectedPreviewRows || 0} Revit sync preview row(s) were rejected or the bridge descriptor failed validation.`,
      severity: 'high',
      category: 'review',
      confidence: 0.88,
      scope: { validationStatus: pkg.summary.validationStatus, rejectedPreviewRows: pkg.summary.rejectedPreviewRows || 0 },
      source: { type: 'revitSyncReadiness', key: `validation:${pkg.summary.validationStatus}:${pkg.summary.rejectedPreviewRows || 0}` },
      recommendation: 'Preview the Revit return package in BIM Coordination and correct invalid identifiers, contract version, or element category mappings before accepting records.',
      tradeoffs: 'The Revit bridge is review-only in V1, so resolving validation issues improves handoff confidence without mutating the native model.',
      pageHref: 'bimcoordination.html',
    }));
  }
  asArray(pkg.validationRows)
    .filter(row => row.status !== 'pass')
    .slice(0, 10)
    .forEach(row => actions.push(makeAction({
      title: `${row.check || 'Revit bridge'} readiness needs review`,
      description: row.detail || 'Revit bridge validation row is not passing.',
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: row.status === 'missingData' ? 'missingData' : 'review',
      confidence: 0.82,
      scope: { check: row.check, status: row.status },
      source: { type: 'revitSyncReadiness', key: `row:${row.id || row.check}:${row.status}` },
      recommendation: 'Regenerate the Revit bridge descriptor, sample payload, or template file list before relying on the add-in handoff.',
      tradeoffs: 'Bridge readiness is a handoff quality gate; compiled deployment still requires Autodesk SDK review outside CableTrayRoute.',
      pageHref: 'bimcoordination.html',
    })));
  asArray(pkg.syncPreviewRows)
    .filter(row => row.status === 'review' || row.status === 'rejected')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: `${row.tag || row.id || 'Revit element'} mapping requires review`,
      description: row.recommendation || 'Revit element sync preview row has low confidence or was rejected.',
      severity: row.status === 'rejected' ? 'high' : 'medium',
      category: 'constructability',
      confidence: 0.8,
      scope: { elementType: row.elementType, tag: row.tag, guid: row.guid, status: row.status },
      source: { type: 'revitSyncReadiness', key: `preview:${row.id || row.guid || row.tag}:${row.status}` },
      recommendation: 'Add stable GUID/source IDs, project tags, or BIM object family mapping hints before accepting Revit sync rows.',
      tradeoffs: 'Stable Revit mappings reduce duplicate or ambiguous BIM records during handoff.',
      pageHref: 'bimcoordination.html',
    })));
  asArray(pkg.warnings)
    .filter(warning => String(warning).toLowerCase().includes('write-back') || String(warning).toLowerCase().includes('mutation'))
    .slice(0, 5)
    .forEach((warning, index) => actions.push(makeAction({
      title: 'Keep Revit bridge imports review-only',
      description: warning,
      severity: 'medium',
      category: 'review',
      confidence: 0.9,
      scope: { warning },
      source: { type: 'revitSyncReadiness', key: `writeback:${index}:${warning}` },
      recommendation: 'Document native write-back as future Autodesk add-in extension work and keep V1 import preview non-mutating.',
      tradeoffs: 'Review-only Revit sync avoids unintended model changes before a certified add-in workflow exists.',
      pageHref: 'bimcoordination.html',
    })));
  return actions;
}

function revitNativeSyncActions(report = {}) {
  const pkg = report.revitNativeSync || {};
  if (!pkg.summary) return [];
  const actions = [];
  if (pkg.summary.status === 'fail' || (pkg.summary.rejectedPreviewRows || 0) > 0) {
    actions.push(makeAction({
      title: 'Resolve functional Revit add-in bridge failures',
      description: `${pkg.summary.rejectedPreviewRows || 0} native Revit preview row(s) were rejected or the source/manifest readiness package failed validation.`,
      severity: 'high',
      category: 'review',
      confidence: 0.88,
      scope: { status: pkg.summary.status, rejectedPreviewRows: pkg.summary.rejectedPreviewRows || 0 },
      source: { type: 'revitNativeSync', key: `validation:${pkg.summary.status}:${pkg.summary.rejectedPreviewRows || 0}` },
      recommendation: 'Preview the Revit return package in BIM Coordination and correct source manifest, contract version, or rejected element rows before accepting BIM records.',
      tradeoffs: 'The native Revit source remains review-only in V1, so resolving failures improves handoff confidence without automatic model mutation.',
      pageHref: 'bimcoordination.html',
    }));
  }
  asArray(pkg.commandRows)
    .filter(row => row.status !== 'pass')
    .slice(0, 10)
    .forEach(row => actions.push(makeAction({
      title: `${row.commandClass || row.commandName || 'Revit command'} source coverage needs review`,
      description: row.detail || 'Functional Revit add-in command coverage is incomplete.',
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: 'missingData',
      confidence: 0.84,
      scope: { commandClass: row.commandClass, status: row.status },
      source: { type: 'revitNativeSync', key: `command:${row.commandClass || row.commandName}:${row.status}` },
      recommendation: 'Regenerate or update the Revit add-in source scaffold so export, validation, import-preview, and bridge-open commands are present in source and manifest metadata.',
      tradeoffs: 'CI checks source text and manifests; Autodesk API compilation still requires a licensed Revit SDK environment.',
      pageHref: 'bimcoordination.html',
    })));
  asArray(pkg.exportMappingRows)
    .filter(row => row.status !== 'ready')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: `${row.revitCategory || row.elementType || 'Revit'} export mapping needs review`,
      description: asArray(row.warnings).join(' ') || 'Native Revit export mapping is incomplete or generic.',
      severity: row.status === 'missingData' ? 'high' : 'medium',
      category: row.status === 'missingData' ? 'missingData' : 'constructability',
      confidence: 0.8,
      scope: { revitCategory: row.revitCategory, elementType: row.elementType, status: row.status },
      source: { type: 'revitNativeSync', key: `mapping:${row.id || row.revitCategory}:${row.status}` },
      recommendation: 'Add category, tag, quantity, and BIM family mapping hints before using the Revit native export in model handoff.',
      tradeoffs: 'Complete mappings reduce ambiguous BIM rows but may require project-specific Revit family and parameter standards.',
      pageHref: 'bimcoordination.html',
    })));
  asArray(pkg.syncPreviewRows)
    .filter(row => row.status === 'review' || row.status === 'rejected')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: `${row.tag || row.id || 'Revit native row'} sync preview requires review`,
      description: row.recommendation || 'Functional Revit add-in return row has low confidence or was rejected.',
      severity: row.status === 'rejected' ? 'high' : 'medium',
      category: 'constructability',
      confidence: 0.8,
      scope: { elementType: row.elementType, tag: row.tag, guid: row.guid, status: row.status },
      source: { type: 'revitNativeSync', key: `preview:${row.id || row.guid || row.tag}:${row.status}` },
      recommendation: 'Correct Revit UniqueId/sourceId, tag, or mapped project reference before accepting this row into BIM Coordination.',
      tradeoffs: 'Preview-only acceptance prevents unintended Revit or CableTrayRoute model changes while preserving issue/quantity traceability.',
      pageHref: 'bimcoordination.html',
    })));
  asArray(pkg.warnings)
    .filter(warning => /write-back|mutation|sdk|certified|Autodesk/i.test(String(warning)))
    .slice(0, 8)
    .forEach((warning, index) => actions.push(makeAction({
      title: 'Review Revit native sync deployment assumption',
      description: warning,
      severity: 'medium',
      category: 'review',
      confidence: 0.88,
      scope: { warning },
      source: { type: 'revitNativeSync', key: `assumption:${index}:${warning}` },
      recommendation: 'Keep the V1 Revit native bridge as file/preview exchange unless a licensed Autodesk SDK build and project-specific write-back rules are approved.',
      tradeoffs: 'This avoids overstating connector readiness while still giving developers buildable source and validated exchange contracts.',
      pageHref: 'bimcoordination.html',
    })));
  return actions;
}

function autocadSyncReadinessActions(report = {}) {
  const pkg = report.autocadSyncReadiness || {};
  if (!pkg.summary) return [];
  const actions = [];
  if (pkg.summary.validationStatus === 'fail' || (pkg.summary.rejectedPreviewRows || 0) > 0) {
    actions.push(makeAction({
      title: 'Resolve AutoCAD bridge validation failures',
      description: `${pkg.summary.rejectedPreviewRows || 0} AutoCAD sync preview row(s) were rejected or the bridge descriptor failed validation.`,
      severity: 'high',
      category: 'review',
      confidence: 0.88,
      scope: { validationStatus: pkg.summary.validationStatus, rejectedPreviewRows: pkg.summary.rejectedPreviewRows || 0 },
      source: { type: 'autocadSyncReadiness', key: `validation:${pkg.summary.validationStatus}:${pkg.summary.rejectedPreviewRows || 0}` },
      recommendation: 'Preview the AutoCAD return package in BIM Coordination and correct invalid object handles, contract version, or layer/category mappings before accepting records.',
      tradeoffs: 'The AutoCAD bridge is review-only in V1, so resolving validation issues improves handoff confidence without mutating the native drawing.',
      pageHref: 'bimcoordination.html',
    }));
  }
  asArray(pkg.validationRows)
    .filter(row => row.status !== 'pass')
    .slice(0, 10)
    .forEach(row => actions.push(makeAction({
      title: `${row.check || 'AutoCAD bridge'} readiness needs review`,
      description: row.detail || 'AutoCAD bridge validation row is not passing.',
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: row.status === 'missingData' ? 'missingData' : 'review',
      confidence: 0.82,
      scope: { check: row.check, status: row.status },
      source: { type: 'autocadSyncReadiness', key: `row:${row.id || row.check}:${row.status}` },
      recommendation: 'Regenerate the AutoCAD bridge descriptor, sample payload, or bundle template file list before relying on the add-in handoff.',
      tradeoffs: 'Bridge readiness is a handoff quality gate; compiled deployment still requires Autodesk SDK review outside CableTrayRoute.',
      pageHref: 'bimcoordination.html',
    })));
  asArray(pkg.syncPreviewRows)
    .filter(row => row.status === 'review' || row.status === 'rejected')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: `${row.tag || row.id || 'AutoCAD element'} mapping requires review`,
      description: row.recommendation || 'AutoCAD element sync preview row has low confidence or was rejected.',
      severity: row.status === 'rejected' ? 'high' : 'medium',
      category: 'constructability',
      confidence: 0.8,
      scope: { elementType: row.elementType, tag: row.tag, guid: row.guid, status: row.status },
      source: { type: 'autocadSyncReadiness', key: `preview:${row.id || row.guid || row.tag}:${row.status}` },
      recommendation: 'Add stable object handles/source IDs, project tags, or BIM object family mapping hints before accepting AutoCAD sync rows.',
      tradeoffs: 'Stable AutoCAD mappings reduce duplicate or ambiguous CAD records during handoff.',
      pageHref: 'bimcoordination.html',
    })));
  asArray(pkg.warnings)
    .filter(warning => /write-back|mutation|aveva|smartplant/i.test(String(warning)))
    .slice(0, 8)
    .forEach((warning, index) => actions.push(makeAction({
      title: /aveva|smartplant/i.test(String(warning)) ? 'Keep AVEVA and SmartPlant plugins deferred' : 'Keep AutoCAD bridge imports review-only',
      description: warning,
      severity: 'medium',
      category: 'review',
      confidence: 0.9,
      scope: { warning },
      source: { type: 'autocadSyncReadiness', key: `warning:${index}:${warning}` },
      recommendation: /aveva|smartplant/i.test(String(warning))
        ? 'Document AVEVA and SmartPlant as future SDK-specific connector work and use the AutoCAD bridge only for AutoCAD-compatible handoffs.'
        : 'Document native write-back as future AutoCAD add-in extension work and keep V1 import preview non-mutating.',
      tradeoffs: 'Review-only AutoCAD sync avoids unintended drawing changes before a certified add-in workflow exists.',
      pageHref: 'bimcoordination.html',
    })));
  return actions;
}

function autocadNativeSyncActions(report = {}) {
  const pkg = report.autocadNativeSync || {};
  if (!pkg.summary) return [];
  const actions = [];
  if (pkg.summary.status === 'fail' || (pkg.summary.rejectedPreviewRows || 0) > 0) {
    actions.push(makeAction({
      title: 'Resolve functional AutoCAD add-in bridge failures',
      description: `${pkg.summary.rejectedPreviewRows || 0} native AutoCAD preview row(s) were rejected or the source/bundle readiness package failed validation.`,
      severity: 'high',
      category: 'review',
      confidence: 0.88,
      scope: { status: pkg.summary.status, rejectedPreviewRows: pkg.summary.rejectedPreviewRows || 0 },
      source: { type: 'autocadNativeSync', key: `validation:${pkg.summary.status}:${pkg.summary.rejectedPreviewRows || 0}` },
      recommendation: 'Preview the AutoCAD return package in BIM Coordination and correct source manifest, contract version, or rejected entity rows before accepting BIM/CAD records.',
      tradeoffs: 'The native AutoCAD source remains review-only in V1, so resolving failures improves handoff confidence without automatic drawing mutation.',
      pageHref: 'bimcoordination.html',
    }));
  }
  asArray(pkg.commandRows)
    .filter(row => row.status !== 'pass')
    .slice(0, 10)
    .forEach(row => actions.push(makeAction({
      title: `${row.commandClass || row.commandName || 'AutoCAD command'} source coverage needs review`,
      description: row.detail || 'Functional AutoCAD add-in command coverage is incomplete.',
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: 'missingData',
      confidence: 0.84,
      scope: { commandClass: row.commandClass, status: row.status },
      source: { type: 'autocadNativeSync', key: `command:${row.commandClass || row.commandName}:${row.status}` },
      recommendation: 'Regenerate or update the AutoCAD add-in source scaffold so export, validation, import-preview, and bridge-open commands are present in source and bundle manifest metadata.',
      tradeoffs: 'CI checks source text and manifests; Autodesk API compilation still requires a licensed AutoCAD SDK environment.',
      pageHref: 'bimcoordination.html',
    })));
  asArray(pkg.exportMappingRows)
    .filter(row => row.status !== 'ready')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: `${row.autocadObjectType || row.elementType || 'AutoCAD'} export mapping needs review`,
      description: asArray(row.warnings).join(' ') || 'Native AutoCAD export mapping is incomplete or generic.',
      severity: row.status === 'missingData' ? 'high' : 'medium',
      category: row.status === 'missingData' ? 'missingData' : 'constructability',
      confidence: 0.8,
      scope: { autocadObjectType: row.autocadObjectType, elementType: row.elementType, status: row.status },
      source: { type: 'autocadNativeSync', key: `mapping:${row.id || row.autocadObjectType}:${row.status}` },
      recommendation: 'Add layer, block, tag, quantity, and BIM family mapping hints before using the AutoCAD native export in model handoff.',
      tradeoffs: 'Complete mappings reduce ambiguous CAD rows but may require project-specific layer, block, and property-set standards.',
      pageHref: 'bimcoordination.html',
    })));
  asArray(pkg.syncPreviewRows)
    .filter(row => row.status === 'review' || row.status === 'rejected')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: `${row.tag || row.id || 'AutoCAD native row'} sync preview requires review`,
      description: row.recommendation || 'Functional AutoCAD add-in return row has low confidence or was rejected.',
      severity: row.status === 'rejected' ? 'high' : 'medium',
      category: 'constructability',
      confidence: 0.8,
      scope: { elementType: row.elementType, tag: row.tag, guid: row.guid, status: row.status },
      source: { type: 'autocadNativeSync', key: `preview:${row.id || row.guid || row.tag}:${row.status}` },
      recommendation: 'Correct AutoCAD handle/sourceId, layer/tag, or mapped project reference before accepting this row into BIM Coordination.',
      tradeoffs: 'Preview-only acceptance prevents unintended AutoCAD or CableTrayRoute model changes while preserving issue/quantity traceability.',
      pageHref: 'bimcoordination.html',
    })));
  asArray(pkg.warnings)
    .filter(warning => /write-back|mutation|sdk|certified|Autodesk|AutoCAD/i.test(String(warning)))
    .slice(0, 8)
    .forEach((warning, index) => actions.push(makeAction({
      title: 'Review AutoCAD native sync deployment assumption',
      description: warning,
      severity: 'medium',
      category: 'review',
      confidence: 0.88,
      scope: { warning },
      source: { type: 'autocadNativeSync', key: `assumption:${index}:${warning}` },
      recommendation: 'Keep the V1 AutoCAD native bridge as file/preview exchange unless a licensed Autodesk SDK build and project-specific write-back rules are approved.',
      tradeoffs: 'This avoids overstating connector readiness while still giving developers buildable source and validated exchange contracts.',
      pageHref: 'bimcoordination.html',
    })));
  return actions;
}

function plantCadSyncReadinessActions(report = {}) {
  const pkg = report.plantCadSyncReadiness || {};
  if (!pkg.summary) return [];
  const actions = [];
  if (pkg.summary.validationStatus === 'fail' || (pkg.summary.rejectedPreviewRows || 0) > 0) {
    actions.push(makeAction({
      title: 'Resolve plant-CAD bridge validation failures',
      description: `${pkg.summary.rejectedPreviewRows || 0} AVEVA/SmartPlant sync preview row(s) were rejected or the bridge descriptor failed validation.`,
      severity: 'high',
      category: 'review',
      confidence: 0.88,
      scope: { validationStatus: pkg.summary.validationStatus, rejectedPreviewRows: pkg.summary.rejectedPreviewRows || 0 },
      source: { type: 'plantCadSyncReadiness', key: `validation:${pkg.summary.validationStatus}:${pkg.summary.rejectedPreviewRows || 0}` },
      recommendation: 'Preview the plant-CAD return package in BIM Coordination and correct invalid source IDs, contract version, or discipline/category mappings before accepting records.',
      tradeoffs: 'The plant-CAD bridge is review-only in V1, so resolving validation issues improves handoff confidence without mutating native plant models.',
      pageHref: 'bimcoordination.html',
    }));
  }
  asArray(pkg.validationRows)
    .filter(row => row.status !== 'pass')
    .slice(0, 12)
    .forEach(row => actions.push(makeAction({
      title: `${row.check || 'Plant-CAD bridge'} readiness needs review`,
      description: row.detail || 'Plant-CAD bridge validation row is not passing.',
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: row.status === 'missingData' ? 'missingData' : 'review',
      confidence: 0.82,
      scope: { connectorType: row.connectorType, check: row.check, status: row.status },
      source: { type: 'plantCadSyncReadiness', key: `row:${row.connectorType}:${row.id || row.check}:${row.status}` },
      recommendation: 'Regenerate the AVEVA/SmartPlant bridge descriptor, sample payload, or template file list before relying on the plant-CAD handoff.',
      tradeoffs: 'Bridge readiness is a handoff quality gate; compiled deployment still requires proprietary SDK review outside CableTrayRoute.',
      pageHref: 'bimcoordination.html',
    })));
  asArray(pkg.syncPreviewRows)
    .filter(row => row.status === 'review' || row.status === 'rejected')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: `${row.tag || row.id || 'Plant-CAD element'} mapping requires review`,
      description: row.recommendation || 'Plant-CAD element sync preview row has low confidence or was rejected.',
      severity: row.status === 'rejected' ? 'high' : 'medium',
      category: 'constructability',
      confidence: 0.8,
      scope: { connectorType: row.connectorType, elementType: row.elementType, tag: row.tag, guid: row.guid, status: row.status },
      source: { type: 'plantCadSyncReadiness', key: `preview:${row.connectorType}:${row.id || row.guid || row.tag}:${row.status}` },
      recommendation: 'Add stable plant model IDs, project tags, or BIM object family mapping hints before accepting AVEVA/SmartPlant sync rows.',
      tradeoffs: 'Stable plant-CAD mappings reduce duplicate or ambiguous records during handoff.',
      pageHref: 'bimcoordination.html',
    })));
  asArray(pkg.warnings)
    .filter(warning => /sdk|write-back|mutation|certified|proprietary/i.test(String(warning)))
    .slice(0, 10)
    .forEach((warning, index) => actions.push(makeAction({
      title: 'Keep plant-CAD bridge imports review-only',
      description: warning,
      severity: 'medium',
      category: 'review',
      confidence: 0.9,
      scope: { warning },
      source: { type: 'plantCadSyncReadiness', key: `warning:${index}:${warning}` },
      recommendation: 'Document AVEVA/SmartPlant compiled plugins as future SDK-specific work and keep V1 plant-CAD exchange non-mutating.',
      tradeoffs: 'Review-only plant-CAD sync avoids unintended model changes before a certified add-in workflow exists.',
      pageHref: 'bimcoordination.html',
    })));
  return actions;
}

function plantCadNativeSyncActions(report = {}) {
  const pkg = report.plantCadNativeSync || {};
  if (!pkg.summary) return [];
  const actions = [];
  if (pkg.summary.status === 'fail' || (pkg.summary.rejectedPreviewRows || 0) > 0) {
    actions.push(makeAction({
      title: 'Resolve functional plant-CAD bridge failures',
      description: `${pkg.summary.rejectedPreviewRows || 0} AVEVA/SmartPlant native preview row(s) were rejected or the source/template readiness package failed validation.`,
      severity: 'high',
      category: 'review',
      confidence: 0.88,
      scope: { status: pkg.summary.status, rejectedPreviewRows: pkg.summary.rejectedPreviewRows || 0 },
      source: { type: 'plantCadNativeSync', key: `validation:${pkg.summary.status}:${pkg.summary.rejectedPreviewRows || 0}` },
      recommendation: 'Preview the plant-CAD return package in BIM Coordination and correct source templates, contract version, or rejected plant object rows before accepting records.',
      tradeoffs: 'The plant-CAD native source remains review-only in V1, so resolving failures improves handoff confidence without automatic plant model mutation.',
      pageHref: 'bimcoordination.html',
    }));
  }
  asArray(pkg.commandRows)
    .filter(row => row.status !== 'pass')
    .slice(0, 12)
    .forEach(row => actions.push(makeAction({
      title: `${row.connectorType || 'Plant-CAD'} ${row.commandName || 'command'} source coverage needs review`,
      description: row.detail || 'Functional AVEVA/SmartPlant command coverage is incomplete.',
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: 'missingData',
      confidence: 0.84,
      scope: { connectorType: row.connectorType, commandName: row.commandName, status: row.status },
      source: { type: 'plantCadNativeSync', key: `command:${row.connectorType}:${row.commandName}:${row.status}` },
      recommendation: 'Update the AVEVA/SmartPlant command templates so export, validation, import-preview, and bridge-open responsibilities are covered.',
      tradeoffs: 'CI checks source/template text only; proprietary SDK compilation still requires licensed AVEVA or Hexagon environments.',
      pageHref: 'bimcoordination.html',
    })));
  asArray(pkg.exportMappingRows)
    .filter(row => row.status !== 'ready')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: `${row.plantObjectType || row.elementType || 'Plant object'} export mapping needs review`,
      description: asArray(row.warnings).join(' ') || 'Native plant-CAD export mapping is incomplete or generic.',
      severity: row.status === 'missingData' ? 'high' : 'medium',
      category: row.status === 'missingData' ? 'missingData' : 'constructability',
      confidence: 0.8,
      scope: { plantObjectType: row.plantObjectType, elementType: row.elementType, status: row.status },
      source: { type: 'plantCadNativeSync', key: `mapping:${row.id || row.plantObjectType}:${row.status}` },
      recommendation: 'Add class selectors, tag sources, quantity basis, and BIM family/property-set mapping hints before using native plant-CAD export in model handoff.',
      tradeoffs: 'Complete mappings reduce ambiguous plant object rows but may require project-specific AVEVA/SmartPlant class and property standards.',
      pageHref: 'bimcoordination.html',
    })));
  asArray(pkg.syncPreviewRows)
    .filter(row => row.status === 'review' || row.status === 'rejected')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: `${row.tag || row.id || 'Plant-CAD native row'} sync preview requires review`,
      description: row.recommendation || 'Functional plant-CAD add-in return row has low confidence or was rejected.',
      severity: row.status === 'rejected' ? 'high' : 'medium',
      category: 'constructability',
      confidence: 0.8,
      scope: { connectorType: row.connectorType, elementType: row.elementType, tag: row.tag, guid: row.guid, status: row.status },
      source: { type: 'plantCadNativeSync', key: `preview:${row.connectorType}:${row.id || row.guid || row.tag}:${row.status}` },
      recommendation: 'Correct AVEVA DBREF, SmartPlant ObjectId, tag, or mapped project reference before accepting this row into BIM Coordination.',
      tradeoffs: 'Preview-only acceptance prevents unintended plant model or CableTrayRoute model changes while preserving issue/quantity traceability.',
      pageHref: 'bimcoordination.html',
    })));
  asArray(pkg.warnings)
    .filter(warning => /write-back|mutation|sdk|certified|AVEVA|SmartPlant|Hexagon|PDMS/i.test(String(warning)))
    .slice(0, 10)
    .forEach((warning, index) => actions.push(makeAction({
      title: 'Review plant-CAD native sync deployment assumption',
      description: warning,
      severity: 'medium',
      category: 'review',
      confidence: 0.88,
      scope: { warning },
      source: { type: 'plantCadNativeSync', key: `assumption:${index}:${warning}` },
      recommendation: 'Keep the V1 AVEVA/SmartPlant native bridge as file/preview exchange unless a licensed SDK build and project-specific write-back rules are approved.',
      tradeoffs: 'This avoids overstating connector readiness while still giving developers SDK-ready handoff source/templates and validated exchange contracts.',
      pageHref: 'bimcoordination.html',
    })));
  return actions;
}

function bimObjectLibraryActions(report = {}) {
  const pkg = report.bimObjectLibrary || {};
  if (!pkg.summary) return [];
  const actions = [];
  if ((pkg.summary.missingFamilyCount || 0) > 0) {
    actions.push(makeAction({
      title: 'Add BIM family metadata for approved catalog rows',
      description: `${pkg.summary.missingFamilyCount} governed catalog row(s) do not have BIM object family metadata for connector handoff.`,
      severity: 'medium',
      category: 'missingData',
      confidence: 0.84,
      scope: { missingFamilyCount: pkg.summary.missingFamilyCount },
      source: { type: 'bimObjectLibrary', key: `missing:${pkg.summary.missingFamilyCount}` },
      recommendation: 'Open Product Catalog and add local BIM object family metadata or document generic placeholder use before native BIM handoff.',
      tradeoffs: 'Family metadata improves connector mapping, but proprietary family binaries still require project or manufacturer sources.',
      pageHref: 'productcatalog.html',
    }));
  }
  if ((pkg.summary.conflictCount || 0) > 0) {
    actions.push(makeAction({
      title: 'Resolve conflicting BIM family mappings',
      description: `${pkg.summary.conflictCount} catalog row(s) match multiple BIM object family records.`,
      severity: 'high',
      category: 'constructability',
      confidence: 0.86,
      scope: { conflictCount: pkg.summary.conflictCount },
      source: { type: 'bimObjectLibrary', key: `conflict:${pkg.summary.conflictCount}` },
      recommendation: 'Review duplicate manufacturer/catalog/category family rows and keep one approved mapping per catalog item.',
      tradeoffs: 'Resolving conflicts reduces native connector ambiguity but may require discipline review of family naming and type catalogs.',
      pageHref: 'productcatalog.html',
    }));
  }
  if ((pkg.summary.genericPlaceholderCount || 0) > 0) {
    actions.push(makeAction({
      title: 'Review generic BIM connector placeholders',
      description: `${pkg.summary.genericPlaceholderCount} project element(s) will export with generic BIM family placeholders.`,
      severity: 'medium',
      category: 'review',
      confidence: 0.8,
      scope: { genericPlaceholderCount: pkg.summary.genericPlaceholderCount },
      source: { type: 'bimObjectLibrary', key: `generic:${pkg.summary.genericPlaceholderCount}` },
      recommendation: 'Add manufacturer/catalog fields and matching family metadata for construction-grade BIM handoff where required.',
      tradeoffs: 'Generic placeholders keep exchanges moving but may require replacement in the authoring model.',
      pageHref: 'bimcoordination.html',
    }));
  }
  asArray(pkg.validationRows)
    .filter(row => row.status === 'fail' || row.status === 'review')
    .slice(0, 20)
    .forEach(row => actions.push(makeAction({
      title: `${row.familyName || row.familyId || 'BIM family'} metadata needs review`,
      description: [...asArray(row.errors), ...asArray(row.warnings)].join(' ') || 'BIM family metadata validation requires review.',
      severity: row.status === 'fail' ? 'high' : 'medium',
      category: row.status === 'fail' ? 'missingData' : 'review',
      confidence: 0.82,
      scope: { familyId: row.familyId, status: row.status },
      source: { type: 'bimObjectLibrary', key: `validation:${row.familyId}:${row.status}` },
      recommendation: 'Complete missing family name, native format, IFC class, dimensions, connector types, and verification metadata.',
      tradeoffs: 'Completing metadata improves downstream BIM package quality but does not supply proprietary family binaries.',
      pageHref: 'productcatalog.html',
    })));
  return actions;
}

function extractStudyMessages(value, prefix = '') {
  const messages = [];
  if (!value || typeof value !== 'object') return messages;
  if (Array.isArray(value)) {
    value.forEach((item, index) => messages.push(...extractStudyMessages(item, `${prefix}[${index}]`)));
    return messages;
  }
  Object.entries(value).forEach(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (/warning|error|issue|message/i.test(key)) {
      if (typeof child === 'string') messages.push({ path, message: child });
      if (Array.isArray(child)) {
        child.forEach((item, index) => {
          if (typeof item === 'string') messages.push({ path: `${path}[${index}]`, message: item });
          if (item && typeof item === 'object') {
            messages.push({
              path: `${path}[${index}]`,
              message: item.message || item.description || JSON.stringify(item),
              severity: item.severity || item.status || '',
            });
          }
        });
      }
    } else if (child && typeof child === 'object') {
      messages.push(...extractStudyMessages(child, path));
    }
  });
  return messages;
}

function studyWarningActions(studies = {}) {
  return Object.entries(asObject(studies)).flatMap(([studyKey, studyResult]) => {
    return extractStudyMessages(studyResult)
      .slice(0, 8)
      .map((message, index) => makeAction({
        title: `Review ${studyKey} study message`,
        description: message.message || 'Saved study result includes a warning or issue.',
        severity: /error|fail|over|invalid/i.test(`${message.severity} ${message.message}`) ? 'high' : 'medium',
        category: 'review',
        confidence: 0.68,
        scope: { studyKey, path: message.path },
        source: { type: 'studyResult', key: `${studyKey}:${message.path}:${index}` },
        recommendation: 'Open the source study, resolve the warning, or document the engineering basis.',
        tradeoffs: 'Some study warnings may be acceptable when supported by project-specific assumptions.',
        pageHref: STUDY_PAGE_HREF[studyKey] || 'studiesdashboard.html',
      }));
  });
}

function approvalActions(studies = {}, approvals = {}) {
  return Object.entries(asObject(studies))
    .filter(([, result]) => {
      if (!result) return false;
      if (Array.isArray(result)) return result.length > 0;
      if (typeof result === 'object') return Object.keys(result).length > 0;
      return true;
    })
    .filter(([studyKey]) => !approvals?.[studyKey] || approvals[studyKey].status === 'pending')
    .map(([studyKey]) => makeAction({
      title: `Review and approve ${studyKey} results`,
      description: `Saved ${studyKey} results do not have an approved engineer review record.`,
      severity: 'medium',
      category: 'review',
      confidence: 0.9,
      scope: { studyKey },
      source: { type: 'studyApproval', key: studyKey },
      recommendation: 'Open the study review panel and approve, flag, or document the result before release.',
      tradeoffs: 'Approval records improve report traceability but do not replace required engineering review.',
      pageHref: STUDY_PAGE_HREF[studyKey] || 'studiesdashboard.html',
      apply: { kind: 'initializePendingApproval', studyKey },
    }));
}

function lifecycleActions(lifecycle = {}, report = {}) {
  const hasReportData = Boolean(report.summary || report.validation || report.heatTrace);
  if (!hasReportData) return [];
  const active = lifecycle.activePackage;
  const latestReleased = lifecycle.latestReleased;
  if (latestReleased && (!lifecycle.activeStudyPackageId || !active || active.id !== latestReleased.id)) {
    return [makeAction({
      title: 'Set latest released lifecycle package active',
      description: `Released package ${latestReleased.revision || latestReleased.id} exists but is not active for reports.`,
      severity: 'medium',
      category: 'review',
      confidence: 0.86,
      scope: { packageId: latestReleased.id },
      source: { type: 'lifecycle', key: 'active-package-missing' },
      recommendation: 'Set the latest released package active before exporting reports.',
      tradeoffs: 'This updates report lineage only; it does not modify engineering calculations.',
      pageHref: 'workflowdashboard.html',
      apply: { kind: 'setActiveStudyPackage', packageId: latestReleased.id },
    })];
  }
  if (!active) {
    return [makeAction({
      title: 'Create a lifecycle release package',
      description: 'Reports can be generated from live state, but no lifecycle package is available for lineage.',
      severity: 'medium',
      category: 'review',
      confidence: 0.84,
      scope: {},
      source: { type: 'lifecycle', key: 'no-packages' },
      recommendation: 'Use the Lifecycle Releases panel to freeze the current model and study package before issue.',
      tradeoffs: 'Lifecycle packages are local release records, not formal document-control signatures.',
      pageHref: 'workflowdashboard.html',
    })];
  }
  if (active.status !== 'released') {
    return [makeAction({
      title: 'Active lifecycle package is not released',
      description: `Active package ${active.revision || active.id} has status ${active.status || 'unknown'}.`,
      severity: 'low',
      category: 'review',
      confidence: 0.82,
      scope: { packageId: active.id, status: active.status },
      source: { type: 'lifecycle', key: `active-status:${active.id}` },
      recommendation: 'Release or replace the active lifecycle package before using it as report lineage.',
      tradeoffs: 'Draft lineage may be acceptable for internal checking but should be clear in deliverables.',
      pageHref: 'workflowdashboard.html',
    })];
  }
  return [];
}

export function rankDesignCoachActions(actions = []) {
  return [...asArray(actions)].sort((a, b) => {
    const category = (CATEGORY_WEIGHT[a.category] ?? 99) - (CATEGORY_WEIGHT[b.category] ?? 99);
    if (category !== 0) return category;
    const severity = (SEVERITY_WEIGHT[a.severity] ?? 99) - (SEVERITY_WEIGHT[b.severity] ?? 99);
    if (severity !== 0) return severity;
    const confidence = (b.confidence || 0) - (a.confidence || 0);
    if (confidence !== 0) return confidence;
    return String(a.fingerprint).localeCompare(String(b.fingerprint));
  });
}

export function dedupeDesignCoachActions(actions = []) {
  const byFingerprint = new Map();
  rankDesignCoachActions(actions).forEach(action => {
    if (!byFingerprint.has(action.fingerprint)) byFingerprint.set(action.fingerprint, action);
  });
  return [...byFingerprint.values()];
}

export function filterDesignCoachActions(actions = [], decisions = []) {
  const decided = new Map(asArray(decisions).map(decision => [decision.fingerprint || decision.actionId, decision]));
  return asArray(actions)
    .map(action => {
      const decision = decided.get(action.fingerprint) || decided.get(action.id);
      return decision ? { ...action, decision } : action;
    })
    .filter(action => !['accepted', 'rejected', 'dismissed'].includes(action.decision?.decision));
}

export function summarizeDesignCoachActions(actions = []) {
  const rows = asArray(actions);
  const bySeverity = {};
  const byCategory = {};
  rows.forEach(action => {
    bySeverity[action.severity] = (bySeverity[action.severity] || 0) + 1;
    byCategory[action.category] = (byCategory[action.category] || 0) + 1;
  });
  return {
    total: rows.length,
    highPriority: rows.filter(action => action.severity === 'critical' || action.severity === 'high').length,
    applyAvailable: rows.filter(action => action.apply).length,
    bySeverity,
    byCategory,
  };
}

export function buildDesignCoachActions(context = {}, options = {}) {
  const report = context.projectReport || context.report || {};
  const studies = context.studies || report.studies || {};
  const approvals = context.approvals || {};
  const rawActions = [
    ...asArray(context.drcFindings || context.drcResult?.findings).filter(finding => !finding.isAccepted).map(drcAction),
    ...validationActions(report),
    ...racewayFillActions(report),
      ...clashActions(report),
      ...heatTraceActions(report),
      ...shortCircuitStudyActions(report, studies),
      ...arcFlashStudyActions(report, studies),
      ...motorStartStudyActions(report, studies),
      ...harmonicStudyActions(report, studies),
      ...capacitorBankDutyActions(report, studies),
      ...reliabilityNetworkActions(report, studies),
      ...transientStabilityActions(report, studies),
      ...ibrPlantControllerActions(report, studies),
      ...emfExposureActions(report, studies),
      ...cathodicProtectionNetworkActions(report, studies),
      ...protectionSettingSheetActions(report, studies),
      ...loadDemandGovernanceActions(report, studies),
      ...transformerFeederSizingActions(report, studies),
      ...voltageDropStudyActions(report, studies),
      ...voltageFlickerActions(report, studies),
      ...pullConstructabilityActions(report, studies),
      ...racewayConstructionActions(report),
      ...equipmentEvaluationActions(report),
      ...advancedGroundingActions(report),
      ...cableThermalEnvironmentActions(report),
      ...loadFlowStudyActions(report, studies),
    ...optimalPowerFlowActions(report),
    ...productCatalogActions(report),
    ...pricingFeedGovernanceActions(report),
    ...cloudLibraryGovernanceActions(report),
    ...fieldCommissioningActions(report),
    ...bimRoundTripActions(report),
      ...bimConnectorReadinessActions(report),
      ...nativeBimConnectorKitActions(report),
      ...revitSyncReadinessActions(report),
      ...revitNativeSyncActions(report),
      ...autocadSyncReadinessActions(report),
      ...autocadNativeSyncActions(report),
      ...plantCadSyncReadinessActions(report),
      ...plantCadNativeSyncActions(report),
      ...bimObjectLibraryActions(report),
    ...studyWarningActions(studies),
    ...approvalActions(studies, approvals),
    ...lifecycleActions(context.lifecycle || report.lifecycle || {}, report),
  ];
  const actions = dedupeDesignCoachActions(rawActions);
  return options.includeDecided
    ? rankDesignCoachActions(actions)
    : filterDesignCoachActions(actions, context.decisions || []);
}

export function buildDesignCoachPackage({ context = {}, decisions = [] } = {}) {
  const generatedAt = context.generatedAt || new Date().toISOString();
  const actions = buildDesignCoachActions({ ...context, decisions });
  return {
    version: DESIGN_COACH_VERSION,
    generatedAt,
    summary: summarizeDesignCoachActions(actions),
    actions,
    decisions: asArray(decisions),
    warnings: [],
    assumptions: [
      'Design coach actions are deterministic screening recommendations built from local project data.',
      'Only allowlisted maintenance actions can be applied automatically; engineering design changes require user review.',
      'Existing study and page-level validation remains authoritative for detailed calculations.',
    ],
  };
}
