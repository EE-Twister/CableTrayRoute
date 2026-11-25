import { formatCablePhases } from '../../utils/cablePhases.js';
import { sizeConductor } from '../../sizing.js';

/**
 * Derive the equipment, panel, load, and cable schedule rows implied by the
 * one-line diagram. Pure: the classification helpers that live with the
 * diagram's component model are passed in, so the mapping can be tested
 * without the diagram module's state.
 *
 * @param {object[]} all every component on every sheet
 * @param {object} helpers
 * @param {(comp: object) => string} helpers.getCategory
 * @param {(comp: object) => string} helpers.getComponentTag
 * @param {(comp: object) => boolean} helpers.isConductorSegmentComponent
 * @param {(comp: object) => boolean} helpers.isBusComponent
 * @param {(value: unknown) => boolean} helpers.hasStoredPhases
 * @param {(comp: object, all: object[]) => object|null} helpers.buildCableSpecFromComponent
 * @param {(value: unknown) => string} helpers.formatLoadFlowCurrentValue
 * @param {Record<string, Array<{name: string, getValue?: Function}>>} [helpers.propSchemas]
 */
export function buildScheduleDataFromComponents(all, {
  getCategory,
  getComponentTag,
  isConductorSegmentComponent,
  isBusComponent,
  hasStoredPhases,
  buildCableSpecFromComponent,
  formatLoadFlowCurrentValue,
  propSchemas = {}
}) {
  const findPanelId = id => {
    const visited = new Set();
    let currentId = id;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const upstream = all.find(item => (item.connections || []).some(conn => conn.target === currentId));
      if (!upstream) return null;
      if (getCategory(upstream) === 'panel') return upstream.ref || upstream.id;
      currentId = upstream.id;
    }
    return null;
  };
  const mapFields = c => {
    const componentTag = getComponentTag(c);
    const description = c.description || c.notes || '';
    const src = all.find(s => (s.connections || []).some(conn => conn.target === c.id));
    const conn = src ? (src.connections || []).find(cc => cc.target === c.id) : null;
    const inboundCable = src && isConductorSegmentComponent(src)
      ? src
      : all.find(item => isConductorSegmentComponent(item) && (item.connections || []).some(cc => cc.target === c.id));
    const cableInfo = inboundCable?.cable || null;
    const connPhases = hasStoredPhases(conn?.phases)
      ? formatCablePhases(conn.phases)
      : hasStoredPhases(cableInfo?.phases)
      ? formatCablePhases(cableInfo)
      : formatCablePhases(c);
    const connConductors = conn?.conductors || cableInfo?.conductors || conn?.cable?.conductors || '';
    const fields = {
      entityId: c.entityId || '',
      id: c.ref || c.id,
      ref: c.id,
      tag: componentTag,
      description: description || (c.label && c.label !== componentTag ? c.label : ''),
      voltage: c.voltage ?? '',
      manufacturer: c.manufacturer ?? '',
      model: c.model ?? '',
      voltage_class: c.voltage_class ?? '',
      enclosure: c.enclosure ?? '',
      thermal_rating: c.thermal_rating ?? '',
      phases: connPhases,
      conductors: connConductors,
      notes: c.notes ?? '',
      rating: c.rating ?? '',
      impedance_r: c.impedance?.r ?? '',
      impedance_x: c.impedance?.x ?? '',
      voltage_mag: typeof c.voltage_mag === 'number' ? c.voltage_mag : '',
      voltage_angle: typeof c.voltage_angle === 'number' ? c.voltage_angle : '',
      voltage_mag_a: c.voltage_mag?.A ?? c.voltage_mag?.a ?? '',
      voltage_mag_b: c.voltage_mag?.B ?? c.voltage_mag?.b ?? '',
      voltage_mag_c: c.voltage_mag?.C ?? c.voltage_mag?.c ?? '',
      voltage_angle_a: c.voltage_angle?.A ?? c.voltage_angle?.a ?? '',
      voltage_angle_b: c.voltage_angle?.B ?? c.voltage_angle?.b ?? '',
      voltage_angle_c: c.voltage_angle?.C ?? c.voltage_angle?.c ?? '',
      category: getCategory(c),
      subCategory: c.subtype ?? '',
      x: c.x ?? '',
      y: c.y ?? '',
      z: c.z ?? ''
    };
    (propSchemas[c.subtype] || []).forEach(f => {
      const value = typeof f.getValue === 'function'
        ? f.getValue(c)
        : c[f.name];
      fields[f.name] = value ?? fields[f.name] ?? '';
    });
    return fields;
  };
  const equipment = all
    .filter(c => getCategory(c) === 'equipment')
    .map(mapFields);
  const panels = all
    .filter(c => getCategory(c) === 'panel')
    .map(mapFields);
  const loads = all
    .filter(c => getCategory(c) === 'load')
    .map(c => {
      const fields = mapFields(c);
      const panelId = findPanelId(c.id);
      if (panelId) fields.panelId = panelId;
      return fields;
    });
  const buses = all
    .filter(c => isBusComponent(c))
    .map(mapFields);
  const cableSpecs = [];
  const seenTags = new Set();
  all
    .filter(c => isConductorSegmentComponent(c))
    .forEach(cableComp => {
      const spec = buildCableSpecFromComponent(cableComp, all);
      if (!spec) return;
      spec.circuitId = cableComp.circuitId || spec.circuitId || '';
      if (spec.tag) seenTags.add(spec.tag);
      cableSpecs.push(spec);
    });
  all.forEach(c => {
    (c.connections || []).forEach(conn => {
      if (!conn.cable) return;
      if (conn.cable.tag && seenTags.has(conn.cable.tag)) return;
      const target = all.find(t => t.id === conn.target);
      const spec = {
        ...conn.cable,
        circuitId: conn.circuitId || conn.cable?.circuitId || '',
        phases: hasStoredPhases(conn.phases) ? formatCablePhases(conn.phases) : formatCablePhases(conn.cable),
        conductors: conn.conductors || conn.cable.conductors,
        from_tag: getComponentTag(c),
        to_tag: getComponentTag(target) || conn.target
      };
      const impedanceSource = conn.impedance || conn.cable?.impedance;
      if (impedanceSource && typeof impedanceSource === 'object') {
        spec.impedance = { ...impedanceSource };
      }
      spec.load_flow_current = formatLoadFlowCurrentValue(conn.loading_amps);
      cableSpecs.push(spec);
    });
  });
  return {
    equipment: [...equipment, ...buses],
    panels: [...panels, ...buses],
    loads,
    cables: cableSpecs
  };
}

