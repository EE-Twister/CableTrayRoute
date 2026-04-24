/**
 * Project Report page script.
 *
 * Loads all project data from dataStore and generates a unified
 * report via analysis/projectReport.mjs. Supports:
 *   - Live preview in the page
 *   - Print / PDF via window.print()
 *   - JSON download of the raw report object
 */

import './workflowStatus.js';
import '../site.js';
import { getCables, getTrays, getConduits, getDuctbanks, getStudies, getStudyApprovals } from '../dataStore.mjs';
import { getProjectState } from '../projectStorage.js';
import { generateProjectReport, renderReportHTML } from '../analysis/projectReport.mjs';

document.addEventListener('DOMContentLoaded', () => {
  const previewEl   = document.getElementById('report-preview');
  const generateBtn = document.getElementById('generate-report-btn');
  const printBtn    = document.getElementById('print-report-btn');
  const exportBtn   = document.getElementById('export-json-btn');
  const statusEl    = document.getElementById('report-status');

  function setStatus(msg, type = 'info') {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = `report-status report-status--${type}`;
  }

  function buildReport() {
    const cables    = getCables();
    const trays     = getTrays();
    const conduits  = getConduits();
    const ductbanks = getDuctbanks();
    const studies   = getStudies();
    const approvals = getStudyApprovals();
    const state     = getProjectState();
    const projectName = (state && state.name) || document.getElementById('rpt-project-name')?.value?.trim() || 'Untitled Project';
    return generateProjectReport({ cables, trays, conduits, ductbanks, projectName, studies, approvals });
  }

  const tocEl = document.getElementById('report-toc');

  function showReport(report) {
    if (previewEl) {
      previewEl.innerHTML = renderReportHTML(report);
      previewEl.removeAttribute('hidden');
    }
    if (tocEl) tocEl.removeAttribute('hidden');
  }

  generateBtn?.addEventListener('click', () => {
    try {
      setStatus('Generating report…', 'info');
      const report = buildReport();
      showReport(report);
      setStatus(
        `Report generated: ${report.summary.counts.cables} cables, ${report.summary.counts.trays} trays. ` +
        `Clash severity: ${report.clashes.severity}. ` +
        `Validation: ${report.validation.pass ? 'PASS' : 'ISSUES FOUND'}.`,
        report.validation.pass && report.clashes.severity === 'pass' ? 'success' : 'warn'
      );
    } catch (err) {
      console.error('[projectReport] Generation failed:', err);
      setStatus('Report generation failed: ' + err.message, 'error');
    }
  });

  printBtn?.addEventListener('click', () => {
    try {
      const report = buildReport();
      showReport(report);
      setTimeout(() => window.print(), 200);
    } catch (err) {
      console.error('[projectReport] Print failed:', err);
      setStatus('Print preparation failed: ' + err.message, 'error');
    }
  });

  exportBtn?.addEventListener('click', () => {
    try {
      const report = buildReport();
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `project-report-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error('[projectReport] JSON export failed:', err);
      setStatus('Export failed: ' + err.message, 'error');
    }
  });
});
