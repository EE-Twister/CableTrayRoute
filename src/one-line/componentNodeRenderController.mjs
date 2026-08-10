export function renderComponentNodes(context) {
  const {
    activeOperatingState,
    appendConnectedTerminalBridges,
    asset,
    attachLabelInteractions,
    buildTransformerPortLabel,
    cancelPendingClickSelection,
    compHeight,
    compWidth,
    componentLabelBounds,
    componentMatchesDiagramFilter,
    components,
    connectMode,
    connectSource,
    datablockLayout,
    dataStateOverlayLabels,
    dataStateOverlayMode,
    documentRef: document,
    engineeringPrint,
    ensureShapeDefaults,
    findHighlightId,
    getComponentAttributeLines,
    getComponentColorInfo,
    getComponentLabelText,
    getComponentOperatingStatus,
    getComponentReviewBadges,
    getFiniteVoltageMagnitudes,
    getLabelAlignment,
    getLabelBaseline,
    getLabelPosition,
    getSheetLinkBadgeText,
    getVoltageMagnitudeEntries,
    getVoltageRange,
    hideTooltip,
    includeComponentBounds,
    includePoint,
    isBusComponent,
    isComponentPositionLocked,
    isConductorSegmentComponent,
    isHiddenByLayer,
    isLockedByLayer,
    moveTooltip,
    navigateToLinkedSheet,
    normalizeLowerChoice,
    normalizePortIndex,
    normalizeRotation,
    normalizeSheetLinkValue,
    operatingStateLabels,
    placeholderIcon,
    portDirection,
    portInUse,
    portPosition,
    renderComponentDatablock,
    renderDataStateBadge,
    renderOperatingStateBadge,
    renderSurface,
    resolveComponentMeta,
    selectComponent,
    selection,
    shapeDashPatterns,
    sheets,
    showOverlays,
    showTooltip,
    startInlineLabelEdit,
    svgNS,
    symbolStandard,
    usedVoltageRanges
  } = context;
  components.filter(c => c.type !== 'dimension').forEach(c => {
    includeComponentBounds(c);
    // Gap #51: skip rendering components on hidden layers
    if (isHiddenByLayer(c)) return;
    const g = document.createElementNS(svgNS, 'g');
    g.dataset.id = c.id;
    g.classList.add('component');
    if (!componentMatchesDiagramFilter(c)) g.classList.add('diagram-filter-dimmed');
    const dataStateInfo = engineeringPrint ? null : getComponentColorInfo(c);
    const operatingStatus = getComponentOperatingStatus(c);
    if (operatingStatus === 'open') g.classList.add('operating-open');
    // Gap #51: suppress pointer events for components on locked layers
    if (isLockedByLayer(c)) {
      g.setAttribute('pointer-events', 'none');
      g.style.opacity = '0.5';
    } else {
      g.setAttribute('pointer-events', 'bounding-box');
    }
    g.addEventListener('dblclick', e => {
      e.stopPropagation();
      cancelPendingClickSelection();
      if (c.type === 'sheet_link') { navigateToLinkedSheet(c); return; }
      selectComponent(c);
    });
    const tooltipParts = [];
    if (c.label) tooltipParts.push(`Label: ${c.label}`);
    if (c.voltage) tooltipParts.push(`Voltage: ${c.voltage}`);
    if (c.rating) tooltipParts.push(`Rating: ${c.rating}`);
    if (dataStateInfo) tooltipParts.push(`${dataStateOverlayLabels[dataStateOverlayMode]}: ${dataStateInfo.label}`);
    if (operatingStatus === 'open') tooltipParts.push(`Operating state: Open in ${operatingStateLabels[activeOperatingState]}`);
    // Gap #48 – Off-page connector tooltip
    if (c.type === 'sheet_link') {
      const badge = getSheetLinkBadgeText(c, sheets);
      if (badge) tooltipParts.push(`Navigate: ${badge} (double-click)`);
      const lid = normalizeSheetLinkValue(c.props?.link_id);
      if (lid) tooltipParts.push(`Link ID: ${lid}`);
    }
    if (tooltipParts.length) g.setAttribute('data-tooltip', tooltipParts.join('\n'));
    g.addEventListener('mouseenter', showTooltip);
    g.addEventListener('mousemove', moveTooltip);
    g.addEventListener('mouseleave', hideTooltip);
    const w = c.width || compWidth;
    const h = c.height || compHeight;
    if (findHighlightId === c.id) {
      const highlight = document.createElementNS(svgNS, 'rect');
      highlight.setAttribute('x', c.x - 6);
      highlight.setAttribute('y', c.y - 6);
      highlight.setAttribute('width', w + 12);
      highlight.setAttribute('height', h + 12);
      highlight.setAttribute('class', 'find-highlight');
      g.appendChild(highlight);
    }
    const cx = c.x + w / 2;
    const cy = c.y + h / 2;
    const voltageMagnitudes = getFiniteVoltageMagnitudes(c.voltage_mag);
    if (!engineeringPrint && showOverlays && dataStateOverlayMode === 'loadFlow' && voltageMagnitudes.length) {
      let dev = 0;
      for (const mag of voltageMagnitudes) {
        const magDev = Math.abs(mag - 1) * 100;
        if (magDev > dev) dev = magDev;
      }
      let color = '#4caf50';
      if (dev > 10) color = '#f44336';
      else if (dev > 5) color = '#ffeb3b';
      const overlay = document.createElementNS(svgNS, 'rect');
      overlay.setAttribute('x', c.x);
      overlay.setAttribute('y', c.y);
      overlay.setAttribute('width', w);
      overlay.setAttribute('height', h);
      overlay.setAttribute('fill', color);
      overlay.setAttribute('opacity', 0.3);
      g.appendChild(overlay);
    }
    const voltageMagnitudeEntries = getVoltageMagnitudeEntries(c.voltage_mag);
    const showLoadFlowValues = dataStateOverlayMode === 'loadFlow' && voltageMagnitudeEntries.length;
    const showFaultDutyValues = dataStateOverlayMode === 'faultDuty' && c.shortCircuit?.threePhaseKA !== undefined;
    if (!engineeringPrint && showOverlays && (showLoadFlowValues || showFaultDutyValues)) {
      const txt = document.createElementNS(svgNS, 'text');
      txt.setAttribute('x', cx);
      txt.setAttribute('y', cy - (h / 2) - 4);
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('class', 'overlay-label');
      const parts = [];
      if (showLoadFlowValues) {
        if (typeof c.voltage_mag === 'object') {
          parts.push(voltageMagnitudeEntries
            .map(([ph, v]) => `${ph}:${v.toFixed(3)} pu`)
            .join(' '));
        } else {
          parts.push(`${voltageMagnitudeEntries[0][1].toFixed(3)} pu`);
        }
      }
      if (showFaultDutyValues) {
        parts.push(`${Number(c.shortCircuit.threePhaseKA).toFixed(2)} kA`);
      }
      txt.textContent = parts.join(' / ');
      g.appendChild(txt);
    }
    const useCompactDataState = dataStateOverlayMode === 'validation' || dataStateOverlayMode === 'review';
    if (dataStateInfo && !useCompactDataState) {
      const dataFill = document.createElementNS(svgNS, 'rect');
      dataFill.setAttribute('x', c.x);
      dataFill.setAttribute('y', c.y);
      dataFill.setAttribute('width', w);
      dataFill.setAttribute('height', h);
      dataFill.setAttribute('fill', dataStateInfo.color);
      dataFill.setAttribute('opacity', '0.14');
      dataFill.classList.add('data-state-fill', `data-state-${dataStateInfo.key}`);
      const title = document.createElementNS(svgNS, 'title');
      title.textContent = dataStateInfo.label;
      dataFill.appendChild(title);
      g.appendChild(dataFill);
    }
    const transforms = [];
    if (c.flipped) transforms.push(`translate(${cx}, ${cy}) scale(-1,1) translate(${-cx}, ${-cy})`);
    if (c.rotation) transforms.push(`rotate(${c.rotation}, ${cx}, ${cy})`);
    if (transforms.length) g.setAttribute('transform', transforms.join(' '));
    const vRange = !engineeringPrint && showOverlays && c.voltage_mag === undefined ? getVoltageRange(c.voltage) : null;
    if (vRange) {
      usedVoltageRanges.add(vRange);
      const bg = document.createElementNS(svgNS, 'rect');
      bg.setAttribute('x', c.x);
      bg.setAttribute('y', c.y);
      bg.setAttribute('width', w);
      bg.setAttribute('height', h);
      bg.setAttribute('fill', vRange.color);
      bg.setAttribute('opacity', 0.3);
      if (c.subtype === 'motor' || c.subtype === 'motor_load' || c.subtype === 'static_load') {
        const rotation = normalizeRotation(Number(c.rotation) || 0);
        const desired = 90;
        const offset = desired - rotation;
        if (offset % 360 !== 0) {
          bg.setAttribute('transform', `rotate(${offset}, ${cx}, ${cy})`);
        }
      }
      g.appendChild(bg);
    }
    const meta = resolveComponentMeta(c);
    if (c.type === 'annotation') {
      if (c.subtype === 'annotation_text_box') {
        const rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', c.x);
        rect.setAttribute('y', c.y);
        rect.setAttribute('width', w);
        rect.setAttribute('height', h);
        rect.setAttribute('fill', '#fff');
        rect.setAttribute('stroke', '#333');
        g.appendChild(rect);
        const txt = document.createElementNS(svgNS, 'text');
        txt.setAttribute('x', c.x + w / 2);
        txt.setAttribute('y', c.y + h / 2 + 5);
        txt.setAttribute('text-anchor', 'middle');
        txt.textContent = c.text || c.label || '';
        txt.addEventListener('dblclick', e => {
          e.stopPropagation();
          cancelPendingClickSelection();
          startInlineLabelEdit(c, { key: 'text', fallbackKey: 'label', fieldLabel: 'Text' });
        });
        g.appendChild(txt);
      } else {
        if (c.subtype === 'annotation_custom_shape') ensureShapeDefaults(c);
        const shapeType = normalizeLowerChoice(
          c.shapeType,
          'rectangle',
          ['rectangle', 'rounded', 'circle'],
          { rounded_rectangle: 'rounded' }
        );
        const strokeStyle = normalizeLowerChoice(c.strokeStyle, 'solid', ['solid', 'dashed', 'dotted']);
        const strokeColor = c.strokeColor || '#333';
        const fillColor = c.fillColor && c.fillColor !== 'none' && c.fillColor !== 'transparent'
          ? c.fillColor
          : 'none';
        const fillOpacity = Number.isFinite(Number(c.fillOpacity))
          ? Math.max(0, Math.min(1, Number(c.fillOpacity)))
          : 1;
        const strokeWidth = Number(c.strokeWidth) || 1;
        const dash = shapeDashPatterns[strokeStyle] || '';
        let shape;
        if (shapeType === 'circle') {
          const ellipse = document.createElementNS(svgNS, 'ellipse');
          ellipse.setAttribute('cx', c.x + w / 2);
          ellipse.setAttribute('cy', c.y + h / 2);
          ellipse.setAttribute('rx', w / 2);
          ellipse.setAttribute('ry', h / 2);
          shape = ellipse;
        } else {
          const rect = document.createElementNS(svgNS, 'rect');
          rect.setAttribute('x', c.x);
          rect.setAttribute('y', c.y);
          rect.setAttribute('width', w);
          rect.setAttribute('height', h);
          if (shapeType === 'rounded' && Number.isFinite(Number(c.cornerRadius))) {
            const radius = Math.max(0, Math.min(Number(c.cornerRadius), Math.min(w, h) / 2));
            rect.setAttribute('rx', radius);
            rect.setAttribute('ry', radius);
          }
          shape = rect;
        }
        shape.setAttribute('fill', fillColor);
        shape.setAttribute('fill-opacity', fillColor === 'none' ? 0 : fillOpacity);
        shape.setAttribute('stroke', strokeColor);
        shape.setAttribute('stroke-width', strokeWidth);
        if (dash) shape.setAttribute('stroke-dasharray', dash);
        if (strokeStyle === 'dotted') {
          shape.setAttribute('stroke-linecap', 'round');
        }
        g.appendChild(shape);
      }
    } else {
      if (isConductorSegmentComponent(c)) {
        const wLocal = c.width || compWidth;
        const hLocal = c.height || compHeight;
        const centerLocal = { x: wLocal / 2, y: hLocal / 2 };
        const ports = c.ports || meta.ports || [];
        ports.forEach(port => {
          if (!port) return;
          let px = port.x;
          let py = port.y;
          if (c.flipped) px = wLocal - px;
          const dx = centerLocal.x - px;
          const dy = centerLocal.y - py;
          const dist = Math.hypot(dx, dy);
          if (!dist) return;
          const leadLength = Math.min(20, dist - 2);
          if (leadLength <= 0) return;
          const innerX = px + (dx * (leadLength / dist));
          const innerY = py + (dy * (leadLength / dist));
          const lead = document.createElementNS(svgNS, 'line');
          lead.setAttribute('x1', c.x + px);
          lead.setAttribute('y1', c.y + py);
          lead.setAttribute('x2', c.x + innerX);
          lead.setAttribute('y2', c.y + innerY);
          lead.classList.add('cable-lead');
          g.appendChild(lead);
        });
      }
      // Gap #37 – IEC 60617 / ANSI-IEEE symbol standard toggle
      const iconHref = (symbolStandard === 'IEC' && meta.iconIEC)
        ? asset(meta.iconIEC)
        : (meta.icon || placeholderIcon);
      const img = document.createElementNS(svgNS, 'image');
      img.setAttribute('x', c.x);
      img.setAttribute('y', c.y);
      img.setAttribute('width', w);
      img.setAttribute('height', h);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', iconHref);
      if (isBusComponent(c)) img.setAttribute('preserveAspectRatio', 'none');
      if (iconHref !== placeholderIcon) {
        img.addEventListener('error', () => {
          console.warn(`Missing icon for subtype ${c.subtype}`);
          img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', placeholderIcon);
        }, { once: true });
      }
      img.addEventListener('dblclick', e => {
        e.stopPropagation();
        cancelPendingClickSelection();
        if (c.type === 'sheet_link') { navigateToLinkedSheet(c); return; }
        selectComponent(c);
      });
      g.appendChild(img);
      appendConnectedTerminalBridges(g, c, meta);
      if (dataStateInfo) {
        if (useCompactDataState) {
          renderDataStateBadge(renderSurface, c, dataStateInfo, dataStateOverlayMode, includePoint);
        } else {
          const outline = document.createElementNS(svgNS, 'rect');
          outline.setAttribute('x', c.x - 1.5);
          outline.setAttribute('y', c.y - 1.5);
          outline.setAttribute('width', w + 3);
          outline.setAttribute('height', h + 3);
          outline.setAttribute('fill', 'none');
          outline.setAttribute('stroke', dataStateInfo.color);
          outline.setAttribute('stroke-width', 1.5);
          outline.setAttribute('opacity', 0.82);
          outline.classList.add('data-state-outline', `data-state-${dataStateInfo.key}`);
          outline.style.pointerEvents = 'none';
          g.appendChild(outline);
        }
      }
      // Gap #48 – Off-page connector sheet badge
      if (c.type === 'sheet_link') {
        const badgeText = getSheetLinkBadgeText(c, sheets);
        if (badgeText) {
          const badge = document.createElementNS(svgNS, 'text');
          badge.setAttribute('x', cx);
          badge.setAttribute('y', c.y + h + 12);
          badge.setAttribute('text-anchor', 'middle');
          badge.setAttribute('font-size', '9');
          badge.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
          badge.setAttribute('fill', '#0055aa');
          badge.setAttribute('class', 'sheet-link-badge');
          badge.style.pointerEvents = 'none';
          badge.textContent = badgeText;
          g.appendChild(badge);
        }
        g.style.cursor = 'pointer';
      }
    }
    if (!engineeringPrint && selection.includes(c)) {
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', c.x - 2);
      rect.setAttribute('y', c.y - 2);
      rect.setAttribute('width', w + 4);
      rect.setAttribute('height', h + 4);
      rect.setAttribute('fill', 'none');
      rect.setAttribute('stroke', '#00f');
      rect.setAttribute('stroke-dasharray', '4 2');
      rect.style.pointerEvents = 'none';
      g.appendChild(rect);
    }
    // Gap #41 – Locked component indicator
    if (!engineeringPrint && (isComponentPositionLocked(c) || c.propertiesLocked)) {
      const lockEl = document.createElementNS(svgNS, 'text');
      lockEl.setAttribute('x', c.x + w - 2);
      lockEl.setAttribute('y', c.y + 12);
      lockEl.setAttribute('text-anchor', 'end');
      lockEl.setAttribute('font-size', '12');
      lockEl.classList.add('locked-indicator');
      lockEl.textContent = '\uD83D\uDD12'; // 🔒
      lockEl.style.pointerEvents = 'none';
      lockEl.style.userSelect = 'none';
      g.appendChild(lockEl);
    }
    // Gap #40 – Group outline for group components
    if (!engineeringPrint) getComponentReviewBadges(c).slice(0, 3).forEach((badgeInfo, badgeIdx) => {
      const badge = document.createElementNS(svgNS, 'g');
      badge.setAttribute('class', `review-badge review-badge-${badgeInfo.className}`);
      const bx = c.x + w - 8 - badgeIdx * 18;
      const by = c.y + 8;
      const circ = document.createElementNS(svgNS, 'circle');
      circ.setAttribute('cx', bx);
      circ.setAttribute('cy', by);
      circ.setAttribute('r', 7);
      const txt = document.createElementNS(svgNS, 'text');
      txt.setAttribute('x', bx);
      txt.setAttribute('y', by + 3);
      txt.setAttribute('text-anchor', 'middle');
      txt.textContent = badgeInfo.text;
      const title = document.createElementNS(svgNS, 'title');
      title.textContent = badgeInfo.label;
      badge.append(title, circ, txt);
      g.appendChild(badge);
    });
    if (c.type === 'group') {
      const outline = document.createElementNS(svgNS, 'rect');
      outline.setAttribute('x', c.x);
      outline.setAttribute('y', c.y);
      outline.setAttribute('width', c.width || w);
      outline.setAttribute('height', c.height || h);
      outline.classList.add('group-outline');
      g.appendChild(outline);
      const glabel = document.createElementNS(svgNS, 'text');
      glabel.setAttribute('x', c.x + 4);
      glabel.setAttribute('y', c.y - 3);
      glabel.classList.add('group-label');
      glabel.textContent = c.label || 'Group';
      g.appendChild(glabel);
    }
    renderSurface.appendChild(g);
    if (!engineeringPrint) renderOperatingStateBadge(renderSurface, c, operatingStatus, includePoint);
    if (!engineeringPrint && c.type === 'annotation' && selection.includes(c)) {
      const handle = document.createElementNS(svgNS, 'rect');
      handle.setAttribute('x', c.x + w - 5);
      handle.setAttribute('y', c.y + h - 5);
      handle.setAttribute('width', 10);
      handle.setAttribute('height', 10);
      handle.setAttribute('fill', '#fff');
      handle.setAttribute('stroke', '#00f');
      handle.setAttribute('stroke-width', '1');
      handle.classList.add('annotation-handle');
      handle.dataset.id = c.id;
      renderSurface.appendChild(handle);
    }
    if (c.type !== 'annotation') {
      const labelPos = getLabelPosition(c);
      const labelText = getComponentLabelText(c, meta);
      const labelEl = document.createElementNS(svgNS, 'text');
      labelEl.classList.add('component-label');
      labelEl.dataset.id = c.id;
      labelEl.setAttribute('x', labelPos.x);
      labelEl.setAttribute('y', labelPos.y);
      labelEl.setAttribute('text-anchor', getLabelAlignment(c));
      labelEl.setAttribute('dominant-baseline', getLabelBaseline(c));
      labelEl.textContent = labelText;
      attachLabelInteractions(labelEl, c);
      renderSurface.appendChild(labelEl);
      const labelBounds = componentLabelBounds(c);
      if (labelBounds) {
        includePoint(labelBounds.left, labelBounds.top);
        includePoint(labelBounds.right, labelBounds.bottom);
      }
      const attrLines = getComponentAttributeLines(c);
      if (attrLines.length) {
        renderComponentDatablock(renderSurface, c, attrLines, includePoint, datablockLayout);
      }
      if (c.type === 'transformer') {
        const ports = c.ports || resolveComponentMeta(c)?.ports || [];
        ports.forEach((_, portIdx) => {
          const labelText = buildTransformerPortLabel(c, portIdx);
          if (!labelText) return;
          const pos = portPosition(c, portIdx);
          if (!pos) return;
          const dir = portDirection(c, portIdx) || 'top';
          let x = pos.x;
          let y = pos.y;
          let anchor = 'middle';
          let baseline = 'middle';
          if (dir === 'left') {
            x -= 6;
            anchor = 'end';
          } else if (dir === 'right') {
            x += 6;
            anchor = 'start';
          } else if (dir === 'bottom') {
            x -= 10;
            y += 10;
            anchor = 'end';
            baseline = 'hanging';
          } else {
            x -= 10;
            y -= 6;
            anchor = 'end';
            baseline = 'baseline';
          }
          const textEl = document.createElementNS(svgNS, 'text');
          textEl.classList.add('transformer-port-label');
          textEl.dataset.componentId = c.id;
          textEl.setAttribute('x', x);
          textEl.setAttribute('y', y);
          textEl.setAttribute('text-anchor', anchor);
          textEl.setAttribute('dominant-baseline', baseline);
          textEl.textContent = labelText;
          renderSurface.appendChild(textEl);
        });
      }
    }
    if (!engineeringPrint && isBusComponent(c) && selection.includes(c)) {
      const handleRight = document.createElementNS(svgNS, 'rect');
      handleRight.setAttribute('x', c.x + c.width - 5);
      handleRight.setAttribute('y', c.y + (c.height / 2) - 5);
      handleRight.setAttribute('width', 10);
      handleRight.setAttribute('height', 10);
      handleRight.classList.add('bus-handle');
      handleRight.dataset.id = c.id;
      handleRight.dataset.side = 'right';
      renderSurface.appendChild(handleRight);
      const handleLeft = document.createElementNS(svgNS, 'rect');
      handleLeft.setAttribute('x', c.x - 5);
      handleLeft.setAttribute('y', c.y + (c.height / 2) - 5);
      handleLeft.setAttribute('width', 10);
      handleLeft.setAttribute('height', 10);
      handleLeft.classList.add('bus-handle');
      handleLeft.dataset.id = c.id;
      handleLeft.dataset.side = 'left';
      renderSurface.appendChild(handleLeft);
    }
      if (!engineeringPrint && connectMode) {
        (c.ports || meta.ports || []).forEach((p, idx) => {
          const pos = portPosition(c, idx);
          const circ = document.createElementNS(svgNS, 'circle');
          circ.setAttribute('cx', pos.x);
          circ.setAttribute('cy', pos.y);
          circ.setAttribute('r', 8);
          circ.classList.add('port');
          if (connectSource?.component === c && normalizePortIndex(connectSource.port) === idx) {
            circ.classList.add('port-active');
          }
          if (portInUse(c, idx)) {
            circ.classList.add('port-used');
          }
          circ.dataset.id = c.id;
          circ.dataset.port = idx;
          renderSurface.appendChild(circ);
        });
      }
  });


}