/**
 * Format a load-flow branch current for the schedule: one value to 0.1 A, or
 * per-phase values as "A:12.0, B:11.8" sorted by phase.
 * @param {unknown} value
 * @returns {string}
 */
export function formatLoadFlowCurrentValue(value) {
  if (value === null || value === undefined) return '';
  const normalize = val => {
    const num = Number(val);
    if (!Number.isFinite(num)) return null;
    return num.toFixed(1);
  };
  if (typeof value === 'object') {
    const entries = Array.isArray(value)
      ? value.map((val, idx) => [idx, val])
      : Object.entries(value);
    const parts = entries
      .map(([phase, val]) => {
        const formatted = normalize(val);
        if (formatted === null) return null;
        const label = String(phase).trim();
        return { phase: label, formatted };
      })
      .filter(Boolean)
      .sort((a, b) => a.phase.localeCompare(b.phase, undefined, { sensitivity: 'base', numeric: true }))
      .map(entry => `${entry.phase}:${entry.formatted}`);
    return parts.join(', ');
  }
  const formatted = normalize(value);
  return formatted === null ? '' : formatted;
}

/**
 * Cable schedule row for a cable component on the one-line: endpoints from the
 * upstream source and downstream target, routed length (scaled, with slack, or
 * the manual length), and the conductor sizing check. Like the original diagram
 * helper, it also writes the sizing results back onto comp.cable.
 *
 * @param {object} comp cable component
 * @param {object[]} allComps every component on every sheet
 * @param {object} helpers
 * @param {(id: string, comps: object[]) => object|null} helpers.findSourceComponent
 * @param {(holder: object) => boolean} helpers.hasImpedance
 * @param {(comp: object) => string} helpers.getComponentTag
 * @param {(source: unknown) => string[]} helpers.parseCablePhases
 * @param {number} [helpers.unitPerPx] diagram scale, length units per pixel
 */
