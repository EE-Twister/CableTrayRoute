const POTENTIAL_THRESHOLD_MV = -850;
const DISTRIBUTION_PASS_MIN = 0.75;

function toSeriesRows(profileData = {}, scenarioKey = 'base') {
  return {
    potential: Array.isArray(profileData?.scenarios?.[scenarioKey]?.potential) ? profileData.scenarios[scenarioKey].potential : [],
    currentDemand: Array.isArray(profileData?.scenarios?.[scenarioKey]?.currentDemand) ? profileData.scenarios[scenarioKey].currentDemand : [],
    attenuation: Array.isArray(profileData?.attenuation) ? profileData.attenuation : []
  };
}

function extent(values = []) {
  if (!values.length) return { min: 0, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (Math.abs(max - min) < 1e-9) {
    return { min: min - 1, max: max + 1 };
  }
  const pad = (max - min) * 0.08;
  return { min: min - pad, max: max + pad };
}

function passClass(metric, value, currentDemandLimitA) {
  if (metric === 'potential') {
    return value <= POTENTIAL_THRESHOLD_MV ? 'pass' : 'fail';
  }
  if (metric === 'currentDemand') {
    return value <= currentDemandLimitA ? 'pass' : 'fail';
  }
  return value >= DISTRIBUTION_PASS_MIN ? 'pass' : 'fail';
}

function drawBand({ y, h, className }) {
  return `<rect x="0" y="${y}" width="100%" height="${h}" class="${className}"></rect>`;
}


function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function initCpProfiles({
  root,
  profileData,
  unitSystem = 'imperial',
  onSegmentHover = null
} = {}) {
  if (!root || !profileData) {
    return null;
  }

  const state = {
    toggles: {
      base: true,
      conservative: true,
      optimized: true
    },
    hoveredSegmentIndex: null,
    externalHoveredSegmentIndex: null
  };
  const useMetricUnits = unitSystem === 'metric';
  const distanceUnit = useMetricUnits ? 'm' : 'ft';
  const displayDistance = (distanceM) => useMetricUnits ? distanceM : distanceM / 0.3048;
  const currentDemandLimitA = Number(profileData?.thresholdBands?.currentDemandA?.passWhenLessThanOrEqual) || 1;

  function activeHoverIndex() {
    return Number.isInteger(state.externalHoveredSegmentIndex)
      ? state.externalHoveredSegmentIndex
      : state.hoveredSegmentIndex;
  }

  function emitHover(segmentIndex) {
    if (typeof onSegmentHover === 'function') {
      onSegmentHover(segmentIndex);
    }
  }

  function renderScenarioToggles() {
    const labels = [
      ['base', 'Base'],
      ['conservative', 'Conservative'],
      ['optimized', 'Optimized']
    ];
    return labels.map(([key, label]) => `
      <label class="cp-profile-toggle">
        <input type="checkbox" data-profile-toggle="${key}" ${state.toggles[key] ? 'checked' : ''}>
        <span class="cp-profile-swatch cp-profile-swatch--${key}" aria-hidden="true"></span>
        ${label}
      </label>
    `).join('');
  }

  function renderMiniChart({ title, metric, rowsByScenario, yFormatter, thresholdValue, thresholdLabel, passDirection }) {
    const width = 920;
    const height = 180;
    const padding = { left: 64, right: 28, top: 30, bottom: 28 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const allRows = Object.values(rowsByScenario).flat();
    const distances = allRows.map((row) => displayDistance(toFiniteNumber(row?.distanceM)));
    const values = [
      ...allRows.map((row) => toFiniteNumber(row?.value)),
      ...(Number.isFinite(thresholdValue) ? [thresholdValue] : [])
    ];
    const distanceMax = Math.max(...distances, 1);
    const yDomain = extent(values);

    const x = (distance) => padding.left + (distance / distanceMax) * innerWidth;
    const y = (value) => padding.top + ((yDomain.max - value) / (yDomain.max - yDomain.min)) * innerHeight;

    const chartContent = [];
    if (Number.isFinite(thresholdValue)) {
      const thresholdY = y(thresholdValue);
      const upperBandClass = passDirection === 'greater' ? 'cp-band-pass' : 'cp-band-fail';
      const lowerBandClass = passDirection === 'greater' ? 'cp-band-fail' : 'cp-band-pass';
      chartContent.push(drawBand({ y: padding.top, h: Math.max(0, thresholdY - padding.top), className: upperBandClass }));
      chartContent.push(drawBand({ y: thresholdY, h: Math.max(0, padding.top + innerHeight - thresholdY), className: lowerBandClass }));
      chartContent.push(`<line x1="${padding.left}" x2="${padding.left + innerWidth}" y1="${thresholdY}" y2="${thresholdY}" class="cp-threshold-line"></line>`);
      chartContent.push(`<text x="${padding.left + 8}" y="${Math.max(padding.top + 12, thresholdY - 6)}" class="cp-threshold-label">${thresholdLabel}</text>`);
    }

    const scenarioKeys = Object.keys(rowsByScenario);
    scenarioKeys.forEach((scenarioKey) => {
      const rows = rowsByScenario[scenarioKey];
      if (!state.toggles[scenarioKey] || !rows.length) {
        return;
      }
      const points = rows
        .map((row) => {
          const distance = displayDistance(toFiniteNumber(row?.distanceM));
          const value = toFiniteNumber(row?.value);
          return `${x(distance)},${y(value)}`;
        })
        .join(' ');
      chartContent.push(`<polyline points="${points}" class="cp-profile-line cp-profile-line--${scenarioKey}"></polyline>`);
      rows.forEach((row, index) => {
        const distance = displayDistance(toFiniteNumber(row?.distanceM));
        const value = toFiniteNumber(row?.value);
        const passMetricValue = toFiniteNumber(row?.passMetricValue, value);
        const pointStatus = passClass(metric, passMetricValue, currentDemandLimitA);
        if (pointStatus === 'fail') {
          const pointX = x(distance);
          const pointY = y(value);
          chartContent.push(`<polygon points="${pointX},${pointY - 6} ${pointX + 6},${pointY} ${pointX},${pointY + 6} ${pointX - 6},${pointY}" class="cp-profile-point cp-profile-point--fail" data-segment-index="${index}" data-distance="${distance}"></polygon>`);
        } else {
          chartContent.push(`<circle cx="${x(distance)}" cy="${y(value)}" r="4.5" class="cp-profile-point cp-profile-point--pass" data-segment-index="${index}" data-distance="${distance}"></circle>`);
        }
      });
    });

    const hoverIndex = activeHoverIndex();
    if (Number.isInteger(hoverIndex) && hoverIndex >= 0) {
      const hoverRows = rowsByScenario.base || [];
      const target = hoverRows[hoverIndex] || hoverRows[hoverRows.length - 1];
      if (target) {
        const crosshairX = x(displayDistance(toFiniteNumber(target?.distanceM)));
        chartContent.push(`<line x1="${crosshairX}" y1="${padding.top}" x2="${crosshairX}" y2="${padding.top + innerHeight}" class="cp-crosshair"></line>`);
      }
    }

    const tableRows = Object.entries(rowsByScenario)
      .filter(([scenarioKey]) => state.toggles[scenarioKey])
      .flatMap(([scenarioKey, rows]) => rows.map((row, index) => {
        const value = toFiniteNumber(row?.value);
        const passMetricValue = toFiniteNumber(row?.passMetricValue, value);
        return `
          <tr>
            <td>${scenarioKey}</td>
            <td>${index + 1}</td>
            <td>${displayDistance(toFiniteNumber(row?.distanceM)).toFixed(2)} ${distanceUnit}</td>
            <td>${yFormatter(value)}</td>
            <td>${passClass(metric, passMetricValue, currentDemandLimitA) === 'pass' ? 'Within threshold' : 'Outside threshold'}</td>
          </tr>`;
      }))
      .join('');
    const metricId = `cp-profile-${metric}`;
    const visibleScenarioCount = Object.keys(rowsByScenario).filter((key) => state.toggles[key]).length;
    const pointCount = Object.entries(rowsByScenario)
      .filter(([key]) => state.toggles[key])
      .reduce((sum, [, rows]) => sum + rows.length, 0);

    return `
      <article class="cp-profile-chart" data-metric="${metric}">
        <h4>${title}</h4>
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${metricId}-title ${metricId}-desc">
          <title id="${metricId}-title">${title}</title>
          <desc id="${metricId}-desc">${visibleScenarioCount} visible scenarios and ${pointCount} plotted points. The labeled threshold separates within-threshold from outside-threshold values; diamond markers identify failures.</desc>
          <rect x="${padding.left}" y="${padding.top}" width="${innerWidth}" height="${innerHeight}" class="cp-plot-frame"></rect>
          ${chartContent.join('')}
          <text x="${padding.left - 10}" y="${padding.top + 4}" text-anchor="end" class="cp-axis-label">${yFormatter(yDomain.max)}</text>
          <text x="${padding.left - 10}" y="${padding.top + innerHeight}" text-anchor="end" class="cp-axis-label">${yFormatter(yDomain.min)}</text>
          <text x="${padding.left + innerWidth}" y="${height - 6}" text-anchor="end" class="cp-axis-label">Distance (${distanceUnit})</text>
        </svg>
        <details class="cp-profile-data">
          <summary>View accessible chart data</summary>
          <div class="table-wrap">
            <table class="data-table">
              <caption>${title} data</caption>
              <thead><tr><th>Scenario</th><th>Segment</th><th>Distance</th><th>Value</th><th>Threshold result</th></tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </details>
      </article>
    `;
  }

  function render() {
    const scenarioRows = {
      base: toSeriesRows(profileData, 'base'),
      conservative: toSeriesRows(profileData, 'conservative'),
      optimized: toSeriesRows(profileData, 'optimized')
    };
    root.innerHTML = `
      <div class="cp-profile-header">
        <h3>CP Profiles</h3>
        <div class="cp-profile-toggle-row">${renderScenarioToggles()}</div>
      </div>
      <div class="cp-profile-grid">
        ${renderMiniChart({
    title: 'Potential vs Distance',
    metric: 'potential',
    rowsByScenario: {
      base: scenarioRows.base.potential,
      conservative: scenarioRows.conservative.potential,
      optimized: scenarioRows.optimized.potential
    },
    yFormatter: (value) => `${Math.round(value)} mV`,
    thresholdValue: POTENTIAL_THRESHOLD_MV,
    thresholdLabel: 'Pass at or below −850 mV',
    passDirection: 'less'
  })}
        ${renderMiniChart({
    title: 'Current Demand vs Distance',
    metric: 'currentDemand',
    rowsByScenario: {
      base: scenarioRows.base.currentDemand,
      conservative: scenarioRows.conservative.currentDemand,
      optimized: scenarioRows.optimized.currentDemand
    },
    yFormatter: (value) => `${value.toFixed(2)} A`,
    thresholdValue: currentDemandLimitA,
    thresholdLabel: `Base demand limit ${currentDemandLimitA.toFixed(2)} A`,
    passDirection: 'less'
  })}
        ${renderMiniChart({
    title: 'Attenuation / Distribution Factor vs Distance',
    metric: 'attenuation',
    rowsByScenario: {
      base: scenarioRows.base.attenuation,
      conservative: scenarioRows.conservative.attenuation,
      optimized: scenarioRows.optimized.attenuation
    },
    yFormatter: (value) => value.toFixed(2),
    thresholdValue: DISTRIBUTION_PASS_MIN,
    thresholdLabel: 'Pass at or above 0.75',
    passDirection: 'greater'
  })}
      </div>
    `;
  }

  root.addEventListener('change', (event) => {
    const toggle = event.target.closest('[data-profile-toggle]');
    if (!toggle) {
      return;
    }
    state.toggles[toggle.dataset.profileToggle] = toggle.checked;
    render();
  });

  root.addEventListener('mousemove', (event) => {
    const point = event.target.closest('[data-segment-index]');
    const nextIndex = point ? Number.parseInt(point.dataset.segmentIndex || '-1', 10) : null;
    const normalizedIndex = Number.isInteger(nextIndex) && nextIndex >= 0 ? nextIndex : null;
    if (state.hoveredSegmentIndex === normalizedIndex) {
      return;
    }
    state.hoveredSegmentIndex = normalizedIndex;
    emitHover(normalizedIndex);
    render();
  });

  root.addEventListener('mouseleave', () => {
    if (state.hoveredSegmentIndex === null) {
      return;
    }
    state.hoveredSegmentIndex = null;
    emitHover(null);
    render();
  });

  render();

  return {
    setExternalHoverSegment: (segmentIndex) => {
      const normalizedIndex = Number.isInteger(segmentIndex) && segmentIndex >= 0 ? segmentIndex : null;
      if (state.externalHoveredSegmentIndex === normalizedIndex) {
        return;
      }
      state.externalHoveredSegmentIndex = normalizedIndex;
      render();
    }
  };
}
