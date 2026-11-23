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
