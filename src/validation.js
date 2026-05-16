import { initSettings, initDarkMode, initCompactMode, initHelpModal, initNavToggle } from '../site.js';

const MANIFEST_URL = 'dist/validationManifest.json';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slug(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'item';
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderKPIs(manifest) {
  const s = manifest.summary || {};
  document.getElementById('kpi-standards').textContent = s.standardCount ?? '—';
  document.getElementById('kpi-benchmarks').textContent = s.benchmarkCount ?? '—';
  document.getElementById('kpi-suites').textContent = s.testSuiteCount ?? '—';
  document.getElementById('kpi-assertions').textContent =
    s.totalAssertions != null ? s.totalAssertions.toLocaleString() : '—';

  const ts = manifest.generatedAt;
  if (ts) {
    const d = new Date(ts);
    document.getElementById('manifest-timestamp').textContent =
      `Last build evidence: ${d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`;
  }
}

function renderStandards(standards) {
  const container = document.getElementById('standards-list');
  if (!standards || !standards.length) {
    container.innerHTML = '<p class="field-hint">No standards defined.</p>';
    return;
  }

  container.innerHTML = standards.map(s => `
    <details class="validation-item" id="std-${esc(s.id)}">
      <summary class="validation-item__summary">
        <span class="validation-item__name">${esc(s.name)}</span>
        <a class="validation-item__link btn btn--sm" href="${esc(s.studyPage)}" target="_self">Open study &rarr;</a>
      </summary>
      <div class="validation-item__body">
        <p><strong>${esc(s.title)}</strong></p>
        ${s.scope ? `<p><em>Scope:</em> ${esc(s.scope)}</p>` : ''}
        ${s.assumptions && s.assumptions.length ? `
          <p><strong>Assumptions:</strong></p>
          <ul class="study-basis__list">
            ${s.assumptions.map(a => `<li>${esc(a)}</li>`).join('')}
          </ul>` : ''}
        ${s.limitations && s.limitations.length ? `
          <p><strong>Known Limitations:</strong></p>
          <ul class="study-basis__list study-basis__list--warn">
            ${s.limitations.map(l => `<li>${esc(l)}</li>`).join('')}
          </ul>` : ''}
      </div>
    </details>`).join('');
}

function statusLabel(status) {
  const labels = {
    'scope-defined': 'Scope Defined',
    partial: 'Partial',
    screening: 'Screening',
    supported: 'Supported',
    'not-supported': 'Not Supported',
  };
  return labels[status] || String(status || 'Review');
}

function renderBulletList(items, className = 'study-basis__list') {
  if (!Array.isArray(items) || !items.length) return '';
  return `
    <ul class="${className}">
      ${items.map(item => `<li>${esc(item)}</li>`).join('')}
    </ul>`;
}

function renderComplianceMatrix(items) {
  const container = document.getElementById('nec-compliance-matrix');
  if (!container) return;

  if (!Array.isArray(items) || !items.length) {
    container.innerHTML = '<p class="field-hint">No NEC 2023 scope matrix is defined.</p>';
    return;
  }

  container.innerHTML = items.map(item => `
    <details class="validation-item" id="nec-${slug(item.id || item.module)}">
      <summary class="validation-item__summary">
        <span class="validation-item__name">${esc(item.module)}</span>
        <span class="validation-status-badge validation-status-badge--${slug(item.status)}">${esc(statusLabel(item.status))}</span>
        <a class="validation-item__link btn btn--sm" href="${esc(item.page)}" target="_self">Open page &rarr;</a>
      </summary>
      <div class="validation-item__body">
        <p><strong>NEC 2023 Scope:</strong> ${esc(item.nec2023Scope)}</p>
        ${item.implemented && item.implemented.length ? `
          <p><strong>Implemented Checks:</strong></p>
          ${renderBulletList(item.implemented)}` : ''}
        ${item.gaps && item.gaps.length ? `
          <p><strong>Remaining Gaps:</strong></p>
          ${renderBulletList(item.gaps, 'study-basis__list study-basis__list--warn')}` : ''}
        ${item.nextAction ? `<p class="field-hint"><strong>Next action:</strong> ${esc(item.nextAction)}</p>` : ''}
      </div>
    </details>`).join('');
}

function renderBenchmarks(benchmarks) {
  const container = document.getElementById('benchmarks-list');
  if (!benchmarks || !benchmarks.length) {
    container.innerHTML = '<p class="field-hint">No benchmarks defined.</p>';
    return;
  }

  container.innerHTML = benchmarks.map(b => `
    <details class="validation-item" id="${esc(b.id)}">
      <summary class="validation-item__summary">
        <span class="validation-item__name">${esc(b.title)}</span>
        <a class="validation-item__link btn btn--sm" href="${esc(b.studyPage)}" target="_self">Open study &rarr;</a>
      </summary>
      <div class="validation-item__body">
        <p><em>${esc(b.standard)} ${b.clause ? `— ${esc(b.clause)}` : ''}</em></p>
        <p>${esc(b.description)}</p>
        ${b.expectedOutputs ? renderExpectedOutputs(b.expectedOutputs) : ''}
        <p class="field-hint">${esc(b.reference)}</p>
        ${b.sampleFile ? `<p><a href="${esc(b.sampleFile)}" download>Download fixture project (JSON)</a></p>` : ''}
      </div>
    </details>`).join('');
}

function renderExpectedOutputs(outputs) {
  const rows = Object.entries(outputs).map(([key, spec]) => {
    const val = typeof spec === 'object' ? spec.value : spec;
    const tol = typeof spec === 'object' && spec.tolerance != null ? ` ± ${spec.tolerance}` : '';
    return `<tr><td><code>${esc(key)}</code></td><td>${esc(String(val))}${esc(tol)}</td></tr>`;
  });
  return `
    <table class="results-table" aria-label="Expected outputs">
      <thead><tr><th>Output</th><th>Expected value</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
}

function renderTestSuites(suites) {
  const container = document.getElementById('test-suites-list');
  if (!suites || !suites.length) {
    container.innerHTML = '<p class="field-hint">No test suite data in manifest. Run <code>npm run build:manifest</code> to generate.</p>';
    return;
  }

  const total = suites.reduce((s, t) => s + t.assertionCount, 0);

  container.innerHTML = `
    <p>${suites.length} test files, ${total.toLocaleString()} total assertions.</p>
    <details class="validation-item">
      <summary class="validation-item__summary">
        <span class="validation-item__name">View all test suites (${suites.length})</span>
      </summary>
      <div class="validation-item__body">
        <table class="results-table" aria-label="Test suites">
          <thead><tr><th>File</th><th>Assertions</th></tr></thead>
          <tbody>
            ${suites.map(t => `<tr>
              <td><code>${esc(t.file)}</code></td>
              <td>${t.assertionCount}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>`;
}

// ---------------------------------------------------------------------------
// Load manifest and render
// ---------------------------------------------------------------------------

async function loadManifest() {
  try {
    const resp = await fetch(MANIFEST_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  // Open the anchor target if navigated via hash (e.g., validation.html#ieee1584-arc-flash)
  const hash = window.location.hash.slice(1);

  const manifest = await loadManifest();

  if (manifest) {
    renderKPIs(manifest);
    renderStandards(manifest.standards);
    renderComplianceMatrix(manifest.necComplianceMatrix);
    renderBenchmarks(manifest.benchmarks);
    renderTestSuites(manifest.testSuites);
  } else {
    // Manifest not built yet — still render standards/benchmarks from inline fetch of JSON
    try {
      const resp = await fetch('data/validationBenchmarks.json');
      if (resp.ok) {
        const data = await resp.json();
        renderStandards(data.standards || []);
        renderComplianceMatrix(data.necComplianceMatrix || []);
        renderBenchmarks(data.benchmarks || []);

        // Update KPI placeholders with what we know
        document.getElementById('kpi-standards').textContent = (data.standards || []).length;
        document.getElementById('kpi-benchmarks').textContent = (data.benchmarks || []).length;
        document.getElementById('kpi-suites').textContent = '—';
        document.getElementById('kpi-assertions').textContent = '—';
        document.getElementById('manifest-timestamp').textContent =
          'Run npm run build:manifest to generate test coverage evidence.';
      }
    } catch {
      // Leave placeholders
      renderComplianceMatrix([]);
    }
    document.getElementById('test-suites-list').innerHTML =
      '<p class="field-hint">Test suite index not yet generated. Run <code>npm run build:manifest</code>.</p>';
  }

  // Open the matching details element if navigated by anchor
  if (hash) {
    const target = document.getElementById(hash);
    if (target && target.tagName === 'DETAILS') {
      target.open = true;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
});
