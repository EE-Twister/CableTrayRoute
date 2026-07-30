const VISUAL_TYPES = new Set(['dimension', 'annotation']);
const CONNECTOR_TYPE_KEYWORDS = ['link', 'cable', 'feeder', 'conductor', 'tap', 'splice'];
const SOURCE_TYPES = new Set(['source', 'utility', 'generator', 'swing']);
const MAX_N2_CANDIDATES = 50;

function isVisualComponent(component) {
  return component ? VISUAL_TYPES.has(component.type) : false;
}

function isConnectorComponent(component) {
  const type = `${component?.type || ''}`.toLowerCase();
  return CONNECTOR_TYPE_KEYWORDS.some(keyword => type.includes(keyword));
}

function pickValue(component, key) {
  if (!component || !key) return undefined;
  if (Object.prototype.hasOwnProperty.call(component, key)) return component[key];
  if (component.props && typeof component.props === 'object' && Object.prototype.hasOwnProperty.call(component.props, key)) {
    return component.props[key];
  }
  return undefined;
}

function normalizedIdentifier(value) {
  return String(value ?? '').trim().toLowerCase();
}

function componentAliases(component) {
  return [
    component?.id,
    component?.tag,
    component?.ref,
    component?.name,
    component?.label,
    component?.displayLabel,
  ].map(normalizedIdentifier).filter(Boolean);
}

function buildAdjacency(components = [], skipIds = new Set()) {
  const adjacency = new Map();
  components.forEach(component => {
    if (!component?.id || skipIds.has(component.id)) return;
    adjacency.set(component.id, new Set());
  });
  components.forEach(component => {
    if (!component?.id || skipIds.has(component.id)) return;
    (component.connections || []).forEach(connection => {
      const target = connection?.target;
      if (!target || skipIds.has(target) || !adjacency.has(target)) return;
      adjacency.get(component.id).add(target);
      adjacency.get(target).add(component.id);
    });
  });
  return adjacency;
}

function findConnected(startIds = [], adjacency = new Map()) {
  const visited = new Set();
  const queue = [...startIds.filter(id => adjacency.has(id))];
  queue.forEach(id => visited.add(id));
  while (queue.length) {
    const id = queue.shift();
    (adjacency.get(id) || []).forEach(next => {
      if (visited.has(next)) return;
      visited.add(next);
      queue.push(next);
    });
  }
  return visited;
}

function identifySources(components, adjacency) {
  const sourceIds = components
    .filter(component => SOURCE_TYPES.has(`${component?.type || ''}`.toLowerCase()))
    .map(component => component.id);
  if (sourceIds.length) return sourceIds;

  const busIds = components.filter(component => component.type === 'bus').map(component => component.id);
  const inbound = new Map(busIds.map(id => [id, 0]));
  components.forEach(component => (component.connections || []).forEach(connection => {
    if (inbound.has(connection?.target)) {
      inbound.set(connection.target, (inbound.get(connection.target) || 0) + 1);
    }
  }));
  const implicitSources = busIds.filter(id => (inbound.get(id) || 0) === 0 && (adjacency.get(id)?.size || 0) > 0);
  return implicitSources.length ? implicitSources : busIds.slice(0, 1);
}

