function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(value, digits, fallback = '') {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : fallback;
}

function formatVoltage(volts) {
  if (!Number.isFinite(volts)) return '';
  if (Math.abs(volts) >= 1000) return `${(volts / 1000).toFixed(3)} kV`;
  return `${volts.toFixed(1)} V`;
}

function formatPhases(phases) {
  if (!phases) return '';
  if (Array.isArray(phases)) return phases.join(', ');
  return String(phases);
}

function extractSummaryEntries(summary) {
  if (!summary || typeof summary !== 'object') return [];
  const hasSystemTotals = 'totalLoadKW' in summary
    || 'totalGenKW' in summary
    || 'totalLossKW' in summary
    || 'totalLossKVAR' in summary
    || Array.isArray(summary.branchConnections);
  if (hasSystemTotals) {
    return [{ label: 'System', data: summary }];
  }
  return Object.entries(summary).map(([label, data]) => ({
    label: label.toUpperCase(),
    data
  }));
}

function buildSummaryList(summary) {
  const entries = extractSummaryEntries(summary);
  if (!entries.length) return '';
  let html = '<ul class="study-summary">';
  entries.forEach(({ label, data }) => {
    const loadKw = formatNumber(data.totalLoadKW, 1, '0.0');
    const loadKvar = formatNumber(data.totalLoadKVAR, 1, '0.0');
    const genKw = formatNumber(data.totalGenKW, 1, '0.0');
    const genKvar = formatNumber(data.totalGenKVAR, 1, '0.0');
    const lossKw = formatNumber(data.totalLossKW, 2, '0.00');
    const lossKvar = formatNumber(data.totalLossKVAR, 2, '0.00');
    html += `<li><strong>${escapeHtml(label)}</strong>: Load ${loadKw} kW / ${loadKvar} kvar, Generation ${genKw} kW / ${genKvar} kvar, Loss ${lossKw} kW / ${lossKvar} kvar</li>`;
  });
  html += '</ul>';
  return html;
}

function buildBranchConnectionsSection(summary) {
  const entries = Array.isArray(summary?.branchConnections) ? summary.branchConnections : [];
  if (!entries.length) return '';
  let html = '<h3>Branch Device Connections</h3>';
  html += '<div class="study-branch-connections">';
  const grouped = new Map();
  entries.forEach(entry => {
    const type = entry.componentType || entry.componentSubtype || '';
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type).push(entry);
  });
  grouped.forEach((items, type) => {
    const label = type ? type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Branch Devices';
    html += `<h4>${escapeHtml(label)}</h4>`;
    html += '<table><thead><tr><th>Device</th><th>ID</th><th>Type</th><th>From</th><th>To</th><th>Phase</th><th>Rating</th></tr></thead><tbody>';
    items.forEach(conn => {
      const primaryName = conn.componentName || conn.componentLabel || '';
      const secondaryLabel = conn.componentLabel && conn.componentLabel !== primaryName ? conn.componentLabel : '';
      const refLabel = conn.componentRef ? `Ref ${conn.componentRef}` : '';
      let deviceCell = primaryName ? escapeHtml(primaryName) : '';
      if (secondaryLabel) deviceCell += (deviceCell ? '<br>' : '') + escapeHtml(secondaryLabel);
      if (refLabel) deviceCell += (deviceCell ? '<br>' : '') + escapeHtml(refLabel);
      const typeText = conn.componentSubtype ? `${conn.componentType || ''} / ${conn.componentSubtype}` : conn.componentType || '';
      let ratingText = '';
      if (Number.isFinite(conn.rating)) {
        const digits = Math.abs(conn.rating) >= 1000 ? 0 : 1;
        ratingText = formatNumber(conn.rating, digits, '');
      }
      html += '<tr>'
        + `<td>${deviceCell || ''}</td>`
        + `<td>${escapeHtml(conn.componentId || '')}</td>`
        + `<td>${escapeHtml(typeText)}</td>`
        + `<td>${escapeHtml(conn.fromBus || '')}</td>`
        + `<td>${escapeHtml(conn.toBus || '')}</td>`
        + `<td>${escapeHtml(formatPhases(conn.phases))}</td>`
        + `<td>${escapeHtml(ratingText)}</td>`
        + '</tr>';
    });
    html += '</tbody></table>';
  });
  html += '</div>';
  return html;
}

function getBusLabelFromEntry(bus) {
  if (!bus || typeof bus !== 'object') return '';
  const candidates = [bus.displayLabel, bus.label, bus.name, bus.ref, bus.id];
  for (const value of candidates) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return '';
}

function buildBusLabelMap(buses) {
  const map = new Map();
  buses.forEach(bus => {
    if (bus && bus.id) {
      map.set(bus.id, getBusLabelFromEntry(bus));
    }
  });
  return map;
}

function resolveBusLabel(id, fallback, map) {
  if (typeof fallback === 'string' && fallback.trim()) return fallback.trim();
  if (!id) return '';
  const mapped = map.get(id);
  if (typeof mapped === 'string' && mapped.trim()) return mapped.trim();
  return id;
}

