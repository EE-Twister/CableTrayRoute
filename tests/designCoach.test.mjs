import assert from 'node:assert/strict';
import {
  buildDesignCoachActions,
  buildDesignCoachPackage,
  dedupeDesignCoachActions,
  filterDesignCoachActions,
  rankDesignCoachActions,
  summarizeDesignCoachActions,
} from '../analysis/designCoach.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

const baseReport = {
  summary: { projectName: 'North Unit' },
  fill: {
    trays: [{ id: 'TR-1', usedPct: 92, limitPct: 50, status: 'over' }],
    conduits: [],
    summary: { overCount: 1, nearCount: 0 },
  },
  clashes: { clashes: [], severity: 'pass' },
  heatTrace: {
    warnings: [{ source: 'HT-101', message: 'Branch exceeds maximum circuit length.' }],
    installationPackage: { warnings: [{ source: 'BOM', message: 'Verify hazardous-area accessory selections with manufacturer.' }] },
  },
  validation: {
    pass: false,
    warnings: [{ severity: 'warning', message: '1 cable(s) have no raceway assigned.', items: ['C-101'] }],
  },
};

const drcFinding = {
  ruleId: 'DRC-02',
  severity: 'error',
  location: 'TR-1',
  message: 'Voltage segregation violation.',
  reference: 'NEC 392.6(H)',
  remediation: 'Add divider or reroute cables by voltage class.',
};

