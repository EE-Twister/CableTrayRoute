import { detectClashes, overallSeverity, CLASH_SEVERITY } from './analysis/clashDetect.mjs';
import { getTrays } from './dataStore.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const clearanceInput = document.getElementById('clearanceFt');
  const showSoftChk    = document.getElementById('showSoft');
  const runBtn         = document.getElementById('runBtn');
  const resultsDiv     = document.getElementById('results');

  runBtn.addEventListener('click', () => {
    const trays = getTrays();
    if (!trays || trays.length === 0) {
      showAlertModal('No Data', 'No trays found in the Raceway Schedule. Add trays with 3D coordinates first.');
      return;
    }

    const clearanceFt = parseFloat(clearanceInput.value);
    if (!Number.isFinite(clearanceFt) || clearanceFt < 0) {
      showAlertModal('Invalid Input', 'Minimum clearance must be a non-negative number.');
      return;
    }

    let report;
    try {
      report = detectClashes(trays, { clearanceFt });
    } catch (err) {
      showAlertModal('Detection Error', err.message);
      return;
    }

    const showSoft = showSoftChk.checked;
    renderResults(report, showSoft, clearanceFt);
  });

  function renderResults(report, showSoft, clearanceFt) {
    const { clashes, stats } = report;
    const visible = showSoft
      ? clashes
      : clashes.filter(c => c.severity === CLASH_SEVERITY.HARD);

    const severity = overallSeverity(clashes);
    const statusClass = severity === 'fail' ? 'result-fail'
      : severity === 'warning' ? 'result-warn'
      : 'result-ok';

    const statusLabel = severity === 'fail'
      ? `${stats.hardClashes} Hard Clash${stats.hardClashes !== 1 ? 'es' : ''} Detected`
      : severity === 'warning'
      ? `${stats.softClashes} Clearance Violation${stats.softClashes !== 1 ? 's' : ''} Detected`
      : 'No Clashes Detected';

    let html = `
      <div class="result-card ${statusClass}" role="status" aria-live="polite">
        <h2>Result: ${esc(statusLabel)}</h2>
        <table class="result-table" aria-label="Clash detection summary">
          <tbody>
            <tr><th scope="row">Trays Analysed</th><td>${stats.totalTrays}</td></tr>
            <tr><th scope="row">Pairs Checked</th><td>${stats.pairs}</td></tr>
            <tr><th scope="row">Hard Clashes</th>
                <td class="${stats.hardClashes > 0 ? 'result-fail' : ''}">${stats.hardClashes}</td></tr>
            <tr><th scope="row">Clearance Violations (< ${clearanceFt} ft)</th>
                <td class="${stats.softClashes > 0 ? 'result-warn' : ''}">${stats.softClashes}</td></tr>
          </tbody>
        </table>
      </div>`;

    if (visible.length > 0) {
      const rows = visible.map(c => {
        const rowClass = c.severity === CLASH_SEVERITY.HARD ? 'result-fail' : 'result-warn';
        const severityLabel = c.severity === CLASH_SEVERITY.HARD ? 'Hard Clash' : 'Clearance Violation';
        const gapOrOverlap = c.severity === CLASH_SEVERITY.HARD
          ? `${Math.min(c.overlapX, c.overlapY, c.overlapZ).toFixed(3)} ft overlap`
          : `${c.minGapFt.toFixed(3)} ft gap`;
        return `<tr class="${rowClass}">
          <td>${esc(c.trayA)}</td>
          <td>${esc(c.trayB)}</td>
          <td><span class="status-badge ${rowClass}">${esc(severityLabel)}</span></td>
          <td>${esc(gapOrOverlap)}</td>
          <td>${esc(c.description)}</td>
        </tr>`;
      }).join('');

      html += `
        <section>
          <h2>Clash Details (${visible.length} ${showSoft ? 'total' : 'hard'} clash${visible.length !== 1 ? 'es' : ''})</h2>
          <table class="result-table" aria-label="Clash details">
            <thead>
              <tr>
                <th scope="col">Tray A</th>
                <th scope="col">Tray B</th>
                <th scope="col">Type</th>
                <th scope="col">Gap / Overlap</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`;
    } else if (severity !== 'fail' && severity !== 'warning') {
      html += '<p class="result-ok">All tray pairs pass the clash and clearance checks.</p>';
    } else if (!showSoft && stats.softClashes > 0) {
      html += `<p class="field-hint">Soft clash warnings are hidden. Enable "Include soft clash warnings" to view them.</p>`;
    }

    resultsDiv.innerHTML = html;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
});