function resolveServicePoints(components, loads = []) {
  const aliasMap = new Map();
  components.forEach(component => {
    componentAliases(component).forEach(alias => {
      if (!aliasMap.has(alias)) aliasMap.set(alias, component.id);
    });
  });
  const servicePoints = [];
  (Array.isArray(loads) ? loads : []).forEach((load, index) => {
    const candidates = [
      load?.busId,
      load?.bus_id,
      load?.componentId,
      load?.component_id,
      load?.sourceId,
      load?.source_id,
      load?.source,
      load?.equipment_id,
      load?.equipment_tag,
      load?.id,
      load?.tag,
      load?.ref,
    ].map(normalizedIdentifier).filter(Boolean);
    const nodeId = candidates.map(candidate => aliasMap.get(candidate)).find(Boolean);
    if (!nodeId) return;
    const kw = Number(load?.kw ?? load?.kW ?? load?.power_kw ?? load?.power ?? 0) || 0;
    const criticality = Number(load?.criticalityWeight ?? load?.criticality_weight ?? load?.priorityWeight)
      || (load?.critical === true ? 2 : 1);
    servicePoints.push({
      id: load?.id || load?.tag || load?.ref || `load-${index + 1}`,
      label: load?.tag || load?.description || load?.name || load?.id || `Load ${index + 1}`,
      nodeId,
      kw: Math.max(0, kw),
      criticality: Math.max(0.1, criticality),
      critical: load?.critical === true || criticality > 1,
      basis: 'load-list',
    });
  });
  if (servicePoints.length) return servicePoints;

  return components
    .filter(component => component.type === 'bus')
    .map(component => ({
      id: component.id,
      label: component.tag || component.name || component.label || component.id,
      nodeId: component.id,
      kw: Math.max(0, Number(pickValue(component, 'Pd') ?? pickValue(component, 'kw') ?? 0) || 0),
      criticality: 1,
      critical: false,
      basis: 'one-line-bus-fallback',
    }));
}

function impactedServicePoints(servicePoints, connected, failedIds) {
  return servicePoints.filter(point => !failedIds.has(point.nodeId) && !connected.has(point.nodeId));
}

function impactRecord(failed, impacted, probability, componentStats) {
  const impactedKw = impacted.reduce((sum, point) => sum + point.kw, 0);
  const criticalKw = impacted.filter(point => point.critical).reduce((sum, point) => sum + point.kw, 0);
  const failureFrequencyPerYear = failed.length === 1
    ? componentStats[failed[0]]?.failureFrequencyPerYear || 0
    : 0;
  return {
    failed,
    impacted: impacted.map(point => point.id),
    impactedServicePoints: impacted,
    impactedKw,
    criticalKw,
    probability,
    failureFrequencyPerYear,
  };
}

function summarizeServiceMetrics(servicePoints, n1Impacts, n2Impacts) {
  const allImpacts = [...n1Impacts, ...n2Impacts];
  const totalKw = servicePoints.reduce((sum, point) => sum + point.kw, 0);
  const weightedBase = servicePoints.reduce((sum, point) => sum + (point.kw || 1) * point.criticality, 0);
  const perPoint = servicePoints.map(point => {
    const unavailability = Math.min(1, allImpacts
      .filter(impact => impact.impacted.includes(point.id))
      .reduce((sum, impact) => sum + impact.probability, 0));
    const frequencyPerYear = n1Impacts
      .filter(impact => impact.impacted.includes(point.id))
      .reduce((sum, impact) => sum + impact.failureFrequencyPerYear, 0);
    return {
      ...point,
      availability: Math.max(0, 1 - unavailability),
      expectedOutageHours: unavailability * 8760,
      interruptionFrequencyPerYear: frequencyPerYear,
      eensKwh: unavailability * 8760 * point.kw,
    };
  });
  const eensKwh = perPoint.reduce((sum, point) => sum + point.eensKwh, 0);
  const criticalLoadEensKwh = perPoint
    .filter(point => point.critical)
    .reduce((sum, point) => sum + point.eensKwh, 0);
  const serviceInterruptionHours = totalKw > 0 ? eensKwh / totalKw : 0;
  const expectedInterruptionsPerYear = weightedBase > 0
    ? perPoint.reduce(
        (sum, point) => sum + point.interruptionFrequencyPerYear * (point.kw || 1) * point.criticality,
        0,
      ) / weightedBase
    : 0;
  const averageInterruptionDurationHours = expectedInterruptionsPerYear > 0
    ? serviceInterruptionHours / expectedInterruptionsPerYear
    : 0;
  const serviceAvailability = weightedBase > 0
    ? perPoint.reduce(
        (sum, point) => sum + point.availability * (point.kw || 1) * point.criticality,
        0,
      ) / weightedBase
    : null;
  return {
    servicePoints: perPoint,
    totalServedKw: totalKw,
    serviceAvailability,
    serviceInterruptionHours,
    expectedInterruptionsPerYear,
    averageInterruptionDurationHours,
    eensKwh,
    criticalLoadEensKwh,
  };
}

