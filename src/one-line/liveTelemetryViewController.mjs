export function formatLiveTrendNumber(value) {
  if (!Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function createLiveTelemetryViewController({
  documentRef,
  svgNS,
  openModal,
  getRunning,
  getConfig,
  getValues,
  getAlarms,
  getComponents,
  getComponentLabel,
  getTrendSeries,
  getTrendMetrics,
  summarizeTrend,
  exportTrendCsv,
  BlobCtor,
  URLRef,
  setTimeoutFn
}) {
  let refreshTrendModal = null;

  const createTrendChart = (componentId, metric) => {
    const panel = documentRef.createElement('section');
    panel.className = 'live-trend-panel';
    panel.setAttribute('aria-live', 'polite');
    const series = getTrendSeries(getValues()[componentId], metric);
    const summary = summarizeTrend(series);
    if (!summary) {
      const empty = documentRef.createElement('p');
      empty.className = 'live-trend-empty';
      empty.textContent = 'No numeric readings have been received for this metric in the last 24 hours.';
      panel.appendChild(empty);
      return panel;
    }
    const heading = documentRef.createElement('p');
    heading.className = 'live-trend-caption';
    heading.textContent = `${metric} · ${summary.count} reading${summary.count === 1 ? '' : 's'} in the last 24 hours`;
    const svg = documentRef.createElementNS(svgNS, 'svg');
    svg.classList.add('live-trend-chart');
    svg.setAttribute('viewBox', '0 0 640 220');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `24-hour ${metric} trend for ${componentId}. Minimum ${formatLiveTrendNumber(summary.minimum)}, average ${formatLiveTrendNumber(summary.average)}, maximum ${formatLiveTrendNumber(summary.maximum)}.`);
    const title = documentRef.createElementNS(svgNS, 'title');
    title.textContent = `24-hour ${metric} trend`;
    const padding = { left: 62, right: 18, top: 18, bottom: 36 };
    const width = 640 - padding.left - padding.right;
    const height = 220 - padding.top - padding.bottom;
    const values = series.map(point => point.value);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const range = maximum - minimum || Math.max(Math.abs(maximum) * 0.1, 1);
    const end = Date.now();
    const start = end - 24 * 60 * 60 * 1000;
    const points = series.map(point => {
      const x = padding.left + Math.min(1, Math.max(0, (point.timestamp - start) / (end - start))) * width;
      const y = padding.top + (1 - (point.value - minimum) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const axis = documentRef.createElementNS(svgNS, 'line');
    axis.setAttribute('x1', padding.left);
    axis.setAttribute('x2', 640 - padding.right);
    axis.setAttribute('y1', padding.top + height);
    axis.setAttribute('y2', padding.top + height);
    axis.classList.add('live-trend-axis');
    const line = documentRef.createElementNS(svgNS, 'polyline');
    line.setAttribute('points', points.join(' '));
    line.setAttribute('fill', 'none');
    line.classList.add('live-trend-line');
    const createLabel = (text, x, y, anchor = '') => {
      const label = documentRef.createElementNS(svgNS, 'text');
      label.setAttribute('x', x);
      label.setAttribute('y', y);
      if (anchor) label.setAttribute('text-anchor', anchor);
      label.textContent = text;
      label.classList.add('live-trend-label');
      return label;
    };
    svg.append(
      title,
      axis,
      line,
      createLabel(formatLiveTrendNumber(maximum), 4, padding.top + 4),
      createLabel(formatLiveTrendNumber(minimum), 4, padding.top + height),
      createLabel('24 h ago', padding.left, 214),
      createLabel('Now', 640 - padding.right, 214, 'end')
    );
    const summaryList = documentRef.createElement('dl');
    summaryList.className = 'live-trend-summary';
    [['Latest', summary.latest], ['Minimum', summary.minimum], ['Average', summary.average], ['Maximum', summary.maximum]].forEach(([label, value]) => {
      const term = documentRef.createElement('dt');
      term.textContent = label;
      const definition = documentRef.createElement('dd');
      definition.textContent = formatLiveTrendNumber(value);
      summaryList.append(term, definition);
    });
    panel.append(heading, svg, summaryList);
    return panel;
  };

  const downloadTrendCsv = (componentId, metric) => {
    const series = getTrendSeries(getValues()[componentId], metric);
    if (!series.length) return false;
    const safePart = value => String(value || 'telemetry').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'telemetry';
    const blob = new BlobCtor([exportTrendCsv(series, metric)], { type: 'text/csv;charset=utf-8' });
    const url = URLRef.createObjectURL(blob);
    const link = documentRef.createElement('a');
    link.href = url;
    link.download = `${safePart(componentId)}-${safePart(metric)}-24h-live-trend.csv`;
    documentRef.body.appendChild(link);
    link.click();
    link.remove();
    setTimeoutFn(() => URLRef.revokeObjectURL(url), 0);
    return true;
  };

  const openTrendModal = (initialComponentId = '') => {
    const mappedComponents = getConfig().mappings.map(mapping => ({
      id: mapping.componentId,
      label: getComponentLabel(getComponents().find(component => component.id === mapping.componentId) || { id: mapping.componentId })
    }));
    let refresh = null;
    const modal = openModal({
      title: '24-hour Live Trend',
      description: 'In-session, read-only telemetry history. This view does not replace a site historian.',
      primaryText: 'Close',
      secondaryText: null,
      onSubmit: () => true,
      render(body) {
        const controls = documentRef.createElement('div');
        controls.className = 'live-trend-controls';
        const componentLabel = documentRef.createElement('label');
        componentLabel.textContent = 'Tagged component';
        const componentSelect = documentRef.createElement('select');
        componentSelect.name = 'trend-component';
        mappedComponents.forEach(component => {
          const option = documentRef.createElement('option');
          option.value = component.id;
          option.textContent = component.label || component.id;
          componentSelect.appendChild(option);
        });
        componentSelect.value = mappedComponents.some(component => component.id === initialComponentId) ? initialComponentId : mappedComponents[0]?.id || '';
        componentSelect.disabled = !mappedComponents.length;
        componentLabel.appendChild(componentSelect);
        const metricLabel = documentRef.createElement('label');
        metricLabel.textContent = 'Metric';
        const metricSelect = documentRef.createElement('select');
        metricSelect.name = 'trend-metric';
        metricLabel.appendChild(metricSelect);
        const chartHost = documentRef.createElement('div');
        chartHost.className = 'live-trend-host';
        const exportButton = documentRef.createElement('button');
        exportButton.type = 'button';
        exportButton.className = 'btn';
        exportButton.textContent = 'Export 24-hour CSV';
        const populateMetrics = () => {
          const currentMetric = metricSelect.value;
          const metrics = getTrendMetrics(getValues()[componentSelect.value]);
          metricSelect.replaceChildren();
          metrics.forEach(metric => {
            const option = documentRef.createElement('option');
            option.value = metric;
            option.textContent = metric;
            metricSelect.appendChild(option);
          });
          metricSelect.disabled = !metrics.length;
          metricSelect.value = metrics.includes(currentMetric) ? currentMetric : (metrics.includes('kw') ? 'kw' : metrics[0] || '');
        };
        refresh = () => {
          populateMetrics();
          chartHost.replaceChildren(createTrendChart(componentSelect.value, metricSelect.value));
          exportButton.disabled = !getTrendSeries(getValues()[componentSelect.value], metricSelect.value).length;
        };
        componentSelect.addEventListener('change', refresh);
        metricSelect.addEventListener('change', refresh);
        exportButton.addEventListener('click', () => downloadTrendCsv(componentSelect.value, metricSelect.value));
        controls.append(componentLabel, metricLabel);
        body.append(controls, chartHost, exportButton);
        refresh();
        return componentSelect;
      }
    });
    refreshTrendModal = refresh;
    modal.finally(() => {
      if (refreshTrendModal === refresh) refreshTrendModal = null;
    });
  };

  const openAlarmModal = () => {
    const alarms = getAlarms();
    openModal({
      title: 'Active Live Alarms',
      description: 'Read-only threshold alerts evaluated from the latest mapped telemetry values. They do not alter the design model, studies, or site controls.',
      primaryText: 'Close',
      secondaryText: null,
      render(body) {
        const message = documentRef.createElement(getRunning() && alarms.length ? 'ul' : 'p');
        if (!getRunning()) {
          message.textContent = 'Start live mode to evaluate alarm limits.';
        } else if (!alarms.length) {
          message.textContent = 'No configured alarm limits are active.';
        } else {
          message.className = 'live-alarm-list';
          alarms.forEach(alarm => {
            const item = documentRef.createElement('li');
            item.textContent = alarm.message;
            message.appendChild(item);
          });
        }
        body.appendChild(message);
        return message;
      }
    });
  };

  return {
    createTrendChart,
    downloadTrendCsv,
    openAlarmModal,
    openTrendModal,
    refreshTrend() {
      refreshTrendModal?.();
    },
    updateControl() {
      const button = documentRef.getElementById('live-telemetry-btn');
      if (!button) return;
      const alarms = getRunning() ? getAlarms() : [];
      button.dataset.alarmCount = String(alarms.length);
      button.title = alarms.length
        ? `${alarms.length} active live alarm${alarms.length === 1 ? '' : 's'}`
        : 'Configure read-only live telemetry';
    }
  };
}
