import { toCSV } from './reporting.mjs';

const DEFAULT_SECTIONS = [
  'cover',
  'lifecycle',
  'designCoach',
  'productCatalog',
  'fieldCommissioning',
  'bimRoundTrip',
  'bimConnectorReadiness',
  'shortCircuit',
  'arcFlash',
  'motorStart',
  'harmonicStudy',
  'capacitorBankDuty',
  'reliabilityNetwork',
  'transientStability',
  'protectionSettingSheets',
  'loadDemandGovernance',
  'transformerFeederSizing',
  'voltageDropStudy',
  'pullConstructability',
  'racewayConstruction',
  'equipmentEvaluation',
  'advancedGrounding',
  'cableThermalEnvironment',
  'loadFlow',
  'optimalPowerFlow',
  'executiveSummary',
  'cableSchedule',
  'racewayFill',
  'clashDetection',
  'spoolSheets',
  'heatTraceBranchSchedule',
  'heatTrace',
  'heatTraceControllers',
  'heatTraceBOM',
  'heatTraceAdvanced',
  'validation',
  'appendices',
];

const SECTION_META = {
  cover: {
    title: 'Cover Sheet',
    discipline: 'Project Controls',
    deliverableType: 'Cover',
  },
  executiveSummary: {
    title: 'Executive Summary',
    discipline: 'Engineering',
    deliverableType: 'Narrative',
  },
  lifecycle: {
    title: 'Lifecycle Package Lineage',
    discipline: 'Project Controls',
    deliverableType: 'Release Record',
  },
  designCoach: {
    title: 'Design Coach Actions',
    discipline: 'Engineering',
    deliverableType: 'Action Register',
    fileName: 'data/design_coach_actions.csv',
  },
  productCatalog: {
    title: 'Product Catalog Governance',
    discipline: 'Project Controls',
    deliverableType: 'Approved Catalog Register',
    fileName: 'data/product_catalog_governance.csv',
  },
  fieldCommissioning: {
    title: 'Field Verification',
    discipline: 'Construction',
    deliverableType: 'Field Observation Register',
    fileName: 'data/field_verification.csv',
  },
  bimRoundTrip: {
    title: 'BIM Coordination',
    discipline: 'Coordination',
    deliverableType: 'BIM Reconciliation Register',
    fileName: 'data/bim_quantity_reconciliation.csv',
  },
  bimConnectorReadiness: {
    title: 'BIM/CAD Connector Readiness',
    discipline: 'Coordination',
    deliverableType: 'Connector Exchange Register',
    fileName: 'data/bim_connector_readiness.csv',
  },
  shortCircuit: {
    title: 'Short-Circuit Study Basis',
    discipline: 'Electrical',
    deliverableType: 'Study Case',
    fileName: 'data/short_circuit_duty_rows.csv',
  },
  arcFlash: {
    title: 'Arc Flash Study Basis',
    discipline: 'Electrical',
    deliverableType: 'Study Case',
    fileName: 'data/arc_flash_scenario_comparison.csv',
  },
  motorStart: {
    title: 'Motor Start Study Basis',
    discipline: 'Electrical Power System',
    deliverableType: 'Study Case',
    fileName: 'data/motor_start_worst_cases.csv',
  },
  harmonicStudy: {
    title: 'Harmonic Study Basis',
    discipline: 'Power Quality',
    deliverableType: 'Study Case',
    fileName: 'data/harmonic_study_compliance.csv',
  },
  capacitorBankDuty: {
    title: 'Capacitor Bank Duty and Switching Basis',
    discipline: 'Power Quality',
    deliverableType: 'Duty / Switching Package',
    fileName: 'data/capacitor_bank_duty.csv',
  },
  reliabilityNetwork: {
    title: 'Reliability Network Model and Customer Indices',
    discipline: 'Electrical Reliability',
    deliverableType: 'Reliability Indices Package',
    fileName: 'data/reliability_network.csv',
  },
  transientStability: {
    title: 'Transient Stability Study Basis',
    discipline: 'Electrical Stability',
    deliverableType: 'Dynamic Screening Package',
    fileName: 'data/transient_stability.csv',
  },
  protectionSettingSheets: {
    title: 'Protection Setting Sheets',
    discipline: 'Electrical Protection',
    deliverableType: 'Setting Register',
    fileName: 'data/protection_setting_sheets.csv',
  },
  loadDemandGovernance: {
    title: 'Panel and Load Demand Basis',
    discipline: 'Electrical',
    deliverableType: 'Demand Governance Register',
    fileName: 'data/load_demand_governance.csv',
  },
  transformerFeederSizing: {
    title: 'Transformer and Feeder Sizing Basis',
    discipline: 'Electrical',
    deliverableType: 'Sizing Audit Package',
    fileName: 'data/transformer_feeder_sizing.csv',
  },
  voltageDropStudy: {
    title: 'Voltage Drop Study Basis',
    discipline: 'Electrical',
    deliverableType: 'Study Case',
    fileName: 'data/voltage_drop_study.csv',
  },
  pullConstructability: {
    title: 'Cable Pull Constructability',
    discipline: 'Construction',
    deliverableType: 'Pulling Screening Package',
    fileName: 'data/pull_constructability.csv',
  },
  racewayConstruction: {
    title: 'Raceway Construction Details',
    discipline: 'Construction',
    deliverableType: 'Construction Detail / Takeoff',
    fileName: 'data/raceway_construction_details.csv',
  },
  equipmentEvaluation: {
    title: 'Equipment Evaluation',
    discipline: 'Electrical',
    deliverableType: 'Compliance Inventory',
    fileName: 'data/equipment_evaluation.csv',
  },
  advancedGrounding: {
    title: 'Advanced Grounding Hazard Map',
    discipline: 'Electrical Grounding',
    deliverableType: 'Screening Package',
    fileName: 'data/advanced_grounding_risk_points.csv',
  },
  cableThermalEnvironment: {
    title: 'Cable Thermal Environment',
    discipline: 'Electrical',
    deliverableType: 'Thermal Screening',
    fileName: 'data/cable_thermal_environment.csv',
  },
  loadFlow: {
    title: 'Load Flow Study Basis',
    discipline: 'Electrical Power System',
    deliverableType: 'Study Case',
    fileName: 'data/load_flow_voltage_profile.csv',
  },
  optimalPowerFlow: {
    title: 'Optimal Power Flow',
    discipline: 'Electrical Power System',
    deliverableType: 'Dispatch Screening',
    fileName: 'data/optimal_power_flow_dispatch.csv',
  },
  cableSchedule: {
    title: 'Cable Schedule',
    discipline: 'Electrical',
    deliverableType: 'Schedule',
    fileName: 'data/cable_schedule.csv',
  },
  racewayFill: {
    title: 'Raceway Fill Analysis',
    discipline: 'Electrical',
    deliverableType: 'Calculation',
    fileName: 'data/raceway_fill.csv',
  },
  clashDetection: {
    title: 'Clash Detection Register',
    discipline: 'Coordination',
    deliverableType: 'Register',
    fileName: 'data/clash_register.csv',
  },
  spoolSheets: {
    title: 'Spool Sheets Summary',
    discipline: 'Construction',
    deliverableType: 'Fabrication Summary',
    fileName: 'data/spool_summary.csv',
  },
  heatTraceBranchSchedule: {
    title: 'Heat Trace Branch Schedule',
    discipline: 'Electrical Heat Trace',
    deliverableType: 'Schedule',
    fileName: 'data/heat_trace_branch_schedule.csv',
  },
  heatTrace: {
    title: 'Heat Trace Line List',
    discipline: 'Electrical Heat Trace',
    deliverableType: 'Schedule',
    fileName: 'data/heat_trace_line_list.csv',
  },
  heatTraceControllers: {
    title: 'Heat Trace Controller Schedule',
    discipline: 'Electrical Heat Trace',
    deliverableType: 'Schedule',
    fileName: 'data/heat_trace_controller_schedule.csv',
  },
  heatTraceBOM: {
    title: 'Heat Trace BOM',
    discipline: 'Electrical Heat Trace',
    deliverableType: 'Bill of Materials',
    fileName: 'data/heat_trace_bom.csv',
  },
  heatTraceAdvanced: {
    title: 'Heat Trace Advanced Assets and Controls',
    discipline: 'Electrical Heat Trace',
    deliverableType: 'Control / Asset Register',
    fileName: 'data/heat_trace_advanced_assets.csv',
  },
  validation: {
    title: 'Validation and Exceptions',
    discipline: 'Quality',
    deliverableType: 'Exception Register',
    fileName: 'data/validation_exceptions.csv',
  },
  appendices: {
    title: 'Appendices',
    discipline: 'Quality',
    deliverableType: 'Reference',
  },
};

