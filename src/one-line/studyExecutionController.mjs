export function applyLoadFlowResultsToDiagram(oneLineData, result) {
  const sheets = oneLineData.sheets;
  const diagram = sheets.flatMap(sheet => sheet.components);
  diagram.forEach(component => {
    (component.connections || []).forEach(connection => {
      delete connection.loading_kW;
      delete connection.loading_amps;
      delete connection.voltage_drop_pct;
      delete connection.voltage_from_kv;
      delete connection.voltage_to_kv;
      delete connection.voltage_from_v;
      delete connection.voltage_to_v;
    });
  });
  const buses = Array.isArray(result?.buses) ? result.buses : Array.isArray(result) ? result : [];
  buses.forEach(bus => {
    const component = diagram.find(candidate => candidate.id === bus.id);
    if (!component || !Number.isFinite(bus.Vm)) return;
    const kv = Number.isFinite(bus.voltageKV) ? bus.voltageKV : Number.isFinite(bus.baseKV) ? bus.baseKV * bus.Vm : null;
    if (bus.phase) {
      if (typeof component.voltage_mag !== 'object') component.voltage_mag = {};
      if (typeof component.voltage_angle !== 'object') component.voltage_angle = {};
      component.voltage_mag[bus.phase] = Number(bus.Vm.toFixed(4));
      component.voltage_angle[bus.phase] = Number(bus.Va.toFixed(4));
    } else {
      component.voltage_mag = Number(bus.Vm.toFixed(4));
      component.voltage_angle = Number(bus.Va.toFixed(4));
    }
    if (Number.isFinite(kv)) {
      component.voltage_kv = Number(kv.toFixed(4));
      component.voltage_v = Number((kv * 1000).toFixed(1));
    }
  });
  (result.lines || []).forEach(line => {
    const source = diagram.find(component => component.id === line.from);
    const connection = source?.connections?.find(candidate => candidate.target === line.to);
    if (!connection) return;
    const amps = typeof line.amps === 'number' ? line.amps : typeof line.currentKA === 'number' ? line.currentKA * 1000 : null;
    if (line.phase) {
      if (typeof connection.loading_kW !== 'object') connection.loading_kW = {};
      connection.loading_kW[line.phase] = Number(line.P.toFixed(2));
      if (amps !== null) {
        if (typeof connection.loading_amps !== 'object') connection.loading_amps = {};
        connection.loading_amps[line.phase] = Number(amps.toFixed(1));
      }
      if (typeof line.dropPct === 'number') {
        if (typeof connection.voltage_drop_pct !== 'object') connection.voltage_drop_pct = {};
        connection.voltage_drop_pct[line.phase] = Number(line.dropPct.toFixed(2));
      }
    } else {
      connection.loading_kW = Number(line.P.toFixed(2));
      if (amps !== null) connection.loading_amps = Number(amps.toFixed(1));
      if (typeof line.dropPct === 'number') connection.voltage_drop_pct = Number(line.dropPct.toFixed(2));
    }
    if (typeof line.fromKV === 'number') {
      connection.voltage_from_kv = Number(line.fromKV.toFixed(3));
      connection.voltage_from_v = Number((line.fromKV * 1000).toFixed(1));
    }
    if (typeof line.toKV === 'number') {
      connection.voltage_to_kv = Number(line.toKV.toFixed(3));
      connection.voltage_to_v = Number((line.toKV * 1000).toFixed(1));
    }
  });
  return { diagram, sheets };
}

export function applyShortCircuitResultsToDiagram(oneLineData, result) {
  const sheets = oneLineData.sheets;
  const diagram = sheets.flatMap(sheet => sheet.components);
  diagram.forEach(component => {
    component.shortCircuit = result[component.id];
    (component.connections || []).forEach(connection => {
      connection.faultKA = result[connection.target]?.threePhaseKA;
    });
  });
  return { diagram, sheets };
}

