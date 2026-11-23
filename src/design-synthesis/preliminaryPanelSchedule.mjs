import { computeDesignSynthesisBreakerSpan } from '../../analysis/designSynthesisPanelSchedule.mjs';

const key = value => value == null ? '' : String(value).trim();
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : '';

function csvCell(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  let result = value == null ? '' : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(result) || /^[\t\r\n]/u.test(result)) result = `'${result}`;
  return `"${result.replaceAll('"', '""')}"`;
}

function uniqueMap(items, field) {
  const map = new Map();
  for (const item of items) {
    const id = key(item?.[field]);
    if (!id || map.has(id)) return null;
    map.set(id, item);
  }
  return map;
}

/** Export only a self-consistent generated panel projection, never approval. */
export function buildPreliminaryPanelSchedule(proposal) {
  const panels = Array.isArray(proposal?.panels) ? proposal.panels : [];
  const loads = Array.isArray(proposal?.loads) ? proposal.loads : [];
  const cables = Array.isArray(proposal?.cables) ? proposal.cables : [];
  const panelsById = uniqueMap(panels, 'id');
  const loadsById = uniqueMap(loads, 'id');
  const branchCables = cables.filter(cable => key(cable?.loadId));
  const cablesByLoad = uniqueMap(branchCables, 'loadId');
  const fail = () => ({ ok: false, message: 'A complete, consistent generated panel circuit assignment is required.', csv: null });
  if (!panels.length || !panelsById || !loadsById || !cablesByLoad || !loads.length) return fail();
  const headers = ['Review basis', 'Proposal status', 'Input signature', 'Panel ID', 'Panel tag', 'Fed from', 'Panel voltage (V)', 'Panel main candidate (A)', 'Circuit', 'Circuit status', 'Branch start circuit', 'Branch poles', 'Load ID', 'Load tag', 'Load type', 'Load power (kW)', 'Cable ID', 'Branch device candidate', 'Branch device rating (A)', 'Protection review status'];
  const output = [];
  const assigned = new Set();
  for (const panel of panels) {
    const count = panel.circuitCount;
    if (!Number.isSafeInteger(count) || count < 1 || count > 512 || !Array.isArray(panel.loadIds)
      || !Array.isArray(panel.breakers) || panel.breakers.length !== count
      || !Array.isArray(panel.breakerLayout) || panel.breakerLayout.length !== count) return fail();
    const slots = new Map();
    for (const rawId of panel.loadIds) {
      const id = key(rawId);
      const load = loadsById.get(id);
      const cable = cablesByLoad.get(id);
      if (!id || assigned.has(id) || !load || !cable || key(cable.from) !== key(panel.id) || key(cable.to) !== id
        || key(load.panelRef) !== key(panel.id)) return fail();
      const start = load.breaker;
      const poles = load.breakerPoles;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(poles) || poles < 1 || poles > 3) return fail();
      const span = computeDesignSynthesisBreakerSpan(start, poles, count);
      if (span.length !== poles) return fail();
      for (const [position, circuit] of span.entries()) {
        const layout = panel.breakerLayout[circuit - 1];
        if (slots.has(circuit) || !layout || layout.start !== start || layout.size !== poles || layout.position !== position
          || key(panel.breakers[circuit - 1]) !== key(load.tag || load.id)) return fail();
        slots.set(circuit, { load, cable, start, poles });
      }
      assigned.add(id);
    }
    for (let circuit = 1; circuit <= count; circuit += 1) {
      const branch = slots.get(circuit);
      if (!branch && (panel.breakers[circuit - 1] != null || panel.breakerLayout[circuit - 1] != null)) return fail();
      const { load, cable, start, poles } = branch || {};
      const device = cable?.protectiveDevice;
      const rating = number(device?.tripRatingA) || number(device?.continuousCurrentA);
      const mainRating = key(panel.mainRating) ? number(Number(panel.mainRating)) : '';
      output.push(['PRELIMINARY SCREENING - NOT APPROVED', proposal.status || 'unknown', proposal.inputSignature || '', panel.id, panel.tag, panel.fedFrom, number(panel.voltage), mainRating, circuit,
        branch ? 'assigned' : 'unassigned', start, poles, load?.id, load?.tag, load?.motor ? 'motor' : branch ? 'nonmotor load' : '', number(load?.kw), cable?.id,
        device ? [device.manufacturer || device.vendor, device.catalogNumber || device.catalog_number || device.id].filter(Boolean).join(' ') : '', rating,
        load?.motor ? 'motor protection unresolved; candidate only' : branch ? 'screening only; coordination and assembly SCCR not established' : '']);
    }
  }
  if (assigned.size !== loads.length || branchCables.length !== loads.length) return fail();
  return { ok: true, message: null, csv: `\ufeff${[headers, ...output].map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`, panelCount: panels.length, circuitCount: output.length };
}
