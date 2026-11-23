import { captureStudyRunContext, getStudies, saveStudyResult } from '../../dataStore.mjs';
import { frequencyScan } from '../../analysis/harmonics.js';

export function initFrequencyScanPanel() {
    const d3 = globalThis.d3;
    const banksBody  = document.getElementById('fs-banks-tbody');
    const addBtn     = document.getElementById('fs-add-bank-btn');
    const runBtn     = document.getElementById('fs-run-btn');
    const resultsDiv = document.getElementById('fs-results');
    const resultsTbody = document.getElementById('fs-results-tbody');
    const dangerBanner = document.getElementById('fs-danger-banner');
    const chartEl    = document.getElementById('freq-scan-chart');
    const inputError = document.createElement('div');
    inputError.id = 'fs-input-error';
    inputError.hidden = true;
    inputError.setAttribute('role', 'alert');
    inputError.style.cssText = 'background:var(--color-warning-bg,#fffbeb);border:1px solid var(--color-warning, #d97706);border-radius:4px;padding:0.75rem 1rem;margin-top:0.75rem;color:var(--color-warning,#92400e);';
    runBtn.parentElement.insertBefore(inputError, runBtn);
    const savedStudies = getStudies();
    const saved = savedStudies?.frequencyScan || savedStudies?.freqScan;

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[ch]));
    }

    let rowCount = 0;

    function addRow(mvar, kv, tune, qf) {
      const fieldValue = value => value === undefined || value === null ? '' : String(value);
      rowCount++;
      const tr = document.createElement('tr');
      tr.dataset.row = rowCount;
      tr.innerHTML = `
        <td>${rowCount}</td>
        <td><input type="number" class="fs-mvar" value="${escapeHtml(fieldValue(mvar))}" min="0" step="0.5"
             style="width:5rem" aria-label="MVAR for bank ${rowCount}"></td>
        <td><input type="number" class="fs-kv" value="${escapeHtml(fieldValue(kv))}" min="0.1" step="0.1"
             style="width:5rem" aria-label="kV for bank ${rowCount}"></td>
        <td><input type="number" class="fs-tune" value="${escapeHtml(fieldValue(tune))}" min="0" max="50" step="0.1"
             style="width:5rem" aria-label="Tune order for bank ${rowCount}"></td>
        <td><input type="number" class="fs-q" value="${escapeHtml(fieldValue(qf))}" min="1" max="500" step="1"
             style="width:5rem" aria-label="Q factor for bank ${rowCount}"></td>
        <td><button class="btn fs-remove-btn" aria-label="Remove bank ${rowCount}"
             style="padding:0.2rem 0.5rem;">&#x2715;</button></td>`;
      banksBody.appendChild(tr);
      tr.querySelector('.fs-remove-btn').addEventListener('click', () => {
        tr.remove();
        markFrequencyScanInputsChanged();
      });
    }

    function markFrequencyScanInputsChanged() {
      // Dynamic rows have no stable input target at the moment they are
      // created or removed. Reuse the scoped control event so the lifecycle
      // controller marks only frequencyScan dirty.
      document.getElementById('fs-hmax')?.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const savedBanks = saved?.params?.capacitorBanks;
    if (Array.isArray(savedBanks)) {
      savedBanks.forEach(bank => addRow(bank?.mvar, bank?.kv, bank?.tuneOrder, bank?.qFactor));
    } else if (saved?.params) {
      // A legacy result may have no bank list at all. Keep the result visible,
      // but make the missing inputs explicit so a rerun cannot invent values.
      addRow('', '', '', '');
    } else {
      addRow(5, 13.8, 0, 30);
    }

    addBtn.addEventListener('click', () => {
      const rawBusVoltage = String(document.getElementById('fs-bus-kv')?.value ?? '').trim();
      const busVoltage = Number(rawBusVoltage);
      addRow(5, Number.isFinite(busVoltage) && busVoltage > 0 ? busVoltage : '', 0, 30);
      markFrequencyScanInputsChanged();
    });

    function readBankNumber(input, label, { allowZero = false, max = Infinity } = {}) {
      const raw = String(input?.value ?? '').trim();
      const value = Number(raw);
      const valid = Boolean(raw) && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0) && value <= max;
      if (!valid) {
        const range = Number.isFinite(max) ? ` no greater than ${max}` : '';
        throw new Error(`${label} must be a finite number${allowZero ? ' greater than or equal to 0' : ' greater than 0'}${range}.`);
      }
      return value;
    }

    function collectBanks() {
      return Array.from(banksBody.querySelectorAll('tr')).map((tr, index) => ({
        mvar: readBankNumber(tr.querySelector('.fs-mvar'), `Capacitor bank ${index + 1} MVAR`),
        kv: readBankNumber(tr.querySelector('.fs-kv'), `Capacitor bank ${index + 1} kV`),
        tuneOrder: readBankNumber(tr.querySelector('.fs-tune'), `Capacitor bank ${index + 1} tune order`, { allowZero: true, max: 50 }),
        qFactor: readBankNumber(tr.querySelector('.fs-q'), `Capacitor bank ${index + 1} Q factor`, { max: 500 })
      }));
    }

    function riskColor(risk) {
      if (risk === 'danger')  return 'crimson';
      if (risk === 'caution') return 'darkorange';
      return 'steelblue';
    }

    function clampHMax(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return 25;
      return Math.min(50, Math.max(5, Math.round(n)));
    }

    function readRequiredNumber(id, label, { min = 0, max = Infinity, integer = false } = {}) {
      const raw = String(document.getElementById(id)?.value ?? '').trim();
      const value = Number(raw);
      if (!raw || !Number.isFinite(value) || value <= min || value > max || (integer && !Number.isInteger(value))) {
        const range = Number.isFinite(max) ? ` between ${min} and ${max}` : ` greater than ${min}`;
        throw new Error(`${label} must be a finite number${range}.`);
      }
      return value;
    }

    function clearFrequencyScanOutput(message) {
      inputError.textContent = message;
      inputError.hidden = false;
      resultsDiv.hidden = true;
      resultsTbody.replaceChildren();
      dangerBanner.hidden = true;
      d3.select(chartEl).selectAll('*').remove();
    }

    function isValidSweepPoint(point) {
      return point && Number.isFinite(point.h) && Number.isFinite(point.zPu);
    }

    function isValidResonance(point) {
      return point && Number.isFinite(point.hOrder) && Number.isFinite(point.zPu);
    }

    function renderFreqChart(sweep, resonances, hMax) {
      const safeHMax = clampHMax(hMax);
      const safeSweep = Array.isArray(sweep) ? sweep.filter(isValidSweepPoint) : [];
      const safeResonances = Array.isArray(resonances) ? resonances.filter(isValidResonance) : [];
      const width  = Number(chartEl.getAttribute('width'))  || 800;
      const height = Number(chartEl.getAttribute('height')) || 350;
      const m = { top: 20, right: 20, bottom: 50, left: 60 };
      const svg = d3.select(chartEl);
      svg.selectAll('*').remove();

      if (!safeSweep.length) return;

      const xScale = d3.scaleLinear()
        .domain([1, safeHMax])
        .range([m.left, width - m.right]);

      const zMax  = Math.min(d3.max(safeSweep, d => d.zPu) || 1, 50);
      const yScale = d3.scaleLinear()
        .domain([0, zMax * 1.1])
        .nice()
        .range([height - m.bottom, m.top]);

      // Axis
      svg.append('g')
        .attr('transform', `translate(0,${height - m.bottom})`)
        .call(d3.axisBottom(xScale).ticks(Math.min(safeHMax, 25)).tickFormat(d => `h${d}`))
        .selectAll('text').attr('font-size', '11px');

      svg.append('g')
        .attr('transform', `translate(${m.left},0)`)
        .call(d3.axisLeft(yScale).ticks(6).tickFormat(d => `${d}`));

      svg.append('text')
        .attr('x', m.left + (width - m.left - m.right) / 2)
        .attr('y', height - 8)
        .attr('text-anchor', 'middle').attr('fill', '#555').attr('font-size', '12px')
        .text('Harmonic Order');

      svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -(m.top + (height - m.top - m.bottom) / 2))
        .attr('y', 16)
        .attr('text-anchor', 'middle').attr('fill', '#555').attr('font-size', '12px')
        .text('Impedance Z (pu)');

      // Danger zone bands (±0.3 around each integer harmonic)
      for (let h = 2; h <= safeHMax; h++) {
        svg.append('rect')
          .attr('x', xScale(h - 0.3))
          .attr('width', xScale(h + 0.3) - xScale(h - 0.3))
          .attr('y', m.top)
          .attr('height', height - m.top - m.bottom)
          .attr('fill', 'rgba(220,53,69,0.08)');
        svg.append('line')
          .attr('x1', xScale(h)).attr('x2', xScale(h))
          .attr('y1', m.top).attr('y2', height - m.bottom)
          .attr('stroke', '#ccc').attr('stroke-dasharray', '3,3');
      }

      // Impedance curve
      const line = d3.line()
        .x(d => xScale(d.h))
        .y(d => yScale(Math.min(d.zPu, zMax)))
        .curve(d3.curveMonotoneX);

      svg.append('path')
        .datum(safeSweep)
        .attr('fill', 'none')
        .attr('stroke', 'steelblue')
        .attr('stroke-width', 2)
        .attr('d', line);

      // Resonance peak markers
      safeResonances.forEach(r => {
        const cx = xScale(r.hOrder);
        const cy = yScale(Math.min(r.zPu, zMax));
        svg.append('circle')
          .attr('cx', cx).attr('cy', cy).attr('r', 6)
          .attr('fill', riskColor(r.risk))
          .attr('stroke', '#fff').attr('stroke-width', 1.5);
        svg.append('text')
          .attr('x', cx).attr('y', cy - 10)
          .attr('text-anchor', 'middle')
          .attr('fill', riskColor(r.risk))
          .attr('font-size', '11px')
          .attr('font-weight', '600')
          .text(`h=${r.hOrder.toFixed(1)}`);
      });

      // Legend
      const legend = svg.append('g').attr('transform', `translate(${m.left + 10},${m.top + 10})`);
      [['danger', 'crimson'], ['caution', 'darkorange'], ['series min', 'steelblue']].forEach(([label, color], i) => {
        legend.append('circle').attr('cx', 0).attr('cy', i * 18).attr('r', 5).attr('fill', color);
        legend.append('text').attr('x', 10).attr('y', i * 18 + 4).attr('font-size', '11px').attr('fill', '#444').text(label);
      });
    }

    function saveResults(params, results, runContext) {
      const result = { params, results, timestamp: Date.now() };
      if (!runContext) return;
      try {
        saveStudyResult('frequencyScan', result, runContext);
      } catch (error) {
        console.warn('[harmonics] frequency scan result was not persisted:', error?.message || error);
      }
    }

    runBtn.addEventListener('click', () => {
      inputError.hidden = true;
      let params;
      let runContext;
      try {
        params = {
          busVoltageKv: readRequiredNumber('fs-bus-kv', 'Bus voltage (kV)'),
          scMVA: readRequiredNumber('fs-sc-mva', 'Short-circuit MVA'),
          fBase: readRequiredNumber('fs-fbase', 'Fundamental frequency (Hz)'),
          hMax: readRequiredNumber('fs-hmax', 'Maximum harmonic order', { min: 4, max: 50, integer: true }),
          capacitorBanks: collectBanks()
        };
        // Capture the source context before solving so async or downstream changes
        // cannot be mistaken for the inputs used by this calculation.
        runContext = captureStudyRunContext('frequencyScan', {
          inputs: params,
          options: { embedded: true },
          dependencies: [],
        });
      } catch (error) {
        clearFrequencyScanOutput(error?.message || 'Frequency scan inputs require review.');
        return;
      }

      let sweep;
      let resonances;
      try {
        ({ sweep, resonances } = frequencyScan(params));
      } catch (error) {
        clearFrequencyScanOutput(error?.message || 'Frequency scan could not be calculated.');
        return;
      }
      saveResults(params, { sweep, resonances }, runContext);
      inputError.hidden = true;

      renderFreqChart(sweep, resonances, params.hMax);

      // Populate results table
      resultsTbody.innerHTML = '';
      const safeResonances = Array.isArray(resonances) ? resonances.filter(isValidResonance) : [];
      if (!safeResonances.length) {
        resultsTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted,#666);">
          No resonance peaks detected in the sweep range.</td></tr>`;
      } else {
        safeResonances.forEach(r => {
          const riskStyle = `color:${riskColor(r.risk)};font-weight:600`;
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${r.hOrder.toFixed(1)}</td>
            <td>${r.zPu.toFixed(3)}</td>
            <td>${escapeHtml(r.type)}</td>
            <td style="${riskStyle}">${escapeHtml(r.risk.toUpperCase())}</td>
            <td style="max-width:30rem;">${r.detuneRecommendation || '—'}</td>`;
          resultsTbody.appendChild(tr);
        });
      }

      dangerBanner.hidden = !safeResonances.some(r => r.risk === 'danger');
      resultsDiv.hidden = false;
    });

    // Restore the exact saved controls before showing the historical chart.
    if (saved?.params) {
      ['busVoltageKv', 'scMVA', 'fBase', 'hMax'].forEach((key, index) => {
        const ids = ['fs-bus-kv', 'fs-sc-mva', 'fs-fbase', 'fs-hmax'];
        if (saved.params[key] !== undefined && saved.params[key] !== null) {
          document.getElementById(ids[index]).value = String(saved.params[key]);
        }
      });
    }
    if (saved?.results?.sweep?.length) {
      renderFreqChart(saved.results.sweep, saved.results.resonances || [], clampHMax(saved.params?.hMax));
    }
  
}
