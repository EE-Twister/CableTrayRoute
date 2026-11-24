import { formatCablePhases } from '../../utils/cablePhases.js';

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
