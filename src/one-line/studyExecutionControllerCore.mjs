import {
  applyLoadFlowResultsToDiagram,
  applyShortCircuitResultsToDiagram,
} from './studyResultProjection.mjs';

export function createStudyExecutionController({
  buttons, getOneLine, setOneLine, getStudies, setStudies, captureStudyRunContext,
  saveStudyResult, getStudyAssessment, getStudySourceSnapshot, fingerprintStudyValue,
  normalizeStudySourceSnapshot, getStudyProjectIdentity, getCurrentScenario, buildStudyProvenance,
  getStudySettings, getActiveSheet, getProtectiveDeviceCatalog, loadReferencedProtectiveDevices,
  runLoadFlow, runShortCircuitOffMain, runShortCircuit, runArcFlash, runHarmonics,
  runNetworkHarmonics, runMotorStart, runReliability, assertSheetsUnchanged,
  getSheetsRevision, recordProvenance, updateCableOperatingVoltages,
  markScheduleReconcilePending, renderStudyResults, renderLoadFlowResults, render,
  generateArcFlashReport, openLabelPrintWindow, highlightSPF, showAlertModal, windowRef
}) {
  const cloneSolverInput = value => {
    try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
  };
  const beginStudy = (studyKey, inputs, options, overrides = {}) => captureStudyRunContext?.(studyKey, { inputs, options, ...overrides });
  const commitStudy = (studyKey, result, context, studies = getStudies()) => {
    if (saveStudyResult && context) return saveStudyResult(studyKey, result, context);
    studies[studyKey] = result;
    recordProvenance?.(studies, studyKey);
    setStudies(studies);
    return null;
  };
  const assertRunContextUnchanged = (studyKey, context) => {
    if (!context || !getStudySourceSnapshot || !fingerprintStudyValue) return;
    const currentIdentity = getStudyProjectIdentity?.();
    if (context.projectIdentity && currentIdentity
        && ((context.projectIdentity.projectId && context.projectIdentity.projectId !== currentIdentity.projectId)
          || (!context.projectIdentity.projectId && context.projectIdentity.projectName !== currentIdentity.projectName))) {
      throw new Error(`${studyKey} completed for a different project.`);
    }
    if (context.scenario && getCurrentScenario && context.scenario !== getCurrentScenario()) {
      throw new Error(`${studyKey} scenario changed while the study was running.`);
    }
    const source = getStudySourceSnapshot(studyKey);
    const normalizedSource = normalizeStudySourceSnapshot ? normalizeStudySourceSnapshot(source) : source;
    if (context.projectSnapshotHash !== fingerprintStudyValue(normalizedSource)) {
      throw new Error(`${studyKey} inputs changed while the study was running.`);
    }
  };
  const contextAfterOverlay = (studyKey, context) => context && getStudySourceSnapshot && fingerprintStudyValue
    ? { ...context, projectSnapshotHash: fingerprintStudyValue(normalizeStudySourceSnapshot ? normalizeStudySourceSnapshot(getStudySourceSnapshot(studyKey)) : getStudySourceSnapshot(studyKey)) } : context;

  const runLoadFlowStudy = async () => {
    const oneLine = getOneLine();
    const solverInput = cloneSolverInput(oneLine);
    const revision = getSheetsRevision(oneLine);
    const settings = getStudySettings();
    const runContext = beginStudy('loadFlow', { oneLine: solverInput, settings: settings.loadFlow }, settings.loadFlow);
    const result = await runLoadFlow(solverInput, {
      baseMVA: settings.loadFlow.baseMVA, balanced: settings.loadFlow.balanced,
      maxIterations: settings.loadFlow.maxIterations
    });
    const current = assertSheetsUnchanged(revision, 'Load flow');
    assertRunContextUnchanged('loadFlow', runContext);
    const applied = applyLoadFlowResultsToDiagram(oneLine, result);
    updateCableOperatingVoltages(applied.diagram);
    setOneLine({ activeSheet: current.activeSheet, sheets: applied.sheets });
    commitStudy('loadFlow', result, contextAfterOverlay('loadFlow', runContext));
    markScheduleReconcilePending();
    renderStudyResults(); renderLoadFlowResults(result); render();
    return result;
  };

  const runShortCircuitStudy = async () => {
    const oneLine = getOneLine();
    const solverInput = cloneSolverInput(oneLine);
    const revision = getSheetsRevision(oneLine);
    const settings = getStudySettings();
    const runContext = beginStudy('shortCircuit', { oneLine: solverInput, settings: settings.shortCircuit }, settings.shortCircuit);
    const deviceCatalog = await loadReferencedProtectiveDevices(solverInput, { catalog: getProtectiveDeviceCatalog() });
    const result = await runShortCircuitOffMain(solverInput, { method: settings.shortCircuit.method, deviceCatalog });
    const current = assertSheetsUnchanged(revision, 'Short circuit');
    assertRunContextUnchanged('shortCircuit', runContext);
    const applied = applyShortCircuitResultsToDiagram(oneLine, result);
    setOneLine({ activeSheet: current.activeSheet, sheets: applied.sheets });
    commitStudy('shortCircuit', result, contextAfterOverlay('shortCircuit', runContext));
    renderStudyResults(); render();
    return result;
  };

  const runReliabilityStudy = async () => {
    const oneLine = getOneLine();
    const solverInput = cloneSolverInput(oneLine);
    const revision = getSheetsRevision(oneLine);
    const diagram = solverInput.sheets.flatMap(sheet => sheet.components);
    const runContext = beginStudy('reliability', { oneLine: solverInput, diagram }, getStudySettings().reliability);
    const result = await runReliability(diagram);
    assertSheetsUnchanged(revision, 'Reliability');
    assertRunContextUnchanged('reliability', runContext);
    commitStudy('reliability', result, runContext);
    highlightSPF(result.n1Failures); renderStudyResults();
    return result;
  };

  const bind = () => {
    buttons.loadFlow?.addEventListener('click', () => runLoadFlowStudy().catch(error => {
      console.error('[oneline] load flow failed', error); showAlertModal('Load Flow Error', error?.message || String(error));
    }));
    buttons.shortCircuit?.addEventListener('click', () => runShortCircuitStudy().catch(error => {
      console.error('[oneline] short circuit failed', error); showAlertModal('Short Circuit Error', error?.message || String(error));
    }));
    buttons.arcFlash?.addEventListener('click', async () => {
      const oneLine = getOneLine();
      const solverInput = cloneSolverInput(oneLine);
      const revision = getSheetsRevision(oneLine);
      const settings = getStudySettings();
      const shortCircuitContext = beginStudy('shortCircuit', { oneLine: solverInput, settings: settings.shortCircuit }, settings.shortCircuit);
      const deviceCatalog = await loadReferencedProtectiveDevices(solverInput, { catalog: getProtectiveDeviceCatalog() });
      const options = { method: settings.shortCircuit.method, deviceCatalog };
      const shortCircuit = runShortCircuit(options);
      const shortCircuitContextForSave = contextAfterOverlay('shortCircuit', shortCircuitContext);
      const shortCircuitProvenance = buildStudyProvenance?.('shortCircuit', shortCircuit, shortCircuitContextForSave);
      const arcFlashContext = beginStudy('arcFlash', { oneLine: solverInput, settings: settings.shortCircuit }, options, {
        dependencies: shortCircuitProvenance ? {
          shortCircuit: {
            resultHash: fingerprintStudyValue(shortCircuit),
            provenanceHash: fingerprintStudyValue(shortCircuitProvenance),
          }
        } : undefined
      });
      const arcFlash = await runArcFlash({ shortCircuit: { ...options }, deviceCatalog });
      const current = assertSheetsUnchanged(revision, 'Arc flash');
      assertRunContextUnchanged('shortCircuit', shortCircuitContext);
      assertRunContextUnchanged('arcFlash', arcFlashContext);
      applyShortCircuitResultsToDiagram(current, shortCircuit);
      current.sheets.flatMap(sheet => sheet.components).forEach(component => { component.arcFlash = arcFlash[component.id]; });
      setOneLine({ activeSheet: getActiveSheet(), sheets: current.sheets });
      // The synchronous short-circuit projection is part of this run's saved
      // source. Recompute its provenance after projection, then bind Arc
      // Flash to that actual same-run dependency rather than the pre-overlay
      // prediction. Async edit/project guards above still reject intervening
      // changes before this controlled commit.
      const shortCircuitSaveContext = contextAfterOverlay('shortCircuit', shortCircuitContext);
      const actualShortCircuitProvenance = buildStudyProvenance?.(
        'shortCircuit', shortCircuit, shortCircuitSaveContext,
      );
      const arcFlashDependencies = actualShortCircuitProvenance ? [{
        studyKey: 'shortCircuit',
        resultHash: fingerprintStudyValue(shortCircuit),
        provenanceHash: fingerprintStudyValue(actualShortCircuitProvenance),
        status: null,
      }] : arcFlashContext.dependencies;
      const arcFlashSaveContext = {
        ...contextAfterOverlay('arcFlash', arcFlashContext),
        dependencies: arcFlashDependencies,
        dependencyFingerprint: fingerprintStudyValue(arcFlashDependencies),
      };
      commitStudy('shortCircuit', shortCircuit, shortCircuitSaveContext);
      commitStudy('arcFlash', arcFlash, arcFlashSaveContext);
      generateArcFlashReport(arcFlash, { assessment: getStudyAssessment?.('arcFlash') });
      if (buttons.printArcFlashLabels) buttons.printArcFlashLabels.disabled = Boolean(getStudyAssessment && !getStudyAssessment('arcFlash').eligible);
      renderStudyResults(); render();
    });
    buttons.printArcFlashLabels?.addEventListener('click', () => {
      if (getStudyAssessment && !getStudyAssessment('arcFlash').eligible) return;
      openLabelPrintWindow(getStudies()?.arcFlash || {});
    });
    buttons.harmonics?.addEventListener('click', () => {
      const oneLine = getOneLine();
      const settings = getStudySettings().harmonics;
      const harmonicsContext = beginStudy('harmonics', { oneLine }, settings);
      const harmonics = runHarmonics();
      const networkContext = beginStudy('harmonicNetwork', { oneLine }, settings);
      const harmonicNetwork = runNetworkHarmonics();
      commitStudy('harmonics', harmonics, harmonicsContext);
      commitStudy('harmonicNetwork', harmonicNetwork, networkContext);
      renderStudyResults(); windowRef.open('harmonics.html', '_blank');
    });
    buttons.motorStart?.addEventListener('click', () => {
      const context = beginStudy('motorStart', { oneLine: getOneLine() }, getStudySettings().motorStart);
      commitStudy('motorStart', runMotorStart(), context);
      renderStudyResults(); windowRef.open('motorStart.html', '_blank');
    });
    buttons.reliability?.addEventListener('click', () => runReliabilityStudy().catch(error => {
      console.error('[oneline] reliability failed', error); showAlertModal('Reliability Error', error?.message || String(error));
    }));
  };

  return { bind, runLoadFlowStudy, runReliabilityStudy, runShortCircuitStudy };
}
