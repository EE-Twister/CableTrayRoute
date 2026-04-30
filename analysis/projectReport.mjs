/**
 * Unified Project Report Generator
 *
 * Aggregates results from every major CableTrayRoute analysis module into a
 * single structured report object that can be rendered as HTML, exported to
 * PDF (via window.print()), or downloaded as JSON.
 *
 * Sections generated:
 *   1. Project Summary       — counts, name, date
 *   2. Cable Schedule        — all cables with routing status
 *   3. Raceway Fill          — tray/conduit utilisation vs NEC limits
 *   4. Clash Detection       — hard & soft clashes (via clashDetect.mjs)
 *   5. Spool Sheets Summary  — prefab groups and material totals
 *   6. Validation            — any project-level warnings / errors
 *
 * References:
 *   NEC 2023 §392.22 — Cable tray fill limits
 *   NEMA VE 2-2013 §8.4 — Tray clearances
 */

import { detectClashes, overallSeverity } from './clashDetect.mjs';
import { buildHeatTraceReport } from './heatTraceReport.mjs';
import { buildHeatTraceInstallationPackage } from './heatTraceInstallationPackage.mjs';
import { buildHeatTraceAdvancedPackage, renderHeatTraceAdvancedHTML } from './heatTraceAdvancedAssets.mjs';
import { buildEquipmentEvaluationPackage, renderEquipmentEvaluationHTML } from './equipmentEvaluation.mjs';
import { buildAdvancedGroundingPackage, renderAdvancedGroundingHTML } from './advancedGrounding.mjs';
import { buildCableThermalEnvironmentPackage, renderCableThermalEnvironmentHTML } from './cableThermalEnvironment.mjs';
import { buildProductCatalogGovernancePackage, renderProductCatalogGovernanceHTML } from './productCatalog.mjs';
import { buildPricingFeedGovernancePackage, renderPricingFeedGovernanceHTML } from './pricingFeedGovernance.mjs';
import { buildCloudLibraryGovernancePackage, renderCloudLibraryGovernanceHTML } from './cloudComponentLibraryGovernance.mjs';
import { buildFieldCommissioningPackage, renderFieldCommissioningHTML } from './fieldCommissioning.mjs';
import { buildBimRoundTripPackage, renderBimRoundTripHTML } from './bimRoundTrip.mjs';
import { buildConnectorReadinessPackage, renderConnectorReadinessHTML } from './bimConnectorContract.mjs';
import { buildNativeConnectorKitPackage, renderNativeConnectorKitHTML } from './nativeBimConnectorKit.mjs';
import { buildBimObjectLibraryPackage, renderBimObjectLibraryHTML } from './bimObjectLibrary.mjs';
import { buildRevitNativeSyncPackage, buildRevitSyncReadinessPackage, renderRevitNativeSyncHTML, renderRevitSyncReadinessHTML } from './revitConnectorBridge.mjs';
import { buildAutoCadNativeSyncPackage, buildAutoCadSyncReadinessPackage, renderAutoCadNativeSyncHTML, renderAutoCadSyncReadinessHTML } from './autocadConnectorBridge.mjs';
import { buildPlantCadNativeSyncPackage, buildPlantCadSyncReadinessPackage, renderPlantCadNativeSyncHTML, renderPlantCadSyncReadinessHTML } from './plantCadConnectorBridge.mjs';
import { buildOptimalPowerFlowPackage, renderOptimalPowerFlowHTML } from './optimalPowerFlow.mjs';
import { buildLoadFlowStudyPackage, renderLoadFlowStudyHTML, LOAD_FLOW_STUDY_CASE_VERSION } from './loadFlowStudyCase.mjs';
import { buildShortCircuitStudyPackage, renderShortCircuitStudyHTML, SHORT_CIRCUIT_STUDY_CASE_VERSION } from './shortCircuitStudyCase.mjs';
import { buildArcFlashStudyPackage, renderArcFlashStudyHTML, ARC_FLASH_STUDY_CASE_VERSION } from './arcFlashStudyCase.mjs';
import { buildMotorStartStudyPackage, renderMotorStartStudyHTML, MOTOR_START_STUDY_CASE_VERSION } from './motorStartStudyCase.mjs';
import { renderProtectionSettingSheetHTML } from './protectionSettingSheet.mjs';
import { renderPullConstructabilityHTML } from './pullConstructability.mjs';
import { buildRacewayConstructionPackage, renderRacewayConstructionHTML } from './racewayConstructionDetailing.mjs';
import { buildHarmonicStudyPackage, renderHarmonicStudyHTML, HARMONIC_STUDY_CASE_VERSION } from './harmonicStudyCase.mjs';
import { buildCapacitorBankDutyPackage, renderCapacitorBankDutyHTML, CAPACITOR_BANK_DUTY_VERSION } from './capacitorBank.mjs';
import { buildReliabilityNetworkPackage, renderReliabilityNetworkHTML, RELIABILITY_NETWORK_VERSION } from './reliability.js';
import { buildTransientStabilityPackage, renderTransientStabilityHTML, TRANSIENT_STABILITY_STUDY_VERSION } from './transientStability.mjs';
import { buildIbrPlantControllerPackage, renderIbrPlantControllerHTML, IBR_PLANT_CONTROLLER_VERSION } from './ibrModeling.mjs';
import { buildEmfExposurePackage, renderEmfExposureHTML, EMF_EXPOSURE_VERSION } from './emf.mjs';
import { buildCathodicProtectionNetworkPackage, renderCathodicProtectionNetworkHTML, CATHODIC_PROTECTION_NETWORK_VERSION } from './cathodicProtectionNetwork.mjs';
import { buildLoadDemandGovernancePackage, renderLoadDemandGovernanceHTML } from './loadDemandGovernance.mjs';
import { buildTransformerFeederSizingPackage, renderTransformerFeederSizingHTML, TRANSFORMER_FEEDER_SIZING_VERSION } from './transformerFeederSizingCase.mjs';
import { buildVoltageDropStudyPackage, renderVoltageDropStudyHTML, VOLTAGE_DROP_STUDY_VERSION } from './voltageDropStudy.mjs';
import { buildVoltageFlickerStudyPackage, renderVoltageFlickerStudyHTML, VOLTAGE_FLICKER_STUDY_VERSION } from './voltageFlicker.mjs';
import { DEFAULT_PRICES, estimateCableCosts, estimateConduitCosts, estimateTrayCosts } from './costEstimate.mjs';
import { generateSpoolSheets } from './spoolSheets.mjs';
import protectiveDevices from '../data/protectiveDevices.mjs';

// ---------------------------------------------------------------------------
// Fill helpers
// ---------------------------------------------------------------------------

/** NEC §392.22 fill limit (%) by tray type. */
const NEC_FILL_LIMIT_PCT = {
  'Ladder (50 % fill)': 50,
  'Solid Bottom (40 % fill)': 40,
  'Ventilated (50 % fill)': 50,
};

function fillLimitPct(trayType = '') {
  for (const [key, limit] of Object.entries(NEC_FILL_LIMIT_PCT)) {
    if (trayType.toLowerCase().includes(key.split(' ')[0].toLowerCase())) return limit;
  }
  return 50; // default
}

/**
 * Compute total cable cross-section (in²) for cables assigned to a tray.
 */
function cableFillIn2(cables, trayId) {
  return cables
    .filter(c => c.route_preference === trayId || c.raceway === trayId)
    .reduce((sum, c) => {
      const od = parseFloat(c.od) || 0;
      return sum + Math.PI * (od / 2) ** 2;
    }, 0);
}

/**
 * Compute tray cross-section available area (in²).
 */