export function createStudyExecutionController({
  buttons,
  getOneLine,
  setOneLine,
  getStudies,
  setStudies,
  getStudySettings,
  getActiveSheet,
  getProtectiveDeviceCatalog,
  loadReferencedProtectiveDevices,
  getCables,
  getTccSettings,
  runLoadFlow,
  runShortCircuitOffMain,
  runShortCircuit,
  runArcFlash,
  runHarmonics,
  runNetworkHarmonics,
  runMotorStart,
  runReliability,
  assertSheetsUnchanged,
  getSheetsRevision,
  recordProvenance,
  updateCableOperatingVoltages,
  markScheduleReconcilePending,
  renderStudyResults,
  renderLoadFlowResults,
  render,
  generateArcFlashReport,
  openLabelPrintWindow,
  highlightSPF,
  showAlertModal,
  windowRef
}) {
  const runLoadFlowStudy = async () => {
    const oneLine = getOneLine();
    const revision = getSheetsRevision(oneLine);
    const settings = getStudySettings();
    const result = await runLoadFlow(oneLine, {
      baseMVA: settings.loadFlow.baseMVA,
      balanced: settings.loadFlow.balanced,
      maxIterations: settings.loadFlow.maxIterations
    });
    const current = assertSheetsUnchanged(revision, 'Load flow');
    const applied = applyLoadFlowResultsToDiagram(oneLine, result);
    updateCableOperatingVoltages(applied.diagram);
    setOneLine({ activeSheet: current.activeSheet, sheets: applied.sheets });
    const studies = getStudies();
    studies.loadFlow = result;
    recordProvenance(studies, 'loadFlow');
    setStudies(studies);
    markScheduleReconcilePending();
    renderStudyResults();
    renderLoadFlowResults(result);
    render();
    return result;
  };

  // Every short-circuit run — the standalone study (in a worker, which has no
  // storage) and the arc-flash basis (main thread) — must evaluate the same
  // inputs, so the Cable Schedule and saved TCC settings travel explicitly.
  const buildShortCircuitOptions = async oneLine => ({
    method: getStudySettings().shortCircuit.method,
    deviceCatalog: await loadReferencedProtectiveDevices(oneLine, { catalog: getProtectiveDeviceCatalog() }),
    cables: getCables(),
    tccSettings: getTccSettings()
  });

  const runShortCircuitStudy = async () => {
    const oneLine = getOneLine();
    const revision = getSheetsRevision(oneLine);
    const result = await runShortCircuitOffMain(oneLine, await buildShortCircuitOptions(oneLine));
    const current = assertSheetsUnchanged(revision, 'Short circuit');
    const applied = applyShortCircuitResultsToDiagram(oneLine, result);
    setOneLine({ activeSheet: current.activeSheet, sheets: applied.sheets });
    const studies = getStudies();
    studies.shortCircuit = result;
    recordProvenance(studies, 'shortCircuit');
    setStudies(studies);
    renderStudyResults();
    render();
    return result;
  };

  const runArcFlashStudy = async () => {
    const oneLine = getOneLine();
    const options = await buildShortCircuitOptions(oneLine);
    const shortCircuit = runShortCircuit(options);
    const arcFlash = await runArcFlash({ shortCircuit: { ...options }, deviceCatalog: options.deviceCatalog });
    const current = getOneLine();
    applyShortCircuitResultsToDiagram(current, shortCircuit);
    current.sheets.flatMap(sheet => sheet.components).forEach(component => { component.arcFlash = arcFlash[component.id]; });
    setOneLine({ activeSheet: getActiveSheet(), sheets: current.sheets });
    const studies = getStudies();
    Object.assign(studies, { shortCircuit, arcFlash });
    recordProvenance(studies, 'shortCircuit');
    recordProvenance(studies, 'arcFlash');
    setStudies(studies);
    generateArcFlashReport(arcFlash);
    if (buttons.printArcFlashLabels) buttons.printArcFlashLabels.disabled = false;
    renderStudyResults();
    render();
    return { shortCircuit, arcFlash };
  };

  const runReliabilityStudy = async () => {
    const oneLine = getOneLine();
    const revision = getSheetsRevision(oneLine);
    const diagram = oneLine.sheets.flatMap(sheet => sheet.components);
    const result = await runReliability(diagram);
    assertSheetsUnchanged(revision, 'Reliability');
    const studies = getStudies();
    studies.reliability = result;
    setStudies(studies);
    highlightSPF(result.n1Failures);
    renderStudyResults();
    return result;
  };

  const bind = () => {
    buttons.loadFlow?.addEventListener('click', () => runLoadFlowStudy().catch(error => {
      console.error('[oneline] load flow failed', error);
      showAlertModal('Load Flow Error', error?.message || String(error));
    }));
    buttons.shortCircuit?.addEventListener('click', () => runShortCircuitStudy().catch(error => {
      console.error('[oneline] short circuit failed', error);
      showAlertModal('Short Circuit Error', error?.message || String(error));
    }));
    buttons.arcFlash?.addEventListener('click', () => runArcFlashStudy().catch(error => {
      console.error('[oneline] arc flash failed', error);
      showAlertModal('Arc Flash Error', error?.message || String(error));
    }));
    buttons.printArcFlashLabels?.addEventListener('click', () => openLabelPrintWindow(getStudies()?.arcFlash || {}));
    buttons.harmonics?.addEventListener('click', () => {
      const studies = getStudies();
      Object.assign(studies, { harmonics: runHarmonics(), harmonicNetwork: runNetworkHarmonics() });
      setStudies(studies);
      renderStudyResults();
      windowRef.open('harmonics.html', '_blank');
    });
    buttons.motorStart?.addEventListener('click', () => {
      const studies = getStudies();
      studies.motorStart = runMotorStart();
      setStudies(studies);
      renderStudyResults();
      windowRef.open('motorStart.html', '_blank');
    });
    buttons.reliability?.addEventListener('click', () => runReliabilityStudy().catch(error => {
      console.error('[oneline] reliability failed', error);
      showAlertModal('Reliability Error', error?.message || String(error));
    }));
  };

  return { bind, runArcFlashStudy, runLoadFlowStudy, runReliabilityStudy, runShortCircuitStudy };
}
