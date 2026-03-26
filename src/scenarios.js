import { listScenarios, getCurrentScenario, switchScenario, cloneScenario, getOneLine, getRevisions, restoreRevision, getCablesForScenario } from '../dataStore.mjs';
import { showAlertModal, openModal } from './components/modal.js';

function ensureDefaults() {
  const defaults = ['base', 'future', 'emergency'];
  const existing = listScenarios();
  for (const name of defaults) {
    if (!existing.includes(name)) {
      cloneScenario(name);
    }
  }
}

function populateSelect(select) {
  select.innerHTML = '';
  for (const name of listScenarios()) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }
  select.value = getCurrentScenario();
}

function diffScenarios(a, b) {
  const diagram = document.getElementById('diagram');
  if (!diagram) return;
  diagram.querySelectorAll('.scenario-diff').forEach(el => el.classList.remove('scenario-diff'));
  const { sheets: sheetsA } = getOneLine(a);
  const { sheets: sheetsB } = getOneLine(b);
  const map = arr => {
    const m = new Map();
    for (const s of arr) {
      for (const c of s.components || []) {
        m.set(c.id, JSON.stringify(c));
      }
    }
    return m;
  };
  const mapA = map(sheetsA);
  const mapB = map(sheetsB);
  const diff = new Set();
  for (const [id, val] of mapA) {
    if (mapB.get(id) !== val) diff.add(id);
  }
  for (const id of mapB.keys()) {
    if (!mapA.has(id)) diff.add(id);
  }
  diff.forEach(id => {
    const g = diagram.querySelector(`g.component[data-id="${id}"]`);
    if (g) g.classList.add('scenario-diff');
  });
}

// ---------------------------------------------------------------------------
// Scenario comparison — side-by-side cable schedule diff (Gap #17)
// ---------------------------------------------------------------------------

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildCableMap(cables) {
  const m = new Map();
  for (const c of cables) {
    if (c.tag != null) m.set(String(c.tag), c);
  }
  return m;
}

function cmpRowHtml(status, cable, otherCable) {
  const statusClass = { Added: 'cmp-added', Removed: 'cmp-removed', Changed: 'cmp-changed' }[status];
  const display = cable ?? otherCable;
  const fromTo = `${esc(display.from_tag ?? '—')} → ${esc(display.to_tag ?? '—')}`;
  const sizeCell = status === 'Changed'
    ? `<del>${esc(otherCable?.conductor_size ?? '')}</del>&nbsp;→&nbsp;${esc(cable?.conductor_size ?? '')}`
    : esc(display.conductor_size ?? '—');
  return `<tr class="${statusClass}"><td>${status}</td><td>${esc(display.tag)}</td>` +
    `<td>${fromTo}</td><td>${esc(display.cable_type ?? '—')}</td><td>${sizeCell}</td></tr>`;
}

/**
 * Build the comparison result object between two scenarios' cable schedules.
 * Exported for unit testing.
 *
 * @param {string} a - name of scenario A (baseline)
 * @param {string} b - name of scenario B (comparison target)
 * @param {function} getCablesFn - injectable reader; defaults to getCablesForScenario
 * @returns {{ added: number, removed: number, changed: number, rows: string[] }}
 */
export function buildCableComparison(a, b, getCablesFn = getCablesForScenario) {
  const cablesA = getCablesFn(a);
  const cablesB = getCablesFn(b);
  const mapA = buildCableMap(cablesA);
  const mapB = buildCableMap(cablesB);

  const rows = [];
  let added = 0, removed = 0, changed = 0;

  for (const [tag, cableB] of mapB) {
    if (!mapA.has(tag)) {
      rows.push(cmpRowHtml('Added', cableB, null));
      added++;
    } else if (JSON.stringify(cableB) !== JSON.stringify(mapA.get(tag))) {
      rows.push(cmpRowHtml('Changed', cableB, mapA.get(tag)));
      changed++;
    }
  }
  for (const [tag, cableA] of mapA) {
    if (!mapB.has(tag)) {
      rows.push(cmpRowHtml('Removed', null, cableA));
      removed++;
    }
  }

  return { added, removed, changed, rows };
}