function trayAreaIn2(tray) {
  const w = parseFloat(tray.inside_width) || 12;  // inches
  const d = parseFloat(tray.tray_depth)   || 4;   // inches
  return w * d;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildSummarySection(cables, trays, conduits, ductbanks, projectName) {
  return {
    title: 'Project Summary',
    projectName: projectName || 'Untitled Project',
    generatedAt: new Date().toISOString(),
    counts: {
      cables:    cables.length,
      trays:     trays.length,
      conduits:  conduits.length,
      ductbanks: ductbanks.length,
    },
    totalCableLengthFt: cables.reduce((s, c) => s + (parseFloat(c.length) || parseFloat(c.length_ft) || 0), 0),
  };
}

function buildCableSection(cables) {
  const rows = cables.map(c => ({
    id:             c.id || c.tag || c.cable_id || '—',
    from:           c.from || c.source || '—',
    to:             c.to   || c.destination || '—',
    size:           c.conductor_size || c.size || '—',
    insulation:     c.insulation_type || '—',
    voltage:        c.voltage_rating || '—',
    lengthFt:       parseFloat(c.length || c.length_ft || 0),
    raceway:        c.route_preference || c.raceway || '—',
    routed:         Boolean(c.route_preference || c.raceway),
  }));

  const routed   = rows.filter(r => r.routed).length;
  const unrouted = rows.length - routed;
  const totalFt  = rows.reduce((s, r) => s + r.lengthFt, 0);

  return {
    title: 'Cable Schedule',
    rows,
    summary: { total: rows.length, routed, unrouted, totalLengthFt: +totalFt.toFixed(1) },
  };
}

function buildFillSection(trays, conduits, cables) {
  const trayRows = trays.map(tray => {
    const id       = tray.tray_id || tray.id || '—';
    const areaIn2  = trayAreaIn2(tray);
    const fillIn2  = cableFillIn2(cables, id);
    const limitPct = fillLimitPct(tray.tray_type || '');
    const usedPct  = areaIn2 > 0 ? (fillIn2 / areaIn2) * 100 : 0;
    const status   = usedPct > limitPct ? 'over' : usedPct > limitPct * 0.9 ? 'near' : 'ok';
    return { id, type: tray.tray_type || '—', widthIn: parseFloat(tray.inside_width) || 12, areaIn2: +areaIn2.toFixed(2), fillIn2: +fillIn2.toFixed(2), usedPct: +usedPct.toFixed(1), limitPct, status };
  });

  const conduitRows = conduits.map(c => {
    const id       = c.conduit_id || c.id || '—';
    const trade    = parseFloat(c.trade_size) || 1;
    // NEC Table 1 inside diameter approximation
    const idApprox = trade * 0.88;
    const areaIn2  = Math.PI * (idApprox / 2) ** 2;
    const fillIn2  = cableFillIn2(cables, id);
    const limitPct = 40;
    const usedPct  = areaIn2 > 0 ? (fillIn2 / areaIn2) * 100 : 0;
    const status   = usedPct > limitPct ? 'over' : usedPct > limitPct * 0.9 ? 'near' : 'ok';
    return { id, type: c.type || 'Conduit', tradeSizeIn: trade, areaIn2: +areaIn2.toFixed(2), fillIn2: +fillIn2.toFixed(2), usedPct: +usedPct.toFixed(1), limitPct, status };
  });

  const overCount  = [...trayRows, ...conduitRows].filter(r => r.status === 'over').length;
  const nearCount  = [...trayRows, ...conduitRows].filter(r => r.status === 'near').length;

  return {
    title: 'Raceway Fill Analysis',
    trays: trayRows,
    conduits: conduitRows,
    summary: { overCount, nearCount, totalRaceways: trayRows.length + conduitRows.length },
  };
}

function buildClashSection(trays) {
  const { clashes, stats } = detectClashes(trays);
  return {
    title: 'Clash Detection',
    clashes,
    stats,
    severity: overallSeverity(clashes),
  };
}

function buildSpoolSection(trays, cables) {
  const { spools, summary } = generateSpoolSheets(trays, cables);
  return {
    title: 'Spool Sheets Summary',
    spools,
    summary,
  };
}

function buildValidationSection(cables, trays, conduits) {
  const warnings = [];

  // Cables with no raceway assigned
  const unrouted = cables.filter(c => !c.route_preference && !c.raceway);
  if (unrouted.length > 0) {
    warnings.push({ severity: 'warning', message: `${unrouted.length} cable(s) have no raceway assigned.`, items: unrouted.map(c => c.id || c.tag || '?') });
  }

  // Trays with no cables
  const trayIds = new Set(cables.map(c => c.route_preference || c.raceway).filter(Boolean));
  const emptyTrays = trays.filter(t => !trayIds.has(t.tray_id));
  if (emptyTrays.length > 0) {
    warnings.push({ severity: 'info', message: `${emptyTrays.length} tray(s) have no cables assigned.`, items: emptyTrays.map(t => t.tray_id || t.id || '?') });
  }

  // Cables with missing length
  const noLength = cables.filter(c => !parseFloat(c.length || c.length_ft || 0));
  if (noLength.length > 0) {
    warnings.push({ severity: 'warning', message: `${noLength.length} cable(s) have no length specified.`, items: noLength.map(c => c.id || c.tag || '?') });
  }

  return {
    title: 'Validation',
    warnings,
    pass: warnings.filter(w => w.severity !== 'info').length === 0,
  };
}

function buildHeatTraceSection(studies = {}, projectName = '', approval = null) {
  const activeResult = studies.heatTraceSizing || null;
  const circuitCases = Array.isArray(studies.heatTraceSizingCircuits) ? studies.heatTraceSizingCircuits : [];
  if (!activeResult && circuitCases.length === 0) return null;

  const report = buildHeatTraceReport({
    activeResult,
    activeInputs: activeResult || null,
    circuitCases,
    approval,
    projectName: projectName || 'Untitled Project',
  });
  const installationPackage = buildHeatTraceInstallationPackage({
    activeResult,
    activeInputs: activeResult || null,
    circuitCases,
    approval,
    projectName: projectName || 'Untitled Project',
  });
  const advancedPackage = buildHeatTraceAdvancedPackage({
    activeResult,
    activeInputs: activeResult || null,
    circuitCases,
    approval,
    projectName: projectName || 'Untitled Project',
  });

  return {
    title: 'Heat Trace Branch Circuit Schedule',
    report,
    installationPackage,
    advancedPackage,
    summary: report.summary,
    branchSchedule: report.branchSchedule,
    warnings: report.warnings,
    approval: report.approval,
  };
}

function buildAdvancedGroundingSection(studies = {}, projectName = '') {
  if (studies.advancedGrounding) return studies.advancedGrounding;
  const groundGrid = studies.groundGrid || null;
  if (!groundGrid) return null;
  if (groundGrid.advancedGrounding) return groundGrid.advancedGrounding;
  try {
    return buildAdvancedGroundingPackage({
      projectName: projectName || 'Untitled Project',
      result: groundGrid,
      rectangle: {
        lengthM: groundGrid.inputs?.gridLx || groundGrid.gridLx,
        widthM: groundGrid.inputs?.gridLy || groundGrid.gridLy,
      },
      soilMeasurements: groundGrid.soilMeasurements || [],
      userPoints: groundGrid.userPoints || [],
      fieldData: groundGrid.fieldData || groundGrid.fieldFidelity || null,
    });
  } catch {
    return null;
  }
}

function buildCableThermalEnvironmentSection(studies = {}, cables = [], projectName = '') {
  if (studies.cableThermalEnvironment) return studies.cableThermalEnvironment;
  if (!cables.length) return null;
  try {
    return buildCableThermalEnvironmentPackage({
      projectName: projectName || 'Untitled Project',
      cables,
      installationMethods: ['tray'],
    });
  } catch {
    return null;
  }
}

function buildOptimalPowerFlowSection(studies = {}, projectName = '') {
  if (!studies.optimalPowerFlow) return null;
  try {
    return buildOptimalPowerFlowPackage({
      ...studies.optimalPowerFlow,
      projectName: studies.optimalPowerFlow.projectName || projectName || 'Untitled Project',
    });
  } catch {
    return studies.optimalPowerFlow;
  }
}

function buildLoadFlowSection(studies = {}, projectName = '') {
  const loadFlow = studies.loadFlow || null;
  if (!loadFlow) return null;
  if (loadFlow.version === LOAD_FLOW_STUDY_CASE_VERSION) return loadFlow;
  try {
    return buildLoadFlowStudyPackage({
      projectName: projectName || 'Untitled Project',
      studyCase: loadFlow.studyCase || { mode: loadFlow.balanced === false ? 'perPhase' : 'balanced' },
      equipmentRows: loadFlow.equipmentRows || [],
      results: loadFlow.results || loadFlow,
      controlRows: loadFlow.controlRows || [],
      warnings: loadFlow.warnings || [],
    });
  } catch {
    return null;
  }
}

function buildShortCircuitSection(studies = {}, oneLine = {}, projectName = '') {
  const shortCircuit = studies.shortCircuit || null;
  if (!shortCircuit) return null;
  if (shortCircuit.version === SHORT_CIRCUIT_STUDY_CASE_VERSION) return shortCircuit;
  try {
    return buildShortCircuitStudyPackage({
      projectName: projectName || 'Untitled Project',
      oneLine,
      studyCase: shortCircuit.studyCase || {},
      results: {
        studyCase: shortCircuit.studyCase || {},
        results: shortCircuit.results || shortCircuit,
        caseResults: shortCircuit.caseResults || [{ voltageCase: 'nominal', factor: 1, results: shortCircuit.results || shortCircuit }],
      },
    });
  } catch {
    return null;
  }
}

function buildArcFlashSection(studies = {}, projectName = '') {
  const arcFlash = studies.arcFlash || null;
  if (!arcFlash) return null;
  if (arcFlash.version === ARC_FLASH_STUDY_CASE_VERSION) return arcFlash;
  try {
    return buildArcFlashStudyPackage({
      projectName: projectName || 'Untitled Project',
      studyCase: arcFlash.studyCase || {},
      equipmentRows: arcFlash.equipmentRows || [],
      mitigationScenarios: arcFlash.mitigationScenarios || [{ id: 'baseline', name: 'Baseline', enabled: true }],
      results: arcFlash.results || arcFlash,
      scenarioResults: arcFlash.scenarioResults || { baseline: arcFlash.results || arcFlash },
      scenarioComparison: arcFlash.scenarioComparison || [],
    });
  } catch {
    return null;
  }
}

function buildMotorStartSection(studies = {}, projectName = '') {
  const motorStart = studies.motorStart || null;
  if (!motorStart) return null;
  if (motorStart.version === MOTOR_START_STUDY_CASE_VERSION) return motorStart;
  try {
    return buildMotorStartStudyPackage({
      projectName: projectName || 'Untitled Project',
      studyCase: motorStart.studyCase || {},
      motorRows: motorStart.motorRows || [],
      sequenceEvents: motorStart.sequenceEvents || [],
      results: motorStart.results || motorStart,
    });
  } catch {
    return null;
  }
}

function buildHarmonicStudySection(studies = {}, oneLine = {}, projectName = '') {
  const harmonicStudy = studies.harmonicStudyCase || (studies.harmonics?.version === HARMONIC_STUDY_CASE_VERSION ? studies.harmonics : null);
  const legacyHarmonics = studies.harmonics || null;
  if (!harmonicStudy && !legacyHarmonics) return null;
  try {
    return buildHarmonicStudyPackage({
      ...(harmonicStudy || {}),
      projectName: harmonicStudy?.projectName || projectName || 'Untitled Project',
      oneLine,
      harmonics: legacyHarmonics,
      results: harmonicStudy?.results || (legacyHarmonics?.version ? legacyHarmonics.results : legacyHarmonics),
      frequencyScan: studies.frequencyScan || studies.harmonicFrequencyScan || null,
      capacitorDutyContext: studies.capacitorBank || studies.capacitorBankSizing || null,
    });
  } catch {
    return null;
  }
}

function buildCapacitorBankDutySection(studies = {}, projectName = '') {
  const saved = studies.capacitorBank || studies.capacitorBankSizing;
  if (!saved) return null;
  if (saved.version === CAPACITOR_BANK_DUTY_VERSION) return saved;
  try {
    return buildCapacitorBankDutyPackage({
      projectName: projectName || 'Untitled Project',
      capacitorBank: saved,
      frequencyScan: studies.frequencyScan || studies.harmonicFrequencyScan || null,
      harmonicStudy: studies.harmonicStudyCase || studies.harmonics || null,
    });
  } catch {
    return null;
  }
}

function buildReliabilityNetworkSection(studies = {}, oneLine = {}, projectName = '') {
  const saved = studies.reliability;
  if (!saved) return null;
  if (saved.version === RELIABILITY_NETWORK_VERSION) return saved;
  const components = Array.isArray(oneLine?.sheets)
    ? oneLine.sheets.flatMap(sheet => sheet.components || [])
    : [];
  try {
    return buildReliabilityNetworkPackage({
      projectName: projectName || 'Untitled Project',
      reliability: saved,
      legacyResult: saved,
      components,
    });
  } catch {
    return null;
  }
}

function buildTransientStabilitySection(studies = {}, projectName = '') {
  const saved = studies.transientStability;
  if (!saved) return null;
  if (saved.version === TRANSIENT_STABILITY_STUDY_VERSION) return saved;
  try {
    return buildTransientStabilityPackage({
      projectName: projectName || 'Untitled Project',
      legacyResult: saved,
      ...saved,
    });
  } catch {
    return null;
  }
}

function buildIbrPlantControllerSection(studies = {}, projectName = '') {
  const saved = studies.ibrPlantController || studies.ibr?.plantControllerPackage;
  const legacyIbr = studies.ibr || null;
  const legacyDer = studies.derInterconnect || null;
  if (!saved && !legacyIbr && !legacyDer) return null;
  if (saved?.version === IBR_PLANT_CONTROLLER_VERSION) return saved;
  try {
    return buildIbrPlantControllerPackage({
      ...(saved || {}),
      projectName: saved?.projectName || projectName || 'Untitled Project',
      plantCase: saved?.plantCase || {
        name: 'Legacy IBR / DER plant-controller basis',
        pccTag: legacyDer?.inputs?.pccBus || legacyDer?.inputs?.pccTag || 'PCC',
        plantMode: 'unknown',
        controlMode: 'voltVar',
        priorityMode: 'activePowerPriority',
      },
      resourceRows: saved?.resourceRows || [{
        id: 'legacy-ibr',
        tag: 'Legacy IBR result',
        resourceType: 'ibr',
        ratedKw: legacyIbr?.pvInputs?.Pstc_kW || legacyIbr?.bessInputs?.sRated_kW || legacyIbr?.faultInputs?.sRated_kVA || null,
        ratedKva: legacyIbr?.pvInputs?.sRated_kVA || legacyIbr?.bessInputs?.sRated_kVA || legacyIbr?.faultInputs?.sRated_kVA || null,
        requestedKw: legacyIbr?.pvResult?.pAC_kW || legacyIbr?.bessResult?.pAC_kW || null,
        requestedKvar: legacyIbr?.voltVarResult?.qDroop_kvar || legacyIbr?.bessResult?.qAC_kvar || 0,
      }],
      curveRows: saved?.curveRows || [],
      scenarioRows: saved?.scenarioRows || [{ id: 'legacy', label: 'Legacy result wrapper', scenarioType: 'base' }],
    });
  } catch {
    return null;
  }
}

function buildEmfExposureSection(studies = {}, projectName = '') {
  const saved = studies.emfExposure || (studies.emf?.version === EMF_EXPOSURE_VERSION ? studies.emf : null);
  const legacy = studies.emf || null;
  if (!saved && !legacy) return null;
  if (saved?.version === EMF_EXPOSURE_VERSION) return saved;
  try {
    return buildEmfExposurePackage({
      ...(saved || {}),
      projectName: saved?.projectName || projectName || 'Untitled Project',
      studyCase: saved?.studyCase || {
        name: 'Legacy EMF quick-calculator basis',
        frequencyHz: legacy?.inputs?.frequency || legacy?.frequency || 60,
        exposureBasis: 'icnirpPublic',
        geometryMode: 'tray',
      },
      circuitRows: saved?.circuitRows || [{
        id: 'legacy-emf-circuit',
        tag: 'Legacy EMF result',
        currentA: legacy?.inputs?.currentA || legacy?.currentA || 100,
        trayWidthM: legacy?.inputs?.trayWidthM || legacy?.trayWidthM || 0.3048,
        conductorOdM: legacy?.inputs?.cableOdM || legacy?.cableOdM || 0.0254,
        nParallelSets: legacy?.inputs?.nCables || legacy?.nCables || 1,
      }],
      measurementPoints: saved?.measurementPoints || [{
        id: 'legacy-emf-point',
        label: 'Legacy EMF point',
        xM: legacy?.inputs?.distanceM || legacy?.distanceM || 1,
        yM: 0.6,
      }],
      validationRows: saved?.validationRows || [],
    });
  } catch {
    return null;
  }
}

function buildCathodicProtectionNetworkSection(studies = {}, projectName = '') {
  const saved = studies.cathodicProtectionNetwork || null;
  const legacy = studies.cathodicProtection || null;
  if (!saved && !legacy) return null;
  if (saved?.version === CATHODIC_PROTECTION_NETWORK_VERSION) return saved;
  try {
    return buildCathodicProtectionNetworkPackage({
      ...(saved || {}),
      projectName: saved?.projectName || projectName || 'Untitled Project',
      networkCase: saved?.networkCase || {
        name: legacy ? 'Legacy CP sizing network wrapper' : 'Cathodic Protection Network Model',
        criteriaBasis: 'naceSp0169',
        seasonalCase: 'nominal',
      },
      legacySizing: legacy,
    });
  } catch {
    return null;
  }
}

function buildProtectionSettingSection(studies = {}) {
  return studies.protectionSettingSheets || null;
}

function buildPullConstructabilitySection(studies = {}) {
  return studies.pullConstructability || null;
}

function buildLoadDemandGovernanceSection(studies = {}, panels = [], loads = [], projectName = '') {
  if (studies.loadDemandGovernance) return studies.loadDemandGovernance;
  if (!Array.isArray(loads) || !loads.length) return null;
  return buildLoadDemandGovernancePackage({
    projectName: projectName || 'Untitled Project',
    panels,
    loads,
  });
}

function buildTransformerFeederSizingSection(studies = {}, panels = [], loads = [], projectName = '') {
  const saved = studies.transformerFeederSizing;
  if (!saved) return null;
  if (saved.version === TRANSFORMER_FEEDER_SIZING_VERSION) return saved;
  try {
    return buildTransformerFeederSizingPackage({
      ...saved,
      projectName: saved.projectName || projectName || 'Untitled Project',
      studyCase: saved.caseBasis || saved.studyCase || saved,
      loadDemandGovernance: studies.loadDemandGovernance || null,
      panels,
      loads,
    });
  } catch {
    return null;
  }
}

function buildVoltageDropStudySection(studies = {}, cables = [], projectName = '') {
  const saved = studies.voltageDropStudy;
  if (saved?.version === VOLTAGE_DROP_STUDY_VERSION) return saved;
  if (!saved) return null;
  try {
    return buildVoltageDropStudyPackage({
      ...(saved || {}),
      projectName: saved?.projectName || projectName || 'Untitled Project',
      cables,
      criteria: saved?.criteria || {},
      operatingCase: saved?.operatingCase || {},
      motorStart: studies.motorStart || null,
    });
  } catch {
    return null;
  }
}

function buildVoltageFlickerSection(studies = {}, projectName = '') {
  const saved = studies.voltageFlicker;
  if (saved?.version === VOLTAGE_FLICKER_STUDY_VERSION) return saved;
  if (!saved) return null;
  try {
    return buildVoltageFlickerStudyPackage({
      ...(saved || {}),
      projectName: saved?.projectName || projectName || 'Untitled Project',
    });
  } catch {
    return null;
  }
}

function buildProductCatalogUsage({ cables = [], trays = [], conduits = [], equipment = [], panels = [], studies = {} } = {}) {
  const usage = [];
  const add = (row, category, source, label) => {
    if (!row || typeof row !== 'object') return;
    const hasProductFields = row.manufacturer || row.catalogNumber || row.catalog_number || row.partNumber || row.model || row.category || row.tray_type || row.type;
    if (!hasProductFields) return;
    usage.push({
      label: label || row.tag || row.id || row.ref || row.tray_id || row.conduit_id || row.description,
      manufacturer: row.manufacturer || '',
      catalogNumber: row.catalogNumber || row.catalog_number || row.partNumber || row.model || '',
      category,
      source,
    });
  };
  equipment.forEach(row => add(row, 'protectiveDevice', 'equipmentlist.html'));
  panels.forEach(row => add(row, 'protectiveDevice', 'panelschedule.html'));
  trays.forEach(row => add(row, 'tray', 'racewayschedule.html'));
  conduits.forEach(row => add(row, 'conduit', 'racewayschedule.html'));
  cables.forEach(row => add(row, 'cableType', 'cableschedule.html'));
  const heatTraceCases = Array.isArray(studies.heatTraceSizingCircuits) ? studies.heatTraceSizingCircuits : [];
  heatTraceCases.forEach(row => add(row, 'heatTraceComponent', 'heattracesizing.html', row.pipeTag || row.name || row.id));
  return usage;
}

function buildPricingEstimateLineItems({ cables = [], trays = [], conduits = [], studies = {} } = {}) {
  const routeResults = Array.isArray(studies.routeResults) ? studies.routeResults : [];
  return [
    ...estimateCableCosts(cables, routeResults, DEFAULT_PRICES),
    ...estimateTrayCosts(trays, DEFAULT_PRICES),
    ...estimateConduitCosts(conduits, DEFAULT_PRICES),
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a unified project report from project data.
 *
 * @param {object}   data
 * @param {object[]} data.cables
 * @param {object[]} data.trays
 * @param {object[]} data.conduits
 * @param {object[]} data.ductbanks
 * @param {string}   [data.projectName]
 * @returns {ProjectReport}
 *
 * @typedef {{
 *   summary:    object,
 *   cables:     object,
 *   fill:       object,
 *   clashes:    object,
 *   spools:     object,
 *   validation: object,
 *   heatTrace:  object | null,
 *   generatedAt: string,
 * }} ProjectReport
 */
export function generateProjectReport({
  cables = [],
  trays = [],
  conduits = [],
  ductbanks = [],
  equipment = [],
  panels = [],
  loads = [],
  oneLine = {},
  projectName = '',
  studies = {},
  approvals = {},
  lifecycle = null,
  designCoach = null,
  productCatalog = [],
  cloudLibraryReleases = [],
  componentLibrarySubscription = {},
  componentLibrary = null,
  fieldObservations = [],
  bimElements = [],
  bimIssues = [],
  bimConnectorPackages = [],
  activeBimConnectorPackageId = '',
  bimObjectFamilies = [],
  pricingFeedRows = [],
  pricingFeedDescriptors = [],
} = {}) {
  const equipmentEvaluation = buildEquipmentEvaluationPackage({
    equipment,
    oneLine,
    protectiveDevices,
    studyResults: studies,
    cables,
  });
  const advancedGrounding = buildAdvancedGroundingSection(studies, projectName);
  const cableThermalEnvironment = buildCableThermalEnvironmentSection(studies, cables, projectName);
  const loadFlow = buildLoadFlowSection(studies, projectName);
  const optimalPowerFlow = buildOptimalPowerFlowSection(studies, projectName);
  const shortCircuit = buildShortCircuitSection(studies, oneLine, projectName);
  const arcFlash = buildArcFlashSection(studies, projectName);
  const motorStart = buildMotorStartSection(studies, projectName);
  const harmonicStudy = buildHarmonicStudySection(studies, oneLine, projectName);
  const capacitorBankDuty = buildCapacitorBankDutySection(studies, projectName);
  const reliabilityNetwork = buildReliabilityNetworkSection(studies, oneLine, projectName);
  const transientStability = buildTransientStabilitySection(studies, projectName);
  const ibrPlantController = buildIbrPlantControllerSection(studies, projectName);
  const emfExposure = buildEmfExposureSection(studies, projectName);
  const cathodicProtectionNetwork = buildCathodicProtectionNetworkSection(studies, projectName);
  const protectionSettingSheets = buildProtectionSettingSection(studies);
  const pullConstructability = buildPullConstructabilitySection(studies);
  const loadDemandGovernance = buildLoadDemandGovernanceSection(studies, panels, loads, projectName);
  const transformerFeederSizing = buildTransformerFeederSizingSection(studies, panels, loads, projectName);
  const voltageDropStudy = buildVoltageDropStudySection(studies, cables, projectName);
  const voltageFlicker = buildVoltageFlickerSection(studies, projectName);
  const racewayConstruction = buildRacewayConstructionPackage({
    projectName: projectName || 'Untitled Project',
    trays,
    conduits,
    ductbanks,
  });
  const productCatalogGovernance = buildProductCatalogGovernancePackage({
    catalog: productCatalog,
    projectUsage: buildProductCatalogUsage({ cables, trays, conduits, equipment, panels, studies }),
    approvals: approvals.productCatalog || {},
  });
  const pricingFeedGovernance = buildPricingFeedGovernancePackage({
    projectName: projectName || 'Untitled Project',
    feedDescriptors: pricingFeedDescriptors,
    pricingRows: pricingFeedRows,
    catalogRows: productCatalog,
    estimateLineItems: buildPricingEstimateLineItems({ cables, trays, conduits, studies }),
  });
  const cloudLibraryGovernance = buildCloudLibraryGovernancePackage({
    projectName: projectName || 'Untitled Project',
    releases: cloudLibraryReleases,
    componentLibrarySubscription,
    projectLibrary: componentLibrary || {},
  });
  const fieldCommissioning = buildFieldCommissioningPackage({
    projectName: projectName || 'Untitled Project',
    observations: fieldObservations,
  });
  const bimRoundTrip = (Array.isArray(bimElements) && bimElements.length) || (Array.isArray(bimIssues) && bimIssues.length) ? buildBimRoundTripPackage({
    projectName: projectName || 'Untitled Project',
    bimElements,
    bimIssues,
    cables,
    trays,
    conduits,
    equipment,
  }) : null;
  const bimConnectorReadiness = Array.isArray(bimConnectorPackages) && bimConnectorPackages.length ? buildConnectorReadinessPackage({
    packages: bimConnectorPackages,
    activePackageId: activeBimConnectorPackageId,
    projectState: {
      projectName: projectName || 'Untitled Project',
      cables,
      trays,
      conduits,
      equipment,
      bimElements,
      bimIssues,
    },
  }) : null;
  const nativeBimConnectorKit = ((Array.isArray(bimConnectorPackages) && bimConnectorPackages.length)
    || (Array.isArray(bimElements) && bimElements.length)
    || (Array.isArray(bimIssues) && bimIssues.length)) ? buildNativeConnectorKitPackage({
      connectorPackages: bimConnectorPackages,
      activeConnectorPackageId: activeBimConnectorPackageId,
      projectState: {
        projectName: projectName || 'Untitled Project',
        cables,
        trays,
        conduits,
        equipment,
        bimElements,
        bimIssues,
      },
    }) : null;
  const bimObjectLibrary = ((Array.isArray(bimObjectFamilies) && bimObjectFamilies.length)
    || (Array.isArray(productCatalog) && productCatalog.length)) ? buildBimObjectLibraryPackage({
      projectName: projectName || 'Untitled Project',
      familyRows: bimObjectFamilies,
      catalogRows: productCatalog,
      projectState: {
        projectName: projectName || 'Untitled Project',
        cables,
        trays,
        conduits,
        equipment,
      },
    }) : null;
  const revitSyncReadiness = ((Array.isArray(bimConnectorPackages) && bimConnectorPackages.length)
    || (Array.isArray(bimElements) && bimElements.length)
    || (Array.isArray(bimObjectFamilies) && bimObjectFamilies.length)
    || (Array.isArray(productCatalog) && productCatalog.length)) ? buildRevitSyncReadinessPackage({
      projectName: projectName || 'Untitled Project',
      projectState: {
        projectName: projectName || 'Untitled Project',
        cables,
        trays,
        conduits,
        equipment,
        bimElements,
        bimIssues,
        bimObjectFamilies,
        productCatalog,
      },
      bimObjectFamilies,
      productCatalog,
    }) : null;
  const revitNativeSync = ((Array.isArray(bimConnectorPackages) && bimConnectorPackages.length)
    || (Array.isArray(bimElements) && bimElements.length)
    || (Array.isArray(bimObjectFamilies) && bimObjectFamilies.length)
    || (Array.isArray(productCatalog) && productCatalog.length)) ? buildRevitNativeSyncPackage({
      projectName: projectName || 'Untitled Project',
      projectState: {
        projectName: projectName || 'Untitled Project',
        cables,
        trays,
        conduits,
        equipment,
        bimElements,
        bimIssues,
        bimObjectFamilies,
        productCatalog,
      },
      bimObjectFamilies,
      productCatalog,
    }) : null;
  const autocadSyncReadiness = ((Array.isArray(bimConnectorPackages) && bimConnectorPackages.length)
    || (Array.isArray(bimElements) && bimElements.length)
    || (Array.isArray(bimObjectFamilies) && bimObjectFamilies.length)
    || (Array.isArray(productCatalog) && productCatalog.length)) ? buildAutoCadSyncReadinessPackage({
      projectName: projectName || 'Untitled Project',
      projectState: {
        projectName: projectName || 'Untitled Project',
        cables,
        trays,
        conduits,
        equipment,
        bimElements,
        bimIssues,
        bimObjectFamilies,
        productCatalog,
      },
      bimObjectFamilies,
      productCatalog,
    }) : null;
  const autocadNativeSync = ((Array.isArray(bimConnectorPackages) && bimConnectorPackages.length)
    || (Array.isArray(bimElements) && bimElements.length)
    || (Array.isArray(bimObjectFamilies) && bimObjectFamilies.length)
    || (Array.isArray(productCatalog) && productCatalog.length)) ? buildAutoCadNativeSyncPackage({
      projectName: projectName || 'Untitled Project',
      projectState: {
        projectName: projectName || 'Untitled Project',
        cables,
        trays,
        conduits,
        equipment,
        bimElements,
        bimIssues,
        bimObjectFamilies,
        productCatalog,
      },
      bimObjectFamilies,
      productCatalog,
    }) : null;
  const plantCadSyncReadiness = ((Array.isArray(bimConnectorPackages) && bimConnectorPackages.length)
    || (Array.isArray(bimElements) && bimElements.length)
    || (Array.isArray(bimObjectFamilies) && bimObjectFamilies.length)
    || (Array.isArray(productCatalog) && productCatalog.length)) ? buildPlantCadSyncReadinessPackage({
      projectName: projectName || 'Untitled Project',
      projectState: {
        projectName: projectName || 'Untitled Project',
        cables,
        trays,
        conduits,
        equipment,
        bimElements,
        bimIssues,
        bimObjectFamilies,
        productCatalog,
      },
      bimObjectFamilies,
      productCatalog,
    }) : null;
  const plantCadNativeSync = ((Array.isArray(bimConnectorPackages) && bimConnectorPackages.length)
    || (Array.isArray(bimElements) && bimElements.length)
    || (Array.isArray(bimObjectFamilies) && bimObjectFamilies.length)
    || (Array.isArray(productCatalog) && productCatalog.length)) ? buildPlantCadNativeSyncPackage({
      projectName: projectName || 'Untitled Project',
      projectState: {
        projectName: projectName || 'Untitled Project',
        cables,
        trays,
        conduits,
        equipment,
        bimElements,
        bimIssues,
        bimObjectFamilies,
        productCatalog,
      },
      bimObjectFamilies,
      productCatalog,
    }) : null;
  return {
    generatedAt: new Date().toISOString(),
    summary:    buildSummarySection(cables, trays, conduits, ductbanks, projectName),
    cables:     buildCableSection(cables),
    fill:       buildFillSection(trays, conduits, cables),
    clashes:    buildClashSection(trays),
    spools:     buildSpoolSection(trays, cables),
    heatTrace:  buildHeatTraceSection(studies, projectName, approvals.heatTraceSizing || null),
    shortCircuit,
    arcFlash,
    motorStart,
    harmonicStudy,
    capacitorBankDuty,
    reliabilityNetwork,
    transientStability,
    ibrPlantController,
    emfExposure,
    cathodicProtectionNetwork,
    protectionSettingSheets,
    pullConstructability,
    loadDemandGovernance,
    transformerFeederSizing,
    voltageDropStudy,
    voltageFlicker,
    racewayConstruction,
    equipmentEvaluation,
    advancedGrounding,
    cableThermalEnvironment,
    loadFlow,
    optimalPowerFlow,
    productCatalog: productCatalogGovernance,
    pricingFeedGovernance,
    cloudLibraryGovernance,
    fieldCommissioning,
    bimRoundTrip,
    bimConnectorReadiness,
    nativeBimConnectorKit,
    bimObjectLibrary,
    revitSyncReadiness,
    revitNativeSync,
    autocadSyncReadiness,
    autocadNativeSync,
    plantCadSyncReadiness,
    plantCadNativeSync,
    validation: buildValidationSection(cables, trays, conduits),
    lifecycle,
    designCoach,
  };
}

/**
 * Render a project report to an HTML string suitable for print or preview.
 *
 * @param {ProjectReport} report
 * @returns {string} HTML fragment (no <html>/<body> wrappers)
 */
export function renderReportHTML(report) {
  const esc = s => String(s ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = n => typeof n === 'number' ? n.toLocaleString() : esc(n);

  const statusBadge = s => {
    const map = {
      ok: 'badge-ok',
      near: 'badge-warn',
      over: 'badge-error',
      pass: 'badge-ok',
      warning: 'badge-warn',
      fail: 'badge-error',
      info: 'badge-info',
      withinLimit: 'badge-ok',
      overLimit: 'badge-error',
      invalid: 'badge-error',
      notRun: 'badge-info',
    };
    return `<span class="badge ${map[s] || ''}">${esc(s)}</span>`;
  };

  const { summary, cables, fill, clashes, spools, heatTrace, shortCircuit, arcFlash, motorStart, harmonicStudy, capacitorBankDuty, reliabilityNetwork, transientStability, ibrPlantController, emfExposure, cathodicProtectionNetwork, protectionSettingSheets, pullConstructability, loadDemandGovernance, transformerFeederSizing, voltageDropStudy, voltageFlicker, racewayConstruction, equipmentEvaluation, advancedGrounding, cableThermalEnvironment, loadFlow, optimalPowerFlow, productCatalog, pricingFeedGovernance, cloudLibraryGovernance, fieldCommissioning, bimRoundTrip, bimConnectorReadiness, nativeBimConnectorKit, bimObjectLibrary, revitSyncReadiness, revitNativeSync, autocadSyncReadiness, autocadNativeSync, plantCadSyncReadiness, plantCadNativeSync, validation, lifecycle, designCoach } = report;

  let html = `
<header class="report-header">
  <h1 class="report-title">${esc(summary.projectName)}</h1>
  <p class="report-meta">Project Report &nbsp;·&nbsp; Generated ${new Date(report.generatedAt).toLocaleString()}</p>
</header>

<section class="report-section" id="rpt-summary">
  <h2>Project Summary</h2>
  <dl class="report-dl">
    <dt>Cables</dt><dd>${fmt(summary.counts.cables)}</dd>
    <dt>Trays</dt><dd>${fmt(summary.counts.trays)}</dd>
    <dt>Conduits</dt><dd>${fmt(summary.counts.conduits)}</dd>
    <dt>Ductbanks</dt><dd>${fmt(summary.counts.ductbanks)}</dd>
    <dt>Total Cable Length</dt><dd>${fmt(summary.totalCableLengthFt.toFixed(1))} ft</dd>
  </dl>
</section>

${lifecycle?.activePackage ? `<section class="report-section" id="rpt-lifecycle">
  <h2>Lifecycle Package Lineage</h2>
  <p class="report-note">Local engineering release record for report lineage. This package is not a cryptographic signature or formal document-control record.</p>
  <dl class="report-dl">
    <dt>Package</dt><dd>${esc(lifecycle.activePackage.name)}</dd>
    <dt>Revision</dt><dd>${esc(lifecycle.activePackage.revision)}</dd>
    <dt>Status</dt><dd>${esc(lifecycle.activePackage.status)}</dd>
    <dt>Scenario</dt><dd>${esc(lifecycle.activePackage.scenario)}</dd>
    <dt>Author</dt><dd>${esc(lifecycle.activePackage.author || 'Unassigned')}</dd>
    <dt>Created</dt><dd>${esc(lifecycle.activePackage.createdAt)}</dd>
    <dt>Model Hash</dt><dd>${esc(lifecycle.activePackage.modelHash)}</dd>
    <dt>Study Count</dt><dd>${fmt(lifecycle.activePackage.studyCount || 0)}</dd>
  </dl>
  <p class="report-note">Diff from previous package: ${esc([
    `${lifecycle.activePackage.diffFromPrevious?.summary?.schedulesAdded || 0} schedule rows added`,
    `${lifecycle.activePackage.diffFromPrevious?.summary?.schedulesRemoved || 0} removed`,
    `${lifecycle.activePackage.diffFromPrevious?.summary?.schedulesChanged || 0} changed`,
    `${lifecycle.activePackage.diffFromPrevious?.summary?.studiesChanged || 0} study changes`,
  ].join(' | '))}</p>
</section>` : ''}

${designCoach ? `<section class="report-section" id="rpt-design-coach">
  <h2>Design Coach Actions</h2>
  <p class="report-note">${fmt(designCoach.summary?.total || 0)} open action(s) &nbsp;Â·&nbsp; ${fmt(designCoach.summary?.highPriority || 0)} high priority &nbsp;Â·&nbsp; ${fmt(designCoach.summary?.applyAvailable || 0)} allowlisted apply action(s)</p>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>Severity</th><th>Category</th><th>Action</th><th>Recommendation</th><th>Source</th></tr></thead>
    <tbody>${designCoach.actions?.length ? designCoach.actions.slice(0, 20).map(action => `<tr>
      <td>${esc(action.severity)}</td>
      <td>${esc(action.category)}</td>
      <td>${esc(action.title)}</td>
      <td>${esc(action.recommendation)}</td>
      <td>${esc(action.source?.type || '')}</td>
    </tr>`).join('') : '<tr><td colspan="5">No open design coach actions.</td></tr>'}</tbody>
  </table>
  </div>
</section>` : ''}

${shortCircuit ? renderShortCircuitStudyHTML(shortCircuit) : ''}

${arcFlash ? renderArcFlashStudyHTML(arcFlash) : ''}

${motorStart ? renderMotorStartStudyHTML(motorStart) : ''}

${harmonicStudy ? renderHarmonicStudyHTML(harmonicStudy) : ''}

${capacitorBankDuty ? renderCapacitorBankDutyHTML(capacitorBankDuty) : ''}

${reliabilityNetwork ? renderReliabilityNetworkHTML(reliabilityNetwork) : ''}

${transientStability ? renderTransientStabilityHTML(transientStability) : ''}

${ibrPlantController ? renderIbrPlantControllerHTML(ibrPlantController) : ''}

${emfExposure ? renderEmfExposureHTML(emfExposure) : ''}

${cathodicProtectionNetwork ? renderCathodicProtectionNetworkHTML(cathodicProtectionNetwork) : ''}

${protectionSettingSheets ? renderProtectionSettingSheetHTML(protectionSettingSheets) : ''}

${pullConstructability ? renderPullConstructabilityHTML(pullConstructability) : ''}

${loadDemandGovernance ? renderLoadDemandGovernanceHTML(loadDemandGovernance) : ''}

${transformerFeederSizing ? renderTransformerFeederSizingHTML(transformerFeederSizing) : ''}

${voltageDropStudy ? renderVoltageDropStudyHTML(voltageDropStudy) : ''}

${voltageFlicker ? renderVoltageFlickerStudyHTML(voltageFlicker) : ''}

${racewayConstruction ? renderRacewayConstructionHTML(racewayConstruction) : ''}

${equipmentEvaluation ? renderEquipmentEvaluationHTML(equipmentEvaluation) : ''}

${advancedGrounding ? renderAdvancedGroundingHTML(advancedGrounding) : ''}

${cableThermalEnvironment ? renderCableThermalEnvironmentHTML(cableThermalEnvironment) : ''}

${loadFlow ? renderLoadFlowStudyHTML(loadFlow) : ''}

${optimalPowerFlow ? renderOptimalPowerFlowHTML(optimalPowerFlow) : ''}

${productCatalog ? renderProductCatalogGovernanceHTML(productCatalog) : ''}

${pricingFeedGovernance ? renderPricingFeedGovernanceHTML(pricingFeedGovernance) : ''}

${cloudLibraryGovernance ? renderCloudLibraryGovernanceHTML(cloudLibraryGovernance) : ''}

${fieldCommissioning ? renderFieldCommissioningHTML(fieldCommissioning) : ''}

${bimRoundTrip ? renderBimRoundTripHTML(bimRoundTrip) : ''}

${bimConnectorReadiness ? renderConnectorReadinessHTML(bimConnectorReadiness) : ''}

${nativeBimConnectorKit ? renderNativeConnectorKitHTML(nativeBimConnectorKit) : ''}

${bimObjectLibrary ? renderBimObjectLibraryHTML(bimObjectLibrary) : ''}

${revitSyncReadiness ? renderRevitSyncReadinessHTML(revitSyncReadiness) : ''}

${revitNativeSync ? renderRevitNativeSyncHTML(revitNativeSync) : ''}

${autocadSyncReadiness ? renderAutoCadSyncReadinessHTML(autocadSyncReadiness) : ''}

${autocadNativeSync ? renderAutoCadNativeSyncHTML(autocadNativeSync) : ''}

${plantCadSyncReadiness ? renderPlantCadSyncReadinessHTML(plantCadSyncReadiness) : ''}

${plantCadNativeSync ? renderPlantCadNativeSyncHTML(plantCadNativeSync) : ''}

<section class="report-section" id="rpt-cables">
  <h2>Cable Schedule</h2>
  <p class="report-note">${fmt(cables.summary.routed)} routed &nbsp;·&nbsp; ${fmt(cables.summary.unrouted)} unrouted &nbsp;·&nbsp; ${fmt(cables.summary.totalLengthFt)} ft total</p>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>ID</th><th>From</th><th>To</th><th>Size</th><th>Insulation</th><th>Voltage</th><th>Length (ft)</th><th>Raceway</th></tr></thead>
    <tbody>${cables.rows.map(r => `<tr>
      <td>${esc(r.id)}</td><td>${esc(r.from)}</td><td>${esc(r.to)}</td>
      <td>${esc(r.size)}</td><td>${esc(r.insulation)}</td><td>${esc(r.voltage)}</td>
      <td>${fmt(r.lengthFt)}</td><td>${esc(r.raceway)}</td>
    </tr>`).join('')}</tbody>
  </table>
  </div>
</section>

<section class="report-section" id="rpt-fill">
  <h2>Raceway Fill Analysis</h2>
  <p class="report-note">${fmt(fill.summary.overCount)} over limit &nbsp;·&nbsp; ${fmt(fill.summary.nearCount)} near limit</p>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>Raceway</th><th>Type</th><th>Area (in²)</th><th>Fill (in²)</th><th>Used %</th><th>Limit %</th><th>Status</th></tr></thead>
    <tbody>
    ${fill.trays.map(r => `<tr>
      <td>${esc(r.id)}</td><td>${esc(r.type)}</td>
      <td>${fmt(r.areaIn2)}</td><td>${fmt(r.fillIn2)}</td>
      <td>${fmt(r.usedPct)}</td><td>${fmt(r.limitPct)}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`).join('')}
    ${fill.conduits.map(r => `<tr>
      <td>${esc(r.id)}</td><td>${esc(r.type)}</td>
      <td>${fmt(r.areaIn2)}</td><td>${fmt(r.fillIn2)}</td>
      <td>${fmt(r.usedPct)}</td><td>${fmt(r.limitPct)}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`).join('')}
    </tbody>
  </table>
  </div>
</section>

<section class="report-section" id="rpt-clashes">
  <h2>Clash Detection</h2>
  <p class="report-note">Overall severity: ${statusBadge(clashes.severity)} &nbsp;·&nbsp;
    ${fmt(clashes.stats.hardClashes)} hard &nbsp;·&nbsp; ${fmt(clashes.stats.softClashes)} soft</p>
  ${clashes.clashes.length === 0
    ? '<p class="report-empty">No clashes detected.</p>'
    : `<div class="report-scroll"><table class="report-table">
    <thead><tr><th>Tray A</th><th>Tray B</th><th>Severity</th><th>Min Gap (ft)</th><th>Description</th></tr></thead>
    <tbody>${clashes.clashes.map(c => `<tr>
      <td>${esc(c.trayA)}</td><td>${esc(c.trayB)}</td>
      <td>${statusBadge(c.severity)}</td>
      <td>${fmt(c.minGapFt)}</td>
      <td>${esc(c.description)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`}
</section>

<section class="report-section" id="rpt-spools">
  <h2>Spool Sheets Summary</h2>
  <p class="report-note">${fmt(spools.summary.spoolCount)} spools &nbsp;·&nbsp;
    ${fmt(spools.summary.totalLengthFt)} ft total &nbsp;·&nbsp;
    ${fmt(spools.summary.totalSections)} sections &nbsp;·&nbsp;
    ${fmt(spools.summary.totalBrackets)} brackets</p>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>Spool</th><th>Trays</th><th>Length (ft)</th><th>Width (in)</th><th>Sections</th><th>Brackets</th><th>Weight (lbs)</th><th>Cables</th></tr></thead>
    <tbody>${spools.spools.map(s => `<tr>
      <td>${esc(s.spoolId)}</td><td>${fmt(s.trayCount)}</td>
      <td>${fmt(s.totalLengthFt)}</td><td>${fmt(s.width_in)}</td>
      <td>${fmt(s.straightSections)}</td><td>${fmt(s.bracketCount)}</td>
      <td>${fmt(s.estimatedWeight)}</td><td>${fmt(s.cables.length)}</td>
    </tr>`).join('')}</tbody>
  </table>
  </div>
</section>

${heatTrace ? `<section class="report-section" id="rpt-heat-trace">
  <h2>Heat Trace Branch Circuit Schedule</h2>
  <p class="report-note">This section rolls up heat-trace branch/load circuits from the controller or heat-trace panel output to each traced run. Upstream feeder, transformer, panel bus, and breaker coordination are excluded.</p>
  <dl class="report-dl">
    <dt>Saved Branches</dt><dd>${fmt(heatTrace.branchSchedule.summary.branchCount)}</dd>
    <dt>Total Installed Connected Load</dt><dd>${fmt(heatTrace.branchSchedule.summary.totalConnectedKw)} kW</dd>
    <dt>Total Required Heat Load</dt><dd>${fmt(heatTrace.branchSchedule.summary.totalRequiredKw)} kW</dd>
    <dt>Total Branch Current</dt><dd>${fmt(heatTrace.branchSchedule.summary.totalLoadAmps)} A</dd>
    <dt>Approval Status</dt><dd>${esc(heatTrace.approval?.status || 'pending')}</dd>
    <dt>Branches Over Limit</dt><dd>${fmt(heatTrace.branchSchedule.summary.overLimitCount)}</dd>
    <dt>Branches With Warnings</dt><dd>${fmt(heatTrace.branchSchedule.summary.warningCount)}</dd>
  </dl>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>Branch</th><th>Status</th><th>Cable Type</th><th>Effective Length (ft)</th><th>Max (ft)</th><th>Selected W/ft x Runs</th><th>Installed W</th><th>Required W</th><th>Voltage</th><th>Amps</th><th>Warnings</th></tr></thead>
    <tbody>${heatTrace.branchSchedule.rows.length ? heatTrace.branchSchedule.rows.map(r => `<tr>
      <td>${esc(r.name)}</td>
      <td>${statusBadge(r.status)}</td>
      <td>${esc(r.heatTraceCableTypeLabel)}</td>
      <td>${fmt(r.effectiveTraceLengthFt)}</td>
      <td>${fmt(r.maxCircuitLengthFt)}</td>
      <td>${fmt(r.selectedWPerFt)} x ${fmt(r.traceRunCount)}</td>
      <td>${fmt(r.totalWatts)}</td>
      <td>${fmt(r.requiredWatts)}</td>
      <td>${fmt(r.voltageV)}</td>
      <td>${fmt(r.loadAmps)}</td>
      <td>${esc(r.warnings.join(' | ') || 'None')}</td>
    </tr>`).join('') : '<tr><td colspan="11">No saved heat trace branches.</td></tr>'}</tbody>
  </table>
  </div>
  ${heatTrace.warnings.length
    ? `<div class="report-alert report-alert--warning"><strong>Heat trace warnings:</strong><ul>${heatTrace.warnings.map(w => `<li>${esc(w.source)}: ${esc(w.message)}</li>`).join('')}</ul></div>`
    : '<p class="report-empty">No heat trace warnings detected.</p>'}
  ${heatTrace.installationPackage ? `
  <h3>Heat Trace Construction Package</h3>
  <p class="report-note">Vendor-neutral line list, controller schedule, and BOM for construction planning. Final cable family, startup current, T-class, sheath temperature, and accessory selections require manufacturer verification.</p>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>Pipe Tag</th><th>Service</th><th>Area</th><th>Controller</th><th>Circuit</th><th>Cable Family</th><th>Effective ft</th><th>Installed W</th><th>Status</th></tr></thead>
    <tbody>${heatTrace.installationPackage.lineList.rows.length ? heatTrace.installationPackage.lineList.rows.map(r => `<tr>
      <td>${esc(r.pipeTag)}</td>
      <td>${esc(r.service || 'n/a')}</td>
      <td>${esc(r.area || 'n/a')}</td>
      <td>${esc(r.controllerTag)}</td>
      <td>${esc(r.circuitNumber || 'n/a')}</td>
      <td>${esc(r.cableFamilyLabel)}</td>
      <td>${fmt(r.effectiveTraceLengthFt)}</td>
      <td>${fmt(r.installedWatts)}</td>
      <td>${esc(r.productSelectionStatus)}</td>
    </tr>`).join('') : '<tr><td colspan="9">No heat trace line list rows.</td></tr>'}</tbody>
  </table>
  </div>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>Controller</th><th>Source Panel</th><th>Voltage</th><th>Branches</th><th>kW</th><th>Amps</th><th>Circuits</th></tr></thead>
    <tbody>${heatTrace.installationPackage.controllerSchedule.rows.length ? heatTrace.installationPackage.controllerSchedule.rows.map(r => `<tr>
      <td>${esc(r.controllerTag)}</td>
      <td>${esc(r.sourcePanel)}</td>
      <td>${fmt(r.voltageV)}</td>
      <td>${fmt(r.branchCount)}</td>
      <td>${fmt(r.totalKw)}</td>
      <td>${fmt(r.totalAmps)}</td>
      <td>${esc(r.circuitNumbers || 'n/a')}</td>
    </tr>`).join('') : '<tr><td colspan="7">No controller schedule rows.</td></tr>'}</tbody>
  </table>
  </div>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>Item</th><th>Description</th><th>Qty</th><th>Unit</th><th>Basis</th></tr></thead>
    <tbody>${heatTrace.installationPackage.bom.rows.length ? heatTrace.installationPackage.bom.rows.map(r => `<tr>
      <td>${esc(r.itemId)}</td>
      <td>${esc(r.description)}</td>
      <td>${fmt(r.quantity)}</td>
      <td>${esc(r.unit)}</td>
      <td>${esc(r.basis)}</td>
    </tr>`).join('') : '<tr><td colspan="5">No BOM rows.</td></tr>'}</tbody>
  </table>
  </div>` : ''}
  ${heatTrace.advancedPackage ? renderHeatTraceAdvancedHTML(heatTrace.advancedPackage) : ''}
</section>` : ''}

<section class="report-section" id="rpt-validation">
  <h2>Validation</h2>
  ${validation.warnings.length === 0
    ? '<p class="report-empty">No issues found.</p>'
    : validation.warnings.map(w => `
  <div class="report-alert report-alert--${w.severity}">
    <strong>${esc(w.severity.toUpperCase())}:</strong> ${esc(w.message)}
    ${w.items && w.items.length ? `<ul>${w.items.slice(0, 10).map(i => `<li>${esc(i)}</li>`).join('')}${w.items.length > 10 ? `<li>…and ${w.items.length - 10} more</li>` : ''}</ul>` : ''}
  </div>`).join('')}
</section>`;

  return html;
}
