// One-line diagram validation passes.
//
// Pure issue-collecting checks extracted from oneline.js#validateDiagram.
// The caller still owns side effects (rendering the lint panel, applying SVG
// markers, toasting), but the underlying topology + connection rules now live
// here so they can be unit-tested and reused without booting the editor.

/**
 * Normalize a `phases` value (array, count, or delimited string) to a
 * deduplicated, upper-cased letter set. Returns an empty array when no phases
 * can be inferred.
 */
export function phaseSet(val) {
  if (Array.isArray(val)) return val.map(p => String(p).toUpperCase());
  if (typeof val === 'number') {
    if (val === 3) return ['A', 'B', 'C'];
    if (val === 2) return ['A', 'B'];
    if (val === 1) return ['A'];
    return [];
  }
  if (typeof val === 'string') {
    if (/^\d+$/.test(val.trim())) return phaseSet(parseInt(val, 10));
    return val
      .split(/[\s,]+/)
      .map(p => p.trim().toUpperCase())
      .filter(Boolean);
  }
  return [];
}

/**
 * Run the topology + connection-rule passes against a diagram's components.
 *
 * @param {Array<object>} components - Components on the active sheet.
 * @param {object} deps
 * @param {(component: object, connection: object, role: 'source'|'target') => number|null} deps.resolveConnectionVoltageVolts
 * @param {(volts: number) => string} deps.formatVoltage
 * @param {(source: object, target: object|undefined, conn: object) => any} deps.getCableForConnection
 * @param {(component: object) => string} deps.getComponentTag
 * @param {(component: object) => string} deps.scheduleKeyForComponent
 * @param {(component: object) => boolean} deps.hasResolvedScheduleLink
 * @returns {Array<{ component: string, target?: string, code: string, message: string, connectionIndex?: number }>}
 */
export function runDiagramValidationPasses(components, deps) {
  const {
    resolveConnectionVoltageVolts,
    formatVoltage,
    getCableForConnection,
    getComponentTag,
    scheduleKeyForComponent,
    hasResolvedScheduleLink
  } = deps;
  const issues = [];
  const idMap = new Map();
  const inbound = new Map();

  components.forEach(c => {
    if (c.type === 'dimension') return;
    idMap.set(c.id, (idMap.get(c.id) || 0) + 1);
    inbound.set(c.id, 0);
  });

  components.forEach(c => {
    if (c.type === 'dimension') return;
    (c.connections || []).forEach(conn => {
      inbound.set(conn.target, (inbound.get(conn.target) || 0) + 1);
      const target = components.find(t => t.id === conn.target);
      if (target) {
        const srcVolt = resolveConnectionVoltageVolts(c, conn, 'source');
        const tgtVolt = resolveConnectionVoltageVolts(target, conn, 'target');
        if (srcVolt !== null && tgtVolt !== null) {
          const diff = Math.abs(srcVolt - tgtVolt);
          const tolerance = Math.max(1, Math.min(srcVolt, tgtVolt) * 0.005);
          if (diff > tolerance) {
            const srcLabel = formatVoltage(srcVolt);
            const tgtLabel = formatVoltage(tgtVolt);
            issues.push({
              component: c.id,
              target: target.id,
              code: 'voltage-mismatch',
              message: `Voltage mismatch with ${target.label || target.subtype || target.id} (${srcLabel} vs ${tgtLabel})`
            });
            issues.push({
              component: target.id,
              target: c.id,
              code: 'voltage-mismatch',
              message: `Voltage mismatch with ${c.label || c.subtype || c.id} (${tgtLabel} vs ${srcLabel})`
            });
          }
        }
      }
      if (target) {
        const srcPh = phaseSet(c.phases);
        const tgtPh = phaseSet(target.phases);
        const connPh = conn.phases ? phaseSet(conn.phases) : null;
        if (connPh && connPh.length) {
          if (srcPh.length && !connPh.every(p => srcPh.includes(p))) {
            issues.push({
              component: c.id,
              target: target.id,
              code: 'phase-mismatch',
              message: `Phase mismatch with ${target.label || target.subtype || target.id}`
            });
          }
          if (tgtPh.length && !connPh.every(p => tgtPh.includes(p))) {
            issues.push({
              component: target.id,
              target: c.id,
              code: 'phase-mismatch',
              message: `Phase mismatch with ${c.label || c.subtype || c.id}`
            });
          }
        } else if (srcPh.length && tgtPh.length && !tgtPh.every(p => srcPh.includes(p))) {
          issues.push({
            component: c.id,
            target: target.id,
            code: 'phase-mismatch',
            message: `Phase mismatch with ${target.label || target.subtype || target.id}`
          });
          issues.push({
            component: target.id,
            target: c.id,
            code: 'phase-mismatch',
            message: `Phase mismatch with ${c.label || c.subtype || c.id}`
          });
        }
      }
      const cableInfo = getCableForConnection(c, target, conn);
      if (target && (!cableInfo?.tag || cableInfo?.provisional || conn.reviewStatus === 'assumed')) {
        issues.push({
          component: c.id,
          target: target.id,
          connectionIndex: (c.connections || []).indexOf(conn),
          code: 'provisional-cable',
          message: `Cable details need review for ${getComponentTag(c) || c.id} to ${getComponentTag(target) || target.id}`
        });
      }
    });
  });

  components.forEach(c => {
    // Gap #48: sheet_link components are intentional terminators; exclude from unconnected check
    if (c.type === 'dimension' || c.type === 'annotation' || c.type === 'sheet_link') return;
    if ((c.connections || []).length + (inbound.get(c.id) || 0) === 0) {
      issues.push({ component: c.id, code: 'unconnected', message: 'Unconnected component' });
    }
    const key = scheduleKeyForComponent(c);
    if (key && !hasResolvedScheduleLink(c)) {
      issues.push({ component: c.id, code: 'missing-schedule-link', message: 'Missing schedule link' });
    }
  });

  components.forEach(c => {
    if (c.type === 'dimension') return;
    (c.connections || []).forEach(conn => {
      const target = components.find(t => t.id === conn.target);
      const cableInfo = getCableForConnection(c, target, conn);
      if (cableInfo && cableInfo.sizing_warning) {
        issues.push({ component: c.id, code: 'sizing-warning', message: cableInfo.sizing_warning });
      }
    });
  });

  idMap.forEach((count, id) => {
    if (count > 1) {
      components.filter(c => c.id === id).forEach(c => {
        issues.push({ component: c.id, code: 'duplicate-id', message: `Duplicate ID "${id}"` });
      });
    }
  });

  return issues;
}
