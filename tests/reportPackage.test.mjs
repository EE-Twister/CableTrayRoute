import assert from 'assert';
import { runHeatTraceSizingAnalysis } from '../analysis/heatTraceSizing.mjs';
import { generateProjectReport } from '../analysis/projectReport.mjs';
import {
  buildQualityChecklist,
  buildReportPackage,
  buildReportPackageSections,
  buildTransmittalRows,
  renderReportPackageHTML,
} from '../reports/reportPackage.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.log('  \u2717', name);
    console.error(err);
    process.exitCode = 1;
  }
}

const heatTraceInputs = {
  pipeNps: '1',
  insulationThicknessIn: 1,
  insulationType: 'mineralWool',
  lineLengthFt: 80,
  maintainTempC: 4.4,
  ambientTempC: -23.3,
  windSpeedMph: 5,
  safetyMarginPct: 15,
  maxCircuitLengthFt: 300,
  pipeMaterial: 'carbonSteel',
  environment: 'outdoor-sheltered',
  voltageV: 120,
  heatTraceCableType: 'selfRegulating',
};
const heatTraceResult = runHeatTraceSizingAnalysis(heatTraceInputs);

const report = generateProjectReport({
  projectName: 'North Unit',
  cables: [
    {
      id: 'C-101',
      from: 'MCC-1',
      to: 'P-101',
      conductor_size: '3/0',
      insulation_type: 'XHHW-2',
      voltage_rating: '600 V',
      length: 125,
      raceway: 'TR-1',
      od: 0.9,
      loadAmps: 180,
    },
  ],
  trays: [
    {
      tray_id: 'TR-1',
      tray_type: 'Ladder',
      inside_width: 12,
      tray_depth: 4,
      start: { x: 0, y: 0, z: 10 },
      end: { x: 10, y: 0, z: 10 },
      supportFamily: 'Unistrut',
      supportType: 'trapeze',
      supportSpacingFt: 5,
      labelId: 'LBL-TR-1',
      drawingRef: 'E-201',
      sectionRef: 'SEC-TR-1',
      constructionStatus: 'released',
      accessoryKits: '[{"name":"Cover <raceway>","quantity":1}]',
    },
  ],
  conduits: [],
  ductbanks: [],
  equipment: [
    {
      id: 'SWBD-1',
      tag: 'SWBD-1',
      category: 'Switchboard',
      interruptRatingKa: 65,
      sccrKa: 65,
      busBracingKa: 65,
      withstandRatingKa: 65,
      oneLineRef: 'swbd-1',
    },
  ],
  panels: [
    {
      id: 'P1',
      tag: 'P1 <Main>',
      voltage: 480,
      phases: 3,
      mainRating: 100,
      serviceGroup: 'Service <A>',
      phaseBalanceLimitPct: 10,
    },
  ],
  loads: [
    {
      id: 'L1',
      tag: 'Load <A>',
      panelId: 'P1',
      circuit: '1',
      kw: 25,
      powerFactor: 0.9,
      loadClass: 'motor',
      largestMotorCandidate: true,
      demandFactor: 100,
      demandBasisNote: 'NEC <basis>',
    },
  ],
  oneLine: {
    activeSheet: 0,
    sheets: [
      {
        name: 'Main',
        components: [
          { id: 'swbd-1', type: 'switchboard', label: 'SWBD-1' },
        ],
      },
    ],
  },
  studies: {
    shortCircuit: {
      'swbd-1': { threePhaseKA: 42 },
    },
    arcFlash: {
      'swbd-1': {
        equipmentTag: 'SWBD-1',
        incidentEnergy: 4.2,
        ppeCategory: 2,
        boundary: 900,
        clearingTime: 0.2,
        workingDistance: 455,
        upstreamDevice: 'Main breaker',
        requiredInputs: [],
      },
    },
    tcc: {
      devices: [{ id: 'br-1' }],
    },
    loadFlow: {
      converged: true,
      buses: [{
        id: 'swbd-1',
        displayLabel: 'SWBD-1',
        Vm: 0.982,
        Va: -1.5,
        baseKV: 0.48,
        voltageKV: 0.47136,
        voltageV: 471.36,
        type: 'PQ',
        Pd: 180,
        Qd: 75,
        Pg: 0,
        Qg: 0,
      }],
      lines: [],
      summary: { totalLoadKW: 180, totalLossKW: 0 },
      warnings: [],
    },
    cableFaultBracing: {
      summary: { pass: true },
    },
    heatTraceSizing: heatTraceResult,
    heatTraceSizingCircuits: [
      {
        id: 'ht-101',
        name: 'HT-101',
        unitSystem: 'imperial',
        inputs: heatTraceInputs,
        result: heatTraceResult,
        loadAmps: heatTraceResult.installedLoadAmps,
        assetType: 'tank',
        assetTag: 'TK <101>',
        panelPhase: 'unassigned',
        diversityGroup: 'Startup <A>',
        controlMetadata: { controllerType: 'electronic', controlMode: 'ambient', sensorCount: 0 },
        hazardousArea: { enabled: true, classification: 'Class I Div 2' },
        advancedSegments: [{
          label: 'Tank <shell>',
          assetType: 'tank',
          areaSqFt: 125,
          insulationType: 'mineralWool',
          insulationThicknessIn: 1.5,
          ambientTempC: -20,
          maintainTempC: 40,
          cableType: 'selfRegulating',
          wattDensityWPerSqFt: 7,
        }],
        createdAt: '2026-04-26T12:00:00.000Z',
        updatedAt: '2026-04-26T12:30:00.000Z',
      },
    ],
    groundGrid: {
      Rg: 0.42,
      GPR: 2100,
      Em: 640,
      Es: 520,
      Etouch: 800,
      Estep: 700,
      inputs: { gridLx: 30, gridLy: 20 },
      soilMeasurements: [
        { spacingM: 1, apparentResistivityOhmM: 85 },
        { spacingM: 4, apparentResistivityOhmM: 110 },
        { spacingM: 12, apparentResistivityOhmM: 150 },
        { spacingM: 24, apparentResistivityOhmM: 190 },
      ],
      fieldData: {
        soilMeasurements: [
          { spacingM: 1, apparentResistivityOhmM: 85 },
          { spacingM: 4, apparentResistivityOhmM: 110 },
          { spacingM: 12, apparentResistivityOhmM: 150 },
          { spacingM: 24, apparentResistivityOhmM: 190 },
        ],
        fallOfPotentialRows: [{ testId: 'FOP <A>', probeSpacingM: 80, measuredResistanceOhm: 0.4, curveDeviationPct: 3 }],
        seasonalInputs: { enabled: true, dryMultiplier: 1.5 },
        fidelityControls: { transferredPotentialPaths: [{ label: 'Fence <gate>', distanceM: 45 }] },
      },
    },
    cableThermalEnvironment: {
      version: 'cable-thermal-environment-v1',
      generatedAt: '2026-04-26T12:00:00.000Z',
      projectName: 'North Unit',
      summary: { total: 1, pass: 0, warn: 1, fail: 0, missingData: 0, worstLoadPct: 91, maxEstimatedTempC: 86 },
      advancedInputs: {
        enabled: true,
        exposureMode: 'tunnel',
        cyclicRatingMode: 'emergencyProfile',
      },
      backfillZones: [{ id: 'bf-1', name: 'Thermal <sand>', thicknessMm: 300, thermalResistivity: 1.8 }],
      adjacentInfluences: [{ id: 'adj-1', label: 'Parallel <feeder>', distanceMm: 250, heatWm: 40 }],
      evaluations: [{
        cableTag: 'C-101',
        installationMethod: 'tray',
        designCurrentA: 180,
        allowableAmpacityA: 198,
        loadPct: 91,
        estimatedConductorTempC: 86,
        temperatureLimitC: 90,
        status: 'warn',
        limitingFactor: 'thermal margin',
        recommendation: 'Add thermal margin.',
        advancedWarnings: ['Tunnel/channel screening modifier applied.'],
      }],
      emergencyProfiles: [{
        cableTag: 'C-101',
        installationMethod: 'tray',
        points: [{ hour: 1, durationHours: 2, loadPct: 110, estimatedConductorTempC: 93, status: 'fail', notes: 'Emergency <load>' }],
      }],
      cyclicRatingRows: [{
        cableTag: 'C-101',
        installationMethod: 'tray',
        cyclicRatingMode: 'emergencyProfile',
        emergencyPointCount: 1,
        maxEmergencyTempC: 93,
        status: 'fail',
      }],
      advancedWarnings: ['Emergency overload profile exceeds the screening conductor temperature limit.'],
      warnings: ['Thermal margin is low.'],
      assumptions: ['Screening output.'],
    },
    transformerFeederSizing: {
      version: 'transformer-feeder-sizing-v1',
      generatedAt: '2026-04-27T12:00:00.000Z',
      projectName: 'North Unit',
      caseBasis: {
        caseName: 'Sizing <Case>',
        loadSource: 'manual',
        loadKva: 75,
        primaryVoltage: 480,
        secondaryVoltage: 208,
        phase: '3ph',
        transformerPhase: '3ph',
      },
      loadBasis: { source: 'manual', sourceLabel: 'Manual <load>', designKw: 67.5, designKva: 75 },
      transformerRows: [{
        id: 'tf-1',
        caseName: 'Sizing <Case>',
        loadSource: 'manual',
        designKva: 75,
        selectedKva: 75,
        loadPct: 100,
        status: 'warn',
        recommendation: 'Review margin <note>.',
      }],
      feederRows: [{
        id: 'tf-1',
        caseName: 'Sizing <Case>',
        loadSource: 'manual',
        designKva: 75,
        designCurrentA: 208.2,
        requiredAmpacityA: 260.3,
        conductorSize: '300 kcmil',
        installedAmpacityA: 285,
        ocpdRatingA: 300,
        status: 'pass',
        recommendation: 'Feeder passes.',
      }],
      alternativeRows: [{
        recordType: 'transformerAlternative',
        kva: 45,
        status: 'rejected',
        reason: 'Below design <kVA>.',
      }],
      protectionRows: [],
      tapRows: [],
      warningRows: [{ severity: 'warning', code: 'missingTransformerImpedance', message: 'Transformer impedance <missing>.' }],
      assumptions: ['Screening output.'],
      summary: { transformerCount: 1, feederCount: 1, alternativeCount: 1, selectedTransformerKva: 75, selectedFeederConductor: '300 kcmil', designKva: 75, designKw: 67.5, fail: 0, warn: 1, missingData: 1, warningCount: 1, status: 'review' },
    },
    voltageDropStudy: {
      version: 'voltage-drop-study-v1',
      generatedAt: '2026-04-27T12:00:00.000Z',
      projectName: 'North Unit',
      criteria: { feederLimitPct: 3, branchLimitPct: 3, totalLimitPct: 5, normalLimitPct: 3, emergencyLimitPct: 5, startingLimitPct: 10, warningMarginPct: 80, reportPreset: 'fullStudy' },
      operatingCase: { caseType: 'start', sourceVoltagePct: 95, transformerTapPct: -2.5, loadPowerFactor: 0.88, conductorTemperatureC: 90, motorMinimumStartingVoltagePu: 0.8, segmentChainBasisNote: 'Source <chain>' },
      rows: [{
        id: 'C-101',
        tag: 'C-101 <VD>',
        from: 'MCC <1>',
        to: 'P-101',
        circuitType: 'branch',
        caseType: 'start',
        lengthFt: 125,
        currentA: 180,
        voltageV: 480,
        loadPowerFactor: 0.88,
        conductorSize: '3/0',
        material: 'copper',
        conductorTemperatureC: 90,
        dropPct: 11.2,
        applicableLimitPct: 10,
        totalChainDropPct: 12,
        totalLimitPct: 5,
        startVoltagePu: 0.78,
        startVoltageMarginPu: -0.02,
        status: 'fail',
        reason: 'Starting voltage is below the configured motor minimum.',
        recommendation: 'Review conductor size.',
      }],
      segmentRows: [{ cableTag: 'C-101 <VD>', caseType: 'start', totalChainDropPct: 12, totalLimitPct: 5, status: 'fail', segmentChainBasisNote: 'Source <chain>' }],
      alternativeRows: [],
      warningRows: [{ severity: 'warning', code: 'voltageDropReview', message: 'Voltage drop <review>.', sourceId: 'C-101' }],
      assumptions: ['Screening output.'],
      summary: { total: 1, pass: 0, warn: 0, fail: 1, missingData: 0, maxDropPct: 11.2, avgDropPct: 11.2, warningCount: 1, status: 'action-required' },
    },
    voltageFlicker: {
      version: 'voltage-flicker-study-v1',
      generatedAt: '2026-04-27T12:00:00.000Z',
      projectName: 'North Unit',
      studyCase: {
        pccTag: 'PCC <Main>',
        standardBasis: 'IEC61000-4-15',
        sourceShortCircuitKva: 50000,
        pstPlanningLimit: 0.8,
        pstMandatoryLimit: 1,
        pltLimit: 0.65,
        pltBasis: 'estimated',
        reportPreset: 'fullStudy',
        notes: 'Utility <allocation> review.',
      },
      loadStepRows: [{
        id: 'vf-step-1',
        label: 'Arc <Furnace>',
        loadType: 'Arc Furnace',
        loadKw: 5000,
        repetitionsPerHour: 120,
        notes: 'Batch <mode>.',
      }],
      result: {
        worstPst: 1.2,
        worstPstRisk: 'fail',
        plt: 1.2,
        pltRisk: 'fail',
        pltSource: 'estimated',
      },
      complianceRows: [
        { id: 'worst-pst-mandatory', target: 'Pst', actualValue: 1.2, limit: 1, utilizationPct: 120, status: 'fail', source: 'calculatedFlicker', recommendation: 'Reduce step magnitude.' },
        { id: 'plt-limit', target: 'Plt', actualValue: 1.2, limit: 0.65, utilizationPct: 184.6, status: 'fail', source: 'estimatedWorstPst', recommendation: 'Confirm measured series.' },
      ],
      warningRows: [{ id: 'estimated-plt', severity: 'warning', message: 'Plt is estimated from worst Pst.' }],
      assumptions: ['Simplified rectangular voltage-change screening method.'],
      summary: { loadStepCount: 1, worstPst: 1.2, plt: 1.2, fail: 2, warn: 0, missingData: 0, warningCount: 1, status: 'fail' },
    },
    optimalPowerFlow: {
      version: 'optimal-power-flow-v1',
      generatedAt: '2026-04-26T12:00:00.000Z',
      projectName: 'North Unit',
      objective: { mode: 'cost', generationCost: 2500, lossKw: 1.2, voltageDeviation: 0.01, score: 2500 },
      summary: {
        feasible: false,
        generatorCount: 1,
        dispatchedCount: 1,
        totalDispatchedKw: 150,
        generationCost: 2500,
        lossKw: 1.2,
        fail: 1,
        warn: 0,
        missingData: 0,
        voltageViolations: 1,
        branchViolations: 0,
        insufficientCapacity: 0,
        objectiveMode: 'cost',
        objectiveScore: 2500,
      },
      dispatchRows: [{
        generatorId: 'GEN-1',
        generatorTag: 'Generator <A>',
        busId: 'swbd-1',
        pMinKw: 0,
        pMaxKw: 200,
        dispatchedKw: 150,
        dispatchedKvar: 0,
        marginalCost: 20,
        status: 'dispatched',
        bindingConstraints: [],
      }],
      constraintRows: [{
        targetType: 'bus',
        targetId: 'swbd-1',
        metric: 'voltagePu',
        limit: '0.95-1.05 pu',
        actualValue: 0.92,
        margin: -0.03,
        status: 'fail',
        recommendation: 'Review voltage support.',
      }],
      violations: [{
        targetType: 'bus',
        targetId: 'swbd-1',
        metric: 'voltagePu',
        limit: '0.95-1.05 pu',
        actualValue: 0.92,
        margin: -0.03,
        status: 'fail',
        recommendation: 'Review voltage support.',
      }],
      warnings: [],
      assumptions: ['Planning-grade OPF screening output.'],
      recommendations: ['Review voltage support.'],
    },
    motorStart: {
      version: 'motor-start-study-case-v1',
      generatedAt: '2026-04-26T12:00:00.000Z',
      projectName: 'North Unit',
      studyCase: {
        sourceBasis: 'manual',
        sourceCondition: 'generator',
        voltageLimits: { startMinPu: 0.8, runMinPu: 0.95, warningMarginPu: 0.03 },
        reportPreset: 'sequence',
      },
      motorRows: [{ id: 'MTR-1', tag: 'Pump <A>', hp: 250, voltageV: 480, starterType: 'dol' }],
      sequenceEvents: [{ id: 'evt-1', timeSec: 0, action: 'start', motorId: 'MTR-1' }],
      timeSeriesRows: [{ timeSec: 0, activeMotorIds: ['MTR-1'], voltagePu: 0.78, voltageSagPct: 22 }],
      worstCaseRows: [{
        motorId: 'MTR-1',
        motorTag: 'Pump <A>',
        busId: 'swbd-1',
        starterType: 'dol',
        startTimeSec: 0,
        inrushKA: 1.4,
        maxStartingCurrentKA: 1.4,
        minVoltagePu: 0.78,
        voltageSagPct: 22,
        accelTimeSec: 8,
        torqueMarginPct: 12,
        status: 'fail',
        recommendation: 'Stagger motor start.',
      }],
      summary: {
        motorCount: 1,
        eventCount: 1,
        timeSeriesCount: 1,
        worstCaseCount: 1,
        minVoltagePu: 0.78,
        maxVoltageSagPct: 22,
        failCount: 1,
        warnCount: 0,
        missingInputCount: 0,
        defaultedInputCount: 0,
        warningCount: 1,
      },
      warnings: [{ severity: 'warning', code: 'voltage-dip', message: 'Voltage dip exceeds limit.' }],
      assumptions: ['Screening output.'],
    },
    harmonicStudyCase: {
      version: 'harmonic-study-case-v1',
      generatedAt: '2026-04-27T12:00:00.000Z',
      projectName: 'North Unit',
      studyCase: {
        pccBus: 'PCC-1',
        pccTag: 'PCC <Main>',
        nominalVoltageKv: 0.48,
        utilityScMva: 5,
        utilityXrRatio: 10,
        maximumDemandCurrentA: 100,
        demandCurrentBasis: 'Measured <peak>',
        complianceBasis: 'IEEE519-2022',
        selectedComplianceBasis: 'IEEE519-2022',
        reportPreset: 'fullStudy',
      },
      sourceRows: [{
        id: 'vfd-1',
        tag: 'VFD <Pump>',
        sourceType: 'vfd',
        busId: 'PCC-1',
        componentId: 'vfd-1',
        fundamentalCurrentA: 500,
        spectrumText: '5:80,7:60,11:25',
      }],
      complianceRows: [{
        id: 'vfd-1-vthd',
        sourceId: 'vfd-1',
        sourceTag: 'VFD <Pump>',
        pccTag: 'PCC <Main>',
        checkType: 'VTHD',
        actualValue: 12,
        limitValue: 8,
        margin: -4,
        status: 'fail',
        recommendation: 'Add filter <review>.',
      }],
      filterAlternatives: [{
        id: 'filter-1',
        name: 'Filter <A>',
        filterType: 'passiveDetuned',
        targetHarmonics: [5, 7],
        expectedThdReductionPct: 35,
        frequencyScanResonanceRisk: 'danger',
        status: 'recommended',
        recommendation: 'Detune below fifth harmonic.',
      }],
      warnings: [{ severity: 'error', code: 'ieee519ComplianceFailure', message: 'VFD <Pump> VTHD status is fail.' }],
      assumptions: ['Screening output.'],
      summary: { sourceCount: 1, complianceRowCount: 1, filterAlternativeCount: 1, pass: 0, warn: 0, fail: 1, missingData: 0, worstVthdPct: 12, worstTddPct: 0, warningCount: 1, status: 'fail' },
    },
    capacitorBank: {
      version: 'capacitor-bank-duty-v1',
      generatedAt: '2026-04-27T12:00:00.000Z',
      projectName: 'North Unit',
      baseResult: { busLabel: 'Cap <Bus>', pKw: 1000, pfExisting: 0.8, pfTarget: 0.95, voltageKv: 0.48, kvaScMva: 15, kvarRequired: 421.3, bankSize: 600, resonance: { harmonicOrder: 5, riskLevel: 'danger', nearestDominant: 5 }, warnings: [] },
      dutyCase: { busLabel: 'Cap <Bus>', voltageKv: 0.48, targetPowerFactor: 0.95, topology: 'plain', controlMode: 'automatic', controllerDeadband: 0.02, controllerTimeDelaySec: 30 },
      stageRows: [{ id: 'stage-1', label: 'Stage <1>', kvar: 600, voltageRatingKv: 0.6, switchingDevice: 'contactor', stepOrder: 1, enabled: true, dischargeTimeSec: 60 }],
      controllerRows: [{ id: 'controller-1', controlMode: 'automatic', targetPowerFactor: 0.95, status: 'pass' }],
      dutyRows: [{ id: 'bank-resonance', stageId: 'bank', stageLabel: 'Cap <Bus>', checkType: 'resonanceDetuning', actualValue: 5, limitValue: 0, unit: 'harmonic/reactor%', status: 'fail', recommendation: 'Plain bank resonance <danger>.' }],
      protectionRows: [{ id: 'bank-protection', protectionType: 'shortCircuitSwitching', deviceTags: '', ctRatio: '', unbalanceProtection: false, stageCount: 1, status: 'missingData', recommendation: 'Record protection <basis>.' }],
      switchingRows: [{ id: 'stage-1-switching', stageId: 'stage-1', stageLabel: 'Stage <1>', switchingDevice: 'contactor', estimatedInrushA: 14434, inrushLimitA: 10000, status: 'fail', recommendation: 'Verify switching <duty>.' }],
      frequencyScanLinks: [{ id: 'frequency-scan-1', source: 'frequencyScan', harmonicOrder: 5, risk: 'danger', message: 'Frequency scan <danger>.', status: 'fail' }],
      warningRows: [{ severity: 'error', code: 'resonanceDetuning', sourceId: 'bank', message: 'Plain bank resonance <danger>.' }],
      assumptions: ['Screening output.'],
      summary: { stageCount: 1, enabledStageCount: 1, totalEnabledKvar: 600, dutyRowCount: 1, protectionRowCount: 1, switchingRowCount: 1, warningCount: 1, pass: 0, warn: 0, fail: 2, missingData: 1, status: 'action-required' },
    },
    reliability: {
      version: 'reliability-network-v1',
      generatedAt: '2026-04-27T12:00:00.000Z',
      projectName: 'North Unit',
      model: { scenarioMode: 'n1', restorationEnabled: true, includeCommonMode: true },
      componentRows: [{ id: 'brk-1', tag: 'Breaker <A>', type: 'breaker', failureRatePerYear: 1, repairTimeHours: 4, protectionZone: 'Z1' }],
      customerRows: [{ id: 'cust-1', name: 'Process <Line>', protectionZone: 'Z1', customerCount: 10, loadKw: 100, valueOfLostLoadPerKwh: 10 }],
      restorationRows: [{ id: 'tie-1', tieSourceId: 'tie-a', switchingDevice: 'NO <1>', affectedZone: 'Z1', restorationTimeHours: 1, pickupCapacityKw: 200 }],
      scenarioRows: [{
        id: 'n1-brk-1',
        scenarioType: 'N-1',
        componentId: 'brk-1',
        componentTag: 'Breaker <A>',
        affectedCustomerCount: 10,
        affectedLoadKw: 100,
        outageDurationHours: 1,
        restorationApplied: true,
        customerInterruptions: 10,
        customerHours: 10,
        energyNotServedKwh: 100,
        economicCost: 1000,
        status: 'pass',
        recommendation: 'Scenario represented in reliability indices.',
      }],
      indexRows: [
        { id: 'SAIFI', label: 'SAIFI', value: 1, unit: 'interruptions/customer-year', status: 'pass' },
        { id: 'SAIDI', label: 'SAIDI', value: 1, unit: 'hours/customer-year', status: 'pass' },
        { id: 'CAIDI', label: 'CAIDI', value: 1, unit: 'hours/interruption', status: 'pass' },
        { id: 'ASAI', label: 'ASAI', value: 0.99988584, unit: 'pu', status: 'pass' },
        { id: 'EENS', label: 'EENS', value: 100, unit: 'kWh/year', status: 'pass' },
        { id: 'ECOST', label: 'ECOST', value: 1000, unit: 'currency/year', status: 'review' },
      ],
      contributorRows: [{ rank: 1, componentId: 'brk-1', componentTag: 'Breaker <A>', customerHours: 10, energyNotServedKwh: 100, economicCost: 1000, status: 'pass' }],
      warningRows: [{ severity: 'warning', code: 'screening', message: 'Reliability <screening> basis only.' }],
      assumptions: ['Screening output.'],
      summary: { componentCount: 1, customerGroupCount: 1, restorationCount: 1, scenarioCount: 1, totalCustomers: 10, saifi: 1, saidi: 1, caidi: 1, asai: 0.99988584, eensKwh: 100, ecost: 1000, warningCount: 1, indexWarn: 1, missingData: 0, status: 'review' },
    },
    transientStability: {
      version: 'transient-stability-study-case-v1',
      generatedAt: '2026-04-27T12:00:00.000Z',
      projectName: 'North Unit',
      studyCase: { caseName: 'Gen <Trip>', frequencyHz: 60, clearingTimeSec: 0.1, simulationDurationSec: 2, reportPreset: 'dynamicStudy' },
      dynamicModelRows: [{ id: 'gen-1', tag: 'Gen <A>', modelType: 'synchronousGenerator', busId: 'swbd-1', H: 5, Pm: 1, Pmax_pre: 2.1, Pmax_fault: 0.6, Pmax_post: 1.75 }],
      disturbanceEventRows: [
        { id: 'fault-1', label: 'Fault <A>', eventType: 'fault', timeSec: 0, targetId: 'gen-1' },
        { id: 'clear-1', label: 'Clear <A>', eventType: 'clearFault', timeSec: 0.1, targetId: 'gen-1' },
      ],
      scenarioRows: [{ id: 'scenario-gen-1', modelId: 'gen-1', modelTag: 'Gen <A>', clearingTimeSec: 0.1, stable: true, maxRotorAngleDeg: 82, cctSec: 0.24, cctMarginSec: 0.14, status: 'pass', recommendation: 'Stable <screening>.' }],
      channelRows: [{ timeSec: 0, modelId: 'gen-1', modelTag: 'Gen <A>', rotorAngleDeg: 28.4, speedDeviationRadPerSec: 0, eventMarker: 'fault', stabilityMarginDeg: 151.6 }],
      cctSweepRows: [{ id: 'cct-gen-1', modelId: 'gen-1', modelTag: 'Gen <A>', clearingTimeSec: 0.1, cctSec: 0.24, marginSec: 0.14, status: 'pass', recommendation: 'CCT margin acceptable.' }],
      warningRows: [{ severity: 'warning', code: 'unsupportedControlModel', sourceId: 'gen-1', message: 'AVR <placeholder> not solved.' }],
      assumptions: ['Screening output.'],
      summary: { modelCount: 1, eventCount: 2, scenarioCount: 1, channelCount: 1, cctSweepCount: 1, pass: 2, warn: 0, fail: 0, missingData: 0, warningCount: 1, minCctMarginSec: 0.14, maxRotorAngleDeg: 82, status: 'review' },
    },
    protectionSettingSheets: {
      version: 'protection-setting-sheet-v1',
      generatedAt: '2026-04-27T12:00:00.000Z',
      projectName: 'North Unit',
      summary: {
        deviceCount: 1,
        functionCount: 2,
        settingGroupCount: 1,
        testCount: 2,
        pass: 4,
        warn: 0,
        missingData: 0,
        disabledFunctions: 0,
        warningCount: 0,
        coordinationLinked: true,
      },
      deviceRows: [{
        componentId: 'relay-main',
        deviceTag: 'Relay <Main>',
        catalogDeviceId: 'relay-a',
        manufacturer: 'Acme',
        model: 'Relay 100',
        voltageV: 480,
        ctPrimaryA: 600,
        ctSecondaryA: 5,
        ptPrimaryV: 480,
        ptSecondaryV: 120,
        connectedBus: 'swbd-1',
        sourceLoadRole: 'loadSide',
        activeGroup: 'Normal',
        revision: 'R1',
        reviewer: 'C. Reviewer',
        status: 'pass',
        recommendation: 'Setting sheet is traceable.',
      }],
      functionRows: [{
        componentId: 'relay-main',
        deviceTag: 'Relay <Main>',
        functionCode: '51',
        enabled: true,
        pickupA: 500,
        secondaryPickupA: 4.1667,
        delaySec: 0.3,
        timeDial: 4,
        curveFamily: 'iec',
        curveProfile: 'standardInverse',
        tolerancePct: 10,
        status: 'pass',
      }],
      settingGroupRows: [{
        componentId: 'relay-main',
        deviceTag: 'Relay <Main>',
        activeGroup: 'Normal',
        revision: 'R1',
        reviewer: 'C. Reviewer',
        status: 'pass',
      }],
      testRows: [{
        componentId: 'relay-main',
        deviceTag: 'Relay <Main>',
        functionCode: '51',
        testCurrentPrimaryA: 1000,
        secondaryInjectionA: 8.3333,
        expectedTripSec: 4,
        toleranceMinSec: 3.6,
        toleranceMaxSec: 4.4,
        status: 'pass',
      }],
      coordinationBasis: { maxFaultA: 42000, margin: 0.3, coordinated: true },
      revisionHistory: [],
      warnings: [],
      assumptions: ['Local engineering setting governance record.'],
    },
    pullConstructability: {
      version: 'pull-constructability-v1',
      generatedAt: '2026-04-27T12:00:00.000Z',
      summary: { pullCount: 1, pass: 0, warn: 1, fail: 0, missingData: 1, warningCount: 1 },
      inputs: { frictionCoefficient: 0.35, lubricantFactor: 1 },
      pullRows: [{
        pullNumber: 1,
        cableTags: 'C-101 <pull>',
        recommendedDirection: 'reverse',
        status: 'warn',
        maxTensionLbs: 640,
        tensionLimitLbs: 1000,
        tensionMarginPct: 36,
        maxSidewallPressureLbsPerFt: 180,
        sidewallMarginPct: 40,
        warningCount: 1,
      }],
      sectionRows: [],
      bendRows: [],
      directionComparisons: [],
      warningRows: [{ pullNumber: 1, severity: 'warning', message: 'Verify bend <radius>.', recommendation: 'Verify field route.' }],
      assumptions: ['Screening output.'],
    },
  },
  productCatalog: [
    {
      manufacturer: 'Acme',
      catalogNumber: 'SWBD-65',
      category: 'protectiveDevice',
      description: 'Switchboard 65 kA lineup <approved>',
      approved: true,
      approvalStatus: 'approved',
      approvedBy: 'D. Engineer',
      lastVerified: '2026-04-26',
      standards: ['UL 891'],
    },
  ],
  pricingFeedRows: [
    {
      sourceType: 'vendorQuote',
      sourceName: 'Supplier <Cost>',
      quoteNumber: 'Q-101',
      quoteDate: '2026-04-26',
      expiresAt: '2026-06-30',
      currency: 'USD',
      manufacturer: 'Acme',
      catalogNumber: 'SWBD-65',
      category: 'protectiveDevice',
      description: 'Switchboard pricing <basis>',
      uom: 'ea',
      unitPrice: 10000,
      approvalStatus: 'approved',
      approved: true,
      lastVerified: '2026-04-26',
    },
    {
      sourceType: 'manualBook',
      sourceName: 'Estimator Book',
      category: 'cableType',
      key: 'default',
      description: 'Cable default <cost>',
      uom: 'ft',
      unitPrice: 2.5,
      approvalStatus: 'approved',
      approved: true,
      lastVerified: '2026-04-26',
    },
  ],
  componentLibrary: {
    categories: ['power'],
    components: [{ subtype: 'switchboard', label: 'Local Switchboard', icon: 'swbd', category: 'power', ports: 2, schema: {} }],
    icons: { swbd: 'icons/components/Switchboard.svg' },
  },
  cloudLibraryReleases: [
    {
      id: 'cloud-release-r1',
      workspaceId: 'plant-a',
      name: 'Organization <Component> Library',
      releaseTag: 'R1',
      status: 'released',
      createdAt: '2026-04-26T12:00:00.000Z',
      createdBy: 'Library <Admin>',
      approvalStatus: 'approved',
      approvedBy: 'D. Engineer',
      approvedAt: '2026-04-26T12:10:00.000Z',
      data: {
        categories: ['power', 'protection'],
        components: [
          { subtype: 'switchboard', label: 'Approved Switchboard', icon: 'swbd', category: 'power', ports: 4, schema: {} },
          { subtype: 'breaker', label: 'Breaker', icon: 'breaker', category: 'protection', ports: 2, schema: {} },
        ],
        icons: { swbd: 'icons/components/Switchboard.svg', breaker: 'icons/components/Breaker.svg' },
      },
    },
  ],
  componentLibrarySubscription: {
    workspaceId: 'plant-a',
    releaseId: 'cloud-release-r1',
    releaseTag: 'R1',
    pinnedVersion: 'org-R1',
    mergeMode: 'merge',
  },
  bimObjectFamilies: [
    {
      manufacturer: 'Acme',
      catalogNumber: 'SWBD-65',
      category: 'protectiveDevice',
      familyName: 'Switchboard <BIM>',
      nativeFormat: 'revitFamily',
      ifcClass: 'IfcElectricDistributionBoard',
      connectorTypes: ['power'],
      nominalDimensions: { widthIn: 36, depthIn: 24 },
      approved: true,
      approvalStatus: 'approved',
      lastVerified: '2026-04-26',
    },
  ],
  fieldObservations: [
    {
      id: 'field-c-101',
      elementType: 'cable',
      elementId: 'C-101',
      elementTag: 'C-101 <field>',
      observationType: 'punch',
      status: 'open',
      priority: 'high',
      comments: 'Replace damaged field tag.',
      attachments: [{ name: 'tag.jpg', type: 'image/jpeg', sizeBytes: 1200 }],
      createdAt: '2026-04-26T12:00:00.000Z',
      createdBy: 'F. Tech',
      updatedAt: '2026-04-26T12:00:00.000Z',
    },
  ],
  bimElements: [
    {
      guid: 'g-tr-1',
      sourceId: 'revit-tr-1',
      elementType: 'cableTray',
      tag: 'TR-1',
      system: 'Power',
      level: 'L1',
      area: 'Unit A',
      lengthFt: 150,
    },
  ],
  bimIssues: [
    {
      id: 'bim-issue-1',
      title: 'Resolve <BIM> quantity delta',
      description: 'BIM tray length exceeds CableTrayRoute route quantity.',
      status: 'open',
      priority: 'high',
      assignee: 'BIM <Lead>',
      elementIds: ['g-tr-1'],
      comments: [],
      createdAt: '2026-04-26T12:00:00.000Z',
      updatedAt: '2026-04-26T12:00:00.000Z',
    },
  ],
  bimConnectorPackages: [
    {
      id: 'connector-r1',
      version: 'bim-connector-contract-v1',
      connectorType: 'revit',
      sourceApplication: 'Revit <Connector>',
      projectId: 'North Unit',
      scenario: 'base',
      createdAt: '2026-04-26T12:00:00.000Z',
      elements: [
        {
          guid: 'g-tr-1',
          elementType: 'cableTray',
          tag: 'TR-1',
          system: 'Power',
          level: 'L1',
          area: 'Unit A',
          lengthFt: 150,
        },
      ],
      issues: [{ id: 'connector-issue-1', title: 'Resolve <connector>', status: 'open' }],
      warnings: ['Review <connector> exchange package.'],
    },
  ],
  activeBimConnectorPackageId: 'connector-r1',
});