export function buildCableSpecFromComponent(comp, allComps, {
  findSourceComponent,
  hasImpedance,
  getComponentTag,
  parseCablePhases,
  unitPerPx: diagramUnitPerPx = 1
}) {
  if (!comp || comp.type !== 'cable') return null;
  const cable = comp.cable || {};
  const upstream = findSourceComponent(comp.id, allComps);
  const outbound = (comp.connections || []).find(conn => conn.target);
  const target = outbound ? allComps.find(c => c.id === outbound.target) : null;
  const spec = { ...cable };
  if (hasImpedance(cable)) spec.impedance = { ...cable.impedance };
  if (!spec.tag) spec.tag = comp.label || comp.id;
  spec.from_tag = getComponentTag(upstream);
  spec.to_tag = getComponentTag(target) || outbound?.target || '';
  const outboundPhases = parseCablePhases(outbound?.phases);
  const cablePhases = parseCablePhases(cable);
  const phases = outboundPhases.length ? outboundPhases : cablePhases;
  spec.phases = phases.length ? phases.join(',') : formatCablePhases(cable);
  spec.conductors = outbound?.conductors || cable.conductors || '';
  const unitPerPx = diagramUnitPerPx || 1;
  const slackPctRaw = parseFloat(cable.slack_pct);
  const slackPct = Number.isFinite(slackPctRaw) ? Math.max(0, slackPctRaw) : 0;
  const slackMultiplier = 1 + (slackPct / 100);
  const autoLen = (outbound?.length || 0) * unitPerPx * slackMultiplier;
  let finalLen = autoLen;
  if (cable.manual_length) {
    const manual = parseFloat(cable.length);
    if (!Number.isNaN(manual)) finalLen = manual;
  }
  if (finalLen) {
    spec.length = finalLen.toFixed(2);
  }
  if (cable.manual_length) spec.manual_length = true;
  const load = {
    current: parseFloat(target?.current) || 0,
    voltage: parseFloat(target?.voltage) || parseFloat(upstream?.voltage) || 0,
    phases: phases.length || parseInt(target?.phases || upstream?.phases || 3, 10)
  };
  const params = {
    length: finalLen,
    material: spec.conductor_material || 'cu',
    insulation_rating: parseFloat(target?.insulation_rating) || 90,
    ambient: parseFloat(spec.ambient_temp) || parseFloat(upstream?.ambient) || 30,
    conductors: parseInt(spec.conductors) || 1,
    maxVoltageDrop: parseFloat(target?.maxVoltageDrop) || 3,
    code: target?.code || 'NEC'
  };
  const result = sizeConductor(load, params);
  spec.calc_ampacity = result.ampacity ? result.ampacity.toFixed(2) : spec.calc_ampacity || '';
  spec.voltage_drop_pct = result.voltageDrop ? result.voltageDrop.toFixed(2) : spec.voltage_drop_pct || '';
  spec.sizing_warning = result.violation || spec.sizing_warning || '';
  spec.code_reference = result.codeRef || spec.code_reference || '';
  spec.sizing_report = JSON.stringify(result.report || {});
  spec.load_flow_current = formatLoadFlowCurrentValue(outbound?.loading_amps);
  comp.cable = {
    ...comp.cable,
    calc_ampacity: spec.calc_ampacity,
    voltage_drop_pct: spec.voltage_drop_pct,
    sizing_warning: spec.sizing_warning,
    code_reference: spec.code_reference,
    sizing_report: spec.sizing_report,
    length: spec.length,
    manual_length: spec.manual_length,
    load_flow_current: spec.load_flow_current
  };
  return spec;
}
