import { toCSV } from './reporting.mjs';

const DEFAULT_SECTIONS = [
  'cover',
  'lifecycle',
  'designCoach',
  'productCatalog',
  'pricingFeedGovernance',
  'cloudLibraryGovernance',
  'fieldCommissioning',
  'bimRoundTrip',
  'bimConnectorReadiness',
  'nativeBimConnectorKit',
  'revitSyncReadiness',
  'revitNativeSync',
  'autocadSyncReadiness',
  'autocadNativeSync',
  'plantCadSyncReadiness',
  'plantCadNativeSync',
  'bimObjectLibrary',
  'shortCircuit',
  'arcFlash',
  'motorStart',
  'harmonicStudy',
  'capacitorBankDuty',
  'reliabilityNetwork',
  'transientStability',
  'ibrPlantController',
  'emfExposure',
  'cathodicProtectionNetwork',
  'protectionSettingSheets',
  'loadDemandGovernance',
  'transformerFeederSizing',
  'voltageDropStudy',
  'voltageFlicker',
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
  pricingFeedGovernance: {
    title: 'Pricing Feed and Quote Governance',
    discipline: 'Project Controls',
    deliverableType: 'Pricing Source Register',
    fileName: 'data/pricing_feed_governance.csv',
  },
  cloudLibraryGovernance: {
    title: 'Cloud Component Library Governance',
    discipline: 'Project Controls',
    deliverableType: 'Organization Component Library Release Register',
    fileName: 'data/cloud_component_library_governance.csv',
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
  nativeBimConnectorKit: {
    title: 'Native BIM/CAD Connector Starter Kit',
    discipline: 'Coordination',
    deliverableType: 'Native Connector Readiness Package',
    fileName: 'data/native_bim_connector_kit.csv',
  },
  revitSyncReadiness: {
    title: 'Revit Connector Sync Readiness',
    discipline: 'Coordination',
    deliverableType: 'Native Revit Bridge Readiness Package',
    fileName: 'data/revit_sync_readiness.csv',
  },
  revitNativeSync: {
    title: 'Functional Revit Add-In Sync Readiness',
    discipline: 'Coordination',
    deliverableType: 'Functional Revit Native Sync Readiness Package',
    fileName: 'data/revit_native_sync.csv',
  },
  autocadSyncReadiness: {
    title: 'AutoCAD Connector Sync Readiness',
    discipline: 'Coordination',
    deliverableType: 'Native AutoCAD Bridge Readiness Package',
    fileName: 'data/autocad_sync_readiness.csv',
  },
  autocadNativeSync: {
    title: 'Functional AutoCAD Add-In Sync Readiness',
    discipline: 'Coordination',
    deliverableType: 'Functional AutoCAD Native Sync Readiness Package',
    fileName: 'data/autocad_native_sync.csv',
  },
  plantCadSyncReadiness: {
    title: 'Plant CAD Connector Sync Readiness',
    discipline: 'Coordination',
    deliverableType: 'Native Plant CAD Bridge Readiness Package',
    fileName: 'data/plantcad_sync_readiness.csv',
  },
  plantCadNativeSync: {
    title: 'Functional Plant CAD Add-In Sync Readiness',
    discipline: 'Coordination',
    deliverableType: 'Functional Plant CAD Native Sync Readiness Package',
    fileName: 'data/plantcad_native_sync.csv',
  },
  bimObjectLibrary: {
    title: 'BIM Object Library and Family Metadata',
    discipline: 'Coordination',
    deliverableType: 'BIM Family Readiness Register',
    fileName: 'data/bim_object_library.csv',
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
  ibrPlantController: {
    title: 'DER / IBR Plant Controller and Grid-Code Scenarios',
    discipline: 'DER / Power System',
    deliverableType: 'Plant Controller Screening Package',
    fileName: 'data/ibr_plant_controller.csv',
  },
  emfExposure: {
    title: 'EMF Exposure Study Basis',
    discipline: 'Electrical / Safety',
    deliverableType: 'EMF Screening Package',
    fileName: 'data/emf_exposure.csv',
  },
  cathodicProtectionNetwork: {
    title: 'Cathodic Protection Network and Interference Model',
    discipline: 'Corrosion / Cathodic Protection',
    deliverableType: 'Network Screening Package',
    fileName: 'data/cathodic_protection_network.csv',
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
  voltageFlicker: {
    title: 'Voltage Flicker Study Basis',
    discipline: 'Electrical',
    deliverableType: 'Power Quality Study Case',
    fileName: 'data/voltage_flicker_study.csv',
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
  if (id === 'ibrPlantController') {
    if ((report.ibrPlantController?.summary?.fail || 0) > 0) return 'action-required';
    if ((report.ibrPlantController?.summary?.warn || 0) > 0
      || (report.ibrPlantController?.summary?.warningCount || 0) > 0
      || (report.ibrPlantController?.summary?.missingData || 0) > 0) return 'review';
  }
  if (id === 'emfExposure') {
    if ((report.emfExposure?.summary?.fail || 0) > 0) return 'action-required';
    if ((report.emfExposure?.summary?.warn || 0) > 0
      || (report.emfExposure?.summary?.warningCount || 0) > 0
      || (report.emfExposure?.summary?.missingData || 0) > 0
      || (report.emfExposure?.summary?.validationMismatchCount || 0) > 0) return 'review';
  }
  if (id === 'cathodicProtectionNetwork') {
    if ((report.cathodicProtectionNetwork?.summary?.fail || 0) > 0) return 'action-required';
    if ((report.cathodicProtectionNetwork?.summary?.warn || 0) > 0
      || (report.cathodicProtectionNetwork?.summary?.warningCount || 0) > 0
      || (report.cathodicProtectionNetwork?.summary?.missingData || 0) > 0) return 'review';
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
  if (id === 'voltageFlicker') {
    if ((report.voltageFlicker?.summary?.fail || 0) > 0) return 'action-required';
    if ((report.voltageFlicker?.summary?.warn || 0) > 0
      || (report.voltageFlicker?.summary?.missingData || 0) > 0
      || (report.voltageFlicker?.summary?.warningCount || 0) > 0) return 'review';
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
  if (id === 'pricingFeedGovernance') {
    if ((report.pricingFeedGovernance?.summary?.conflictCount || 0) > 0
      || asArray(report.pricingFeedGovernance?.warningRows).some(row => row.severity === 'error')) return 'action-required';
    if ((report.pricingFeedGovernance?.summary?.staleRowCount || 0) > 0
      || (report.pricingFeedGovernance?.summary?.expiredRowCount || 0) > 0
      || (report.pricingFeedGovernance?.summary?.unpricedLineCount || 0) > 0
      || (report.pricingFeedGovernance?.summary?.warningCount || 0) > 0) return 'review';
  }
  if (id === 'cloudLibraryGovernance') {
    if ((report.cloudLibraryGovernance?.summary?.validationFailureCount || 0) > 0) return 'action-required';
    if ((report.cloudLibraryGovernance?.summary?.warningCount || 0) > 0
      || (report.cloudLibraryGovernance?.summary?.adoptionConflictCount || 0) > 0
      || report.cloudLibraryGovernance?.summary?.status === 'not-run') return 'review';
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
  if (id === 'nativeBimConnectorKit') {
    if ((report.nativeBimConnectorKit?.summary?.fail || 0) > 0) return 'action-required';
    if ((report.nativeBimConnectorKit?.summary?.missingData || 0) > 0
      || (report.nativeBimConnectorKit?.summary?.warningCount || 0) > 0) return 'review';
  }
  if (id === 'revitSyncReadiness') {
    if (report.revitSyncReadiness?.summary?.validationStatus === 'fail'
      || (report.revitSyncReadiness?.summary?.rejectedPreviewRows || 0) > 0) return 'action-required';
    if ((report.revitSyncReadiness?.summary?.warningCount || 0) > 0
      || (report.revitSyncReadiness?.summary?.quantityDeltas || 0) > 0
      || (report.revitSyncReadiness?.summary?.mappingDeltas || 0) > 0) return 'review';
  }
  if (id === 'revitNativeSync') {
    if (report.revitNativeSync?.summary?.status === 'fail'
      || (report.revitNativeSync?.summary?.rejectedPreviewRows || 0) > 0) return 'action-required';
    if ((report.revitNativeSync?.summary?.warningCount || 0) > 0
      || (report.revitNativeSync?.summary?.commandReadyCount || 0) < (report.revitNativeSync?.summary?.commandCount || 0)
      || (report.revitNativeSync?.summary?.readyMappingCount || 0) < (report.revitNativeSync?.summary?.exportMappingCount || 0)
      || (report.revitNativeSync?.summary?.quantityDeltas || 0) > 0
      || (report.revitNativeSync?.summary?.mappingDeltas || 0) > 0) return 'review';
  }
  if (id === 'autocadSyncReadiness') {
    if (report.autocadSyncReadiness?.summary?.validationStatus === 'fail'
      || (report.autocadSyncReadiness?.summary?.rejectedPreviewRows || 0) > 0) return 'action-required';
    if ((report.autocadSyncReadiness?.summary?.warningCount || 0) > 0
      || (report.autocadSyncReadiness?.summary?.quantityDeltas || 0) > 0
      || (report.autocadSyncReadiness?.summary?.mappingDeltas || 0) > 0) return 'review';
  }
  if (id === 'autocadNativeSync') {
    if (report.autocadNativeSync?.summary?.status === 'fail'
      || (report.autocadNativeSync?.summary?.rejectedPreviewRows || 0) > 0) return 'action-required';
    if ((report.autocadNativeSync?.summary?.warningCount || 0) > 0
      || (report.autocadNativeSync?.summary?.commandReadyCount || 0) < (report.autocadNativeSync?.summary?.commandCount || 0)
      || (report.autocadNativeSync?.summary?.readyMappingCount || 0) < (report.autocadNativeSync?.summary?.exportMappingCount || 0)
      || (report.autocadNativeSync?.summary?.quantityDeltas || 0) > 0
      || (report.autocadNativeSync?.summary?.mappingDeltas || 0) > 0) return 'review';
  }
  if (id === 'plantCadSyncReadiness') {
    if (report.plantCadSyncReadiness?.summary?.validationStatus === 'fail'
      || (report.plantCadSyncReadiness?.summary?.rejectedPreviewRows || 0) > 0) return 'action-required';
    if ((report.plantCadSyncReadiness?.summary?.warningCount || 0) > 0
      || (report.plantCadSyncReadiness?.summary?.quantityDeltas || 0) > 0
      || (report.plantCadSyncReadiness?.summary?.mappingDeltas || 0) > 0) return 'review';
  }
  if (id === 'plantCadNativeSync') {
    if (report.plantCadNativeSync?.summary?.status === 'fail'
      || (report.plantCadNativeSync?.summary?.rejectedPreviewRows || 0) > 0) return 'action-required';
    if ((report.plantCadNativeSync?.summary?.warningCount || 0) > 0
      || (report.plantCadNativeSync?.summary?.commandReadyCount || 0) < (report.plantCadNativeSync?.summary?.commandCount || 0)
      || (report.plantCadNativeSync?.summary?.readyMappingCount || 0) < (report.plantCadNativeSync?.summary?.exportMappingCount || 0)
      || (report.plantCadNativeSync?.summary?.quantityDeltas || 0) > 0
      || (report.plantCadNativeSync?.summary?.mappingDeltas || 0) > 0) return 'review';
  }
  if (id === 'bimObjectLibrary') {
    if ((report.bimObjectLibrary?.summary?.conflictCount || 0) > 0) return 'action-required';
    if ((report.bimObjectLibrary?.summary?.missingFamilyCount || 0) > 0
      || (report.bimObjectLibrary?.summary?.genericPlaceholderCount || 0) > 0
      || (report.bimObjectLibrary?.summary?.warningCount || 0) > 0) return 'review';
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
  if (id === 'pricingFeedGovernance') return [
    ...asArray(report.pricingFeedGovernance?.pricingRows).map(row => ({
      recordType: 'pricingRow',
      sourceName: row.sourceName,
      sourceType: row.sourceType,
      quoteNumber: row.quoteNumber,
      manufacturer: row.manufacturer,
      catalogNumber: row.catalogNumber || row.key,
      category: row.category,
      uom: row.uom,
      unitPrice: row.unitPrice,
      laborUnitPrice: row.laborUnitPrice,
      currency: row.currency,
      approvalStatus: row.approvalStatus,
      expiresAt: row.expiresAt,
      status: row.approved ? 'approved' : row.approvalStatus,
      recommendation: row.notes,
    })),
    ...asArray(report.pricingFeedGovernance?.estimateCoverageRows).map(row => ({
      recordType: 'estimateCoverage',
      sourceName: row.pricingSource,
      sourceType: row.sourceType,
      quoteNumber: row.quoteNumber,
      manufacturer: '',
      catalogNumber: row.lineItemId,
      category: row.category,
      uom: row.unit,
      unitPrice: row.governedUnitPrice ?? row.estimateUnitPrice,
      laborUnitPrice: '',
      currency: row.currency,
      approvalStatus: row.catalogStatus,
      expiresAt: row.expiresAt,
      status: row.status,
      recommendation: asArray(row.warnings).join('; '),
    })),
    ...asArray(report.pricingFeedGovernance?.warningRows).map(row => ({
      recordType: 'warning',
      sourceName: '',
      sourceType: '',
      quoteNumber: '',
      manufacturer: '',
      catalogNumber: row.sourceId,
      category: row.code,
      uom: '',
      unitPrice: '',
      laborUnitPrice: '',
      currency: '',
      approvalStatus: row.severity,
      expiresAt: '',
      status: row.severity,
      recommendation: row.message,
    })),
  ];
  if (id === 'cloudLibraryGovernance') return [
    ...asArray(report.cloudLibraryGovernance?.releases).map(row => ({
      recordType: 'release',
      workspaceId: row.workspaceId,
      releaseId: row.id,
      releaseTag: row.releaseTag,
      name: row.name,
      status: row.status,
      approvalStatus: row.approvalStatus,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      componentCount: row.summary?.componentCount || 0,
      validationStatus: row.validation?.status || '',
      recommendation: row.description,
    })),
    ...asArray(report.cloudLibraryGovernance?.validationRows).map(row => ({
      recordType: 'validation',
      workspaceId: report.cloudLibraryGovernance?.descriptor?.workspaceId || '',
      releaseId: row.releaseId,
      releaseTag: row.releaseTag,
      name: row.id,
      status: row.status,
      approvalStatus: '',
      createdBy: '',
      createdAt: '',
      componentCount: '',
      validationStatus: row.status,
      recommendation: row.detail,
    })),
    ...asArray(report.cloudLibraryGovernance?.warningRows).map(row => ({
      recordType: 'warning',
      workspaceId: report.cloudLibraryGovernance?.descriptor?.workspaceId || '',
      releaseId: row.releaseId,
      releaseTag: '',
      name: row.id,
      status: row.severity,
      approvalStatus: '',
      createdBy: '',
      createdAt: '',
      componentCount: '',
      validationStatus: row.severity,
      recommendation: row.message,
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
  if (id === 'nativeBimConnectorKit') return [
    ...asArray(report.nativeBimConnectorKit?.descriptors).map(row => ({
      recordType: 'descriptor',
      connectorType: row.connectorType,
      targetApplication: row.targetApplication,
      targetVersion: row.targetVersion,
      contractVersion: row.contractVersion,
      commandCount: asArray(row.commands).length,
      templateCount: asArray(row.templateFiles).length,
      warningCount: asArray(row.warnings).length,
      status: row.validationStatus || 'review',
      item: '',
      recommendation: '',
    })),
    ...asArray(report.nativeBimConnectorKit?.installChecklist).map(row => ({
      recordType: 'installChecklist',
      connectorType: row.connectorType,
      targetApplication: '',
      targetVersion: '',
      contractVersion: report.nativeBimConnectorKit?.summary?.contractVersion || '',
      commandCount: '',
      templateCount: '',
      warningCount: '',
      status: row.status,
      item: row.item,
      recommendation: row.recommendation,
    })),
  ];
  if (id === 'revitSyncReadiness') return [
    ...asArray(report.revitSyncReadiness?.validationRows).map(row => ({
      recordType: 'validation',
      check: row.check,
      status: row.status,
      detail: row.detail,
      elementType: '',
      tag: '',
      guid: '',
      recommendation: '',
    })),
    ...asArray(report.revitSyncReadiness?.syncPreviewRows).map(row => ({
      recordType: 'syncPreview',
      check: '',
      status: row.status,
      detail: '',
      elementType: row.elementType,
      tag: row.tag || row.id,
      guid: row.guid,
      recommendation: row.recommendation,
    })),
    ...asArray(report.revitSyncReadiness?.warningRows).map(row => ({
      recordType: 'warning',
      check: row.id,
      status: row.severity,
      detail: row.warning,
      elementType: '',
      tag: '',
      guid: '',
      recommendation: '',
    })),
  ];
  if (id === 'revitNativeSync') return [
    ...asArray(report.revitNativeSync?.commandRows).map(row => ({
      recordType: 'command',
      check: row.commandClass || row.commandName,
      status: row.status,
      detail: row.detail,
      elementType: '',
      tag: '',
      guid: '',
      recommendation: '',
    })),
    ...asArray(report.revitNativeSync?.exportMappingRows).map(row => ({
      recordType: 'exportMapping',
      check: row.revitCategory,
      status: row.status,
      detail: asArray(row.warnings).join('; '),
      elementType: row.elementType,
      tag: row.tagParameter,
      guid: '',
      recommendation: row.propertySetName,
    })),
    ...asArray(report.revitNativeSync?.validationRows).map(row => ({
      recordType: 'validation',
      check: row.check,
      status: row.status,
      detail: row.detail,
      elementType: '',
      tag: '',
      guid: '',
      recommendation: '',
    })),
    ...asArray(report.revitNativeSync?.syncPreviewRows).map(row => ({
      recordType: 'syncPreview',
      check: '',
      status: row.status,
      detail: '',
      elementType: row.elementType,
      tag: row.tag || row.id,
      guid: row.guid,
      recommendation: row.recommendation,
    })),
    ...asArray(report.revitNativeSync?.warningRows).map(row => ({
      recordType: 'warning',
      check: row.id,
      status: row.severity,
      detail: row.warning,
      elementType: '',
      tag: '',
      guid: '',
      recommendation: '',
    })),
  ];
  if (id === 'autocadSyncReadiness') return [
    ...asArray(report.autocadSyncReadiness?.validationRows).map(row => ({
      recordType: 'validation',
      check: row.check,
      status: row.status,
      detail: row.detail,
      elementType: '',
      tag: '',
      guid: '',
      recommendation: '',
    })),
    ...asArray(report.autocadSyncReadiness?.syncPreviewRows).map(row => ({
      recordType: 'syncPreview',
      check: '',
      status: row.status,
      detail: '',
      elementType: row.elementType,
      tag: row.tag || row.id,
      guid: row.guid,
      recommendation: row.recommendation,
    })),
    ...asArray(report.autocadSyncReadiness?.warningRows).map(row => ({
      recordType: 'warning',
      check: row.id,
      status: row.severity,
      detail: row.warning,
      elementType: '',
      tag: '',
      guid: '',
      recommendation: '',
    })),
  ];
  if (id === 'autocadNativeSync') return [
    ...asArray(report.autocadNativeSync?.commandRows).map(row => ({
      recordType: 'command',
      check: row.commandClass || row.commandName,
      status: row.status,
      detail: row.detail,
      elementType: '',
      tag: row.commandName,
      guid: '',
      recommendation: '',
    })),
    ...asArray(report.autocadNativeSync?.exportMappingRows).map(row => ({
      recordType: 'exportMapping',
      check: row.autocadObjectType,
      status: row.status,
      detail: asArray(row.warnings).join('; '),
      elementType: row.elementType,
      tag: row.layerPattern || row.blockNamePattern,
      guid: row.dxfName,
      recommendation: row.propertySetName,
    })),
    ...asArray(report.autocadNativeSync?.validationRows).map(row => ({
      recordType: 'validation',
      check: row.check,
      status: row.status,
      detail: row.detail,
      elementType: '',
      tag: row.id,
      guid: '',
      recommendation: '',
    })),
    ...asArray(report.autocadNativeSync?.syncPreviewRows).map(row => ({
      recordType: 'syncPreview',
      check: '',
      status: row.status,
      detail: '',
      elementType: row.elementType,
      tag: row.tag || row.id,
      guid: row.guid,
      recommendation: row.recommendation,
    })),
    ...asArray(report.autocadNativeSync?.warningRows).map(row => ({
      recordType: 'warning',
      check: row.id,
      status: row.severity,
      detail: row.warning,
      elementType: '',
      tag: '',
      guid: '',
      recommendation: '',
    })),
  ];
  if (id === 'plantCadSyncReadiness') return [
    ...asArray(report.plantCadSyncReadiness?.descriptors).map(row => ({
      recordType: 'descriptor',
      connectorType: row.connectorType,
      check: 'Plant-CAD bridge descriptor',
      status: row.validation?.valid ? 'pass' : 'fail',
      detail: row.targetApplication,
      elementType: '',
      tag: '',
      guid: '',
      recommendation: asArray(row.warnings).join('; '),
    })),
    ...asArray(report.plantCadSyncReadiness?.validationRows).map(row => ({
      recordType: 'validation',
      connectorType: row.connectorType,
      check: row.check,
      status: row.status,
      detail: row.detail,
      elementType: '',
      tag: '',
      guid: '',
      recommendation: '',
    })),
    ...asArray(report.plantCadSyncReadiness?.syncPreviewRows).map(row => ({
      recordType: 'syncPreview',
      connectorType: row.connectorType,
      check: '',
      status: row.status,
      detail: '',
      elementType: row.elementType,
      tag: row.tag || row.id,
      guid: row.guid,
      recommendation: row.recommendation,
    })),
    ...asArray(report.plantCadSyncReadiness?.warningRows).map(row => ({
      recordType: 'warning',
      connectorType: row.connectorType,
      check: row.id,
      status: row.severity,
      detail: row.warning,
      elementType: '',
      tag: '',
      guid: '',
      recommendation: '',
    })),
  ];
  if (id === 'plantCadNativeSync') return [
    ...asArray(report.plantCadNativeSync?.commandRows).map(row => ({
      recordType: 'command',
      connectorType: row.connectorType,
      check: row.commandName,
      status: row.status,
      detail: row.detail,
      elementType: '',
      tag: row.id,
      guid: '',
      recommendation: '',
    })),
    ...asArray(report.plantCadNativeSync?.exportMappingRows).map(row => ({
      recordType: 'exportMapping',
      connectorType: '',
      check: row.plantObjectType,
      status: row.status,
      detail: asArray(row.warnings).join('; '),
      elementType: row.elementType,
      tag: row.nativeClasses,
      guid: row.quantityBasis,
      recommendation: row.propertySetName,
    })),
    ...asArray(report.plantCadNativeSync?.validationRows).map(row => ({
      recordType: 'validation',
      connectorType: row.connectorType,
      check: row.check,
      status: row.status,
      detail: row.detail,
      elementType: '',
      tag: row.id,
      guid: '',
      recommendation: '',
    })),
    ...asArray(report.plantCadNativeSync?.syncPreviewRows).map(row => ({
      recordType: 'syncPreview',
      connectorType: row.connectorType,
      check: '',
      status: row.status,
      detail: '',
      elementType: row.elementType,
      tag: row.tag || row.id,
      guid: row.guid,
      recommendation: row.recommendation,
    })),
    ...asArray(report.plantCadNativeSync?.warningRows).map(row => ({
      recordType: 'warning',
      connectorType: '',
      check: row.id,
      status: row.severity,
      detail: row.warning,
      elementType: '',
      tag: '',
      guid: '',
      recommendation: '',
    })),
  ];
  if (id === 'bimObjectLibrary') return [
    ...asArray(report.bimObjectLibrary?.familyRows).map(row => ({
      recordType: 'family',
      manufacturer: row.manufacturer,
      catalogNumber: row.catalogNumber,
      category: row.category,
      familyName: row.familyName,
      nativeFormat: row.nativeFormat,
      ifcClass: row.ifcClass,
      status: row.approvalStatus,
      warning: asArray(row.warnings).join('; '),
    })),
    ...asArray(report.bimObjectLibrary?.catalogCoverage?.rows).map(row => ({
      recordType: 'catalogCoverage',
      manufacturer: row.manufacturer,
      catalogNumber: row.catalogNumber,
      category: row.category,
      familyName: row.familyName,
      nativeFormat: row.nativeFormat,
      ifcClass: row.ifcClass,
      status: row.status,
      warning: asArray(row.warnings).join('; '),
    })),
  ];
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
  if (id === 'ibrPlantController') return [
    ...asArray(report.ibrPlantController?.resourceRows).map(row => ({
      recordType: 'resource',
      id: row.id,
      label: row.tag,
      scenarioId: '',
      checkType: row.resourceType,
      actualValue: row.ratedKw,
      limitValue: row.ratedKva,
      unit: 'kW/kVA',
      status: row.status,
      recommendation: row.notes,
    })),
    ...asArray(report.ibrPlantController?.capabilityRows).map(row => ({
      recordType: 'capability',
      id: row.id,
      label: row.scenarioLabel,
      scenarioId: row.scenarioId,
      checkType: row.controlMode,
      actualValue: row.pTotalKw,
      limitValue: row.qTotalKvar,
      unit: 'kW/kvar',
      status: row.status,
      recommendation: row.recommendation,
    })),
    ...asArray(report.ibrPlantController?.gridCodeRows).map(row => ({
      recordType: 'gridCode',
      id: row.id,
      label: row.label,
      scenarioId: row.scenarioId || '',
      checkType: row.checkType,
      actualValue: row.actualValue,
      limitValue: row.limitValue,
      unit: '',
      status: row.status,
      recommendation: row.recommendation,
    })),
    ...asArray(report.ibrPlantController?.warningRows).map(row => ({
      recordType: 'warning',
      id: row.sourceId || row.code,
      label: row.sourceTag || row.code,
      scenarioId: row.scenarioId || '',
      checkType: row.code,
      actualValue: '',
      limitValue: '',
      unit: '',
      status: row.severity,
      recommendation: row.message,
    })),
  ];
  if (id === 'emfExposure') return [
    ...asArray(report.emfExposure?.circuitRows).map(row => ({
      recordType: 'circuit',
      id: row.id,
      label: row.tag,
      xM: row.xM,
      yM: row.yM,
      bRms_uT: '',
      limit_uT: '',
      utilizationPct: '',
      status: row.status,
      recommendation: row.notes,
    })),
    ...asArray(report.emfExposure?.fieldRows).map(row => ({
      recordType: 'field',
      id: row.id,
      label: row.label,
      xM: row.xM,
      yM: row.yM,
      bRms_uT: row.bRms_uT,
      limit_uT: row.limit_uT,
      utilizationPct: row.utilizationPct,
      status: row.status,
      recommendation: row.recommendation,
    })),
    ...asArray(report.emfExposure?.profileRows).map(row => ({
      recordType: 'profile',
      id: row.id,
      label: `Profile ${row.distanceM} m`,
      xM: row.distanceM,
      yM: row.heightM,
      bRms_uT: row.bRms_uT,
      limit_uT: row.limit_uT,
      utilizationPct: row.utilizationPct,
      status: row.status,
      recommendation: '',
    })),
    ...asArray(report.emfExposure?.validationRows).map(row => ({
      recordType: 'validation',
      id: row.id,
      label: row.label,
      xM: '',
      yM: '',
      bRms_uT: row.calculatedB_uT,
      limit_uT: row.measuredB_uT,
      utilizationPct: row.differencePct,
      status: row.status,
      recommendation: row.recommendation,
    })),
    ...asArray(report.emfExposure?.warningRows).map(row => ({
      recordType: 'warning',
      id: row.sourceId || row.code,
      label: row.sourceTag || row.code,
      xM: '',
      yM: '',
      bRms_uT: '',
      limit_uT: '',
      utilizationPct: '',
      status: row.severity,
      recommendation: row.message,
    })),
  ];
  if (id === 'cathodicProtectionNetwork') return [
    ...asArray(report.cathodicProtectionNetwork?.structureRows).map(row => ({
      recordType: 'structure',
      id: row.id,
      label: row.tag,
      zone: row.zone,
      checkType: row.structureType,
      requiredCurrentA: row.requiredCurrentA,
      allocatedCurrentA: '',
      value: row.surfaceAreaM2,
      status: row.status,
      recommendation: row.notes,
    })),
    ...asArray(report.cathodicProtectionNetwork?.criteriaRows).map(row => ({
      recordType: 'criteria',
      id: row.id,
      label: row.structureTag || row.rectifierId,
      zone: row.zone,
      checkType: row.checkType,
      requiredCurrentA: row.requiredCurrentA,
      allocatedCurrentA: row.allocatedCurrentA,
      value: row.marginPct,
      status: row.status,
      recommendation: row.recommendation,
    })),
    ...asArray(report.cathodicProtectionNetwork?.polarizationRows).map(row => ({
      recordType: 'polarization',
      id: row.id,
      label: row.testStationRef,
      zone: '',
      checkType: 'polarization',
      requiredCurrentA: '',
      allocatedCurrentA: '',
      value: row.instantOffMv,
      status: row.status,
      recommendation: row.recommendation,
    })),
    ...asArray(report.cathodicProtectionNetwork?.potentialProfileRows).map(row => ({
      recordType: 'profile',
      id: row.id,
      label: row.structureTag,
      zone: row.zone,
      checkType: 'potentialProfile',
      requiredCurrentA: '',
      allocatedCurrentA: '',
      value: row.estimatedInstantOffMv,
      status: row.status,
      recommendation: row.recommendation,
    })),
    ...asArray(report.cathodicProtectionNetwork?.interferenceRows).map(row => ({
      recordType: 'interference',
      id: row.id,
      label: row.label,
      zone: row.zone,
      checkType: row.sourceType,
      requiredCurrentA: '',
      allocatedCurrentA: '',
      value: row.riskLevel,
      status: row.status,
      recommendation: row.notes,
    })),
    ...asArray(report.cathodicProtectionNetwork?.warningRows).map(row => ({
      recordType: 'warning',
      id: row.sourceId || row.code,
      label: row.sourceTag || row.code,
      zone: '',
      checkType: row.code,
      requiredCurrentA: '',
      allocatedCurrentA: '',
      value: '',
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
  if (id === 'voltageFlicker') return [
    ...asArray(report.voltageFlicker?.loadStepRows).map(row => ({
      recordType: 'loadStep',
      target: row.label,
      loadType: row.loadType,
      loadKw: row.loadKw,
      repetitionsPerHour: row.repetitionsPerHour,
      actualValue: '',
      limit: '',
      utilizationPct: '',
      status: '',
      source: '',
      recommendation: row.notes,
    })),
    ...asArray(report.voltageFlicker?.complianceRows).map(row => ({
      recordType: 'compliance',
      target: row.target,
      loadType: '',
      loadKw: '',
      repetitionsPerHour: '',
      actualValue: row.actualValue,
      limit: row.limit,
      utilizationPct: row.utilizationPct,
      status: row.status,
      source: row.source,
      recommendation: row.recommendation,
    })),
    ...asArray(report.voltageFlicker?.warningRows).map(row => ({
      recordType: 'warning',
      target: row.id,
      loadType: '',
      loadKw: '',
      repetitionsPerHour: '',
      actualValue: '',
      limit: '',
      utilizationPct: '',
      status: row.severity,
      source: '',
      recommendation: row.message,
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
  if (id === 'pricingFeedGovernance') return report.pricingFeedGovernance?.summary || {};
  if (id === 'cloudLibraryGovernance') return report.cloudLibraryGovernance?.summary || {};
  if (id === 'fieldCommissioning') return report.fieldCommissioning?.summary || {};
  if (id === 'bimRoundTrip') return report.bimRoundTrip?.summary || {};
  if (id === 'bimConnectorReadiness') return report.bimConnectorReadiness?.summary || {};
  if (id === 'nativeBimConnectorKit') return report.nativeBimConnectorKit?.summary || {};
  if (id === 'revitSyncReadiness') return report.revitSyncReadiness?.summary || {};
  if (id === 'revitNativeSync') return report.revitNativeSync?.summary || {};
  if (id === 'autocadSyncReadiness') return report.autocadSyncReadiness?.summary || {};
  if (id === 'autocadNativeSync') return report.autocadNativeSync?.summary || {};
  if (id === 'plantCadSyncReadiness') return report.plantCadSyncReadiness?.summary || {};
  if (id === 'plantCadNativeSync') return report.plantCadNativeSync?.summary || {};
  if (id === 'bimObjectLibrary') return report.bimObjectLibrary?.summary || {};
  if (id === 'shortCircuit') return report.shortCircuit?.summary || {};
  if (id === 'arcFlash') return report.arcFlash?.summary || {};
  if (id === 'motorStart') return report.motorStart?.summary || {};
  if (id === 'harmonicStudy') return report.harmonicStudy?.summary || {};
  if (id === 'capacitorBankDuty') return report.capacitorBankDuty?.summary || {};
  if (id === 'reliabilityNetwork') return report.reliabilityNetwork?.summary || {};
  if (id === 'transientStability') return report.transientStability?.summary || {};
  if (id === 'ibrPlantController') return report.ibrPlantController?.summary || {};
  if (id === 'emfExposure') return report.emfExposure?.summary || {};
  if (id === 'cathodicProtectionNetwork') return report.cathodicProtectionNetwork?.summary || {};
  if (id === 'protectionSettingSheets') return report.protectionSettingSheets?.summary || {};
  if (id === 'loadDemandGovernance') return report.loadDemandGovernance?.summary || {};
  if (id === 'transformerFeederSizing') return report.transformerFeederSizing?.summary || {};
  if (id === 'voltageDropStudy') return report.voltageDropStudy?.summary || {};
  if (id === 'voltageFlicker') return report.voltageFlicker?.summary || {};
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
      if (id === 'pricingFeedGovernance') return report.pricingFeedGovernance;
      if (id === 'cloudLibraryGovernance') return report.cloudLibraryGovernance;
      if (id === 'fieldCommissioning') return report.fieldCommissioning;
      if (id === 'bimRoundTrip') return report.bimRoundTrip;
  if (id === 'bimConnectorReadiness') return report.bimConnectorReadiness;
  if (id === 'nativeBimConnectorKit') return report.nativeBimConnectorKit;
  if (id === 'revitSyncReadiness') return report.revitSyncReadiness;
  if (id === 'revitNativeSync') return report.revitNativeSync;
  if (id === 'autocadSyncReadiness') return report.autocadSyncReadiness;
  if (id === 'autocadNativeSync') return report.autocadNativeSync;
  if (id === 'plantCadSyncReadiness') return report.plantCadSyncReadiness;
  if (id === 'plantCadNativeSync') return report.plantCadNativeSync;
  if (id === 'bimObjectLibrary') return report.bimObjectLibrary;
      if (id === 'shortCircuit') return report.shortCircuit;
      if (id === 'arcFlash') return report.arcFlash;
      if (id === 'motorStart') return report.motorStart;
      if (id === 'harmonicStudy') return report.harmonicStudy;
      if (id === 'capacitorBankDuty') return report.capacitorBankDuty;
      if (id === 'reliabilityNetwork') return report.reliabilityNetwork;
      if (id === 'transientStability') return report.transientStability;
      if (id === 'ibrPlantController') return report.ibrPlantController;
      if (id === 'emfExposure') return report.emfExposure;
      if (id === 'cathodicProtectionNetwork') return report.cathodicProtectionNetwork;
      if (id === 'protectionSettingSheets') return report.protectionSettingSheets;
      if (id === 'loadDemandGovernance') return report.loadDemandGovernance;
  if (id === 'transformerFeederSizing') return report.transformerFeederSizing;
  if (id === 'voltageDropStudy') return report.voltageDropStudy;
  if (id === 'voltageFlicker') return report.voltageFlicker;
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
  if (report.cloudLibraryGovernance) {
    checks.push({
      id: 'cloud-component-library-governance',
      description: 'Organization component library releases, approval state, and project adoption metadata are included.',
      status: sectionStatus('cloudLibraryGovernance', report),
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
  if (report.nativeBimConnectorKit) {
    checks.push({
      id: 'native-bim-connector-kit',
      description: 'Native BIM/CAD connector starter kit descriptors, sample payloads, and install readiness are included.',
      status: sectionStatus('nativeBimConnectorKit', report),
    });
  }
  if (report.revitSyncReadiness) {
    checks.push({
      id: 'revit-sync-readiness',
      description: 'Revit connector bridge readiness, validation rows, and sync preview rows are included.',
      status: sectionStatus('revitSyncReadiness', report),
    });
  }
  if (report.revitNativeSync) {
    checks.push({
      id: 'revit-native-sync',
      description: 'Functional Revit add-in command coverage, export mapping, and sync preview rows are included.',
      status: sectionStatus('revitNativeSync', report),
    });
  }
  if (report.autocadSyncReadiness) {
    checks.push({
      id: 'autocad-sync-readiness',
      description: 'AutoCAD connector bridge readiness, validation rows, and sync preview rows are included.',
      status: sectionStatus('autocadSyncReadiness', report),
    });
  }
  if (report.autocadNativeSync) {
    checks.push({
      id: 'autocad-native-sync',
      description: 'Functional AutoCAD add-in command coverage, export mapping, and sync preview rows are included.',
      status: sectionStatus('autocadNativeSync', report),
    });
  }
  if (report.plantCadSyncReadiness) {
    checks.push({
      id: 'plantcad-sync-readiness',
      description: 'AVEVA / SmartPlant connector bridge readiness, validation rows, and sync preview rows are included.',
      status: sectionStatus('plantCadSyncReadiness', report),
    });
  }
  if (report.plantCadNativeSync) {
    checks.push({
      id: 'plantcad-native-sync',
      description: 'Functional AVEVA / SmartPlant command coverage, export mapping, and sync preview rows are included.',
      status: sectionStatus('plantCadNativeSync', report),
    });
  }
  if (report.bimObjectLibrary) {
    checks.push({
      id: 'bim-object-library',
      description: 'BIM object family metadata, catalog coverage, and connector mapping hints are included.',
      status: sectionStatus('bimObjectLibrary', report),
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
  if (report.ibrPlantController) {
    checks.push({
      id: 'ibr-plant-controller',
      description: 'DER / IBR plant controller resources, grid-code curves, scenarios, and warning rows are included.',
      status: sectionStatus('ibrPlantController', report),
    });
  }
  if (report.emfExposure) {
    checks.push({
      id: 'emf-exposure',
      description: 'EMF exposure circuits, field rows, validation rows, and warning rows are included.',
      status: sectionStatus('emfExposure', report),
    });
  }
  if (report.cathodicProtectionNetwork) {
    checks.push({
      id: 'cathodic-protection-network',
      description: 'Cathodic protection network structures, anodes, rectifiers, polarization, interference, and profile rows are included.',
      status: sectionStatus('cathodicProtectionNetwork', report),
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
  if (report.voltageFlicker) {
    checks.push({
      id: 'voltage-flicker-study',
      description: 'Voltage flicker study case, Pst/Plt compliance rows, load steps, and warnings are included.',
      status: sectionStatus('voltageFlicker', report),
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
  const pricingFeedGovernance = pkg.pricingFeedGovernance || null;
  const cloudLibraryGovernance = pkg.cloudLibraryGovernance || null;
  const fieldCommissioning = pkg.fieldCommissioning || null;
  const bimRoundTrip = pkg.bimRoundTrip || null;
  const bimConnectorReadiness = pkg.bimConnectorReadiness || null;
  const nativeBimConnectorKit = pkg.nativeBimConnectorKit || null;
  const revitSyncReadiness = pkg.revitSyncReadiness || null;
  const revitNativeSync = pkg.revitNativeSync || null;
  const autocadSyncReadiness = pkg.autocadSyncReadiness || null;
  const autocadNativeSync = pkg.autocadNativeSync || null;
  const plantCadSyncReadiness = pkg.plantCadSyncReadiness || null;
  const plantCadNativeSync = pkg.plantCadNativeSync || null;
  const bimObjectLibrary = pkg.bimObjectLibrary || null;
  const shortCircuit = pkg.shortCircuit || null;
  const arcFlash = pkg.arcFlash || null;
  const motorStart = pkg.motorStart || null;
  const harmonicStudy = pkg.harmonicStudy || null;
  const capacitorBankDuty = pkg.capacitorBankDuty || null;
  const reliabilityNetwork = pkg.reliabilityNetwork || null;
  const transientStability = pkg.transientStability || null;
  const ibrPlantController = pkg.ibrPlantController || null;
  const emfExposure = pkg.emfExposure || null;
  const cathodicProtectionNetwork = pkg.cathodicProtectionNetwork || null;
  const protectionSettingSheets = pkg.protectionSettingSheets || null;
  const loadDemandGovernance = pkg.loadDemandGovernance || null;
  const transformerFeederSizing = pkg.transformerFeederSizing || null;
  const voltageDropStudy = pkg.voltageDropStudy || null;
  const voltageFlicker = pkg.voltageFlicker || null;
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
  ${pricingFeedGovernance ? `<h2>Pricing Feed and Quote Governance</h2>
  <p class="meta">${escapeHtml(pricingFeedGovernance.summary?.approvedRowCount || 0)} approved pricing row(s), ${escapeHtml(pricingFeedGovernance.summary?.unpricedLineCount || 0)} unpriced/generic estimate line(s), ${escapeHtml(pricingFeedGovernance.summary?.conflictCount || 0)} conflict(s).</p>` : ''}
  ${cloudLibraryGovernance ? `<h2>Cloud Component Library Governance</h2>
  <p class="meta">${escapeHtml(cloudLibraryGovernance.summary?.releaseCount || 0)} release(s), ${escapeHtml(cloudLibraryGovernance.summary?.approvedReleaseCount || 0)} approved, ${escapeHtml(cloudLibraryGovernance.summary?.warningCount || 0)} warning(s).</p>` : ''}
  ${fieldCommissioning ? `<h2>Field Verification</h2>
  <p class="meta">${escapeHtml(fieldCommissioning.summary?.openItems || 0)} open item(s), ${escapeHtml(fieldCommissioning.summary?.verified || 0)} verified target(s), ${escapeHtml(fieldCommissioning.summary?.attachmentCount || 0)} attachment record(s).</p>` : ''}
  ${bimRoundTrip ? `<h2>BIM Coordination</h2>
  <p class="meta">${escapeHtml(bimRoundTrip.summary?.elementCount || 0)} imported element(s), ${escapeHtml(bimRoundTrip.summary?.changedGroups || 0)} changed quantity group(s), ${escapeHtml(bimRoundTrip.summary?.openIssues || 0)} open issue(s).</p>` : ''}
  ${bimConnectorReadiness ? `<h2>BIM/CAD Connector Readiness</h2>
  <p class="meta">${escapeHtml(bimConnectorReadiness.summary?.packageCount || 0)} connector package(s), ${escapeHtml(bimConnectorReadiness.summary?.quantityDeltas || 0)} quantity delta(s), ${escapeHtml(bimConnectorReadiness.summary?.mappingDeltas || 0)} mapping delta(s).</p>` : ''}
  ${nativeBimConnectorKit ? `<h2>Native BIM/CAD Connector Starter Kit</h2>
  <p class="meta">${escapeHtml(nativeBimConnectorKit.summary?.descriptorCount || 0)} descriptor(s), ${escapeHtml(nativeBimConnectorKit.summary?.samplePayloadCount || 0)} sample payload(s), ${escapeHtml(nativeBimConnectorKit.summary?.missingChecklistItems || 0)} checklist gap(s).</p>` : ''}
  ${revitSyncReadiness ? `<h2>Revit Connector Sync Readiness</h2>
  <p class="meta">${escapeHtml(revitSyncReadiness.summary?.validationStatus || 'review')} status, ${escapeHtml(revitSyncReadiness.summary?.acceptedPreviewRows || 0)} accepted preview row(s), ${escapeHtml(revitSyncReadiness.summary?.rejectedPreviewRows || 0)} rejected row(s), ${escapeHtml(revitSyncReadiness.summary?.warningCount || 0)} warning(s).</p>` : ''}
  ${revitNativeSync ? `<h2>Functional Revit Add-In Sync Readiness</h2>
  <p class="meta">${escapeHtml(revitNativeSync.summary?.status || 'review')} status, ${escapeHtml(revitNativeSync.summary?.commandReadyCount || 0)} of ${escapeHtml(revitNativeSync.summary?.commandCount || 0)} command(s) ready, ${escapeHtml(revitNativeSync.summary?.readyMappingCount || 0)} of ${escapeHtml(revitNativeSync.summary?.exportMappingCount || 0)} export mapping(s) ready, ${escapeHtml(revitNativeSync.summary?.warningCount || 0)} warning(s).</p>` : ''}
  ${autocadSyncReadiness ? `<h2>AutoCAD Connector Sync Readiness</h2>
  <p class="meta">${escapeHtml(autocadSyncReadiness.summary?.validationStatus || 'review')} status, ${escapeHtml(autocadSyncReadiness.summary?.acceptedPreviewRows || 0)} accepted preview row(s), ${escapeHtml(autocadSyncReadiness.summary?.rejectedPreviewRows || 0)} rejected row(s), ${escapeHtml(autocadSyncReadiness.summary?.warningCount || 0)} warning(s).</p>` : ''}
  ${autocadNativeSync ? `<h2>Functional AutoCAD Add-In Sync Readiness</h2>
  <p class="meta">${escapeHtml(autocadNativeSync.summary?.status || 'review')} status, ${escapeHtml(autocadNativeSync.summary?.commandReadyCount || 0)} of ${escapeHtml(autocadNativeSync.summary?.commandCount || 0)} command(s) ready, ${escapeHtml(autocadNativeSync.summary?.readyMappingCount || 0)} of ${escapeHtml(autocadNativeSync.summary?.exportMappingCount || 0)} export mapping(s) ready, ${escapeHtml(autocadNativeSync.summary?.warningCount || 0)} warning(s).</p>` : ''}
  ${plantCadSyncReadiness ? `<h2>Plant CAD Connector Sync Readiness</h2>
  <p class="meta">${escapeHtml(plantCadSyncReadiness.summary?.validationStatus || 'review')} status, ${escapeHtml(plantCadSyncReadiness.summary?.descriptorCount || 0)} descriptor(s), ${escapeHtml(plantCadSyncReadiness.summary?.acceptedPreviewRows || 0)} accepted preview row(s), ${escapeHtml(plantCadSyncReadiness.summary?.rejectedPreviewRows || 0)} rejected row(s), ${escapeHtml(plantCadSyncReadiness.summary?.warningCount || 0)} warning(s).</p>` : ''}
  ${plantCadNativeSync ? `<h2>Functional Plant CAD Add-In Sync Readiness</h2>
  <p class="meta">${escapeHtml(plantCadNativeSync.summary?.status || 'review')} status, ${escapeHtml(plantCadNativeSync.summary?.commandReadyCount || 0)} of ${escapeHtml(plantCadNativeSync.summary?.commandCount || 0)} command(s) ready, ${escapeHtml(plantCadNativeSync.summary?.readyMappingCount || 0)} of ${escapeHtml(plantCadNativeSync.summary?.exportMappingCount || 0)} export mapping(s) ready, ${escapeHtml(plantCadNativeSync.summary?.warningCount || 0)} warning(s).</p>` : ''}
  ${bimObjectLibrary ? `<h2>BIM Object Library and Family Metadata</h2>
  <p class="meta">${escapeHtml(bimObjectLibrary.summary?.familyCount || 0)} family row(s), ${escapeHtml(bimObjectLibrary.summary?.readyCatalogRows || 0)} ready catalog row(s), ${escapeHtml(bimObjectLibrary.summary?.missingFamilyCount || 0)} missing family mapping(s).</p>` : ''}
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
  ${ibrPlantController ? `<h2>DER / IBR Plant Controller and Grid-Code Scenarios</h2>
  <p class="meta">${escapeHtml(ibrPlantController.summary?.enabledResourceCount || 0)} enabled resource(s), ${escapeHtml(ibrPlantController.summary?.scenarioCount || 0)} scenario(s), ${escapeHtml(ibrPlantController.summary?.warningCount || 0)} warning(s).</p>` : ''}
  ${emfExposure ? `<h2>EMF Exposure Study Basis</h2>
  <p class="meta">${escapeHtml(emfExposure.summary?.measurementPointCount || 0)} point(s), max field ${escapeHtml(emfExposure.summary?.maxBRms_uT ?? 'n/a')} uT, ${escapeHtml(emfExposure.summary?.fail || 0)} fail, ${escapeHtml(emfExposure.summary?.warn || 0)} warning, ${escapeHtml(emfExposure.summary?.warningCount || 0)} warning row(s).</p>` : ''}
  ${cathodicProtectionNetwork ? `<h2>Cathodic Protection Network and Interference Model</h2>
  <p class="meta">${escapeHtml(cathodicProtectionNetwork.summary?.structureCount || 0)} structure(s), ${escapeHtml(cathodicProtectionNetwork.summary?.anodeCount || 0)} anode row(s), ${escapeHtml(cathodicProtectionNetwork.summary?.rectifierCount || 0)} rectifier row(s), ${escapeHtml(cathodicProtectionNetwork.summary?.warningCount || 0)} warning row(s).</p>` : ''}
  ${protectionSettingSheets ? `<h2>Protection Setting Sheets</h2>
  <p class="meta">${escapeHtml(protectionSettingSheets.summary?.deviceCount || 0)} device row(s), ${escapeHtml(protectionSettingSheets.summary?.functionCount || 0)} function row(s), ${escapeHtml(protectionSettingSheets.summary?.missingData || 0)} missing-data item(s).</p>` : ''}
  ${loadDemandGovernance ? `<h2>Panel and Load Demand Basis</h2>
  <p class="meta">${escapeHtml(loadDemandGovernance.summary?.loadCount || 0)} load(s), ${escapeHtml(loadDemandGovernance.summary?.panelCount || 0)} panel(s), ${escapeHtml(loadDemandGovernance.summary?.governedDemandKw || 0)} governed kW, ${escapeHtml(loadDemandGovernance.summary?.warningCount || 0)} warning(s).</p>` : ''}
  ${transformerFeederSizing ? `<h2>Transformer and Feeder Sizing Basis</h2>
  <p class="meta">${escapeHtml(transformerFeederSizing.summary?.selectedTransformerKva || 0)} kVA transformer, feeder ${escapeHtml(transformerFeederSizing.summary?.selectedFeederConductor || 'n/a')}, ${escapeHtml(transformerFeederSizing.summary?.alternativeCount || 0)} alternative row(s), ${escapeHtml(transformerFeederSizing.summary?.warningCount || 0)} warning(s).</p>` : ''}
  ${voltageDropStudy ? `<h2>Voltage Drop Study Basis</h2>
  <p class="meta">${escapeHtml(voltageDropStudy.summary?.total || 0)} cable row(s), ${escapeHtml(voltageDropStudy.summary?.fail || 0)} fail, ${escapeHtml(voltageDropStudy.summary?.warn || 0)} warning, ${escapeHtml(voltageDropStudy.summary?.missingData || 0)} missing-data row(s).</p>` : ''}
  ${voltageFlicker ? `<h2>Voltage Flicker Study Basis</h2>
  <p class="meta">${escapeHtml(voltageFlicker.summary?.loadStepCount || 0)} load step(s), worst Pst ${escapeHtml(voltageFlicker.summary?.worstPst ?? 'n/a')}, Plt ${escapeHtml(voltageFlicker.summary?.plt ?? 'n/a')}, ${escapeHtml(voltageFlicker.summary?.fail || 0)} fail, ${escapeHtml(voltageFlicker.summary?.warn || 0)} warning.</p>` : ''}
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
    pricingFeedGovernance: report.pricingFeedGovernance || null,
    cloudLibraryGovernance: report.cloudLibraryGovernance || null,
    fieldCommissioning: report.fieldCommissioning || null,
    bimRoundTrip: report.bimRoundTrip || null,
    bimConnectorReadiness: report.bimConnectorReadiness || null,
    nativeBimConnectorKit: report.nativeBimConnectorKit || null,
    revitSyncReadiness: report.revitSyncReadiness || null,
    revitNativeSync: report.revitNativeSync || null,
    autocadSyncReadiness: report.autocadSyncReadiness || null,
    autocadNativeSync: report.autocadNativeSync || null,
    plantCadSyncReadiness: report.plantCadSyncReadiness || null,
    plantCadNativeSync: report.plantCadNativeSync || null,
    bimObjectLibrary: report.bimObjectLibrary || null,
    shortCircuit: report.shortCircuit || null,
    arcFlash: report.arcFlash || null,
    motorStart: report.motorStart || null,
    harmonicStudy: report.harmonicStudy || null,
    capacitorBankDuty: report.capacitorBankDuty || null,
    reliabilityNetwork: report.reliabilityNetwork || null,
    transientStability: report.transientStability || null,
    ibrPlantController: report.ibrPlantController || null,
    emfExposure: report.emfExposure || null,
    cathodicProtectionNetwork: report.cathodicProtectionNetwork || null,
    protectionSettingSheets: report.protectionSettingSheets || null,
    loadDemandGovernance: report.loadDemandGovernance || null,
    transformerFeederSizing: report.transformerFeederSizing || null,
    voltageDropStudy: report.voltageDropStudy || null,
    voltageFlicker: report.voltageFlicker || null,
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
        pricingFeedGovernance: pkg.pricingFeedGovernance ? {
          summary: pkg.pricingFeedGovernance.summary,
          warnings: asArray(pkg.pricingFeedGovernance.warnings).slice(0, 50),
          unresolved: [
            ...asArray(pkg.pricingFeedGovernance.unpricedRows).slice(0, 50),
            ...asArray(pkg.pricingFeedGovernance.conflictRows).slice(0, 50),
            ...asArray(pkg.pricingFeedGovernance.expiredRows).slice(0, 50),
          ],
        } : null,
        cloudLibraryGovernance: pkg.cloudLibraryGovernance ? {
          summary: pkg.cloudLibraryGovernance.summary,
          warnings: asArray(pkg.cloudLibraryGovernance.warnings).slice(0, 50),
          subscription: pkg.cloudLibraryGovernance.subscription,
          releases: asArray(pkg.cloudLibraryGovernance.releases).map(row => ({
            id: row.id,
            workspaceId: row.workspaceId,
            releaseTag: row.releaseTag,
            name: row.name,
            status: row.status,
            approvalStatus: row.approvalStatus,
            componentCount: row.summary?.componentCount || 0,
          })),
          unresolved: [
            ...asArray(pkg.cloudLibraryGovernance.validationRows).filter(row => row.status !== 'pass'),
            ...asArray(pkg.cloudLibraryGovernance.warningRows),
          ].slice(0, 50),
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
        nativeBimConnectorKit: pkg.nativeBimConnectorKit ? {
          summary: pkg.nativeBimConnectorKit.summary,
          warnings: asArray(pkg.nativeBimConnectorKit.warnings).slice(0, 50),
          descriptors: asArray(pkg.nativeBimConnectorKit.descriptors).map(row => ({
            connectorType: row.connectorType,
            targetApplication: row.targetApplication,
            targetVersion: row.targetVersion,
            contractVersion: row.contractVersion,
            templateFiles: row.templateFiles,
          })),
          unresolved: asArray(pkg.nativeBimConnectorKit.installChecklist)
            .filter(row => row.status !== 'pass')
            .slice(0, 50),
        } : null,
        revitSyncReadiness: pkg.revitSyncReadiness ? {
          summary: pkg.revitSyncReadiness.summary,
          warnings: asArray(pkg.revitSyncReadiness.warnings).slice(0, 50),
          descriptor: pkg.revitSyncReadiness.descriptor,
          unresolved: [
            ...asArray(pkg.revitSyncReadiness.validationRows).filter(row => row.status !== 'pass'),
            ...asArray(pkg.revitSyncReadiness.syncPreviewRows).filter(row => row.status !== 'accepted'),
            ...asArray(pkg.revitSyncReadiness.quantityDeltas),
            ...asArray(pkg.revitSyncReadiness.mappingDeltas),
          ].slice(0, 50),
        } : null,
        revitNativeSync: pkg.revitNativeSync ? {
          summary: pkg.revitNativeSync.summary,
          warnings: asArray(pkg.revitNativeSync.warnings).slice(0, 50),
          nativeSyncCase: pkg.revitNativeSync.nativeSyncCase,
          sourceManifest: pkg.revitNativeSync.sourceManifest,
          unresolved: [
            ...asArray(pkg.revitNativeSync.commandRows).filter(row => row.status !== 'pass'),
            ...asArray(pkg.revitNativeSync.exportMappingRows).filter(row => row.status !== 'ready'),
            ...asArray(pkg.revitNativeSync.validationRows).filter(row => row.status !== 'pass'),
            ...asArray(pkg.revitNativeSync.syncPreviewRows).filter(row => row.status !== 'accepted'),
            ...asArray(pkg.revitNativeSync.quantityDeltas),
            ...asArray(pkg.revitNativeSync.mappingDeltas),
          ].slice(0, 50),
        } : null,
        autocadSyncReadiness: pkg.autocadSyncReadiness ? {
          summary: pkg.autocadSyncReadiness.summary,
          warnings: asArray(pkg.autocadSyncReadiness.warnings).slice(0, 50),
          descriptor: pkg.autocadSyncReadiness.descriptor,
          unresolved: [
            ...asArray(pkg.autocadSyncReadiness.validationRows).filter(row => row.status !== 'pass'),
            ...asArray(pkg.autocadSyncReadiness.syncPreviewRows).filter(row => row.status !== 'accepted'),
            ...asArray(pkg.autocadSyncReadiness.quantityDeltas),
            ...asArray(pkg.autocadSyncReadiness.mappingDeltas),
          ].slice(0, 50),
        } : null,
        autocadNativeSync: pkg.autocadNativeSync ? {
          summary: pkg.autocadNativeSync.summary,
          warnings: asArray(pkg.autocadNativeSync.warnings).slice(0, 50),
          nativeSyncCase: pkg.autocadNativeSync.nativeSyncCase,
          sourceManifest: pkg.autocadNativeSync.sourceManifest,
          unresolved: [
            ...asArray(pkg.autocadNativeSync.commandRows).filter(row => row.status !== 'pass'),
            ...asArray(pkg.autocadNativeSync.exportMappingRows).filter(row => row.status !== 'ready'),
            ...asArray(pkg.autocadNativeSync.validationRows).filter(row => row.status !== 'pass'),
            ...asArray(pkg.autocadNativeSync.syncPreviewRows).filter(row => row.status !== 'accepted'),
            ...asArray(pkg.autocadNativeSync.quantityDeltas),
            ...asArray(pkg.autocadNativeSync.mappingDeltas),
          ].slice(0, 50),
        } : null,
        plantCadSyncReadiness: pkg.plantCadSyncReadiness ? {
          summary: pkg.plantCadSyncReadiness.summary,
          warnings: asArray(pkg.plantCadSyncReadiness.warnings).slice(0, 50),
          descriptors: asArray(pkg.plantCadSyncReadiness.descriptors).map(row => ({
            connectorType: row.connectorType,
            targetApplication: row.targetApplication,
            targetVersion: row.targetVersion,
            contractVersion: row.contractVersion,
            templateFiles: row.templateFiles,
          })),
          unresolved: [
            ...asArray(pkg.plantCadSyncReadiness.validationRows).filter(row => row.status !== 'pass'),
            ...asArray(pkg.plantCadSyncReadiness.syncPreviewRows).filter(row => row.status !== 'accepted'),
            ...asArray(pkg.plantCadSyncReadiness.quantityDeltas),
            ...asArray(pkg.plantCadSyncReadiness.mappingDeltas),
          ].slice(0, 50),
        } : null,
        plantCadNativeSync: pkg.plantCadNativeSync ? {
          summary: pkg.plantCadNativeSync.summary,
          warnings: asArray(pkg.plantCadNativeSync.warnings).slice(0, 50),
          nativeSyncCase: pkg.plantCadNativeSync.nativeSyncCase,
          sourceManifest: pkg.plantCadNativeSync.sourceManifest,
          unresolved: [
            ...asArray(pkg.plantCadNativeSync.commandRows).filter(row => row.status !== 'pass'),
            ...asArray(pkg.plantCadNativeSync.exportMappingRows).filter(row => row.status !== 'ready'),
            ...asArray(pkg.plantCadNativeSync.validationRows).filter(row => row.status !== 'pass'),
            ...asArray(pkg.plantCadNativeSync.syncPreviewRows).filter(row => row.status !== 'accepted'),
            ...asArray(pkg.plantCadNativeSync.quantityDeltas),
            ...asArray(pkg.plantCadNativeSync.mappingDeltas),
          ].slice(0, 50),
        } : null,
        bimObjectLibrary: pkg.bimObjectLibrary ? {
          summary: pkg.bimObjectLibrary.summary,
          warnings: asArray(pkg.bimObjectLibrary.warnings).slice(0, 50),
          unresolved: [
            ...asArray(pkg.bimObjectLibrary.catalogCoverage?.rows)
              .filter(row => row.status !== 'ready')
              .slice(0, 50),
            ...asArray(pkg.bimObjectLibrary.connectorHints)
              .filter(row => row.status === 'genericPlaceholder')
              .slice(0, 50),
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
        ibrPlantController: pkg.ibrPlantController ? {
          summary: pkg.ibrPlantController.summary,
          plantCase: pkg.ibrPlantController.plantCase,
          warnings: asArray(pkg.ibrPlantController.warningRows).slice(0, 50),
          unresolved: [
            ...asArray(pkg.ibrPlantController.capabilityRows)
              .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData'),
            ...asArray(pkg.ibrPlantController.gridCodeRows)
              .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData'),
            ...asArray(pkg.ibrPlantController.warningRows),
          ].slice(0, 50),
        } : null,
        emfExposure: pkg.emfExposure ? {
          summary: pkg.emfExposure.summary,
          studyCase: pkg.emfExposure.studyCase,
          warnings: asArray(pkg.emfExposure.warningRows).slice(0, 50),
          unresolved: [
            ...asArray(pkg.emfExposure.fieldRows)
              .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData'),
            ...asArray(pkg.emfExposure.validationRows)
              .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData'),
            ...asArray(pkg.emfExposure.warningRows),
          ].slice(0, 50),
        } : null,
        cathodicProtectionNetwork: pkg.cathodicProtectionNetwork ? {
          summary: pkg.cathodicProtectionNetwork.summary,
          networkCase: pkg.cathodicProtectionNetwork.networkCase,
          warnings: asArray(pkg.cathodicProtectionNetwork.warningRows).slice(0, 50),
          unresolved: [
            ...asArray(pkg.cathodicProtectionNetwork.criteriaRows)
              .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData'),
            ...asArray(pkg.cathodicProtectionNetwork.polarizationRows)
              .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData'),
            ...asArray(pkg.cathodicProtectionNetwork.interferenceRows)
              .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData'),
            ...asArray(pkg.cathodicProtectionNetwork.warningRows),
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
        voltageFlicker: pkg.voltageFlicker ? {
          summary: pkg.voltageFlicker.summary,
          studyCase: pkg.voltageFlicker.studyCase,
          warnings: asArray(pkg.voltageFlicker.warningRows).slice(0, 50),
          unresolved: [
            ...asArray(pkg.voltageFlicker.complianceRows)
              .filter(row => row.status === 'warn' || row.status === 'fail' || row.status === 'missingData'),
            ...asArray(pkg.voltageFlicker.warningRows)
              .filter(row => row.severity === 'missingData' || row.severity === 'warning'),
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