describe('design coach action builder', () => {
  it('turns DRC findings into ranked code actions', () => {
    const actions = buildDesignCoachActions({ drcFindings: [drcFinding], projectReport: { summary: {} } });
    const action = actions.find(row => row.source.type === 'drc');
    assert(action);
    assert.equal(action.category, 'code');
    assert.equal(action.severity, 'high');
    assert.equal(action.pageHref, 'designrulechecker.html');
  });

  it('turns project validation and raceway fill into missing-data and code actions', () => {
    const actions = buildDesignCoachActions({ projectReport: baseReport });
    assert(actions.some(action => action.category === 'missingData'));
    assert(actions.some(action => action.source.type === 'racewayFill' && action.category === 'code'));
  });

  it('turns heat trace warnings into construction and review actions', () => {
    const actions = buildDesignCoachActions({ projectReport: baseReport });
    assert(actions.some(action => action.source.type === 'heatTrace' && action.pageHref === 'heattracesizing.html'));
    assert(actions.some(action => action.category === 'review'));
  });

  it('turns raceway construction warning rows into missing-data and constructability actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        racewayConstruction: {
          detailRows: [{
            racewayId: 'TR-9',
            racewayType: 'tray',
            status: 'warn',
            warnings: ['TR-9 is missing support type.', 'TR-9 is missing drawing/detail references.'],
          }],
          warningRows: [{
            code: 'dividerLaneMismatch',
            severity: 'error',
            racewayId: 'TR-10',
            message: 'TR-10 divider lane 3 is outside the configured 1 tray slot(s).',
          }],
        },
      },
    });
    assert(actions.some(action => action.source.type === 'racewayConstruction' && action.category === 'missingData'));
    assert(actions.some(action => action.source.type === 'racewayConstruction' && action.category === 'constructability'));
    assert(actions.every(action => action.source.type !== 'racewayConstruction' || action.pageHref === 'racewayschedule.html'));
  });

  it('turns load demand governance warnings and panel failures into actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        loadDemandGovernance: {
          loadRows: [{
            id: 'L-1',
            tag: 'Load 1',
            loadClass: 'generic',
            status: 'warn',
            warnings: [{ code: 'missingLoadClass', message: 'Load 1 uses generic load class.' }],
          }],
          panelRows: [{
            panelId: 'P1',
            panelTag: 'P1',
            governedDemandKva: 75,
            governedCurrentA: 120,
            status: 'fail',
            phaseBalance: { status: 'fail', unbalancePct: 25 },
          }],
          warnings: [{ code: 'phaseImbalance', message: 'P1 phase unbalance is 25%.', severity: 'error' }],
        },
      },
    });
    assert(actions.some(action => action.source.type === 'loadDemandGovernance' && action.category === 'missingData'));
    assert(actions.some(action => action.source.type === 'loadDemandGovernance' && action.category === 'code'));
    assert(actions.some(action => action.pageHref === 'loadlist.html'));
    assert(actions.some(action => action.pageHref === 'panelschedule.html'));
  });

  it('turns transformer and feeder sizing gaps into autosize actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        transformerFeederSizing: {
          transformerRows: [{
            id: 'tf-1',
            caseName: 'Sizing Case',
            designKva: 120,
            selectedKva: 112.5,
            loadPct: 106.7,
            status: 'fail',
          }],
          feederRows: [{
            id: 'tf-1',
            caseName: 'Sizing Case',
            requiredAmpacityA: 260,
            conductorSize: '',
            installedAmpacityA: 0,
            status: 'missingData',
          }],
          alternativeRows: [],
          warningRows: [{ code: 'missingTransformerImpedance', message: 'Transformer impedance is missing.', severity: 'warning' }],
        },
      },
    });
    assert(actions.some(action => action.source.type === 'transformerFeederSizing' && action.category === 'code'));
    assert(actions.some(action => action.source.type === 'transformerFeederSizing' && action.category === 'missingData'));
    assert(actions.some(action => action.source.type === 'transformerFeederSizing' && action.source.key === 'missing-alternatives'));
    assert(actions.every(action => action.source.type !== 'transformerFeederSizing' || action.pageHref === 'autosize.html'));
  });

  it('turns advanced heat-trace controls and startup gaps into actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        heatTrace: {
          advancedPackage: {
            segmentRows: [{
              caseId: 'ht-1',
              id: 'seg-1',
              assetTag: 'TK-1',
              label: 'Tank shell',
              installedWatts: 500,
              requiredWatts: 700,
              status: 'fail',
            }],
            controlRows: [{
              caseId: 'ht-1',
              assetTag: 'TK-1',
              controllerTag: 'HTC-1',
              status: 'missingData',
              missingFields: ['sensorLocation'],
              warnings: ['Hazardous area record is missing T-rating target.'],
            }],
            startupProfileRows: [{
              caseId: 'ht-1',
              segmentId: 'seg-1',
              segmentLabel: 'Tank shell',
              assetTag: 'TK-1',
              startupAmps: 62,
              coldStartMultiplier: 3.7,
              status: 'warn',
            }],
            panelDiversityRows: [{
              sourcePanel: 'HTP-1',
              panelPhase: 'unassigned',
              diversityGroup: 'none',
              startupAmps: 62,
              status: 'missingData',
            }],
          },
        },
      },
    });
    assert(actions.some(action => action.source.type === 'heatTraceAdvanced' && action.category === 'constructability'));
    assert(actions.some(action => action.source.type === 'heatTraceAdvanced' && action.category === 'missingData'));
    assert(actions.some(action => action.source.type === 'heatTraceAdvanced' && action.severity === 'high'));
    assert(actions.every(action => action.source.type !== 'heatTraceAdvanced' || action.pageHref === 'heattracesizing.html'));
  });

  it('adds approval actions with only allowlisted pending-approval apply payloads', () => {
    const actions = buildDesignCoachActions({
      projectReport: { summary: {} },
      studies: { loadFlow: { summary: { pass: true } } },
      approvals: {},
    });
    const action = actions.find(row => row.source.type === 'studyApproval');
    assert(action);
    assert.deepEqual(action.apply, { kind: 'initializePendingApproval', studyKey: 'loadFlow' });
  });

  it('turns failed and incomplete equipment evaluations into safety and missing-data actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        equipmentEvaluation: {
          rows: [
            {
              equipmentTag: 'SWBD-1',
              category: 'Switchboard',
              ratingType: 'Interrupting Rating',
              requiredValue: 42,
              ratedValue: 35,
              margin: -7,
              status: 'fail',
              source: 'shortCircuit',
              recommendation: 'Replace equipment or reduce fault duty.',
            },
            {
              equipmentTag: 'MCC-1',
              category: 'MCC',
              ratingType: 'SCCR',
              requiredValue: null,
              ratedValue: null,
              margin: null,
              status: 'missingData',
              source: 'shortCircuit',
              missingFields: ['sccrKa'],
              recommendation: 'Add SCCR rating.',
            },
          ],
        },
      },
    });
    assert(actions.some(action => action.source.type === 'equipmentEvaluation' && action.category === 'safety'));
    assert(actions.some(action => action.source.type === 'equipmentEvaluation' && action.category === 'missingData'));
  });

  it('turns incomplete short-circuit study case assumptions into review actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: { summary: {}, shortCircuit: { results: { bus1: { threePhaseKA: 12 } } } },
      studies: { shortCircuit: { results: { bus1: { threePhaseKA: 12 } } } },
    });
    assert(actions.some(action => action.source.type === 'shortCircuit' && action.source.key === 'missing-study-case'));
    assert(actions.some(action => action.pageHref === 'shortCircuit.html'));
  });

  it('turns harmonic compliance failures, missing PCC data, and legacy results into actions', () => {
    const packagedActions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        harmonicStudy: {
          studyCase: { pccBus: 'PCC-1' },
          sourceRows: [{ id: 'vfd-1', tag: 'VFD-1', interharmonic: true }],
          complianceRows: [
            { sourceId: 'vfd-1', sourceTag: 'VFD-1', pccTag: 'PCC-1', checkType: 'TDD', actualValue: 18, limitValue: 12, status: 'fail' },
            { sourceId: 'vfd-1', sourceTag: 'VFD-1', pccTag: 'PCC-1', checkType: 'VTHD', status: 'missingData', missingFields: ['utilityScMva'] },
          ],
          filterAlternatives: [{ id: 'filter-1', name: 'Detuned filter', filterType: 'passiveDetuned', frequencyScanResonanceRisk: 'danger', status: 'recommended' }],
          warnings: [{ code: 'missingDemandCurrent', message: 'IEEE 519 demand-current basis is missing.' }],
          summary: { fail: 1, missingData: 1 },
        },
      },
    });
    assert(packagedActions.some(action => action.source.type === 'harmonicStudy' && action.category === 'code'));
    assert(packagedActions.some(action => action.source.type === 'harmonicStudy' && action.category === 'missingData'));
    assert(packagedActions.some(action => action.source.type === 'harmonicStudy' && action.pageHref === 'harmonics.html'));

    const legacyActions = buildDesignCoachActions({
      projectReport: { summary: {} },
      studies: { harmonics: { 'vfd-1': { ithd: 30, vthd: 6, warning: true } } },
    });
    assert(legacyActions.some(action => action.source.type === 'harmonicStudy' && action.source.key === 'legacy-without-study-case'));
  });

  it('turns capacitor bank resonance, duty, and protection gaps into actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        capacitorBankDuty: {
          dutyRows: [
            { id: 'bank-resonance', stageId: 'bank', stageLabel: 'Cap Bank', checkType: 'resonanceDetuning', status: 'fail', recommendation: 'Plain bank resonance danger.' },
            { id: 'stage-1-rms', stageId: 'stage-1', stageLabel: 'Stage 1', checkType: 'rmsCurrent', status: 'missingData', recommendation: 'Missing current rating.' },
          ],
          protectionRows: [{ id: 'bank-protection', status: 'missingData', recommendation: 'Record breaker/fuse basis.' }],
          switchingRows: [{ id: 'stage-1-switching', stageId: 'stage-1', status: 'warn', recommendation: 'Enter switching-device inrush limit.' }],
          frequencyScanLinks: [{ id: 'frequency-scan-1', source: 'frequencyScan', harmonicOrder: 5, risk: 'danger', message: 'Frequency scan resonance danger.', status: 'fail' }],
          warningRows: [{ severity: 'error', code: 'resonanceDetuning', message: 'Plain bank resonance danger.' }],
          summary: { fail: 1, warn: 1, missingData: 2 },
        },
      },
    });
    assert(actions.some(action => action.source.type === 'capacitorBankDuty' && action.category === 'code'));
    assert(actions.some(action => action.source.type === 'capacitorBankDuty' && action.category === 'missingData'));
    assert(actions.every(action => action.source.type !== 'capacitorBankDuty' || action.pageHref === 'capacitorbank.html'));
  });

  it('turns reliability customer-index and restoration gaps into actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        reliabilityNetwork: {
          indexRows: [
            { id: 'SAIDI', label: 'SAIDI', value: 6, unit: 'hours/customer-year', status: 'warn' },
            { id: 'EENS', label: 'EENS', value: null, unit: 'kWh/year', status: 'missingData' },
          ],
          scenarioRows: [
            { id: 'n1-brk-1', scenarioType: 'N-1', componentTag: 'Breaker <A>', status: 'missingData', recommendation: 'Assign customer impact rows.' },
            { id: 'n1-xfmr-1', scenarioType: 'N-1', componentTag: 'Transformer B', status: 'warn', recommendation: 'Review tie-source pickup capacity.' },
          ],
          warningRows: [{ severity: 'warning', code: 'missingCustomerCount', message: 'Total customer count is zero or missing.' }],
          summary: { status: 'review' },
        },
      },
    });
    assert(actions.some(action => action.source.type === 'reliabilityNetwork' && action.category === 'review'));
    assert(actions.some(action => action.source.type === 'reliabilityNetwork' && action.category === 'missingData'));
    assert(actions.every(action => action.source.type !== 'reliabilityNetwork' || action.pageHref === 'reliability.html'));

    const legacyActions = buildDesignCoachActions({
      projectReport: { summary: {} },
      studies: { reliability: { componentStats: { 'brk-1': { downtime: 4 } } } },
    });
    assert(legacyActions.some(action => action.source.type === 'reliabilityNetwork' && action.source.key === 'legacy-without-network-model'));
  });

  it('turns transient stability failures, CCT margin, and dynamic model gaps into actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        transientStability: {
          scenarioRows: [
            { id: 'scenario-gen-1', modelId: 'gen-1', modelTag: 'Gen <A>', stable: false, status: 'fail', clearingTimeSec: 0.2, cctSec: 0.12, cctMarginSec: -0.08, recommendation: 'Reduce clearing time.' },
          ],
          cctSweepRows: [
            { id: 'cct-gen-2', modelId: 'gen-2', modelTag: 'Gen B', status: 'warn', clearingTimeSec: 0.1, cctSec: 0.12, marginSec: 0.02, recommendation: 'Verify relay timing.' },
          ],
          dynamicModelRows: [
            { id: 'ibr-1', tag: 'IBR <A>', modelType: 'ibr', missingFields: ['H'], defaultedFields: [] },
          ],
          warningRows: [
            { severity: 'warning', code: 'missingDisturbanceEvents', message: 'No disturbance event sequence is defined.' },
          ],
          summary: { fail: 1, warn: 1, missingData: 1 },
        },
      },
    });
    assert(actions.some(action => action.source.type === 'transientStability' && action.category === 'safety'));
    assert(actions.some(action => action.source.type === 'transientStability' && action.category === 'missingData'));
    assert(actions.some(action => action.source.type === 'transientStability' && action.source.key.startsWith('cct:')));
    assert(actions.every(action => action.source.type !== 'transientStability' || action.pageHref === 'transientstability.html'));

    const legacyActions = buildDesignCoachActions({
      projectReport: { summary: {} },
      studies: { transientStability: { stable: false, deltaMax_deg: 190 } },
    });
    assert(legacyActions.some(action => action.source.type === 'transientStability' && action.source.key === 'legacy-without-study-case'));
  });

  it('turns arc-flash high-energy and defaulted-input rows into safety and review actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        arcFlash: {
          studyCase: { reportPreset: 'mitigation' },
          summary: { highEnergyCount: 1, dangerCount: 1, defaultedInputCount: 3, missingInputCount: 0, scenarioCount: 1 },
          scenarioComparison: [
            {
              scenarioId: 'baseline',
              equipmentId: 'SWBD-1',
              equipmentTag: 'SWBD-1',
              incidentEnergy: 45,
              ppeCategory: 5,
              labelReady: false,
              status: 'danger',
              recommendation: 'Evaluate mitigation.',
            },
          ],
        },
      },
    });
    assert(actions.some(action => action.source.type === 'arcFlash' && action.category === 'safety'));
    assert(actions.some(action => action.source.type === 'arcFlash' && action.source.key === 'defaulted-inputs'));
    assert(actions.some(action => action.source.type === 'arcFlash' && action.source.key === 'missing-mitigation'));
    assert(actions.every(action => action.source.type !== 'arcFlash' || action.pageHref === 'arcFlash.html'));
  });

  it('turns advanced grounding failures and soil-fit warnings into safety and review actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        advancedGrounding: {
          summary: { soilFitStatus: 'poorFit', soilFitErrorPct: 31 },
          warnings: ['Remote electrodes and transferred voltage require project-specific engineering review.'],
          fieldFidelity: {
            measurementCoverage: {
              status: 'warn',
              spacingCoveragePct: 45,
              measurementCount: 2,
              warnings: ['Maximum soil measurement spacing does not reach half of the grounding footprint extent.'],
              recommendation: 'Collect additional soil measurements.',
            },
            fallOfPotentialRows: [{
              testId: 'FOP-1',
              status: 'fail',
              curveDeviationPct: 14,
              measuredResistanceOhm: 0.42,
              warnings: ['Fall-of-potential curve deviation 14% exceeds 10%.'],
              recommendation: 'Repeat the field test.',
            }],
            seasonalScenarios: [{
              id: 'dry',
              label: 'Dry season',
              status: 'fail',
              failCount: 1,
              warnCount: 0,
              rhoOhmM: 180,
              multiplier: 1.5,
              recommendation: 'Add grounding design margin.',
            }],
            warningRows: [{
              id: 'fidelity-1',
              category: 'modelFidelity',
              severity: 'review',
              message: 'Finite-element grounding simulation is not modeled in v1.',
              recommendation: 'Document screening limits.',
            }],
          },
          riskPoints: [
            {
              label: 'Fence Gate',
              check: 'gpr',
              actualV: 2100,
              limitV: 800,
              marginPct: -162.5,
              status: 'fail',
              source: 'user',
              recommendation: 'Perform transferred-voltage review.',
            },
          ],
        },
      },
    });
    assert(actions.some(action => action.source.type === 'advancedGrounding' && action.pageHref === 'groundgrid.html'));
    assert(actions.some(action => action.source.key === 'soil-fit:poorFit' && action.category === 'missingData'));
    assert(actions.some(action => action.title.includes('transferred-voltage')));
    assert(actions.some(action => action.source.type === 'groundingFieldFidelity' && action.source.key.startsWith('soil-coverage')));
    assert(actions.some(action => action.source.type === 'groundingFieldFidelity' && action.source.key.startsWith('fall-of-potential')));
    assert(actions.some(action => action.source.type === 'groundingFieldFidelity' && action.source.key.startsWith('seasonal')));
  });

  it('turns cable thermal overload and missing inputs into safety and missing-data actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        cableThermalEnvironment: {
          advancedWarnings: ['Soil dry-out risk: dry/moist resistivity ratio 2.4 applied.'],
          evaluations: [
            {
              cableTag: 'C-101',
              installationMethod: 'ductbank',
              loadPct: 118,
              estimatedConductorTempC: 96,
              status: 'fail',
              limitingFactor: 'load current',
              recommendation: 'Upsize cable or reduce grouping.',
            },
            {
              cableTag: 'C-102',
              installationMethod: 'tray',
              status: 'missingData',
              limitingFactor: 'missing data',
              recommendation: 'Add cable size and design current.',
            },
          ],
          cyclicRatingRows: [{
            cableTag: 'C-103',
            installationMethod: 'direct-burial',
            cyclicRatingMode: 'emergencyProfile',
            maxEmergencyTempC: 94,
            status: 'fail',
            recommendation: 'Reduce emergency overload duration.',
          }],
        },
      },
    });
    assert(actions.some(action => action.source.type === 'cableThermalEnvironment' && action.category === 'safety'));
    assert(actions.some(action => action.source.type === 'cableThermalEnvironment' && action.category === 'missingData'));
    assert(actions.some(action => action.source.key === 'advanced-warning:0'));
    assert(actions.some(action => action.source.key === 'C-103:direct-burial:emergency:fail'));
    assert(actions.every(action => action.source.type !== 'cableThermalEnvironment' || action.pageHref === 'cablethermal.html'));
  });

  it('turns load-flow voltage, unbalance, and defaulted assumptions into actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        loadFlow: {
          studyCase: { mode: 'perPhase', openPhase: { enabled: true, phases: ['B'] } },
          summary: {
            converged: false,
            voltageViolationCount: 1,
            voltageWarningCount: 0,
            unbalanceFailCount: 1,
            unbalanceWarnCount: 0,
            defaultedInputCount: 2,
            missingInputCount: 0,
          },
          results: { converged: false, maxMismatchKW: 12 },
          voltageViolationRows: [{
            busId: 'BUS-1',
            busTag: 'BUS-1',
            phase: 'A',
            Vm: 0.9,
            minPu: 0.95,
            maxPu: 1.05,
            status: 'fail',
            recommendation: 'Review tap settings.',
          }],
          unbalanceRows: [{
            busId: 'BUS-1',
            busTag: 'BUS-1',
            voltageUnbalancePct: 4.1,
            status: 'fail',
          }],
          warnings: [{ code: 'load-model-screening', message: 'mixedZIP is recorded as study basis.' }],
        },
      },
    });
    assert(actions.some(action => action.source.type === 'loadFlow' && action.source.key === 'not-converged'));
    assert(actions.some(action => action.source.type === 'loadFlow' && action.category === 'code'));
    assert(actions.some(action => action.source.type === 'loadFlow' && action.category === 'safety'));
    assert(actions.some(action => action.source.type === 'loadFlow' && action.source.key === 'defaulted-inputs'));
    assert(actions.every(action => action.source.type !== 'loadFlow' || action.pageHref === 'loadFlow.html'));
  });

  it('turns motor-start voltage dip, stalled starts, and missing assumptions into actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        motorStart: {
          studyCase: { sourceBasis: 'manual', sourceCondition: 'generator' },
          summary: { failCount: 1, warnCount: 1, missingInputCount: 2, defaultedInputCount: 1 },
          worstCaseRows: [
            {
              motorId: 'MTR-1',
              motorTag: 'Pump A',
              minVoltagePu: 0.76,
              voltageSagPct: 24,
              accelTimeSec: 9,
              status: 'fail',
              recommendation: 'Stagger start sequence.',
            },
            {
              motorId: 'MTR-2',
              motorTag: 'Fan B',
              minVoltagePu: 0.81,
              voltageSagPct: 19,
              accelTimeSec: 12,
              status: 'warn',
            },
          ],
          warnings: [{ code: 'unsupported-controls', message: 'Regulator behavior is screening-only.' }],
        },
      },
    });
    assert(actions.some(action => action.source.type === 'motorStart' && action.category === 'safety'));
    assert(actions.some(action => action.source.type === 'motorStart' && action.category === 'missingData'));
    assert(actions.some(action => action.source.type === 'motorStart' && action.source.key === 'defaulted-inputs'));
    assert(actions.every(action => action.source.type !== 'motorStart' || action.pageHref === 'motorStart.html'));
  });

  it('turns protection setting-sheet gaps into review and missing-data actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        protectionSettingSheets: {
          summary: { deviceCount: 1, functionCount: 2, testCount: 2, missingData: 2, disabledFunctions: 1 },
          deviceRows: [{
            componentId: 'relay-1',
            deviceTag: 'Main Relay',
            status: 'missingData',
            missingFields: ['ctRatio'],
          }],
          functionRows: [{
            componentId: 'relay-1',
            deviceTag: 'Main Relay',
            functionCode: '51',
            enabled: false,
            status: 'missingData',
            missingFields: ['pickupA'],
          }],
          testRows: [{
            componentId: 'relay-1',
            deviceTag: 'Main Relay',
            functionCode: '51',
            status: 'missingData',
          }],
          warnings: ['Setting revision requires reviewer.'],
        },
      },
    });
    assert(actions.some(action => action.source.type === 'protectionSettingSheets' && action.category === 'missingData'));
    assert(actions.some(action => action.source.type === 'protectionSettingSheets' && action.category === 'review'));
    assert(actions.every(action => action.source.type !== 'protectionSettingSheets' || action.pageHref === 'tcc.html'));
  });

  it('warns when TCC settings exist without a saved protection setting sheet', () => {
    const actions = buildDesignCoachActions({
      projectReport: { summary: {} },
      studies: { tccSettings: { br1: { pickupA: 500 } } },
    });
    assert(actions.some(action => action.source.type === 'protectionSettingSheets' && action.source.key === 'missing-package'));
  });

  it('turns pull constructability failures and missing pull data into actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        pullConstructability: {
          summary: { pullCount: 2, fail: 1, warn: 0, missingData: 1 },
          pullRows: [
            {
              pullNumber: 1,
              cableTags: 'C-101',
              recommendedDirection: 'reverse',
              status: 'fail',
              maxTensionLbs: 1200,
              maxSidewallPressureLbsPerFt: 650,
            },
            {
              pullNumber: 2,
              cableTags: 'C-102',
              recommendedDirection: 'forward',
              status: 'missingData',
            },
          ],
          warningRows: [
            { id: 'w1', pullNumber: 1, message: 'Sidewall pressure exceeds allowable limit.' },
            { id: 'w2', pullNumber: 2, message: 'No bend radius supplied.' },
          ],
        },
      },
    });
    assert(actions.some(action => action.source.type === 'pullConstructability' && action.category === 'constructability'));
    assert(actions.some(action => action.source.type === 'pullConstructability' && action.category === 'missingData'));
    assert(actions.every(action => action.source.type !== 'pullConstructability' || action.pageHref === 'pullcards.html'));
  });

  it('turns OPF infeasibility, violations, and missing data into ranked actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        optimalPowerFlow: {
          summary: {
            feasible: false,
            insufficientCapacity: 1,
            totalDispatchedKw: 100,
            fail: 1,
            warn: 0,
            missingData: 1,
          },
          violations: [
            {
              targetType: 'bus',
              targetId: 'BUS-1',
              metric: 'voltagePu',
              limit: '0.95-1.05 pu',
              actualValue: 0.91,
              margin: -0.04,
              status: 'fail',
              recommendation: 'Review voltage support.',
            },
            {
              targetType: 'branch',
              targetId: 'FDR-1',
              metric: 'branchLoadingPct',
              limit: '100%',
              actualValue: null,
              margin: null,
              status: 'missingData',
              recommendation: 'Add branch rating.',
            },
          ],
          warnings: [
            { code: 'missing-generator-cost', message: 'Generator GEN-1 is missing cost data.', generatorId: 'GEN-1' },
          ],
        },
      },
    });
    assert(actions.some(action => action.source.type === 'optimalPowerFlow' && action.category === 'missingData'));
    assert(actions.some(action => action.source.type === 'optimalPowerFlow' && action.category === 'code'));
    assert(actions.every(action => action.source.type !== 'optimalPowerFlow' || action.pageHref === 'optimalpowerflow.html'));
  });

  it('turns product catalog governance warnings into review and missing-data actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        productCatalog: {
          unapprovedUsage: [
            {
              label: 'TR-1',
              status: 'generic',
              category: 'tray',
              message: 'TR-1 uses generic product data without manufacturer/catalog number.',
            },
            {
              label: 'SWBD-1',
              status: 'unapproved',
              manufacturer: 'Acme',
              catalogNumber: 'SWBD-65',
              category: 'protectiveDevice',
              message: 'SWBD-1 uses Acme SWBD-65, which is not approved in the local catalog.',
            },
          ],
          duplicates: [
            {
              key: 'acme|swbd-65|protectivedevice',
              manufacturer: 'Acme',
              catalogNumber: 'SWBD-65',
              category: 'protectiveDevice',
            },
          ],
        },
      },
    });
    assert(actions.some(action => action.source.type === 'productCatalog' && action.category === 'missingData'));
    assert(actions.some(action => action.source.type === 'productCatalog' && action.category === 'review'));
    assert(actions.every(action => action.source.type !== 'productCatalog' || action.pageHref === 'productcatalog.html'));
  });

  it('turns unresolved field commissioning items into ranked actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        fieldCommissioning: {
          openItems: [
            {
              id: 'field-1',
              elementType: 'cable',
              elementId: 'C-101',
              elementTag: 'C-101',
              observationType: 'punch',
              status: 'open',
              priority: 'high',
              comments: 'Cable tag missing in field.',
            },
            {
              id: 'field-2',
              elementType: 'tray',
              elementId: 'TR-1',
              elementTag: 'TR-1',
              observationType: 'asBuilt',
              status: 'pendingReview',
              priority: 'medium',
              comments: 'Installed tray route differs from model.',
            },
          ],
        },
      },
    });
    assert(actions.some(action => action.source.type === 'fieldCommissioning' && action.severity === 'high'));
    assert(actions.some(action => action.source.type === 'fieldCommissioning' && action.category === 'constructability'));
    assert(actions.every(action => action.source.type !== 'fieldCommissioning' || action.pageHref.includes('fieldview.html')));
  });

  it('turns BIM quantity deltas and open issues into coordination actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        bimRoundTrip: {
          summary: { unmappedCount: 2, changedGroups: 1, openIssues: 1 },
          quantityReconciliation: {
            rows: [
              {
                elementType: 'cableTray',
                system: 'Power',
                voltageClass: '600 V',
                level: 'L1',
                area: 'A',
                projectQuantity: 100,
                bimQuantity: 140,
                delta: -40,
                deltaPct: -28.57,
                status: 'changed',
              },
            ],
          },
          issues: [
            {
              id: 'bim-issue-1',
              title: 'Resolve BIM tray offset',
              description: 'Tray model and route do not align.',
              status: 'open',
              priority: 'high',
              elementIds: ['bim-tr-1'],
            },
          ],
        },
      },
    });
    assert(actions.some(action => action.source.type === 'bimRoundTrip' && action.category === 'constructability'));
    assert(actions.some(action => action.source.type === 'bimRoundTrip' && action.category === 'missingData'));
    assert(actions.every(action => action.source.type !== 'bimRoundTrip' || action.pageHref === 'bimcoordination.html'));
  });

  it('turns connector readiness validation and quantity deltas into coordination actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        bimConnectorReadiness: {
          summary: {
            activePackageId: 'connector-r1',
            invalidCount: 1,
            staleCount: 1,
            quantityDeltas: 1,
            mappingDeltas: 2,
          },
          validation: { valid: false, errors: ['Connector import package is missing version.'] },
          roundTripDiff: {
            quantityDeltas: [{
              elementType: 'cableTray',
              system: 'Power',
              level: 'L1',
              area: 'Unit A',
              projectQuantity: 100,
              bimQuantity: 135,
              delta: -35,
              deltaPct: -25.93,
            }],
          },
          activePackage: {
            issues: [{ id: 'connector-issue-1', title: 'Resolve connector issue', status: 'open', priority: 'high' }],
          },
        },
      },
    });
    assert(actions.some(action => action.source.type === 'bimConnectorReadiness' && action.category === 'constructability'));
    assert(actions.some(action => action.source.type === 'bimConnectorReadiness' && action.category === 'missingData'));
    assert(actions.every(action => action.source.type !== 'bimConnectorReadiness' || action.pageHref === 'bimcoordination.html'));
  });

  it('turns voltage-drop criteria failures and missing inputs into study actions', () => {
    const actions = buildDesignCoachActions({
      projectReport: {
        summary: {},
        voltageDropStudy: {
          criteria: { feederLimitPct: 3, branchLimitPct: 3, totalLimitPct: 5, startingLimitPct: 10 },
          operatingCase: { caseType: 'start', motorMinimumStartingVoltagePu: 0.8 },
          rows: [
            {
              id: 'C-VD-1',
              tag: 'C-VD-1',
              caseType: 'start',
              circuitType: 'branch',
              dropPct: 11.2,
              applicableLimitPct: 10,
              startVoltagePu: 0.76,
              status: 'fail',
              reason: 'Starting voltage is below the configured motor minimum.',
            },
            {
              id: 'C-VD-2',
              tag: 'C-VD-2',
              caseType: 'normal',
              circuitType: 'feeder',
              status: 'missingData',
              reason: 'Missing voltage-drop input data: lengthFt.',
            },
          ],
          warningRows: [{ severity: 'warning', code: 'voltageDropReview', message: 'Review total-chain basis.' }],
          summary: { fail: 1, warn: 0, missingData: 1, warningCount: 1 },
        },
      },
    });
    assert(actions.some(action => action.source.type === 'voltageDropStudy' && action.category === 'code'));
    assert(actions.some(action => action.source.type === 'voltageDropStudy' && action.category === 'missingData'));
    assert(actions.every(action => action.source.type !== 'voltageDropStudy' || action.pageHref === 'voltagedropstudy.html'));
  });

  it('adds lifecycle report-lineage apply action when a released package is inactive', () => {
    const actions = buildDesignCoachActions({
      projectReport: { summary: { projectName: 'North Unit' }, validation: { pass: true } },
      lifecycle: {
        activePackage: null,
        latestReleased: { id: 'pkg-r1', revision: 'R1', status: 'released' },
      },
    });
    const action = actions.find(row => row.source.type === 'lifecycle');
    assert(action);
    assert.deepEqual(action.apply, { kind: 'setActiveStudyPackage', packageId: 'pkg-r1' });
  });

  it('ranks and deduplicates deterministically', () => {
    const actions = [
      { ...buildDesignCoachActions({ projectReport: baseReport })[0], fingerprint: 'same', severity: 'medium', category: 'review', confidence: 0.5 },
      { ...buildDesignCoachActions({ drcFindings: [drcFinding], projectReport: { summary: {} } })[0], fingerprint: 'same', severity: 'high', category: 'code', confidence: 0.9 },
    ];
    const deduped = dedupeDesignCoachActions(actions);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].category, 'code');
    const ranked = rankDesignCoachActions(buildDesignCoachActions({ projectReport: baseReport, drcFindings: [drcFinding] }));
    assert(['code', 'safety'].includes(ranked[0].category));
  });

  it('filters accepted, rejected, and dismissed decisions by fingerprint', () => {
    const actions = buildDesignCoachActions({ drcFindings: [drcFinding], projectReport: { summary: {} } });
    const filtered = filterDesignCoachActions(actions, [{
      actionId: actions[0].id,
      fingerprint: actions[0].fingerprint,
      decision: 'dismissed',
    }]);
    assert.equal(filtered.length, actions.length - 1);
  });

  it('builds package summary and keeps apply actions allowlisted', () => {
    const pkg = buildDesignCoachPackage({
      context: {
        projectReport: baseReport,
        studies: { loadFlow: { warnings: ['Voltage drop near limit.'] } },
        approvals: {},
        drcFindings: [drcFinding],
      },
      decisions: [],
    });
    assert.equal(pkg.version, 'design-coach-v1');
    assert(pkg.summary.total > 0);
    assert.equal(summarizeDesignCoachActions(pkg.actions).total, pkg.summary.total);
    assert(pkg.actions.filter(action => action.apply).every(action => (
      action.apply.kind === 'initializePendingApproval' || action.apply.kind === 'setActiveStudyPackage'
    )));
  });
});
