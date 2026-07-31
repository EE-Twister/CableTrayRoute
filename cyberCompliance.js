import './site.js';
import * as dataStore from './dataStore.mjs';
import {
  deriveCyberAssets,
  normalizeCyberAsset,
  runCyberComplianceStudy
} from './analysis/cyberCompliance.mjs';

const ASSET_KEY = 'cyberComplianceAssets';
const STUDY_KEY = 'cyberCompliance';
let study = null;

function input(value = '', type = 'text', key = '') {
  const element = document.createElement('input');
  element.type = type;
  element.value = type === 'checkbox' ? '' : value;
  element.checked = type === 'checkbox' ? Boolean(value) : false;
  element.dataset.key = key;
  return element;
}

function assetRow(asset = {}) {
  const row = document.createElement('tr');
  const normalized = normalizeCyberAsset(asset);
  const protocol = normalized.protocols.join(', ');
  const cells = [
    input(normalized.id, 'text', 'id'), input(normalized.cyberAssetClass, 'text', 'cyberAssetClass'),
    input(normalized.cyberCriticality, 'text', 'cyberCriticality'), input(normalized.zone, 'text', 'zone'),
    input(normalized.firmwareVersion, 'text', 'firmwareVersion'), input(protocol, 'text', 'protocols'),
    input(normalized.remoteAccess.enabled, 'checkbox', 'remoteEnabled'), input(normalized.remoteAccess.mfa, 'checkbox', 'remoteMfa'),
    input(normalized.remoteAccess.logging, 'checkbox', 'remoteLogging'), input(normalized.remoteAccess.approvedPath, 'checkbox', 'approvedPath'),
    input(normalized.passwordPolicy, 'checkbox', 'passwordPolicy'), input(normalized.patchCurrent, 'checkbox', 'patchCurrent'),
    input(normalized.cipEvidence, 'text', 'cipEvidence')
  ];
  cells.forEach(field => { const cell = document.createElement('td'); cell.appendChild(field); row.appendChild(cell); });
  const removeCell = document.createElement('td');
  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'btn secondary-btn'; remove.textContent = 'Remove';
  remove.addEventListener('click', () => { row.remove(); persistAssets(); });
  removeCell.appendChild(remove); row.appendChild(removeCell);
  row.querySelectorAll('input').forEach(field => field.addEventListener('change', persistAssets));
  return row;
}

function readAssets() {
  return Array.from(document.querySelectorAll('#cyber-assets tbody tr')).map(row => {
    const values = Object.fromEntries(Array.from(row.querySelectorAll('[data-key]')).map(field => [field.dataset.key, field.type === 'checkbox' ? field.checked : field.value]));
    return normalizeCyberAsset({
      ...values,
      remoteAccess: { enabled: values.remoteEnabled, mfa: values.remoteMfa, logging: values.remoteLogging, approvedPath: values.approvedPath }
    });
  }).filter(asset => asset.id);
}

function persistAssets() {
  dataStore.setItem(ASSET_KEY, readAssets());
}

function renderAssets(assets) {
  const body = document.querySelector('#cyber-assets tbody');
  body.replaceChildren(...assets.map(assetRow));
}

function renderResults(result) {
  const summary = document.getElementById('cyber-summary');
  const output = document.querySelector('#cyber-results tbody');
  output.replaceChildren();
  if (!result) { summary.textContent = 'Run the assessment to generate an evidence matrix.'; return; }
  summary.textContent = `${result.summary.assets} assets reviewed; ${result.summary.assetsWithGaps} assets with gaps; ${result.summary.gap} evidence gaps.`;
  result.assessments.forEach(assessment => assessment.checks.forEach(check => {
    const row = document.createElement('tr');
    [assessment.asset.id, check.standard, check.title, check.status, check.detail].forEach(value => {
      const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell);
    });
    output.appendChild(row);
  }));
}

function exportCsv() {
  if (!study) return;
  const lines = [['asset', 'standard', 'control', 'status', 'detail']];
  study.assessments.forEach(assessment => assessment.checks.forEach(check => lines.push([assessment.asset.id, check.standard, check.title, check.status, check.detail])));
  const body = lines.map(line => line.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
  const link = document.createElement('a'); link.href = url; link.download = 'cyber-compliance-matrix.csv'; link.click(); URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', () => {
  const stored = dataStore.getItem(ASSET_KEY, []);
  renderAssets(Array.isArray(stored) ? stored : []);
  document.getElementById('add-cyber-asset-btn').addEventListener('click', () => {
    document.querySelector('#cyber-assets tbody').appendChild(assetRow());
  });
  document.getElementById('seed-cyber-assets-btn').addEventListener('click', () => {
    renderAssets(deriveCyberAssets({ equipment: dataStore.getEquipment(), panels: dataStore.getPanels(), oneLine: dataStore.getOneLine() }));
    persistAssets();
  });
  document.getElementById('run-cyber-study-btn').addEventListener('click', () => {
    persistAssets();
    study = runCyberComplianceStudy(readAssets());
    const studies = dataStore.getStudies();
    dataStore.setStudies({ ...studies, [STUDY_KEY]: study });
    renderResults(study);
  });
  document.getElementById('export-cyber-csv-btn').addEventListener('click', exportCsv);
  const studies = dataStore.getStudies();
  study = studies?.[STUDY_KEY] || null;
  renderResults(study);
});