export function runReliability(components = [], options = {}) {
  const diagram = (Array.isArray(components) ? components : []).filter(component => !isVisualComponent(component));
  const eligible = diagram.filter(component => !isConnectorComponent(component));
  const componentStats = {};
  const availabilityMap = {};
  const missingData = [];
  let governedCount = 0;

  eligible.forEach(component => {
    const mtbf = Number(pickValue(component, 'mtbf'));
    const mttr = Number(pickValue(component, 'mttr'));
    const source = pickValue(component, 'reliabilitySource')
      || pickValue(component, 'reliability_source')
      || options.inputSource
      || '';
    const sourceDate = pickValue(component, 'reliabilitySourceDate')
      || pickValue(component, 'reliability_source_date')
      || options.inputDate
      || '';
    if (mtbf > 0 && mttr >= 0) {
      const availability = mtbf / (mtbf + mttr);
      const failureFrequencyPerYear = 8760 / mtbf;
      const downtime = failureFrequencyPerYear * mttr;
      componentStats[component.id] = {
        availability,
        downtime,
        mtbf,
        mttr,
        failureFrequencyPerYear,
        source,
        sourceDate,
      };
      availabilityMap[component.id] = { p: availability, q: 1 - availability };
      if (source && sourceDate) governedCount += 1;
    } else {
      missingData.push({
        id: component.id,
        label: component.tag || component.name || component.label || component.id,
        missing: [
          ...(mtbf > 0 ? [] : ['MTBF']),
          ...(mttr >= 0 ? [] : ['MTTR']),
        ],
      });
    }
  });

  const analyzedCount = Object.keys(componentStats).length;
  const eligibleCount = eligible.length;
  const ready = eligibleCount > 0 && analyzedCount === eligibleCount;
  const calculatedOutage = Object.values(componentStats).reduce((sum, stat) => sum + stat.downtime, 0);
  const diagramComponents = diagram.filter(component => component?.id);
  const baselineAdjacency = buildAdjacency(diagramComponents);
  const sourceIds = identifySources(diagramComponents, baselineAdjacency);
  let servicePoints = resolveServicePoints(diagramComponents, options.loads);
  const usingBusFallback = servicePoints.some(point => point.basis === 'one-line-bus-fallback');
  if (usingBusFallback) {
    const downstream = servicePoints.filter(point => (
      !sourceIds.includes(point.nodeId)
      && (point.kw > 0 || (baselineAdjacency.get(point.nodeId)?.size || 0) <= 1)
    ));
    servicePoints = downstream.length
      ? downstream
      : servicePoints.filter(point => !sourceIds.includes(point.nodeId));
  }
  const servicePointNodeIds = new Set(servicePoints.map(point => point.nodeId));
  const baseProduct = Object.values(availabilityMap).reduce((product, value) => product * value.p, 1) || 1;
  const n1Failures = [];
  const n2Failures = [];
  const n1Impacts = [];
  const n2Impacts = [];
  const n1FailureDetails = {};
  const individualImpactByFailure = new Map();

  const outageCandidates = eligible.filter(component => (
    component?.id
    && !sourceIds.includes(component.id)
    && !servicePointNodeIds.has(component.id)
  ));

  if (sourceIds.length) {
    outageCandidates.forEach(component => {
      const failedIds = new Set([component.id]);
      const connected = findConnected(
        sourceIds.filter(id => !failedIds.has(id)),
        buildAdjacency(diagramComponents, failedIds),
      );
      const impacted = impactedServicePoints(servicePoints, connected, failedIds);
      if (!impacted.length) return;
      n1Failures.push(component.id);
      individualImpactByFailure.set(component.id, new Set(impacted.map(point => point.id)));
      n1FailureDetails[component.id] = { isolatedLoads: impacted.map(point => point.id) };
      const componentAvailability = availabilityMap[component.id] || { p: 1, q: 0 };
      const probability = (componentAvailability.q / Math.max(componentAvailability.p, 1e-12))
        * baseProduct;
      n1Impacts.push(impactRecord([component.id], impacted, probability, componentStats));
    });

    const n2Candidates = outageCandidates.slice(0, MAX_N2_CANDIDATES);
    for (let first = 0; first < n2Candidates.length; first += 1) {
      for (let second = first + 1; second < n2Candidates.length; second += 1) {
        const firstId = n2Candidates[first].id;
        const secondId = n2Candidates[second].id;
        const failedIds = new Set([firstId, secondId]);
        const connected = findConnected(
          sourceIds.filter(id => !failedIds.has(id)),
          buildAdjacency(diagramComponents, failedIds),
        );
        const impacted = impactedServicePoints(servicePoints, connected, failedIds)
          .filter(point => (
            !individualImpactByFailure.get(firstId)?.has(point.id)
            && !individualImpactByFailure.get(secondId)?.has(point.id)
          ));
        if (!impacted.length) continue;
        const pairId = `${firstId} + ${secondId}`;
        n2Failures.push(pairId);
        const firstAvailability = availabilityMap[firstId] || { p: 1, q: 0 };
        const secondAvailability = availabilityMap[secondId] || { p: 1, q: 0 };
        const probability = (firstAvailability.q / Math.max(firstAvailability.p, 1e-12))
          * (secondAvailability.q / Math.max(secondAvailability.p, 1e-12))
          * baseProduct;
        n2Impacts.push(impactRecord([firstId, secondId], impacted, probability, componentStats));
      }
    }
  }

  const serviceMetrics = summarizeServiceMetrics(servicePoints, n1Impacts, n2Impacts);
  const cutSetUnavailability = Math.min(1, [...n1Impacts, ...n2Impacts]
    .reduce((sum, impact) => sum + impact.probability, 0));
  const systemAvailability = ready
    ? (serviceMetrics.serviceAvailability ?? Math.max(0, 1 - cutSetUnavailability))
    : null;
  const warnings = [];
  if (ready && governedCount < analyzedCount) {
    warnings.push(`${analyzedCount - governedCount} component reliability input(s) do not have both a source and source date.`);
  }
  if (outageCandidates.length > MAX_N2_CANDIDATES) {
    warnings.push(`N-2 screening was limited to the first ${MAX_N2_CANDIDATES} eligible outage candidates.`);
  }
  if (Array.isArray(options.loads) && options.loads.length && usingBusFallback) {
    warnings.push('Load List records could not be matched to One-Line service points.');
  }

  return {
    ready,
    complete: ready,
    eligibleCount,
    analyzedCount,
    governedCount,
    sourceCoveragePct: analyzedCount ? governedCount / analyzedCount * 100 : 0,
    coveragePct: eligibleCount ? analyzedCount / eligibleCount * 100 : 0,
    missingData,
    warnings,
    systemAvailability,
    expectedOutage: ready ? calculatedOutage : null,
    componentStats,
    n1Failures,
    n2Failures,
    n1Impacts,
    n2Impacts,
    n1FailureDetails,
    ...serviceMetrics,
    method: {
      type: 'minimal-cut-set-screening',
      maximumOrder: 2,
      n2CandidateLimit: MAX_N2_CANDIDATES,
      servicePointBasis: usingBusFallback
        ? 'One-Line bus fallback'
        : 'Load List matched to One-Line',
    },
  };
}
