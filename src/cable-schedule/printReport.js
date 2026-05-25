// Pure DOM renderer for the Cable Schedule print/preview report.
// Extracted from cableschedule.js so the HTML structure can be unit-tested
// and reused outside the initCableSchedule closure.

function defaultFormatValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  return value == null ? '' : value;
}

function defaultFormatDateTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

/**
 * Render the Cable Schedule print report into `host`.
 *
 * @param {HTMLElement} host - Container element. Will be cleared.
 * @param {object} options
 * @param {Array<{ key: string, label: string }>} options.columns
 * @param {Array<object>} options.rows
 * @param {string} options.modeLabel - Human-readable label for the report mode.
 * @param {Date|string|number} [options.generatedAt] - Generation timestamp; defaults to now.
 * @param {(value: any) => string} [options.formatValue]
 * @param {(value: any) => string} [options.formatDateTime]
 * @param {string} [options.emptyMessage]
 */
export function renderCablePrintReport(host, options = {}) {
  if (!host) return;
  const {
    columns = [],
    rows = [],
    modeLabel = '',
    generatedAt = new Date(),
    formatValue = defaultFormatValue,
    formatDateTime = defaultFormatDateTime,
    emptyMessage = 'No cable rows match this report.'
  } = options;

  host.innerHTML = '';
  host.removeAttribute('aria-hidden');

  const meta = document.createElement('div');
  meta.className = 'print-report-meta';
  const title = document.createElement('strong');
  title.textContent = `Cable Schedule - ${modeLabel}`;
  const generated = document.createElement('span');
  generated.textContent = `Generated ${formatDateTime(generatedAt)}`;
  meta.append(title, generated);

  const tableEl = document.createElement('table');
  tableEl.className = 'cable-print-table';
  const thead = tableEl.createTHead();
  const header = thead.insertRow();
  columns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col.label;
    header.appendChild(th);
  });

  const tbody = tableEl.createTBody();
  rows.forEach(row => {
    const tr = tbody.insertRow();
    columns.forEach(col => {
      const td = tr.insertCell();
      td.textContent = formatValue(row[col.key]);
    });
  });
  if (!rows.length) {
    const tr = tbody.insertRow();
    const td = tr.insertCell();
    td.colSpan = Math.max(1, columns.length);
    td.textContent = emptyMessage;
  }

  host.append(meta, tableEl);
}
