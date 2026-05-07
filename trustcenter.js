import { runAllBenchmarks, summarize } from './analysis/benchmarkRunner.mjs';
import { escapeHtml } from './src/htmlUtils.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const runBtn      = document.getElementById('run-benchmarks-btn');
  const runStatus   = document.getElementById('run-status');
  const summaryEl   = document.getElementById('summary-section');
  const summaryCard = document.getElementById('summary-card');
  const resultsEl   = document.getElementById('results-section');
  const tbody       = document.getElementById('results-tbody');
  const detailEl    = document.getElementById('detail-section');
  const detailPanel = document.getElementById('detail-panel');

  runBtn.addEventListener('click', runBenchmarks);

  function runBenchmarks() {
    runBtn.disabled = true;
    runStatus.textContent = 'Running…';

    // Yield to the browser so the button state renders before blocking work.
    setTimeout(() => {
      try {
        const results = runAllBenchmarks();
        renderSummary(results);
        renderTable(results);
      } catch (err) {
        runStatus.textContent = `Error: ${err.message}`;
      } finally {
        runBtn.disabled = false;
        runStatus.textContent = '';
      }
    }, 0);
  }

  // ---------------------------------------------------------------------------
  // Summary card
  // ---------------------------------------------------------------------------

  function renderSummary(results) {
    const { total, passed, failed, allPass } = summarize(results);
    const cls = allPass ? 'fill-ok' : 'fill-over';
    const icon = allPass ? '✓' : '✗';

    summaryCard.innerHTML = `
      <p style="font-size:1.1rem; margin-bottom:0.75rem">
        <span class="fill-badge ${cls}" style="font-size:1rem; padding:.4rem .9rem">
          ${icon} ${passed} / ${total} benchmarks passing
        </span>
      </p>
      ${failed > 0 ? `<p class="hint" role="alert" style="color:var(--color-error,#c0392b)">
        ${failed} benchmark${failed === 1 ? '' : 's'} failed. Review the highlighted rows below.
      </p>` : ''}`;

    summaryEl.hidden = false;
    detailEl.hidden = true;
    detailPanel.innerHTML = '';
  }

  // ---------------------------------------------------------------------------
  // Results table
  // ---------------------------------------------------------------------------

  function renderTable(results) {
    tbody.innerHTML = '';

    for (const r of results) {
      const statusCls   = r.pass ? 'fill-ok' : 'fill-over';
      const statusLabel = r.pass ? '✓ Pass' : '✗ Fail';

      const tr = document.createElement('tr');
      tr.dataset.benchmarkId = r.id;
      tr.style.cursor = 'pointer';
      tr.setAttribute('tabindex', '0');
      tr.setAttribute('role', 'button');
      tr.setAttribute('aria-label', `Expand details for ${escapeHtml(r.label)}`);
      tr.setAttribute('aria-expanded', 'false');

      tr.innerHTML = `
        <td><code>${escapeHtml(r.id)}</code></td>
        <td>${escapeHtml(r.studyType)}</td>
        <td>${escapeHtml(r.label)}</td>
        <td><span class="fill-badge ${statusCls}">${statusLabel}</span></td>
        <td><button class="btn" type="button" aria-label="Show details for ${escapeHtml(r.id)}">Details</button></td>`;

      const detailBtn = tr.querySelector('button');
      const showDetail = () => showBenchmarkDetail(r, tr);

      detailBtn.addEventListener('click', e => { e.stopPropagation(); showDetail(); });
      tr.addEventListener('click', showDetail);
      tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDetail(); } });

      tbody.appendChild(tr);
    }

    resultsEl.hidden = false;
  }

  // ---------------------------------------------------------------------------
  // Per-benchmark detail panel
  // ---------------------------------------------------------------------------

  function showBenchmarkDetail(r, activeTr) {
    // Update aria-expanded on all rows, then set the active one.
    tbody.querySelectorAll('tr[data-benchmark-id]').forEach(tr => {
      tr.setAttribute('aria-expanded', tr === activeTr ? 'true' : 'false');
    });

    const checksHtml = r.checks.map(c => {
      const passCls = c.pass ? 'fill-ok' : 'fill-over';
      const passLabel = c.pass ? '✓' : '✗';

      const expectedStr = formatVal(c.expectedVal, c.type);
      const actualStr   = c.actualVal !== undefined ? formatVal(c.actualVal, c.type) : '—';
      const deviStr     = (c.deviation !== null && c.deviation !== undefined)
        ? (c.type === 'boolean' ? '—' : c.deviation.toFixed(4))
        : '—';
      const tolStr = c.tolerance != null
        ? (c.type === 'boolean' ? '—' : `±${c.tolerance}`)
        : '—';

      return `
        <tr>
          <td>${escapeHtml(c.description)}</td>
          <td>${escapeHtml(expectedStr)}</td>
          <td>${escapeHtml(actualStr)}</td>
          <td>${escapeHtml(deviStr)}</td>
          <td>${escapeHtml(tolStr)}</td>
          <td><span class="fill-badge ${passCls}" aria-label="${c.pass ? 'Pass' : 'Fail'}">${passLabel}</span></td>
        </tr>`;
    }).join('');

    const errorHtml = r.error
      ? `<div class="error-msg" role="alert" style="margin-bottom:1rem"><strong>Runtime error:</strong> ${escapeHtml(r.error)}</div>`
      : '';

    detailPanel.innerHTML = `
      <section class="field-group" aria-label="Detail for ${escapeHtml(r.id)}">
        <h2>${escapeHtml(r.id)}: ${escapeHtml(r.label)}</h2>
        <p style="font-size:.85rem; color:var(--color-text-muted,#666)">
          <strong>Standard:</strong> ${escapeHtml(r.standardRef)}
        </p>
        <p>${escapeHtml(r.description)}</p>

        ${errorHtml}

        <table class="results-table" aria-label="Checks for ${escapeHtml(r.id)}">
          <thead>
            <tr>
              <th scope="col">Check</th>
              <th scope="col">Expected</th>
              <th scope="col">Actual</th>
              <th scope="col">Deviation</th>
              <th scope="col">Tolerance</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>${checksHtml}</tbody>
        </table>
      </section>`;

    detailEl.hidden = false;
    detailPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function formatVal(val, type) {
    if (type === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'number') return Number.isInteger(val) ? String(val) : val.toFixed(4);
    return String(val ?? '');
  }
});
