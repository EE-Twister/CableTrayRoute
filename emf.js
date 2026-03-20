import {
  fieldFromConductorArray,
  buildThreePhaseConductors,
  fieldProfile,
  checkCompliance,
  ICNIRP_LIMITS,
} from './analysis/emf.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  document.getElementById('calc-btn').addEventListener('click', calculate);
  document.getElementById('profile-btn').addEventListener('click', runProfile);

  function getInputs() {
    return {
      frequency: parseInt(document.getElementById('frequency').value, 10),
      currentA: parseFloat(document.getElementById('load-current').value) || 0,
      nCables: Math.max(1, parseInt(document.getElementById('n-cables').value, 10) || 1),
      trayWidthIn: parseFloat(document.getElementById('tray-width').value) || 12,
      cableOdIn: parseFloat(document.getElementById('cable-od').value) || 1.0,
      measDistanceIn: parseFloat(document.getElementById('meas-distance').value) || 36,
    };
  }

  function inToM(v) { return v * 0.0254; }

  function calculate() {
    const inp = getInputs();
    if (inp.currentA <= 0) {
      showAlertModal('Input Error', 'Load current must be greater than zero.');
      return;
    }

    const trayWidthM = inToM(inp.trayWidthIn);
    const cableOdM = inToM(inp.cableOdIn);
    const distanceM = inToM(inp.measDistanceIn);

    const conductors = buildThreePhaseConductors(inp.currentA, inp.nCables, trayWidthM, cableOdM);

    let result;
    try {
      const measurePoint = { x: trayWidthM / 2 + distanceM, y: inToM(24) }; // 24 in above tray floor
      result = fieldFromConductorArray(conductors, measurePoint);
    } catch (err) {
      document.getElementById('results').innerHTML =
        `<p class="result-fail">Calculation error: ${esc(err.message)}</p>`;
      return;
    }

    const compliance = checkCompliance(result.bRms_uT, inp.frequency);
    renderResult(result, compliance, inp);
    document.getElementById('profile-container').hidden = true;
  }

  function renderResult(result, compliance, inp) {
    const overallPass = compliance.occupational.pass && compliance.generalPublic.pass;
    const overallClass = overallPass ? 'result-ok' : compliance.occupational.pass ? 'result-warn' : 'result-fail';

    const compRows = Object.values(compliance).map(c => {
      const cls = c.pass ? 'result-ok' : 'result-fail';
      return `<tr class="${cls}">
        <td>${esc(c.label)}</td>
        <td>${esc(c.limit)} µT</td>
        <td>${result.bRms_uT.toFixed(3)} µT</td>
        <td>${(c.ratio * 100).toFixed(1)}%</td>
        <td class="status-badge ${cls}">${c.pass ? 'PASS' : 'FAIL'}</td>
      </tr>`;
    }).join('');

    document.getElementById('results').innerHTML = `
      <div class="result-card ${overallClass}" role="status">
        <h2>Field Calculation Results</h2>
        <table class="result-table" aria-label="Field calculation results">
          <tbody>
            <tr>
              <th scope="row">Frequency</th>
              <td>${esc(inp.frequency)} Hz</td>
            </tr>
            <tr>
              <th scope="row">Current per Phase</th>
              <td>${esc(inp.currentA.toFixed(1))} A</td>
            </tr>
            <tr>
              <th scope="row">Measurement Distance (from tray edge)</th>
              <td>${esc(inp.measDistanceIn.toFixed(1))} in (${(inp.measDistanceIn * 0.0254).toFixed(2)} m)</td>
            </tr>
            <tr>
              <th scope="row">Peak Flux Density (B<sub>peak</sub>)</th>
              <td><strong>${result.bPeak_uT.toFixed(3)} µT</strong></td>
            </tr>
            <tr>
              <th scope="row">RMS Flux Density (B<sub>rms</sub>)</th>
              <td><strong>${result.bRms_uT.toFixed(3)} µT</strong></td>
            </tr>
          </tbody>
        </table>

        <h3 style="margin-top:1rem">ICNIRP 2010 Compliance</h3>
        <table class="result-table" aria-label="ICNIRP compliance check">
          <thead>
            <tr>
              <th scope="col">Limit</th>
              <th scope="col">Limit (µT)</th>
              <th scope="col">Calculated (µT)</th>
              <th scope="col">Utilization</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>${compRows}</tbody>
        </table>

        <details class="method-note">
          <summary>Calculation details</summary>
          <p>Configuration: ${esc(inp.nCables)} × 3-phase cable set(s), ${esc(inp.trayWidthIn)}" wide tray,
          ${esc(inp.cableOdIn)}" OD cables.</p>
          <p>Conductors modelled as infinite parallel lines. Measurement point at
          ${esc(inp.measDistanceIn)} in from tray edge, 24 in above tray floor.</p>
          <p>Formula: B = (µ₀/2π) × (I/d), with vector superposition across all ${esc(inp.nCables * 3)}
          conductors (${esc(inp.nCables)} cable set(s) × 3 phases). Peak field found by scanning 360 phase samples.</p>
        </details>
      </div>`;

    // Expose conductors for profile use
    document._emfConductors = buildThreePhaseConductors(
      inp.currentA, inp.nCables, inp.trayWidthIn * 0.0254, inp.cableOdIn * 0.0254
    );
    document._emfTrayWidthM = inp.trayWidthIn * 0.0254;
    document._emfFreq = inp.frequency;
  }

  function runProfile() {
    const inp = getInputs();
    if (inp.currentA <= 0) {
      showAlertModal('Input Error', 'Load current must be greater than zero.');
      return;
    }

    const trayWidthM = inToM(inp.trayWidthIn);
    const cableOdM = inToM(inp.cableOdIn);
    const conductors = buildThreePhaseConductors(inp.currentA, inp.nCables, trayWidthM, cableOdM);

    // Profile from 0 to 120 inches, 1-inch steps
    const distancesM = Array.from({ length: 121 }, (_, i) => inToM(i));
    const profile = fieldProfile(conductors, trayWidthM, distancesM);

    document.getElementById('profile-container').hidden = false;
    renderProfileChart(profile, inp.frequency);
  }

  function renderProfileChart(profile, frequencyHz) {
    const occLimit = frequencyHz === 50 ? ICNIRP_LIMITS.occupational_50hz : ICNIRP_LIMITS.occupational_60hz;
    const gpLimit = frequencyHz === 50 ? ICNIRP_LIMITS.general_public_50hz : ICNIRP_LIMITS.general_public_60hz;

    const svg = document.getElementById('emf-chart');
    while (svg.firstChild && svg.firstChild.nodeName !== 'title') svg.removeChild(svg.firstChild);

    const W = parseInt(svg.getAttribute('width'), 10) || 680;
    const H = parseInt(svg.getAttribute('height'), 10) || 320;
    const m = { top: 20, right: 30, bottom: 45, left: 65 };
    const iW = W - m.left - m.right;
    const iH = H - m.top - m.bottom;
    const ns = 'http://www.w3.org/2000/svg';

    const distancesIn = profile.map(p => p.distanceM / 0.0254);
    const bValues = profile.map(p => p.bRms_uT);
    const maxB = Math.max(...bValues, gpLimit * 1.05);
    const maxD = Math.max(...distancesIn);

    function xScale(d) { return m.left + (d / maxD) * iW; }
    function yScale(b) { return m.top + iH - (b / maxB) * iH; }

    const g = document.createElementNS(ns, 'g');

    // Grid lines and axes
    [0, 0.25, 0.5, 0.75, 1.0].forEach(frac => {
      const bVal = frac * maxB;
      const y = yScale(bVal);
      const gl = document.createElementNS(ns, 'line');
      gl.setAttribute('x1', m.left); gl.setAttribute('x2', m.left + iW);
      gl.setAttribute('y1', y); gl.setAttribute('y2', y);
      gl.setAttribute('stroke', 'currentColor'); gl.setAttribute('stroke-opacity', '0.12');
      g.appendChild(gl);
      const lbl = document.createElementNS(ns, 'text');
      lbl.setAttribute('x', m.left - 5); lbl.setAttribute('y', y + 4);
      lbl.setAttribute('text-anchor', 'end'); lbl.setAttribute('font-size', '10');
      lbl.setAttribute('fill', 'currentColor');
      lbl.textContent = bVal.toFixed(1);
      g.appendChild(lbl);
    });

    // Y axis label
    const yLbl = document.createElementNS(ns, 'text');
    yLbl.setAttribute('x', -(m.top + iH / 2)); yLbl.setAttribute('y', 12);
    yLbl.setAttribute('transform', 'rotate(-90)'); yLbl.setAttribute('text-anchor', 'middle');
    yLbl.setAttribute('font-size', '11'); yLbl.setAttribute('fill', 'currentColor');
    yLbl.textContent = 'B RMS (µT)';
    g.appendChild(yLbl);

    // X axis label
    const xLbl = document.createElementNS(ns, 'text');
    xLbl.setAttribute('x', m.left + iW / 2); xLbl.setAttribute('y', H - 4);
    xLbl.setAttribute('text-anchor', 'middle'); xLbl.setAttribute('font-size', '11');
    xLbl.setAttribute('fill', 'currentColor');
    xLbl.textContent = 'Distance from tray edge (in)';
    g.appendChild(xLbl);

    // X axis ticks
    [0, 30, 60, 90, 120].forEach(d => {
      const x = xScale(d);
      const tick = document.createElementNS(ns, 'line');
      tick.setAttribute('x1', x); tick.setAttribute('x2', x);
      tick.setAttribute('y1', m.top + iH); tick.setAttribute('y2', m.top + iH + 4);
      tick.setAttribute('stroke', 'currentColor');
      g.appendChild(tick);
      const lbl = document.createElementNS(ns, 'text');
      lbl.setAttribute('x', x); lbl.setAttribute('y', m.top + iH + 15);
      lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('font-size', '10');
      lbl.setAttribute('fill', 'currentColor');
      lbl.textContent = d;
      g.appendChild(lbl);
    });

    // ICNIRP limit lines
    function limitLine(b, color, label) {
      if (b > maxB) return;
      const y = yScale(b);
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', m.left); line.setAttribute('x2', m.left + iW);
      line.setAttribute('y1', y); line.setAttribute('y2', y);
      line.setAttribute('stroke', color); line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-dasharray', '6 3'); line.setAttribute('opacity', '0.75');
      g.appendChild(line);
      const txt = document.createElementNS(ns, 'text');
      txt.setAttribute('x', m.left + iW - 4); txt.setAttribute('y', y - 4);
      txt.setAttribute('text-anchor', 'end'); txt.setAttribute('font-size', '10');
      txt.setAttribute('fill', color); txt.textContent = label;
      g.appendChild(txt);
    }
    limitLine(gpLimit, '#ff5722', `GP ${gpLimit} µT`);
    limitLine(occLimit, '#ff9800', `Occ ${occLimit} µT`);

    // Field curve
    const points = profile.map((p, i) => `${xScale(distancesIn[i])},${yScale(p.bRms_uT)}`).join(' ');
    const polyline = document.createElementNS(ns, 'polyline');
    polyline.setAttribute('points', points);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', 'steelblue');
    polyline.setAttribute('stroke-width', '2');
    g.appendChild(polyline);

    svg.appendChild(g);
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
});