/**
 * Open a modal showing the cable schedule differences between two scenarios.
 *
 * @param {string} a - name of scenario A (baseline)
 * @param {string} b - name of scenario B (comparison target)
 * @returns {Promise}
 */
export function compareScenarios(a, b) {
  const { added, removed, changed, rows } = buildCableComparison(a, b);

  const summary = `${added} added, ${removed} removed, ${changed} changed`;

  let tableHtml;
  if (rows.length === 0) {
    tableHtml = `<p>No cable schedule differences found between <strong>${esc(a)}</strong> and <strong>${esc(b)}</strong>.</p>`;
  } else {
    tableHtml =
      `<p class="scenario-compare-summary">${summary}</p>` +
      `<div class="scenario-compare-scroll">` +
        `<table class="scenario-compare-table" aria-label="Scenario cable schedule comparison">` +
          `<thead><tr>` +
            `<th scope="col">Status</th>` +
            `<th scope="col">Tag</th>` +
            `<th scope="col">From → To</th>` +
            `<th scope="col">Cable Type</th>` +
            `<th scope="col">Conductor Size</th>` +
          `</tr></thead>` +
          `<tbody>${rows.join('')}</tbody>` +
        `</table>` +
      `</div>`;
  }

  return openModal({
    title: `Compare Scenarios: ${a} vs ${b}`,
    message: tableHtml,
    primaryText: 'Close',
    secondaryText: null,
    variant: 'wide',
  });
}

// ---------------------------------------------------------------------------

function initScenarioUI() {
  ensureDefaults();
  const select = document.getElementById('scenario-select');
  if (!select) return;
  populateSelect(select);
  select.addEventListener('change', e => {
    switchScenario(e.target.value);
    location.reload();
  });

  const dupBtn = document.getElementById('scenario-duplicate-btn');
  dupBtn?.addEventListener('click', () => {
    const name = prompt('New scenario name');
    if (name) {
      cloneScenario(name);
      populateSelect(select);
      select.value = name;
      switchScenario(name);
      location.reload();
    }
  });

  const diffBtn = document.getElementById('scenario-diff-btn');
  diffBtn?.addEventListener('click', () => {
    const other = prompt('Compare with which scenario?', listScenarios().join(', '));
    if (other) diffScenarios(getCurrentScenario(), other);
  });

  const compareBtn = document.getElementById('scenario-compare-btn');
  compareBtn?.addEventListener('click', async () => {
    const scenarios = listScenarios();
    const current = getCurrentScenario();

    // Build a <select> for choosing the comparison target
    const others = scenarios.filter(s => s !== current);
    if (others.length === 0) {
      showAlertModal('Compare Scenarios', 'No other scenarios exist to compare against. Duplicate the current scenario first.');
      return;
    }

    // Use a first-step modal to let the user pick the target scenario
    const selectHtml =
      `<p>Compare <strong>${esc(current)}</strong> against:</p>` +
      `<select id="scenario-compare-target" style="width:100%;padding:4px 6px;margin-top:8px;">` +
        others.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('') +
      `</select>`;

    const chosen = await openModal({
      title: 'Select Comparison Scenario',
      message: selectHtml,
      primaryText: 'Compare',
      secondaryText: 'Cancel',
    });

    if (!chosen) return; // user cancelled

    const targetEl = document.getElementById('scenario-compare-target');
    const target = targetEl ? targetEl.value : others[0];
    compareScenarios(current, target);
  });

  const revBtn = document.getElementById('revision-btn');
  revBtn?.addEventListener('click', () => {
    const revs = getRevisions();
    if (!revs.length) { showAlertModal('Notice', 'No revisions available.'); return; }
    const msg = revs.map((r,i) => `${i}: ${new Date(r.time).toLocaleString()}`).join('\n');
    const choice = prompt(`Restore which revision?\n${msg}`);
    const idx = Number(choice);
    if (!Number.isNaN(idx)) {
      restoreRevision(idx);
      location.reload();
    }
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initScenarioUI);
}