report.lifecycle = {
  revisionCount: 1,
  packageCount: 1,
  releasedCount: 1,
  draftCount: 0,
  activePackage: {
    id: 'pkg-r1',
    name: 'IFC <Release>',
    revision: 'R1',
    status: 'released',
    scenario: 'base',
    author: 'D. Engineer',
    createdAt: '2026-04-26T12:00:00.000Z',
    modelHash: 'fnv1a-12345678',
    studyCount: 1,
    diffFromPrevious: {
      summary: {
        schedulesAdded: 1,
        schedulesRemoved: 0,
        schedulesChanged: 0,
        studiesChanged: 1,
      },
    },
  },
};

report.designCoach = {
  version: 'design-coach-v1',
  generatedAt: '2026-04-26T12:00:00.000Z',
  summary: {
    total: 1,
    highPriority: 1,
    applyAvailable: 0,
    bySeverity: { high: 1 },
    byCategory: { code: 1 },
  },
  actions: [
    {
      id: 'coach-drc',
      fingerprint: 'drc:tr-1',
      title: 'Resolve <tray> fill',
      description: 'Tray fill is over limit.',
      severity: 'high',
      category: 'code',
      confidence: 0.9,
      scope: { raceway: 'TR-1' },
      source: { type: 'racewayFill', key: 'TR-1' },
      recommendation: 'Resize or reroute the affected raceway.',
      tradeoffs: 'May affect cost.',
      pageHref: 'cabletrayfill.html',
    },
  ],
  decisions: [],
};