function slug(value = '') {
  return String(value || 'untitled')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function nowIso(options = {}) {
  return options.generatedAt || new Date().toISOString();
}

function normalizeStatus(status = 'ready') {
  if (['fail', 'failed', 'error', 'over', 'blocked'].includes(status)) return 'action-required';
  if (['warn', 'warning', 'near', 'review'].includes(status)) return 'review';
  if (['notRun', 'not-run', 'missing'].includes(status)) return 'not-run';
  return 'ready';
}

function flattenRacewayRows(report = {}) {
  const trayRows = asArray(report.fill?.trays).map(row => ({
    raceway: row.id,
    class: 'Tray',
    type: row.type,
    areaIn2: row.areaIn2,
    fillIn2: row.fillIn2,
    usedPct: row.usedPct,
    limitPct: row.limitPct,
    status: row.status,
  }));
  const conduitRows = asArray(report.fill?.conduits).map(row => ({
    raceway: row.id,
    class: 'Conduit',
    type: row.type,
    areaIn2: row.areaIn2,
    fillIn2: row.fillIn2,
    usedPct: row.usedPct,
    limitPct: row.limitPct,
    status: row.status,
  }));
  return [...trayRows, ...conduitRows];
}

function validationRows(report = {}) {
  return asArray(report.validation?.warnings).flatMap(warning => {
    const items = asArray(warning.items);
    if (!items.length) {
      return [{
        severity: warning.severity || 'warning',
        message: warning.message || '',
        item: '',
      }];
    }
    return items.map(item => ({
      severity: warning.severity || 'warning',
      message: warning.message || '',
      item,
    }));
  });
}

function sectionStatus(id, report = {}) {
  if (id === 'racewayFill') {
    if ((report.fill?.summary?.overCount || 0) > 0) return 'action-required';
    if ((report.fill?.summary?.nearCount || 0) > 0) return 'review';
  }
  if (id === 'clashDetection') {
    return normalizeStatus(report.clashes?.severity || 'ready');
  }
  if (id === 'heatTrace' || id === 'heatTraceBranchSchedule') {
    const warnings = asArray(report.heatTrace?.warnings).length;
    const overLimit = report.heatTrace?.branchSchedule?.summary?.overLimitCount || 0;
    const packageWarnings = report.heatTrace?.installationPackage?.summary?.warningCount || 0;
    if (overLimit > 0) return 'action-required';
    if (warnings > 0 || packageWarnings > 0) return 'review';
  }
  if (id === 'heatTraceControllers' || id === 'heatTraceBOM') {
    return report.heatTrace?.installationPackage?.summary?.warningCount > 0 ? 'review' : 'ready';
  }
  if (id === 'heatTraceAdvanced') {
    const summary = report.heatTrace?.advancedPackage?.summary || {};
    if ((summary.fail || 0) > 0 || (summary.missingData || 0) > 0) return 'action-required';
    if ((summary.warn || 0) > 0 || (summary.warningCount || 0) > 0) return 'review';
    return summary.assetCount > 0 ? 'ready' : 'not-run';
  }
  if (id === 'validation') {
    return report.validation?.pass === false ? 'review' : 'ready';
  }
  if (id === 'equipmentEvaluation') {
    if ((report.equipmentEvaluation?.summary?.fail || 0) > 0) return 'action-required';
    if ((report.equipmentEvaluation?.summary?.warn || 0) > 0 || (report.equipmentEvaluation?.summary?.missingData || 0) > 0) return 'review';
  }
  if (id === 'shortCircuit') {
    if (!report.shortCircuit?.studyCase) return 'review';
    if ((report.shortCircuit?.summary?.missingData || 0) > 0) return 'review';
    if ((report.shortCircuit?.summary?.review || 0) > 0 || asArray(report.shortCircuit?.warnings).length > 0) return 'review';
  }
  if (id === 'arcFlash') {
    if (!report.arcFlash?.studyCase) return 'review';
    if ((report.arcFlash?.summary?.dangerCount || 0) > 0) return 'action-required';
    if ((report.arcFlash?.summary?.highEnergyCount || 0) > 0
      || (report.arcFlash?.summary?.defaultedInputCount || 0) > 0
      || (report.arcFlash?.summary?.missingInputCount || 0) > 0
      || asArray(report.arcFlash?.warnings).length > 0) return 'review';
  }
  if (id === 'motorStart') {
    if (!report.motorStart?.studyCase) return 'review';
    if ((report.motorStart?.summary?.failCount || 0) > 0) return 'action-required';
    if ((report.motorStart?.summary?.warnCount || 0) > 0
      || (report.motorStart?.summary?.missingInputCount || 0) > 0
      || (report.motorStart?.summary?.defaultedInputCount || 0) > 0
      || asArray(report.motorStart?.warnings).length > 0) return 'review';
  }
  if (id === 'harmonicStudy') {
    if (!report.harmonicStudy?.studyCase) return 'review';
    if ((report.harmonicStudy?.summary?.fail || 0) > 0) return 'action-required';
    if ((report.harmonicStudy?.summary?.warn || 0) > 0
      || (report.harmonicStudy?.summary?.missingData || 0) > 0
      || asArray(report.harmonicStudy?.warnings).length > 0) return 'review';
  }
  if (id === 'capacitorBankDuty') {
    if ((report.capacitorBankDuty?.summary?.fail || 0) > 0) return 'action-required';
    if ((report.capacitorBankDuty?.summary?.warn || 0) > 0
      || (report.capacitorBankDuty?.summary?.missingData || 0) > 0
      || (report.capacitorBankDuty?.summary?.warningCount || 0) > 0) return 'review';
  }
  if (id === 'reliabilityNetwork') {
    if ((report.reliabilityNetwork?.summary?.missingData || 0) > 0) return 'review';
    if ((report.reliabilityNetwork?.summary?.indexWarn || 0) > 0
      || (report.reliabilityNetwork?.summary?.warningCount || 0) > 0) return 'review';
  }
  if (id === 'transientStability') {
    if ((report.transientStability?.summary?.fail || 0) > 0) return 'action-required';
    if ((report.transientStability?.summary?.warn || 0) > 0
      || (report.transientStability?.summary?.warningCount || 0) > 0
      || (report.transientStability?.summary?.missingData || 0) > 0) return 'review';
  }
  if (id === 'protectionSettingSheets') {
    if ((report.protectionSettingSheets?.summary?.missingData || 0) > 0
      || asArray(report.protectionSettingSheets?.testRows).some(row => row.status === 'missingData' || row.status === 'fail')) return 'action-required';
    if ((report.protectionSettingSheets?.summary?.warn || 0) > 0
      || (report.protectionSettingSheets?.summary?.disabledFunctions || 0) > 0
      || asArray(report.protectionSettingSheets?.warnings).length > 0) return 'review';
  }
  if (id === 'loadDemandGovernance') {
    if ((report.loadDemandGovernance?.summary?.panelDemandFail || 0) > 0
      || (report.loadDemandGovernance?.summary?.phaseBalanceFail || 0) > 0) return 'action-required';
    if ((report.loadDemandGovernance?.summary?.warningCount || 0) > 0
      || (report.loadDemandGovernance?.summary?.phaseBalanceWarn || 0) > 0) return 'review';
  }
  if (id === 'transformerFeederSizing') {
    if ((report.transformerFeederSizing?.summary?.fail || 0) > 0) return 'action-required';
    if ((report.transformerFeederSizing?.summary?.warn || 0) > 0
      || (report.transformerFeederSizing?.summary?.missingData || 0) > 0
      || (report.transformerFeederSizing?.summary?.warningCount || 0) > 0) return 'review';
  }
  if (id === 'voltageDropStudy') {
    if ((report.voltageDropStudy?.summary?.fail || 0) > 0) return 'action-required';
    if ((report.voltageDropStudy?.summary?.warn || 0) > 0
      || (report.voltageDropStudy?.summary?.missingData || 0) > 0
      || (report.voltageDropStudy?.summary?.warningCount || 0) > 0) return 'review';
  }
  if (id === 'pullConstructability') {
    if ((report.pullConstructability?.summary?.fail || 0) > 0) return 'action-required';
    if ((report.pullConstructability?.summary?.warn || 0) > 0
      || (report.pullConstructability?.summary?.missingData || 0) > 0
      || asArray(report.pullConstructability?.warningRows).length > 0) return 'review';
  }
  if (id === 'racewayConstruction') {
    if ((report.racewayConstruction?.summary?.fail || 0) > 0
      || asArray(report.racewayConstruction?.warningRows).some(row => row.severity === 'error')) return 'action-required';
    if ((report.racewayConstruction?.summary?.warn || 0) > 0
      || asArray(report.racewayConstruction?.warningRows).length > 0) return 'review';
  }
  if (id === 'productCatalog') {
    if ((report.productCatalog?.summary?.duplicates || 0) > 0 || (report.productCatalog?.summary?.unapprovedUsage || 0) > 0) return 'review';
    if ((report.productCatalog?.summary?.stale || 0) > 0 || (report.productCatalog?.summary?.unapproved || 0) > 0) return 'review';
  }
  if (id === 'fieldCommissioning') {
    if ((report.fieldCommissioning?.summary?.rejected || 0) > 0) return 'action-required';
    if ((report.fieldCommissioning?.summary?.openItems || 0) > 0) return 'review';
  }
  if (id === 'bimRoundTrip') {
    if ((report.bimRoundTrip?.summary?.highPriorityIssues || 0) > 0) return 'action-required';
    if ((report.bimRoundTrip?.summary?.changedGroups || 0) > 0 || (report.bimRoundTrip?.summary?.openIssues || 0) > 0 || (report.bimRoundTrip?.summary?.unmappedCount || 0) > 0) return 'review';
  }
  if (id === 'bimConnectorReadiness') {
    if ((report.bimConnectorReadiness?.summary?.invalidCount || 0) > 0) return 'action-required';
    if ((report.bimConnectorReadiness?.summary?.staleCount || 0) > 0
      || (report.bimConnectorReadiness?.summary?.quantityDeltas || 0) > 0
      || (report.bimConnectorReadiness?.summary?.mappingDeltas || 0) > 0) return 'review';
  }
  if (id === 'advancedGrounding') {
    if ((report.advancedGrounding?.summary?.fail || 0) > 0) return 'action-required';
    if (report.advancedGrounding?.fieldFidelity?.summary?.status === 'fail') return 'action-required';
    if ((report.advancedGrounding?.summary?.warn || 0) > 0
      || (report.advancedGrounding?.summary?.missingData || 0) > 0
      || report.advancedGrounding?.summary?.soilFitStatus === 'poorFit'
      || ['warn', 'missingData'].includes(report.advancedGrounding?.fieldFidelity?.summary?.status)
      || asArray(report.advancedGrounding?.fieldFidelity?.warningRows).length > 0) return 'review';
  }
  if (id === 'cableThermalEnvironment') {
    if ((report.cableThermalEnvironment?.summary?.fail || 0) > 0) return 'action-required';
    if (asArray(report.cableThermalEnvironment?.cyclicRatingRows).some(row => row.status === 'fail')) return 'action-required';
    if ((report.cableThermalEnvironment?.summary?.warn || 0) > 0
      || (report.cableThermalEnvironment?.summary?.missingData || 0) > 0
      || asArray(report.cableThermalEnvironment?.advancedWarnings).length > 0
      || asArray(report.cableThermalEnvironment?.cyclicRatingRows).some(row => row.status === 'warn')) return 'review';
  }
  if (id === 'loadFlow') {
    if (report.loadFlow?.summary?.converged === false) return 'action-required';
    if ((report.loadFlow?.summary?.voltageViolationCount || 0) > 0
      || (report.loadFlow?.summary?.unbalanceFailCount || 0) > 0) return 'action-required';
    if ((report.loadFlow?.summary?.voltageWarningCount || 0) > 0
      || (report.loadFlow?.summary?.unbalanceWarnCount || 0) > 0
      || (report.loadFlow?.summary?.defaultedInputCount || 0) > 0
      || asArray(report.loadFlow?.warnings).length > 0) return 'review';
  }
  if (id === 'optimalPowerFlow') {
    if (report.optimalPowerFlow?.summary?.feasible === false
      || (report.optimalPowerFlow?.summary?.fail || 0) > 0
      || (report.optimalPowerFlow?.summary?.insufficientCapacity || 0) > 0) return 'action-required';
    if ((report.optimalPowerFlow?.summary?.warn || 0) > 0
      || (report.optimalPowerFlow?.summary?.missingData || 0) > 0) return 'review';
  }
  return 'ready';
}

function sectionRows(id, report = {}) {
  if (id === 'cableSchedule') return asArray(report.cables?.rows);
  if (id === 'racewayFill') return flattenRacewayRows(report);
  if (id === 'clashDetection') return asArray(report.clashes?.clashes);
  if (id === 'designCoach') return asArray(report.designCoach?.actions).map(action => ({
    severity: action.severity,
    category: action.category,
    title: action.title,
    recommendation: action.recommendation,
    pageHref: action.pageHref,
    sourceType: action.source?.type || '',
    fingerprint: action.fingerprint,
  }));
  if (id === 'productCatalog') return [
    ...asArray(report.productCatalog?.rows).map(row => ({
      manufacturer: row.manufacturer,
      catalogNumber: row.catalogNumber,
      category: row.category,
      description: row.description,
      approvalStatus: row.approvalStatus,
      approved: row.approved,
      lastVerified: row.lastVerified,
      source: row.source,
    })),
    ...asArray(report.productCatalog?.unapprovedUsage).map(row => ({
      manufacturer: row.manufacturer,
      catalogNumber: row.catalogNumber,
      category: row.category,
      description: row.message,
      approvalStatus: row.status,
      approved: false,
      lastVerified: '',
      source: row.source,
    })),
  ];
  if (id === 'fieldCommissioning') return asArray(report.fieldCommissioning?.observations).map(row => ({
    elementType: row.elementType,
    elementId: row.elementId,
    elementTag: row.elementTag,
    observationType: row.observationType,
    status: row.status,
    priority: row.priority,
    comments: row.comments,
    attachmentCount: asArray(row.attachments).length,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
  if (id === 'bimRoundTrip') return asArray(report.bimRoundTrip?.quantityReconciliation?.rows).map(row => ({
    elementType: row.elementType,
    system: row.system,
    voltageClass: row.voltageClass,
    level: row.level,
    area: row.area,
    projectQuantity: row.projectQuantity,
    bimQuantity: row.bimQuantity,
    delta: row.delta,
    deltaPct: row.deltaPct,
    status: row.status,
    recommendation: row.recommendation,
  }));
  if (id === 'bimConnectorReadiness') return asArray(report.bimConnectorReadiness?.packages).map(row => ({
    connectorType: row.connectorType,
    sourceApplication: row.sourceApplication,
    sourceVersion: row.sourceVersion,
    scenario: row.scenario,
    createdAt: row.createdAt,
    elementCount: asArray(row.elements).length,
    issueCount: asArray(row.issues).length,
    warningCount: asArray(row.warnings).length,
    id: row.id,
  }));
  if (id === 'shortCircuit') return asArray(report.shortCircuit?.dutyRows).map(row => ({
    busId: row.busId,
    busTag: row.busTag,
    method: row.method,
    voltageCase: row.voltageCase,
    prefaultKV: row.prefaultKV,
    threePhaseKA: row.threePhaseKA,
    lineToGroundKA: row.lineToGroundKA,
    lineToLineKA: row.lineToLineKA,
    doubleLineGroundKA: row.doubleLineGroundKA,
    dutyBasis: row.dutyBasis,
    dutyValueKA: row.dutyValueKA,
    equipmentDutySide: row.equipmentDutySide,
    status: row.status,
    warnings: asArray(row.warnings).join('; '),
  }));
  if (id === 'arcFlash') return asArray(report.arcFlash?.scenarioComparison).map(row => ({
    scenarioId: row.scenarioId,
    scenarioName: row.scenarioName,
    equipmentId: row.equipmentId,
    equipmentTag: row.equipmentTag,
    incidentEnergy: row.incidentEnergy,
    baselineIncidentEnergy: row.baselineIncidentEnergy,
    deltaIncidentEnergy: row.deltaIncidentEnergy,
    ppeCategory: row.ppeCategory,
    baselinePpeCategory: row.baselinePpeCategory,
    boundary: row.boundary,
    deltaBoundary: row.deltaBoundary,
    clearingTime: row.clearingTime,
    labelReady: row.labelReady,
    status: row.status,
    recommendation: row.recommendation,
  }));
  if (id === 'motorStart') return asArray(report.motorStart?.worstCaseRows).map(row => ({
    motorId: row.motorId,
    motorTag: row.motorTag,
    busId: row.busId,
    starterType: row.starterType,
    startTimeSec: row.startTimeSec,
    inrushKA: row.inrushKA,
    maxStartingCurrentKA: row.maxStartingCurrentKA,
    minVoltagePu: row.minVoltagePu,
    voltageSagPct: row.voltageSagPct,
    accelTimeSec: row.accelTimeSec,
    torqueMarginPct: row.torqueMarginPct,
    status: row.status,
    recommendation: row.recommendation,
  }));
  if (id === 'harmonicStudy') return [
    ...asArray(report.harmonicStudy?.complianceRows).map(row => ({
      recordType: 'compliance',
      sourceTag: row.sourceTag,
      sourceId: row.sourceId,
      pccTag: row.pccTag,
      checkType: row.checkType,
      actualValue: row.actualValue,
      limitValue: row.limitValue,
      margin: row.margin,
      status: row.status,
      iscIlRatio: row.iscIlRatio,
      demandCurrentA: row.demandCurrentA,
      recommendation: row.recommendation,
    })),
    ...asArray(report.harmonicStudy?.filterAlternatives).map(row => ({
      recordType: 'filterAlternative',
      sourceTag: row.name,
      sourceId: row.id,
      pccTag: report.harmonicStudy?.studyCase?.pccTag || report.harmonicStudy?.studyCase?.pccBus || '',
      checkType: row.filterType,
      actualValue: row.expectedThdReductionPct,
      limitValue: asArray(row.targetHarmonics).join(', '),
      margin: row.frequencyScanResonanceRisk,
      status: row.status,
      iscIlRatio: '',
      demandCurrentA: '',
      recommendation: row.recommendation,
    })),
    ...asArray(report.harmonicStudy?.warnings).map(row => ({
      recordType: 'warning',
      sourceTag: row.sourceTag || '',
      sourceId: row.sourceId || '',
      pccTag: report.harmonicStudy?.studyCase?.pccTag || report.harmonicStudy?.studyCase?.pccBus || '',
      checkType: row.code || 'warning',
      actualValue: '',
      limitValue: '',
      margin: row.severity || 'warning',
      status: row.severity || 'warning',
      iscIlRatio: '',
      demandCurrentA: '',
      recommendation: row.message || row,
    })),
  ];
  if (id === 'capacitorBankDuty') return [
    ...asArray(report.capacitorBankDuty?.stageRows).map(row => ({
      recordType: 'stage',
      stageId: row.id,
      label: row.label,
      checkType: '',
      actualValue: row.kvar,
      limitValue: row.voltageRatingKv,
      unit: 'kVAR/kV',
      status: row.enabled ? 'enabled' : 'disabled',
      recommendation: row.notes,
    })),
    ...asArray(report.capacitorBankDuty?.dutyRows).map(row => ({
      recordType: 'duty',
      stageId: row.stageId,
      label: row.stageLabel,
      checkType: row.checkType,
      actualValue: row.actualValue,
      limitValue: row.limitValue,
      unit: row.unit,
      status: row.status,
      recommendation: row.recommendation,
    })),
    ...asArray(report.capacitorBankDuty?.protectionRows).map(row => ({
      recordType: 'protection',
      stageId: row.id,
      label: row.deviceTags,
      checkType: row.protectionType,
      actualValue: row.ctRatio,
      limitValue: row.stageCount,
      unit: '',
      status: row.status,
      recommendation: row.recommendation,
    })),
    ...asArray(report.capacitorBankDuty?.switchingRows).map(row => ({
      recordType: 'switching',
      stageId: row.stageId,
      label: row.stageLabel,
      checkType: row.switchingDevice,
      actualValue: row.estimatedInrushA,
      limitValue: row.inrushLimitA,
      unit: 'A',
      status: row.status,
      recommendation: row.recommendation,
    })),
    ...asArray(report.capacitorBankDuty?.warningRows).map(row => ({
      recordType: 'warning',
      stageId: row.sourceId || '',
      label: row.code,
      checkType: row.code,
      actualValue: '',
      limitValue: '',
      unit: '',
      status: row.severity,
      recommendation: row.message,
    })),
  ];
  if (id === 'reliabilityNetwork') return [
    ...asArray(report.reliabilityNetwork?.indexRows).map(row => ({
      recordType: 'index',
      id: row.id,
      label: row.label,
      componentTag: '',
      value: row.value,
      unit: row.unit,
      customerCount: '',
      loadKw: '',
      status: row.status,
      recommendation: '',
    })),
    ...asArray(report.reliabilityNetwork?.scenarioRows).map(row => ({
      recordType: 'scenario',
      id: row.id,
      label: row.scenarioType,
      componentTag: row.componentTag,
      value: row.customerHours,
      unit: 'customer-hours',
      customerCount: row.affectedCustomerCount,
      loadKw: row.affectedLoadKw,
      status: row.status,
      recommendation: row.recommendation,
    })),
    ...asArray(report.reliabilityNetwork?.contributorRows).map(row => ({
      recordType: 'contributor',
      id: row.id,
      label: row.rank,
      componentTag: row.componentTag,
      value: row.energyNotServedKwh,
      unit: 'kWh/year',
      customerCount: row.customerInterruptions,
      loadKw: '',
      status: row.status,
      recommendation: row.protectionZone,
    })),
    ...asArray(report.reliabilityNetwork?.warningRows).map(row => ({
      recordType: 'warning',
      id: row.sourceId || row.code,
      label: row.code,
      componentTag: '',
      value: '',
      unit: '',
      customerCount: '',
      loadKw: '',
      status: row.severity,
      recommendation: row.message,
    })),
  ];
  if (id === 'transientStability') return [
    ...asArray(report.transientStability?.scenarioRows).map(row => ({
      recordType: 'scenario',
      id: row.id,
      label: row.modelTag,
      eventType: '',
      timeSec: '',
      clearingTimeSec: row.clearingTimeSec,
      cctSec: row.cctSec,
      cctMarginSec: row.cctMarginSec,
      maxRotorAngleDeg: row.maxRotorAngleDeg,
      status: row.status,
      recommendation: row.recommendation,
    })),
    ...asArray(report.transientStability?.cctSweepRows).map(row => ({
      recordType: 'cctSweep',
      id: row.id,
      label: row.modelTag,
      eventType: '',
      timeSec: '',
      clearingTimeSec: row.clearingTimeSec,
      cctSec: row.cctSec,
      cctMarginSec: row.marginSec,
      maxRotorAngleDeg: '',
      status: row.status,
      recommendation: row.recommendation,
    })),
    ...asArray(report.transientStability?.disturbanceEventRows).map(row => ({
      recordType: 'event',
      id: row.id,
      label: row.label,
      eventType: row.eventType,
      timeSec: row.timeSec,
      clearingTimeSec: row.clearingTimeSec || '',
      cctSec: '',
      cctMarginSec: '',
      maxRotorAngleDeg: '',
      status: row.enabled === false ? 'disabled' : 'enabled',
      recommendation: row.notes,
    })),
    ...asArray(report.transientStability?.warningRows).map(row => ({
      recordType: 'warning',
      id: row.sourceId || row.code,
      label: row.code,
      eventType: '',
      timeSec: '',
      clearingTimeSec: '',
      cctSec: '',
      cctMarginSec: '',
      maxRotorAngleDeg: '',
      status: row.severity,
      recommendation: row.message,
    })),
  ];
  if (id === 'protectionSettingSheets') return [
    ...asArray(report.protectionSettingSheets?.deviceRows).map(row => ({
      recordType: 'device',
      deviceTag: row.deviceTag,
      componentId: row.componentId,
      functionCode: '',
      catalogDeviceId: row.catalogDeviceId,
      ctPrimaryA: row.ctPrimaryA,
      ctSecondaryA: row.ctSecondaryA,
      pickupA: '',
      secondaryA: '',
      expectedTripSec: '',
      status: row.status,
      recommendation: row.recommendation,
    })),
    ...asArray(report.protectionSettingSheets?.functionRows).map(row => ({
      recordType: 'function',
      deviceTag: row.deviceTag,
      componentId: row.componentId,
      functionCode: row.functionCode,
      catalogDeviceId: '',
      ctPrimaryA: '',
      ctSecondaryA: '',
      pickupA: row.pickupA,
      secondaryA: row.secondaryPickupA,
      expectedTripSec: '',
      status: row.status,
      recommendation: row.recommendation,
    })),
    ...asArray(report.protectionSettingSheets?.testRows).map(row => ({
      recordType: 'test',
      deviceTag: row.deviceTag,
      componentId: row.componentId,
      functionCode: row.functionCode,
      catalogDeviceId: '',
      ctPrimaryA: '',
      ctSecondaryA: '',
      pickupA: row.testCurrentPrimaryA,
      secondaryA: row.secondaryInjectionA,
      expectedTripSec: row.expectedTripSec,
      status: row.status,
      recommendation: row.recommendation,
    })),
  ];
  if (id === 'loadDemandGovernance') return [
    ...asArray(report.loadDemandGovernance?.loadRows).map(row => ({
      recordType: 'load',
      tag: row.tag,
      source: row.source,
      group: row.noncoincidentGroup,
      loadClass: row.loadClass,
      continuous: row.continuous,
      connectedKw: row.connectedKw,
      demandKw: row.demandKw,
      governedDemandKw: row.governedDemandKw,
      governedDemandKva: row.governedDemandKva,
      status: row.status,
      warning: asArray(row.warnings).map(item => item.code || item.message).join('; '),
    })),
    ...asArray(report.loadDemandGovernance?.panelRows).map(row => ({
      recordType: 'panel',
      tag: row.panelTag,
      source: row.serviceGroup,
      group: row.serviceGroup,
      loadClass: '',
      continuous: '',
      connectedKw: row.connectedKw,
      demandKw: row.governedDemandKw,
      governedDemandKw: row.governedDemandKw,
      governedDemandKva: row.governedDemandKva,
      status: row.status,
      warning: asArray(row.warnings).map(item => item.code || item.message).join('; '),
    })),
    ...asArray(report.loadDemandGovernance?.warnings).map(row => ({
      recordType: 'warning',
      tag: row.source?.id || row.source?.panelId || '',
      source: row.source?.panelId || '',
      group: '',
      loadClass: '',
      continuous: '',
      connectedKw: '',
      demandKw: '',
      governedDemandKw: '',
      governedDemandKva: '',
      status: row.severity,
      warning: row.message || row.code || row,
    })),
  ];
  if (id === 'transformerFeederSizing') return [
    ...asArray(report.transformerFeederSizing?.transformerRows).map(row => ({
      recordType: 'transformer',
      caseName: row.caseName,
      loadSource: row.loadSource,
      designKva: row.designKva,
      selectedKva: row.selectedKva,
      loadPct: row.loadPct,
      conductorSize: '',
      installedAmpacityA: '',
      ocpdRatingA: '',
      status: row.status,
      warning: row.recommendation,
    })),
    ...asArray(report.transformerFeederSizing?.feederRows).map(row => ({
      recordType: 'feeder',
      caseName: row.caseName,
      loadSource: row.loadSource,
      designKva: row.designKva,
      selectedKva: '',
      loadPct: '',
      conductorSize: row.conductorSize,
      installedAmpacityA: row.installedAmpacityA,
      ocpdRatingA: row.ocpdRatingA,
      status: row.status,
      warning: row.recommendation,
    })),
    ...asArray(report.transformerFeederSizing?.alternativeRows).map(row => ({
      recordType: row.recordType,
      caseName: '',
      loadSource: '',
      designKva: row.kva || '',
      selectedKva: row.configuration || '',
      loadPct: row.loadPct || '',
      conductorSize: row.conductorSize || '',
      installedAmpacityA: row.installedAmpacityA || '',
      ocpdRatingA: '',
      status: row.status,
      warning: row.reason,
    })),
    ...asArray(report.transformerFeederSizing?.warningRows).map(row => ({
      recordType: 'warning',
      caseName: '',
      loadSource: '',
      designKva: '',
      selectedKva: '',
      loadPct: '',
      conductorSize: '',
      installedAmpacityA: '',
      ocpdRatingA: '',
      status: row.severity,
      warning: row.message || row.code || row,
    })),
  ];
  if (id === 'voltageDropStudy') return [
    ...asArray(report.voltageDropStudy?.rows).map(row => ({
      recordType: 'criteriaRow',
      tag: row.tag,
      from: row.from,
      to: row.to,
      caseType: row.caseType,
      circuitType: row.circuitType,
      lengthFt: row.lengthFt,
      currentA: row.currentA,
      voltageV: row.voltageV,
      dropPct: row.dropPct,
      applicableLimitPct: row.applicableLimitPct,
      totalChainDropPct: row.totalChainDropPct,
      startVoltagePu: row.startVoltagePu,
      status: row.status,
      reason: row.reason,
      recommendation: row.recommendation,
    })),
    ...asArray(report.voltageDropStudy?.segmentRows).map(row => ({
      recordType: 'segment',
      tag: row.cableTag,
      from: '',
      to: '',
      caseType: row.caseType,
      circuitType: '',
      lengthFt: '',
      currentA: '',
      voltageV: '',
      dropPct: '',
      applicableLimitPct: row.totalLimitPct,
      totalChainDropPct: row.totalChainDropPct,
      startVoltagePu: '',
      status: row.status,
      reason: row.segmentChainBasisNote,
      recommendation: '',
    })),
    ...asArray(report.voltageDropStudy?.warningRows).map(row => ({
      recordType: 'warning',
      tag: row.sourceId || '',
      from: '',
      to: '',
      caseType: '',
      circuitType: '',
      lengthFt: '',
      currentA: '',
      voltageV: '',
      dropPct: '',
      applicableLimitPct: '',
      totalChainDropPct: '',
      startVoltagePu: '',
      status: row.severity,
      reason: row.message,
      recommendation: row.code,
    })),
  ];
  if (id === 'pullConstructability') return [
    ...asArray(report.pullConstructability?.pullRows).map(row => ({
      recordType: 'pull',
      pullNumber: row.pullNumber,
      cableTags: row.cableTags,
      recommendedDirection: row.recommendedDirection,
      status: row.status,
      maxTensionLbs: row.maxTensionLbs,
      tensionLimitLbs: row.tensionLimitLbs,
      tensionMarginPct: row.tensionMarginPct,
      maxSidewallPressureLbsPerFt: row.maxSidewallPressureLbsPerFt,
      sidewallMarginPct: row.sidewallMarginPct,
      warningCount: row.warningCount,
    })),
    ...asArray(report.pullConstructability?.warningRows).map(row => ({
      recordType: 'warning',
      pullNumber: row.pullNumber,
      cableTags: '',
      recommendedDirection: '',
      status: row.severity,
      maxTensionLbs: '',
      tensionLimitLbs: '',
      tensionMarginPct: '',
      maxSidewallPressureLbsPerFt: '',
      sidewallMarginPct: '',
      warningCount: row.message,
    })),
  ];
  if (id === 'racewayConstruction') return [
    ...asArray(report.racewayConstruction?.detailRows).map(row => ({
      recordType: 'detail',
      racewayId: row.racewayId,
      racewayType: row.racewayType,
      lengthFt: row.lengthFt,
      supportFamily: row.supportFamily,
      supportType: row.supportType,
      supportSpacingFt: row.supportSpacingFt,
      dividerLane: row.dividerLane,
      constructionPhase: row.constructionPhase,
      constructionStatus: row.constructionStatus,
      drawingRef: row.drawingRef,
      detailRef: row.detailRef,
      labelId: row.labelId,
      sectionRef: row.sectionRef,
      installArea: row.installArea,
      status: row.status,
      warnings: asArray(row.warnings).join('; '),
    })),
    ...asArray(report.racewayConstruction?.accessoryTakeoffRows).map(row => ({
      recordType: 'takeoff',
      racewayId: asArray(row.racewayIds).join(', '),
      racewayType: row.racewayType,
      lengthFt: '',
      supportFamily: '',
      supportType: '',
      supportSpacingFt: '',
      dividerLane: '',
      constructionPhase: '',
      constructionStatus: '',
      drawingRef: '',
      detailRef: row.item,
      labelId: row.category,
      sectionRef: row.quantity,
      installArea: row.unit,
      status: row.source,
      warnings: row.basis,
    })),
    ...asArray(report.racewayConstruction?.warningRows).map(row => ({
      recordType: 'warning',
      racewayId: row.racewayId,
      racewayType: row.source?.racewayType || '',
      lengthFt: '',
      supportFamily: '',
      supportType: '',
      supportSpacingFt: '',
      dividerLane: '',
      constructionPhase: '',
      constructionStatus: '',
      drawingRef: '',
      detailRef: row.code,
      labelId: '',
      sectionRef: '',
      installArea: '',
      status: row.severity,
      warnings: row.message,
    })),
  ];
  if (id === 'equipmentEvaluation') return asArray(report.equipmentEvaluation?.rows);
  if (id === 'advancedGrounding') return [
    ...asArray(report.advancedGrounding?.riskPoints).map(point => ({
      recordType: 'riskPoint',
      label: point.label,
      check: point.check,
      actualV: point.actualV,
      limitV: point.limitV,
      marginPct: point.marginPct,
      status: point.status,
      source: point.source,
      recommendation: point.recommendation,
    })),
    ...(report.advancedGrounding?.fieldFidelity?.measurementCoverage ? [{
      recordType: 'fieldCoverage',
      label: 'Soil measurement coverage',
      check: 'soilCoverage',
      actualV: report.advancedGrounding.fieldFidelity.measurementCoverage.spacingCoveragePct,
      limitV: 100,
      marginPct: '',
      status: report.advancedGrounding.fieldFidelity.measurementCoverage.status,
      source: 'fieldFidelity',
      recommendation: report.advancedGrounding.fieldFidelity.measurementCoverage.recommendation,
    }] : []),
    ...asArray(report.advancedGrounding?.fieldFidelity?.fallOfPotentialRows).map(row => ({
      recordType: 'fallOfPotential',
      label: row.testId,
      check: 'fieldResistance',
      actualV: row.measuredResistanceOhm,
      limitV: row.curveDeviationPct,
      marginPct: '',
      status: row.status,
      source: row.location || 'fieldFidelity',
      recommendation: row.recommendation,
    })),
    ...asArray(report.advancedGrounding?.fieldFidelity?.seasonalScenarios).map(row => ({
      recordType: 'seasonalSoil',
      label: row.label,
      check: 'seasonalRisk',
      actualV: row.rhoOhmM,
      limitV: row.multiplier,
      marginPct: '',
      status: row.status,
      source: 'fieldFidelity',
      recommendation: row.recommendation,
    })),
    ...asArray(report.advancedGrounding?.fieldFidelity?.warningRows).map(row => ({
      recordType: 'fieldWarning',
      label: row.category,
      check: row.severity,
      actualV: '',
      limitV: '',
      marginPct: '',
      status: row.severity,
      source: 'fieldFidelity',
      recommendation: row.message,
    })),
  ];
  if (id === 'cableThermalEnvironment') return [
    ...asArray(report.cableThermalEnvironment?.evaluations).map(row => ({
    recordType: 'evaluation',
    cableTag: row.cableTag,
    installationMethod: row.installationMethod,
    designCurrentA: row.designCurrentA,
    allowableAmpacityA: row.allowableAmpacityA,
    loadPct: row.loadPct,
    estimatedConductorTempC: row.estimatedConductorTempC,
    temperatureLimitC: row.temperatureLimitC,
    status: row.status,
    limitingFactor: row.limitingFactor,
    recommendation: row.recommendation,
    advancedWarnings: asArray(row.advancedWarnings).join('; '),
  })),
    ...asArray(report.cableThermalEnvironment?.emergencyProfiles).flatMap(profile => asArray(profile.points).map(point => ({
      recordType: 'emergencyProfile',
      cableTag: profile.cableTag,
      installationMethod: profile.installationMethod,
      designCurrentA: '',
      allowableAmpacityA: '',
      loadPct: point.loadPct,
      estimatedConductorTempC: point.estimatedConductorTempC,
      temperatureLimitC: '',
      status: point.status,
      limitingFactor: 'emergency/cyclic profile',
      recommendation: point.status === 'fail' ? 'Reduce emergency load or verify transient rating.' : 'Verify emergency profile assumptions.',
      advancedWarnings: point.notes,
    }))),
  ];
  if (id === 'loadFlow') return asArray(report.loadFlow?.phaseRows).map(row => ({
    busId: row.busId,
    busTag: row.busTag,
    phase: row.phase,
    busType: row.busType,
    Vm: row.Vm,
    Va: row.Va,
    voltageKV: row.voltageKV,
    loadKw: row.loadKw,
    loadKvar: row.loadKvar,
    generationKw: row.generationKw,
    generationKvar: row.generationKvar,
    status: row.status,
  }));
  if (id === 'optimalPowerFlow') return asArray(report.optimalPowerFlow?.dispatchRows).map(row => ({
    generatorId: row.generatorId,
    generatorTag: row.generatorTag,
    busId: row.busId,
    pMinKw: row.pMinKw,
    pMaxKw: row.pMaxKw,
    dispatchedKw: row.dispatchedKw,
    dispatchedKvar: row.dispatchedKvar,
    marginalCost: row.marginalCost,
    status: row.status,
    bindingConstraints: asArray(row.bindingConstraints).join('; '),
  }));
  if (id === 'spoolSheets') return asArray(report.spools?.spools);
  if (id === 'heatTraceBranchSchedule') return asArray(report.heatTrace?.branchSchedule?.rows);
  if (id === 'heatTrace') return asArray(report.heatTrace?.installationPackage?.lineList?.rows)
    .map(row => ({
      pipeTag: row.pipeTag,
      service: row.service,
      area: row.area,
      sourcePanel: row.sourcePanel,
      controllerTag: row.controllerTag,
      circuitNumber: row.circuitNumber,
      cableFamilyLabel: row.cableFamilyLabel,
      effectiveTraceLengthFt: row.effectiveTraceLengthFt,
      installedWatts: row.installedWatts,
      loadAmps: row.loadAmps,
      status: row.productSelectionStatus,
    }));
  if (id === 'heatTraceControllers') return asArray(report.heatTrace?.installationPackage?.controllerSchedule?.rows)
    .map(row => ({
      sourcePanel: row.sourcePanel,
      controllerTag: row.controllerTag,
      voltageV: row.voltageV,
      branchCount: row.branchCount,
      totalKw: row.totalKw,
      totalAmps: row.totalAmps,
      circuitNumbers: row.circuitNumbers,
      pipeTags: row.pipeTags,
    }));
  if (id === 'heatTraceBOM') return asArray(report.heatTrace?.installationPackage?.bom?.rows)
    .map(row => ({
      itemId: row.itemId,
      description: row.description,
      quantity: row.quantity,
      unit: row.unit,
      basis: row.basis,
      notes: row.notes,
    }));
  if (id === 'heatTraceAdvanced') return [
    ...asArray(report.heatTrace?.advancedPackage?.assetRows).map(row => ({
      recordType: 'asset',
      assetTag: row.assetTag,
      assetType: row.assetType,
      controllerTag: row.controllerTag,
      sourcePanel: row.sourcePanel,
      panelPhase: row.panelPhase,
      diversityGroup: row.diversityGroup,
      installedWatts: row.installedWatts,
      startupAmps: '',
      status: row.status,
      recommendation: row.recommendation,
    })),
    ...asArray(report.heatTrace?.advancedPackage?.segmentRows).map(row => ({
      recordType: 'segment',
      assetTag: row.assetTag,
      assetType: row.assetType,
      controllerTag: '',
      sourcePanel: '',
      panelPhase: '',
      diversityGroup: '',
      installedWatts: row.installedWatts,
      startupAmps: '',
      status: row.status,
      recommendation: row.recommendation,
    })),
    ...asArray(report.heatTrace?.advancedPackage?.startupProfileRows).map(row => ({
      recordType: 'startup',
      assetTag: row.assetTag,
      assetType: '',
      controllerTag: '',
      sourcePanel: '',
      panelPhase: '',
      diversityGroup: '',
      installedWatts: '',
      startupAmps: row.startupAmps,
      status: row.status,
      recommendation: row.recommendation,
    })),
    ...asArray(report.heatTrace?.advancedPackage?.controlRows).map(row => ({
      recordType: 'control',
      assetTag: row.assetTag,
      assetType: '',
      controllerTag: row.controllerTag,
      sourcePanel: '',
      panelPhase: '',
      diversityGroup: '',
      installedWatts: '',
      startupAmps: '',
      status: row.status,
      recommendation: row.recommendation,
    })),
  ];
  if (id === 'validation') return validationRows(report);
  return [];
}

function sectionSummary(id, report = {}) {
  if (id === 'cover') return report.summary || {};
  if (id === 'executiveSummary') {
    return {
      cableCount: report.summary?.counts?.cables || 0,
      racewayCount: (report.summary?.counts?.trays || 0) + (report.summary?.counts?.conduits || 0),
      validationPass: Boolean(report.validation?.pass),
      clashSeverity: report.clashes?.severity || 'pass',
    };
  }
  if (id === 'lifecycle') {
    const activePackage = report.lifecycle?.activePackage;
    return activePackage ? {
      packageId: activePackage.id,
      revision: activePackage.revision,
      status: activePackage.status,
      scenario: activePackage.scenario,
      modelHash: activePackage.modelHash,
      studyCount: activePackage.studyCount || 0,
    } : {};
  }
  if (id === 'designCoach') return report.designCoach?.summary || {};
  if (id === 'productCatalog') return report.productCatalog?.summary || {};
  if (id === 'fieldCommissioning') return report.fieldCommissioning?.summary || {};
  if (id === 'bimRoundTrip') return report.bimRoundTrip?.summary || {};
  if (id === 'bimConnectorReadiness') return report.bimConnectorReadiness?.summary || {};
  if (id === 'shortCircuit') return report.shortCircuit?.summary || {};
  if (id === 'arcFlash') return report.arcFlash?.summary || {};
  if (id === 'motorStart') return report.motorStart?.summary || {};
  if (id === 'harmonicStudy') return report.harmonicStudy?.summary || {};
  if (id === 'capacitorBankDuty') return report.capacitorBankDuty?.summary || {};
  if (id === 'reliabilityNetwork') return report.reliabilityNetwork?.summary || {};
  if (id === 'transientStability') return report.transientStability?.summary || {};
  if (id === 'protectionSettingSheets') return report.protectionSettingSheets?.summary || {};
  if (id === 'loadDemandGovernance') return report.loadDemandGovernance?.summary || {};
  if (id === 'transformerFeederSizing') return report.transformerFeederSizing?.summary || {};
  if (id === 'voltageDropStudy') return report.voltageDropStudy?.summary || {};
  if (id === 'pullConstructability') return report.pullConstructability?.summary || {};
  if (id === 'equipmentEvaluation') return report.equipmentEvaluation?.summary || {};
  if (id === 'advancedGrounding') return report.advancedGrounding?.summary || {};
  if (id === 'cableThermalEnvironment') return report.cableThermalEnvironment?.summary || {};
  if (id === 'loadFlow') return report.loadFlow?.summary || {};
  if (id === 'optimalPowerFlow') return report.optimalPowerFlow?.summary || {};
  if (id === 'cableSchedule') return report.cables?.summary || {};
  if (id === 'racewayFill') return report.fill?.summary || {};
  if (id === 'clashDetection') return report.clashes?.stats || {};
  if (id === 'spoolSheets') return report.spools?.summary || {};
  if (id === 'heatTraceBranchSchedule') return report.heatTrace?.branchSchedule?.summary || {};
  if (id === 'heatTrace') return report.heatTrace?.installationPackage?.lineList?.summary
    || report.heatTrace?.branchSchedule?.summary
    || {};
  if (id === 'heatTraceControllers') return report.heatTrace?.installationPackage?.controllerSchedule?.summary || {};
  if (id === 'heatTraceBOM') return report.heatTrace?.installationPackage?.bom?.summary || {};
  if (id === 'heatTraceAdvanced') return report.heatTrace?.advancedPackage?.summary || {};
  if (id === 'validation') {
    return {
      pass: Boolean(report.validation?.pass),
      exceptionCount: validationRows(report).length,
    };
  }
  return {};
}

export function buildReportPackageSections(report = {}, options = {}) {
  const includeSections = options.includeSections || DEFAULT_SECTIONS;
  return includeSections
    .filter(id => {
      if (id === 'lifecycle') return report.lifecycle?.activePackage;
      if (id === 'designCoach') return report.designCoach;
      if (id === 'productCatalog') return report.productCatalog;
      if (id === 'fieldCommissioning') return report.fieldCommissioning;
      if (id === 'bimRoundTrip') return report.bimRoundTrip;
      if (id === 'bimConnectorReadiness') return report.bimConnectorReadiness;
      if (id === 'shortCircuit') return report.shortCircuit;
      if (id === 'arcFlash') return report.arcFlash;
      if (id === 'motorStart') return report.motorStart;
      if (id === 'harmonicStudy') return report.harmonicStudy;
      if (id === 'capacitorBankDuty') return report.capacitorBankDuty;
      if (id === 'reliabilityNetwork') return report.reliabilityNetwork;
      if (id === 'transientStability') return report.transientStability;
      if (id === 'protectionSettingSheets') return report.protectionSettingSheets;
      if (id === 'loadDemandGovernance') return report.loadDemandGovernance;
      if (id === 'transformerFeederSizing') return report.transformerFeederSizing;
      if (id === 'voltageDropStudy') return report.voltageDropStudy;
      if (id === 'pullConstructability') return report.pullConstructability;
      if (id === 'racewayConstruction') return report.racewayConstruction;
      if (id === 'equipmentEvaluation') return report.equipmentEvaluation;
      if (id === 'advancedGrounding') return report.advancedGrounding;
      if (id === 'cableThermalEnvironment') return report.cableThermalEnvironment;
      if (id === 'loadFlow') return report.loadFlow;
      if (id === 'optimalPowerFlow') return report.optimalPowerFlow;
      if (id === 'heatTrace' || id === 'heatTraceBranchSchedule') return report.heatTrace;
      if (id === 'heatTraceControllers' || id === 'heatTraceBOM') return report.heatTrace?.installationPackage;
      if (id === 'heatTraceAdvanced') return report.heatTrace?.advancedPackage;
      return true;
    })
    .map((id, index) => {
      const meta = SECTION_META[id] || { title: id, discipline: 'General', deliverableType: 'Section' };
      const rows = sectionRows(id, report);
      const status = sectionStatus(id, report);
      return {
        id,
        number: index + 1,
        title: meta.title,
        discipline: meta.discipline,
        deliverableType: meta.deliverableType,
        status,
        rowCount: rows.length,
        fileName: meta.fileName || null,
        summary: sectionSummary(id, report),
        rows,
      };
    });
}

export function buildQualityChecklist(report = {}, sections = []) {
  const checks = [
    {
      id: 'project-summary',
      description: 'Project summary includes cable, tray, conduit, and ductbank counts.',
      status: report.summary?.counts ? 'ready' : 'not-run',
    },
    {
      id: 'validation',
      description: 'Project validation has no blocking warnings.',
      status: report.validation?.pass ? 'ready' : 'review',
    },
    {
      id: 'raceway-fill',
      description: 'Raceway fill rows are within configured limits.',
      status: (report.fill?.summary?.overCount || 0) > 0 ? 'action-required' : 'ready',
    },
    {
      id: 'clash-register',
      description: 'Clash register is included and reviewed.',
      status: normalizeStatus(report.clashes?.severity || 'ready'),
    },
    {
      id: 'section-files',
      description: 'Every data-backed section has a package file reference.',
      status: sections.filter(s => s.rowCount > 0).every(s => s.fileName) ? 'ready' : 'review',
    },
  ];
  if (report.heatTrace) {
    checks.push({
      id: 'heat-trace',
      description: 'Heat trace branch schedule and warnings are included.',
      status: sectionStatus('heatTrace', report),
    });
  }
  if (report.heatTrace?.advancedPackage) {
    checks.push({
      id: 'heat-trace-advanced',
      description: 'Heat trace advanced asset, segment, startup, and control rows are included.',
      status: sectionStatus('heatTraceAdvanced', report),
    });
  }
  if (report.lifecycle?.activePackage) {
    checks.push({
      id: 'lifecycle-package',
      description: 'Lifecycle release lineage is included for the active study package.',
      status: report.lifecycle.activePackage.status === 'released' ? 'ready' : 'review',
    });
  }
  if (report.designCoach) {
    checks.push({
      id: 'design-coach',
      description: 'Design coach action queue is included and high-priority actions are visible.',
      status: (report.designCoach.summary?.highPriority || 0) > 0 ? 'review' : 'ready',
    });
  }
  if (report.productCatalog) {
    checks.push({
      id: 'product-catalog-governance',
      description: 'Product catalog governance is included and generic/unapproved product selections are visible.',
      status: (report.productCatalog.summary?.unapprovedUsage || 0) > 0 || (report.productCatalog.summary?.duplicates || 0) > 0
        ? 'review'
        : 'ready',
    });
  }
  if (report.fieldCommissioning) {
    checks.push({
      id: 'field-verification',
      description: 'Field verification observations and unresolved punch/as-built items are included.',
      status: (report.fieldCommissioning.summary?.rejected || 0) > 0
        ? 'action-required'
        : (report.fieldCommissioning.summary?.openItems || 0) > 0
          ? 'review'
          : 'ready',
    });
  }
  if (report.bimRoundTrip) {
    checks.push({
      id: 'bim-coordination',
      description: 'BIM coordination reconciliation and open issue markup are included.',
      status: sectionStatus('bimRoundTrip', report),
    });
  }
  if (report.bimConnectorReadiness) {
    checks.push({
      id: 'bim-connector-readiness',
      description: 'BIM/CAD connector exchange package readiness and round-trip deltas are included.',
      status: sectionStatus('bimConnectorReadiness', report),
    });
  }
  if (report.equipmentEvaluation) {
    checks.push({
      id: 'equipment-evaluation',
      description: 'Equipment duty evaluation is included and fail/missing-data rows are visible.',
      status: (report.equipmentEvaluation.summary?.fail || 0) > 0
        ? 'action-required'
        : (report.equipmentEvaluation.summary?.missingData || 0) > 0 || (report.equipmentEvaluation.summary?.warn || 0) > 0
          ? 'review'
          : 'ready',
    });
  }
  if (report.shortCircuit) {
    checks.push({
      id: 'short-circuit-study-case',
      description: 'Short-circuit study case basis and duty rows are included.',
      status: report.shortCircuit.studyCase && asArray(report.shortCircuit.dutyRows).length ? 'ready' : 'review',
    });
  }
  if (report.arcFlash) {
    checks.push({
      id: 'arc-flash-study-case',
      description: 'Arc-flash equipment data, mitigation scenarios, and label readiness are included.',
      status: report.arcFlash.studyCase && asArray(report.arcFlash.scenarioComparison).length
        ? sectionStatus('arcFlash', report)
        : 'review',
    });
  }
  if (report.motorStart) {
    checks.push({
      id: 'motor-start-study-case',
      description: 'Motor-start study basis, sequence events, time-series rows, and worst-case voltage dips are included.',
      status: report.motorStart.studyCase && asArray(report.motorStart.worstCaseRows).length
        ? sectionStatus('motorStart', report)
        : 'review',
    });
  }
  if (report.harmonicStudy) {
    checks.push({
      id: 'harmonic-study-case',
      description: 'Harmonic PCC basis, source spectra, IEEE 519 compliance rows, and filter alternatives are included.',
      status: report.harmonicStudy.studyCase && asArray(report.harmonicStudy.complianceRows).length
        ? sectionStatus('harmonicStudy', report)
        : 'review',
    });
  }
  if (report.capacitorBankDuty) {
    checks.push({
      id: 'capacitor-bank-duty',
      description: 'Capacitor bank stage schedule, controller settings, duty checks, protection rows, and switching warnings are included.',
      status: sectionStatus('capacitorBankDuty', report),
    });
  }
  if (report.reliabilityNetwork) {
    checks.push({
      id: 'reliability-network',
      description: 'Reliability component, customer, restoration, index, contributor, and warning rows are included.',
      status: sectionStatus('reliabilityNetwork', report),
    });
  }
  if (report.transientStability) {
    checks.push({
      id: 'transient-stability',
      description: 'Transient stability dynamic model, event, scenario, CCT sweep, channel, and warning rows are included.',
      status: sectionStatus('transientStability', report),
    });
  }
  if (report.protectionSettingSheets) {
    checks.push({
      id: 'protection-setting-sheets',
      description: 'Protection setting-sheet device, function, and relay-test rows are included.',
      status: sectionStatus('protectionSettingSheets', report),
    });
  }
  if (report.loadDemandGovernance) {
    checks.push({
      id: 'load-demand-governance',
      description: 'Panel/load demand basis, noncoincident groups, phase balance, and demand warnings are included.',
      status: sectionStatus('loadDemandGovernance', report),
    });
  }
  if (report.transformerFeederSizing) {
    checks.push({
      id: 'transformer-feeder-sizing',
      description: 'Transformer/feeder sizing basis, alternatives, protection rows, and warnings are included.',
      status: sectionStatus('transformerFeederSizing', report),
    });
  }
  if (report.voltageDropStudy) {
    checks.push({
      id: 'voltage-drop-study',
      description: 'Voltage-drop criteria, operating-case basis, result rows, segment checks, and warnings are included.',
      status: sectionStatus('voltageDropStudy', report),
    });
  }
  if (report.pullConstructability) {
    checks.push({
      id: 'pull-constructability',
      description: 'Cable pull constructability direction comparison, section rows, bend rows, and warnings are included.',
      status: sectionStatus('pullConstructability', report),
    });
  }
  if (report.racewayConstruction) {
    checks.push({
      id: 'raceway-construction-details',
      description: 'Raceway construction metadata, support/accessory takeoff rows, and section references are included.',
      status: sectionStatus('racewayConstruction', report),
    });
  }
  if (report.advancedGrounding) {
    checks.push({
      id: 'advanced-grounding',
      description: 'Advanced grounding soil fit, hazard points, and screening assumptions are included.',
      status: sectionStatus('advancedGrounding', report),
    });
  }
  if (report.cableThermalEnvironment) {
    checks.push({
      id: 'cable-thermal-environment',
      description: 'Cable thermal environment screening rows and overloaded/missing-data cases are visible.',
      status: sectionStatus('cableThermalEnvironment', report),
    });
  }
  if (report.loadFlow) {
    checks.push({
      id: 'load-flow-study-case',
      description: 'Load-flow study basis, voltage profile, controls, and unbalance screening are included.',
      status: report.loadFlow.studyCase && asArray(report.loadFlow.phaseRows).length
        ? sectionStatus('loadFlow', report)
        : 'review',
    });
  }
  if (report.optimalPowerFlow) {
    checks.push({
      id: 'optimal-power-flow',
      description: 'Optimal power flow dispatch, feasibility checks, and violations are included.',
      status: sectionStatus('optimalPowerFlow', report),
    });
  }
  return checks;
}

export function buildTransmittalRows(pkg = {}) {
  return asArray(pkg.sections).map(section => ({
    item: section.number,
    title: section.title,
    discipline: section.discipline,
    deliverableType: section.deliverableType,
    status: section.status,
    fileName: section.fileName || 'index.html',
    rowCount: section.rowCount,
  }));
}

function buildCsvFile(section) {
  if (!section.fileName || !section.rows.length) return null;
  const headers = Object.keys(section.rows[0] || {});
  return {
    path: section.fileName,
    mediaType: 'text/csv',
    content: toCSV(headers, section.rows),
  };
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderReportPackageHTML(pkg = {}) {
  const sections = asArray(pkg.sections);
  const checks = asArray(pkg.qualityChecklist);
  const lifecycle = pkg.lifecycle?.activePackage || null;
  const designCoach = pkg.designCoach || null;
  const productCatalog = pkg.productCatalog || null;
  const fieldCommissioning = pkg.fieldCommissioning || null;
  const bimRoundTrip = pkg.bimRoundTrip || null;
  const bimConnectorReadiness = pkg.bimConnectorReadiness || null;
  const shortCircuit = pkg.shortCircuit || null;
  const arcFlash = pkg.arcFlash || null;
  const motorStart = pkg.motorStart || null;
  const harmonicStudy = pkg.harmonicStudy || null;
  const capacitorBankDuty = pkg.capacitorBankDuty || null;
  const reliabilityNetwork = pkg.reliabilityNetwork || null;
  const transientStability = pkg.transientStability || null;
  const protectionSettingSheets = pkg.protectionSettingSheets || null;
  const loadDemandGovernance = pkg.loadDemandGovernance || null;
  const transformerFeederSizing = pkg.transformerFeederSizing || null;
  const voltageDropStudy = pkg.voltageDropStudy || null;
  const pullConstructability = pkg.pullConstructability || null;
  const racewayConstruction = pkg.racewayConstruction || null;
  const equipmentEvaluation = pkg.equipmentEvaluation || null;
  const advancedGrounding = pkg.advancedGrounding || null;
  const cableThermalEnvironment = pkg.cableThermalEnvironment || null;
  const loadFlow = pkg.loadFlow || null;
  const optimalPowerFlow = pkg.optimalPowerFlow || null;
  const heatTraceAdvanced = pkg.heatTrace?.advancedPackage || null;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(pkg.title || 'Report Package')}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1f2937; margin: 32px; line-height: 1.4; }
    h1, h2 { color: #111827; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0 24px; }
    th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
    .meta { color: #4b5563; }
    .status-ready { color: #047857; font-weight: 700; }
    .status-review { color: #b45309; font-weight: 700; }
    .status-action-required { color: #b91c1c; font-weight: 700; }
    .status-not-run { color: #4b5563; font-weight: 700; }
  </style>
</head>
<body>
  <h1>${escapeHtml(pkg.title || 'Report Package')}</h1>
  <p class="meta">Project: ${escapeHtml(pkg.projectName)} | Package: ${escapeHtml(pkg.packageId)} | Revision: ${escapeHtml(pkg.revision)} | Generated: ${escapeHtml(pkg.generatedAt)}</p>
  ${lifecycle ? `<h2>Lifecycle Lineage</h2>
  <p class="meta">Release: ${escapeHtml(lifecycle.name)} | Revision: ${escapeHtml(lifecycle.revision)} | Status: ${escapeHtml(lifecycle.status)} | Scenario: ${escapeHtml(lifecycle.scenario)} | Model Hash: ${escapeHtml(lifecycle.modelHash)}</p>
  <p class="meta">Local engineering release record only. Final document control, signature, and approval workflows remain outside this package.</p>` : ''}
  ${designCoach ? `<h2>Design Coach Actions</h2>
  <p class="meta">${escapeHtml(designCoach.summary?.total || 0)} open action(s), ${escapeHtml(designCoach.summary?.highPriority || 0)} high priority.</p>` : ''}
  ${productCatalog ? `<h2>Product Catalog Governance</h2>
  <p class="meta">${escapeHtml(productCatalog.summary?.approved || 0)} approved, ${escapeHtml(productCatalog.summary?.unapproved || 0)} unapproved, ${escapeHtml(productCatalog.summary?.unapprovedUsage || 0)} usage warning(s).</p>` : ''}
  ${fieldCommissioning ? `<h2>Field Verification</h2>
  <p class="meta">${escapeHtml(fieldCommissioning.summary?.openItems || 0)} open item(s), ${escapeHtml(fieldCommissioning.summary?.verified || 0)} verified target(s), ${escapeHtml(fieldCommissioning.summary?.attachmentCount || 0)} attachment record(s).</p>` : ''}
  ${bimRoundTrip ? `<h2>BIM Coordination</h2>
  <p class="meta">${escapeHtml(bimRoundTrip.summary?.elementCount || 0)} imported element(s), ${escapeHtml(bimRoundTrip.summary?.changedGroups || 0)} changed quantity group(s), ${escapeHtml(bimRoundTrip.summary?.openIssues || 0)} open issue(s).</p>` : ''}
  ${bimConnectorReadiness ? `<h2>BIM/CAD Connector Readiness</h2>
  <p class="meta">${escapeHtml(bimConnectorReadiness.summary?.packageCount || 0)} connector package(s), ${escapeHtml(bimConnectorReadiness.summary?.quantityDeltas || 0)} quantity delta(s), ${escapeHtml(bimConnectorReadiness.summary?.mappingDeltas || 0)} mapping delta(s).</p>` : ''}
  ${shortCircuit ? `<h2>Short-Circuit Study Basis</h2>
  <p class="meta">${escapeHtml(shortCircuit.summary?.total || 0)} duty row(s), max duty ${escapeHtml(shortCircuit.summary?.maxDutyKA || 0)} kA, basis ${escapeHtml(shortCircuit.studyCase?.dutyBasis || 'n/a')}.</p>` : ''}
  ${arcFlash ? `<h2>Arc Flash Study Basis</h2>
  <p class="meta">${escapeHtml(arcFlash.summary?.includedEquipmentCount || 0)} included equipment row(s), ${escapeHtml(arcFlash.summary?.highEnergyCount || 0)} high-energy baseline row(s), ${escapeHtml(arcFlash.summary?.labelReadyCount || 0)} label-ready row(s).</p>` : ''}
  ${motorStart ? `<h2>Motor Start Study Basis</h2>
  <p class="meta">${escapeHtml(motorStart.summary?.motorCount || 0)} motor(s), ${escapeHtml(motorStart.summary?.eventCount || 0)} sequence event(s), max sag ${escapeHtml(motorStart.summary?.maxVoltageSagPct || 0)}%, ${escapeHtml(motorStart.summary?.failCount || 0)} failing row(s).</p>` : ''}
  ${harmonicStudy ? `<h2>Harmonic Study Basis</h2>
  <p class="meta">${escapeHtml(harmonicStudy.summary?.sourceCount || 0)} source(s), ${escapeHtml(harmonicStudy.summary?.fail || 0)} fail, ${escapeHtml(harmonicStudy.summary?.warn || 0)} warning, ${escapeHtml(harmonicStudy.summary?.missingData || 0)} missing-data compliance row(s), ${escapeHtml(harmonicStudy.summary?.filterAlternativeCount || 0)} filter alternative(s).</p>` : ''}
  ${capacitorBankDuty ? `<h2>Capacitor Bank Duty and Switching Basis</h2>
  <p class="meta">${escapeHtml(capacitorBankDuty.summary?.enabledStageCount || 0)} enabled stage(s), ${escapeHtml(capacitorBankDuty.summary?.totalEnabledKvar || 0)} kVAR, ${escapeHtml(capacitorBankDuty.summary?.fail || 0)} fail, ${escapeHtml(capacitorBankDuty.summary?.warn || 0)} warning, ${escapeHtml(capacitorBankDuty.summary?.missingData || 0)} missing-data row(s).</p>` : ''}
  ${reliabilityNetwork ? `<h2>Reliability Network Model and Customer Indices</h2>
  <p class="meta">${escapeHtml(reliabilityNetwork.summary?.componentCount || 0)} component(s), ${escapeHtml(reliabilityNetwork.summary?.totalCustomers || 0)} customer(s), SAIFI ${escapeHtml(reliabilityNetwork.summary?.saifi ?? 'n/a')}, SAIDI ${escapeHtml(reliabilityNetwork.summary?.saidi ?? 'n/a')} hr/customer-year.</p>` : ''}
  ${transientStability ? `<h2>Transient Stability Study Basis</h2>
  <p class="meta">${escapeHtml(transientStability.summary?.modelCount || 0)} dynamic model(s), ${escapeHtml(transientStability.summary?.eventCount || 0)} event(s), ${escapeHtml(transientStability.summary?.fail || 0)} fail, ${escapeHtml(transientStability.summary?.warn || 0)} warning, max rotor angle ${escapeHtml(transientStability.summary?.maxRotorAngleDeg ?? 'n/a')} deg.</p>` : ''}
  ${protectionSettingSheets ? `<h2>Protection Setting Sheets</h2>
  <p class="meta">${escapeHtml(protectionSettingSheets.summary?.deviceCount || 0)} device row(s), ${escapeHtml(protectionSettingSheets.summary?.functionCount || 0)} function row(s), ${escapeHtml(protectionSettingSheets.summary?.missingData || 0)} missing-data item(s).</p>` : ''}
  ${loadDemandGovernance ? `<h2>Panel and Load Demand Basis</h2>
  <p class="meta">${escapeHtml(loadDemandGovernance.summary?.loadCount || 0)} load(s), ${escapeHtml(loadDemandGovernance.summary?.panelCount || 0)} panel(s), ${escapeHtml(loadDemandGovernance.summary?.governedDemandKw || 0)} governed kW, ${escapeHtml(loadDemandGovernance.summary?.warningCount || 0)} warning(s).</p>` : ''}
  ${transformerFeederSizing ? `<h2>Transformer and Feeder Sizing Basis</h2>
  <p class="meta">${escapeHtml(transformerFeederSizing.summary?.selectedTransformerKva || 0)} kVA transformer, feeder ${escapeHtml(transformerFeederSizing.summary?.selectedFeederConductor || 'n/a')}, ${escapeHtml(transformerFeederSizing.summary?.alternativeCount || 0)} alternative row(s), ${escapeHtml(transformerFeederSizing.summary?.warningCount || 0)} warning(s).</p>` : ''}
  ${voltageDropStudy ? `<h2>Voltage Drop Study Basis</h2>
  <p class="meta">${escapeHtml(voltageDropStudy.summary?.total || 0)} cable row(s), ${escapeHtml(voltageDropStudy.summary?.fail || 0)} fail, ${escapeHtml(voltageDropStudy.summary?.warn || 0)} warning, ${escapeHtml(voltageDropStudy.summary?.missingData || 0)} missing-data row(s).</p>` : ''}
  ${pullConstructability ? `<h2>Cable Pull Constructability</h2>
  <p class="meta">${escapeHtml(pullConstructability.summary?.pullCount || 0)} pull(s), ${escapeHtml(pullConstructability.summary?.fail || 0)} fail, ${escapeHtml(pullConstructability.summary?.warn || 0)} warning, ${escapeHtml(pullConstructability.summary?.missingData || 0)} missing-data row(s).</p>` : ''}
  ${racewayConstruction ? `<h2>Raceway Construction Details</h2>
  <p class="meta">${escapeHtml(racewayConstruction.summary?.detailCount || 0)} raceway detail row(s), ${escapeHtml(racewayConstruction.summary?.takeoffRowCount || 0)} takeoff row(s), ${escapeHtml(racewayConstruction.summary?.warningCount || 0)} warning(s).</p>` : ''}
  ${equipmentEvaluation ? `<h2>Equipment Evaluation</h2>
  <p class="meta">${escapeHtml(equipmentEvaluation.summary?.fail || 0)} fail, ${escapeHtml(equipmentEvaluation.summary?.warn || 0)} warning, ${escapeHtml(equipmentEvaluation.summary?.missingData || 0)} missing-data row(s).</p>` : ''}
  ${advancedGrounding ? `<h2>Advanced Grounding</h2>
  <p class="meta">${escapeHtml(advancedGrounding.summary?.fail || 0)} fail, ${escapeHtml(advancedGrounding.summary?.warn || 0)} warning, soil fit ${escapeHtml(advancedGrounding.summary?.soilFitStatus || 'missingData')}.</p>` : ''}
  ${advancedGrounding?.fieldFidelity ? `<p class="meta">Grounding field QA ${escapeHtml(advancedGrounding.fieldFidelity.summary?.status || 'missingData')}: ${escapeHtml(advancedGrounding.fieldFidelity.summary?.measurementCount || 0)} soil row(s), ${escapeHtml(advancedGrounding.fieldFidelity.summary?.fallOfPotentialCount || 0)} fall-of-potential test(s), ${escapeHtml(advancedGrounding.fieldFidelity.summary?.seasonalScenarioCount || 0)} seasonal scenario(s).</p>` : ''}
  ${cableThermalEnvironment ? `<h2>Cable Thermal Environment</h2>
  <p class="meta">${escapeHtml(cableThermalEnvironment.summary?.fail || 0)} fail, ${escapeHtml(cableThermalEnvironment.summary?.warn || 0)} warning, ${escapeHtml(cableThermalEnvironment.summary?.missingData || 0)} missing-data row(s), ${escapeHtml(asArray(cableThermalEnvironment.advancedWarnings).length)} advanced warning(s).</p>` : ''}
  ${loadFlow ? `<h2>Load Flow Study Basis</h2>
  <p class="meta">${escapeHtml(loadFlow.summary?.phaseRowCount || 0)} voltage row(s), ${escapeHtml(loadFlow.summary?.voltageViolationCount || 0)} voltage violation(s), ${escapeHtml((loadFlow.summary?.unbalanceFailCount || 0) + (loadFlow.summary?.unbalanceWarnCount || 0))} unbalance issue(s).</p>` : ''}
  ${optimalPowerFlow ? `<h2>Optimal Power Flow</h2>
  <p class="meta">${escapeHtml(optimalPowerFlow.summary?.feasible ? 'feasible' : 'action-required')} dispatch, ${escapeHtml(optimalPowerFlow.summary?.totalDispatchedKw || 0)} kW dispatched, ${escapeHtml(optimalPowerFlow.summary?.fail || 0)} failing constraint(s).</p>` : ''}
  ${heatTraceAdvanced ? `<h2>Heat Trace Advanced Assets and Controls</h2>
  <p class="meta">${escapeHtml(heatTraceAdvanced.summary?.assetCount || 0)} asset(s), ${escapeHtml(heatTraceAdvanced.summary?.segmentCount || 0)} segment(s), ${escapeHtml(heatTraceAdvanced.summary?.totalStartupAmps || 0)} startup A, ${escapeHtml(heatTraceAdvanced.summary?.warningCount || 0)} warning(s).</p>` : ''}
  <h2>Transmittal</h2>
  <table>
    <thead><tr><th>#</th><th>Title</th><th>Discipline</th><th>Type</th><th>Status</th><th>File</th></tr></thead>
    <tbody>${sections.map(section => `<tr><td>${section.number}</td><td>${escapeHtml(section.title)}</td><td>${escapeHtml(section.discipline)}</td><td>${escapeHtml(section.deliverableType)}</td><td class="status-${escapeHtml(section.status)}">${escapeHtml(section.status)}</td><td>${escapeHtml(section.fileName || 'index.html')}</td></tr>`).join('')}</tbody>
  </table>
  <h2>Quality Checklist</h2>
  <table>
    <thead><tr><th>Check</th><th>Description</th><th>Status</th></tr></thead>
    <tbody>${checks.map(check => `<tr><td>${escapeHtml(check.id)}</td><td>${escapeHtml(check.description)}</td><td class="status-${escapeHtml(check.status)}">${escapeHtml(check.status)}</td></tr>`).join('')}</tbody>
  </table>
</body>
</html>`;
}

export function buildReportPackage(report = {}, options = {}) {
  const projectName = options.projectName || report.summary?.projectName || 'Untitled Project';
  const generatedAt = nowIso(options);
  const revision = options.revision || 'A';
  const packageId = options.packageId || `${slug(projectName)}-report-package-${revision}`;
  const sections = buildReportPackageSections(report, options);
  const qualityChecklist = buildQualityChecklist(report, sections);
  const packageStatus = qualityChecklist.some(c => c.status === 'action-required')
    ? 'action-required'
    : qualityChecklist.some(c => c.status === 'review')
      ? 'review'
      : 'ready';
  const pkg = {
    packageId,
    title: options.title || 'Commercial Report Package',
    projectName,
    revision,
    generatedAt,
    packageStatus,
    preparedBy: options.preparedBy || '',
    checkedBy: options.checkedBy || '',
    approvedBy: options.approvedBy || '',
    lifecycle: report.lifecycle || null,
    designCoach: report.designCoach || null,
    productCatalog: report.productCatalog || null,
    fieldCommissioning: report.fieldCommissioning || null,
    bimRoundTrip: report.bimRoundTrip || null,
    bimConnectorReadiness: report.bimConnectorReadiness || null,
    shortCircuit: report.shortCircuit || null,
    arcFlash: report.arcFlash || null,
    motorStart: report.motorStart || null,
    harmonicStudy: report.harmonicStudy || null,
    capacitorBankDuty: report.capacitorBankDuty || null,
    reliabilityNetwork: report.reliabilityNetwork || null,
    transientStability: report.transientStability || null,
    protectionSettingSheets: report.protectionSettingSheets || null,
    loadDemandGovernance: report.loadDemandGovernance || null,
    transformerFeederSizing: report.transformerFeederSizing || null,
    voltageDropStudy: report.voltageDropStudy || null,
    pullConstructability: report.pullConstructability || null,
    racewayConstruction: report.racewayConstruction || null,
    equipmentEvaluation: report.equipmentEvaluation || null,
    advancedGrounding: report.advancedGrounding || null,
    cableThermalEnvironment: report.cableThermalEnvironment || null,
    loadFlow: report.loadFlow || null,
    optimalPowerFlow: report.optimalPowerFlow || null,
    heatTrace: report.heatTrace || null,
    sections,
    qualityChecklist,
  };
  const transmittalRows = buildTransmittalRows(pkg);
  const files = [
    {
      path: 'manifest.json',
      mediaType: 'application/json',
      content: JSON.stringify({
        packageId,
        title: pkg.title,
        projectName,
        revision,
        generatedAt,
        packageStatus,
        preparedBy: pkg.preparedBy,
        checkedBy: pkg.checkedBy,
        approvedBy: pkg.approvedBy,
        lifecycle: pkg.lifecycle,
        productCatalog: pkg.productCatalog ? {
          summary: pkg.productCatalog.summary,
          warnings: asArray(pkg.productCatalog.warnings),
          unresolved: asArray(pkg.productCatalog.unapprovedUsage).slice(0, 50),
        } : null,
        fieldCommissioning: pkg.fieldCommissioning ? {
          summary: pkg.fieldCommissioning.summary,
          warnings: asArray(pkg.fieldCommissioning.warnings),
          unresolved: asArray(pkg.fieldCommissioning.openItems).slice(0, 50),
          attachmentSummary: {
            count: pkg.fieldCommissioning.attachmentSummary?.count || 0,
            totalBytes: pkg.fieldCommissioning.attachmentSummary?.totalBytes || 0,
          },
        } : null,
        bimRoundTrip: pkg.bimRoundTrip ? {
          summary: pkg.bimRoundTrip.summary,
          warnings: asArray(pkg.bimRoundTrip.warnings),
          unresolved: [
            ...asArray(pkg.bimRoundTrip.quantityReconciliation?.rows)
              .filter(row => row.status !== 'matched')
              .slice(0, 50),
            ...asArray(pkg.bimRoundTrip.issues)
              .filter(row => row.status === 'open' || row.status === 'assigned' || row.status === 'rejected')
              .slice(0, 50),
          ],
        } : null,
        bimConnectorReadiness: pkg.bimConnectorReadiness ? {
          summary: pkg.bimConnectorReadiness.summary,
          warnings: asArray(pkg.bimConnectorReadiness.warnings),
          unresolved: [
            ...asArray(pkg.bimConnectorReadiness.roundTripDiff?.quantityDeltas).slice(0, 50),
            ...asArray(pkg.bimConnectorReadiness.roundTripDiff?.mappingDeltas).slice(0, 50),
          ],
        } : null,
        shortCircuit: pkg.shortCircuit ? {
          summary: pkg.shortCircuit.summary,
          studyCase: pkg.shortCircuit.studyCase,
          warnings: asArray(pkg.shortCircuit.warnings),
          unresolved: asArray(pkg.shortCircuit.dutyRows)
            .filter(row => row.status === 'review' || row.status === 'missingData')
            .slice(0, 50),
        } : null,
        arcFlash: pkg.arcFlash ? {
          summary: pkg.arcFlash.summary,
          studyCase: pkg.arcFlash.studyCase,
          warnings: asArray(pkg.arcFlash.warnings),
          unresolved: asArray(pkg.arcFlash.scenarioComparison)
            .filter(row => row.status === 'danger' || row.status === 'review' || row.status === 'missingData' || row.labelReady === false)
            .slice(0, 50),
        } : null,
        motorStart: pkg.motorStart ? {
          summary: pkg.motorStart.summary,
          studyCase: pkg.motorStart.studyCase,
          warnings: asArray(pkg.motorStart.warnings),
          unresolved: asArray(pkg.motorStart.worstCaseRows)
            .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'stalled' || row.status === 'missingData')
            .slice(0, 50),
          sequenceEvents: asArray(pkg.motorStart.sequenceEvents).slice(0, 50),
        } : null,
        harmonicStudy: pkg.harmonicStudy ? {
          summary: pkg.harmonicStudy.summary,
          studyCase: pkg.harmonicStudy.studyCase,
          warnings: asArray(pkg.harmonicStudy.warnings),
          unresolved: asArray(pkg.harmonicStudy.complianceRows)
            .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
            .slice(0, 50),
          filterAlternatives: asArray(pkg.harmonicStudy.filterAlternatives).slice(0, 50),
        } : null,
        capacitorBankDuty: pkg.capacitorBankDuty ? {
          summary: pkg.capacitorBankDuty.summary,
          dutyCase: pkg.capacitorBankDuty.dutyCase,
          warnings: asArray(pkg.capacitorBankDuty.warningRows).slice(0, 50),
          unresolved: [
            ...asArray(pkg.capacitorBankDuty.dutyRows)
              .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData'),
            ...asArray(pkg.capacitorBankDuty.protectionRows)
              .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData'),
            ...asArray(pkg.capacitorBankDuty.switchingRows)
              .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData'),
          ].slice(0, 50),
        } : null,
        reliabilityNetwork: pkg.reliabilityNetwork ? {
          summary: pkg.reliabilityNetwork.summary,
          model: pkg.reliabilityNetwork.model,
          indices: asArray(pkg.reliabilityNetwork.indexRows).slice(0, 20),
          warnings: asArray(pkg.reliabilityNetwork.warningRows).slice(0, 50),
          topContributors: asArray(pkg.reliabilityNetwork.contributorRows).slice(0, 20),
          unresolved: [
            ...asArray(pkg.reliabilityNetwork.indexRows)
              .filter(row => row.status === 'warn' || row.status === 'review' || row.status === 'missingData'),
            ...asArray(pkg.reliabilityNetwork.scenarioRows)
              .filter(row => row.status === 'warn' || row.status === 'missingData'),
            ...asArray(pkg.reliabilityNetwork.warningRows),
          ].slice(0, 50),
        } : null,
        transientStability: pkg.transientStability ? {
          summary: pkg.transientStability.summary,
          studyCase: pkg.transientStability.studyCase,
          scenarioRows: asArray(pkg.transientStability.scenarioRows).slice(0, 50),
          cctSweepRows: asArray(pkg.transientStability.cctSweepRows).slice(0, 50),
          warnings: asArray(pkg.transientStability.warningRows).slice(0, 50),
          unresolved: [
            ...asArray(pkg.transientStability.scenarioRows)
              .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData'),
            ...asArray(pkg.transientStability.cctSweepRows)
              .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData'),
            ...asArray(pkg.transientStability.warningRows),
          ].slice(0, 50),
        } : null,
        protectionSettingSheets: pkg.protectionSettingSheets ? {
          summary: pkg.protectionSettingSheets.summary,
          warnings: asArray(pkg.protectionSettingSheets.warnings),
          coordinationBasis: pkg.protectionSettingSheets.coordinationBasis,
          unresolved: [
            ...asArray(pkg.protectionSettingSheets.deviceRows)
              .filter(row => row.status === 'missingData' || row.status === 'warn'),
            ...asArray(pkg.protectionSettingSheets.functionRows)
              .filter(row => row.status === 'missingData' || row.status === 'disabled'),
            ...asArray(pkg.protectionSettingSheets.testRows)
            .filter(row => row.status === 'missingData' || row.status === 'fail'),
          ].slice(0, 50),
        } : null,
        loadDemandGovernance: pkg.loadDemandGovernance ? {
          summary: pkg.loadDemandGovernance.summary,
          basis: pkg.loadDemandGovernance.basis,
          warnings: asArray(pkg.loadDemandGovernance.warnings).slice(0, 50),
          unresolved: [
            ...asArray(pkg.loadDemandGovernance.loadRows)
              .filter(row => row.status === 'warn' || row.status === 'missingData'),
            ...asArray(pkg.loadDemandGovernance.panelRows)
              .filter(row => row.status === 'warn' || row.status === 'fail'),
          ].slice(0, 50),
        } : null,
        transformerFeederSizing: pkg.transformerFeederSizing ? {
          summary: pkg.transformerFeederSizing.summary,
          caseBasis: pkg.transformerFeederSizing.caseBasis,
          loadBasis: pkg.transformerFeederSizing.loadBasis,
          warnings: asArray(pkg.transformerFeederSizing.warningRows).slice(0, 50),
          unresolved: [
            ...asArray(pkg.transformerFeederSizing.transformerRows)
              .filter(row => row.status === 'warn' || row.status === 'fail' || row.status === 'missingData'),
            ...asArray(pkg.transformerFeederSizing.feederRows)
              .filter(row => row.status === 'warn' || row.status === 'fail' || row.status === 'missingData'),
            ...asArray(pkg.transformerFeederSizing.warningRows)
              .filter(row => row.severity === 'error' || row.severity === 'warning'),
          ].slice(0, 50),
        } : null,
        voltageDropStudy: pkg.voltageDropStudy ? {
          summary: pkg.voltageDropStudy.summary,
          criteria: pkg.voltageDropStudy.criteria,
          operatingCase: pkg.voltageDropStudy.operatingCase,
          warnings: asArray(pkg.voltageDropStudy.warningRows).slice(0, 50),
          unresolved: [
            ...asArray(pkg.voltageDropStudy.rows)
              .filter(row => row.status === 'warn' || row.status === 'fail' || row.status === 'missingData'),
            ...asArray(pkg.voltageDropStudy.warningRows)
              .filter(row => row.severity === 'error' || row.severity === 'warning'),
          ].slice(0, 50),
        } : null,
        pullConstructability: pkg.pullConstructability ? {
          summary: pkg.pullConstructability.summary,
          inputs: pkg.pullConstructability.inputs,
          warnings: asArray(pkg.pullConstructability.warningRows),
          unresolved: asArray(pkg.pullConstructability.pullRows)
            .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
            .slice(0, 50),
        } : null,
        racewayConstruction: pkg.racewayConstruction ? {
          summary: pkg.racewayConstruction.summary,
          warnings: asArray(pkg.racewayConstruction.warningRows),
          unresolved: [
            ...asArray(pkg.racewayConstruction.detailRows)
              .filter(row => row.status === 'fail' || row.status === 'warn'),
            ...asArray(pkg.racewayConstruction.warningRows)
              .filter(row => row.severity === 'error' || row.severity === 'warning'),
          ].slice(0, 50),
        } : null,
        advancedGrounding: pkg.advancedGrounding ? {
          summary: pkg.advancedGrounding.summary,
          warnings: asArray(pkg.advancedGrounding.warnings),
          fieldFidelity: pkg.advancedGrounding.fieldFidelity ? {
            summary: pkg.advancedGrounding.fieldFidelity.summary,
            measurementCoverage: pkg.advancedGrounding.fieldFidelity.measurementCoverage,
            warningRows: asArray(pkg.advancedGrounding.fieldFidelity.warningRows).slice(0, 50),
            seasonalScenarios: asArray(pkg.advancedGrounding.fieldFidelity.seasonalScenarios).slice(0, 50),
          } : null,
          unresolved: asArray(pkg.advancedGrounding.riskPoints)
            .filter(point => point.status === 'fail' || point.status === 'warn' || point.status === 'missingData')
            .slice(0, 50),
        } : null,
        cableThermalEnvironment: pkg.cableThermalEnvironment ? {
          summary: pkg.cableThermalEnvironment.summary,
          advancedInputs: pkg.cableThermalEnvironment.advancedInputs,
          advancedWarnings: asArray(pkg.cableThermalEnvironment.advancedWarnings),
          backfillZones: asArray(pkg.cableThermalEnvironment.backfillZones).slice(0, 50),
          adjacentInfluences: asArray(pkg.cableThermalEnvironment.adjacentInfluences).slice(0, 50),
          cyclicRatingRows: asArray(pkg.cableThermalEnvironment.cyclicRatingRows).slice(0, 50),
          warnings: asArray(pkg.cableThermalEnvironment.warnings),
          unresolved: [
            ...asArray(pkg.cableThermalEnvironment.evaluations)
              .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData'),
            ...asArray(pkg.cableThermalEnvironment.cyclicRatingRows)
              .filter(row => row.status === 'fail' || row.status === 'warn'),
          ].slice(0, 50),
        } : null,
        loadFlow: pkg.loadFlow ? {
          summary: pkg.loadFlow.summary,
          studyCase: pkg.loadFlow.studyCase,
          warnings: asArray(pkg.loadFlow.warnings),
          unresolved: [
            ...asArray(pkg.loadFlow.voltageViolationRows),
            ...asArray(pkg.loadFlow.unbalanceRows).filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData'),
          ].slice(0, 50),
        } : null,
        optimalPowerFlow: pkg.optimalPowerFlow ? {
          summary: pkg.optimalPowerFlow.summary,
          objective: pkg.optimalPowerFlow.objective,
          warnings: asArray(pkg.optimalPowerFlow.warnings),
          unresolved: asArray(pkg.optimalPowerFlow.violations)
            .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
            .slice(0, 50),
        } : null,
        heatTraceAdvanced: pkg.heatTrace?.advancedPackage ? {
          summary: pkg.heatTrace.advancedPackage.summary,
          warnings: asArray(pkg.heatTrace.advancedPackage.warnings),
          unresolved: [
            ...asArray(pkg.heatTrace.advancedPackage.assetRows)
              .filter(row => row.status === 'fail' || row.status === 'warn'),
            ...asArray(pkg.heatTrace.advancedPackage.segmentRows)
              .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData'),
            ...asArray(pkg.heatTrace.advancedPackage.controlRows)
              .filter(row => row.status === 'missingData' || row.status === 'warn'),
            ...asArray(pkg.heatTrace.advancedPackage.startupProfileRows)
              .filter(row => row.status === 'warn'),
          ].slice(0, 50),
        } : null,
        equipmentEvaluation: pkg.equipmentEvaluation ? {
          summary: pkg.equipmentEvaluation.summary,
          sourceStatus: pkg.equipmentEvaluation.sourceStatus,
          unresolved: asArray(pkg.equipmentEvaluation.rows)
            .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
            .slice(0, 50),
        } : null,
        designCoach: pkg.designCoach ? {
          summary: pkg.designCoach.summary,
          unresolvedHighPriority: asArray(pkg.designCoach.actions)
            .filter(action => action.severity === 'critical' || action.severity === 'high')
            .map(({ id, fingerprint, title, severity, category, pageHref, source }) => ({
              id,
              fingerprint,
              title,
              severity,
              category,
              pageHref,
              source,
            })),
        } : null,
        sections: sections.map(({ rows, ...section }) => section),
        qualityChecklist,
      }, null, 2),
    },
    {
      path: 'index.html',
      mediaType: 'text/html',
      content: renderReportPackageHTML(pkg),
    },
    {
      path: 'transmittal.csv',
      mediaType: 'text/csv',
      content: toCSV(Object.keys(transmittalRows[0] || {}), transmittalRows),
    },
    {
      path: 'quality_checklist.csv',
      mediaType: 'text/csv',
      content: toCSV(Object.keys(qualityChecklist[0] || {}), qualityChecklist),
    },
    ...sections.map(buildCsvFile).filter(Boolean),
  ];
  return { ...pkg, files };
}

export function downloadReportPackage(pkg = {}, filename = '') {
  const safeName = filename || `${pkg.packageId || 'report-package'}.json`;
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = safeName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}