export function renderLoadFlowResultsHtml(res) {
  const buses = Array.isArray(res?.buses)
    ? res.buses
    : Array.isArray(res)
      ? res
      : [];
  const lines = Array.isArray(res?.lines) ? res.lines : [];
  const sources = Array.isArray(res?.sources) ? res.sources : [];
  const warnings = Array.isArray(res?.warnings) ? res.warnings.filter(Boolean) : [];
  const converged = res?.converged !== false;
  const busLabelMap = buildBusLabelMap(buses);
  let html = '';

  if (!converged) {
    const mismatch = formatNumber(res?.maxMismatch, 4, '—');
    const mismatchKw = formatNumber(res?.maxMismatchKW, 1, '—');
    html += `<p class="study-warning">Load flow did not converge. Max mismatch ${mismatch} pu (${mismatchKw} kW).</p>`;
  }
  if (warnings.length) {
    html += '<ul class="study-warning-list">';
    warnings.forEach(msg => { html += `<li>${escapeHtml(msg)}</li>`; });
    html += '</ul>';
  }

  html += buildSummaryList(res?.summary);
  html += buildBranchConnectionsSection(res?.summary);

  if (buses.length) {
    html += '<h3>Bus Voltages</h3>';
    html += '<table><thead><tr><th>Bus</th><th>Type</th><th>Phase</th><th>Vm (pu)</th><th>Voltage</th><th>Angle (deg)</th><th>Load (kW)</th><th>Generation (kW)</th></tr></thead><tbody>';
    buses.forEach(bus => {
      const volts = Number.isFinite(bus.voltageV)
        ? formatVoltage(bus.voltageV)
        : Number.isFinite(bus.voltageKV)
          ? `${formatNumber(bus.voltageKV, 3)} kV`
          : '';
      const busLabel = resolveBusLabel(bus.id, bus.displayLabel, busLabelMap);
      html += '<tr>'
        + `<td>${escapeHtml(busLabel)}</td>`
        + `<td>${escapeHtml(bus.type || '')}</td>`
        + `<td>${escapeHtml(bus.phase || '')}</td>`
        + `<td>${formatNumber(bus.Vm, 4, '—')}</td>`
        + `<td>${volts}</td>`
        + `<td>${formatNumber(bus.Va, 2, '—')}</td>`
        + `<td>${formatNumber(bus.Pd, 1, '0.0')}</td>`
        + `<td>${formatNumber(bus.Pg, 1, '0.0')}</td>`
        + '</tr>';
    });
    html += '</tbody></table>';
  }

  if (lines.length) {
    html += '<h3>Line Flows</h3>';
    html += '<table><thead><tr><th>From</th><th>To</th><th>Phase</th><th>P (kW)</th><th>Q (kvar)</th><th>I (A)</th><th>From (kV)</th><th>To (kV)</th><th>ΔV (%)</th></tr></thead><tbody>';
    lines.forEach(line => {
      const amps = Number.isFinite(line.amps)
        ? line.amps
        : Number.isFinite(line.currentKA)
          ? line.currentKA * 1000
          : null;
      const fromLabel = resolveBusLabel(line.from, line.fromLabel, busLabelMap);
      const toLabel = resolveBusLabel(line.to, line.toLabel, busLabelMap);
      html += '<tr>'
        + `<td>${escapeHtml(fromLabel)}</td>`
        + `<td>${escapeHtml(toLabel)}</td>`
        + `<td>${escapeHtml(line.phase || '')}</td>`
        + `<td>${formatNumber(line.P, 2, '0.00')}</td>`
        + `<td>${formatNumber(line.Q, 2, '0.00')}</td>`
        + `<td>${amps !== null ? formatNumber(amps, 1, '0.0') : ''}</td>`
        + `<td>${formatNumber(line.fromKV, 3, '')}</td>`
        + `<td>${formatNumber(line.toKV, 3, '')}</td>`
        + `<td>${formatNumber(line.dropPct, 2, '')}</td>`
        + '</tr>';
    });
    html += '</tbody></table>';
    if (res?.losses) {
      if (Number.isFinite(res.losses?.P)) {
        html += `<p>Total Losses: ${formatNumber(res.losses.P, 2, '0.00')} kW / ${formatNumber(res.losses.Q, 2, '0.00')} kvar</p>`;
      } else {
        const entries = Object.entries(res.losses)
          .map(([ph, loss]) => `${escapeHtml(ph)}: ${formatNumber(loss?.P, 2, '0.00')} kW / ${formatNumber(loss?.Q, 2, '0.00')} kvar`)
          .join(', ');
        html += `<p>Total Losses: ${entries}</p>`;
      }
    }
  }

  if (sources.length) {
    html += '<h3>Sources</h3>';
    html += '<table><thead><tr><th>Bus</th><th>Type</th><th>Phase</th><th>P (kW)</th><th>Q (kvar)</th><th>Voltage</th><th>Angle (deg)</th></tr></thead><tbody>';
    sources.forEach(src => {
      const volts = Number.isFinite(src.voltageV)
        ? formatVoltage(src.voltageV)
        : Number.isFinite(src.voltageKV)
          ? `${formatNumber(src.voltageKV, 3)} kV`
          : '';
      const srcLabel = resolveBusLabel(src.id, src.displayLabel, busLabelMap);
      html += '<tr>'
        + `<td>${escapeHtml(srcLabel)}</td>`
        + `<td>${escapeHtml(src.type || '')}</td>`
        + `<td>${escapeHtml(src.phase || '')}</td>`
        + `<td>${formatNumber(src.Pg, 1, '0.0')}</td>`
        + `<td>${formatNumber(src.Qg, 1, '0.0')}</td>`
        + `<td>${volts}</td>`
        + `<td>${formatNumber(src.Va, 2, '—')}</td>`
        + '</tr>';
    });
    html += '</tbody></table>';
  }

  return html || '<p>No load flow results.</p>';
}

export { escapeHtml, formatNumber, formatVoltage, formatPhases, buildSummaryList, buildBranchConnectionsSection };