describe('commercial report package builder', () => {
  it('builds ordered deliverable sections from a project report', () => {
    const sections = buildReportPackageSections(report);
    assert.strictEqual(sections[0].id, 'cover');
    assert(sections.some(section => section.id === 'cableSchedule'));
    assert(sections.some(section => section.id === 'lifecycle'));
    assert(sections.some(section => section.id === 'designCoach'));
    assert(sections.some(section => section.id === 'productCatalog'));
    assert(sections.some(section => section.id === 'pricingFeedGovernance'));
    assert(sections.some(section => section.id === 'cloudLibraryGovernance'));
    assert(sections.some(section => section.id === 'fieldCommissioning'));
    assert(sections.some(section => section.id === 'bimRoundTrip'));
    assert(sections.some(section => section.id === 'bimConnectorReadiness'));
    assert(sections.some(section => section.id === 'nativeBimConnectorKit'));
    assert(sections.some(section => section.id === 'revitSyncReadiness'));
    assert(sections.some(section => section.id === 'revitNativeSync'));
    assert(sections.some(section => section.id === 'autocadSyncReadiness'));
    assert(sections.some(section => section.id === 'autocadNativeSync'));
    assert(sections.some(section => section.id === 'plantCadSyncReadiness'));
    assert(sections.some(section => section.id === 'plantCadNativeSync'));
    assert(sections.some(section => section.id === 'bimObjectLibrary'));
    assert(sections.some(section => section.id === 'shortCircuit'));
    assert(sections.some(section => section.id === 'arcFlash'));
    assert(sections.some(section => section.id === 'motorStart'));
    assert(sections.some(section => section.id === 'harmonicStudy'));
    assert(sections.some(section => section.id === 'capacitorBankDuty'));
    assert(sections.some(section => section.id === 'reliabilityNetwork'));
    assert(sections.some(section => section.id === 'transientStability'));
    assert(sections.some(section => section.id === 'loadDemandGovernance'));
    assert(sections.some(section => section.id === 'transformerFeederSizing'));
    assert(sections.some(section => section.id === 'voltageDropStudy'));
    assert(sections.some(section => section.id === 'voltageFlicker'));
    assert(sections.some(section => section.id === 'pullConstructability'));
    assert(sections.some(section => section.id === 'racewayConstruction'));
    assert(sections.some(section => section.id === 'equipmentEvaluation'));
    assert(sections.some(section => section.id === 'advancedGrounding'));
    assert(sections.some(section => section.id === 'cableThermalEnvironment'));
    assert(sections.some(section => section.id === 'loadFlow'));
    assert(sections.some(section => section.id === 'optimalPowerFlow'));
    assert(sections.some(section => section.id === 'heatTrace'));
    assert.strictEqual(sections.find(section => section.id === 'cableSchedule').rowCount, 1);
  });

  it('creates a quality checklist with package readiness status', () => {
    const sections = buildReportPackageSections(report);
    const checks = buildQualityChecklist(report, sections);
    assert(checks.some(check => check.id === 'validation'));
    assert(checks.every(check => ['ready', 'review', 'action-required', 'not-run'].includes(check.status)));
  });

  it('creates manifest, transmittal, checklist, and data files', () => {
    const pkg = buildReportPackage(report, {
      revision: 'B',
      preparedBy: 'D. Engineer',
      checkedBy: 'C. Reviewer',
      generatedAt: '2026-04-26T12:00:00.000Z',
    });
    const paths = pkg.files.map(file => file.path);
    assert.strictEqual(pkg.packageId, 'north-unit-report-package-B');
    assert(paths.includes('manifest.json'));
    assert(paths.includes('index.html'));
    assert(paths.includes('transmittal.csv'));
    assert(paths.includes('quality_checklist.csv'));
    assert(paths.includes('data/product_catalog_governance.csv'));
    assert(paths.includes('data/pricing_feed_governance.csv'));
    assert(paths.includes('data/cloud_component_library_governance.csv'));
    assert(paths.includes('data/bim_object_library.csv'));
    assert(paths.includes('data/field_verification.csv'));
    assert(paths.includes('data/bim_quantity_reconciliation.csv'));
    assert(paths.includes('data/bim_connector_readiness.csv'));
    assert(paths.includes('data/native_bim_connector_kit.csv'));
    assert(paths.includes('data/revit_sync_readiness.csv'));
    assert(paths.includes('data/revit_native_sync.csv'));
    assert(paths.includes('data/autocad_native_sync.csv'));
    assert(paths.includes('data/plantcad_sync_readiness.csv'));
    assert(paths.includes('data/plantcad_native_sync.csv'));
    assert(paths.includes('data/short_circuit_duty_rows.csv'));
    assert(paths.includes('data/arc_flash_scenario_comparison.csv'));
    assert(paths.includes('data/motor_start_worst_cases.csv'));
    assert(paths.includes('data/harmonic_study_compliance.csv'));
    assert(paths.includes('data/reliability_network.csv'));
    assert(paths.includes('data/transient_stability.csv'));
    assert(paths.includes('data/protection_setting_sheets.csv'));
    assert(paths.includes('data/load_demand_governance.csv'));
    assert(paths.includes('data/transformer_feeder_sizing.csv'));
    assert(paths.includes('data/pull_constructability.csv'));
    assert(paths.includes('data/raceway_construction_details.csv'));
    assert(paths.includes('data/cable_schedule.csv'));
    assert(paths.includes('data/equipment_evaluation.csv'));
    assert(paths.includes('data/advanced_grounding_risk_points.csv'));
    assert(paths.includes('data/cable_thermal_environment.csv'));
    assert(paths.includes('data/load_flow_voltage_profile.csv'));
    assert(paths.includes('data/voltage_drop_study.csv'));
    assert(paths.includes('data/voltage_flicker_study.csv'));
    assert(paths.includes('data/optimal_power_flow_dispatch.csv'));
    assert(paths.includes('data/capacitor_bank_duty.csv'));
    assert(paths.includes('data/heat_trace_branch_schedule.csv'));
    assert(paths.includes('data/heat_trace_line_list.csv'));
    assert(paths.includes('data/heat_trace_controller_schedule.csv'));
    assert(paths.includes('data/heat_trace_bom.csv'));
    assert(paths.includes('data/heat_trace_advanced_assets.csv'));
    const manifest = JSON.parse(pkg.files.find(file => file.path === 'manifest.json').content);
    assert.strictEqual(manifest.revision, 'B');
    assert.strictEqual(manifest.preparedBy, 'D. Engineer');
    assert.strictEqual(manifest.lifecycle.activePackage.revision, 'R1');
    assert.strictEqual(manifest.productCatalog.summary.total, 1);
    assert.strictEqual(manifest.pricingFeedGovernance.summary.pricingRowCount, 2);
    assert.strictEqual(manifest.pricingFeedGovernance.summary.approvedRowCount, 2);
    assert.strictEqual(manifest.cloudLibraryGovernance.summary.releaseCount, 1);
    assert.strictEqual(manifest.cloudLibraryGovernance.summary.approvedReleaseCount, 1);
    assert.strictEqual(manifest.cloudLibraryGovernance.subscription.releaseId, 'cloud-release-r1');
    assert.strictEqual(manifest.fieldCommissioning.summary.openItems, 1);
    assert.strictEqual(manifest.bimRoundTrip.summary.elementCount, 1);
    assert.strictEqual(manifest.bimRoundTrip.summary.openIssues, 1);
    assert.strictEqual(manifest.bimConnectorReadiness.summary.packageCount, 1);
    assert.strictEqual(manifest.nativeBimConnectorKit.summary.descriptorCount, 5);
    assert.strictEqual(manifest.nativeBimConnectorKit.descriptors[0].contractVersion, 'bim-connector-contract-v1');
    assert.strictEqual(manifest.revitSyncReadiness.summary.contractVersion, 'bim-connector-contract-v1');
    assert.strictEqual(manifest.revitSyncReadiness.descriptor.connectorType, 'revit');
    assert.strictEqual(manifest.revitNativeSync.summary.contractVersion, 'bim-connector-contract-v1');
    assert.strictEqual(manifest.revitNativeSync.nativeSyncCase.descriptor.connectorType, 'revit');
    assert(manifest.revitNativeSync.sourceManifest.commandRows.some(row => row.commandName === 'ExportCableTrayRouteJson'));
    assert.strictEqual(manifest.autocadSyncReadiness.summary.contractVersion, 'bim-connector-contract-v1');
    assert.strictEqual(manifest.autocadSyncReadiness.descriptor.connectorType, 'autocad');
    assert.strictEqual(manifest.autocadNativeSync.summary.contractVersion, 'bim-connector-contract-v1');
    assert.strictEqual(manifest.autocadNativeSync.nativeSyncCase.descriptor.connectorType, 'autocad');
    assert(manifest.autocadNativeSync.sourceManifest.commandRows.some(row => row.commandName === 'ExportCableTrayRouteJson'));
    assert.strictEqual(manifest.plantCadSyncReadiness.summary.contractVersion, 'bim-connector-contract-v1');
    assert(manifest.plantCadSyncReadiness.descriptors.some(row => row.connectorType === 'aveva'));
    assert(manifest.plantCadSyncReadiness.descriptors.some(row => row.connectorType === 'smartplant'));
    assert.strictEqual(manifest.plantCadNativeSync.summary.contractVersion, 'bim-connector-contract-v1');
    assert(manifest.plantCadNativeSync.nativeSyncCase.connectorTypes.includes('aveva'));
    assert(manifest.plantCadNativeSync.sourceManifest.commandRows.some(row => row.commandName === 'ExportCableTrayRouteJson'));
    assert.strictEqual(manifest.bimObjectLibrary.summary.familyCount, 1);
    assert(manifest.bimObjectLibrary.unresolved.length >= 1);
    assert.strictEqual(manifest.shortCircuit.summary.total, 1);
    assert.strictEqual(manifest.arcFlash.summary.highEnergyCount, 0);
    assert.strictEqual(manifest.motorStart.summary.maxVoltageSagPct, 22);
    assert.strictEqual(manifest.motorStart.unresolved[0].motorTag, 'Pump <A>');
    assert.strictEqual(manifest.harmonicStudy.summary.sourceCount, 1);
    assert.strictEqual(manifest.harmonicStudy.unresolved[0].sourceTag, 'VFD <Pump>');
    assert.strictEqual(manifest.harmonicStudy.filterAlternatives[0].name, 'Filter <A>');
    assert.strictEqual(manifest.capacitorBankDuty.summary.enabledStageCount, 1);
    assert.strictEqual(manifest.capacitorBankDuty.unresolved[0].stageLabel, 'Cap <Bus>');
    assert.strictEqual(manifest.reliabilityNetwork.summary.totalCustomers, 10);
    assert.strictEqual(manifest.reliabilityNetwork.indices[0].id, 'SAIFI');
    assert.strictEqual(manifest.reliabilityNetwork.topContributors[0].componentTag, 'Breaker <A>');
    assert.strictEqual(manifest.transientStability.summary.modelCount, 1);
    assert.strictEqual(manifest.transientStability.scenarioRows[0].modelTag, 'Gen <A>');
    assert.strictEqual(manifest.protectionSettingSheets.summary.deviceCount, 1);
    assert.strictEqual(manifest.protectionSettingSheets.coordinationBasis.maxFaultA, 42000);
    assert.strictEqual(manifest.loadDemandGovernance.summary.loadCount, 1);
    assert.strictEqual(manifest.transformerFeederSizing.summary.selectedTransformerKva, 75);
    assert.strictEqual(manifest.transformerFeederSizing.unresolved[0].caseName, 'Sizing <Case>');
    assert.strictEqual(manifest.voltageDropStudy.summary.fail, 1);
    assert.strictEqual(manifest.voltageDropStudy.unresolved[0].tag, 'C-101 <VD>');
    assert.strictEqual(manifest.voltageFlicker.summary.loadStepCount, 1);
    assert.strictEqual(manifest.voltageFlicker.studyCase.pccTag, 'PCC <Main>');
    assert.strictEqual(manifest.voltageFlicker.unresolved[0].target, 'Pst');
    assert.strictEqual(manifest.pullConstructability.summary.pullCount, 1);
    assert.strictEqual(manifest.pullConstructability.unresolved[0].cableTags, 'C-101 <pull>');
    assert.strictEqual(manifest.racewayConstruction.summary.detailCount, 1);
    assert.strictEqual(manifest.racewayConstruction.unresolved.length, 0);
    assert.strictEqual(manifest.designCoach.summary.highPriority, 1);
    assert.strictEqual(manifest.equipmentEvaluation.summary.equipmentCount, 1);
    assert.strictEqual(manifest.advancedGrounding.summary.riskPointCount, 4);
    assert.strictEqual(manifest.advancedGrounding.fieldFidelity.summary.fallOfPotentialCount, 1);
    assert.strictEqual(manifest.advancedGrounding.fieldFidelity.seasonalScenarios.length, 3);
    assert.strictEqual(manifest.cableThermalEnvironment.summary.total, 1);
    assert.strictEqual(manifest.cableThermalEnvironment.advancedWarnings.length, 1);
    assert.strictEqual(manifest.cableThermalEnvironment.backfillZones[0].name, 'Thermal <sand>');
    assert.strictEqual(manifest.heatTraceAdvanced.summary.assetCount, 1);
    assert.strictEqual(manifest.heatTraceAdvanced.unresolved[0].assetTag, 'TK <101>');
    assert.strictEqual(manifest.loadFlow.summary.phaseRowCount, 1);
    assert.strictEqual(manifest.optimalPowerFlow.summary.totalDispatchedKw, 150);
    assert.strictEqual(manifest.designCoach.unresolvedHighPriority[0].title, 'Resolve <tray> fill');
  });

  it('builds transmittal rows and printable package HTML', () => {
    const pkg = buildReportPackage(report, { generatedAt: '2026-04-26T12:00:00.000Z' });
    const rows = buildTransmittalRows(pkg);
    const html = renderReportPackageHTML(pkg);
    assert(rows.some(row => row.title === 'Cable Schedule'));
    assert(html.includes('Commercial Report Package'));
    assert(html.includes('Quality Checklist'));
    assert(html.includes('Lifecycle Lineage'));
    assert(html.includes('Design Coach Actions'));
    assert(html.includes('Product Catalog Governance'));
    assert(html.includes('Pricing Feed and Quote Governance'));
    assert(html.includes('Voltage Flicker Study Basis'));
    assert(html.includes('Cloud Component Library Governance'));
    assert(html.includes('Field Verification'));
    assert(html.includes('BIM Coordination'));
    assert(html.includes('BIM/CAD Connector Readiness'));
    assert(html.includes('Native BIM/CAD Connector Starter Kit'));
    assert(html.includes('Revit Connector Sync Readiness'));
    assert(html.includes('Functional AutoCAD Add-In Sync Readiness'));
    assert(html.includes('Functional Plant CAD Add-In Sync Readiness'));
    assert(html.includes('Short-Circuit Study Basis'));
    assert(html.includes('Arc Flash Study Basis'));
    assert(html.includes('Motor Start Study Basis'));
    assert(html.includes('Harmonic Study Basis'));
    assert(html.includes('Capacitor Bank Duty and Switching Basis'));
    assert(html.includes('Reliability Network Model and Customer Indices'));
    assert(html.includes('Transient Stability Study Basis'));
    assert(html.includes('Protection Setting Sheets'));
    assert(html.includes('Panel and Load Demand Basis'));
    assert(html.includes('Transformer and Feeder Sizing Basis'));
    assert(html.includes('Voltage Drop Study Basis'));
    assert(html.includes('Cable Pull Constructability'));
    assert(html.includes('Raceway Construction Details'));
    assert(html.includes('Equipment Evaluation'));
    assert(html.includes('Advanced Grounding'));
    assert(html.includes('Cable Thermal Environment'));
    assert(html.includes('Load Flow Study Basis'));
    assert(html.includes('Optimal Power Flow'));
    assert(html.includes('Heat Trace Advanced Assets and Controls'));
    assert(html.includes('IFC &lt;Release&gt;'));
    assert(!html.includes('IFC <Release>'));
    assert(!html.includes('Resolve <tray> fill'));
    assert(!html.includes('Supplier <Cost>'));
    assert(!html.includes('Switchboard pricing <basis>'));
    assert(!html.includes('Organization <Component> Library'));
    assert(!html.includes('Library <Admin>'));
    assert(!html.includes('Pump <A>'));
    assert(!html.includes('VFD <Pump>'));
    assert(!html.includes('Filter <A>'));
    assert(!html.includes('Breaker <A>'));
    assert(!html.includes('Gen <A>'));
    assert(!html.includes('Fault <A>'));
    assert(!html.includes('Relay <Main>'));
    assert(!html.includes('Load <A>'));
    assert(!html.includes('Sizing <Case>'));
    assert(!html.includes('C-101 <pull>'));
    assert(!html.includes('Cover <raceway>'));
    assert(!html.includes('FOP <A>'));
    assert(!html.includes('Fence <gate>'));
    assert(!html.includes('Emergency <load>'));
    assert(!html.includes('Resolve <BIM> quantity delta'));
    assert(!html.includes('Revit <Connector>'));
    assert(!html.includes('TK <101>'));
  });
});
