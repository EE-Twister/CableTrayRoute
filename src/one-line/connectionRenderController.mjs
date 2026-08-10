export function calculateConnectionLength(points = []) {
  return points.reduce((sum, point, index) => (
    index ? sum + Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) : sum
  ), 0);
}

export function countInboundConnections(components = []) {
  const counts = new Map();
  components.forEach(component => {
    (component.connections || []).forEach(connection => {
      if (!connection?.target) return;
      counts.set(connection.target, (counts.get(connection.target) || 0) + 1);
    });
  });
  return counts;
}

export function rememberConnectionJunction(junctions, point, color = '#111827') {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  const key = `${Math.round(point.x * 10) / 10}:${Math.round(point.y * 10) / 10}`;
  if (!junctions.has(key)) junctions.set(key, { x: point.x, y: point.y, color });
}

export function renderConnections({
  documentRef,
  svgNS,
  components,
  componentById,
  renderSurface,
  routeConnection,
  isHiddenByLayer,
  includePoint,
  getCableForConnection,
  getVoltageRange,
  usedVoltageRanges,
  parseCablePhases,
  phaseColors,
  cableColors,
  engineeringPrint,
  showOverlays,
  classifyConnectionRole,
  selectedConnection,
  componentMatchesDiagramFilter,
  isConductorSegmentComponent,
  canEditConnectionWaypoint,
  toDiagramCoords,
  onSelectConnection,
  onEditCableComponent,
  onStartWaypointDrag,
  isBusComponent,
  connectionLabelPosition,
  getTransformerPortRole,
  dataStateOverlayMode,
  formatOverlayMetric,
  getStudyProvenance,
  resolveConnectionLabelPosition
}) {
  const inboundCounts = countInboundConnections(components);
  const junctions = new Map();
  let lengthsChanged = false;

  components.forEach(source => {
    (source.connections || []).forEach((connection, index) => {
      const target = componentById.get(connection.target);
      if (!target || isHiddenByLayer(source) || isHiddenByLayer(target)) return;
      const points = routeConnection(source, target, connection);
      points.forEach(point => includePoint(point.x, point.y));
      const length = calculateConnectionLength(points);
      if (Math.abs((connection.length || 0) - length) > 0.5) lengthsChanged = true;
      connection.length = length;

      const polyline = documentRef.createElementNS(svgNS, 'polyline');
      polyline.setAttribute('points', points.map(point => `${point.x},${point.y}`).join(' '));
      const cable = getCableForConnection(source, target, connection);
      const voltageRange = getVoltageRange(connection.voltage || cable?.voltage || source.voltage || target.voltage);
      if (voltageRange) usedVoltageRanges.add(voltageRange);
      const connectionPhases = parseCablePhases(connection?.phases);
      const phases = connectionPhases.length ? connectionPhases : parseCablePhases(cable);
      const phaseColor = phaseColors[phases.join('')];
      const stroke = !engineeringPrint && showOverlays
        ? (phaseColor || voltageRange?.color || cableColors[cable?.cable_type] || cable?.color || '#000')
        : '#111827';
      const role = classifyConnectionRole(source, target);
      polyline.setAttribute('stroke', stroke);
      polyline.setAttribute('fill', 'none');
      polyline.setAttribute('stroke-width', '3');
      polyline.style.pointerEvents = 'stroke';
      polyline.style.cursor = 'move';
      polyline.classList.add('connection', role);
      if (selectedConnection?.component?.id === source.id && selectedConnection.index === index) {
        polyline.classList.add('selected-connection');
      }
      const filtered = !componentMatchesDiagramFilter(source) || !componentMatchesDiagramFilter(target);
      if (filtered) polyline.classList.add('diagram-filter-dimmed');
      polyline.dataset.comp = source.id;
      polyline.dataset.index = index;
      const voltageDropLimit = parseFloat(target.maxVoltageDrop) || 3;
      if (cable?.sizing_warning) polyline.classList.add('sizing-violation');
      if (parseFloat(cable?.voltage_drop_pct) > voltageDropLimit) polyline.classList.add('voltage-exceed');
      polyline.addEventListener('click', event => {
        event.stopPropagation();
        onSelectConnection(source, index);
      });
      polyline.addEventListener('dblclick', event => {
        event.stopPropagation();
        const cableComponent = isConductorSegmentComponent(source)
          ? source
          : isConductorSegmentComponent(target)
            ? target
            : null;
        if (cableComponent) onEditCableComponent(cableComponent);
      });
      polyline.addEventListener('mousedown', event => {
        event.stopPropagation();
        if (!canEditConnectionWaypoint(source, connection) || (connection.dir !== 'h' && connection.dir !== 'v')) return;
        const coordinates = toDiagramCoords(event);
        onStartWaypointDrag({
          component: source,
          index,
          start: { x: coordinates.x, y: coordinates.y },
          mid: connection.mid ?? (connection.dir === 'h' ? points[1].x : points[1].y),
          moved: false
        });
      });
      renderSurface.appendChild(polyline);

      if (
        !engineeringPrint
        && selectedConnection?.component?.id === source.id
        && selectedConnection.index === index
        && canEditConnectionWaypoint(source, connection)
        && (connection.dir === 'h' || connection.dir === 'v')
      ) {
        const waypoint = documentRef.createElementNS(svgNS, 'circle');
        const mid = Number.isFinite(connection.mid)
          ? connection.mid
          : connection.dir === 'h'
            ? (points[0].x + points[points.length - 1].x) / 2
            : (points[0].y + points[points.length - 1].y) / 2;
        waypoint.setAttribute('cx', connection.dir === 'h' ? mid : (points[1].x + points[2].x) / 2);
        waypoint.setAttribute('cy', connection.dir === 'h' ? (points[1].y + points[2].y) / 2 : mid);
        waypoint.setAttribute('r', 6);
        waypoint.classList.add('connection-waypoint-handle');
        waypoint.dataset.comp = source.id;
        waypoint.dataset.index = String(index);
        waypoint.dataset.axis = connection.dir === 'h' ? 'x' : 'y';
        waypoint.setAttribute('aria-label', `Drag ${connection.dir === 'h' ? 'horizontal' : 'vertical'} connection waypoint`);
        waypoint.addEventListener('mousedown', event => {
          event.stopPropagation();
          const coordinates = toDiagramCoords(event);
          onStartWaypointDrag({
            component: source,
            index,
            start: { x: coordinates.x, y: coordinates.y },
            mid,
            moved: false
          });
        });
        renderSurface.appendChild(waypoint);
      }

      const startPoint = points[0];
      const endPoint = points[points.length - 1];
      const sourceNeedsJunction = isBusComponent(source) ? !engineeringPrint : (source.connections || []).length > 1;
      const targetNeedsJunction = isBusComponent(target) ? !engineeringPrint : (inboundCounts.get(target.id) || 0) > 1;
      if (sourceNeedsJunction) rememberConnectionJunction(junctions, startPoint, stroke);
      if (targetNeedsJunction) rememberConnectionJunction(junctions, endPoint, stroke);

      const label = documentRef.createElementNS(svgNS, 'text');
      const labelPosition = connectionLabelPosition(points);
      const transformerOutputRole = source.type === 'transformer'
        ? getTransformerPortRole(source, connection.sourcePort)
        : null;
      if (transformerOutputRole === 'secondary' || transformerOutputRole === 'tertiary') {
        labelPosition.x -= 75;
        labelPosition.textAnchor = 'end';
      }
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('fill', stroke);
      let labelText = cable?.tag || cable?.cable_type || '';
      if (!engineeringPrint && showOverlays) {
        const overlays = [];
        if (dataStateOverlayMode === 'faultDuty' && connection.faultKA != null) {
          const faultText = formatOverlayMetric(connection.faultKA, 'kA', 2);
          if (faultText) overlays.push(faultText);
        } else if (dataStateOverlayMode === 'loadFlow') {
          const loadKw = formatOverlayMetric(connection.loading_kW, 'kW', 2);
          if (loadKw) overlays.push(loadKw);
          const loadAmps = formatOverlayMetric(connection.loading_amps, 'A', 1);
          if (loadAmps) overlays.push(loadAmps);
        }
        const provenanceKey = dataStateOverlayMode === 'faultDuty'
          ? 'shortCircuit'
          : dataStateOverlayMode === 'loadFlow'
            ? 'loadFlow'
            : null;
        if (overlays.length && provenanceKey) {
          const provenance = getStudyProvenance(provenanceKey);
          if (provenance.status === 'stale') overlays.push('[stale]');
          if (provenance.status === 'unknown') overlays.push('[freshness unknown]');
        }
        if (overlays.length) labelText += ` ${overlays.join(' / ')}`;
      }
      label.textContent = labelText;
      const resolvedPosition = resolveConnectionLabelPosition(labelPosition, labelText);
      label.setAttribute('x', resolvedPosition.x);
      label.setAttribute('y', resolvedPosition.y);
      label.setAttribute('text-anchor', resolvedPosition.textAnchor);
      label.classList.add('conn-label');
      if (connection.cable?.provisional || connection.reviewStatus === 'assumed') label.classList.add('conn-label-assumed');
      if (filtered) label.classList.add('diagram-filter-dimmed');
      if (cable?.sizing_warning) label.classList.add('sizing-violation');
      if (parseFloat(cable?.voltage_drop_pct) > voltageDropLimit) label.classList.add('voltage-exceed');
      label.style.pointerEvents = 'auto';
      label.style.cursor = 'pointer';
      label.addEventListener('click', event => {
        event.stopPropagation();
        onSelectConnection(source, index);
      });
      label.addEventListener('dblclick', event => {
        event.stopPropagation();
        const cableComponent = isConductorSegmentComponent(source)
          ? source
          : isConductorSegmentComponent(target)
            ? target
            : null;
        if (cableComponent) onEditCableComponent(cableComponent);
      });
      renderSurface.appendChild(label);
    });
  });

  return { junctions, lengthsChanged };
}
