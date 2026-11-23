import { getItem, setItem, on, STORAGE_KEYS, getEquipment, getLoads, getCables, getTrays, getProjectMeta, getProjectInputFingerprint, getCurrentScenario, hasNamedProjectContext } from '../dataStore.mjs';
import { readProjectSessionValue, writeProjectSessionValue } from '../projectStorage.js';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { SUPPORTED_MOTOR_BREAKER_PICKUPS } from '../analysis/motorStarterPickup.mjs';
import { previewDesignProposal, applyDesignProposal, getPanelLocationOverrideCandidates, LAST_APPLIED_KEY, FAULT_EVOLUTION_VALIDATION_KEY, FAULT_STUDY_VALIDATION_KEY, DEVICE_FAULT_VALIDATION_KEY, CABLE_CATALOG_SOURCE_KEY, getDesignSynthesisFaultEvolutionContext, resolveDesignSynthesisFaultEvolutionValidation, resolveDesignSynthesisDeviceFaultValidation, resolveDesignSynthesisDeviceEvidence, resolveDesignSynthesisTransformerDeviceEvidence } from './design-synthesis/applyProposal.mjs';
import { renderSavedFaultEvolutionEvidence, bindSavedFaultEvolutionDownloads } from './design-synthesis/savedFaultEvolution.js';
import { buildDesignSynthesisProjectEquipmentAdoption, validateDesignSynthesisProjectEquipmentAdoption, bindDesignSynthesisProjectEquipmentProposal, isExcludedProjectEquipmentClass } from '../analysis/designSynthesisProjectEquipment.mjs';
import { editCorridorGraph, renderCorridorEditor } from './design-synthesis/corridorEditor.js';
import { buildProjectTrayHandoff, validateProjectTrayHandoff } from '../analysis/designSynthesisProjectTrays.mjs';
import { buildProjectTrayReuseBinding } from '../analysis/designSynthesisProjectTrayReuse.mjs';
import { buildDesignSynthesisOneLinePreview } from './design-synthesis/oneLinePreview.mjs';
import { buildPreliminaryCableSchedule } from './design-synthesis/preliminaryCableSchedule.mjs';
import { buildPreliminaryPanelSchedule } from './design-synthesis/preliminaryPanelSchedule.mjs';
import { buildPreliminaryRacewaySchedule } from './design-synthesis/preliminaryRacewaySchedule.mjs';
import { createReviewProject, reviewProjectEligibility } from './design-synthesis/reviewProject.mjs';
import { renderDesignSynthesisRoutePreview } from './design-synthesis/routePreview.mjs';
import { openStartingSourcePicker } from './design-synthesis/startingSourcePicker.js';
import { mountPersistentNavigation } from './components/navigation.js';
import './projectManagerEntry.js';
import '../site.js';

const DRAFT_KEY = 'designSynthesisDraft';
const PENDING_DRAFT_KEY = 'designSynthesisPendingDraft';
const DISTRIBUTION_BASELINE_KEY = 'designSynthesisDistributionBaseline';
const SAMPLE_URL = 'samples/design-synthesis-industrial.json';
const TRAY_CONGESTION_SAMPLE_URL = 'samples/design-synthesis-tray-congestion.json';
const EXISTING_TRAY_SAMPLE_URL = 'samples/design-synthesis-existing-tray.json';
const FAULT_SCENARIOS_SAMPLE_REFERENCE = 'Synthetic source scenarios for UI acceptance; not manufacturer or field data.';
const fields = ['supply', 'criteria', 'equipment', 'corridors'];
const starterBasisControls = [
  { id: 'branchProtectionMethod', path: ['criteria', 'motorStarter', 'branchProtectionMethod'], label: 'Motor branch protection method', options: ['manual-controller', 'inverse-time-breaker'] },
  { id: 'instantaneousPickupA', path: ['criteria', 'motorStarter', 'instantaneousPickupA'], label: 'Proposed TM230 instantaneous pickup (A)', options: SUPPORTED_MOTOR_BREAKER_PICKUPS, type: 'number' },
  { id: 'connection', path: ['supply', 'voltageSystem', 'connection'], label: 'Source connection', options: ['wye', 'delta'] },
  { id: 'grounding', path: ['supply', 'voltageSystem', 'grounding'], label: 'Source grounding', options: ['solid', 'resistance', 'ungrounded'] },
  { id: 'lineToGroundVoltageV', path: ['supply', 'voltageSystem', 'lineToGroundVoltageV'], label: 'Source line-to-ground voltage (V)', type: 'number' },
  { id: 'voltageSystemReference', path: ['supply', 'voltageSystem', 'reference'], label: 'Source voltage-system reference', type: 'text' },
  { id: 'controlVoltageV', path: ['criteria', 'motorStarter', 'controlVoltageV'], label: 'Starter control voltage (V)', type: 'number' },
  { id: 'controlCurrentType', path: ['criteria', 'motorStarter', 'controlCurrentType'], label: 'Starter control current type', options: ['AC', 'DC'] },
  { id: 'breakerAmbientTemperatureC', path: ['criteria', 'motorStarter', 'breakerAmbientTemperatureC'], label: '70 A breaker enclosure temperature (°C)', options: [40, 45, 50, 55, 60, 65, 70], type: 'number' },
  { id: 'breakerAmbientReference', path: ['criteria', 'motorStarter', 'breakerAmbientReference'], label: 'Breaker enclosure temperature reference', type: 'text' },
  { id: 's2BreakerAmbientTemperatureC', path: ['criteria', 'motorStarter', 's2BreakerAmbientTemperatureC'], label: '35–60 A S2 breaker enclosure temperature (°C)', options: [40, 45, 50, 55, 60, 65, 70], type: 'number' },
  { id: 's2BreakerAmbientReference', path: ['criteria', 'motorStarter', 's2BreakerAmbientReference'], label: '35–60 A S2 breaker enclosure temperature reference', type: 'text' },
  { id: 'enclosureHeight', path: ['criteria', 'motorStarter', 'enclosureMm', 'height'], label: 'Starter enclosure height (mm)', type: 'number' },
  { id: 'enclosureWidth', path: ['criteria', 'motorStarter', 'enclosureMm', 'width'], label: 'Starter enclosure width (mm)', type: 'number' },
  { id: 'enclosureDepth', path: ['criteria', 'motorStarter', 'enclosureMm', 'depth'], label: 'Starter enclosure depth (mm)', type: 'number' },
];
const state = { proposal: null, oneLinePreview: null, signature: '', engineSignature: '', draft: null, extraInput: {}, previewContext: null, generationBaseline: null, generationToken: 0, pendingProjectEquipmentAdoption: null, projectEquipmentAcknowledgements: null, selectedProjectEquipmentIds: null, pendingProjectTrayHandoff: null, projectTrayReview: null };

const pretty = value => JSON.stringify(value ?? {}, null, 2);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
let activeEvidenceProviders = null;
let proposalEvidenceProviders = [];
let freeEvidenceIndices = [];
let proposalHistoryPager = null;
const HISTORY_PAGE_SIZE = 50;
function evidenceDetails(label, getValue) {
  if (!activeEvidenceProviders) return `<details><summary>${esc(label)}</summary><pre>${esc(pretty(getValue()))}</pre></details>`;
  const index = freeEvidenceIndices.length ? freeEvidenceIndices.pop() : activeEvidenceProviders.length;
  activeEvidenceProviders[index] = getValue;
  return `<details data-proposal-evidence="${index}"><summary>${esc(label)}</summary><pre></pre></details>`;
}
function releaseProposalEvidence(container) {
  for (const detail of container.querySelectorAll('details[data-proposal-evidence]')) {
    const index = Number(detail.dataset.proposalEvidence);
    if (typeof proposalEvidenceProviders[index] === 'function') {
      proposalEvidenceProviders[index] = null;
      freeEvidenceIndices.push(index);
    }
  }
}
function bindProposalEvidence(output) {
  if (!output) return;
  output.addEventListener('toggle', event => {
    const detail = event.target;
    if (!(detail instanceof HTMLDetailsElement) || !detail.hasAttribute('data-proposal-evidence') || !output.contains(detail)) return;
    const pre = detail.querySelector(':scope > pre');
    if (!pre) return;
    if (!detail.open) { pre.textContent = ''; return; }
    const provider = proposalEvidenceProviders[Number(detail.dataset.proposalEvidence)];
    if (!provider) return;
    try { pre.textContent = pretty(provider()); }
    catch (error) { pre.textContent = `Could not render evidence: ${error.message || String(error)}`; }
  }, true);
  output.addEventListener('change', event => {
    if (!event.target.matches('[data-history-page-select]') || !proposalHistoryPager) return;
    const page = Number(event.target.value);
    const { histories, renderRow } = proposalHistoryPager;
    if (!Number.isInteger(page) || page < 0 || page * HISTORY_PAGE_SIZE >= histories.length) return;
    const body = output.querySelector('[data-history-page-body]');
    const status = output.querySelector('[data-history-page-status]');
    if (!body || !status) return;
    const start = page * HISTORY_PAGE_SIZE;
    let markup;
    activeEvidenceProviders = proposalEvidenceProviders;
    try { markup = histories.slice(start, start + HISTORY_PAGE_SIZE).map(renderRow).join(''); }
    finally { activeEvidenceProviders = null; }
    releaseProposalEvidence(body);
    body.innerHTML = markup;
    status.textContent = `Showing histories ${start + 1}–${Math.min(start + HISTORY_PAGE_SIZE, histories.length)} of ${histories.length}.`;
  });
}
const displayNumber = (value, digits = 3) => { const number = Number(value); return value === null || value === undefined || value === '' || !Number.isFinite(number) ? '—' : number.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1'); };
const displayCapacity = value => { if (value === null || value === undefined || value === '') return '—'; if (typeof value !== 'object') return displayNumber(value); return Object.entries(value).map(([key, item]) => `${displayNumber(item)} ${key.includes('Diameter') ? 'in diameter' : key.includes('Area') ? 'in² area' : key}`).join('; '); };
const candidateProvenance = selected => { if (!selected) return 'No manufacturer candidate'; const status = selected.status || selected.libraryStatus || selected.researchStatus || selected.selectionStatus || 'status unavailable'; const source = selected.source || selected.sourceDocument; const document = Array.isArray(selected.sourceDocuments) ? selected.sourceDocuments[0] : source; const label = document && typeof document === 'object' ? (document.title || document.id || document.publisher || document.url) : document; return `${status}${label ? ` · ${label}` : ''}`; };
function protectiveDeviceSummary(device, maximumOcpA) {
  if (!device) return `No selected candidate; screening maximum ${displayNumber(maximumOcpA, 2)} A`;
  const name = `${device.manufacturer || device.vendor || ''} ${device.catalogNumber || device.id || 'device'}`.trim();
  return `${name}; ${displayNumber(device.continuousCurrentA ?? device.tripRatingA, 2)} A; evaluated ${displayNumber(device.evaluatedVoltageVac ?? device.voltageRatingV ?? device.ratedVoltageVac, 0)} V; interrupting ${displayNumber(device.interruptingRatingKA, 2)} kA at ${displayNumber(device.interruptingRatingVoltageVac, 0)} V (${device.voltageApplicability || 'applicability not stated'}); basis ${device.faultBasis || device.faultTypes?.join?.(', ') || 'not stated'}; ${candidateProvenance(device)}; screening maximum ${displayNumber(maximumOcpA, 2)} A`;
}
function transformerDesignCurrent(transformer, side) {
  const voltage = Number(side === 'primary' ? transformer?.primaryVoltageVac : transformer?.secondaryVoltageVac);
  const kva = Number(transformer?.requiredKVA);
  return Number.isFinite(voltage) && voltage > 0 && Number.isFinite(kva) && kva > 0 ? kva * 1000 / (Math.sqrt(3) * voltage) : null;
}
function signature(input) { return JSON.stringify(input); }
function currentScenario() { return window.dataStore?.getCurrentScenario?.() || undefined; }
function readDistributionBaseline() { return window.dataStore?.getItem?.(DISTRIBUTION_BASELINE_KEY, null, currentScenario()) || null; }
function clearDistributionBaseline() { window.dataStore?.removeItem?.(DISTRIBUTION_BASELINE_KEY, currentScenario()); }
function deriveCanonicalBaseline() {
  const panels = window.dataStore?.getPanels?.() || [];
  const owned = panels.filter(panel => panel?._designSynthesis?.identity && Array.isArray(panel.loadIds));
  if (!owned.length) return null;
  const rows = owned.map(panel => ({ id: panel._designSynthesis.identity, loadIds: [...panel.loadIds] }));
  const highwater = rows.reduce((highest, row) => { const match = /^DP-(\d+)$/i.exec(String(row.id)); return match ? Math.max(highest, Number(match[1]) + 1) : highest; }, 1);
  return { panels: rows, nextPanelNumber: highwater };
}
function hasGenerationBaseline(rawInput) { return Boolean(rawInput && Object.prototype.hasOwnProperty.call(rawInput, 'generationBaseline')); }
function resolveGenerationBaseline(rawInput) { return hasGenerationBaseline(rawInput) ? rawInput.generationBaseline : (readDistributionBaseline() || window.dataStore?.getItem?.('designSynthesisLastApplied', null, currentScenario())?.distributionBaseline || deriveCanonicalBaseline()); }
function persistDistributionBaseline(proposal) {
  const baseline = proposal?.distributionBaseline || proposal?.updatedBaseline;
  if (proposal?.status === 'proposal' && baseline) window.dataStore?.setItem?.(DISTRIBUTION_BASELINE_KEY, baseline, currentScenario());
}
function status(message, kind = '') {
  const el = document.getElementById('synthesis-status');
  if (el) { el.textContent = message; el.dataset.kind = kind; }
}
function readDraft() {
  const draft = {};
  try {
    for (const field of fields) draft[field] = JSON.parse(document.getElementById(`synthesis-${field}`).value || '{}');
  } catch (error) { throw new Error(`Invalid ${error.message.replace(/^Unexpected token.*?JSON at position /, 'JSON at position ')}`); }
  const result = { ...state.extraInput, ...draft };
  for (const [key, id] of [['faultStudy', 'synthesis-fault-study'], ['faultScenarios', 'synthesis-fault-scenarios'], ['faultEvolution', 'synthesis-fault-evolution'], ['cableFaultWithstand', 'synthesis-cable-fault-withstand']]) {
    const editorText = document.getElementById(id)?.value || '';
    if (editorText.trim()) {
      try { result[key] = JSON.parse(editorText); }
      catch { result[key] = editorText; }
    } else delete result[key];
  }
  const accelerationText = document.getElementById('synthesis-motor-acceleration')?.value || '';
  if (accelerationText.trim()) {
    try { result.motorAccelerationInputs = JSON.parse(accelerationText); }
    catch { result.motorAccelerationInputs = accelerationText; }
  } else delete result.motorAccelerationInputs;
  return result;
}
function writeDraft(draft, { renderControls = true } = {}) {
  state.extraInput = Object.fromEntries(Object.entries(draft).filter(([key]) => !fields.includes(key)));
  state.draft = draft;
  for (const field of fields) document.getElementById(`synthesis-${field}`).value = pretty(draft[field]);
  const faultStudyEditor = document.getElementById('synthesis-fault-study');
  const faultStudyText = typeof draft.faultStudy === 'string' ? draft.faultStudy : draft.faultStudy ? pretty(draft.faultStudy) : '';
  if (faultStudyEditor && faultStudyEditor.value !== faultStudyText) faultStudyEditor.value = faultStudyText;
  const faultScenariosEditor = document.getElementById('synthesis-fault-scenarios');
  const faultScenariosText = typeof draft.faultScenarios === 'string' ? draft.faultScenarios : draft.faultScenarios ? pretty(draft.faultScenarios) : '';
  if (faultScenariosEditor && faultScenariosEditor.value !== faultScenariosText) faultScenariosEditor.value = faultScenariosText;
  const faultEvolutionEditor = document.getElementById('synthesis-fault-evolution');
  const faultEvolutionText = typeof draft.faultEvolution === 'string' ? draft.faultEvolution : draft.faultEvolution ? pretty(draft.faultEvolution) : '';
  if (faultEvolutionEditor && faultEvolutionEditor.value !== faultEvolutionText) faultEvolutionEditor.value = faultEvolutionText;
  const cableFaultWithstandEditor = document.getElementById('synthesis-cable-fault-withstand');
  const cableFaultWithstandText = typeof draft.cableFaultWithstand === 'string' ? draft.cableFaultWithstand : draft.cableFaultWithstand ? pretty(draft.cableFaultWithstand) : '';
  if (cableFaultWithstandEditor && cableFaultWithstandEditor.value !== cableFaultWithstandText) cableFaultWithstandEditor.value = cableFaultWithstandText;
  const accelerationEditor = document.getElementById('synthesis-motor-acceleration');
  const accelerationText = typeof draft.motorAccelerationInputs === 'string' ? draft.motorAccelerationInputs : draft.motorAccelerationInputs ? pretty(draft.motorAccelerationInputs) : '';
  if (accelerationEditor && accelerationEditor.value !== accelerationText) accelerationEditor.value = accelerationText;
  if (renderControls) renderInputControls(draft);
  setItem(DRAFT_KEY, draft);
  invalidate('Inputs changed. Generate a new proposal.');
}
function renderInputControls(draft) {
  const supply = draft.supply || {}; const criteria = draft.criteria || {};
  const corridorEditor = document.getElementById('synthesis-corridor-editor');
  if (corridorEditor) corridorEditor.innerHTML = renderCorridorEditor(draft.corridors);
  const control = (section, key, label, type = 'number') => `<label>${label}<input data-synthesis-control="${section}.${key}" type="${type}" value="${esc(draft[section]?.[key] ?? '')}"></label>`;
  const supplyEl = document.getElementById('synthesis-supply-controls');
  if (supplyEl) supplyEl.innerHTML = `${['id','voltage','phases','frequencyHz','capacityKva','availableFaultCurrentKA','x','y','z'].map(key => control('supply', key, key === 'id' ? 'Supply ID' : key === 'voltage' ? 'Voltage (V L-L)' : key === 'capacityKva' ? 'Capacity (kVA)' : key === 'availableFaultCurrentKA' ? 'Available source fault current (kA)' : key === 'frequencyHz' ? 'Frequency (Hz)' : ['x','y','z'].includes(key) ? `${key} (ft)` : key, key === 'id' ? 'text' : 'number')).join('')}<button type="button" class="btn" data-review-starting-source>Review starting source impedance</button>`;
  const criteriaEl = document.getElementById('synthesis-criteria-controls');
  if (criteriaEl) criteriaEl.innerHTML = `${['maxPanelLoadKva','maxLoadsPerPanel','maxEndpointAttachmentFt','voltageDropLimitPct','conductorMaterial','temperatureRatingC','code'].map(key => control('criteria', key, key === 'voltageDropLimitPct' ? 'VD limit (%)' : key, ['conductorMaterial','code'].includes(key) ? 'text' : 'number')).join('')}<fieldset class="synthesis-controls-group"><legend>Automatic load-flow revision</legend><label>Minimum operating voltage (%)<input data-load-flow-control="minimumVoltagePu" type="number" min="0" max="100" step="any" value="${esc(criteria.loadFlow?.minimumVoltagePu === undefined ? '' : Number(criteria.loadFlow.minimumVoltagePu) * 100)}"></label><label>Maximum revisions<input data-load-flow-control="maxRevisions" type="number" min="0" max="64" step="1" value="${esc(criteria.loadFlow?.maxRevisions ?? '')}"></label><label>Maximum iterations<input data-load-flow-control="maxIterations" type="number" min="0" max="200" step="1" value="${esc(criteria.loadFlow?.maxIterations ?? '')}"></label><p class="field-hint">Blank values use the stated defaults of 12 revisions and 60 solver iterations. The minimum voltage is entered as percent and stored as per-unit.</p></fieldset>`;
  if (criteriaEl) criteriaEl.insertAdjacentHTML('beforeend', `<label>Alternative endpoint connections<select data-alternate-endpoint-policy aria-label="Alternative endpoint connections">${criteria.allowAlternateEndpointAttachments !== undefined && typeof criteria.allowAlternateEndpointAttachments !== 'boolean' ? '<option value="invalid" selected>Invalid; choose a policy</option>' : ''}<option value="nearest" ${criteria.allowAlternateEndpointAttachments === false || criteria.allowAlternateEndpointAttachments === undefined ? 'selected' : ''}>Nearest node only</option><option value="allow" ${criteria.allowAlternateEndpointAttachments === true ? 'selected' : ''}>Allow alternate straight-line connections</option></select></label><p class="field-hint">Allowing alternatives authorizes a bounded search of other nodes within the endpoint distance limit. Straight-line field connections may cross obstacles or closed corridors; review their actual permission and installation before use.</p>`);
  const accelerationControls = document.getElementById('synthesis-motor-acceleration-controls');
  if (accelerationControls) accelerationControls.innerHTML = `<label>Maximum acceleration time (s)<input data-motor-acceleration-criterion="maximumTimeS" type="number" min="0" step="any" value="${esc(criteria.motorAcceleration?.maximumTimeS ?? '')}"></label>`;
  const starterEl = document.getElementById('synthesis-starter-basis-controls');
  if (starterEl) starterEl.innerHTML = `<fieldset class="synthesis-controls-group"><legend>Motor starter supply and control basis</legend>${starterBasisControls.map(item => {
    const rawValue = item.path.reduce((record, key) => record?.[key], draft);
    const value = rawValue ?? (item.id === 'branchProtectionMethod' ? 'manual-controller' : '');
    const unsupportedOption = item.options && value !== '' && !item.options.some(option => String(value) === String(option))
      ? `<option value="${esc(String(value))}" selected>Unsupported value: ${esc(String(value))}</option>`
      : '';
    const editor = item.options ? `<select data-starter-basis-control="${item.id}"><option value="" ${value === '' ? 'selected' : ''}>Not specified</option>${unsupportedOption}${item.options.map(option => `<option value="${option}" ${String(value) === String(option) ? 'selected' : ''}>${option === 'manual-controller' ? 'Manual controller (legacy default)' : option === 'inverse-time-breaker' ? 'Inverse-time breaker research route' : option}</option>`).join('')}</select>` : `<input data-starter-basis-control="${item.id}" type="${item.type}" ${item.type === 'number' ? 'step="any"' : ''} value="${esc(value)}">`;
    return `<label>${item.label}${editor}</label>`;
  }).join('')}<p class="field-hint">The inverse-time breaker option screens limited Siemens contactor, overload and 3VA51 or 3VA52 combinations. The project pickup is inherited unless an individual motor overrides or suppresses it. The 70 A and 35–60 A project temperature bases are independent referenced enclosure conditions, not cable ambient. Each applies only to its exact breaker candidates. Settings are proposals, not verified installed values. Protection remains blocked.</p></fieldset>`;
  const motorNameplates = document.getElementById('synthesis-motor-nameplates');
  if (motorNameplates) {
    const motorRows = (Array.isArray(draft.equipment) ? draft.equipment : []).flatMap((row, index) => {
      if (!row?.motor || typeof row.motor !== 'object' || Array.isArray(row.motor)) return [];
      const hasPickup = Object.prototype.hasOwnProperty.call(row.motor, 'instantaneousPickupA');
      const pickup = hasPickup ? row.motor.instantaneousPickupA === null ? 'none' : String(row.motor.instantaneousPickupA) : '';
      const invalidOption = pickup && pickup !== 'none' && !SUPPORTED_MOTOR_BREAKER_PICKUPS.some(value => String(value) === pickup) ? `<option value="${esc(pickup)}" selected>Unsupported value: ${esc(pickup)}</option>` : '';
      const ambient = row.motor.breakerAmbientTemperatureC === null ? 'none' : row.motor.breakerAmbientTemperatureC === undefined ? (row.motor.breakerAmbientReference !== undefined ? 'missing' : '') : String(row.motor.breakerAmbientTemperatureC);
      const ambientInvalid = ambient && ambient !== 'none' && ![40, 45, 50, 55, 60, 65, 70].some(value => String(value) === ambient) ? `<option value="${esc(ambient)}" selected>Unsupported or incomplete value: ${esc(ambient)}</option>` : '';
      return [`<tr data-motor-nameplate-index="${index}"><th scope="row">${esc(row.id || row.tag || index + 1)}</th><td>${esc(row.motor.nameplateCurrentA ?? '—')} A</td>${[['nameplateHorsepower', 'Motor nameplate horsepower'], ['nameplateFrequencyHz', 'Motor nameplate frequency (Hz)']].map(([key, label]) => `<td><input type="number" step="any" data-motor-nameplate-field="${key}" aria-label="${label} ${index + 1}" value="${esc(row.motor[key] ?? '')}"></td>`).join('')}<td><select data-motor-nameplate-field="rotorType" aria-label="Motor rotor type ${index + 1}"><option value="">Not specified</option>${[['squirrel-cage', 'Squirrel cage'], ['wound-rotor', 'Wound rotor'], ['synchronous', 'Synchronous']].map(([value, label]) => `<option value="${value}" ${row.motor.rotorType === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td><td><select data-motor-nameplate-field="instantaneousPickupA" aria-label="Motor proposed instantaneous pickup ${index + 1}"><option value="" ${pickup === '' ? 'selected' : ''}>Inherit project</option><option value="none" ${pickup === 'none' ? 'selected' : ''}>No proposed setting</option>${invalidOption}${SUPPORTED_MOTOR_BREAKER_PICKUPS.map(value => `<option value="${value}" ${pickup === String(value) ? 'selected' : ''}>${value} A</option>`).join('')}</select></td><td><select data-motor-nameplate-field="breakerAmbientTemperatureC" aria-label="Motor breaker enclosure temperature ${index + 1}"><option value="" ${ambient === '' ? 'selected' : ''}>Inherit project</option><option value="none" ${ambient === 'none' ? 'selected' : ''}>Not specified for this motor</option>${ambientInvalid}${[40, 45, 50, 55, 60, 65, 70].map(value => `<option value="${value}" ${ambient === String(value) ? 'selected' : ''}>${value} °C</option>`).join('')}</select></td><td><input type="text" data-motor-nameplate-field="breakerAmbientReference" aria-label="Motor breaker enclosure temperature reference ${index + 1}" value="${esc(row.motor.breakerAmbientReference ?? '')}"></td></tr>`];
    });
    motorNameplates.hidden = motorRows.length === 0;
    motorNameplates.innerHTML = motorRows.length ? `<h3>Motor nameplate basis for starter selection</h3><p class="field-hint">Horsepower is shaft output from the nameplate; equipment kW remains electrical input. Each proposed pickup overrides the project setting; available values depend on the selected breaker and do not establish starting suitability. The per-motor enclosure basis overrides the applicable project basis for 35, 50, 60 or 70 A research candidates and requires its own reference. Other breaker candidates do not use these tables.</p><div class="synthesis-table-wrap"><table class="synthesis-table"><thead><tr><th>Motor</th><th>Nameplate current</th><th>Nameplate hp</th><th>Nameplate Hz</th><th>Rotor type</th><th>Proposed pickup</th><th>Breaker enclosure °C</th><th>Enclosure temperature reference</th></tr></thead><tbody>${motorRows.join('')}</tbody></table></div>` : '';
  }
  const thermalEl = document.getElementById('synthesis-thermal-controls');
  if (thermalEl) thermalEl.innerHTML = `${control('criteria', 'ambientTempC', 'Global ambient (°C)', 'number')} ${control('criteria', 'bundledConductors', 'Global grouped conductors', 'number')}<label>Global solid cover length (ft)<input data-thermal-global="solidCoverContinuousLengthFt" type="number" step="any" value="${esc(criteria.thermal?.solidCoverContinuousLengthFt ?? '')}"></label><label>Endpoint installation<select data-endpoint-installation="method"><option value="">Not specified</option><option value="dedicated-emt" ${criteria.endpointInstallation?.method === 'dedicated-emt' ? 'selected' : ''}>Dedicated EMT</option></select></label><label>Maximum endpoint EMT size<select data-endpoint-installation="maximumTradeSize">${['1/2','3/4','1','1-1/4','1-1/2','2','2-1/2','3','3-1/2','4'].map(size => `<option value="${size}" ${(criteria.endpointInstallation?.maximumTradeSize ?? '4') === size ? 'selected' : ''}>${size}</option>`).join('')}</select></label><p class="field-hint">Endpoint conduit screening requires an explicit installation method when positive field legs exist.</p>`;
  const corridorThermal = document.getElementById('synthesis-corridor-thermal-controls');
  if (corridorThermal) {
    const edges = Array.isArray(draft.corridors?.edges) ? draft.corridors.edges : [];
    corridorThermal.innerHTML = edges.length ? `<h3>Per-corridor thermal assumptions</h3><p class="field-hint">Blank fields inherit the global screening criteria.</p><div class="synthesis-table-wrap"><table class="synthesis-table"><thead><tr><th>Corridor</th><th>Ambient °C</th><th>Grouped conductors</th><th>Solid cover (ft)</th></tr></thead><tbody>${edges.map((edge, index) => { const item = edge && typeof edge === 'object' ? edge : {}; return `<tr data-thermal-edge-index="${index}"><th scope="row">${esc(item.id || `edge-${index + 1}`)}</th><td><input data-thermal-edge-field="ambientTempC" type="number" step="any" value="${esc(item.thermal?.ambientTempC ?? '')}" aria-label="Ambient temperature for ${esc(item.id || `edge-${index + 1}`)}"></td><td><input data-thermal-edge-field="bundledConductors" type="number" step="any" value="${esc(item.thermal?.bundledConductors ?? '')}" aria-label="Grouped conductors for ${esc(item.id || `edge-${index + 1}`)}"></td><td><input data-thermal-edge-field="solidCoverContinuousLengthFt" type="number" step="any" value="${esc(item.thermal?.solidCoverContinuousLengthFt ?? '')}" aria-label="Solid cover length for ${esc(item.id || `edge-${index + 1}`)}"></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="text-muted">Add corridor edges to set per-corridor thermal assumptions.</p>';
  }
  const table = document.getElementById('synthesis-equipment-table');
  if (!table) return;
  const equipment = Array.isArray(draft.equipment) ? draft.equipment : [];
  const rows = equipment.map((item, index) => { const record = item && typeof item === 'object' ? item : {}; return `<tr data-equipment-index="${index}">${['id','tag','kw','voltage','phases','powerFactor','duty','x','y','z'].map(key => `<td><input data-equipment-field="${key}" aria-label="${key} ${index + 1}" value="${esc(record[key] ?? '')}" type="${['id','tag','duty'].includes(key) ? 'text' : 'number'}"></td>`).join('')}</tr>`; }).join('');
  table.innerHTML = `<table class="synthesis-table"><thead><tr>${['id','tag','kW','V','phases','PF','duty','x (ft)','y (ft)','z (ft)'].map(label => `<th>${label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
  renderProjectEquipmentPicker(draft);
  renderProjectTrayPicker(draft);
  const overrideHost = document.getElementById('synthesis-panel-overrides');
  if (overrideHost) {
    const overrides = draft.overrides?.panelLocations || {};
    const overrideRows = Object.entries(overrides).map(([panelId, value]) => `<tr data-panel-override-row="${esc(panelId)}"><td><input data-panel-override-field="panelId" value="${esc(panelId)}" aria-label="Panel ID ${esc(panelId)}" type="text"></td>${['x','y','z'].map(key => `<td><input data-panel-override-field="${key}" value="${esc(value?.[key] ?? '')}" aria-label="${key} override for ${esc(panelId)}" type="number"></td>`).join('')}<td><input data-panel-override-field="note" value="${esc(value?.note ?? '')}" aria-label="Override reason for ${esc(panelId)}" type="text"></td><td><button type="button" class="btn" data-panel-override-remove="${esc(panelId)}">Remove</button></td></tr>`).join('');
    overrideHost.innerHTML = `<table class="synthesis-table"><thead><tr><th>Panel ID</th><th>x (ft)</th><th>y (ft)</th><th>z (ft)</th><th>Reason / note</th><th></th></tr></thead><tbody>${overrideRows || '<tr><td colspan="6">No panel location overrides.</td></tr>'}</tbody></table>`;
  }
}
function projectEquipmentContext() {
  // The canonical getters may normalize legacy entity shapes. Capture the
  // input fingerprint only after those governed reads have completed.
  getEquipment(); getLoads();
  const meta = getProjectMeta() || {};
  const candidate = window.currentProjectId || meta.id || meta.projectId || meta.name || null;
  const projectId = candidate && !/^untitled$/i.test(String(candidate).trim()) ? String(candidate) : null;
  return { projectId, scenario: getCurrentScenario() || null, projectFingerprint: getProjectInputFingerprint?.() || null };
}
function projectTraySource() {
  const context = projectEquipmentContext();
  return { projectId: context.projectId, scenario: context.scenario, trays: getTrays(), cables: getCables(), routeResults: getItem('latestRouteResults', null, context.scenario), lastApplied: getItem(LAST_APPLIED_KEY, {}, context.scenario) || {} };
}
function renderProjectTrayPicker(draft = state.draft || {}) {
  const host = document.getElementById('synthesis-project-trays');
  if (!host) return;
  const source = projectTraySource();
  if (!source.projectId || hasNamedProjectContext() === false) { host.innerHTML = '<p class="text-muted">Open a named project to review its tray and cable records.</p>'; return; }
  let review = state.projectTrayReview || draft.projectTrayAdoption || {};
  if ((review.projectId && review.projectId !== source.projectId) || (review.scenario && review.scenario !== source.scenario)) review = {};
  const selected = new Set((review.selectedTrayIds || []).map(value => String(value).trim().toLowerCase()));
  const acknowledgements = review.acknowledgements || {};
  const reuseEvidence = review.reuseEvidence || {};
  const rows = source.trays.map(tray => { const id = String(tray?.tray_id || '').trim(); return `<tr><td><input type="checkbox" data-project-tray-select="${esc(id)}" aria-label="Select project tray ${esc(id || 'missing ID')}" ${selected.has(id.toLowerCase()) ? 'checked' : ''} ${id ? '' : 'disabled'}></td><th scope="row">${esc(id || '(missing tray ID)')}</th><td>${esc(tray?.tray_type || '—')}</td><td>${esc(`${tray?.start_x ?? '—'}, ${tray?.start_y ?? '—'}, ${tray?.start_z ?? '—'} → ${tray?.end_x ?? '—'}, ${tray?.end_y ?? '—'}, ${tray?.end_z ?? '—'}`)}</td><td>${esc(`${tray?.inside_width ?? '—'} × ${tray?.tray_depth ?? '—'}`)}</td></tr>`; }).join('');
  const pending = state.pendingProjectTrayHandoff;
  const issueRows = (pending?.issues || []).map(item => `<li>${esc(item.code)}: ${esc(item.message)}</li>`).join('');
  const mapping = (pending?.corridors?.edges || []).map(edge => `<tr><th scope="row">${esc(edge.id)}</th><td>${esc(edge.from)} → ${esc(edge.to)}</td><td>${esc(edge.widthIn)} × ${esc(edge.depthIn)} in</td><td>${esc(edge.existingTray.cables.map(cable => `${cable.id}: ${cable.quantity} × ${cable.conductorSize} (${cable.use}, ${cable.conductorCount} conductors), ${cable.outsideDiameterIn} in, ${cable.voltageRatingV} V`).join('; ') || 'Explicitly empty')}</td></tr>`).join('');
  host.innerHTML = `<p>Review ladder-tray geometry and canonical cable assignments. This replaces the draft corridor graph only after you choose to copy it; project records remain unchanged. Copied edges start closed and require an explicit permission change. Exact matching endpoints connect; crossings and near matches do not.</p><div class="synthesis-table-wrap"><table class="synthesis-table"><thead><tr><th>Select</th><th>Tray ID</th><th>Type</th><th>Start → end (ft)</th><th>Width × depth (in)</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No project trays available.</td></tr>'}</tbody></table></div><label>Inventory and cable-data reference <input type="text" data-project-tray-reference value="${esc(review.inventoryReference || '')}"></label><label>Thermal interaction study reference (optional for screening) <input type="text" data-project-tray-thermal-reference value="${esc(reuseEvidence.thermalReference || '')}"></label><label>Tray installation suitability reference (optional for screening) <input type="text" data-project-tray-installation-reference value="${esc(reuseEvidence.installationReference || '')}"></label><label><input type="checkbox" data-project-tray-evidence-confirm ${reuseEvidence.coverageConfirmed ? 'checked' : ''}> These references cover all selected trays and existing and proposed cables in the proposed configuration</label><fieldset class="synthesis-controls-group"><legend>Confirm project tray basis</legend><label><input type="checkbox" data-project-tray-ack="units" ${acknowledgements.units ? 'checked' : ''}> Coordinates are feet and dimensions are inches</label><label><input type="checkbox" data-project-tray-ack="inventory" ${acknowledgements.inventory ? 'checked' : ''}> Assigned cables and their dimensions, ratings, and quantities form a complete inventory</label><label><input type="checkbox" data-project-tray-ack="permission" ${acknowledgements.permission ? 'checked' : ''}> Selected tray paths may be considered for the proposed design</label><label><input type="checkbox" data-project-tray-ack="replaceGenerated" ${acknowledgements.replaceGenerated ? 'checked' : ''}> Previously generated trays, cables, and routes are uninstalled proposal records to be replaced, not existing installed assets</label></fieldset><button type="button" data-project-tray-review>Review selected project trays</button>${draft.projectTrayAdoption ? `<p>After copying the review, set explicit ambient, grouped-conductor, and cover values for each existing tray in the corridor thermal controls. Bind the references to the current design inputs before preliminary Apply.</p><button type="button" data-project-tray-bind>Bind referenced tray reuse basis</button>` : ''}${pending ? `<section aria-live="polite"><h4>Project tray mapping review</h4>${issueRows ? `<ul>${issueRows}</ul>` : `<p>${pending.corridors.edges.length} tray(s) reviewed. Confirm the actual inventory and route eligibility before opening edges.</p><div class="synthesis-table-wrap"><table class="synthesis-table"><thead><tr><th>Tray</th><th>Nodes</th><th>Width × depth</th><th>Assigned existing cables</th></tr></thead><tbody>${mapping}</tbody></table></div><button type="button" data-project-tray-copy>Replace draft corridors with reviewed trays</button>`}</section>` : ''}`;
}
async function reviewSelectedProjectTrays() {
  const selectedTrayIds = [...document.querySelectorAll('[data-project-tray-select]:checked')].map(input => input.dataset.projectTraySelect);
  const acknowledgements = Object.fromEntries([...document.querySelectorAll('[data-project-tray-ack]')].map(input => [input.dataset.projectTrayAck, input.checked]));
  const inventoryReference = document.querySelector('[data-project-tray-reference]')?.value || '';
  const reuseEvidence = readProjectTrayReuseEvidence(document);
  const source = projectTraySource();
  state.projectTrayReview = { selectedTrayIds, acknowledgements, inventoryReference, reuseEvidence, projectId: source.projectId, scenario: source.scenario };
  const token = state.projectTrayReviewToken = (state.projectTrayReviewToken || 0) + 1;
  state.pendingProjectTrayHandoff = null;
  try {
    const reviewed = await buildProjectTrayHandoff({ ...source, selectedTrayIds, acknowledgements, inventoryReference, reuseEvidence });
    if (token !== state.projectTrayReviewToken) return;
    state.pendingProjectTrayHandoff = reviewed;
    renderProjectTrayPicker(readDraft());
  } catch (error) {
    if (token === state.projectTrayReviewToken) status(`Could not review project trays: ${error.message}`, 'error');
  }
}
function readProjectTrayReuseEvidence(host) {
  return { thermalReference: host.querySelector('[data-project-tray-thermal-reference]')?.value || '', installationReference: host.querySelector('[data-project-tray-installation-reference]')?.value || '', coverageConfirmed: host.querySelector('[data-project-tray-evidence-confirm]')?.checked === true };
}
function invalidateProjectTrayReview() {
  const host = document.getElementById('synthesis-project-trays');
  if (!host) return;
  state.projectTrayReviewToken = (state.projectTrayReviewToken || 0) + 1;
  state.projectTrayReviewDirty = true;
  const source = projectTraySource();
  state.projectTrayReview = { selectedTrayIds: [...host.querySelectorAll('[data-project-tray-select]:checked')].map(input => input.dataset.projectTraySelect), acknowledgements: Object.fromEntries([...host.querySelectorAll('[data-project-tray-ack]')].map(input => [input.dataset.projectTrayAck, input.checked])), inventoryReference: host.querySelector('[data-project-tray-reference]')?.value || '', reuseEvidence: readProjectTrayReuseEvidence(host), projectId: source.projectId, scenario: source.scenario };
  state.pendingProjectTrayHandoff = null;
  host.querySelector('section')?.remove();
}
async function useReviewedProjectTrays() {
  const pending = state.pendingProjectTrayHandoff;
  if (!pending?.ok) return;
  const token = state.projectTrayReviewToken;
  let validation;
  try { validation = await validateProjectTrayHandoff({ ...projectTraySource(), adoption: pending.adoption, corridors: pending.corridors }); }
  catch (error) { if (token === state.projectTrayReviewToken) status(`Could not validate project trays: ${error.message}`, 'error'); return; }
  if (token !== state.projectTrayReviewToken || pending !== state.pendingProjectTrayHandoff) return;
  if (!validation.ok) { state.pendingProjectTrayHandoff = { ...pending, ok: false, issues: validation.issues }; renderProjectTrayPicker(readDraft()); return; }
  const draft = readDraft();
  state.pendingProjectTrayHandoff = null;
  state.projectTrayReviewDirty = false;
  const next = { ...draft, corridors: pending.corridors, projectTrayAdoption: pending.adoption };
  delete next.projectTrayReuseBinding;
  writeDraft(next);
  status(`Copied ${pending.corridors.edges.length} reviewed project tray(s) as closed corridors. Project records remain unchanged.`, 'success');
}
function bindProjectTrayReuse() {
  try {
    if (state.projectTrayReviewDirty) throw new Error('Review and copy the edited project-tray basis first.');
    const draft = readDraft();
    const rawInput = inputModel();
    const baseline = resolveGenerationBaseline(rawInput);
    const input = baseline !== null && baseline !== undefined && !hasGenerationBaseline(rawInput) ? { ...rawInput, generationBaseline: baseline } : rawInput;
    const source = projectTraySource();
    const current = validateProjectTrayHandoff({ ...source, adoption: input.projectTrayAdoption, corridors: input.corridors });
    if (!current.ok) throw new Error(current.issues.map(item => item.message).join(' '));
    const binding = buildProjectTrayReuseBinding(input);
    if (!binding.ok) throw new Error(binding.issues.map(item => item.message).join(' '));
    const nextDraft = { ...draft, projectTrayReuseBinding: binding.binding };
    if (Object.prototype.hasOwnProperty.call(input, 'generationBaseline')) nextDraft.generationBaseline = input.generationBaseline;
    writeDraft(nextDraft);
    status('Referenced tray reuse basis bound to the current design inputs. Generate and review the preliminary proposal.');
  } catch (error) { status(`Could not bind tray reuse basis: ${error.message}`, 'error'); }
}
function renderProjectEquipmentPicker(draft = state.draft || {}) {
  const host = document.getElementById('synthesis-project-equipment');
  if (!host) return;
  const context = projectEquipmentContext();
  if (!context.projectId || hasNamedProjectContext() === false) {
    host.innerHTML = '<p class="text-muted">Open a named project to review its equipment and linked load records.</p>';
    delete host.dataset.equipmentStructure;
    return;
  }
  const projectEquipment = getEquipment();
  const projectLoads = getLoads();
  const selected = new Set(state.selectedProjectEquipmentIds || (draft.projectEquipmentAdoption?.pairs || []).map(pair => String(pair.equipmentId)));
  const acknowledgements = state.projectEquipmentAcknowledgements || draft.projectEquipmentAdoption?.acknowledgements || {};
  state.projectEquipmentAcknowledgements = acknowledgements;
  const rowModels = projectEquipment.map(record => {
    const id = String(record?.id || '');
    const linked = projectLoads.filter(load => String(load?.equipmentId || '') === id);
    const categories = [record?.type, record?.category, record?.subCategory].filter(Boolean).map(value => String(value).toLowerCase());
    const generated = Boolean(record?._designSynthesis?.identity || record?._designSynthesis?.source === 'design-synthesis');
    const excluded = !id || generated || categories.some(isExcludedProjectEquipmentClass);
    const loadStatus = linked.length === 1 ? `Load ${linked[0].id || '(missing ID)'} · ${linked[0].kw ?? 'kW missing'} kW` : linked.length ? `${linked.length} linked loads; ambiguous` : record?.kw != null && String(record.kw).trim() ? `Equipment rating ${record.kw} kW · proposed load` : 'No linked load or equipment kW rating';
    return { id, excluded, tag: record?.tag || '—', description: record?.description || record?.category || record?.type || '—', loadStatus };
  });
  const rows = rowModels.map(row => `<tr><td><input type="checkbox" data-project-equipment-select="${esc(row.id)}" aria-label="Select project equipment ${esc(row.id)}" ${selected.has(row.id) ? 'checked' : ''} ${row.excluded ? 'disabled' : ''}></td><th scope="row">${esc(row.id || '(missing ID)')}</th><td>${esc(row.tag)}</td><td>${esc(row.description)}</td><td>${esc(row.loadStatus)}</td></tr>`).join('');
  const pending = state.pendingProjectEquipmentAdoption;
  const issueRows = pending?.issues?.map(item => `<li>${esc(item.code)}: ${esc(item.message)}</li>`).join('') || '';
  const previewRows = (pending?.selectedRows || []).map(row => `<tr><td>${esc(row.projectEquipmentId)}</td><td>${esc(row.projectLoadId)}</td><td>${esc(row.kw)} kW</td><td>${esc(row.voltage)} V · ${esc(row.phases)} phase(s)${row.frequencyHz !== undefined ? ` · ${esc(row.frequencyHz)} Hz` : ' · frequency inherited from project'}</td><td>${esc(`${row.x}, ${row.y}, ${row.z}`)} ft</td><td>${row.motor ? `Rated ${esc(row.motor.ratedVoltageV)} V; design FLC ${esc(row.motor.fullLoadCurrentA)} A (${esc(row.motor.fullLoadCurrentBasis?.reference || 'no reference')}); nameplate ${esc(row.motor.nameplateCurrentA)} A; locked rotor ${esc(row.motor.lockedRotorCurrentA)} A / PF ${esc(row.motor.lockedRotorPowerFactor)}; ${esc(row.motor.starterType)}${row.motor.nameplateHorsepower <= 40 ? `<br>Breaker enclosure: ${row.motor.breakerAmbientTemperatureC === null ? 'explicitly not specified' : row.motor.breakerAmbientTemperatureC !== undefined ? `${esc(row.motor.breakerAmbientTemperatureC)} °C (${esc(row.motor.breakerAmbientReference || 'reference missing')})` : 'inherits project basis'}.` : ''}${row.motorOperatingBasis ? `<br>Typical 100%-rated-load ${esc(row.motorOperatingBasis.model)} operating basis at 460 V; not guaranteed or verified installed. Constant-power screening at ${esc(row.voltage)} V is an assumption.` : ''}` : '—'}</td></tr>`).join('');
  const pendingMarkup = pending ? `<section data-project-equipment-pending aria-live="polite"><h4>Mapping review</h4>${issueRows ? `<ul>${issueRows}</ul>` : `<p>${pending.selectedRows.length} selected pair(s) map without missing or contradictory fields.</p><div class="synthesis-table-wrap"><table class="synthesis-table"><thead><tr><th>Equipment ID</th><th>Load ID</th><th>Rating</th><th>Voltage/phases</th><th>Coordinates</th><th>Motor inputs</th></tr></thead><tbody>${previewRows}</tbody></table></div><button type="button" class="btn btn-accent" data-project-equipment-copy ${pending.ok ? '' : 'disabled'}>Use reviewed equipment in draft</button>`}</section>` : '';
  const structure = signature({ projectId: context.projectId, scenario: context.scenario || 'default', rows: rowModels });
  if (host.dataset.equipmentStructure === structure && host.querySelector('[data-project-equipment-review]')) {
    host.querySelectorAll('[data-project-equipment-select]').forEach(input => { input.checked = selected.has(input.dataset.projectEquipmentSelect); });
    host.querySelectorAll('[data-project-equipment-ack]').forEach(input => { input.checked = Boolean(acknowledgements[input.dataset.projectEquipmentAck]); });
    host.querySelector('[data-project-equipment-pending]')?.remove();
    if (pendingMarkup) host.insertAdjacentHTML('beforeend', pendingMarkup);
    return;
  }
  host.innerHTML = `<p>Review project equipment with its uniquely linked load or an explicit equipment kW rating. A load is proposed when none is linked. This review does not mutate project records. Generated records, sources, panels, buses, and transformers are excluded.</p><div class="synthesis-table-wrap"><table class="synthesis-table"><thead><tr><th>Select</th><th>Equipment ID</th><th>Tag</th><th>Type</th><th>Load basis</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No project equipment available.</td></tr>'}</tbody></table></div><fieldset class="synthesis-controls-group"><legend>Confirm bases for selected project records</legend><label><input type="checkbox" data-project-equipment-ack="electricalInputKW" ${acknowledgements.electricalInputKW ? 'checked' : ''}> kW is electrical input power</label><label><input type="checkbox" data-project-equipment-ack="voltageLineToLine" ${acknowledgements.voltageLineToLine ? 'checked' : ''}> Voltage is line-to-line</label><label><input type="checkbox" data-project-equipment-ack="coordinatesFeet" ${acknowledgements.coordinatesFeet ? 'checked' : ''}> Equipment coordinates are feet</label></fieldset><p class="field-hint">Project ${esc(context.projectId)} · scenario ${esc(context.scenario || 'default')}. The selected source records and mapped values are checked again before Apply.</p><button type="button" class="btn" data-project-equipment-review>Review selected project equipment</button>${pendingMarkup}`;
  host.dataset.equipmentStructure = structure;
}
function reviewSelectedProjectEquipment() {
  const selectedEquipmentIds = [...document.querySelectorAll('[data-project-equipment-select]:checked')].map(input => input.dataset.projectEquipmentSelect);
  state.selectedProjectEquipmentIds = selectedEquipmentIds;
  const acknowledgements = Object.fromEntries([...document.querySelectorAll('[data-project-equipment-ack]')].map(input => [input.dataset.projectEquipmentAck, input.checked]));
  state.projectEquipmentAcknowledgements = acknowledgements;
  // Run canonical getters before capturing the project fingerprint because
  // they perform legacy shape normalization through the governed store API.
  const equipment = getEquipment();
  const loads = getLoads();
  const context = projectEquipmentContext();
  state.pendingProjectEquipmentAdoption = buildDesignSynthesisProjectEquipmentAdoption({ equipment, loads, selectedEquipmentIds, ...context, acknowledgements, lastApplied: getItem(LAST_APPLIED_KEY, null) });
  renderProjectEquipmentPicker(readDraft());
}
function useReviewedProjectEquipment() {
  const pending = state.pendingProjectEquipmentAdoption;
  if (!pending?.ok) return;
  const equipment = getEquipment();
  const loads = getLoads();
  const context = projectEquipmentContext();
  const draft = readDraft();
  const validation = validateDesignSynthesisProjectEquipmentAdoption({ adoption: pending.adoption, rows: pending.selectedRows, equipment, loads, ...context, lastApplied: getItem(LAST_APPLIED_KEY, null) });
  if (!validation.ok) {
    state.pendingProjectEquipmentAdoption = { ...pending, ok: false, issues: validation.issues };
    renderProjectEquipmentPicker(draft);
    status('Project equipment changed after review. Review the current records again before transfer.', 'error');
    return;
  }
  state.pendingProjectEquipmentAdoption = null;
  state.selectedProjectEquipmentIds = pending.adoption.pairs.map(pair => String(pair.equipmentId));
  writeDraft({ ...draft, equipment: pending.selectedRows, projectEquipmentAdoption: pending.adoption });
  status(`Copied ${pending.selectedRows.length} reviewed project equipment/load pair(s) into the draft. Project records are unchanged until a valid Apply.`, 'success');
}
function mutateControl(target) {
  const [section, key] = String(target.dataset.synthesisControl || '').split('.'); if (!section || !key) return;
  const draft = readDraft(); const value = target.type === 'number' && target.value !== '' ? Number(target.value) : target.value; const nextSection = { ...draft[section] }; if (section === 'criteria' && ['ambientTempC', 'bundledConductors'].includes(key) && target.value === '') delete nextSection[key]; else nextSection[key] = value; draft[section] = nextSection; writeDraft(draft, { renderControls: false });
}
function mutateLoadFlowControl(target) {
  const draft = readDraft(); const key = target.dataset.loadFlowControl; const raw = target.value.trim(); const loadFlow = { ...(draft.criteria?.loadFlow || {}) };
  if (!raw) delete loadFlow[key]; else loadFlow[key] = key === 'minimumVoltagePu' ? Number(raw) / 100 : Number(raw);
  const criteria = { ...(draft.criteria || {}) }; if (Object.keys(loadFlow).length) criteria.loadFlow = loadFlow; else delete criteria.loadFlow; draft.criteria = criteria; writeDraft(draft, { renderControls: false });
}
function mutateMotorAccelerationCriterion(target) {
  const draft = readDraft(); const criteria = { ...(draft.criteria || {}) }; const acceleration = { ...(criteria.motorAcceleration || {}) };
  if (target.value.trim() === '') delete acceleration[target.dataset.motorAccelerationCriterion];
  else acceleration[target.dataset.motorAccelerationCriterion] = Number(target.value);
  if (Object.keys(acceleration).length) criteria.motorAcceleration = acceleration; else delete criteria.motorAcceleration;
  draft.criteria = criteria; writeDraft(draft, { renderControls: false });
}
function mutateEquipment(target) {
  const row = target.closest('[data-equipment-index]'); if (!row) return; const draft = readDraft(); const index = Number(row.dataset.equipmentIndex); const key = target.dataset.equipmentField;
  const value = target.type === 'number' && target.value !== '' ? Number(target.value) : target.value; draft.equipment[index] = { ...draft.equipment[index], [key]: value }; writeDraft(draft, { renderControls: false });
}
function mutateStarterBasis(target) {
  const definition = starterBasisControls.find(item => item.id === target.dataset.starterBasisControl);
  if (!definition) return;
  const draft = readDraft();
  const before = signature(draft);
  let record = draft;
  const parents = [];
  for (const key of definition.path.slice(0, -1)) {
    const nested = record[key];
    record[key] = nested && typeof nested === 'object' && !Array.isArray(nested) ? { ...nested } : {};
    parents.push([record, key]); record = record[key];
  }
  const key = definition.path.at(-1);
  if (target.value === '') delete record[key];
  else record[key] = definition.type === 'number' ? Number(target.value) : target.value.trim();
  for (const [parent, childKey] of parents.reverse()) if (!Object.keys(parent[childKey]).length) delete parent[childKey];
  if (signature(draft) === before) return;
  writeDraft(draft, { renderControls: false });
}
function mutateMotorNameplate(target) {
  const index = Number(target.closest('[data-motor-nameplate-index]')?.dataset.motorNameplateIndex);
  const key = target.dataset.motorNameplateField;
  if (!Number.isInteger(index) || !['nameplateHorsepower', 'nameplateFrequencyHz', 'rotorType', 'instantaneousPickupA', 'breakerAmbientTemperatureC', 'breakerAmbientReference'].includes(key)) return;
  const draft = readDraft();
  if (!draft.equipment?.[index]?.motor) return;
  const equipment = draft.equipment.map((row, rowIndex) => {
    if (index !== rowIndex) return row;
    const motor = { ...row.motor };
    if (key === 'breakerAmbientTemperatureC' && target.value === '') { delete motor.breakerAmbientTemperatureC; delete motor.breakerAmbientReference; }
    else if (key === 'breakerAmbientTemperatureC' && target.value === 'none') { motor.breakerAmbientTemperatureC = null; motor.breakerAmbientReference = null; }
    else if (target.value === '') delete motor[key];
    else if (key === 'instantaneousPickupA' && target.value === 'none') motor[key] = null;
    else if (key === 'breakerAmbientTemperatureC') { motor[key] = Number(target.value); if (motor.breakerAmbientReference === null) delete motor.breakerAmbientReference; }
    else motor[key] = ['rotorType', 'breakerAmbientReference'].includes(key) ? target.value.trim() : Number(target.value);
    return { ...row, motor };
  });
  if (key === 'breakerAmbientTemperatureC' && (target.value === '' || target.value === 'none')) {
    const referenceControl = target.closest('[data-motor-nameplate-index]')?.querySelector('[data-motor-nameplate-field="breakerAmbientReference"]');
    if (referenceControl) referenceControl.value = '';
  }
  if (signature(equipment) === signature(draft.equipment)) return;
  writeDraft({ ...draft, equipment }, { renderControls: false });
}
function mutatePanelOverride(target) {
  const row = target.closest('[data-panel-override-row]'); if (!row) return;
  const draft = readDraft(); const oldId = row.dataset.panelOverrideRow; const key = target.dataset.panelOverrideField; const value = target.type === 'number' && target.value !== '' ? Number(target.value) : target.value;
  const locations = { ...(draft.overrides?.panelLocations || {}) }; const current = { ...(locations[oldId] || {}) };
  if (key === 'panelId') {
    const nextId = String(value).trim();
    if (!nextId) { status('Panel ID is required for a location override.', 'error'); renderInputControls(draft); return; }
    if (nextId !== oldId && Object.prototype.hasOwnProperty.call(locations, nextId)) { status(`Panel location override ${nextId} already exists; both entries were retained.`, 'error'); renderInputControls(draft); return; }
    if (nextId !== oldId) { delete locations[oldId]; locations[nextId] = current; }
  }
  else { current[key] = value; locations[oldId] = current; }
  writeDraft({ ...draft, overrides: { ...(draft.overrides || {}), panelLocations: locations } }, { renderControls: key === 'panelId' });
}
function usePanelLocationCandidate(button) {
  const panelId = String(button.dataset.panelLocationCandidate || '').trim();
  const x = Number(button.dataset.panelLocationX); const y = Number(button.dataset.panelLocationY); const z = Number(button.dataset.panelLocationZ);
  if (!panelId || ![x, y, z].every(Number.isFinite)) return;
  const draft = readDraft(); const locations = { ...(draft.overrides?.panelLocations || {}) };
  locations[panelId] = { ...(locations[panelId] || {}), x, y, z, note: locations[panelId]?.note || 'Accepted from the current canonical panel location.' };
  writeDraft({ ...draft, overrides: { ...(draft.overrides || {}), panelLocations: locations } });
}
function mutateThermalEdge(target) {
  const row = target.closest('[data-thermal-edge-index]'); if (!row) return;
  const draft = readDraft(); const index = Number(row.dataset.thermalEdgeIndex); const key = target.dataset.thermalEdgeField;
  const value = target.value === '' ? undefined : Number(target.value);
  const edges = (draft.corridors?.edges || []).map((edge, edgeIndex) => {
    if (edgeIndex !== index) return edge;
    const thermal = { ...((edge && edge.thermal) || {}) };
    if (value === undefined) delete thermal[key]; else thermal[key] = value;
    const next = { ...(edge || {}) };
    if (Object.keys(thermal).length) next.thermal = thermal; else delete next.thermal;
    return next;
  });
  draft.corridors = { ...draft.corridors, edges }; writeDraft(draft, { renderControls: false });
}
function mutateThermalGlobal(target) {
  const draft = readDraft(); const key = target.dataset.thermalGlobal; const raw = target.value.trim();
  const criteria = { ...(draft.criteria || {}) }; const thermal = { ...(criteria.thermal || {}) };
  if (!raw) delete thermal[key]; else thermal[key] = Number(raw);
  if (Object.keys(thermal).length) criteria.thermal = thermal; else delete criteria.thermal;
  draft.criteria = criteria; writeDraft(draft, { renderControls: false });
}
function mutateEndpointInstallation(target) {
  const draft = readDraft(); const key = target.dataset.endpointInstallation; const endpointInstallation = { ...(draft.criteria?.endpointInstallation || {}) };
  if (!target.value) delete endpointInstallation[key]; else endpointInstallation[key] = target.value;
  const criteria = { ...(draft.criteria || {}) }; if (Object.keys(endpointInstallation).length) criteria.endpointInstallation = endpointInstallation; else delete criteria.endpointInstallation; draft.criteria = criteria; writeDraft(draft, { renderControls: false });
}
function criterionUnit(key) {
  return { maxPanelLoadKva: 'kVA', maxLoadsPerPanel: 'loads', maxEndpointAttachmentFt: 'ft', voltageDropLimitPct: '%', temperatureRatingC: '°C', ambientTempC: '°C', solidCoverContinuousLengthFt: 'ft' }[key] || '';
}
function designCriteriaEntries(criteria, prefix = '') {
  if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) return prefix ? [{ key: prefix, value: criteria, unit: '' }] : [];
  return Object.entries(criteria).flatMap(([key, value]) => {
    const name = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) return designCriteriaEntries(value, name);
    return [{ key: name, value, unit: criterionUnit(key) }];
  });
}
function suppliedCriteria(proposal) {
  return proposal?.inputs?.original?.criteria || proposal?.inputs?.criteria || state.draft?.criteria || {};
}
function loadFlowStudy(proposal) { return proposal?.studyValidation || proposal?.loadFlowRevision || proposal?.loadFlowStudy || proposal?.studyRevision?.loadFlow || proposal?.loadFlow || null; }
function firstFinite(...values) { return values.find(value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))); }
function loadFlowStudyRows(proposal) {
  const study = loadFlowStudy(proposal);
  if (!study || typeof study !== 'object') return [];
  const initial = firstFinite(study.initialMinimumVoltagePu, study.initial?.minimumVoltagePu, study.history?.[0]?.final?.minimumVoltagePu, study.history?.[0]?.final?.minVoltagePu, study.history?.[0]?.minVoltagePu, study.metrics?.initialMinimumVoltagePu);
  const final = firstFinite(study.finalMinimumVoltagePu, study.final?.minimumVoltagePu, study.final?.minVoltagePu, study.metrics?.finalMinimumVoltagePu);
  const circuits = Array.isArray(study.final?.circuitResults) ? study.final.circuitResults : (Array.isArray(study.final?.circuits) ? study.final.circuits : []);
  const utilization = firstFinite(study.maxLoadUtilizationPct, study.metrics?.maxLoadUtilizationPct, study.final?.maxLoadUtilizationPct, circuits.length ? Math.max(...circuits.map(item => Number.isFinite(Number(item.designCurrentA ?? item.currentA)) && Number(item.cableAmpacityA) > 0 ? Number(item.designCurrentA ?? item.currentA) / Number(item.cableAmpacityA) * 100 : 0)) : undefined);
  const current = firstFinite(study.maxCurrentUtilizationPct, study.metrics?.maxCurrentUtilizationPct, study.final?.maxCurrentUtilizationPct, circuits.length ? Math.max(...circuits.map(item => Number.isFinite(Number(item.designCurrentA ?? item.currentA)) && Number(item.protectiveContinuousA) > 0 ? Number(item.designCurrentA ?? item.currentA) / Number(item.protectiveContinuousA) * 100 : 0)) : undefined);
  const sourceKva = firstFinite(study.sourceKvaIncludingLosses, study.metrics?.sourceKvaIncludingLosses, study.final?.sourceKvaIncludingLosses, study.final?.sourceApparentPowerKva, study.final?.sourceKva);
  const historyChanges = (study.history || []).flatMap(item => Array.isArray(item?.conductorChanges) ? item.conductorChanges : []);
  const revisions = firstFinite(study.revisionCount, study.revisions?.length, study.metrics?.revisionCount, Array.isArray(study.history) ? Math.max(0, study.history.length - 1) : undefined);
  const changes = firstFinite(study.conductorChangeCount, study.conductorChanges?.length, study.metrics?.conductorChangeCount, historyChanges.length);
  const rows = [['Status', study.status || study.outcome || (study.converged === true ? 'converged' : study.converged === false ? 'nonconverged' : 'not evaluated')]];
  if (study.stopReason) rows.push(['Stop reason', study.stopReason]);
  if (study.criteria?.minimumVoltagePu !== undefined) rows.push(['Minimum voltage criterion', `${displayNumber(study.criteria.minimumVoltagePu, 4)} pu`]);
  if (study.criteria?.maxRevisions !== undefined) rows.push(['Revision budget', study.criteria.maxRevisions]);
  if (study.criteria?.maxIterations !== undefined) rows.push(['Iteration budget', study.criteria.maxIterations]);
  if (initial !== undefined) rows.push(['Initial minimum voltage', `${displayNumber(initial, 4)} pu`]);
  if (final !== undefined) rows.push(['Final minimum voltage', `${displayNumber(final, 4)} pu`]);
  if (utilization !== undefined) rows.push(['Maximum design current / cable ampacity utilization', `${displayNumber(utilization, 2)} %`]);
  if (current !== undefined) rows.push(['Maximum design current / protection utilization', `${displayNumber(current, 2)} %`]);
  if (sourceKva !== undefined) rows.push(['Source demand including losses', `${displayNumber(sourceKva, 2)} kVA`]);
  if (study.final?.lossKw !== undefined) rows.push(['Calculated source losses', `${displayNumber(study.final.lossKw, 3)} kW`]);
  if (revisions !== undefined) rows.push(['Revision count', revisions]);
  if (changes !== undefined) rows.push(['Conductor changes', changes]);
  const changeDetails = [...(Array.isArray(study.conductorChanges) ? study.conductorChanges : []), ...historyChanges];
  if (changeDetails.length) rows.push(['Conductor change detail', changeDetails.slice(0, 50).map(item => item?.message || `${item?.cableId || item?.circuitId || item?.id || 'cable'}: ${item?.from || item?.fromSize || item?.previousSize || '—'} → ${item?.to || item?.toSize || item?.conductorSize || '—'}`).join('; ')]);
  if (changes === undefined && !changeDetails.length) rows.push(['Conductor changes', 'Not enumerated in study evidence; review cable rows.']);
  const reasons = [...(Array.isArray(study.reasons) ? study.reasons : []), ...(Array.isArray(study.revisionReasons) ? study.revisionReasons : []), ...(Array.isArray(study.blockingReasons) ? study.blockingReasons : []), ...(Array.isArray(study.warnings) ? study.warnings : []), ...(Array.isArray(study.final?.warnings) ? study.final.warnings : []), ...(Array.isArray(study.issues) ? study.issues : [])];
  if (Array.isArray(reasons) && reasons.length) rows.push(['Reasons', reasons.map(item => item?.message || item?.code || item).join('; ')]);
  return rows;
}
function loadFlowStudyReport(proposal) { return loadFlowStudyRows(proposal).map(([label, value]) => `- ${label}: ${value}`); }
function sourceFaultRows(proposal) {
  const evidence = proposal.sourceFaultConsistency;
  if (!evidence) return [];
  const impedance = evidence.sourceImpedanceOhm;
  return [
    ['Conditional source fault-bound comparison', evidence.status || 'blocked'],
    ['Source line-to-line voltage', `${displayNumber(evidence.sourceVoltageV, 3)} V`],
    ['Source phases', evidence.sourcePhases ?? 'not supplied'],
    ['Source R / X / magnitude', impedance ? `${displayNumber(impedance.r, 8)} / ${displayNumber(impedance.x, 8)} / ${displayNumber(impedance.magnitude, 8)} ohm per phase` : 'Unavailable'],
    ['Source impedance reference', impedance?.reference || 'Not supplied'],
    ['Implied source-only three-phase fault current', `${displayNumber(evidence.impliedSourceOnlyFaultCurrentKA, 6)} kA`],
    ['Declared external-source upper bound', `${displayNumber(evidence.declaredAvailableFaultCurrentKA, 6)} kA`],
    ['Comparison', evidence.comparison?.relation || 'unavailable'],
    ['Basis and limits', 'Nominal internal source voltage 1.0 pu; source-only symmetrical three-phase current. Motor contributions, downstream fault transfer, asymmetrical duty, ground faults and coordination remain unevaluated.'],
    ['Diagnostics', (evidence.issues || []).map(item => item.message).join('; ') || 'No consistency issue detected'],
  ];
}
function sourceFaultReview(proposal) {
  const rows = sourceFaultRows(proposal);
  if (!rows.length) return '';
  return `<section id="synthesis-source-fault-review"><h3>Conditional source fault-bound comparison</h3><p>This conditional source-only comparison uses the starting model's 1.0 pu internal voltage; its own complete fault-duty and motor-contribution check remains unevaluated. A separate evaluated explicit fault network may report initial symmetrical RMS contributions for its modeled cases, but this comparison does not establish local device duty, interrupting capability, or coordination.</p><div style="overflow:auto"><table class="synthesis-table"><tbody>${rows.map(([label, value]) => `<tr><th scope="row">${esc(label)}</th><td>${esc(value)}</td></tr>`).join('')}</tbody></table></div>${evidenceDetails("Conditional source comparison evidence", () => (proposal.sourceFaultConsistency))}</section>`;
}
function faultStudySources(proposal) {
  return Array.isArray(proposal?.faultStudy?.sources) ? proposal.faultStudy.sources : [];
}
function faultStudyReview(proposal) {
  const validation = proposal?.faultStudyValidation;
  if (!validation && !proposal?.faultStudy) return '';
  const cases = validation?.cases || [];
  const inventory = validation?.sourceInventory || proposal.faultStudy?.sourceInventory || {};
  const coverage = validation?.coverage;
  const sourceRows = faultStudySources(proposal).map(source => `<tr><td>${esc(source?.equipmentId || '—')}</td><td>${esc(source?.inService === true ? 'in service' : source?.inService === false ? 'out of service' : 'not supplied')}</td><td>${esc(source?.reference || 'reference missing')}</td></tr>`).join('');
  const caseSections = cases.map(item => {
    const result = item.result || item;
    const fault = result.fault || {};
    const busId = item.busId || item.faultBusId || fault.busId || 'unknown';
    const contributionRows = (result.sourceFaultContributions || []).map(row => `<tr><td>${esc(row.sourceId)}</td><td>${esc(displayNumber(row.currentKA?.magnitude, 6))} kA</td><td>${esc(`${displayNumber(row.currentKA?.re, 6)} + j${displayNumber(row.currentKA?.im, 6)} kA`)}</td></tr>`).join('');
    const terminalRows = (result.sourceTerminalCurrents || []).map(row => `<tr><td>${esc(row.sourceId)}</td><td>${esc(displayNumber(row.currentKA?.magnitude, 6))} kA</td><td>${esc(`${displayNumber(row.currentKA?.re, 6)} + j${displayNumber(row.currentKA?.im, 6)} kA`)}</td></tr>`).join('');
    const issues = result.issues || [];
    return `<article class="synthesis-motor-starter-case"><h4>Fault at ${esc(busId)}</h4><p><strong>Case status:</strong> ${esc(result.status || validation?.status || 'blocked')}; <strong>initial symmetrical RMS:</strong> ${esc(displayNumber(fault.faultCurrentRmsKA, 6))} kA.</p>${issues.length ? `<ul>${issues.map(entry => `<li>${esc(entry.code || 'issue')} (${esc(entry.path || 'input')}): ${esc(entry.message || 'Validation failed')}</li>`).join('')}</ul>` : ''}<h5>Per-infeed fault-current contributions</h5><p>These are superposition contributions to the fault, with other in-service source impedances retained. They are distinct from current delivered at each source terminal.</p><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Source</th><th>Contribution magnitude</th><th>Contribution phasor</th></tr></thead><tbody>${contributionRows || '<tr><td colspan="3">No evaluated contributions.</td></tr>'}</tbody></table></div><h5>Actual source-terminal currents</h5><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Source</th><th>Terminal-current magnitude</th><th>Terminal-current phasor</th></tr></thead><tbody>${terminalRows || '<tr><td colspan="3">No evaluated terminal currents.</td></tr>'}</tbody></table></div>${evidenceDetails("Full fault-network case evidence", () => (result))}</article>`;
  }).join('');
  const issues = validation?.issues || [];
  const limitations = validation?.limitations || cases.flatMap(item => (item.result || item).limitations || []);
  const uniqueLimitations = [...new Set(limitations)];
  return `<section id="synthesis-fault-study-review"><h3>Optional fault-network study</h3><p>This explicit-source study reports balanced positive-sequence, three-phase bolted-fault initial symmetrical RMS only. It does not calculate minimum or maximum fault duty, peak or interrupting duty, thermal duty, protective clearing, motor decay, or coordination, and it does not complete motor protection or enable Apply.</p><table class="synthesis-table"><tbody><tr><th>Validation status</th><td>${esc(validation?.status || 'not evaluated')}</td></tr><tr><th>Method and scope</th><td>${esc(validation?.method || 'not returned')} · ${esc(validation?.scope || 'initial-symmetrical-rms-only')}</td></tr><tr><th>Model input fingerprint</th><td>${esc(validation?.modelInputFingerprint || 'not returned')}</td></tr><tr><th>Source inventory</th><td>${esc(inventory.status || 'unknown')} · ${esc(inventory.reference || 'reference not supplied')} · not independently verified</td></tr><tr><th>Modeled source coverage</th><td>${esc(coverage ? JSON.stringify(coverage) : 'No coverage result returned')}</td></tr></tbody></table>${sourceRows ? `<h4>Explicit source references</h4><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Equipment ID</th><th>State</th><th>Reference</th></tr></thead><tbody>${sourceRows}</tbody></table></div>` : ''}${issues.length ? `<h4>Validation issues</h4><ul>${issues.map(entry => `<li>${esc(entry.code || 'issue')} (${esc(entry.path || 'input')}): ${esc(entry.message || 'Validation failed')}</li>`).join('')}</ul>` : ''}${caseSections || '<p>No fault-bus cases were evaluated; no numeric fault current is shown.</p>'}${uniqueLimitations.length ? `<h4>Study limitations</h4><ul>${uniqueLimitations.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}${evidenceDetails("Fault-network validation and supplied input JSON", () => ({ validation, input: proposal.faultStudy }))}</section>`;
}
function faultEvolutionReview(proposal) {
  const validation = proposal?.faultEvolutionValidation;
  if (!validation || validation.status === 'not-requested') return '';
  const histories = (Array.isArray(validation.deviceHistories) ? validation.deviceHistories : []).filter(item => item && typeof item === 'object');
  const renderHistoryRow = history => {
    const rows = Array.isArray(history.timeRows) ? history.timeRows.filter(row => row && typeof row === 'object') : [];
    const values = rows.map(row => row.currentRmsKA).filter(value => typeof value === 'number' && Number.isFinite(value));
    const first = rows[0];
    const last = rows.at(-1);
    const trace = rows.map(row => `<tr><td>${esc(displayNumber(row.timeS, 5))} s</td><td>${esc(`${displayNumber(row.currentKA?.re, 6)} + j${displayNumber(row.currentKA?.im, 6)} kA`)}</td><td>${esc(displayNumber(row.currentRmsKA, 6))} kA RMS</td></tr>`).join('');
    const extrema = history.currentExtrema;
    const minimumLabel = extrema ? `minimum ${displayNumber(extrema.minimumRmsKA, 6)} kA RMS at ${displayNumber(extrema.minimumTimeS, 5)} s (interval extrema)` : `sampled-knot minimum ${displayNumber(values.length ? Math.min(...values) : null, 6)} kA RMS`;
    const maximumLabel = extrema ? `maximum ${displayNumber(extrema.maximumRmsKA, 6)} kA RMS at ${displayNumber(extrema.maximumTimeS, 5)} s (interval extrema)` : `sampled-knot maximum ${displayNumber(values.length ? Math.max(...values) : null, 6)} kA RMS`;
    return `<tr><td>${esc(history.placementId || 'device')}</td><td>${esc(history.caseId || history.caseKind || 'fault case')} · ${esc(history.caseKind || 'not returned')} · ${esc(history.faultBusId || 'bus not returned')}</td><td>${esc(history.coverageStatus || 'not returned')}</td><td>${esc(displayNumber(first?.currentRmsKA, 6))} kA RMS</td><td>${esc(minimumLabel)}</td><td>${esc(maximumLabel)}</td><td>${esc(displayNumber(last?.currentRmsKA, 6))} kA RMS</td><td>${esc(displayNumber(history.currentSquaredExposureA2S, 4))} A²·s</td><td><details><summary>History (${esc(displayNumber(rows.length, 0))} knots)</summary><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Time</th><th>Signed complex through-device RMS phasor</th><th>Through-device current</th></tr></thead><tbody>${trace || '<tr><td colspan="3">No current history rows returned.</td></tr>'}</tbody></table>${evidenceDetails("Exact device history and exposure intervals", () => (history))}</div></details></td></tr>`;
  };
  const paged = Boolean(activeEvidenceProviders) && histories.length > HISTORY_PAGE_SIZE;
  if (paged) proposalHistoryPager = { histories, renderRow: renderHistoryRow };
  const historyRows = (paged ? histories.slice(0, HISTORY_PAGE_SIZE) : histories).map(renderHistoryRow).join('');
  const options = paged ? Array.from({ length: Math.ceil(histories.length / HISTORY_PAGE_SIZE) }, (_, page) => {
    const start = page * HISTORY_PAGE_SIZE;
    return `<option value="${page}">${start + 1}–${Math.min(start + HISTORY_PAGE_SIZE, histories.length)}</option>`;
  }).join('') : '';
  const pageControls = paged ? `<label>Device history page <select data-history-page-select aria-label="Device history page">${options}</select></label><p data-history-page-status aria-live="polite">Showing histories 1–${Math.min(HISTORY_PAGE_SIZE, histories.length)} of ${histories.length}.</p>` : '';
  const historySections = historyRows ? `<h4>Device history summaries</h4>${pageControls}<div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Placement</th><th>Fault case</th><th>Coverage</th><th>Initial</th><th>Minimum</th><th>Maximum</th><th>Final</th><th>Current-squared exposure</th><th>Detailed history</th></tr></thead><tbody ${paged ? 'data-history-page-body' : ''}>${historyRows}</tbody></table></div>` : '';
  const profileRows = (Array.isArray(proposal.faultEvolution?.profiles) ? proposal.faultEvolution.profiles : []).filter(item => item && typeof item === 'object').map(profile => `<tr><td>${esc(profile.equipmentId || 'source')}</td><td>${esc(profile.source?.evidenceClass || 'unverified')} · ${esc(profile.source?.reference || 'profile source reference missing')}</td><td>${esc(displayNumber(profile.conditions?.ambientTemperatureC, 2))} °C · ${esc(displayNumber(profile.conditions?.frequencyHz, 1))} Hz · ${esc(displayNumber(profile.conditions?.phases, 0))} phases · ${esc(JSON.stringify(profile.conditions?.voltageRangeV || []))} V (${esc(profile.conditions?.reference || 'condition reference missing')})</td><td>${esc((Array.isArray(profile.points) ? profile.points : []).filter(point => point && typeof point === 'object').map(point => `${displayNumber(point.timeS, 5)} s: ${displayNumber(point.emfMultiplier, 5)}×`).join('; ') || 'no profile points')}</td></tr>`).join('');
  const issues = (Array.isArray(validation.issues) ? validation.issues : []).map(entry => `<li>${esc(entry.code || 'issue')} (${esc(entry.path || 'faultEvolution')}): ${esc(entry.message || 'Evaluation blocked.')}</li>`).join('');
  const knots = Array.isArray(validation.timeKnotsS) ? validation.timeKnotsS.map(value => displayNumber(value, 5)).join(', ') : 'not returned';
  const limitations = (Array.isArray(validation.limitations) ? validation.limitations : []).map(item => `<li>${esc(item)}</li>`).join('');
  return `<section id="synthesis-fault-evolution-review"><h3>Supplied fault source-profile history</h3><p>This is a deterministic, externally supplied, piecewise-linear real EMF-multiplier history evaluated as balanced RMS phasors on the fixed fault network. It does not model a transient motor waveform, DC offset/peak, protective clearing, conductor damage, thermal rating, SCCR, or protection adequacy. A zero multiplier suppresses the source EMF while retaining its passive impedance and in-service state.</p><table class="synthesis-table"><tbody><tr><th>Validation status</th><td>${esc(validation.status || 'blocked')}</td></tr><tr><th>Method and scope</th><td>${esc(validation.method || 'not returned')} · ${esc(validation.scope || 'not returned')}</td></tr><tr><th>Input fingerprint</th><td>${esc(validation.modelInputFingerprint || 'not returned')}</td></tr><tr><th>Common time knots</th><td>${esc(knots)}</td></tr><tr><th>Source evidence</th><td>${esc(validation.evidenceStatus || 'supplied-unverified')}; profiles and references are not independently verified.</td></tr><tr><th>Protection adequacy</th><td>${esc(validation.protectionAdequacy || 'unevaluated')}</td></tr><tr><th>Fault cases evaluated</th><td>${esc(displayNumber(Array.isArray(validation.faultCases) ? validation.faultCases.length : 0, 0))}</td></tr><tr><th>Device histories</th><td>${esc(displayNumber(histories.length, 0))}</td></tr></tbody></table>${profileRows ? `<h4>Supplied source profiles</h4><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Exact source equipment ID</th><th>Profile evidence</th><th>Conditions and voltage bounds</th><th>Multiplier points</th></tr></thead><tbody>${profileRows}</tbody></table></div>` : ''}${issues ? `<h4>Validation issues</h4><ul>${issues}</ul>` : ''}${historySections || '<p>No device fault-current histories were evaluated.</p>'}<h4>Study limitations</h4><ul>${limitations || '<li>Externally supplied profile history only; no protection adequacy conclusion.</li>'}</ul>${evidenceDetails("Complete fault-evolution input and validation JSON", () => ({ input: proposal.faultEvolution, validation }))}</section>`;
}

function cableFaultLocation(row) {
  return row?.caseKind === 'continuous-cable-span-envelope'
    ? `span ${row.faultSpanId} at ${displayNumber(100 * row.faultPosition, 5)}% from its FROM end (enclosed candidate)`
    : `bus ${row?.faultBusId || 'not available'}`;
}
function cableFaultWithstandReview(proposal) {
  const validation = proposal?.cableFaultWithstandValidation;
  if (!validation && proposal?.cableFaultWithstand === undefined) return '';
  const revision = proposal?.cableFaultWithstandRevision;
  const revisionRows = (Array.isArray(revision?.history) ? revision.history : []).map(row => {
    const conductors = (row.conductorChanges || []).map(change => `${change.cableId}: ${change.fromSize || 'new'} → ${change.toSize || 'removed'}`).join('; ') || 'none';
    const routes = (row.routeChanges || []).map(change => `${change.id}: ${change.before?.segments?.map(segment => segment.tray || segment.conduit || segment.raceway).filter(Boolean).join(' → ') || 'none'} → ${change.after?.segments?.map(segment => segment.tray || segment.conduit || segment.raceway).filter(Boolean).join(' → ') || 'none'}`).join('; ') || 'none';
    const racewayState = item => item ? [item.conduitType, item.tradeSize, item.cableIds?.length ? `cables ${item.cableIds.join(', ')}` : null,
      Number.isFinite(item.fillPercent) ? `fill ${displayNumber(item.fillPercent, 3)}%` : null,
      Number.isFinite(item.utilizationPercent) ? `utilization ${displayNumber(item.utilizationPercent, 3)}%` : null,
      Number.isFinite(item.used?.smallCableAreaIn2) ? `area ${displayNumber(item.used.smallCableAreaIn2, 4)}/${displayNumber(item.allowable?.smallCableAreaIn2, 4)} in²` : null,
      Number.isFinite(item.cableCount) ? `${displayNumber(item.cableCount, 0)} cables` : null,
      item.conductorOdsIn?.length ? `OD ${item.conductorOdsIn.map(od => `${od.cableId} ${displayNumber(od.outsideDiameterIn, 3)} in`).join(', ')}` : null,
      item.status || null].filter(Boolean).join(' · ') : 'none';
    const raceways = (row.racewayChanges || []).map(change => `${change.id}: ${racewayState(change.before)} → ${racewayState(change.after)}`).join('; ') || 'none';
    const protection = (row.protectionChanges || []).map(change => `${change.id}: ${change.before?.device?.catalogNumber || 'none'} → ${change.after?.device?.catalogNumber || 'none'}`).join('; ') || 'none';
    const nested = (row.nestedRevisions || []).map(item => `${item.stage} r${item.revision} ${item.status}`).join('; ') || 'none';
    return `<tr><td>${esc(row.revision)} · ${esc(row.kind)}</td><td>${esc(conductors)}</td><td>${esc(routes)}</td><td>${esc(raceways)}</td><td>${esc(protection)}</td><td>${esc(row.thermalComparison || row.thermalStatus || 'not evaluated')} · ${esc(row.worstCase ? `${displayNumber(row.worstCase.exposureToAllowanceRatio, 6)}×` : 'no numeric ratio')}</td><td>${esc(nested)}</td><td>${esc(row.reason || '—')}</td></tr>`;
  }).join('');
  const request = proposal?.cableFaultWithstand || validation?.request || {};
  const clearing = request.clearing || {};
  const thermal = request.thermal || {};
  const coefficientSource = validation?.source?.coefficientSource || {};
  const areaSource = validation?.source?.conductorAreaSource || {};
  const durationBasis = validation?.source?.durationBasis || {};
  const cases = (Array.isArray(validation?.cases) ? validation.cases : []).map(row => `<tr><td>${esc(row.cableId)} · stock ${esc(row.cableStockId)}</td><td>${esc(row.conductorSize)} · ${esc(displayNumber(row.conductorAreaCmil, 0))} cmil</td><td>${esc(cableFaultLocation(row))} (${esc(row.faultCaseId)})</td><td>${esc(displayNumber(row.maximumTotalClearingTimeS, 5))} s</td><td>${esc(displayNumber(row.fromCurrentSquaredExposureA2S, 3))} / ${esc(displayNumber(row.toCurrentSquaredExposureA2S, 3))} A²s</td><td>${esc(displayNumber(row.allowableCurrentSquaredExposureA2S, 3))} A²s</td><td>${esc(row.controllingTerminal)} · ${esc(displayNumber(row.exposureToAllowanceRatio, 6))} × (${esc(row.comparison)})</td></tr>`).join('');
  const issues = (Array.isArray(validation?.issues) ? validation.issues : []).map(row => `<li>${esc(row.code || 'issue')} (${esc(row.path || 'cableFaultWithstand')}): ${esc(row.message || 'Comparison blocked.')}</li>`).join('');
  const coverage = validation?.coverage || {};
  const continuous = coverage.scope === 'generated-bus-and-continuous-cable-span-faults';
  const scopeDescription = continuous
    ? 'This compares every selected phase conductor against all generated bus faults and the full closed length of every generated cable span, including faults in other cables. FROM and TO exposures are maximized independently. Complete stationary-root isolation checks the supplied rounded positive-sequence model; it does not enclose physical input uncertainty or network forward error. The supplied maximum clearing claim remains unverified, and actual clearing/let-through is not calculated. Possible tied locations remain in the JSON.'
    : 'This legacy scope compares per-phase RMS exposure from signed generated-bus-fault cable histories against the Southwire copper thermoset 90 °C to 250 °C adiabatic limit. FROM and TO histories are integrated separately. Cable near-terminal and interior faults are excluded. The supplied maximum clearing claim remains unverified; actual clearing/let-through is not calculated.';
  return `<section id="synthesis-cable-fault-withstand-review"><h3>Conditional cable fault thermal screen</h3><p>${esc(scopeDescription)}</p><table class="synthesis-table"><tbody><tr><th>Status</th><td>${esc(validation?.status || 'blocked')} · comparison ${esc(validation?.comparison || 'not evaluated')}</td></tr><tr><th>Method and source</th><td>${esc(validation?.method || 'not returned')} · catalog ${esc(validation?.source?.catalogFingerprint || 'not returned')}</td></tr><tr><th>Coefficient source</th><td>${esc(coefficientSource.revision || 'not returned')} p. ${esc(displayNumber(coefficientSource.page, 0))}; Fc ${esc(displayNumber(coefficientSource.coefficientA, 4))}; SHA-256 ${esc(coefficientSource.sha256 || 'not returned')}; <a href="${esc(coefficientSource.sourceUrl || '#')}" target="_blank" rel="noopener">source</a>.</td></tr><tr><th>Area and duration bases</th><td>${esc(areaSource.revision || 'not returned')} SHA-256 ${esc(areaSource.sha256 || 'not returned')} (<a href="${esc(areaSource.sourceUrl || '#')}" target="_blank" rel="noopener">nominal area source</a>); up to ${esc(displayNumber(durationBasis.maximumDurationS, 1))} s per separate Schneider method basis; 0.1 s is the app lower restriction.</td></tr><tr><th>Clearing claim</th><td>${esc(displayNumber(clearing.maximumTotalClearingTimeS, 5))} s maximum total-clearing time; ${esc(clearing.reference || 'reference missing')}; all modeled sources: ${clearing.appliesToAllModeledSources === true ? 'claimed, supplied and unverified' : 'not established'} (${esc(clearing.applicabilityReference || 'applicability reference missing')}).</td></tr><tr><th>Thermal condition</th><td>Initial temperature bound ${esc(displayNumber(thermal.maximumInitialTemperatureC, 2))} °C; method basis 90 °C to 250 °C; one event ${thermal.singleEvent === true ? 'claimed' : 'not established'}; adequate recovery ${thermal.adequateRecoveryBeforeEvent === true ? 'claimed' : 'not established'} (${esc(thermal.reference || 'condition reference missing')}).</td></tr><tr><th>Coverage</th><td>${esc(coverage.scope || 'generated-bus-fault-cases-only')} · ${esc(displayNumber(coverage.evaluatedComparisonCount, 0))} comparisons / ${esc(displayNumber(coverage.selectedCableCount, 0))} selected cables × ${esc(displayNumber(coverage.generatedBusFaultCaseCount, 0))} generated bus faults; ${esc(displayNumber(coverage.allGeneratedCableCount, 0))} total generated cables; ${esc(displayNumber(coverage.excludedImmediateLoadSideCaseCount, 0))} immediate-load-side surrogate cases excluded. ${continuous ? `${esc(coverage.generatedCableSpanCount)} cable spans × ${esc(coverage.selectedCableCount)} selected conductors = ${esc(coverage.evaluatedSpanTargetPairCount)} continuous span pairs over [0, 1].` : ""}</td></tr><tr><th>Worst utilization</th><td>${esc(validation?.worstCase ? `${validation.worstCase.cableId} · ${cableFaultLocation(validation.worstCase)} · ${displayNumber(validation.worstCase.exposureToAllowanceRatio, 6)}× (${validation.worstCase.comparison})` : 'not available')}</td></tr><tr><th>Qualification / protection adequacy</th><td>${esc(validation?.qualificationStatus || 'unevaluated')} / ${esc(validation?.protectionAdequacy || 'unevaluated')}</td></tr>${revision ? `<tr><th>Automatic conductor trials</th><td>${esc(revision.status)} · revision budget ${esc(displayNumber(revision.revisionBudget?.used, 0))}/${esc(displayNumber(revision.revisionBudget?.maximum, 0))} used, ${esc(displayNumber(revision.revisionBudget?.remaining, 0))} remaining · stop reason ${esc(revision.stopReason || 'not supplied')}</td></tr>` : ''}</tbody></table>${cases ? `<div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Cable identity</th><th>Conductor area</th><th>Fault case</th><th>Clearing claim</th><th>FROM / TO A²s (independent maxima for span rows)</th><th>Allowable A²s</th><th>Controlling comparison</th></tr></thead><tbody>${cases}</tbody></table></div>` : '<p>No numeric blocked values are displayed.</p>'}${issues ? `<h4>Blocking issues</h4><ul>${issues}</ul>` : ''}${revisionRows ? `<h4>Automatic conductor trial history</h4><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Absolute revision</th><th>Conductor changes</th><th>Route changes</th><th>Raceway changes</th><th>Protection changes</th><th>Thermal result</th><th>Nested studies</th><th>Reason</th></tr></thead><tbody>${revisionRows}</tbody></table></div>` : ''}${revision ? `<details><summary>Design criteria used for these trials</summary><pre data-cable-thermal-criteria>${esc(pretty(revision.finalBinding?.designCriteria ?? null))}</pre></details>` : ''}${evidenceDetails("Complete cable fault-withstand request and result JSON", () => ({ request: proposal.cableFaultWithstand, validation, revision }))}</section>`;
}
function distributionPartitionReview(proposal) {
  const result = proposal?.distributionPartitionValidation;
  if (!result || result.status === 'not-requested') return '';
  const groups = Array.isArray(result.groups) ? result.groups.filter(item => item && typeof item === 'object') : [];
  const decisions = Array.isArray(result.decisions) ? result.decisions.filter(item => item && typeof item === 'object') : [];
  const groupRows = groups.map(group => {
    const feeder = (Array.isArray(proposal.cables) ? proposal.cables : []).find(cable => String(cable?.id) === String(group.feederId));
    const device = feeder?.protectiveDevice;
    const deviceLabel = device ? `${device.manufacturer || device.vendor || ''} ${device.catalogNumber || device.catalog_number || device.id || 'device'}`.trim() : 'no selected candidate';
    return `<tr><td>${esc(group.panelId || 'panel')}</td><td>${esc((Array.isArray(group.loadIds) ? group.loadIds : []).join(', ') || '—')}</td><td>${esc(group.feederId || '—')}</td><td>${esc(displayNumber(group.designAmpacityA, 2))} A</td><td>${esc(group.conductorSize || '—')}</td><td>${esc(displayNumber(group.ampacityA, 2))} A</td><td>${esc(group.sizingStatus || 'not returned')}</td><td>${esc(group.protectiveDeviceStatus || 'not returned')} · ${esc(deviceLabel)}</td></tr>`;
  }).join('');
  const decisionRows = decisions.map(decision => {
    const children = (Array.isArray(decision.childLoadIds) ? decision.childLoadIds : []).map(ids => Array.isArray(ids) ? ids.join(', ') : String(ids ?? '')).filter(Boolean);
    return `<tr><td>${esc(decision.sourcePanelId || 'panel')}</td><td>${esc((Array.isArray(decision.sourceLoadIds) ? decision.sourceLoadIds : []).join(', ') || '—')}</td><td>${esc(decision.reason || 'not returned')}</td><td>${esc(children.join(' | ') || 'No child groups returned')}</td><td>${esc(displayNumber(decision.requiredDesignAmpacityA, 2))} A</td><td>${esc(decision.selectedConductorSize || '—')}</td><td>${esc(displayNumber(decision.selectedAmpacityA, 2))} A</td></tr>`;
  }).join('');
  const criteria = result.criteria || {};
  const limitations = (Array.isArray(result.limitations) ? result.limitations : []).filter(item => item !== null && item !== undefined).map(item => `<li>${esc(item)}</li>`).join('');
  return `<section id="synthesis-distribution-partition-review"><h3>Feeder-aware panel grouping</h3><p class="field-hint">This deterministic bisection screen considers actual routes, cable ampacity, and applicable feeder protection while keeping the supplied panel-load and load-count ceilings unchanged. It does not relax criteria, add parallel conductors, or establish complete protection or approval.</p><table class="synthesis-table"><tbody><tr><th>Partition status</th><td>${esc(result.status || 'not returned')}</td></tr><tr><th>Algorithm</th><td>${esc(result.algorithm || 'not returned')}</td></tr><tr><th>Initial / final panels</th><td>${esc(displayNumber(result.initialPanelCount, 0))} / ${esc(displayNumber(result.finalPanelCount, 0))}</td></tr><tr><th>Trials / actual splits</th><td>${esc(displayNumber(result.trialCount, 0))} / ${esc(displayNumber(result.splitCount, 0))} actual splits</td></tr><tr><th>Unchanged criteria</th><td>Maximum panel load ${esc(displayNumber(criteria.maxPanelLoadKva, 2))} kVA; maximum loads ${esc(displayNumber(criteria.maxLoadsPerPanel, 0))}</td></tr><tr><th>Stopping reason</th><td>${esc(result.stoppingReason || 'not returned')}</td></tr></tbody></table>${decisions.length ? `<h4>Panel split decisions</h4><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Source panel</th><th>Original members</th><th>Reason</th><th>Resulting member groups</th><th>Required feeder floor</th><th>Selected conductor</th><th>Selected ampacity</th></tr></thead><tbody>${decisionRows}</tbody></table></div>` : ''}${groups.length ? `<h4>Final panel groups and feeder outcomes</h4><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Panel</th><th>Final members</th><th>Feeder</th><th>Feeder design-current floor</th><th>Conductor</th><th>Final feeder ampacity</th><th>Sizing</th><th>Protective-device outcome</th></tr></thead><tbody>${groupRows}</tbody></table></div>` : '<p>No final groups were returned.</p>'}${limitations ? `<h4>Limitations</h4><ul>${limitations}</ul>` : ''}</section>`;
}
function faultScenarioReview(proposal) {
  const validation = proposal?.faultScenarioValidation;
  if (!validation && !proposal?.faultScenarios) return '';
  const scenarios = Array.isArray(validation?.scenarios) ? validation.scenarios : [];
  const busEnvelopes = Array.isArray(validation?.busEnvelopes) ? validation.busEnvelopes : [];
  const deviceEnvelopes = Array.isArray(validation?.deviceEnvelopes) ? validation.deviceEnvelopes : [];
  const valueWithCondition = item => item ? `${displayNumber(item.valueKA, 6)} kA · ${item.scenarioId || 'scenario unknown'}${item.faultBusId ? ` · fault at ${item.faultBusId}` : ''}${item.caseKind ? ` · ${item.caseKind}` : ''}` : 'not returned';
  const scenarioIssues = scenarios.flatMap(item => [
    ...(item.faultStudyValidation?.issues || []).map(issue => ({ ...issue, path: `faultScenarios.${item.id}.study.${issue.path || 'input'}` })),
    ...(item.deviceFaultValidation?.issues || []).map(issue => ({ ...issue, path: `faultScenarios.${item.id}.deviceFaultValidation.${issue.path || 'input'}` })),
  ]);
  const allIssues = [...(validation?.issues || []), ...scenarioIssues].filter((item, index, rows) => rows.findIndex(candidate => candidate.code === item.code && candidate.path === item.path && candidate.message === item.message) === index);
  const issueRows = allIssues.map(item => `<li>${esc(item.code || 'issue')} (${esc(item.path || 'input')}): ${esc(item.message || 'Validation failed')}</li>`).join('');
  const scenarioInputById = new Map((Array.isArray(proposal?.faultScenarios) ? proposal.faultScenarios : []).map(item => [item.id, item]));
  const scenarioRows = scenarios.map(item => { const refs = (scenarioInputById.get(item.id)?.study?.sources || []).map(source => `${source.equipmentId || 'source'}: ${source.reference || 'reference missing'}`).join('; ') || 'No source references returned.'; return `<tr><th scope="row">${esc(item.id || 'scenario')}</th><td>${esc(item.reference || 'reference missing')}</td><td>${esc(refs)}</td><td>${esc(item.status || 'not evaluated')}</td><td>${esc(item.faultStudyValidation?.status || 'not evaluated')}</td><td>${esc(item.deviceFaultValidation?.status || 'not evaluated')}</td></tr>`; }).join('');
  const busRows = busEnvelopes.map(item => `<tr><th scope="row">${esc(item.busId || '—')}</th><td>${esc(valueWithCondition(item.minimum))}</td><td>${esc(valueWithCondition(item.maximum))}</td></tr>`).join('');
  const deviceRows = deviceEnvelopes.map(item => `<tr><th scope="row">${esc(item.placementId || '—')}</th><td>${esc(valueWithCondition(item.lineTerminalAvailableInitialRms?.minimum))}</td><td>${esc(valueWithCondition(item.lineTerminalAvailableInitialRms?.maximum))}</td><td>${esc(valueWithCondition(item.maximumThroughDeviceInitialRms?.maximum))}</td><td>${esc(item.protectionStatus || 'not evaluated')}</td></tr>`).join('');
  return `<section id="synthesis-fault-scenario-review"><h3>Explicit fault operating-scenario comparison</h3><p>These envelopes summarize only the supplied scenarios. Their observed low and high values are not verified true fault minima or maxima. Protection adequacy remains unevaluated; this comparison does not establish code compliance, clearing, coordination, peak/asymmetrical duty, or thermal duty.</p><table class="synthesis-table"><tbody><tr><th>Validation status</th><td>${esc(validation?.status || 'not evaluated')}</td></tr><tr><th>Method and scope</th><td>${esc(validation?.method || 'not returned')} · ${esc(validation?.scope || 'initial-symmetrical-rms-only')}</td></tr><tr><th>Input fingerprint</th><td>${esc(validation?.modelInputFingerprint || 'not returned')}</td></tr><tr><th>Coverage</th><td>${esc(validation?.coverage ? JSON.stringify(validation.coverage) : 'not returned')}</td></tr></tbody></table><h4>Scenario references and status</h4><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Scenario</th><th>Scenario reference</th><th>Explicit source references</th><th>Scenario status</th><th>Fault-network status</th><th>Device-current status</th></tr></thead><tbody>${scenarioRows || '<tr><td colspan="6">No scenarios were evaluated.</td></tr>'}</tbody></table></div><h4>Observed bus-current envelopes</h4><p>Initial symmetrical RMS at each generated bus. Limiting scenario IDs are shown with each value.</p><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Bus</th><th>Observed minimum</th><th>Observed maximum</th></tr></thead><tbody>${busRows || '<tr><td colspan="3">No complete bus envelopes were returned.</td></tr>'}</tbody></table></div><h4>Proposed-device current envelopes</h4><p>The through-device value is the highest observed among each scenario’s per-scenario maximum across fault locations.</p><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Placement</th><th>Line-terminal observed minimum</th><th>Line-terminal observed maximum</th><th>Highest observed per-scenario maximum through-device current</th><th>Protection status</th></tr></thead><tbody>${deviceRows || '<tr><td colspan="5">No complete device envelopes were returned.</td></tr>'}</tbody></table></div>${issueRows ? `<h4>Blocking validation issues</h4><ul>${issueRows}</ul>` : ''}${(validation?.limitations || []).length ? `<h4>Study limitations</h4><ul>${validation.limitations.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}${evidenceDetails("Complete fault-scenario validation and supplied JSON", () => ({ validation, input: proposal.faultScenarios }))}</section>`;
}
function deviceFaultReview(proposal) {
  const validation = proposal?.deviceFaultValidation;
  if (!validation) return '';
  const placements = Array.isArray(validation.placements) ? validation.placements : [];
  const issues = Array.isArray(validation.issues) ? validation.issues : [];
  const limitations = Array.isArray(validation.limitations) ? validation.limitations : [];
  const phasor = value => value && Number.isFinite(value.re) && Number.isFinite(value.im)
    ? `${displayNumber(value.re, 6)} ${value.im < 0 ? '−' : '+'} j${displayNumber(Math.abs(value.im), 6)} kA`
    : 'phasor unavailable';
  const comparisonRow = (label, row) => `<tr><th scope="row">${esc(label)}</th><td>${esc(row ? `${row.status || 'not compared'} · ${displayNumber(row.valueKA, 6)} kA RMS · ${phasor(row.phasorKA)}${row.ratingKA == null ? '' : ` · ${displayNumber(row.ratingKA, 3)} kA standalone rating`}${row.caseBusId || row.faultBusId ? ` · fault at ${row.faultBusId || row.caseBusId}` : ''}${row.caseKind ? ` · ${row.caseKind}` : ''}` : 'Not returned')}</td></tr>`;
  const cards = placements.map(placement => {
    const location = placement.proposedLocation || {};
    const bus = location.physicalFromBus || {};
    const device = placement.device || {};
    const rating = device.standaloneInterruptingRating || {};
    const conditional = device.conditionalCombinationRating?.metadata || {};
    const candidate = `${device.manufacturer || ''} ${device.catalogNumber || device.id || 'No proposed breaker'}`.trim();
    const coords = [bus.x, bus.y, bus.z].every(value => Number.isFinite(value)) ? ` (${bus.x}, ${bus.y}, ${bus.z} ft)` : '';
    const applySelection = device.selectedForApply === true ? 'yes' : device.selectedForApply === false ? 'no' : 'not stated';
    const conditionalParts = [
      conditional.coordinationType || conditional.type,
      Number.isFinite(conditional.shortCircuitCurrentKA) ? `${displayNumber(conditional.shortCircuitCurrentKA, 2)} kA` : null,
      Number.isFinite(conditional.circuitVoltageV) ? `${displayNumber(conditional.circuitVoltageV, 0)} V` : null,
      Number.isFinite(conditional.maximumBreakerCurrentA) ? `breaker max ${displayNumber(conditional.maximumBreakerCurrentA, 0)} A` : null,
    ].filter(Boolean);
    const conditionalSummary = device.conditionalCombinationRating
      ? `Unevaluated${conditionalParts.length ? ` · ${conditionalParts.join(' · ')}` : ' · conditions not returned'}`
      : 'Not supplied; no conditional SCCR inferred';
    const locationSummary = `${location.description || 'Proposed location not returned'} · bus ${bus.tag || location.fromBusId || 'not stated'}${coords}${location.terminal ? ` · terminal ${location.terminal}` : ''} · not an installed fact`;
    const standaloneSummary = rating.currentKA == null
      ? 'Standalone interrupting rating unavailable'
      : `${displayNumber(rating.currentKA, 3)} kA at ${displayNumber(rating.voltageVac, 0)} V · applicable here ${rating.applicableAtLocationVoltage === true ? 'yes' : 'no'} · provenance ${rating.provenanceStatus || 'unknown'}`;
    const curve = placement.comparisons?.constantCurrentCurveResearch;
    const curveSummary = curve ? `${curve.status}; ${curve.plotUpperTimeSeconds == null ? 'no plotted time returned' : `${displayNumber(curve.plotUpperTimeSeconds, 6)} s graphical upper reading at ${displayNumber(curve.currentA, 2)} A`}; hypothetical constant current, not actual clearing` : null;
    const combination = placement.comparisons?.citedMotorCombinationInitialRms;
    const combinationSummary = combination ? `${combination.status}${combination.valueKA == null ? '' : ` · ${displayNumber(combination.valueKA, 3)} kA modeled at line terminal · ${displayNumber(combination.ratingKA, 3)} kA cited value at ${combination.ratingVoltageV} V`} · ${combination.reason}` : null;
    return `<article class="synthesis-device-fault-placement"><h4>${esc(placement.id || 'Placement')} · ${esc(candidate)}</h4><p><strong>${esc(placement.status || 'blocked')} · ${esc(placement.kind || 'device')}</strong> · ${esc(locationSummary)}</p><p class="field-hint">Library ${esc(device.libraryStatus || 'not stated')} · research ${esc(device.researchStatus || 'not stated')} · selectedForApply ${applySelection}</p><div style="overflow:auto"><table class="synthesis-table"><tbody>${comparisonRow('Line-terminal available initial RMS', placement.comparisons?.lineTerminalAvailableInitialRms)}${comparisonRow('Maximum current through device', placement.comparisons?.maximumThroughDeviceInitialRms)}${curveSummary ? `<tr><th scope="row">Constant-current chart research</th><td>${esc(curveSummary)}</td></tr>` : ''}<tr><th scope="row">Standalone interrupting rating</th><td>${esc(standaloneSummary)}</td></tr>${combinationSummary ? `<tr><th scope="row">Cited motor combination initial-RMS comparison</th><td>${esc(combinationSummary)}</td></tr>` : ''}<tr><th scope="row">Conditional combination rating / assembly SCCR</th><td>${esc(conditionalSummary)}</td></tr><tr><th scope="row">Protection adequacy</th><td>${esc(placement.comparisons?.protectionAdequacy || 'unevaluated')}</td></tr></tbody></table></div>${evidenceDetails("Placement source and case evidence", () => (placement))}</article>`;
  }).join('');
  return `<section id="synthesis-device-fault-review"><h3>Proposed device locations and initial-RMS current screen</h3><p>Each location is a proposed source-end device position derived from the generated one-line, not an installed fact. Line-terminal available current and actual signed current through the proposed device are shown separately. The standalone interrupting rating is not a conditional combination rating or assembly SCCR. Protection adequacy remains unevaluated for every row; this screen does not establish complete protection or enable motor Apply.</p><table class="synthesis-table"><tbody><tr><th>Screen status</th><td>${esc(validation.status || 'blocked')}</td></tr><tr><th>Method and scope</th><td>${esc(validation.method || 'not returned')} · ${esc(validation.scope || 'initial-symmetrical-rms-only')}</td></tr><tr><th>Combined model (network + device) fingerprint</th><td>${esc(validation.modelInputFingerprint || 'not returned')}</td></tr><tr><th>Network-only input fingerprint</th><td>${esc(validation.networkModelInputFingerprint || 'not returned')}</td></tr><tr><th>Device input fingerprint</th><td>${esc(validation.deviceInputFingerprint || 'not returned')}</td></tr><tr><th>Fault-bus coverage</th><td>${esc(validation.coverage ? `${validation.coverage.status || 'unknown'}; ${JSON.stringify(validation.coverage)}` : 'not returned')}</td></tr><tr><th>Source inventory</th><td>${esc(validation.sourceInventory?.status || 'unknown')} · ${esc(validation.sourceInventory?.verificationStatus || 'not verified')}</td></tr></tbody></table>${issues.length ? `<h4>Screen issues</h4><ul>${issues.map(item => `<li>${esc(item.code || 'issue')} (${esc(item.path || 'input')}): ${esc(item.message || 'validation failed')}</li>`).join('')}</ul>` : ''}${cards || '<p>No proposed device placements returned.</p>'}${limitations.length ? `<h4>Screen limitations</h4><ul>${limitations.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}${evidenceDetails("Complete proposed-device fault-screen evidence", () => (validation))}</section>`;
}
function motorOverloadSummary(proposal, motorId) {
  const selection = proposal.motorOverloadCandidates?.cases?.find(item => item.motorId === String(motorId));
  const candidate = selection?.candidate;
  if (!candidate) return `No overload relay range candidate: ${(selection?.issues || []).map(item => item.message).join('; ') || 'not evaluated'}`;
  return `${candidate.manufacturer} ${candidate.catalogNumber}; ${candidate.minSettingA}–${candidate.maxSettingA} A range; ${candidate.dialSettingA} A nameplate dial; class ${candidate.tripClass}; range screening only`;
}
function motorOverloadReview(proposal) {
  const cases = proposal.motorOverloadCandidates?.cases || [];
  if (!cases.length) return '';
  const rows = cases.map(item => `<tr><td>${esc(item.motorId)}</td><td>${esc(motorOverloadSummary(proposal, item.motorId))}</td><td>${esc(item.candidate?.unresolved?.join('; ') || 'No sourced candidate')}</td></tr>`).join('');
  return `<section id="synthesis-motor-overload-review"><h3>Motor overload relay candidates</h3><p>Range selection uses motor nameplate current. The dial value does not establish a permitted trip limit or complete overload protection; starter assembly, starting duty, installation, and coordination require further checks.</p><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Motor</th><th>Relay range candidate</th><th>Unresolved requirements</th></tr></thead><tbody>${rows}</tbody></table></div>${evidenceDetails("Overload candidate sources and field evidence", () => (proposal.motorOverloadCandidates))}</section>`;
}
function motorStarterCandidateSummary(result) {
  const candidate = result?.candidate;
  if (!candidate) return 'No fitting assembly candidate; see rejected-candidate checks.';
  const contactor = candidate.contactor || {};
  const relay = candidate.overloadRelay || {};
  if (candidate.branchCircuitBreaker) {
    const combination = candidate.conditionalCombination || {};
    const operatingBasis = candidate.checks?.find(row => row.id === 'referencedOperatingCurrent')?.evidence;
    const operatingText = candidate.sizing?.operatingCurrentA == null ? '' : `; referenced operating-current floor ${displayNumber(candidate.sizing.operatingCurrentA, 2)} A (${operatingBasis?.reference || 'reference not retained'})`;
    const calibration = relay.publishedNominalTripCurrentA == null ? 'not established' : `${displayNumber(relay.publishedNominalTripCurrentA, 2)} A`;
    return `${contactor.catalogNumber || 'contactor'} + ${relay.catalogNumber || 'overload relay'} + ${candidate.branchCircuitBreaker.catalogNumber}; separate branch-breaker research topology; ${combination.coordinationType || 'conditional coordination type'} ${displayNumber(combination.circuitVoltageV, 0)} V / ${displayNumber(combination.shortCircuitCurrentKA, 0)} kA conditional combination rating; breaker fixed Ir ${displayNumber(candidate.branchCircuitBreaker.fixedOverloadPickupA, 0)} A; candidate relay dial ${displayNumber(relay.candidateDialSettingA, 2)} A; published nominal trip calibration ${calibration}${operatingText}; proposed instantaneous setting ${candidate.branchCircuitBreaker.instantaneousPickupA == null ? 'not specified' : `${displayNumber(candidate.branchCircuitBreaker.instantaneousPickupA, 0)} A (not verified installed)`}.`;
  }
  const controller = candidate.shortCircuitController || {};
  const combination = candidate.ulCombination || {};
  return `${contactor.catalogNumber || 'contactor'} + ${relay.catalogNumber || 'overload relay'} + ${controller.catalogNumber || 'short-circuit controller'}; ${combination.coordinationType || 'conditional coordination type'} ${displayNumber(combination.voltageV, 0)} V / ${displayNumber(combination.shortCircuitCurrentKA, 0)} kA conditional combination rating; candidate dial ${displayNumber(candidate.relayDialSettingCandidateA, 2)} A; published nominal trip calibration ${displayNumber(candidate.relayPublishedNominalTripCurrentA, 2)} A; actual controller setting ${candidate.shortCircuitControllerSettingA == null ? 'unspecified' : `${displayNumber(candidate.shortCircuitControllerSettingA, 2)} A`}.`;
}
function motorStarterConditionalRatingNote(result) {
  const candidate = result?.candidate;
  const rating = candidate?.conditionalCombination || candidate?.ulCombination;
  if (!rating) return 'No eligible conditional combination rating is established; assembled-panel SCCR remains unevaluated.';
  const voltage = rating.circuitVoltageV ?? rating.voltageV;
  const coordination = rating.coordinationType && rating.coordinationType !== 'not established' ? rating.coordinationType : 'coordination type not established';
  return `${displayNumber(rating.shortCircuitCurrentKA, 0)} kA at ${displayNumber(voltage, 0)} V, ${coordination}, conditional on the listed combination and its conditions; it is not an assembled-panel SCCR or complete fault-duty approval.`;
}
function motorStarterNonpassChecks(result) {
  const checks = result?.candidate?.checks || result?.rejectedCandidate?.checks || result?.candidates?.flatMap(candidate => candidate.checks || []) || [];
  return checks.filter(item => item.status !== 'pass');
}
function motorStarterReview(proposal) {
  const section = proposal.motorStarterCandidates;
  const cases = section?.cases || [];
  if (!cases.length) return '';
  const branchBreakerMode = section.method === 'siemens-dol-branch-breaker-research-v1';
  const rows = cases.map(item => {
    const result = item.result || item;
    const candidate = result.candidate;
    const reasons = motorStarterNonpassChecks(result);
    const branchBreaker = candidate?.branchCircuitBreaker;
    const curveNotes = (Array.isArray(result.candidates) ? result.candidates : candidate ? [candidate] : []).flatMap(option => {
      const research = option?.curveResearch;
      if (!research) return [];
      const notes = [research.sourceAvailability, research.curveInterpretation?.thermal, research.curveInterpretation?.instantaneous].filter(Boolean);
      if (!notes.length) return [];
      const device = option.branchCircuitBreaker?.catalogNumber || research.exactCandidateCatalogNumber || 'Candidate';
      return [`<li><strong>${esc(device)}:</strong> ${notes.map(esc).join(' ')}</li>`];
    }).join('');
    const fitLimits = candidate ? `<p><strong>Known fit limits:</strong> UL contactor ${displayNumber(candidate.contactor?.ulThreePhaseMotorFlaAt480V, 0)} A FLA and ${displayNumber(candidate.contactor?.ulThreePhaseMotorHorsepowerAt460Or480V, 0)} hp; contactor coil ${displayNumber(candidate.contactor?.coilVoltageV, 0)} V ${esc(candidate.contactor?.coilCurrentType || '')}; relay ${displayNumber(candidate.overloadRelay?.currentSettingMinA, 0)}–${displayNumber(candidate.overloadRelay?.currentSettingMaxA, 0)} A${branchBreaker ? `; exact breaker ${esc(branchBreaker.catalogNumber)} fixed Ir ${displayNumber(branchBreaker.fixedOverloadPickupA, 0)} A, discrete instantaneous settings ${branchBreaker.allowedInstantaneousPickupA.length ? `${branchBreaker.allowedInstantaneousPickupA.map(value => displayNumber(value, 0)).join(', ')} A` : 'not established'}` : `; controller ${displayNumber(candidate.shortCircuitController?.currentSettingMinA, 0)}–${displayNumber(candidate.shortCircuitController?.currentSettingMaxA, 0)} A`}. The standalone overload-range relay candidate and the relay in the assembly are alternative proposals, not two installed relays.</p>` : '';
    return `<article class="synthesis-motor-starter-case"><h4>Motor ${esc(item.motorId || item.loadId || 'unknown')}</h4><p><strong>Research status:</strong> candidate · library screening · protection blocked · never selected for Apply.</p><p>${esc(motorStarterCandidateSummary(result))}</p>${fitLimits}<p><strong>Checks not passed:</strong></p><ul>${reasons.length ? reasons.map(check => `<li><strong>${esc(check.candidateId ? `${check.candidateId} · ` : '')}${esc(check.id)} — ${esc(check.status)}:</strong> ${esc(check.message)}</li>`).join('') : '<li>No check details returned.</li>'}</ul>${curveNotes ? `<h5>Candidate curve source limitations</h5><ul>${curveNotes}</ul>` : ''}${evidenceDetails("Candidate, rejected-candidate checks, and manufacturer sources", () => (result))}</article>`;
  }).join('');
  return `<section id="synthesis-motor-starter-review"><h3>Motor starter assembly research candidates</h3><p>These exact-part combinations are screening research candidates only. Conditional ratings apply only to their listed combinations and conditions; they are not an assembled-panel SCCR or complete fault-duty approval. Candidate relay dial, any sourced nominal trip calibration, proposed instantaneous pickup, and any installed setting are separate values. ${branchBreakerMode ? 'Motor branch-breaker research protection remains unresolved; the candidate does not establish overload, fault-duty, installation, or coordination approval.' : 'No candidate completes motor protection.'} Apply remains disabled.</p>${rows}${evidenceDetails("Complete starter-candidate source records and field provenance", () => (section))}</section>`;
}
function invalidate(message = 'Proposal is stale. Generate again after changing inputs.') {
  state.generationToken += 1;
  state.proposal = null; state.oneLinePreview = null; state.signature = ''; state.engineSignature = ''; state.previewContext = null;
  document.getElementById('synthesis-download-json').disabled = true;
  document.getElementById('synthesis-download-cable-schedule').disabled = true;
  document.getElementById('synthesis-download-panel-schedule').disabled = true;
  document.getElementById('synthesis-download-raceway-schedule').disabled = true;
  document.getElementById('synthesis-raceway-schedule-status').textContent = 'Generate a complete routed proposal to download the raceway schedule.';
  document.getElementById('synthesis-create-review-project').disabled = true;
  document.getElementById('synthesis-review-project-status').textContent = 'A review project keeps the generated design separate and cannot be issued. Full study histories remain in the proposal downloads.';
  document.getElementById('synthesis-download-report').disabled = true;
  document.getElementById('synthesis-download-oneline').disabled = true;
  document.getElementById('synthesis-apply').disabled = true;
  if (message) status(message);
  renderOutput(null);
}
function inputModel() {
  const draft = readDraft();
  let accelerationInputs = draft.motorAccelerationInputs;
  if (typeof accelerationInputs === 'string') {
    try { accelerationInputs = JSON.parse(accelerationInputs); }
    catch { throw new Error('Motor acceleration JSON is invalid; correct the retained editor text before generating.'); }
  }
  if (accelerationInputs !== undefined && (!accelerationInputs || typeof accelerationInputs !== 'object' || Array.isArray(accelerationInputs))) throw new Error('Motor acceleration JSON must be an object keyed by equipment ID.');
  if (accelerationInputs && Object.keys(accelerationInputs).length) {
    const loadsById = new Map(draft.equipment.map(load => [String(load?.id ?? ''), load]));
    for (const id of Object.keys(accelerationInputs)) {
      const load = loadsById.get(String(id));
      if (!load) throw new Error(`Motor acceleration entry ${id} does not match an equipment ID.`);
      if (!load.motor || typeof load.motor !== 'object' || Array.isArray(load.motor)) throw new Error(`Motor acceleration entry ${id} requires an existing equipment record with an explicit motor object.`);
    }
    draft.equipment = draft.equipment.map(load => Object.prototype.hasOwnProperty.call(accelerationInputs, String(load.id))
      ? { ...load, motor: { ...load.motor, acceleration: structuredClone(accelerationInputs[String(load.id)]) } }
      : load);
  }
  delete draft.motorAccelerationInputs;
  return draft;
}
function selectedCurveSourceRows(proposal) {
  const label = (name, voltage) => `${name} (${displayNumber(voltage, 0)} V)`;
  const placements = (proposal.cables || []).map(cable => ({ placement: label(cable.id || cable.tag || 'circuit', cable.protectiveDevice?.evaluatedVoltageVac ?? cable.operating_voltage), device: cable.protectiveDevice }));
  if (proposal.transformer) {
    placements.push({ placement: label('transformer primary', proposal.transformer.primaryProtectiveDevice?.evaluatedVoltageVac ?? proposal.transformer.primaryVoltageVac), device: proposal.transformer.primaryProtectiveDevice });
    placements.push({ placement: label('transformer secondary main', proposal.transformer.secondaryMainDevice?.evaluatedVoltageVac ?? proposal.transformer.secondaryVoltageVac), device: proposal.transformer.secondaryMainDevice });
  }
  const rows = new Map();
  for (const { placement, device } of placements) {
    if (!device) continue;
    const candidate = device.curveSourceResearch;
    const evidence = candidate && typeof candidate === 'object' && candidate.source && typeof candidate.source === 'object' ? candidate : null;
    const key = JSON.stringify([device.id || null, device.catalogNumber || null, evidence]);
    const row = rows.get(key) || { catalogNumber: device.catalogNumber || device.id || 'unknown candidate', evidence, placements: [] };
    if (!row.placements.includes(placement)) row.placements.push(placement);
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => String(a.catalogNumber).localeCompare(String(b.catalogNumber)));
}

function curveSourceReview(proposal) {
  const rows = selectedCurveSourceRows(proposal);
  if (!rows.length) return '';
  const body = rows.map(({ catalogNumber, evidence, placements }) => `<tr><th scope="row">${esc(catalogNumber)}</th><td>${esc(placements.join(', '))}</td><td>${esc(evidence ? `${evidence.source.document}; page ${evidence.pageOneBased}, figure ${evidence.figure}; ${evidence.curveId}` : 'Not covered by this Eaton snapshot review')}</td><td>${esc(evidence?.sourceStatus || 'not reviewed here')}</td><td>${esc(evidence?.limits || 'Inspect candidate-specific source evidence and applicability.')}</td></tr>`).join('');
  return `<section id="synthesis-curve-source-review"><h3>Selected breaker curve-source review</h3><p class="field-hint">This preliminary research covers the reviewed Eaton snapshot; other candidate sources appear in their own reviews. Clearing and coordination remain unevaluated. For matched records, source conditions and fingerprint are retained in selected-device evidence.</p><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Candidate</th><th>Proposed placements</th><th>Source figure</th><th>Source status</th><th>Remaining evidence</th></tr></thead><tbody>${body}</tbody></table></div>${evidenceDetails("Source conditions and provenance", () => (rows))}</section>`;
}

function curveSourceReport(proposal) {
  return selectedCurveSourceRows(proposal).map(({ catalogNumber, evidence, placements }) => `- ${catalogNumber}; placements ${placements.join(', ')}; ${evidence ? `${evidence.source.document}, page ${evidence.pageOneBased}, figure ${evidence.figure}, ${evidence.curveId}; ${evidence.sourceStatus}; ${evidence.conditions}; ${evidence.limits}; source ${evidence.source.url}; SHA-256 ${evidence.source.sha256}` : 'not covered by this Eaton snapshot review; inspect candidate-specific evidence'}; clearing and coordination unevaluated.`);
}

function renderOutput(proposal, preview = null) {
  const output = document.getElementById('synthesis-output');
  if (!output) return;
  proposalEvidenceProviders = [];
  freeEvidenceIndices = [];
  proposalHistoryPager = null;
  if (!proposal) { output.innerHTML = '<h2 id="synthesis-output-heading">Proposal</h2><p class="text-muted">No current proposal. Inputs changed or the last run failed.</p>'; return; }
  const summary = proposal.summary || {};
  const checks = Array.isArray(proposal.checks) ? proposal.checks : Object.entries(proposal.checks || {}).map(([name, value]) => ({ id: name, name, status: value ? 'pass' : 'fail' }));
  const issues = Array.isArray(proposal.issues) ? proposal.issues : [];
  const adoption = proposal.projectEquipmentAdoption;
  const adoptedPairs = Array.isArray(adoption?.pairs) ? adoption.pairs : [];
  const adoptionRows = adoptedPairs.map(pair => `<tr><td>${esc(pair.equipmentId)}</td><td>${esc(pair.equipmentTag || '—')}</td><td>${esc(pair.loadId)}</td><td>${esc(pair.loadTag || '—')}</td></tr>`).join('');
  const adoptionSection = adoptedPairs.length ? `<section id="synthesis-project-equipment-provenance"><h3>Reviewed project equipment mapping</h3><p class="field-hint">Copied from named project ${esc(adoption.projectId)} · scenario ${esc(adoption.scenario)}. Equipment and load identities remain distinct; the selected source records and review binding are checked again before Apply. This records the reviewed mapping, not engineering approval.</p><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Equipment ID</th><th>Equipment tag</th><th>Load ID</th><th>Load tag</th></tr></thead><tbody>${adoptionRows}</tbody></table></div><p>Reviewed bases: electrical input kW, line-to-line voltage, feet coordinates.</p></section>` : '';
  const trayAdoption = proposal.inputs?.original?.projectTrayAdoption;
  const trayPlan = preview?.projectTrayReconciliation;
  const trayPlanDetail = trayPlan?.ok ? `<p>Read-only merge preview retains ${esc(trayPlan.ownerTrayIds.length)} owner tray(s): ${esc(trayPlan.ownerTrayIds.join(', ') || 'none used')}. Generated cable assignments and fill were screened again. Installation suitability and thermal interaction remain unresolved.</p>` : trayPlan ? `<p>Owner-tray merge preview could not be established: ${esc((trayPlan.issues || []).map(item => item.message).join(' '))}</p>` : '';
  const trayAdoptionSection = Array.isArray(trayAdoption?.selectedTrayIds) ? `<section id="synthesis-project-tray-provenance"><h3>Reviewed project tray mapping</h3><p>Project ${esc(trayAdoption.projectId)} · scenario ${esc(trayAdoption.scenario)} · trays ${esc(trayAdoption.selectedTrayIds.join(', '))}. Inventory reference: ${esc(trayAdoption.inventoryReference)}. Source records and geometry are checked before generation. ${proposal.status === 'proposal' ? 'Preliminary Apply relies on user-supplied, unverified installation and thermal references.' : 'Existing-tray Apply remains blocked.'}</p>${trayPlanDetail}</section>` : '';
  const evaluations = proposal.racewayEvaluations || proposal.racewayEvaluation?.evaluations || proposal.racewayEvaluation || [];
  const evaluationList = Array.isArray(evaluations) ? evaluations : [];
  const thermalRows = thermalAssessmentRows(proposal);
  const inputEvidence = proposal.inputEvidence || {};
  const evidenceRows = [inputEvidence.records?.supply, ...(inputEvidence.records?.equipment || []).slice(0, 60)].filter(Boolean).map(record => `<tr><td>${esc(record.id || 'record')}</td><td>${esc(record.classification || 'user-supplied')}</td><td>${esc(Object.entries(record.values || {}).map(([key, value]) => `${key}: ${typeof value.value === 'object' && value.value !== null ? JSON.stringify(value.value) : value.value} (${value.basis}${value.source ? `, ${value.source}` : ''})`).join('; '))}</td><td>${esc((record.sourceDocuments || record.references || []).length ? 'Provided references retained' : 'No reference supplied')}</td></tr>`).join('');
  const globalDispositionIssues = proposal.globalBlockingIssues || [];
  const motorRows = (proposal.loads || []).filter(load => load.motor).map(load => { const startCase = proposal.motorStartingValidation?.cases?.find(item => item.motorId === String(load.id)); return `<tr><td>${esc(load.id || load.tag)}</td><td>${esc(displayNumber(load.motor.ratedVoltageV, 0))}</td><td>${esc(displayNumber(load.motor.fullLoadCurrentA, 2))}</td><td>${esc(load.motor.fullLoadCurrentBasis?.label || load.motor.fullLoadCurrentBasis?.reference || '—')}</td><td>${esc(displayNumber(load.motor.nameplateCurrentA, 2))}</td><td>${esc(displayNumber(load.motor.lockedRotorCurrentA, 2))}</td><td>${esc(displayNumber(load.designAmpacityA, 2))}</td><td>${esc(startCase?.status || load.motor.startingStatus || 'not evaluated')}</td><td>${esc(load.motor.overloadProtectionStatus || 'unresolved')}</td></tr>`; }).join('');
  const criteriaRows = designCriteriaEntries(suppliedCriteria(proposal)).map(item => `<tr><th scope="row">${esc(item.key)}</th><td>${esc(item.value === null ? 'null' : item.value)}</td><td>${esc(item.unit)}</td></tr>`).join('');
  const studyRows = loadFlowStudyRows(proposal).map(([label, value]) => `<tr><th scope="row">${esc(label)}</th><td>${esc(value)}</td></tr>`).join('');
  const transformer = proposal.transformer;
  const transformerRows = transformer ? [
    ['Selected profile', `${transformer.manufacturer || ''} ${transformer.catalogNumber || transformer.profileId || transformer.id || 'transformer'}`.trim()],
    ['Primary winding', `${displayNumber(transformer.primaryVoltageVac, 0)} V ${transformer.primaryConnection || ''}; ${displayNumber(transformer.primaryRatedCurrentA, 2)} A rated; ${displayNumber(transformerDesignCurrent(transformer, 'primary'), 2)} A calculated at required kVA; bus ${transformer.primaryBusId || '—'}`],
    ['Secondary winding', `${displayNumber(transformer.secondaryVoltageVac, 0)} V ${transformer.secondaryConnection || ''}${transformer.secondaryLineToNeutralVoltageVac ? ` (${displayNumber(transformer.secondaryLineToNeutralVoltageVac, 0)} V L-N)` : ''}; ${displayNumber(transformer.secondaryRatedCurrentA, 2)} A rated; ${displayNumber(transformerDesignCurrent(transformer, 'secondary'), 2)} A calculated at required kVA; bus ${transformer.secondaryBusId || '—'}`],
    ['Nameplate rating and loading', `${displayNumber(transformer.ratedKVA, 1)} kVA; required ${displayNumber(transformer.requiredKVA, 2)} kVA; ${displayNumber(transformer.loadingPercent, 1)}%`],
    ['Primary OCP candidate', protectiveDeviceSummary(transformer.primaryProtectiveDevice, transformer.primaryMaxOcpA)],
    ['Secondary main candidate', protectiveDeviceSummary(transformer.secondaryMainDevice, transformer.secondaryMaxOcpA)],
    ['Protection placement', `Primary: ${transformer.primaryProtectionLocation || 'not stated'}; secondary main: ${transformer.secondaryMainLocation || 'not stated'}`],
    ['Secondary fault estimate', `${displayNumber(transformer.secondaryFault?.availableFaultCurrentKA, 3)} kA; ${transformer.secondaryFault?.method || 'not evaluated'}; ground faults ${transformer.secondaryFault?.groundFaultStatus || transformer.groundFaultStatus || 'not evaluated'}; asymmetrical duty ${transformer.secondaryFault?.asymmetricalDutyStatus || transformer.asymmetricalInterruptingDutyStatus || 'not evaluated'}`],
    ['Series model', `${transformer.seriesModel?.modelType || 'not stated'}; Z ${displayNumber(transformer.seriesModel?.zPercent, 3)}%, X/R ${displayNumber(transformer.seriesModel?.xr, 3)}; ${transformer.seriesModel?.limitation || 'model limits not stated'}`],
    ['Phase and magnetizing model', `${transformer.phaseModelAssumption?.transformerPhaseDisplacement || 'not stated'}; phase angles reported: ${transformer.phaseModelAssumption?.phaseAnglesReported === true ? 'yes' : 'no'}; magnetizing current: not represented unless explicitly modeled`],
    ['Catalog evidence', candidateProvenance(transformer)],
  ].map(([label, value]) => `<tr><th scope="row">${esc(label)}</th><td>${esc(value)}</td></tr>`).join('') : '';
  const transformerFeederRows = transformer ? (proposal.cables || []).filter(cable => cable.transformerId === transformer.id || cable.transformerSide || [transformer.primaryBusId, transformer.secondaryBusId].includes(cable.from) || [transformer.primaryBusId, transformer.secondaryBusId].includes(cable.to) || [Number(transformer.primaryVoltageVac), Number(transformer.secondaryVoltageVac)].includes(Number(cable.operating_voltage ?? cable.voltage))).map(cable => {
    const selected = cable.protectiveDevice;
    return `<tr><td>${esc(cable.id || cable.tag || 'feeder')}</td><td>${esc(cable.transformerSide || '—')}</td><td>${esc(cable.from || cable.from_tag || '—')} → ${esc(cable.to || cable.to_tag || '—')}</td><td>${esc(displayNumber(cable.operating_voltage ?? cable.voltage, 0))}</td><td>${esc(displayNumber(cable.currentA ?? cable.current, 2))}</td><td>${esc(cable.conductorSize || cable.conductor_size || '—')}</td><td>${esc(selected ? `${selected.manufacturer || selected.vendor || ''} ${selected.catalogNumber || selected.id || ''} · ${displayNumber(selected.evaluatedVoltageVac ?? selected.ratedVoltageVac, 0)} V · ${displayNumber(selected.interruptingRatingKA, 2)} kA` : 'Requirement only')}</td></tr>`;
  }).join('') : '';
  const dispositionRows = (proposal.loadDispositions || []).map(row => { const reason = row.status === 'deferred' && globalDispositionIssues.length ? `Deferred by global blocker: ${globalDispositionIssues.map(item => item.message || item.code).join('; ')}` : (row.issues || []).map(item => item.message || item.code).join('; ') || (row.status === 'accepted' ? 'Generated load accepted' : row.status === 'rejected' ? 'Invalid equipment record' : 'Not generated; pending correction'); return `<tr><td>${esc(Number(row.inputIndex) + 1)}</td><td>${esc(row.id || '—')}</td><td>${esc(row.tag || '—')}</td><td>${esc(row.status || 'deferred')}</td><td>${esc(row.original?.kw ?? '—')}</td><td>${esc(reason)}</td></tr>`; }).join('');
  const trayRows = (proposal.trays || []).map(tray => { const id = tray.id || tray.edgeId || tray.tray_id; const evaluation = evaluationList.find(item => String(item.racewayId || item.trayId || item.tray_id || item.id) === String(id)); const used = evaluation?.used; const limit = evaluation?.allowable; const existing = tray.existingTrayScreen; return `<tr><td>${esc(id || 'tray')}</td><td>${esc(evaluation?.status || tray.status || tray.capacityStatus || 'not evaluated')}</td><td>${esc(displayNumber(evaluation?.utilizationPercent))}</td><td>${esc(displayCapacity(used))}</td><td>${esc(displayCapacity(limit))}</td><td>${esc(displayNumber(tray.inside_width ?? tray.widthIn ?? tray.width))}</td><td>${esc(displayNumber(tray.depth ?? tray.depthIn ?? tray.tray_depth))}</td><td>${esc(existing ? `${existing.trayId}: ${existing.existingCableCount} existing cable(s); inventory: ${existing.inventoryReference}; screening only` : 'New tray assumption')}</td></tr>`; }).join('');
  const rows = (proposal.loads || []).slice(0, 60).map(load => { const cable = (proposal.cables || []).find(item => item.loadId === load.id || item.load_id === load.id || item.to_tag === load.tag); const selected = cable?.protectiveDevice; const selectedLabel = selected ? `${selected.manufacturer || selected.vendor || ''} ${selected.catalogNumber || selected.catalog_number || selected.id || ''}`.trim() : 'Requirement only'; const stock = cable?.cableStockId ? `<small>Southwire stock ${esc(cable.cableStockId)} · ${esc(cable.source || cable.impedanceBasis || 'source not stated')}</small>` : ''; return `<tr><td>${esc(load.id || load.tag)}</td><td>${esc(load.panelId || load.panelRef || '—')}</td><td>${esc(displayNumber(cable?.currentA ?? cable?.current ?? load.currentA ?? load.current, 2))}</td><td>${esc(cable?.conductorSize || cable?.conductor_size || '—')}${stock}</td><td>${esc(displayNumber(cable?.voltageDropPct ?? cable?.voltage_drop_pct, 3))}</td><td>${esc(displayNumber(cable?.protectiveRequirement?.ampereRatingA ?? cable?.protective_requirement?.ampereRatingA, 0))}</td><td>${esc(selectedLabel)}<small>${esc(candidateProvenance(selected))}</small></td><td>${esc(cable?.sizingStatus || load.status || 'proposed')}</td></tr>`; }).join('');
  const overrideRows = (proposal.panelLocationOverrides || []).map(item => `<tr><td>${esc(item.panelId || '—')}</td><td>${esc(item.status || '—')}</td><td>${esc(item.requestedLocation ? `${displayNumber(item.requestedLocation.x)} / ${displayNumber(item.requestedLocation.y)} / ${displayNumber(item.requestedLocation.z)}` : '—')}</td><td>${esc(item.automaticLocation ? `${displayNumber(item.automaticLocation.x)} / ${displayNumber(item.automaticLocation.y)} / ${displayNumber(item.automaticLocation.z)}` : '—')}</td><td>${esc(item.effectiveLocation ? `${displayNumber(item.effectiveLocation.x)} / ${displayNumber(item.effectiveLocation.y)} / ${displayNumber(item.effectiveLocation.z)}` : '—')}</td><td>${esc(item.note || '')}</td></tr>`).join('');
  let panelLocationCandidates = [];
  try { panelLocationCandidates = getPanelLocationOverrideCandidates() || []; } catch { panelLocationCandidates = []; }
  const candidateRows = panelLocationCandidates.map(candidate => `<tr><td>${esc(candidate.panelId)}</td><td>${esc(`${displayNumber(candidate.location?.x)} / ${displayNumber(candidate.location?.y)} / ${displayNumber(candidate.location?.z)} ft`)}</td><td><button type="button" class="btn" data-panel-location-candidate="${esc(candidate.panelId)}" data-panel-location-x="${esc(candidate.location?.x)}" data-panel-location-y="${esc(candidate.location?.y)}" data-panel-location-z="${esc(candidate.location?.z)}">Use edited location as override</button></td></tr>`).join('');
  activeEvidenceProviders = proposalEvidenceProviders;
  try {
  output.innerHTML = `<h2 id="synthesis-output-heading">Proposal <span class="status-badge">${esc(proposal.status || 'unknown')}</span></h2>
    <p>${esc(proposal.report?.summary || 'Preliminary proposal generated for review.')} </p>
    <section id="synthesis-one-line-preview"><h3>Preliminary one-line</h3><p>Screening drawing of the generated connectivity. Candidate devices and motor protection require review; this does not authorize installation.</p>${state.oneLinePreview?.ok ? `<div class="synthesis-one-line-canvas" tabindex="0" aria-label="Scrollable preliminary one-line drawing">${state.oneLinePreview.svg}</div>` : `<p>Drawing unavailable: ${esc(state.oneLinePreview?.message || 'No complete generated topology returned.')}</p>`}</section>
    ${sourceFaultReview(proposal)}
    ${faultStudyReview(proposal)}
    ${faultEvolutionReview(proposal)}
    ${cableFaultWithstandReview(proposal)}
    ${faultScenarioReview(proposal)}
    ${deviceFaultReview(proposal)}
    ${curveSourceReview(proposal)}
    ${motorOverloadReview(proposal)}
    ${motorStarterReview(proposal)}
    ${adoptionSection}${trayAdoptionSection}
    ${motorAccelerationReview(proposal)}
    ${motorProtectionTimingReview(proposal)}
    ${motorThermalReview(proposal)}
    ${motorStartupSupervisionReview(proposal)}
    <section id="synthesis-load-dispositions"><h3>Equipment disposition</h3><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Input row</th><th>ID</th><th>Tag</th><th>Status</th><th>Input kW</th><th>Reason</th></tr></thead><tbody>${dispositionRows || '<tr><td colspan="6">No equipment disposition returned.</td></tr>'}</tbody></table></div></section>
    <section id="synthesis-input-evidence"><h3>Input evidence and units</h3><p class="field-hint">Units are ${esc(Object.entries(inputEvidence.units || {}).map(([key, value]) => `${key}: ${value}`).join(', ') || 'explicit in the design basis')}. Provenance is recorded as supplied; references are not independently verified.</p><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Record</th><th>Classification</th><th>Provided/default basis</th><th>References</th></tr></thead><tbody>${evidenceRows || '<tr><td colspan="4">No input evidence returned.</td></tr>'}</tbody></table></div></section>
    <section id="synthesis-design-criteria"><h3>Supplied design criteria</h3><p class="field-hint">Only criteria present in the supplied input are listed. Units are shown where the field has a defined unit.</p><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Criterion</th><th>Supplied value</th><th>Unit</th></tr></thead><tbody>${criteriaRows || '<tr><td colspan="3">No design criteria supplied.</td></tr>'}</tbody></table></div></section>
    <section id="synthesis-load-flow-study"><h3>Automatic load-flow revision</h3><p class="field-hint">The revision is a screening calculation tied to this proposal. Its result is not a protection coordination or stamped design approval.</p><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Metric</th><th>Result</th></tr></thead><tbody>${studyRows || '<tr><td colspan="2">No load-flow revision evidence returned.</td></tr>'}</tbody></table></div></section>
    ${motorRows ? `<section id="synthesis-motor-review"><h3>Motor design and starting screen</h3><p class="field-hint">Branch conductor sizing uses 125% of the referenced design full-load current. The starting result is an initial balanced DOL locked-rotor voltage screen. A separate optional supplied-curve acceleration screen appears below when requested; it does not establish thermal starting withstand. Motor overload, short-circuit, and ground-fault coordination remain unresolved.</p><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Motor</th><th>Rated V</th><th>Design FLC A</th><th>FLC basis</th><th>Nameplate A</th><th>Locked rotor A</th><th>Branch design A</th><th>Start screen</th><th>Protection</th></tr></thead><tbody>${motorRows}</tbody></table></div>${evidenceDetails("Starting screen evidence", () => (proposal.motorStartingValidation || {}))}</section>` : ''}
    ${transformer ? `<section id="synthesis-transformer-review"><h3>Selected transformer and both protection sides</h3><p class="field-hint">The selected profile reflects the connected operating-study revisions and current input signature. Ratings and overcurrent values are screening evidence; verify exact device configuration, conductor protection, inrush, coordination, and adopted requirements. The transferred secondary fault value is a three-phase screening estimate only.</p><div style="overflow:auto"><table class="synthesis-table"><tbody>${transformerRows}</tbody></table></div><h4>Transformer primary and secondary feeder circuits</h4><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Circuit</th><th>Side</th><th>Terminals</th><th>Voltage V</th><th>Current A</th><th>Conductor</th><th>Selected OCP candidate</th></tr></thead><tbody>${transformerFeederRows || '<tr><td colspan="7">No transformer feeder records returned.</td></tr>'}</tbody></table></div>${evidenceDetails("Transformer profile and candidate-selection evidence", () => ({ selectionCandidates: transformer.selectionCandidates || transformer.candidates || transformer.transformerCandidates, selectionReason: transformer.selectionReason, selectionInput: transformer.selectionInput, studyRevisionHistory: loadFlowStudy(proposal)?.history, primaryProtectiveDeviceCandidates: transformer.primaryProtectiveDeviceCandidates, secondaryMainCandidates: transformer.secondaryMainCandidates, protectionBasis: transformer.protectionBasis, faultModel: transformer.faultModel, secondaryFault: transformer.secondaryFault, phaseModelAssumption: transformer.phaseModelAssumption, sourceDocuments: transformer.sourceDocuments }))}</section>` : ''}
    <div class="synthesis-summary">${[['Loads', summary.loadCount ?? proposal.equipment?.length ?? 0], ['Panels', summary.panelCount ?? proposal.panels?.length ?? 0], ['Cables', summary.cableCount ?? proposal.cables?.length ?? 0], ['Trays', summary.trayCount ?? proposal.trays?.length ?? 0], ['Checks', checks.length], ['Issues', issues.length]].map(([label, value]) => `<div class="synthesis-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>
    ${distributionPartitionReview(proposal)}
    <h3>Panel location decisions</h3><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Panel</th><th>Status</th><th>Requested x/y/z ft</th><th>Automatic x/y/z ft</th><th>Effective x/y/z ft</th><th>Note</th></tr></thead><tbody>${overrideRows || '<tr><td colspan="6">No panel location overrides supplied.</td></tr>'}</tbody></table></div>${candidateRows ? `<h4>Canonical panel edits available for review</h4><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Panel</th><th>Current x/y/z ft</th><th></th></tr></thead><tbody>${candidateRows}</tbody></table></div>` : ''}
    <h3>Load distribution and cables</h3><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Load</th><th>Panel</th><th>Current A</th><th>Conductor</th><th>VD %</th><th>Protective requirement A</th><th>Selected candidate</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="8">No loads returned.</td></tr>'}</tbody></table></div>
    <section id="synthesis-route-review"><h3>Route preview</h3><div data-route-preview-content>${renderDesignSynthesisRoutePreview(proposal)}</div></section>
    <h3>Raceway capacity screening</h3><div style="overflow:auto"><table class="synthesis-table synthesis-capacity-table"><thead><tr><th>Corridor</th><th>Status</th><th>Utilization %</th><th>Used</th><th>Allowable</th><th>Width in</th><th>Depth in</th><th>Tray basis</th></tr></thead><tbody>${trayRows || '<tr><td colspan="8">No capacity evaluation returned.</td></tr>'}</tbody></table></div>
    <h3>Tabulated cable ampacity screening</h3><p class="field-hint">Screening result using supplied ambient, grouping, and optional solid-cover assumptions. This is not a detailed direct-burial IEC temperature prediction.</p><div style="overflow:auto"><table class="synthesis-table synthesis-thermal-table"><thead><tr><th>Circuit</th><th>Governing segment</th><th>Ambient °C</th><th>Grouped conductors</th><th>Solid cover ft</th><th>Adjustment factor</th><th>Ampacity A</th><th>Status</th></tr></thead><tbody>${thermalRows || '<tr><td colspan="8">Thermal assessment not evaluated.</td></tr>'}</tbody></table></div>
    <h3>Routing decisions</h3><p class="field-hint">Route selection uses greedy tray reservations. Bounded retries may prioritize capacity-blocked branches, panel feeders, or transformer primaries; no global optimization is claimed. A blocked result is not proof that no globally feasible routing exists.</p>${proposal.routingRetry ? `<p>Capacity routing recovered after ${esc(proposal.routingRetry.attempts)} trial(s); prioritized loads: ${esc(proposal.routingRetry.prioritizedLoadIds.join(', ') || 'none')}.</p>${proposal.routingRetry.prioritizedTransformerPrimaryId ? `<p>Prioritized transformer primary: ${esc(proposal.routingRetry.prioritizedTransformerPrimaryId)}.</p>` : ''}${proposal.routingRetry.prioritizedFeederPanelIds?.length ? `<p>Prioritized panel feeders: ${esc(proposal.routingRetry.prioritizedFeederPanelIds.join(', '))}.</p>` : ''}${proposal.routingRetry.prioritizedPanelIds?.length ? `<p>Panel reservation priority: ${esc(proposal.routingRetry.prioritizedPanelIds.join(', '))}. Panel identities and assigned loads are retained.</p>` : ''}` : ''}<div style="overflow:auto"><table class="synthesis-table synthesis-routing-table"><thead><tr><th>Circuit</th><th>Chosen edges</th><th>Length ft</th><th>Conductor</th><th>Shortest route result</th><th>Candidate searches</th></tr></thead><tbody>${routingDecisionRows(proposal) || '<tr><td colspan="6">No routing decisions returned.</td></tr>'}</tbody></table></div>
    <h3>Endpoint conduit screening</h3><div style="overflow:auto"><table class="synthesis-table synthesis-endpoint-table"><thead><tr><th>Circuit</th><th>Segment</th><th>Conduit type</th><th>Conduit</th><th>Trade size</th><th>Fill %</th><th>Status</th></tr></thead><tbody>${endpointInstallationRows(proposal) || '<tr><td colspan="7">No endpoint conduit coverage returned.</td></tr>'}</tbody></table></div>
    <h3>Checks</h3><ul>${checks.length ? checks.map(item => `<li>${esc(item.id || item.name || item.check || 'Unnamed check')}: ${esc(item.status || item.result || item.message || '—')}</li>`).join('') : '<li>No checks returned.</li>'}</ul>
    <h3>Issues and assumptions</h3><ul>${issues.concat(proposal.assumptions || []).map(item => { const scope = [item.cable, item.path, item.racewayId].filter(Boolean).join(' · '); const detail = item.message || item.detail || item.code || (scope ? `${item.code || 'Issue'} (${scope})` : '') || (typeof item === 'string' ? item : JSON.stringify(item)); return `<li class="synthesis-issue--${esc(item.severity || 'info')}">${esc(scope ? `${scope}: ${detail}` : detail)}</li>`; }).join('') || '<li>No issues returned; qualified human review remains required.</li>'}</ul>
    ${evidenceDetails("One-line and route summary", () => ({ oneLine: proposal.oneLine, routeResults: proposal.routeResults, decisions: proposal.decisions }))}`;
  } finally { activeEvidenceProviders = null; }
}
function motorAccelerationReview(proposal) {
  const validation = proposal.motorAccelerationValidation;
  if (!validation || validation.status === 'not-requested') return '';
  const cases = Array.isArray(validation.cases) ? validation.cases : [];
  const motorById = new Map((proposal.loads || []).filter(load => load.motor).map(load => [String(load.id), load]));
  const issueRows = (validation.issues || []).map(item => `<li>${esc(item.code || 'issue')} (${esc(item.path || 'motorAcceleration')}): ${esc(item.message || 'Evaluation failed.')}</li>`).join('');
  const revision = validation.revision || {};
  const sharedRevisionBudget = Number.isInteger(proposal.inputs?.criteria?.loadFlow?.maxRevisions) ? proposal.inputs.criteria.loadFlow.maxRevisions : 12;
  const revisionRows = (revision.history || []).map(item => {
    const cases = (item.accelerationCases || []).map(result => `${result.motorId || 'motor'}: ${result.status || 'unknown'}, ${displayNumber(result.timeS, 5)} s, criterion ${result.criterionStatus || 'not evaluated'}, torque ${result.torqueStatus || 'not returned'}${result.failure ? ` (${result.failure})` : ''}`).join('; ');
    const changes = (item.changedCircuits || []).map(change => `${change.id || 'circuit'} → ${change.size || 'unchanged'}`).join(', ') || 'none';
    return `<tr><td>${esc(displayNumber(item.revision, 0))}</td><td>${esc(item.status || 'unknown')}</td><td>${esc(item.operatingStatus || 'not evaluated')}</td><td>${esc(item.startingStatus || 'not evaluated')}</td><td>${esc(cases || 'No acceleration case record')}</td><td>${esc(changes)}</td><td>${esc(item.transformerProfileId || 'none')}</td><td>${esc(item.reason || 'not returned')}</td></tr>`;
  }).join('');
  const sections = cases.map(item => {
    const motor = motorById.get(String(item.motorId));
    const input = motor?.motor?.acceleration || {};
    const timeline = (item.timeline || []).map(row => `<tr><td>${esc(displayNumber(row.speedRpm, 0))}</td><td>${esc(displayNumber(row.timeS, 5))}</td><td>${esc(displayNumber(row.terminalVoltagePu, 5))}</td><td>${esc(displayNumber(row.currentA, 3))}</td><td>${esc(displayNumber(row.motorTorqueNm, 3))}</td><td>${esc(displayNumber(row.loadTorqueNm, 3))}</td><td>${esc(displayNumber(row.netTorqueNm, 3))}</td></tr>`).join('');
    const caseIssues = (item.issues || []).map(entry => `<li>${esc(entry.code || 'issue')} (${esc(entry.path || item.motorId)}): ${esc(entry.message || 'Evaluation failed.')}</li>`).join('');
    return `<article class="synthesis-motor-starter-case"><h4>Motor ${esc(item.motorId || 'unknown')}: ${esc(item.status || 'unknown')}</h4><p><strong>Acceleration time:</strong> ${esc(displayNumber(item.timeS, 5))} s · <strong>Maximum-time criterion:</strong> ${esc(validation.criteria?.maximumTimeS == null ? 'not supplied' : `${displayNumber(validation.criteria.maximumTimeS, 4)} s`)} · <strong>Criterion:</strong> ${esc(item.criterionStatus || 'not evaluated')} · <strong>Electrical current-squared exposure:</strong> ${esc(displayNumber(item.electricalExposureA2S, 4))} A²·s (exposure only, not thermal withstand).</p>${item.failure ? `<p><strong>Acceleration stopped:</strong> ${esc(item.failure)} at ${esc(displayNumber(item.failedAtSpeedRpm, 2))} rpm.</p>` : ''}<p><strong>Input references:</strong> model ${esc(input.reference || 'not supplied')}; motor inertia ${esc(input.motorInertiaReference || 'not supplied')}; coupled-load inertia ${esc(input.loadInertiaReference || 'not supplied')}; performance curve ${esc(input.performanceCurve?.reference || 'not supplied')}; load torque curve ${esc(input.loadTorqueCurve?.reference || 'not supplied')}.</p><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Speed rpm</th><th>Elapsed s</th><th>Terminal V pu</th><th>Current A</th><th>Motor torque N·m</th><th>Load torque N·m</th><th>Net torque N·m</th></tr></thead><tbody>${timeline || '<tr><td colspan="7">No converged speed timeline returned.</td></tr>'}</tbody></table></div>${caseIssues ? `<h5>Case issues</h5><ul>${caseIssues}</ul>` : ''}${evidenceDetails("Curves, inertia, numerical refinement, and case evidence", () => ({ input, case: item }))}</article>`;
  }).join('');
  return `<section id="synthesis-motor-acceleration-review"><h3>Quasi-steady motor acceleration screen</h3><p>This evaluates the supplied balanced direct-on-line speed curves on the finalized proposed network. It uses a quasi-steady voltage-adjusted torque/current screen, not a time-domain or transient motor/network model. Automatic trials use the same <code>criteria.loadFlow.maxRevisions</code> budget as operating and starting studies; the supplied acceleration limit and other input criteria remain unchanged. A numerical result does not complete motor protection or enable Apply.</p><table class="synthesis-table"><tbody><tr><th>Screen status</th><td>${esc(validation.status || 'not evaluated')}</td></tr><tr><th>Method</th><td>${esc(validation.method || 'not returned')}</td></tr><tr><th>Model input fingerprint</th><td>${esc(validation.modelInputFingerprint || 'not returned')}</td></tr><tr><th>Duration criterion</th><td>${esc(validation.criteria?.maximumTimeS == null ? 'not supplied; no duration pass is claimed' : `${displayNumber(validation.criteria.maximumTimeS, 4)} s maximum`)}</td></tr><tr><th>Revision result</th><td>${esc(revision.status || 'not returned')}; shared revision budget ${esc(displayNumber(sharedRevisionBudget, 0))}; stop reason ${esc(revision.stopReason || 'none')}</td></tr><tr><th>Numerical convergence</th><td>Per-case refinement and evaluation counts are shown in each case record.</td></tr></tbody></table>${revisionRows ? `<h4>Shared-budget revision history</h4><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Revision</th><th>Result</th><th>Operating</th><th>Starting</th><th>Acceleration cases</th><th>Changed circuits</th><th>Transformer profile</th><th>Reason</th></tr></thead><tbody>${revisionRows}</tbody></table></div>` : ''}${issueRows ? `<h4>Blocking evaluation issues</h4><ul>${issueRows}</ul>` : ''}${sections || '<p>No motor acceleration cases returned.</p>'}<h4>Screen limitations</h4><ul>${(validation.limitations || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul></section>`;
}
function motorProtectionTimingReview(proposal) {
  const validation = proposal.motorProtectionTimingValidation;
  if (!validation || validation.status === 'not-requested') return '';
  if (String(validation.method || '').includes('stall-current-range') || (validation.cases || []).some(item => item?.schemaVersion === '2.0.0')) return motorProtectionTimingRangeReview(proposal, validation);
  const inputEquipment = proposal.inputs?.original?.equipment || proposal.equipment || [];
  const motorInputs = new Map((Array.isArray(inputEquipment) ? inputEquipment : []).filter(item => item?.motor).map(item => [String(item.id), item.motor.protectionTiming || {}]));
  const caseRows = (Array.isArray(validation.cases) ? validation.cases : []).filter(item => item && typeof item === 'object').map(item => {
    const supplied = motorInputs.get(String(item.motorId)) || {};
    const deviceResults = Array.isArray(item.devices) ? item.devices.filter(device => device && typeof device === 'object') : [];
    const startupComparison = item.comparisonDetails?.startupRideThrough || (typeof item.comparisons?.startupRideThrough === 'object' ? item.comparisons.startupRideThrough : {});
    const stallComparison = item.comparisonDetails?.selectedStateSafeStall || (typeof item.comparisons?.selectedStateSafeStall === 'object' ? item.comparisons.selectedStateSafeStall : {});
    const startupStatus = startupComparison.status || item.comparisons?.startupRideThrough || 'not evaluated';
    const stallStatus = stallComparison.status || item.comparisons?.selectedStateSafeStall || 'not evaluated';
    const limitingStartup = deviceResults.length ? Math.min(...deviceResults.map(device => device.startupRideThroughMarginS)) : null;
    const limitingStall = deviceResults.length ? Math.min(...deviceResults.map(device => device.selectedStateWithstandMarginS)) : null;
    const comparisonRows = `<tr><th scope="row">Startup ride-through</th><td>${esc(startupStatus)}</td><td>${esc(displayNumber(startupComparison.requiredTimeS ?? item.startupDurationS, 4))} s required</td><td>${esc(displayNumber(startupComparison.availableTimeS, 5))} s minimum trip</td><td>${esc(displayNumber(startupComparison.marginS ?? limitingStartup, 5))} s margin</td><td>${esc(startupComparison.limitingDevice || deviceResults.find(device => device.startupRideThroughMarginS === limitingStartup)?.role || '—')}</td></tr><tr><th scope="row">Reference-current clearing vs selected-state withstand</th><td>${esc(stallStatus)}</td><td>${esc(displayNumber(stallComparison.requiredTimeS ?? item.earliestMaximumTotalCircuitClearingS, 5))} s clearing upper bound</td><td>${esc(displayNumber(stallComparison.availableTimeS ?? item.motorWithstand?.[`${item.initialState}MinimumSafeStallTimeS`], 4))} s withstand</td><td>${esc(displayNumber(stallComparison.marginS ?? limitingStall, 5))} s margin</td><td>${esc(stallComparison.responsibleDevice || item.responsibleEarliestClearingDevice || '—')}</td></tr>`;
    const devices = deviceResults.map(device => `<tr><td>${esc(device.role || 'device')}</td><td>${esc(device.catalogNumber || '—')}</td><td>${esc(device.source?.evidenceClass || 'unverified')} · ${esc(device.source?.reference || 'reference not supplied')}</td><td>${esc(displayNumber(device.setting?.fixedIrA ?? device.setting?.dialSettingA, 3))} A${device.setting?.instantaneousPickupA ? `; instantaneous ${esc(displayNumber(device.setting.instantaneousPickupA, 0))} A` : ''}</td><td>${esc(displayNumber(device.minimumTripS, 5))} s</td><td>${esc(displayNumber(device.maximumTotalCircuitClearingS, 5))} s</td><td>${esc(displayNumber(device.startupRideThroughMarginS, 5))} s</td><td>${esc(displayNumber(device.selectedStateWithstandMarginS, 5))} s</td></tr>`).join('');
    const caseIssues = (item.issues || []).map(issue => `<li>${esc(issue.code || 'issue')}: ${esc(issue.message || 'Evaluation blocked.')}</li>`).join('');
    const voltageRanges = (Array.isArray(supplied.devices) ? supplied.devices.filter(device => device && typeof device === 'object') : []).map(device => `${device.role}: ${device.conditions?.initialState || 'state unknown'}, ${displayNumber(device.conditions?.ambientTemperatureC, 1)} °C, ${displayNumber(device.conditions?.frequencyHz, 0)} Hz/${displayNumber(device.conditions?.phases, 0)} phases, ${JSON.stringify(device.conditions?.voltageRangeV || [])} V (${device.conditions?.reference || 'condition reference missing'})`).join('; ');
    const withstandConditions = supplied.motorWithstand?.[`${item.initialState || supplied.initialState}Conditions`];
    return `<article class="synthesis-motor-starter-case"><h4>Motor ${esc(item.motorId || 'unknown')} · ${esc(item.status || 'blocked')}</h4><p><strong>Bounded reference-current timing screen:</strong> ${esc(displayNumber(item.referenceStartCurrentA ?? supplied.referenceStartCurrentA, 2))} A reference; supplied current envelope ${esc(displayNumber(supplied.currentEnvelopeA?.minimumA, 2))}–${esc(displayNumber(supplied.currentEnvelopeA?.maximumA, 2))} A (${esc(supplied.currentEnvelopeA?.reference || 'envelope reference missing')}); ${esc(displayNumber(item.accelerationTimeS, 5))} s final acceleration + ${esc(displayNumber(item.startMarginS ?? supplied.startMarginS, 4))} s margin = ${esc(displayNumber(item.startupDurationS, 5))} s. Initial motor state: ${esc(item.initialState || supplied.initialState || 'not supplied')}; opposite state: ${esc(item.otherInitialState?.status || 'not evaluated')}.</p><p><strong>Conditions and evidence:</strong> ${esc(displayNumber(item.ambientTemperatureC ?? supplied.ambientTemperatureC, 1))} °C, ${esc(displayNumber(item.frequencyHz ?? supplied.frequencyHz, 0))} Hz, ${esc(displayNumber(item.phases ?? supplied.phases, 0))} phases; source class ${esc(item.evidenceClass || 'unverified')} (${esc(item.evidenceStatus || 'supplied-unverified')}); motor withstand ${esc(supplied.motorWithstand?.source?.reference || 'reference not supplied')}, ${esc(withstandConditions?.initialState || 'state unknown')} voltage range ${esc(JSON.stringify(withstandConditions?.voltageRangeV || []))} V (${esc(withstandConditions?.reference || 'condition reference missing')}). Device condition and voltage bounds: ${esc(voltageRanges || 'not supplied')}. Values and references are not independently verified.</p><p><strong>Applicability:</strong> This clearing comparison is at the stated reference current only; it does not establish actual motor stall protection at lower currents.</p><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Comparison</th><th>Status</th><th>Required</th><th>Available</th><th>Margin</th><th>Limiting device</th></tr></thead><tbody>${comparisonRows}</tbody></table></div><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Role</th><th>Exact part</th><th>Source evidence</th><th>Candidate setting</th><th>Minimum trip at reference current</th><th>Maximum total clearing at reference current</th><th>Startup margin</th><th>Selected-state withstand margin</th></tr></thead><tbody>${devices || '<tr><td colspan="8">No device timing rows returned.</td></tr>'}</tbody></table></div>${caseIssues ? `<h5>Blocking issues</h5><ul>${caseIssues}</ul>` : ''}${evidenceDetails("Timing inputs and complete comparison record", () => ({ input: supplied, case: item }))}</article>`;
  }).join('');
  const issues = (validation.issues || []).map(issue => `<li>${esc(issue.code || 'issue')}: ${esc(issue.message || 'Validation blocked.')}</li>`).join('');
  const limitations = (validation.limitations || []).map(item => `<li>${esc(item)}</li>`).join('');
  return `<section id="synthesis-motor-protection-timing-review"><h3>Motor protection timing comparison</h3><p>This is a bounded reference-current screen using supplied curves and conditions. It compares final acceleration duration plus margin, curve timing bounds, and the selected motor-state safe-stall bound. It does not integrate time-varying device response, verify manufacturer data, establish coordination or complete protection, and does not enable Apply.</p><table class="synthesis-table"><tbody><tr><th>Screen status</th><td>${esc(validation.status || 'blocked')}</td></tr><tr><th>Complete protection</th><td>${esc(validation.completeProtectionStatus || 'blocked')}</td></tr><tr><th>Method</th><td>${esc(validation.method || 'not returned')}</td></tr><tr><th>Input fingerprint</th><td>${esc(validation.inputFingerprint || 'not returned')}</td></tr><tr><th>Source data</th><td>Supplied curves and conditions are unverified; manufacturer and installation values are not authenticated.</td></tr></tbody></table>${issues ? `<h4>Blocking issues</h4><ul>${issues}</ul>` : ''}${caseRows || '<p>No protection timing cases returned.</p>'}<h4>Limitations</h4><ul>${limitations || '<li>Supplied evidence only; qualified review and additional protection studies remain necessary.</li>'}</ul><p><strong>Study boundary:</strong> only the selected initial state is evaluated; the opposite hot/cold state remains unevaluated. Passing a timing comparison is not device qualification, dynamic integration, coordination approval, or complete motor protection.</p>${evidenceDetails("Full validation record", () => (validation))}</section>`;
}
function motorProtectionTimingRangeReview(proposal, validation) {
  const inputEquipment = proposal.inputs?.original?.equipment || proposal.equipment || [];
  const motorInputs = new Map((Array.isArray(inputEquipment) ? inputEquipment : []).filter(item => item?.motor).map(item => [String(item.id), item.motor.protectionTiming || {}]));
  const cases = (Array.isArray(validation.cases) ? validation.cases : []).filter(item => item && typeof item === 'object').map(item => {
    const supplied = motorInputs.get(String(item.motorId)) || {};
    if (supplied.schemaVersion !== '2.0.0' && item.schemaVersion !== '2.0.0') return motorProtectionTimingReferenceCaseReview(item, supplied);
    const range = item.stallCurrentRangeA || supplied.stallCurrentRangeA || {};
    const network = item.networkLockedRotorCurrentA || {};
    const stall = item.comparisons?.selectedStateSafeStall || {};
    const startup = item.comparisons?.startupRideThrough || {};
    const devices = (Array.isArray(item.devices) ? item.devices : []).filter(device => device && typeof device === 'object').map(device => {
      const comparison = device.stallRangeComparison || {};
      const suppliedDevice = (Array.isArray(supplied.devices) ? supplied.devices : []).find(candidate => candidate?.role === device.role && candidate?.catalogNumber === device.catalogNumber) || {};
      const points = (Array.isArray(comparison.points) ? comparison.points : []).map(point => `<tr><td>${esc(displayNumber(point.currentA, 3))} A</td><td>${esc(displayNumber(point.minimumTripS, 5))} s</td><td>${esc(displayNumber(point.maximumTotalCircuitClearingS, 5))} s</td><td>${esc(displayNumber(point.minimumSafeStallTimeS, 5))} s</td><td>${esc(displayNumber(point.marginS, 5))} s</td><td>${esc(point.status || 'not evaluated')}</td></tr>`).join('');
      const deviceConditions = device.conditions || suppliedDevice.conditions || {};
      return `<article class="synthesis-motor-starter-case"><h5>${esc(device.role || 'device')} · ${esc(device.catalogNumber || 'part not supplied')} · ${esc(comparison.status || device.status || 'blocked')}</h5><p><strong>Candidate setting:</strong> ${esc(JSON.stringify(device.setting || {}))}; source ${esc(device.source?.evidenceClass || 'unverified')} (${esc(device.source?.reference || 'reference missing')}); condition ${esc(deviceConditions.initialState || 'state unknown')}, ${esc(displayNumber(deviceConditions.ambientTemperatureC, 1))} °C, ${esc(displayNumber(deviceConditions.frequencyHz, 0))} Hz/${esc(displayNumber(deviceConditions.phases, 0))} phases, voltage bounds ${esc(JSON.stringify(deviceConditions.voltageRangeV || []))} V (${esc(deviceConditions.reference || 'reference missing')}); evidence ${esc(comparison.evidenceStatus || item.evidenceStatus || 'supplied-unverified')}.</p><p><strong>Range result:</strong> ${esc(displayNumber(comparison.currentRangeA?.minimumA ?? range.minimumA, 3))}–${esc(displayNumber(comparison.currentRangeA?.maximumA ?? range.maximumA, 3))} A; limiting current ${esc(displayNumber(comparison.limitingCurrentA, 3))} A; minimum margin ${esc(displayNumber(comparison.minimumMarginS, 5))} s; fresh network locked-rotor current ${esc(displayNumber(comparison.networkLockedRotorCurrentA ?? network.valueA, 3))} A.</p><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Compared current</th><th>Minimum trip</th><th>Maximum total clearing</th><th>Selected-state minimum safe-stall bound</th><th>Margin</th><th>Status</th></tr></thead><tbody>${points || '<tr><td colspan="6">No current-point comparisons returned.</td></tr>'}</tbody></table></div></article>`;
    }).join('');
    const withstand = supplied.motorWithstand || {};
    const conditions = withstand[`${item.initialState || supplied.initialState}Conditions`] || {};
    const issues = (Array.isArray(item.issues) ? item.issues : []).map(issue => `<li>${esc(issue.code || 'issue')}: ${esc(issue.message || 'Evaluation blocked.')}</li>`).join('');
    return `<article class="synthesis-motor-starter-case"><h4>Motor ${esc(item.motorId || 'unknown')} · ${esc(item.status || 'blocked')}</h4><p><strong>Supplied stall-current range clearing vs selected-state withstand:</strong> ${esc(displayNumber(range.minimumA, 3))}–${esc(displayNumber(range.maximumA, 3))} A (${esc(range.reference || 'range reference missing')}); status ${esc(stall.status || 'not evaluated')}; limiting current ${esc(displayNumber(stall.limitingCurrentA, 3))} A; margin ${esc(displayNumber(stall.marginS, 5))} s. This compares supplied bounds across the declared constant-stall current interval; the interval is not a motor current trajectory.</p><p><strong>Fresh canonical network locked-rotor result:</strong> ${esc(displayNumber(network.valueA, 3))} A at ${esc(displayNumber(network.terminalVoltagePu, 5))} pu; ${esc(network.status || 'not returned')}; basis ${esc(network.basis || 'not returned')}. <strong>Startup ride-through:</strong> ${esc(startup.status || 'not evaluated')}, ${esc(displayNumber(startup.marginS, 5))} s limiting margin (${esc(startup.limitingDevice || 'device not identified')}).</p><p><strong>Conditions and evidence:</strong> selected state ${esc(item.initialState || 'not supplied')}, ${esc(displayNumber(item.ambientTemperatureC ?? supplied.ambientTemperatureC, 1))} °C, ${esc(displayNumber(item.frequencyHz ?? supplied.frequencyHz, 0))} Hz, ${esc(displayNumber(item.phases ?? supplied.phases, 0))} phases; withstand source ${esc(withstand.source?.reference || 'reference missing')}; voltage bounds ${esc(JSON.stringify(conditions.voltageRangeV || []))} V (${esc(conditions.reference || 'condition reference missing')}); source evidence ${esc(item.evidenceStatus || 'supplied-unverified')} and not independently verified.</p><p><strong>Applicability:</strong> This bounded curve comparison does not model a motor current trajectory, thermal memory, or actual clearing. It does not establish complete motor protection, device qualification, or coordination; motor Apply remains blocked.</p><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Comparison</th><th>Status</th><th>Required</th><th>Available</th><th>Margin</th><th>Responsible device</th></tr></thead><tbody><tr><th>Startup ride-through</th><td>${esc(startup.status || 'not evaluated')}</td><td>${esc(displayNumber(startup.requiredTimeS, 5))} s</td><td>${esc(displayNumber(startup.availableTimeS, 5))} s</td><td>${esc(displayNumber(startup.marginS, 5))} s</td><td>${esc(startup.limitingDevice || '—')}</td></tr><tr><th>Supplied stall-current range clearing vs selected-state withstand</th><td>${esc(stall.status || 'not evaluated')}</td><td>${esc(displayNumber(stall.requiredTimeS, 5))} s</td><td>${esc(displayNumber(stall.availableTimeS, 5))} s</td><td>${esc(displayNumber(stall.marginS, 5))} s</td><td>${esc(stall.responsibleDevice || '—')}</td></tr></tbody></table></div>${devices || '<p>No device range comparisons returned.</p>'}${issues ? `<h5>Blocking issues</h5><ul>${issues}</ul>` : ''}${evidenceDetails("Supplied curves, conditions, and complete case record", () => ({ input: supplied, case: item }))}</article>`;
  }).join('');
  const issues = (Array.isArray(validation.issues) ? validation.issues : []).map(issue => `<li>${esc(issue.code || 'issue')}: ${esc(issue.message || 'Validation blocked.')}</li>`).join('');
  const hasRangeCase = (Array.isArray(validation.cases) ? validation.cases : []).some(item => item?.schemaVersion === '2.0.0' || motorInputs.get(String(item?.motorId))?.schemaVersion === '2.0.0');
  const limitationItems = [...(Array.isArray(validation.limitations) ? validation.limitations : []).filter(item => !hasRangeCase || !String(item).startsWith('Reference-current envelope comparison only')),
    ...(Array.isArray(validation.cases) ? validation.cases.flatMap(item => item?.schemaVersion === '2.0.0' ? item.limitations || [] : []) : [])];
  const limitations = [...new Set(limitationItems)].map(item => `<li>${esc(item)}</li>`).join('');
  return `<section id="synthesis-motor-protection-timing-review"><h3>Motor protection timing comparison</h3><p>Each motor case uses the timing schema shown in its supplied input. V1 is a bounded reference-current screen; V2 compares supplied bounds over a declared stall-current interval. Neither establishes a motor current trajectory, dynamic device response, thermal memory, actual clearing, device qualification, coordination, or complete protection. All evidence remains supplied and unverified; motor Apply remains blocked.</p><table class="synthesis-table"><tbody><tr><th>Screen status</th><td>${esc(validation.status || 'blocked')}</td></tr><tr><th>Complete protection</th><td>${esc(validation.completeProtectionStatus || 'blocked')}</td></tr><tr><th>Method</th><td>${esc(validation.method || 'not returned')}</td></tr><tr><th>Input fingerprint</th><td>${esc(validation.inputFingerprint || 'not returned')}</td></tr><tr><th>Source data</th><td>Supplied synthetic or external curves and conditions are unverified; manufacturer and installation values are not authenticated.</td></tr></tbody></table>${issues ? `<h4>Blocking issues</h4><ul>${issues}</ul>` : ''}${cases || '<p>No protection timing cases returned.</p>'}<h4>Limitations</h4><ul>${limitations || '<li>Supplied evidence only; qualified review and additional protection studies remain necessary.</li>'}</ul><p><strong>Study boundary:</strong> each case evaluates only its selected state and applicable reference current or declared current interval. Passing a bounded comparison is not device qualification, dynamic integration, coordination approval, or complete motor protection.</p>${evidenceDetails("Full validation record", () => (validation))}</section>`;
}
function motorProtectionTimingReferenceCaseReview(item, supplied) {
  const deviceResults = Array.isArray(item.devices) ? item.devices.filter(device => device && typeof device === 'object') : [];
  const startupComparison = item.comparisonDetails?.startupRideThrough || (typeof item.comparisons?.startupRideThrough === 'object' ? item.comparisons.startupRideThrough : {});
  const stallComparison = item.comparisonDetails?.selectedStateSafeStall || (typeof item.comparisons?.selectedStateSafeStall === 'object' ? item.comparisons.selectedStateSafeStall : {});
  const startupStatus = startupComparison.status || item.comparisons?.startupRideThrough || 'not evaluated';
  const stallStatus = stallComparison.status || item.comparisons?.selectedStateSafeStall || 'not evaluated';
  const limitingStartup = deviceResults.length ? Math.min(...deviceResults.map(device => device.startupRideThroughMarginS)) : null;
  const limitingStall = deviceResults.length ? Math.min(...deviceResults.map(device => device.selectedStateWithstandMarginS)) : null;
  const comparisonRows = `<tr><th scope="row">Startup ride-through</th><td>${esc(startupStatus)}</td><td>${esc(displayNumber(startupComparison.requiredTimeS ?? item.startupDurationS, 4))} s required</td><td>${esc(displayNumber(startupComparison.availableTimeS, 5))} s minimum trip</td><td>${esc(displayNumber(startupComparison.marginS ?? limitingStartup, 5))} s margin</td><td>${esc(startupComparison.limitingDevice || deviceResults.find(device => device.startupRideThroughMarginS === limitingStartup)?.role || '—')}</td></tr><tr><th scope="row">Reference-current clearing vs selected-state withstand</th><td>${esc(stallStatus)}</td><td>${esc(displayNumber(stallComparison.requiredTimeS ?? item.earliestMaximumTotalCircuitClearingS, 5))} s clearing upper bound</td><td>${esc(displayNumber(stallComparison.availableTimeS ?? item.motorWithstand?.[`${item.initialState}MinimumSafeStallTimeS`], 4))} s withstand</td><td>${esc(displayNumber(stallComparison.marginS ?? limitingStall, 5))} s margin</td><td>${esc(stallComparison.responsibleDevice || item.responsibleEarliestClearingDevice || '—')}</td></tr>`;
  const devices = deviceResults.map(device => `<tr><td>${esc(device.role || 'device')}</td><td>${esc(device.catalogNumber || '—')}</td><td>${esc(device.source?.evidenceClass || 'unverified')} · ${esc(device.source?.reference || 'reference not supplied')}</td><td>${esc(displayNumber(device.setting?.fixedIrA ?? device.setting?.dialSettingA, 3))} A${device.setting?.instantaneousPickupA ? `; instantaneous ${esc(displayNumber(device.setting.instantaneousPickupA, 0))} A` : ''}</td><td>${esc(displayNumber(device.minimumTripS, 5))} s</td><td>${esc(displayNumber(device.maximumTotalCircuitClearingS, 5))} s</td><td>${esc(displayNumber(device.startupRideThroughMarginS, 5))} s</td><td>${esc(displayNumber(device.selectedStateWithstandMarginS, 5))} s</td></tr>`).join('');
  const caseIssues = (item.issues || []).map(issue => `<li>${esc(issue.code || 'issue')}: ${esc(issue.message || 'Evaluation blocked.')}</li>`).join('');
  const voltageRanges = (Array.isArray(supplied.devices) ? supplied.devices.filter(device => device && typeof device === 'object') : []).map(device => `${device.role}: ${device.conditions?.initialState || 'state unknown'}, ${displayNumber(device.conditions?.ambientTemperatureC, 1)} °C, ${displayNumber(device.conditions?.frequencyHz, 0)} Hz/${displayNumber(device.conditions?.phases, 0)} phases, ${JSON.stringify(device.conditions?.voltageRangeV || [])} V (${device.conditions?.reference || 'condition reference missing'})`).join('; ');
  const withstandConditions = supplied.motorWithstand?.[`${item.initialState || supplied.initialState}Conditions`];
  return `<article class="synthesis-motor-starter-case"><h4>Motor ${esc(item.motorId || 'unknown')} · ${esc(item.status || 'blocked')}</h4><p><strong>Bounded reference-current timing screen:</strong> ${esc(displayNumber(item.referenceStartCurrentA ?? supplied.referenceStartCurrentA, 2))} A reference; supplied current envelope ${esc(displayNumber(supplied.currentEnvelopeA?.minimumA, 2))}–${esc(displayNumber(supplied.currentEnvelopeA?.maximumA, 2))} A (${esc(supplied.currentEnvelopeA?.reference || 'envelope reference missing')}); ${esc(displayNumber(item.accelerationTimeS, 5))} s final acceleration + ${esc(displayNumber(item.startMarginS ?? supplied.startMarginS, 4))} s margin = ${esc(displayNumber(item.startupDurationS, 5))} s. Initial motor state: ${esc(item.initialState || supplied.initialState || 'not supplied')}; opposite state: ${esc(item.otherInitialState?.status || 'not evaluated')}.</p><p><strong>Conditions and evidence:</strong> ${esc(displayNumber(item.ambientTemperatureC ?? supplied.ambientTemperatureC, 1))} °C, ${esc(displayNumber(item.frequencyHz ?? supplied.frequencyHz, 0))} Hz, ${esc(displayNumber(item.phases ?? supplied.phases, 0))} phases; source class ${esc(item.evidenceClass || 'unverified')} (${esc(item.evidenceStatus || 'supplied-unverified')}); motor withstand ${esc(supplied.motorWithstand?.source?.reference || 'reference not supplied')}, ${esc(withstandConditions?.initialState || 'state unknown')} voltage range ${esc(JSON.stringify(withstandConditions?.voltageRangeV || []))} V (${esc(withstandConditions?.reference || 'condition reference missing')}). Device condition and voltage bounds: ${esc(voltageRanges || 'not supplied')}. Values and references are not independently verified.</p><p><strong>Applicability:</strong> This clearing comparison is at the stated reference current only; it does not establish actual motor stall protection at lower currents.</p><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Comparison</th><th>Status</th><th>Required</th><th>Available</th><th>Margin</th><th>Limiting device</th></tr></thead><tbody>${comparisonRows}</tbody></table></div><div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Role</th><th>Exact part</th><th>Source evidence</th><th>Candidate setting</th><th>Minimum trip at reference current</th><th>Maximum total clearing at reference current</th><th>Startup margin</th><th>Selected-state withstand margin</th></tr></thead><tbody>${devices || '<tr><td colspan="8">No device timing rows returned.</td></tr>'}</tbody></table></div>${caseIssues ? `<h5>Blocking issues</h5><ul>${caseIssues}</ul>` : ''}${evidenceDetails("Timing inputs and complete comparison record", () => ({ input: supplied, case: item }))}</article>`;
}
function motorThermalReview(proposal) {
  const validation = proposal.motorThermalValidation;
  if (!validation || validation.status === 'not-requested') return '';
  const inputEquipment = proposal.inputs?.original?.equipment || proposal.equipment || proposal.loads || [];
  const inputs = new Map(inputEquipment.map(item => [String(item.id), item.motor?.rem610Thermal || {}]));
  const motors = new Map((proposal.loads || proposal.equipment || inputEquipment).map(item => [String(item.id), item.motor || {}]));
  const issues = (validation.issues || []).map(item => `<li>${esc(item.code || 'issue')} (${esc(item.path || 'motorThermal')}): ${esc(item.message || 'Evaluation failed.')}</li>`).join('');
  const rows = (validation.cases || []).map(item => {
    const source = inputs.get(String(item.motorId)) || {};
    const calculation = item.calculations || {};
    const normalized = calculation.normalized || {};
    const requirements = calculation.requirements || {};
    const range = calculation.feasibleRange || {};
    const selected = calculation.candidate || {};
    const setting = item.candidateT6xSettingS ?? item.recommendedT6xSettingS;
    const feasible = range.toleranceAwareCandidatesS || [];
    const caseIssues = (item.issues || []).map(entry => `<li>${esc(entry.code || 'issue')} (${esc(entry.path || item.motorId)}): ${esc(entry.message || 'Evaluation failed.')}</li>`).join('');
    return `<article class="synthesis-motor-starter-case"><h4>Motor ${esc(item.motorId || 'unknown')} · ${esc(item.status || 'blocked')}</h4><p><strong>Final acceleration time:</strong> ${esc(displayNumber(item.startupTimeS, 5))} s · <strong>Permitted hot/cold starts:</strong> ${esc(displayNumber(source.permittedHotStarts, 0))}/${esc(displayNumber(source.permittedColdStarts, 0))} · <strong>Time margin:</strong> ${esc(displayNumber(source.startTimeMarginPct, 2))}% · <strong>Safe-stall limit:</strong> ${esc(displayNumber(requirements.motorSafeStallTimeS ?? source.motorSafeStallTimeS, 3))} s (${esc(source.motorSafeStallReference || 'reference missing')}).</p><p><strong>Relay setting alternative:</strong> ABB REM610 ANSI reference-current screen, fixed DOL, p = 50%. This is not a Siemens 3RU replacement or an installed setting. <strong>Selected t6x:</strong> ${esc(setting == null ? 'none feasible' : `${displayNumber(setting, 1)} s`)} (${item.candidateT6xSettingS == null ? 'smallest tolerance-aware feasible setting' : 'explicit candidate'}); <strong>feasible settings:</strong> ${esc(feasible.length ? feasible.map(value => displayNumber(value, 1)).join(', ') + ' s' : 'none')}.</p><table class="synthesis-table"><tbody><tr><th>Reference start current basis</th><td>${esc(displayNumber(source.referenceStartCurrentA, 2))} A · ${esc(source.referenceStartCurrentReference || 'reference missing')}; maximum supplied-current envelope ${esc(displayNumber(item.maximumSuppliedCurrentA, 2))} A; maximum final-network timeline current ${esc(displayNumber(item.maximumObservedCurrentA, 2))} A. The reference current is a constant setting-screen basis, not the acceleration current trajectory.</td></tr><tr><th>Phase-current / CT scaling factor</th><td>${esc(displayNumber(source.currentScalingFactor, 4))}; unity is required to use this screen's assumed timing envelope. A nonunit factor blocks the setting recommendation.</td></tr><tr><th>Motor FLA / internal relay FLA</th><td>${esc(displayNumber(motors.get(String(item.motorId))?.nameplateCurrentA, 2))} A nameplate (supplied application reference: ${esc(source.reference || 'reference missing')}); ${esc(displayNumber(normalized.internalFlaA, 2))} A internal at ${esc(displayNumber(source.ambientTemperatureC, 1))} °C configured ambient.</td></tr><tr><th>Prior load</th><td>${esc(displayNumber(source.priorLoadCurrentA, 2))} A · ${esc(source.priorLoadReference || 'reference missing')} (${esc(displayNumber(normalized.priorLoadMultipleOfInternalFla, 3))} × internal FLA).</td></tr><tr><th>Timing envelope basis</th><td>${esc(calculation.timingBandBasis?.interpretation || 'Assumed bound not returned; no manufacturer tolerance is claimed.')}</td></tr><tr><th>Assumed hot operate envelope</th><td>${esc(displayNumber(selected.hotOperateTimeS, 2))} s nominal ± ${esc(displayNumber(selected.hotAccuracyS, 2))} s; required ${esc(displayNumber(requirements.hotOperateTimeS, 2))} s; coefficient ${esc(displayNumber(calculation.coefficients?.hotPerT6x, 4))} per t6x.</td></tr><tr><th>Assumed cold operate envelope</th><td>${esc(displayNumber(selected.coldOperateTimeS, 2))} s nominal ± ${esc(displayNumber(selected.coldAccuracyS, 2))} s; required ${esc(displayNumber(requirements.coldOperateTimeS, 2))} s; coefficient ${esc(displayNumber(calculation.coefficients?.coldPerT6x, 4))} per t6x.</td></tr><tr><th>Setting feasibility</th><td>Nominal feasible ${selected.nominalFeasible === true ? 'yes' : selected.nominalFeasible === false ? 'no' : 'not selected'}; assumed-envelope feasible ${selected.toleranceAwareFeasible === true ? 'yes' : selected.toleranceAwareFeasible === false ? 'no' : 'not selected'}; nominal range ${esc(displayNumber(range.nominalMinimumT6xS, 1))}–${esc(displayNumber(range.nominalMaximumT6xS, 1))} s.</td></tr><tr><th>Relay / calculation reference</th><td>${esc(validation.relayReference || 'ABB REM610 ANSI reference not returned')} · ${esc(source.reference || 'user reference missing')}</td></tr></tbody></table>${caseIssues ? `<h5>Case issues</h5><ul>${caseIssues}</ul>` : ''}${evidenceDetails("Setting calculation evidence", () => ({ inputs: source, case: item }))}</article>`;
  }).join('');
  return `<section id="synthesis-motor-thermal-review"><h3>ABB REM610 DOL thermal-setting alternative</h3><p>This uses the referenced REM610 ANSI equations with the final calculated acceleration time and an explicitly supplied constant reference start current. It does not integrate the acceleration current timeline or model accumulated thermal history/cooling between starts. It is a relay-specific setting screen, not a generic thermal model, Siemens 3RU replacement, installed setting, protection approval, or motor Apply path. The manual's accuracy applies only when phase-current scaling is 1; this screen blocks nonunit factors. Its timing envelope max(5% of predicted time, 5% of t6x, 1 s) is an explicit conservative assumption, not a guaranteed ABB tolerance.</p><table class="synthesis-table"><tbody><tr><th>Screen status</th><td>${esc(validation.status || 'blocked')}</td></tr><tr><th>Method</th><td>${esc(validation.method || 'not returned')}</td></tr><tr><th>Model input fingerprint</th><td>${esc(validation.modelInputFingerprint || 'not returned')}</td></tr><tr><th>Coverage</th><td>${esc(validation.coverage ? JSON.stringify(validation.coverage) : 'not returned')}</td></tr><tr><th>Selected-setting policy</th><td>Use the smallest available t6x setting that passes the assumed timing-envelope, start-count, and safe-stall checks unless an explicit candidate is supplied.</td></tr></tbody></table>${issues ? `<h4>Blocking screen issues</h4><ul>${issues}</ul>` : ''}${rows || '<p>No motor thermal-setting cases returned.</p>'}<h4>Limitations</h4><ul>${(validation.limitations || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul></section>`;
}
function motorStartupSupervisionReview(proposal) {
  const cases = (proposal?.motorThermalValidation?.cases || []).filter(item => item.startupSupervision?.status !== 'not-requested' && item.startupSupervision);
  if (!cases.length) return '';
  const rows = cases.map(item => {
    const evidence = item.startupSupervision;
    const input = evidence.inputs || {};
    return `<tr><td>${esc(item.motorId)}</td><td>${esc(evidence.status)}</td><td>${esc(displayNumber(evidence.accelerationTimeS, 3))}</td><td>${esc(displayNumber(evidence.accelerationExposureA2S, 2))}</td><td>${esc(displayNumber(evidence.pickupPrimaryA, 2))}</td><td>${esc(displayNumber(input.settingTimeS, 2))}</td><td>${esc(displayNumber(evidence.referenceExposureA2S, 2))}</td><td>${esc(displayNumber(evidence.nominalExposurePercent, 2))}</td><td>${esc(input.reference || 'not supplied')}</td></tr>`;
  }).join('');
  return `<section id="synthesis-motor-startup-supervision-review"><h3>ABB REM610 start-up exposure comparison</h3><p>Nominal, conditional comparison only. The start condition is assumed active for the simulated acceleration and speed-switch blocking is assumed absent. This is not a trip prediction, device tolerance, approved setting, or motor protection determination.</p><div class="synthesis-table-wrap"><table class="synthesis-table"><thead><tr><th>Motor</th><th>Status</th><th>Acceleration (s)</th><th>Model exposure (A²s)</th><th>Pickup (A)</th><th>Setting time (s)</th><th>Reference (A²s)</th><th>Nominal exposure (%)</th><th>Setting reference</th></tr></thead><tbody>${rows}</tbody></table></div><p>The values use a supplied primary-equivalent relay FLA and modeled current history. CT configuration, actual start detection, relay timing accuracy, contactor clearing and motor withstand remain unverified.</p></section>`;
}
function thermalAssessmentRows(proposal) {
  return (proposal?.cables || []).map(circuit => {
    const assessment = circuit.thermalAssessment;
    if (!assessment) return '';
    const limiting = assessment.segments?.find(segment => segment.segmentId === assessment.limitingSegmentId) || {};
    return `<tr><td>${esc(circuit.id || circuit.tag || 'circuit')}</td><td>${esc(assessment.limitingSegmentId || '—')}</td><td>${esc(displayNumber(limiting.ambientTempC))}</td><td>${esc(displayNumber(limiting.bundledConductors, 0))}</td><td>${esc(displayNumber(limiting.solidCoverContinuousLengthFt))}</td><td>${esc(displayNumber(assessment.adjustmentFactor, 4))}</td><td>${esc(displayNumber(assessment.limitingAmpacityA, 2))}</td><td>${esc(assessment.status || 'unevaluated')}</td></tr>`;
  }).join('');
}
function alternateEndpointText(decision) {
  const review = decision?.alternateEndpointAttachments;
  if (!review) return '';
  const rejected = review.endpointRejectedPairs ? `; ${review.endpointRejectedPairs} pair(s) failed endpoint installation` : '';
  const bounded = review.method === 'explicit-alternate-attachments-v2' ? `; ${review.prunedPairs || 0} pair(s) skipped by route-length bound; ${review.disconnectedPairs || 0} pair(s) disconnected` : '';
  if (review.status !== 'selected') return `No alternative found in ${review.attemptedPairs} bounded trial(s)${rejected}${bounded}${review.truncated ? '; anchor list truncated' : ''}.`;
  return `Alternative field connections: ${review.nearestSourceNode} → ${review.sourceNode} (${displayNumber(review.sourceAttachmentFt, 3)} ft), ${review.nearestDestinationNode} → ${review.destinationNode} (${displayNumber(review.destinationAttachmentFt, 3)} ft); nearest-node result ${review.nearestFailure || 'unavailable'}${review.nearestEndpointIssueCodes?.length ? ` (${review.nearestEndpointIssueCodes.join(', ')})` : ''}; ${review.attemptedPairs} trial(s)${rejected}${bounded}${review.truncated ? '; anchor list truncated' : ''}. Field permission and obstacles require review.`;
}
function endpointInstallationRetryText(decision) {
  const retry = decision?.endpointInstallationRetry;
  return retry?.status === 'selected' ? `Endpoint conduit screening chose ${retry.selectedConductorSize} after rejecting ${retry.originalConductorSize} (${(retry.originalIssueCodes || []).join(', ') || 'installation incomplete'}); ${retry.rejectedCandidateCount} conductor/path candidate(s) rejected.` : '';
}
function routingDecisionRows(proposal) {
  return (proposal?.cables || []).map(cable => {
    const decision = cable.routingDecision;
    if (!decision) return '';
    const reason = decision.shortestRejectedReason || decision.reason || decision.status || 'shortest route retained';
    const details = [alternateEndpointText(decision), endpointInstallationRetryText(decision)].filter(Boolean).map(value => `<small>${esc(value)}</small>`).join('');
    return `<tr><td>${esc(cable.id || cable.tag || 'circuit')}</td><td>${esc((decision.selectedPath || []).join(', ') || '—')}</td><td>${esc(displayNumber(decision.selectedLengthFt ?? cable.lengthFt, 3))}</td><td>${esc(cable.conductorSize || cable.conductor_size || decision.selectedConductorSize || '—')}</td><td>${esc(reason)}${details}</td><td>${esc(decision.searchedCandidateCount ?? 0)}</td></tr>`;
  }).join('');
}
function endpointInstallationRows(proposal) {
  return (proposal?.installationCoverage || []).flatMap(item => (item.segments || []).filter(segment => segment.coverage === 'dedicated-emt').map(segment => `<tr><td>${esc(item.cableId || 'circuit')}</td><td>${esc(segment.segmentId || 'segment')}</td><td>${esc(segment.conduitType || 'EMT')}</td><td>${esc(segment.conduitId || '—')}</td><td>${esc(segment.tradeSize || '—')}</td><td>${esc(displayNumber(segment.fillPercent))}</td><td>${esc(segment.installationStatus || item.status || 'unevaluated')}</td></tr>`)).join('');
}
function download(filename, content, type) {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
}
let savedFaultEvolutionRefreshTimer = null;
function renderSavedCurveSourceEvidence() {
  const container = document.getElementById('synthesis-saved-curve-source-container');
  if (!container) return;
  const evidence = getItem('designSynthesisDeviceEvidence', {}) || {};
  const rows = []; const invalid = [];
  const voltageMatches = (device, voltage) => device?.evaluatedVoltageVac == null
    || (Number.isFinite(Number(voltage)) && Number(voltage) > 0 && Number(voltage) === Number(device.evaluatedVoltageVac));
  for (const cable of getCables() || []) {
    if (cable?.protectiveDeviceEvidenceRef == null) continue;
    const device = resolveDesignSynthesisDeviceEvidence(cable, evidence);
    if (device && voltageMatches(device, cable.operating_voltage)) rows.push({ id: cable.id || cable.tag || 'circuit', operating_voltage: cable.operating_voltage, protectiveDevice: device });
    else invalid.push(cable.id || cable.tag || 'circuit');
  }
  for (const transformer of getEquipment() || []) {
    if (transformer?.type !== 'transformer') continue;
    for (const [side, field] of [['primary', 'primaryProtectiveDevice'], ['secondary', 'secondaryMainDevice']]) {
      if (transformer[`${field}EvidenceRef`] == null) continue;
      const label = `${transformer.id || transformer.tag || 'transformer'} ${side}`;
      const device = resolveDesignSynthesisTransformerDeviceEvidence(transformer, side, evidence);
      const voltage = side === 'primary' ? transformer.primaryVoltageVac : transformer.secondaryVoltageVac;
      if (device && voltageMatches(device, voltage)) rows.push({ id: label, operating_voltage: voltage, protectiveDevice: device });
      else invalid.push(label);
    }
  }
  if (!rows.length && !invalid.length) { container.innerHTML = ''; return; }
  const review = curveSourceReview({ cables: rows }).replace('id="synthesis-curve-source-review"', 'id="synthesis-saved-curve-source-review"')
    .replace('<h3>Selected breaker curve-source review</h3>', '<h3>Saved selected breaker curve-source review</h3>');
  const issues = invalid.length ? `<p role="status">Saved device evidence is missing or changed for: ${esc(invalid.join(', '))}. Regenerate and review the affected selections.</p>` : '';
  const savedDevice = getItem(DEVICE_FAULT_VALIDATION_KEY, null);
  const savedFault = getItem(FAULT_STUDY_VALIDATION_KEY, null);
  let savedResearch = '';
  if (savedDevice?.curveResearchDatasetFingerprint) {
    let resolved = null;
    try { resolved = resolveDesignSynthesisDeviceFaultValidation(savedDevice, savedFault, evidence); } catch { /* Report unavailable evidence below. */ }
    const readings = (resolved?.placements || []).filter(item => item.comparisons?.constantCurrentCurveResearch);
    const readingRows = readings.map(item => {
      const curve = item.comparisons.constantCurrentCurveResearch;
      return `<tr><th scope="row">${esc(item.id)}</th><td>${esc(item.device?.catalogNumber || 'device unavailable')}</td><td>${esc(curve.status)}</td><td>${curve.plotUpperTimeSeconds == null ? 'Not available' : `${esc(displayNumber(curve.plotUpperTimeSeconds, 6))} s`}</td></tr>`;
    }).join('');
    savedResearch = `<section id="synthesis-saved-constant-current-research"><h3>Saved constant-current chart research</h3><p>Readings use saved initial RMS currents as hypothetical constant currents. This saved study has not been revalidated against the current project; it does not establish actual clearing, coordination, or protection approval.</p>${resolved ? `<div style="overflow:auto"><table class="synthesis-table"><thead><tr><th>Saved placement</th><th>Device</th><th>Research status</th><th>Graphical upper time</th></tr></thead><tbody>${readingRows || '<tr><td colspan="4">No eligible saved chart readings.</td></tr>'}</tbody></table></div>` : '<p role="status">Saved chart research is unavailable because required fault or device evidence is missing or changed.</p>'}</section>`;
  }
  container.innerHTML = `<section class="card" aria-label="Saved breaker source evidence">${review}${issues}${savedResearch}</section>`;
}
function refreshSavedFaultEvolutionEvidence() {
  window.clearTimeout(savedFaultEvolutionRefreshTimer);
  savedFaultEvolutionRefreshTimer = window.setTimeout(() => { renderSavedFaultEvolutionEvidenceCurrent(); renderSavedCurveSourceEvidence(); }, 100);
}
function invalidateSavedFaultEvolutionEvidence() {
  const container = document.getElementById('synthesis-saved-fault-evolution-container');
  if (container?.querySelector('[data-saved-fault-evolution-summary]')) container.innerHTML = renderSavedFaultEvolutionEvidence({ status: 'stale' });
  const curveContainer = document.getElementById('synthesis-saved-curve-source-container');
  if (curveContainer?.hasChildNodes()) curveContainer.textContent = 'Refreshing saved breaker source evidence…';
  refreshSavedFaultEvolutionEvidence();
}
function resolveSavedFaultEvolutionEvidence() {
  const saved = getItem(FAULT_EVOLUTION_VALIDATION_KEY, null);
  if (!saved) return null;
  try {
    const context = getDesignSynthesisFaultEvolutionContext();
    return context ? resolveDesignSynthesisFaultEvolutionValidation(saved, context, { canonicalCables: getCables(), cableCatalogSource: getItem(CABLE_CATALOG_SOURCE_KEY, null), faultStudyValidation: getItem(FAULT_STUDY_VALIDATION_KEY, null) }) : null;
  } catch { return null; }
}
function renderSavedFaultEvolutionEvidenceCurrent() {
  const container = document.getElementById('synthesis-saved-fault-evolution-container');
  if (!container) return;
  const saved = getItem(FAULT_EVOLUTION_VALIDATION_KEY, null);
  const resolved = saved ? resolveSavedFaultEvolutionEvidence() : null;
  const current = resolved?.faultEvolutionValidation?.status === 'evaluated' && resolved?.faultEvolution;
  if (!saved) {
    container.innerHTML = renderSavedFaultEvolutionEvidence({ status: 'missing' });
    return;
  }
  if (!current) {
    container.innerHTML = renderSavedFaultEvolutionEvidence({ status: 'stale' });
    return;
  }
  const payload = { faultStudy: resolved.faultStudy, faultEvolution: resolved.faultEvolution, faultEvolutionValidation: resolved.faultEvolutionValidation,
    ...(resolved.cableFaultWithstand ? { cableFaultWithstand: resolved.cableFaultWithstand, cableFaultWithstandValidation: resolved.cableFaultWithstandValidation, cableFaultWithstandRevision: resolved.cableFaultWithstandRevision } : {}) };
  const getReviewMarkup = (currentPayload, textReport = false) => {
    if (textReport) return ['Saved source-history evidence', 'Supplied fault source-profile history:', ...faultEvolutionReport(currentPayload), ...(currentPayload.cableFaultWithstandValidation ? ['', 'Conditional cable fault thermal screen:', ...cableFaultWithstandReport(currentPayload)] : []), '', 'Complete JSON payload:', JSON.stringify(currentPayload, null, 2)].join('\n');
    return faultEvolutionReview(currentPayload).replace('id="synthesis-fault-evolution-review"', 'id="synthesis-saved-fault-evolution-review"') + cableFaultWithstandReview(currentPayload).replace('id="synthesis-cable-fault-withstand-review"', 'id="synthesis-saved-cable-fault-withstand-review"');
  };
  container.innerHTML = renderSavedFaultEvolutionEvidence({ status: 'current', faultCaseCount: payload.faultEvolutionValidation.faultCases?.length || 0, deviceHistoryCount: payload.faultEvolutionValidation.deviceHistories?.length || 0 });
  bindSavedFaultEvolutionDownloads(container, { getPayload: resolveSavedFaultEvolutionEvidence, getReviewMarkup, download });
}
function faultStudyReport(proposal) {
  const validation = proposal?.faultStudyValidation;
  if (!validation && !proposal?.faultStudy) return [];
  const inventory = validation?.sourceInventory || proposal.faultStudy?.sourceInventory || {};
  const lines = [
    `- Status: ${validation?.status || 'not evaluated'}; method ${validation?.method || 'not returned'}; scope ${validation?.scope || 'initial-symmetrical-rms-only'}.`,
    `- Model input fingerprint: ${validation?.modelInputFingerprint || 'not returned'}.`,
    `- Source inventory: ${inventory.status || 'unknown'}; ${inventory.reference || 'reference not supplied'}; not independently verified.`,
    `- Modeled source coverage: ${validation?.coverage ? JSON.stringify(validation.coverage) : 'not returned'}.`,
    ...(faultStudySources(proposal).map(source => `- Input source ${source?.equipmentId || 'unknown'}; in service ${source?.inService === true ? 'yes' : source?.inService === false ? 'no' : 'not stated'}; reference ${source?.reference || 'missing'}.`)),
  ];
  for (const item of validation?.cases || []) {
    const result = item.result || item;
    const busId = item.busId || item.faultBusId || result.fault?.busId || 'unknown';
    lines.push(`- Fault at ${busId}: ${result.status || 'blocked'}; initial symmetrical RMS ${displayNumber(result.fault?.faultCurrentRmsKA, 6)} kA.`);
    for (const row of result.sourceFaultContributions || []) lines.push(`  - Fault-current contribution from ${row.sourceId}: ${displayNumber(row.currentKA?.magnitude, 6)} kA; ${displayNumber(row.currentKA?.re, 6)} + j${displayNumber(row.currentKA?.im, 6)} kA. This is a superposition contribution, not source-terminal current.`);
    for (const row of result.sourceTerminalCurrents || []) lines.push(`  - Actual source-terminal current ${row.sourceId}: ${displayNumber(row.currentKA?.magnitude, 6)} kA; ${displayNumber(row.currentKA?.re, 6)} + j${displayNumber(row.currentKA?.im, 6)} kA.`);
    for (const entry of result.issues || []) lines.push(`  - Case issue ${entry.code || 'issue'} (${entry.path || 'input'}): ${entry.message || 'validation failed'}.`);
  }
  for (const entry of validation?.issues || []) lines.push(`- Validation issue ${entry.code || 'issue'} (${entry.path || 'input'}): ${entry.message || 'validation failed'}.`);
  const limitations = validation?.limitations || (validation?.cases || []).flatMap(item => (item.result || item).limitations || []);
  for (const limitation of [...new Set(limitations)]) lines.push(`- Limitation: ${limitation}`);
  lines.push('- Initial RMS fault values do not establish minimum/maximum, peak/interrupting, thermal, clearing-time, coordination, or complete motor-protection results.');
  return lines;
}
function distributionPartitionReport(proposal) {
  const result = proposal?.distributionPartitionValidation;
  if (!result || result.status === 'not-requested') return [];
  const lines = [
    `- Status ${result.status || 'not returned'}; algorithm ${result.algorithm || 'not returned'}; stopping reason ${result.stoppingReason || 'not returned'}.`,
    `- Panel counts: ${displayNumber(result.initialPanelCount, 0)} initial, ${displayNumber(result.finalPanelCount, 0)} final; ${displayNumber(result.trialCount, 0)} feasibility trials; ${displayNumber(result.splitCount, 0)} actual bisection splits.`,
    `- Unchanged supplied criteria: maximum panel load ${displayNumber(result.criteria?.maxPanelLoadKva, 2)} kVA; maximum loads per panel ${displayNumber(result.criteria?.maxLoadsPerPanel, 0)}.`,
  ];
  for (const decision of Array.isArray(result.decisions) ? result.decisions : []) {
    if (!decision || typeof decision !== 'object') continue;
    const childGroups = (Array.isArray(decision.childLoadIds) ? decision.childLoadIds : []).map(ids => Array.isArray(ids) ? ids.join(', ') : String(ids ?? '')).filter(Boolean);
    lines.push(`- Split ${decision.sourcePanelId || 'panel'} (${decision.reason || 'not returned'}): original members ${(Array.isArray(decision.sourceLoadIds) ? decision.sourceLoadIds : []).join(', ') || 'not returned'}; resulting groups ${childGroups.join(' | ') || 'not returned'}; feeder floor ${displayNumber(decision.requiredDesignAmpacityA, 2)} A; trial conductor ${decision.selectedConductorSize || 'not returned'} at ${displayNumber(decision.selectedAmpacityA, 2)} A.`);
  }
  for (const group of Array.isArray(result.groups) ? result.groups : []) {
    if (!group || typeof group !== 'object') continue;
    const feeder = (Array.isArray(proposal.cables) ? proposal.cables : []).find(cable => String(cable?.id) === String(group.feederId));
    const device = feeder?.protectiveDevice;
    const deviceLabel = device ? `${device.manufacturer || device.vendor || ''} ${device.catalogNumber || device.catalog_number || device.id || 'device'}`.trim() : 'no selected candidate';
    lines.push(`- Final group ${group.panelId || 'panel'}; members ${(Array.isArray(group.loadIds) ? group.loadIds : []).join(', ') || 'none'}; feeder ${group.feederId || 'not returned'}; feeder design-current floor ${displayNumber(group.designAmpacityA, 2)} A; conductor ${group.conductorSize || 'not selected'}; final feeder ampacity ${displayNumber(group.ampacityA, 2)} A; sizing ${group.sizingStatus || 'not returned'}; protective-device outcome ${group.protectiveDeviceStatus || 'not returned'} (${deviceLabel}).`);
  }
  for (const limitation of Array.isArray(result.limitations) ? result.limitations : []) if (limitation !== null && limitation !== undefined) lines.push(`- Limitation: ${limitation}`);
  lines.push('- Panel regrouping is a deterministic bounded feeder-feasibility search; it does not relax supplied load/count criteria, add parallel conductors, establish complete protection, or approve selected devices.');
  return lines;
}
function faultEvolutionReport(proposal) {
  const validation = proposal?.faultEvolutionValidation;
  if (!validation || validation.status === 'not-requested') return [];
  const input = proposal?.faultEvolution || {};
  const lines = [
    `- Status: ${validation.status || 'not evaluated'}; method ${validation.method || 'not returned'}; scope ${validation.scope || 'not returned'}.`,
    `- Input fingerprint: ${validation.modelInputFingerprint || 'not returned'}; evidence ${validation.evidenceStatus || 'supplied-unverified'}; protection adequacy ${validation.protectionAdequacy || 'unevaluated'}.`,
    `- Common horizon ${displayNumber(input.horizonS, 5)} s; evaluated time knots ${(Array.isArray(validation.timeKnotsS) ? validation.timeKnotsS : []).map(value => displayNumber(value, 5)).join(', ') || 'not returned'}.`,
    `- Coverage: ${JSON.stringify(validation.coverage || {})}.`,
  ];
  for (const profile of Array.isArray(input.profiles) ? input.profiles : []) {
    if (!profile || typeof profile !== 'object') continue;
    lines.push(`- Source profile ${profile.equipmentId || 'unknown'}: ${profile.source?.evidenceClass || 'unverified'} evidence; ${profile.source?.reference || 'source reference missing'}; ${displayNumber(profile.conditions?.ambientTemperatureC, 2)} °C, ${displayNumber(profile.conditions?.frequencyHz, 2)} Hz, ${displayNumber(profile.conditions?.phases, 0)} phases, voltage ${JSON.stringify(profile.conditions?.voltageRangeV || [])} V (${profile.conditions?.reference || 'condition reference missing'}).`);
    const points = Array.isArray(profile.points) ? profile.points : [];
    for (const point of points) if (point && typeof point === 'object') lines.push(`  - ${displayNumber(point.timeS, 6)} s: real EMF multiplier ${displayNumber(point.emfMultiplier, 8)}.`);
  }
  for (const faultCase of Array.isArray(validation.faultCases) ? validation.faultCases : []) {
    if (!faultCase || typeof faultCase !== 'object') continue;
    lines.push(`- Fault case ${faultCase.caseId || 'unknown'}: ${faultCase.caseKind || 'not returned'} at ${faultCase.faultBusId || 'bus not returned'}; placement ${faultCase.placementId || 'not placement-specific'}.`);
    for (const row of Array.isArray(faultCase.timeRows) ? faultCase.timeRows : []) {
      if (!row || typeof row !== 'object') continue;
      const multipliers = (Array.isArray(row.sourceMultipliers) ? row.sourceMultipliers : []).filter(item => item && typeof item === 'object').map(item => `${item.equipmentId || 'source'}=${displayNumber(item.multiplier, 8)}×`).join(', ') || 'not returned';
      lines.push(`  - ${displayNumber(row.timeS, 6)} s; source multipliers ${multipliers}; fault current ${displayNumber(row.faultCurrentRmsKA, 6)} kA RMS.`);
      for (const device of Array.isArray(row.deviceCurrents) ? row.deviceCurrents : []) {
        if (!device || typeof device !== 'object') continue;
        lines.push(`    - ${device.placementId || 'device'} through-device current ${displayNumber(device.throughDeviceCurrentKA?.re, 7)} + j${displayNumber(device.throughDeviceCurrentKA?.im, 7)} kA; ${displayNumber(device.throughDeviceCurrentRmsKA, 7)} kA RMS.`);
      }
    }
  }
  for (const history of Array.isArray(validation.deviceHistories) ? validation.deviceHistories : []) {
    if (!history || typeof history !== 'object') continue;
    const rows = Array.isArray(history.timeRows) ? history.timeRows.filter(row => row && typeof row === 'object') : [];
    const values = rows.map(row => row.currentRmsKA).filter(value => typeof value === 'number' && Number.isFinite(value));
    const extrema = history.currentExtrema;
    const rangeText = extrema
      ? `interval minimum ${displayNumber(extrema.minimumRmsKA, 7)} kA RMS at ${displayNumber(extrema.minimumTimeS, 6)} s; interval maximum ${displayNumber(extrema.maximumRmsKA, 7)} kA RMS at ${displayNumber(extrema.maximumTimeS, 6)} s`
      : `sampled-knot minimum ${displayNumber(values.length ? Math.min(...values) : null, 7)} kA RMS; sampled-knot maximum ${displayNumber(values.length ? Math.max(...values) : null, 7)} kA RMS`;
    lines.push(`- Device history ${history.placementId || 'device'} / ${history.caseId || 'case'}: ${history.caseKind || 'not returned'} at ${history.faultBusId || 'bus unknown'}; coverage ${history.coverageStatus || 'not returned'}; initial ${displayNumber(rows[0]?.currentRmsKA, 7)} kA RMS; ${rangeText}; final ${displayNumber(rows.at(-1)?.currentRmsKA, 7)} kA RMS; current-squared exposure ${displayNumber(history.currentSquaredExposureA2S, 5)} A²·s.`);
    for (const row of rows) lines.push(`  - ${displayNumber(row.timeS, 6)} s: ${displayNumber(row.currentKA?.re, 7)} + j${displayNumber(row.currentKA?.im, 7)} kA; ${displayNumber(row.currentRmsKA, 7)} kA RMS.`);
    for (const interval of Array.isArray(history.exposureIntervals) ? history.exposureIntervals : []) {
      if (interval && typeof interval === 'object') lines.push(`  - Exposure interval ${displayNumber(interval.startTimeS, 6)}–${displayNumber(interval.endTimeS, 6)} s: ${displayNumber(interval.startCurrentRmsA, 4)}–${displayNumber(interval.endCurrentRmsA, 4)} A; ${displayNumber(interval.exposureA2S, 5)} A²·s.`);
    }
  }
  for (const entry of Array.isArray(validation.issues) ? validation.issues : []) lines.push(`- Validation issue ${entry.code || 'issue'} (${entry.path || 'faultEvolution'}): ${entry.message || 'blocked'}.`);
  for (const limitation of Array.isArray(validation.limitations) ? validation.limitations : []) lines.push(`- Limitation: ${limitation}`);
  lines.push('- This quasi-steady RMS phasor history is not a motor decay waveform, dynamic transient, protective-clearing, conductor damage, thermal, SCCR, or protection-adequacy determination.');
  lines.push(`- Complete fault-evolution input: ${JSON.stringify(input)}`);
  lines.push(`- Complete fault-evolution validation: ${JSON.stringify(validation)}`);
  return lines;
}

function cableFaultWithstandReport(proposal) {
  const validation = proposal?.cableFaultWithstandValidation;
  if (!validation) return [];
  const revision = proposal?.cableFaultWithstandRevision;
  const lines = [
    `- Status ${validation.status}; conditional comparison ${validation.comparison || 'not evaluated'}; method ${validation.method}.`,
    `- Coefficient source ${validation.source?.coefficientSource?.revision || 'not returned'} p. ${validation.source?.coefficientSource?.page || '—'}, Fc ${validation.source?.coefficientSource?.coefficientA ?? '—'}, SHA-256 ${validation.source?.coefficientSource?.sha256 || 'not returned'} (${validation.source?.coefficientSource?.sourceUrl || 'source URL unavailable'}).`,
    `- Nominal conductor area ${validation.source?.conductorAreaSource?.revision || 'not returned'}, SHA-256 ${validation.source?.conductorAreaSource?.sha256 || 'not returned'}; bare-area conversion only. Separate duration basis ${validation.source?.durationBasis?.sourceUrl || 'not returned'} supports up to ${validation.source?.durationBasis?.maximumDurationS ?? '—'} s; 0.1 s is the app lower restriction.`,
    `- Coverage: ${validation.coverage?.scope || 'generated-bus-fault-cases-only'}; ${validation.coverage?.evaluatedComparisonCount || 0} comparisons across ${validation.coverage?.selectedCableCount || 0} selected cables and ${validation.coverage?.generatedBusFaultCaseCount || 0} generated bus faults; ${validation.coverage?.excludedImmediateLoadSideCaseCount || 0} immediate-load-side cases excluded.`,
    `- Worst utilization: ${validation.worstCase ? `${validation.worstCase.cableId} / ${cableFaultLocation(validation.worstCase)}: ${displayNumber(validation.worstCase.exposureToAllowanceRatio, 6)}× (${validation.worstCase.comparison})` : 'not available'}.`,
    `- Qualification status ${validation.qualificationStatus || 'unevaluated'}; protection adequacy ${validation.protectionAdequacy || 'unevaluated'}.`,
    validation.spanValidation ? `- Continuous coverage: every one of ${validation.coverage.generatedCableSpanCount} generated cable spans against all ${validation.coverage.selectedCableCount} selected conductors; ${validation.coverage.evaluatedSpanTargetPairCount} complete span-target pairs. Endpoint limits and all stationary roots are checked; overlapping candidate locations remain explicit.` : '- Legacy scope: generated bus faults only; cable near-terminal and interior faults are excluded.',
    ...(validation.spanValidation?.limitations || []).map(line => `- ${line}`),
    '- The maximum total-clearing claim and applicability statement are supplied and unverified; actual device clearing and let-through are not calculated.',
    '- The adiabatic comparison assumes one event beginning at or below 90 °C after adequate recovery, with 250 °C final temperature. It does not imply repeated-event or overall cable qualification.',
  ];
  for (const row of validation.cases || []) lines.push(`- ${row.cableId} stock ${row.cableStockId}, ${row.conductorSize}, ${cableFaultLocation(row)}, ${row.maximumTotalClearingTimeS} s: FROM ${row.fromCurrentSquaredExposureA2S} A²s; TO ${row.toCurrentSquaredExposureA2S} A²s; controlling ${row.controllingTerminal} ${row.currentSquaredExposureA2S}/${row.allowableCurrentSquaredExposureA2S} A²s (${row.exposureToAllowanceRatio}×), ${row.comparison}.`);
  if (revision) {
    lines.push(`- Automatic conductor trials: ${revision.status}; absolute load-flow revision budget ${revision.revisionBudget?.used ?? 0}/${revision.revisionBudget?.maximum ?? 0} used, ${revision.revisionBudget?.remaining ?? 0} remaining; stop reason ${revision.stopReason || 'not supplied'}.`);
    lines.push(`- Original design criteria used for these trials: ${JSON.stringify(revision.finalBinding?.designCriteria ?? null)}.`);
    for (const [index, row] of (revision.history || []).entries()) {
      const conductorChanges = (row.conductorChanges || []).map(change => `${change.cableId} ${change.fromSize || 'new'} -> ${change.toSize || 'removed'}`).join(', ') || 'none';
      const routePath = state => state ? (state.segments || []).map(segment => segment.tray || segment.conduit || segment.raceway || segment.type).filter(Boolean).join(' -> ') || state.status || 'no route' : 'none';
      const routeChanges = (row.routeChanges || []).map(change => `${change.id} ${routePath(change.before)} -> ${routePath(change.after)}`).join(', ') || 'none';
      const racewayState = state => state ? [state.conduitType, state.tradeSize, state.cableIds?.length ? `cables ${state.cableIds.join('+')}` : null,
        Number.isFinite(state.fillPercent) ? `fill ${state.fillPercent}%` : null,
        Number.isFinite(state.utilizationPercent) ? `utilization ${state.utilizationPercent}%` : null,
        Number.isFinite(state.used?.smallCableAreaIn2) ? `area ${state.used.smallCableAreaIn2}/${state.allowable?.smallCableAreaIn2} in²` : null,
        Number.isFinite(state.cableCount) ? `${state.cableCount} cables` : null,
        state.conductorOdsIn?.length ? `OD ${state.conductorOdsIn.map(od => `${od.cableId} ${od.outsideDiameterIn} in`).join('+')}` : null,
        state.status].filter(Boolean).join(' / ') || 'present' : 'none';
      const racewayChanges = (row.racewayChanges || []).map(change => `${change.id} ${racewayState(change.before)} -> ${racewayState(change.after)}`).join(', ') || 'none';
      const protectionState = state => state ? [state.method, state.device?.catalogNumber, state.requirementA === null || state.requirementA === undefined ? null : `${state.requirementA} A`].filter(Boolean).join(' / ') || 'present' : 'none';
      const protectionChanges = (row.protectionChanges || []).map(change => `${change.id} ${protectionState(change.before)} -> ${protectionState(change.after)}`).join(', ') || 'none';
      const previousWorst = revision.history[index - 1]?.worstCase?.exposureToAllowanceRatio;
      const worstTransition = `${previousWorst === undefined ? 'initial' : `${previousWorst}x`} -> ${row.worstCase ? `${row.worstCase.exposureToAllowanceRatio}x at ${row.worstCase.cableId}/${cableFaultLocation(row.worstCase)}` : 'not evaluated'}`;
      lines.push(`- Revision ${row.revision} (${row.kind}): thermal ${row.thermalStatus}/${row.thermalComparison}; worst utilization ${worstTransition}; conductor changes ${conductorChanges}; routes ${routeChanges}; raceways ${racewayChanges}; protection ${protectionChanges}; reason ${row.reason || '—'}.`);
      for (const nested of row.nestedRevisions || []) lines.push(`  - ${nested.stage} revision ${nested.revision}: ${nested.status}; ${nested.reason || nested.stopReason || 'no stop reason'}.`);
    }
  }
  for (const row of validation.issues || []) lines.push(`- Blocking issue ${row.code} (${row.path}): ${row.message}`);
  return lines;
}
function faultScenarioReport(proposal) {
  const validation = proposal?.faultScenarioValidation;
  if (!validation && !proposal?.faultScenarios) return [];
  const value = item => item ? `${displayNumber(item.valueKA, 6)} kA; scenario ${item.scenarioId || 'unknown'}${item.faultBusId ? `; fault at ${item.faultBusId}` : ''}${item.caseKind ? `; ${item.caseKind}` : ''}` : 'not returned';
  return [
    `- Status: ${validation?.status || 'not evaluated'}; method ${validation?.method || 'not returned'}; scope ${validation?.scope || 'initial-symmetrical-rms-only'}.`,
    `- Model input fingerprint: ${validation?.modelInputFingerprint || 'not returned'}.`,
    `- Coverage: ${validation?.coverage ? JSON.stringify(validation.coverage) : 'not returned'}. Observed envelopes cover supplied scenarios only; verified true minima/maxima: no.`,
    ...(validation?.scenarios || []).flatMap(item => {
      const sourceReferences = (proposal?.faultScenarios || []).find(scenario => scenario.id === item.id)?.study?.sources || [];
      return [
        `- Scenario ${item.id || 'unknown'}: ${item.status || 'not evaluated'}; reference ${item.reference || 'missing'}; fault network ${item.faultStudyValidation?.status || 'not evaluated'}; device current ${item.deviceFaultValidation?.status || 'not evaluated'}.`,
        ...sourceReferences.map(source => `  - Source ${source.equipmentId || 'unknown'} reference: ${source.reference || 'missing'}; in service ${source.inService === true ? 'yes' : source.inService === false ? 'no' : 'not stated'}.`),
        ...(item.faultStudyValidation?.issues || []).map(issue => `  - Fault-network issue ${issue.code || 'issue'} (${issue.path || 'input'}): ${issue.message || 'validation failed'}.`),
        ...(item.deviceFaultValidation?.issues || []).map(issue => `  - Device-current issue ${issue.code || 'issue'} (${issue.path || 'input'}): ${issue.message || 'validation failed'}.`),
      ];
    }),
    ...(validation?.busEnvelopes || []).flatMap(item => [`- Bus ${item.busId || 'unknown'} observed minimum: ${value(item.minimum)}.`, `- Bus ${item.busId || 'unknown'} observed maximum: ${value(item.maximum)}.`]),
    ...(validation?.deviceEnvelopes || []).flatMap(item => [`- Proposed device ${item.placementId || 'unknown'} line-terminal observed minimum: ${value(item.lineTerminalAvailableInitialRms?.minimum)}.`, `- Proposed device ${item.placementId || 'unknown'} line-terminal observed maximum: ${value(item.lineTerminalAvailableInitialRms?.maximum)}.`, `- Proposed device ${item.placementId || 'unknown'} highest observed per-scenario maximum through-device current: ${value(item.maximumThroughDeviceInitialRms?.maximum)}; protection ${item.protectionStatus || 'not evaluated'}.`]),
    ...(validation?.issues || []).map(item => `- Blocking scenario issue ${item.code || 'issue'} (${item.path || 'input'}): ${item.message || 'validation failed'}.`),
    ...(validation?.limitations || []).map(item => `- Limitation: ${item}`),
    '- These supplied-case envelopes do not establish true fault minima or maxima, protection adequacy, interrupting/peak duty, thermal duty, protective clearing, coordination, or code compliance.',
  ];
}
function deviceFaultReport(proposal) {
  const validation = proposal?.deviceFaultValidation;
  if (!validation) return [];
  const lines = [
    `- Status: ${validation.status || 'blocked'}; method ${validation.method || 'not returned'}; scope ${validation.scope || 'initial-symmetrical-rms-only'}.`,
    `- Combined model (network + device) fingerprint: ${validation.modelInputFingerprint || 'not returned'}.`,
    `- Network-only input fingerprint: ${validation.networkModelInputFingerprint || 'not returned'}.`,
    `- Device input fingerprint: ${validation.deviceInputFingerprint || 'not returned'}.`,
    `- Fault-bus coverage: ${validation.coverage ? `${validation.coverage.status || 'unknown'}; ${JSON.stringify(validation.coverage)}` : 'not returned'}.`,
    `- Source inventory: ${validation.sourceInventory?.status || 'unknown'}; ${validation.sourceInventory?.verificationStatus || 'not verified'}.`,
    '- Proposed source-end locations are derived from generated branches and are not installed facts.',
    '- Line-terminal available initial RMS is reported separately from the signed phasor current through each proposed device.',
    '- Standalone interrupting ratings are distinct from conditional combination ratings or assembly SCCR; protection adequacy remains unevaluated.',
  ];
  for (const placement of Array.isArray(validation.placements) ? validation.placements : []) {
    const device = placement?.device || {};
    const rating = device.standaloneInterruptingRating || {};
    const comparisons = placement?.comparisons || {};
    const line = comparisons.lineTerminalAvailableInitialRms || {};
    const through = comparisons.maximumThroughDeviceInitialRms || {};
    const phasorText = value => value && Number.isFinite(value.re) && Number.isFinite(value.im)
      ? `${displayNumber(value.re, 6)} ${value.im < 0 ? '−' : '+'} j${displayNumber(Math.abs(value.im), 6)} kA`
      : 'phasor unavailable';
    lines.push(`- Placement ${placement.id || 'unknown'} (${placement.status || 'blocked'}): ${device.manufacturer || ''} ${device.catalogNumber || device.id || 'device unavailable'}; proposed location ${placement.proposedLocation?.description || 'not returned'}; bus ${placement.proposedLocation?.physicalFromBus?.tag || placement.proposedLocation?.fromBusId || 'not stated'}; not an installed fact.`);
    lines.push(`  - Line-terminal available initial RMS: ${line.status || 'not compared'}; ${displayNumber(line.valueKA, 6)} kA; phasor ${phasorText(line.phasorKA)}; case ${line.caseBusId || 'not stated'}.`);
    lines.push(`  - Maximum actual current through device: ${through.status || 'not compared'}; ${displayNumber(through.valueKA, 6)} kA; phasor ${phasorText(through.phasorKA)}; fault at ${through.faultBusId || 'not stated'}; ${through.caseKind || 'case not stated'}.`);
    const curve = comparisons.constantCurrentCurveResearch;
    if (curve) lines.push(`  - Constant-current chart research: ${curve.status}; ${curve.plotUpperTimeSeconds == null ? 'no plotted time returned' : `${displayNumber(curve.plotUpperTimeSeconds, 6)} s graphical upper reading at ${displayNumber(curve.currentA, 2)} A`}; hypothetical constant current, not actual clearing or protection approval; ${curve.source?.document || 'source unavailable'} figure ${curve.source?.figure ?? 'not stated'}${curve.source?.url ? `; ${curve.source.url}` : ''}; ${curve.conditions || 'source conditions unavailable'}.`);
    lines.push(`  - Standalone interrupting rating: ${rating.currentKA == null ? 'unavailable' : `${displayNumber(rating.currentKA, 3)} kA at ${displayNumber(rating.voltageVac, 0)} V`}; applicable at location voltage ${rating.applicableAtLocationVoltage === true ? 'yes' : 'no'}; provenance ${rating.provenanceStatus || 'unknown'}.`);
    const combination = comparisons.citedMotorCombinationInitialRms;
    if (combination) lines.push(`  - Cited motor combination initial-RMS comparison: ${combination.status}; ${combination.valueKA == null ? 'no value compared' : `${displayNumber(combination.valueKA, 3)} kA modeled at line terminal against ${displayNumber(combination.ratingKA, 3)} kA at ${combination.ratingVoltageV} V`}; ${combination.reason}`);
    lines.push(`  - Conditional combination rating / assembly SCCR: ${device.conditionalCombinationRating ? `unevaluated; ${JSON.stringify(device.conditionalCombinationRating.metadata || {})}` : 'not supplied and not inferred'}; protection adequacy ${comparisons.protectionAdequacy || 'unevaluated'}.`);
    const sourceDocs = Array.isArray(rating.sourceDocuments) ? rating.sourceDocuments : [];
    for (const source of sourceDocs) {
      const sourceId = typeof source === 'string' ? source : source?.id;
      lines.push(`  - Rating source: ${source?.title || source?.name || source?.url || sourceId || 'source record'}${source?.url ? `; ${source.url}` : ''}${source?.revision ? `; ${source.revision}` : ''}.`);
    }
    if (sourceDocs.length === 0 && Array.isArray(rating.sourceIds) && rating.sourceIds.length) lines.push(`  - Rating source IDs: ${rating.sourceIds.join(', ')}.`);
    const fieldSources = Array.isArray(rating.fieldSources) ? rating.fieldSources : Array.isArray(rating.ratingFieldSources) ? rating.ratingFieldSources : [];
    for (const field of fieldSources) {
      const sourceIds = Array.isArray(field.sourceIds) ? field.sourceIds : typeof field.sourceId === 'string' ? [field.sourceId] : [];
      lines.push(`  - Rating field provenance: ${field.pointer || 'field not stated'}; source IDs ${sourceIds.join(', ') || 'not stated'}.`);
    }
  }
  for (const entry of Array.isArray(validation.issues) ? validation.issues : []) lines.push(`- Screen issue ${entry.code || 'issue'} (${entry.path || 'input'}): ${entry.message || 'validation failed'}.`);
  for (const limitation of Array.isArray(validation.limitations) ? validation.limitations : []) lines.push(`- Limitation: ${limitation}`);
  lines.push('- Initial symmetrical RMS comparisons do not establish minimum/maximum fault duty, peak or interrupting duty, thermal withstand, clearing, coordination, or complete protection.');
  return lines;
}
function motorAccelerationReport(proposal) {
  const validation = proposal.motorAccelerationValidation;
  if (!validation || validation.status === 'not-requested') return [];
  const motors = new Map((proposal.loads || []).filter(load => load.motor).map(load => [String(load.id), load]));
  const sharedRevisionBudget = Number.isInteger(proposal.inputs?.criteria?.loadFlow?.maxRevisions) ? proposal.inputs.criteria.loadFlow.maxRevisions : 12;
  const lines = [
    `- Status: ${validation.status}; method ${validation.method || 'not returned'}; model input fingerprint ${validation.modelInputFingerprint || 'not returned'}.`,
    `- Maximum acceleration time criterion: ${validation.criteria?.maximumTimeS == null ? 'not supplied; no duration pass is claimed' : `${displayNumber(validation.criteria.maximumTimeS, 4)} s`}.`,
    `- Automatic revision: ${validation.revision?.status || 'not returned'}; shared criteria.loadFlow.maxRevisions budget ${displayNumber(sharedRevisionBudget, 0)}; stop reason ${validation.revision?.stopReason || 'none'}. The supplied criteria remain unchanged across trials.`,
  ];
  for (const row of validation.revision?.history || []) {
    const cases = (row.accelerationCases || []).map(item => `${item.motorId || 'motor'} ${item.status || 'unknown'} at ${displayNumber(item.timeS, 5)} s; criterion ${item.criterionStatus || 'not evaluated'}; torque ${item.torqueStatus || 'not returned'}${item.failure ? `; failure ${item.failure}` : ''}`).join('; ') || 'no acceleration case record';
    const changed = (row.changedCircuits || []).map(item => `${item.id || 'circuit'}=${item.size || 'unchanged'}`).join(', ') || 'none';
    lines.push(`- Revision ${displayNumber(row.revision, 0)}: ${row.status || 'unknown'}; operating ${row.operatingStatus || 'not evaluated'}; starting ${row.startingStatus || 'not evaluated'}; ${cases}; changed circuits ${changed}; transformer ${row.transformerProfileId || 'none'}; ${row.reason || 'reason not returned'}.`);
  }
  for (const item of validation.cases || []) {
    const input = motors.get(String(item.motorId))?.motor?.acceleration || {};
    lines.push(`- Motor ${item.motorId}: ${item.status}; time ${displayNumber(item.timeS, 5)} s; criterion ${item.criterionStatus || 'not evaluated'}; electrical I²t exposure ${displayNumber(item.electricalExposureA2S, 4)} A²·s (exposure only, not thermal withstand).`);
    if (item.failure) lines.push(`  Acceleration stopped: ${item.failure} at ${displayNumber(item.failedAtSpeedRpm, 2)} rpm.`);
    lines.push(`  References: model ${input.reference || 'not supplied'}; motor inertia ${input.motorInertiaReference || 'not supplied'}; load inertia ${input.loadInertiaReference || 'not supplied'}; performance curve ${input.performanceCurve?.reference || 'not supplied'}; load torque curve ${input.loadTorqueCurve?.reference || 'not supplied'}.`);
    for (const row of item.timeline || []) lines.push(`  - ${displayNumber(row.speedRpm, 0)} rpm at ${displayNumber(row.timeS, 5)} s: terminal ${displayNumber(row.terminalVoltagePu, 5)} pu; current ${displayNumber(row.currentA, 3)} A; motor/load/net torque ${displayNumber(row.motorTorqueNm, 3)}/${displayNumber(row.loadTorqueNm, 3)}/${displayNumber(row.netTorqueNm, 3)} N·m.`);
    for (const entry of item.issues || []) lines.push(`  - ${entry.code || 'issue'} (${entry.path || item.motorId}): ${entry.message || 'evaluation failed'}`);
  }
  for (const entry of validation.issues || []) lines.push(`- ${entry.code || 'issue'} (${entry.path || 'motorAcceleration'}): ${entry.message || 'evaluation failed'}`);
  lines.push(...(validation.limitations || []).map(item => `- Limitation: ${item}`));
  return lines;
}
function motorThermalReport(proposal) {
  const validation = proposal.motorThermalValidation;
  if (!validation || validation.status === 'not-requested') return [];
  const inputEquipment = proposal.inputs?.original?.equipment || proposal.equipment || proposal.loads || [];
  const inputs = new Map(inputEquipment.map(item => [String(item.id), item.motor?.rem610Thermal || {}]));
  const motors = new Map((proposal.loads || proposal.equipment || inputEquipment).map(item => [String(item.id), item.motor || {}]));
  const lines = [
    `- Status: ${validation.status}; method ${validation.method || 'not returned'}; input fingerprint ${validation.modelInputFingerprint || 'not returned'}; coverage ${JSON.stringify(validation.coverage || {})}.`,
    `- Relay family and basis: ${validation.relayReference || 'ABB REM610 ANSI reference not returned'}; fixed DOL; p = 50%; setting-screen alternative only, not a Siemens 3RU replacement or motor Apply path.`,
    '- The setting screen uses an explicit constant reference-current basis and final calculated acceleration time; it does not integrate the acceleration current trajectory or model thermal history/cooling between starts.',
  ];
  for (const item of validation.cases || []) {
    const source = inputs.get(String(item.motorId)) || {};
    const calculation = item.calculations || {};
    const selected = calculation.candidate || {};
    const range = calculation.feasibleRange || {};
    const normalized = calculation.normalized || {};
    const requirements = calculation.requirements || {};
    const setting = item.candidateT6xSettingS ?? item.recommendedT6xSettingS;
    lines.push(`- Motor ${item.motorId}: ${item.status}; final acceleration ${displayNumber(item.startupTimeS, 5)} s; reference start current ${displayNumber(source.referenceStartCurrentA, 2)} A (${source.referenceStartCurrentReference || 'reference missing'}); phase-current scaling factor ${displayNumber(source.currentScalingFactor, 4)} (unity required); supplied-current maximum ${displayNumber(item.maximumSuppliedCurrentA, 2)} A; final-network timeline maximum ${displayNumber(item.maximumObservedCurrentA, 2)} A. Reference current is a constant setting-screen basis, not the current trajectory.`);
    lines.push(`  Safe-stall limit ${displayNumber(requirements.motorSafeStallTimeS ?? source.motorSafeStallTimeS, 3)} s (${source.motorSafeStallReference || 'reference missing'}); ambient ${displayNumber(source.ambientTemperatureC, 1)} °C; nameplate ${displayNumber(motors.get(String(item.motorId))?.nameplateCurrentA, 2)} A; internal relay FLA ${displayNumber(normalized.internalFlaA, 2)} A; prior load ${displayNumber(source.priorLoadCurrentA, 2)} A (${source.priorLoadReference || 'reference missing'}).`);
    lines.push(`  Hot/cold required operation ${displayNumber(requirements.hotOperateTimeS, 2)}/${displayNumber(requirements.coldOperateTimeS, 2)} s; ${item.candidateT6xSettingS == null ? 'automatic recommendation' : 'explicit candidate'} t6x ${setting == null ? 'none feasible' : `${displayNumber(setting, 1)} s`}; smallest assumed-envelope feasible choices ${range.toleranceAwareCandidatesS?.length ? range.toleranceAwareCandidatesS.map(value => displayNumber(value, 1)).join(', ') + ' s' : 'none'}; candidate ${item.candidateStatus || 'not returned'}.`);
    if (calculation.timingBandBasis) lines.push(`  Timing envelope basis: ${calculation.timingBandBasis.interpretation}`);
    if (selected.t6xSettingS !== undefined) lines.push(`  Nominal hot/cold operation ${displayNumber(selected.hotOperateTimeS, 2)}/${displayNumber(selected.coldOperateTimeS, 2)} s with assumed timing envelopes ±${displayNumber(selected.hotAccuracyS, 2)}/±${displayNumber(selected.coldAccuracyS, 2)} s; this bound is not an ABB-guaranteed tolerance; assumed-envelope feasibility ${selected.toleranceAwareFeasible === true ? 'pass' : 'fail'}.`);
    for (const entry of item.issues || []) lines.push(`  Issue ${entry.code || 'issue'} (${entry.path || item.motorId}): ${entry.message || 'evaluation failed'}`);
  }
  for (const entry of validation.issues || []) lines.push(`- Issue ${entry.code || 'issue'} (${entry.path || 'motorThermal'}): ${entry.message || 'evaluation failed'}`);
  lines.push(...(validation.limitations || []).map(item => `- Limitation: ${item}`));
  const startupLines = motorStartupSupervisionReport(proposal);
  if (startupLines.length) lines.push('ABB REM610 start-up exposure comparison:', ...startupLines);
  return lines;
}
function motorStartupSupervisionReport(proposal) {
  const cases = (proposal?.motorThermalValidation?.cases || []).filter(item => item.startupSupervision?.status !== 'not-requested' && item.startupSupervision);
  if (!cases.length) return [];
  const lines = ['- Nominal exposure comparison only; not a trip prediction, tolerance band, approved setting, or motor protection determination.'];
  for (const item of cases) {
    const evidence = item.startupSupervision;
    const input = evidence.inputs || {};
    lines.push(`- Motor ${item.motorId}: ${evidence.status}; modeled acceleration ${displayNumber(evidence.accelerationTimeS, 3)} s and exposure ${displayNumber(evidence.accelerationExposureA2S, 2)} A²s; pickup ${displayNumber(evidence.pickupPrimaryA, 2)} A; setting ${displayNumber(input.settingTimeS, 2)} s; reference ${displayNumber(evidence.referenceExposureA2S, 2)} A²s; nominal exposure ${displayNumber(evidence.nominalExposurePercent, 2)}%; configuration ${input.reference || 'not supplied'}; relay FLA basis ${input.relayFlaReference || 'not supplied'}.`);
    lines.push(...(evidence.limitations || []).map(item => `  Limitation: ${item}`));
  }
  return lines;
}
function motorProtectionTimingReport(proposal) {
  const validation = proposal?.motorProtectionTimingValidation;
  if (!validation || validation.status === 'not-requested') return [];
  if (String(validation.method || '').includes('stall-current-range') || (validation.cases || []).some(item => item?.schemaVersion === '2.0.0')) {
    const lines = [
      'Motor protection timing comparison (per-motor schema; bounded supplied evidence; evidence supplied-unverified):',
      `- Status: ${validation.status || 'not evaluated'}; complete protection: ${validation.completeProtectionStatus || 'blocked'}.`,
    ];
    const timingByMotorId = new Map((proposal.inputs?.original?.equipment || proposal.equipment || []).filter(item => item?.motor).map(item => [String(item.id), item.motor.protectionTiming || {}]));
    for (const item of Array.isArray(validation.cases) ? validation.cases.filter(row => row && typeof row === 'object') : []) {
      const timingInput = timingByMotorId.get(String(item.motorId)) || {};
      if ((item.schemaVersion || timingInput.schemaVersion) !== '2.0.0') {
        lines.push(...motorProtectionTimingReferenceReportCase(item));
        continue;
      }
      const range = item.stallCurrentRangeA || {};
      const network = item.networkLockedRotorCurrentA || {};
      const stall = item.comparisons?.selectedStateSafeStall || {};
      const startup = item.comparisons?.startupRideThrough || {};
      lines.push(`- ${item.motorId || 'motor'}: ${item.status || 'blocked'}; selected state ${item.initialState || 'unknown'} at ${displayNumber(item.ambientTemperatureC, 1)} °C, ${displayNumber(item.frequencyHz, 0)} Hz/${displayNumber(item.phases, 0)} phases; stall-current range ${displayNumber(range.minimumA, 3)}–${displayNumber(range.maximumA, 3)} A (${range.reference || 'reference missing'}); motor withstand source ${item.motorWithstand?.source?.evidenceClass || 'unverified'}: ${item.motorWithstand?.source?.reference || 'reference missing'}; startup ${startup.status || 'not evaluated'} margin ${displayNumber(startup.marginS, 5)} s; supplied stall-current range clearing vs selected-state withstand ${stall.status || 'not evaluated'}, limiting ${displayNumber(stall.limitingCurrentA, 3)} A, margin ${displayNumber(stall.marginS, 5)} s (${stall.responsibleDevice || 'device not identified'}); fresh canonical network locked-rotor current ${displayNumber(network.valueA, 3)} A at ${displayNumber(network.terminalVoltagePu, 5)} pu (${network.status || 'not returned'}; ${network.basis || 'basis not returned'}); evidence ${item.evidenceStatus || 'supplied-unverified'}.`);
      for (const device of Array.isArray(item.devices) ? item.devices.filter(row => row && typeof row === 'object') : []) {
        const comparison = device.stallRangeComparison || {};
        const suppliedDevice = (Array.isArray(timingInput.devices) ? timingInput.devices : []).find(candidate => candidate?.role === device.role && candidate?.catalogNumber === device.catalogNumber) || {};
        const conditions = device.conditions || suppliedDevice.conditions || {};
        lines.push(`  - ${device.role || 'device'} ${device.catalogNumber || 'part not supplied'}; setting ${JSON.stringify(device.setting || {})}; conditions ${conditions.initialState || 'state unknown'}, ${displayNumber(conditions.ambientTemperatureC, 1)} °C, ${displayNumber(conditions.frequencyHz, 0)} Hz/${displayNumber(conditions.phases, 0)} phases, voltage bounds ${JSON.stringify(conditions.voltageRangeV || [])} V (${conditions.reference || 'reference missing'}); range result ${comparison.status || device.status || 'blocked'} over ${displayNumber(comparison.currentRangeA?.minimumA ?? range.minimumA, 3)}–${displayNumber(comparison.currentRangeA?.maximumA ?? range.maximumA, 3)} A; limiting current ${displayNumber(comparison.limitingCurrentA, 3)} A; minimum margin ${displayNumber(comparison.minimumMarginS, 5)} s; source ${device.source?.evidenceClass || 'unverified'}: ${device.source?.reference || 'reference missing'}.`);
        for (const point of Array.isArray(comparison.points) ? comparison.points : []) lines.push(`    - ${displayNumber(point.currentA, 3)} A: minimum trip ${displayNumber(point.minimumTripS, 5)} s; maximum total circuit clearing ${displayNumber(point.maximumTotalCircuitClearingS, 5)} s; selected-state minimum safe-stall bound ${displayNumber(point.minimumSafeStallTimeS, 5)} s; margin ${displayNumber(point.marginS, 5)} s; ${point.status || 'not evaluated'}.`);
      }
      for (const entry of Array.isArray(item.issues) ? item.issues : []) lines.push(`  - ${entry.code || 'issue'} (${entry.path || item.motorId}): ${entry.message || 'evaluation blocked'}`);
      for (const limitation of Array.isArray(item.limitations) ? item.limitations : []) lines.push(`  - V2 limitation: ${limitation}`);
    }
    for (const entry of Array.isArray(validation.issues) ? validation.issues : []) lines.push(`- Validation issue ${entry.code || 'issue'} (${entry.path || 'motorProtectionTiming'}): ${entry.message || 'blocked'}`);
    lines.push('- This supplied constant-stall current interval is not a motor current trajectory and does not establish actual clearing, thermal memory, device qualification, coordination, or complete protection.');
    for (const limitation of Array.isArray(validation.limitations) ? validation.limitations.filter(item => !String(item).startsWith('Reference-current envelope comparison only')) : []) lines.push(`- Limitation: ${limitation}`);
    lines.push(`- Complete validation evidence: ${JSON.stringify(validation)}`);
    return lines;
  }
  const lines = [
    'Motor protection timing comparison (bounded reference-current screen; supplied values unverified):',
    `- Status: ${validation.status || 'not evaluated'}; complete protection: ${validation.completeProtectionStatus || 'blocked'}.`,
  ];
  const cases = Array.isArray(validation.cases) ? validation.cases.filter(item => item && typeof item === 'object') : [];
  for (const item of cases) {
    const startup = item.comparisonDetails?.startupRideThrough || item.comparisons?.startupRideThrough || {};
    const stall = item.comparisonDetails?.selectedStateSafeStall || item.comparisons?.selectedStateSafeStall || {};
    const startupStatus = typeof startup === 'string' ? startup : startup.status || 'not evaluated';
    const stallStatus = typeof stall === 'string' ? stall : stall.status || 'not evaluated';
    lines.push(`- ${item.motorId || 'motor'}: ${item.status || 'blocked'}; selected state ${item.initialState || 'unknown'}; reference current ${displayNumber(item.referenceStartCurrentA, 3)} A; acceleration ${displayNumber(item.accelerationTimeS, 5)} s + margin ${displayNumber(item.startMarginS, 5)} s = ${displayNumber(item.startupDurationS, 5)} s; startup ${startupStatus} (${displayNumber(startup.marginS, 5)} s margin); Reference-current clearing vs selected-state withstand at ${displayNumber(stall.currentA ?? item.referenceStartCurrentA, 3)} A: ${stallStatus} (${displayNumber(stall.marginS, 5)} s margin); earliest clearing upper bound ${displayNumber(item.earliestMaximumTotalCircuitClearingS, 5)} s by ${item.responsibleEarliestClearingDevice || 'unknown'}; opposite state ${item.otherInitialState?.status || 'not evaluated'}.`);
    const devices = Array.isArray(item.devices) ? item.devices.filter(device => device && typeof device === 'object') : [];
    for (const device of devices) {
      lines.push(`  - ${device.role || 'device'} ${device.catalogNumber || 'part not supplied'}; setting ${JSON.stringify(device.setting || {})}; minimum trip ${displayNumber(device.minimumTripS ?? device.minimumTripTimeS, 5)} s; maximum total clearing ${displayNumber(device.maximumTotalCircuitClearingS ?? device.maximumTotalCircuitClearingTimeS, 5)} s; startup margin ${displayNumber(device.startupRideThroughMarginS, 5)} s; selected-state withstand margin ${displayNumber(device.selectedStateWithstandMarginS ?? device.safeStallMarginS, 5)} s; ${device.source?.evidenceClass || 'unverified'} source: ${device.source?.reference || 'reference missing'}.`);
    }
    for (const entry of Array.isArray(item.issues) ? item.issues : []) lines.push(`  - ${entry.code || 'issue'} (${entry.path || item.motorId}): ${entry.message || 'evaluation blocked'}`);
  }
  for (const entry of Array.isArray(validation.issues) ? validation.issues : []) lines.push(`- Validation issue ${entry.code || 'issue'} (${entry.path || 'motorProtectionTiming'}): ${entry.message || 'blocked'}`);
  lines.push('- The clearing/withstand comparison is only at the stated reference current; it does not bound longer clearing at lower stall/fault currents or prove actual motor stall protection.');
  lines.push('- This comparison does not integrate dynamic device response, qualify devices, establish coordination approval, or complete motor protection.');
  for (const limitation of Array.isArray(validation.limitations) ? validation.limitations : []) lines.push(`- Limitation: ${limitation}`);
  lines.push(`- Complete validation evidence: ${JSON.stringify(validation)}`);
  return lines;
}
function motorProtectionTimingReferenceReportCase(item) {
  const startup = item.comparisonDetails?.startupRideThrough || item.comparisons?.startupRideThrough || {};
  const stall = item.comparisonDetails?.selectedStateSafeStall || item.comparisons?.selectedStateSafeStall || {};
  const startupStatus = typeof startup === 'string' ? startup : startup.status || 'not evaluated';
  const stallStatus = typeof stall === 'string' ? stall : stall.status || 'not evaluated';
  const lines = [`- ${item.motorId || 'motor'} (V1 reference-current screen): ${item.status || 'blocked'}; selected state ${item.initialState || 'unknown'}; reference current ${displayNumber(item.referenceStartCurrentA, 3)} A; acceleration ${displayNumber(item.accelerationTimeS, 5)} s + margin ${displayNumber(item.startMarginS, 5)} s = ${displayNumber(item.startupDurationS, 5)} s; startup ${startupStatus} (${displayNumber(startup.marginS, 5)} s margin); Reference-current clearing vs selected-state withstand at ${displayNumber(stall.currentA ?? item.referenceStartCurrentA, 3)} A: ${stallStatus} (${displayNumber(stall.marginS, 5)} s margin); earliest clearing upper bound ${displayNumber(item.earliestMaximumTotalCircuitClearingS, 5)} s by ${item.responsibleEarliestClearingDevice || 'unknown'}; opposite state ${item.otherInitialState?.status || 'not evaluated'}.`];
  for (const device of Array.isArray(item.devices) ? item.devices.filter(row => row && typeof row === 'object') : []) lines.push(`  - ${device.role || 'device'} ${device.catalogNumber || 'part not supplied'}; setting ${JSON.stringify(device.setting || {})}; minimum trip ${displayNumber(device.minimumTripS ?? device.minimumTripTimeS, 5)} s; maximum total clearing ${displayNumber(device.maximumTotalCircuitClearingS ?? device.maximumTotalCircuitClearingTimeS, 5)} s; startup margin ${displayNumber(device.startupRideThroughMarginS, 5)} s; selected-state withstand margin ${displayNumber(device.selectedStateWithstandMarginS ?? device.safeStallMarginS, 5)} s; ${device.source?.evidenceClass || 'unverified'} source: ${device.source?.reference || 'reference missing'}.`);
  for (const entry of Array.isArray(item.issues) ? item.issues : []) lines.push(`  - ${entry.code || 'issue'} (${entry.path || item.motorId}): ${entry.message || 'evaluation blocked'}`);
  lines.push('- This V1 clearing comparison is at the stated reference current only; it does not bound longer clearing at lower stall/fault currents or prove actual motor stall protection.');
  return lines;
}
function reportText(proposal) {
  const cableRows = (proposal.cables || []).map(cable => { const selected = cable.protectiveDevice; const selectedLabel = selected ? `${selected.manufacturer || selected.vendor || ''} ${selected.catalogNumber || selected.catalog_number || selected.id || ''}`.trim() : 'requirement only'; const stock = cable.cableStockId ? `; stock ${cable.cableStockId} · ${cable.source || cable.impedanceBasis || 'source not stated'} · ${cable.catalogFingerprint || cable.cableCatalogFingerprint || 'catalog fingerprint missing'}` : ''; return `- ${cable.id || cable.loadId || cable.to || 'cable'}${cable.transformerSide ? ` (${cable.transformerSide} transformer side)` : ''}: ${cable.conductorSize || cable.conductor_size || 'unselected'}${stock}; ${displayNumber(cable.operating_voltage ?? cable.voltage, 0)} V; current ${displayNumber(cable.currentA ?? cable.current, 2)} A; VD ${displayNumber(cable.voltageDropPct ?? cable.voltage_drop_pct, 3)}%; protective requirement ${displayNumber(cable.protectiveRequirement?.ampereRatingA ?? cable.protective_requirement?.ampereRatingA, 0)} A; selected candidate ${selectedLabel} (${selected ? `${displayNumber(selected.evaluatedVoltageVac ?? selected.ratedVoltageVac, 0)} V; ${displayNumber(selected.interruptingRatingKA, 2)} kA at ${displayNumber(selected.interruptingRatingVoltageVac, 0)} V; ` : ''}${candidateProvenance(selected)})`; }).join('\n');
  const panelRows = (proposal.panels || []).map(panel => { const requirement = panel.protectiveRequirement || {}; return `- ${panel.id || panel.tag || 'panel'}: ${displayNumber(panel.loadKva)} kVA; loads ${(panel.loadIds || panel.load_ids || []).join(', ') || '—'}; main ${displayNumber(requirement.mainRatingA, 0)} A; bus ${displayNumber(requirement.busRatingA, 0)} A (${requirement.status || 'screening'})`; }).join('\n');
  const routeList = Array.isArray(proposal.routeResults) ? proposal.routeResults : (proposal.routeResults?.batchResults || []);
  const routesFromCables = (proposal.cables || []).map(cable => ({ id: cable.tag || cable.id || cable.loadId, ...(cable.routeResult || {}) }));
  const routeRows = (routeList.length ? routeList : routesFromCables).slice(0, 100).map(route => `- ${route.id || route.to || 'route'}: ${route.status || '—'}; ${displayNumber(route.lengthFt ?? route.length_ft ?? route.total_length, 2)} ft; corridors ${(route.edgeIds || route.edge_ids || route.route_segments?.map(segment => segment.tray_id || segment.edgeId).filter(Boolean) || []).join(', ') || '—'}`).join('\n');
  const evaluations = proposal.racewayEvaluations || proposal.racewayEvaluation?.evaluations || proposal.racewayEvaluation || [];
  const evaluationList = Array.isArray(evaluations) ? evaluations : [];
  const trayRows = (proposal.trays || []).map(tray => { const id = tray.id || tray.edgeId || tray.tray_id || 'tray'; const evaluation = evaluationList.find(item => String(item.racewayId || item.trayId || item.tray_id || item.id) === String(id)); const existing = tray.existingTrayScreen; return `- ${id}: ${evaluation?.status || tray.status || tray.capacityStatus || 'not evaluated'}; utilization ${displayNumber(evaluation?.utilizationPercent)}%; used ${displayCapacity(evaluation?.used)}; allowable ${displayCapacity(evaluation?.allowable)}; ${displayNumber(tray.inside_width ?? tray.widthIn ?? tray.width)} in x ${displayNumber(tray.depth ?? tray.depthIn ?? tray.tray_depth)} in; ${existing ? `existing tray ${existing.trayId}, ${existing.existingCableCount} existing cable(s), inventory ${existing.inventoryReference}; screening only, reuse not approved` : 'new tray assumption'}`; }).join('\n');
  const checks = Array.isArray(proposal.checks) ? proposal.checks : Object.entries(proposal.checks || {}).map(([name, value]) => ({ id: name, name, status: value ? 'pass' : 'fail' }));
  const issueText = issue => { const scope = [issue.cable, issue.path, issue.racewayId].filter(Boolean).join(' · '); const detail = issue.message || issue.detail || issue.code || (typeof issue === 'string' ? issue : JSON.stringify(issue)); return `${issue.severity || 'info'}: ${scope ? `${scope}: ` : ''}${detail}`; };
  const faultStudyScopeStatement = proposal.faultScenarioValidation?.status === 'evaluated'
    ? 'Explicit fault operating scenarios report observed initial symmetrical RMS envelopes over supplied cases only; they do not verify true minima/maxima or protection adequacy.'
    : proposal.faultStudyValidation?.status === 'evaluated'
    ? 'The optional explicit fault network reports only its modeled initial symmetrical RMS cases and any supplied transformer phase assumption; this does not establish motor protection or complete fault duty.'
    : 'Without an evaluated optional explicit fault network, motor fault contributions and transformer phase displacement remain unevaluated.';
  const panelLocationRows = (proposal.panelLocationOverrides || []).map(item => {
    const point = location => location ? `${displayNumber(location.x)} / ${displayNumber(location.y)} / ${displayNumber(location.z)} ft` : '—';
    return `- ${item.panelId || 'panel'}: ${item.status || '—'}; requested ${point(item.requestedLocation)}; automatic ${point(item.automaticLocation)}; effective ${point(item.effectiveLocation)}${item.note ? `; ${item.note}` : ''}`;
  });
  const thermalReportRows = (proposal.cables || []).flatMap(circuit => { const assessment = circuit.thermalAssessment; if (!assessment) return []; const limiting = assessment.segments?.find(segment => segment.segmentId === assessment.limitingSegmentId) || {}; const cover = limiting.solidCoverContinuousLengthFt === undefined || limiting.solidCoverContinuousLengthFt === null ? 'not specified' : `${displayNumber(limiting.solidCoverContinuousLengthFt)} ft`; return [`- ${circuit.id || circuit.tag || 'circuit'}; governing segment ${assessment.limitingSegmentId || '—'}; ambient ${displayNumber(limiting.ambientTempC)} °C; grouped conductors ${displayNumber(limiting.bundledConductors, 0)}; solid cover ${cover}; adjustment ${displayNumber(assessment.adjustmentFactor, 4)}; ampacity ${displayNumber(assessment.limitingAmpacityA, 2)} A; status ${assessment.status || 'unevaluated'}`]; }).join('\n');
  const endpointRows = (proposal?.installationCoverage || []).flatMap(item => (item.segments || []).filter(segment => segment.coverage === 'dedicated-emt').map(segment => `- ${item.cableId || 'circuit'} ${segment.segmentId || 'segment'}: ${segment.installationStatus || item.status || 'unevaluated'}; conduit type EMT; conduit ${segment.conduitId || '—'}; size ${segment.tradeSize || '—'}; fill ${displayNumber(segment.fillPercent)}%`)).join('\n');
  const routingRows = [...(proposal.routingRetry ? [`- Capacity routing recovered after ${proposal.routingRetry.attempts} bounded trial(s); prioritized loads: ${proposal.routingRetry.prioritizedLoadIds.join(', ') || 'none'}; no global optimality claimed.`, ...(proposal.routingRetry.prioritizedTransformerPrimaryId ? [`- Prioritized transformer primary: ${proposal.routingRetry.prioritizedTransformerPrimaryId}.`] : []), ...(proposal.routingRetry.prioritizedFeederPanelIds?.length ? [`- Prioritized panel feeders: ${proposal.routingRetry.prioritizedFeederPanelIds.join(', ')}.`] : []), ...(proposal.routingRetry.prioritizedPanelIds?.length ? [`- Panel reservation priority: ${proposal.routingRetry.prioritizedPanelIds.join(', ')}; panel identities and assigned loads are retained.`] : [])] : []), ...(proposal.cables || []).map(cable => {
    const decision = cable.routingDecision || {};
    const path = (decision.selectedPath || []).join(', ') || '—';
    const reason = decision.shortestRejectedReason || decision.reason || decision.status || 'shortest route retained';
    const details = [alternateEndpointText(decision), endpointInstallationRetryText(decision)].filter(Boolean).join(' ');
    return `- ${cable.id || cable.tag || cable.loadId || 'circuit'}: chosen path ${path}; length ${displayNumber(decision.selectedLengthFt ?? cable.lengthFt ?? cable.length, 3)} ft; conductor ${decision.selectedConductorSize || cable.conductor_size || cable.conductorSize || '—'}; shortest route result ${reason}; candidate searches ${decision.searchedCandidateCount ?? 0}${details ? `; ${details}` : ''}`;
  })].join('\n');
  const dispositionReport = (proposal.loadDispositions || []).map(row => { const reason = row.status === 'deferred' && (proposal.globalBlockingIssues || []).length ? `Deferred by global blocker: ${(proposal.globalBlockingIssues || []).map(item => item.message || item.code).join('; ')}` : (row.issues || []).map(item => item.message || item.code).join('; ') || (row.status === 'accepted' ? 'Generated load accepted' : row.status === 'rejected' ? 'Invalid equipment record' : 'Not generated; pending correction'); return `- input row ${Number(row.inputIndex) + 1}; id ${row.id || '—'}; tag ${row.tag || '—'}; status ${row.status || 'deferred'}; input kW ${row.original?.kw ?? '—'}; ${reason}`; }).join('\n');
  const motorDetails = (proposal.loads || []).filter(load => load.motor).map(load => {
    const result = proposal.motorStartingValidation?.cases?.find(item => item.motorId === String(load.id));
    const candidate = proposal.motorOverloadCandidates?.cases?.find(item => item.motorId === String(load.id))?.candidate;
    const sources = (candidate?.sourceDocuments || []).map(source => `${source.title || source.id}: ${source.url}`).join('; ');
    return `- ${load.id}: ${displayNumber(load.motor.ratedVoltageV, 0)} V motor; design FLC ${displayNumber(load.motor.fullLoadCurrentA, 2)} A (${load.motor.fullLoadCurrentBasis?.reference || 'basis missing'}); nameplate ${displayNumber(load.motor.nameplateCurrentA, 2)} A; locked rotor ${displayNumber(load.motor.lockedRotorCurrentA, 2)} A at PF ${displayNumber(load.motor.lockedRotorPowerFactor, 3)}; branch conductor design ${displayNumber(load.designAmpacityA, 2)} A; starting ${result?.status || 'not evaluated'}; minimum network voltage ${displayNumber(result?.minimumVoltagePu, 5)} pu; motor current ${displayNumber(result?.motorCurrentA, 2)} A; converged ${result?.converged === true}; overload relay: ${motorOverloadSummary(proposal, load.id)}; sources ${sources || 'none'}; unresolved ${candidate?.unresolved?.join('; ') || 'overload protection'}; overload and short-circuit/ground-fault coordination unresolved.`;
  }).join('\n');
  const starterCases = proposal.motorStarterCandidates?.cases || [];
  const motorStarterReport = starterCases.flatMap(item => {
    const result = item.result || item;
    const candidate = result.candidate;
    const checks = motorStarterNonpassChecks(result);
    const sources = (candidate?.sources || result.rejectedCandidate?.sources || []).map(source => `  - ${source.title || source.id}: ${source.url} (${source.publisher || 'publisher not stated'}, revision ${source.revision || 'not stated'}, accessed ${source.accessedOn || 'not stated'}; ${source.locators?.join('; ') || 'locator not stated'})`);
    return [
      `- Motor ${item.motorId || item.loadId || 'unknown'}: ${result.researchStatus || 'candidate'}; library ${result.libraryStatus || 'screening'}; protection ${result.protectionStatus || result.status || 'blocked'}; selectedForApply ${candidate?.selectedForApply === true ? 'yes' : candidate?.selectedForApply === false ? 'no' : 'not stated'}.`,
      `  ${motorStarterCandidateSummary(result)}`,
      `  Conditional rating note: ${motorStarterConditionalRatingNote(result)}`,
      `  Non-pass checks: ${checks.map(check => `${check.id} [${check.status}]: ${check.message}`).join(' | ') || 'none returned'}`,
      ...(result.rejectedCandidate ? [`  Rejected candidate: ${result.rejectedCandidate.id || 'no eligible exact breaker combination'}; ${checks.map(check => `${check.id} [${check.status}]`).join(', ') || 'see evidence'}`] : []),
      ...sources,
    ];
  }).join('\n');
  const motorReport = [sourceFaultRows(proposal).map(([label, value]) => `- ${label}: ${value}`).join('\n'), '- Complete local fault-duty and motor-contribution review: unevaluated.', motorDetails, starterCases.length ? '- The standalone overload-range relay candidate and the relay in the starter assembly are alternative proposals, not two installed relays.' : '', proposal.motorStarterCandidates?.method === 'siemens-dol-branch-breaker-research-v1' ? '- Motor branch-breaker research protection remains unresolved; the screening candidate does not establish overload, fault-duty, installation, or coordination approval.' : '', starterCases.length ? `Motor starter assembly research candidates (not approved or selected for Apply):\n${motorStarterReport}` : 'Motor starter assembly candidates: not returned.'].filter(Boolean).join('\n');
  const units = Object.entries(proposal.inputEvidence?.units || {}).map(([key, value]) => `${key}: ${value}`).join(', ');
  const evidence = [...(proposal.inputEvidence?.records?.supply ? [proposal.inputEvidence.records.supply] : []), ...(proposal.inputEvidence?.records?.equipment || [])].map(record => `- ${record.id || 'record'}: ${record.classification}; ${Object.entries(record.values || {}).map(([key, value]) => `${key}=${typeof value.value === 'object' && value.value !== null ? JSON.stringify(value.value) : value.value} (${value.basis}${value.source ? ` from ${value.source}` : ''})`).join(', ')}; references ${(record.sourceDocuments || record.references || []).length ? 'retained as provided' : 'none supplied'}`).join('\n');
  const criteriaReportRows = designCriteriaEntries(suppliedCriteria(proposal)).map(item => `- ${item.key}: ${item.value === null ? 'null' : item.value}${item.unit ? ` ${item.unit}` : ''}`);
  const transformer = proposal.transformer;
  const transformerReport = transformer ? [
    `- Selected: ${transformer.manufacturer || ''} ${transformer.catalogNumber || transformer.profileId || transformer.id || 'transformer'}; ${displayNumber(transformer.ratedKVA, 1)} kVA; required ${displayNumber(transformer.requiredKVA, 2)} kVA; ${displayNumber(transformer.loadingPercent, 1)}% loading.`,
    `- Primary: ${displayNumber(transformer.primaryVoltageVac, 0)} V ${transformer.primaryConnection || ''}; ${displayNumber(transformer.primaryRatedCurrentA, 2)} A rated; ${displayNumber(transformerDesignCurrent(transformer, 'primary'), 2)} A calculated at required kVA; bus ${transformer.primaryBusId || '—'}; OCP: ${protectiveDeviceSummary(transformer.primaryProtectiveDevice, transformer.primaryMaxOcpA)}.`,
    `- Secondary: ${displayNumber(transformer.secondaryVoltageVac, 0)} V ${transformer.secondaryConnection || ''}; ${displayNumber(transformer.secondaryRatedCurrentA, 2)} A rated; ${displayNumber(transformerDesignCurrent(transformer, 'secondary'), 2)} A calculated at required kVA; bus ${transformer.secondaryBusId || '—'}; main OCP: ${protectiveDeviceSummary(transformer.secondaryMainDevice, transformer.secondaryMaxOcpA)}.`,
    `- OCP placement: primary ${transformer.primaryProtectionLocation || 'not stated'}; secondary ${transformer.secondaryMainLocation || 'not stated'}.`,
    `- Secondary fault screening: ${displayNumber(transformer.secondaryFault?.availableFaultCurrentKA, 3)} kA from ${transformer.secondaryFault?.method || 'no method returned'}; basis is limited to ${(transformer.secondaryFault?.faultTypes || []).join(', ') || 'not stated'}; ground fault ${transformer.secondaryFault?.groundFaultStatus || transformer.groundFaultStatus || 'not evaluated'}; asymmetrical duty ${transformer.secondaryFault?.asymmetricalDutyStatus || transformer.asymmetricalInterruptingDutyStatus || 'not evaluated'}.`,
    `- Series model: ${transformer.seriesModel?.modelType || 'not stated'}; Z ${displayNumber(transformer.seriesModel?.zPercent, 3)}%; X/R ${displayNumber(transformer.seriesModel?.xr, 3)}; ${transformer.seriesModel?.limitation || 'model limitations not stated'}.`,
    `- Phase/magnetizing limitations: ${transformer.phaseModelAssumption?.transformerPhaseDisplacement || 'phase displacement basis not stated'}; phase angles reported ${transformer.phaseModelAssumption?.phaseAnglesReported === true ? 'yes' : 'no'}; magnetizing current is not represented unless explicitly shown in the model.`,
    `- Catalog provenance: ${candidateProvenance(transformer)}; selection reason: ${transformer.selectionReason || 'profile evaluated by the connected operating-study revision process'}`,
    ...((transformer.selectionCandidates || transformer.candidates || []).map(candidate => `- Transformer profile candidate ${candidate.profileId || candidate.catalogNumber || 'profile'}: ${displayNumber(candidate.ratedKVA, 1)} kVA; loading ${displayNumber(candidate.loadingPercent, 2)}%; approximate transformer-only drop ${displayNumber(candidate.approximateTransformerOnlyDropPct, 3)}%; eligible ${candidate.eligible === true ? 'yes' : candidate.eligible === false ? 'no' : 'not returned'}${candidate.reasons?.length ? `; ${candidate.reasons.join('; ')}` : ''}`)),
    ...((loadFlowStudy(proposal)?.history || []).filter(item => item?.transformerProfileId || item?.selectionCandidates).map(item => `- Study revision ${item.revision ?? '—'}: ${item.status || '—'}; profile ${item.transformerProfileId || 'unchanged'}; ${item.reason || 'profile evaluation returned'}`)),
  ] : [];
  const protectionTimingReport = motorProtectionTimingReport(proposal);
  const faultEvolutionLines = faultEvolutionReport(proposal);
  const cableFaultWithstandLines = cableFaultWithstandReport(proposal);
  const distributionPartitionLines = distributionPartitionReport(proposal);
  const adoption = proposal.projectEquipmentAdoption;
  const adoptionReport = Array.isArray(adoption?.pairs) && adoption.pairs.length ? [
    `Reviewed existing-project equipment mapping: ${adoption.projectId} · scenario ${adoption.scenario}; binding ${adoption.bindingFingerprint || 'missing'}.`,
    'Reviewed bases: electrical input kW, line-to-line voltage, and feet coordinates. The review binding is revalidated before Apply; it is not engineering approval.',
    ...adoption.pairs.map(pair => `- Equipment ${pair.equipmentId} (${pair.equipmentTag || 'no tag'}) ← load ${pair.loadId} (${pair.loadTag || 'no tag'}).`),
  ] : [];
  const trayAdoption = proposal.inputs?.original?.projectTrayAdoption;
  if (Array.isArray(trayAdoption?.selectedTrayIds)) adoptionReport.push(`Reviewed project tray mapping: ${trayAdoption.projectId} · scenario ${trayAdoption.scenario}; trays ${trayAdoption.selectedTrayIds.join(', ')}; inventory ${trayAdoption.inventoryReference}; binding ${trayAdoption.bindingFingerprint}. Thermal reference: ${trayAdoption.reuseEvidence?.thermalReference || 'not supplied'}; installation reference: ${trayAdoption.reuseEvidence?.installationReference || 'not supplied'}. References are user-supplied and not independently verified. ${proposal.status === 'proposal' ? 'Preliminary Apply is available subject to project conflict checks.' : 'Existing-tray Apply remains blocked.'}`);
  return [`Design Synthesis preliminary report`, `Status: ${proposal.status}`, `Source signature: ${state.engineSignature || state.signature}`, '', ...adoptionReport, ...(adoptionReport.length ? [''] : []), `Input units: ${units || 'explicit in the design basis'}`, 'Input evidence (references are retained, not independently verified):', evidence || '- none', '', 'Supplied design criteria:', ...(criteriaReportRows.length ? criteriaReportRows : ['- none supplied']), '', 'Automatic load-flow revision:', ...(loadFlowStudyReport(proposal).length ? loadFlowStudyReport(proposal) : ['- no revision evidence returned']), '', 'Equipment disposition:', dispositionReport || '- none', '', ...(distributionPartitionLines.length ? ['Feeder-aware panel grouping:', ...distributionPartitionLines, ''] : []), 'Motor design and starting:', motorReport || '- none', '', ...(motorAccelerationReport(proposal).length ? ['Quasi-steady motor acceleration screen:', ...motorAccelerationReport(proposal), ''] : []), ...protectionTimingReport, ...(motorThermalReport(proposal).length ? ['ABB REM610 DOL thermal-setting alternative:', ...motorThermalReport(proposal), ''] : []), ...(faultScenarioReport(proposal).length ? ['Explicit fault operating-scenario comparison:', ...faultScenarioReport(proposal), ''] : []), ...(faultStudyReport(proposal).length ? ['Optional fault network study:', ...faultStudyReport(proposal), ''] : []), ...(faultEvolutionLines.length ? ['Supplied fault source-profile history:', ...faultEvolutionLines, ''] : []), ...(cableFaultWithstandLines.length ? ['Conditional cable fault thermal screen:', ...cableFaultWithstandLines, ''] : []), ...(deviceFaultReport(proposal).length ? ['Proposed device locations and initial-RMS screen:', ...deviceFaultReport(proposal), ''] : []), ...(curveSourceReport(proposal).length ? ['Selected breaker curve-source review:', ...curveSourceReport(proposal), ''] : []), proposal.report?.summary || proposal.report?.intendedUse || '', '', 'Selected transformer and two-sided protection:', ...(transformerReport.length ? transformerReport : ['- none selected']), '', 'Panels:', panelRows || '- none', '', 'Panel location decisions:', ...(panelLocationRows.length ? panelLocationRows : ['- none']), '', 'Cables:', cableRows || '- none', '', 'Routes:', routeRows || '- none', '', 'Routing decisions:', routingRows || '- No per-circuit routing decisions returned.', '- Routing is selected with stable-order greedy tray reservations and no backtracking; a blocked result does not prove that no globally feasible routing exists.', '', 'Endpoint conduit screening:', endpointRows || '- none', '', 'Raceway capacity screening:', trayRows || '- no evaluation returned', '', 'Tabulated cable ampacity screening:', thermalReportRows || '- not evaluated', '', 'Checks:', ...checks.map(check => `- ${check.id || check.name || check.check || 'unnamed check'}: ${check.status || check.result || check.message || '—'}`), '', 'Issues:', ...(proposal.issues || []).map(issueText), '', 'Assumptions:', ...(proposal.assumptions || []).map(item => `- ${item.message || item.detail || item.code || (typeof item === 'string' ? item : JSON.stringify(item))}`), '', 'This report is screening information for qualified human review. Transformer profiles are limited to sourced 480 V delta to 208Y/120 V balanced three-phase cases. Motor starting results are balanced initial DOL locked-rotor voltage screens only. Any acceleration result is a supplied-curve quasi-steady screen and does not establish thermal withstand, overload coordination, protection, or transient response. Secondary fault transfer is three-phase only; ground faults, asymmetrical duty, neutral/unbalanced behavior, magnetizing current, inrush, and coordination are not thereby evaluated.', faultStudyScopeStatement, 'Cable ampacity rows use stated ambient/grouping/cover assumptions and are not detailed direct-burial IEC temperature predictions.', '', 'Complete JSON payload:', JSON.stringify(proposal, null, 2)].join('\n');
}
async function restorePendingDraft() {
  if (!window.__ctrProjectReady) await new Promise(resolve => window.addEventListener('ctr:project-ready', resolve, { once: true }));
  const pending = readProjectSessionValue(PENDING_DRAFT_KEY, null);
  if (!pending?.draft) return;
  try {
    const draft = pending.generationBaseline && !pending.draft.generationBaseline ? { ...pending.draft, generationBaseline: pending.generationBaseline } : pending.draft;
    writeDraft(draft);
    writeProjectSessionValue(PENDING_DRAFT_KEY, null);
    status('Draft restored after project creation. Regenerating proposal for the active project…');
    await generate();
  } catch (error) { status(`Could not restore pending draft: ${error.message}`, 'error'); }
}
async function loadSample(url = SAMPLE_URL, successMessage = 'Industrial 30-load sample loaded.') {
  invalidate('Loading sample…');
  const token = ++state.generationToken;
  try { const response = await fetch(url); if (!response.ok) throw new Error(`HTTP ${response.status}`); const draft = await response.json(); if (token !== state.generationToken) return; clearDistributionBaseline(); writeDraft(draft); status(successMessage); }
  catch (error) { if (token === state.generationToken) status(`Could not load sample: ${error.message}`, 'error'); }
}
async function loadFaultScenariosSample() {
  invalidate('Loading fault operating-scenario sample…');
  const token = ++state.generationToken;
  try {
    const response = await fetch(SAMPLE_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const draft = await response.json();
    if (token !== state.generationToken) return;
    draft.provenance = { kind: 'synthetic', note: 'Synthetic 25 non-motor loads for fault operating-scenario UI acceptance; electrical source values are explicit synthetic examples, not field data.' };
    draft.equipment = (draft.equipment || []).filter(row => !row.motor).slice(0, 25);
    draft.supply = { ...draft.supply, voltage: 480, phases: 3, availableFaultCurrentKA: 20 };
    const makeStudy = (impedance, scenarioReference) => ({
      networkBaseMVA: 1,
      sourceInventory: { status: 'complete', reference: 'Complete only for the single explicitly modeled utility source in this synthetic demonstration; not a field inventory.' },
      sources: [{ equipmentId: draft.supply.id, emfPhaseV: { re: draft.supply.voltage / Math.sqrt(3), im: 0 }, impedance, inService: true, reference: scenarioReference }],
    });
    draft.faultScenarios = [
      { id: 'strong-source', reference: 'Synthetic stronger source condition: 0.006 + j0.015 ohm/phase.', study: makeStudy({ rOhm: 0.006, xOhm: 0.015 }, FAULT_SCENARIOS_SAMPLE_REFERENCE) },
      { id: 'weaker-source', reference: 'Synthetic weaker source condition: 0.012 + j0.030 ohm/phase.', study: makeStudy({ rOhm: 0.012, xOhm: 0.030 }, FAULT_SCENARIOS_SAMPLE_REFERENCE) },
    ];
    delete draft.faultStudy;
    clearDistributionBaseline();
    writeDraft(draft);
    status('Synthetic 25-load fault-scenario sample loaded with two named source conditions. Values and references are illustrative, not field data.');
  } catch (error) { if (token === state.generationToken) status(`Could not load fault-scenario sample: ${error.message}`, 'error'); }
}
async function loadMixedVoltageSample() {
  invalidate('Loading mixed-voltage sample…');
  const token = ++state.generationToken;
  try {
    const response = await fetch(SAMPLE_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const draft = await response.json();
    if (token !== state.generationToken) return;
    draft.provenance = { kind: 'synthetic', note: 'Compact mixed-voltage UI example adapted from the industrial corridor graph; no field installation or manufacturer unit is represented.' };
    draft.equipment = [
      { id: 'LOAD-480-01', tag: 'PUMP-480', kw: 22, voltage: 480, phases: 3, powerFactor: 0.9, x: 40, y: -20, z: 0 },
      { id: 'LOAD-480-02', tag: 'FAN-480', kw: 18, voltage: 480, phases: 3, powerFactor: 0.9, x: 60, y: -20, z: 0 },
      { id: 'LOAD-208-01', tag: 'MCC-208-A', kw: 4, voltage: 208, phases: 3, powerFactor: 0.9, x: 80, y: 60, z: 0 },
      { id: 'LOAD-208-02', tag: 'MCC-208-B', kw: 5, voltage: 208, phases: 3, powerFactor: 0.9, x: 120, y: 60, z: 0 },
      { id: 'LOAD-208-03', tag: 'MCC-208-C', kw: 6, voltage: 208, phases: 3, powerFactor: 0.9, x: 160, y: 60, z: 0 },
    ];
    clearDistributionBaseline();
    writeDraft(draft);
    status('Synthetic 480 V direct-load and 208 V transformer-fed sample loaded; no panels or cables are preassigned.');
  } catch (error) { if (token === state.generationToken) status(`Could not load mixed-voltage sample: ${error.message}`, 'error'); }
}
async function loadMotorStarterSample({ branchBreaker = false, manufacturerMotorSample = false, faultStudySample = false, faultEvolutionSample = false, accelerationSample = false, motorThermalSample = false, protectionTimingSample = false, protectionTimingRangeSample = false } = {}) {
  invalidate('Loading motor starter sample…');
  const token = ++state.generationToken;
  try {
    const response = await fetch(SAMPLE_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const draft = await response.json();
    if (token !== state.generationToken) return;
    draft.provenance = { kind: 'synthetic', note: '25 synthetic industrial loads with explicit motor/source/control inputs; sourced starter parts are research candidates, not a field installation.' };
    draft.equipment = draft.equipment.slice(0, 25).map(row => ({ ...row, kw: 2 }));
    draft.equipment[0] = { ...draft.equipment[0], kw: 9, phases: 3, voltage: 480, powerFactor: 0.86, duty: 'continuous', ratingsBasis: 'electrical-input-kW', motor: {
      ratedVoltageV: 460, fullLoadCurrentA: 14, fullLoadCurrentBasis: { reference: 'Synthetic design current for this example; not a selected manufacturer motor.' },
      nameplateCurrentA: 12.8, nameplateHorsepower: 10, nameplateFrequencyHz: 60, lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3, starterType: 'dol', ...(branchBreaker || accelerationSample || motorThermalSample || protectionTimingSample || protectionTimingRangeSample ? { rotorType: 'squirrel-cage' } : {}),
      ...(motorThermalSample ? { rem610Thermal: {
        reference: 'Synthetic REM610 setting-screen input set; not a relay or motor installation.',
        currentScalingFactor: 1,
        motorSafeStallTimeS: 15, motorSafeStallReference: 'Synthetic illustrative motor safe-stall limit; replace with verified motor data.',
        referenceStartCurrentA: 100, referenceStartCurrentReference: 'Synthetic constant REM610 setting-screen current basis with unit current scaling assumed for the counterfactual example; not CT or measured current data.',
        ambientTemperatureC: 40, priorLoadCurrentA: 12.8, priorLoadReference: 'Synthetic illustrative prior-current basis; not operating history.',
        permittedHotStarts: 1, permittedColdStarts: 2, startTimeMarginPct: 10,
      } } : {}),
    } };
    if (manufacturerMotorSample) {
      const row = draft.equipment[0];
      row.kw = Math.sqrt(3) * 460 * 16.8 * 0.61 / 1000;
      row.powerFactor = 0.61;
      Object.assign(row.motor, { nameplateCurrentA: 16.8, lockedRotorCurrentA: 121, lockedRotorPowerFactor: 0.254,
        fullLoadCurrentBasis: { reference: 'Illustrative Schneider 2017-derived 10 hp / 460 V table current of 14 A; applicability to this low-speed motor and adopted edition are not established.' } });
      row.provenance = { kind: 'synthetic', note: 'Example uses Baldor GNEM2332T nameplate and typical 460 V starting data; the operating kW is calculated at full load, the rotor type and project installation are illustrative, and all application and design-current assumptions require review.' };
      row.sourceDocuments = [
        { title: 'ABB Baldor GNEM2332T information packet, p. 6, record 101013; typical performance, not guaranteed', url: 'https://www.baldor.com/api/products/GNEM2332T/infopacket', sha256: '7af275fea860d9d38ccbfce69f802e1d58fa902dbd0b36a1f91cc25508c81de5' },
        { title: 'Schneider Electric motor full-load current table, 2017 NEC basis; applicability not established', url: 'https://productinfo.se.com/8536db0901_motorcontrolsolutions_db/8536db0901-db-motor-control-solutions/English/8536DB0901R0119%20Motor%20Control%20Solutions%20for%20the%20North%20American%20MarketSchnei_0000295698.xml/%24/Full-LoadCurrentThree-PhaseAlternat-70E6F773' },
      ];
    }
    draft.supply.frequencyHz = 60;
    draft.supply.voltageSystem = { connection: 'wye', grounding: 'solid', lineToGroundVoltageV: 277, reference: 'Synthetic 480Y/277 V solidly grounded source basis.' };
    draft.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic positive-sequence source impedance within the 20 kA external bound.' };
    draft.criteria.motorStarting = { minimumVoltagePu: 0.8 };
    draft.criteria.motorStarter = { controlVoltageV: 24, controlCurrentType: 'DC', ...(!branchBreaker ? { enclosureMm: { height: 610, width: 305, depth: 205 } } : {}), ...(branchBreaker ? { branchProtectionMethod: 'inverse-time-breaker', instantaneousPickupA: 150 } : {}) };
    if (faultStudySample) {
      const motor = draft.equipment[0];
      draft.faultStudy = {
        networkBaseMVA: 1,
        sourceInventory: { status: 'complete', reference: 'Complete only for the two explicitly modeled sources in this synthetic demonstration; not a field inventory.' },
        sources: [
          { equipmentId: draft.supply.id, emfPhaseV: { re: draft.supply.voltage / Math.sqrt(3), im: 0 }, impedance: { rOhm: 0.006, xOhm: 0.015 }, inService: true, reference: 'Synthetic utility-source positive-sequence equivalent; not manufacturer or field data.' },
          { equipmentId: motor.id, emfPhaseV: { re: motor.motor.ratedVoltageV / Math.sqrt(3), im: 0 }, impedance: { rOhm: 1, xOhm: 3 }, inService: true, reference: 'Synthetic motor positive-sequence equivalent; not manufacturer or field data and not inferred from locked-rotor current.' },
        ],
      };
    }
    if (faultEvolutionSample) {
      const conditions = { ambientTemperatureC: 25, frequencyHz: 60, phases: 3, voltageRangeV: [450, 500], reference: 'Synthetic 450–500 V, 60 Hz, balanced three-phase source-profile conditions; illustrative only.' };
      draft.faultEvolution = {
        schemaVersion: '1.0.0', horizonS: 5,
        reference: 'Synthetic piecewise-linear source EMF multiplier histories for a fixed illustrative fault network; not measured motor decay.',
        profiles: draft.faultStudy.sources.map(source => ({
          equipmentId: source.equipmentId,
          source: { reference: 'Synthetic illustrative source-profile history; not manufacturer or field evidence.', evidenceClass: 'synthetic' },
          conditions: { ...conditions },
          points: [{ timeS: 0, emfMultiplier: 1 }, { timeS: 0.5, emfMultiplier: 0.8 }, { timeS: 2, emfMultiplier: 0.4 }, { timeS: 5, emfMultiplier: 0.15 }],
        })),
      };
    }
    if (protectionTimingSample || protectionTimingRangeSample) {
      const condition = initialState => ({ initialState, ambientTemperatureC: 40, frequencyHz: 60, phases: 3, voltageRangeV: [400, 500], reference: `Synthetic ${initialState}-state 400–500 V, 60 Hz, three-phase timing condition; illustrative only.` });
      const source = (id, reference) => ({ id, reference, evidenceClass: 'synthetic' });
      draft.equipment[0].motor.protectionTiming = {
        schemaVersion: protectionTimingRangeSample ? '2.0.0' : '1.0.0', initialState: 'cold', ambientTemperatureC: 40, frequencyHz: 60, phases: 3,
        referenceStartCurrentA: 100, referenceStartCurrentReference: 'Synthetic reference-current comparison basis; not a measured start-current trajectory.',
        currentEnvelopeA: { minimumA: 1, maximumA: 100, reference: 'Synthetic comparison envelope, 1–100 A; values outside are not represented.' },
        ...(protectionTimingRangeSample ? { stallCurrentRangeA: { minimumA: 80, maximumA: 110, reference: 'Synthetic constant-stall current interval used only for supplied curve-bound comparison; it is not a motor current trajectory.' } } : {}),
        startMarginS: 0.2,
        motorWithstand: {
          ...(protectionTimingRangeSample ? {
            hotMinimumSafeStallCurve: [{ currentA: 80, minimumSafeStallTimeS: 39.0625 }, { currentA: 125, minimumSafeStallTimeS: 16 }],
            coldMinimumSafeStallCurve: [{ currentA: 80, minimumSafeStallTimeS: 62.5 }, { currentA: 125, minimumSafeStallTimeS: 25.6 }],
          } : { referenceCurrentA: 100, hotMinimumSafeStallTimeS: 10, coldMinimumSafeStallTimeS: 15 }),
          hotConditions: condition('hot'), coldConditions: condition('cold'),
          source: source('SYNTH-MOTOR-WITHSTAND', protectionTimingRangeSample ? 'Synthetic hot/cold safe-stall curves; illustrative inverse-square bounds, not motor data.' : 'Synthetic illustrative hot/cold safe-stall timing bounds; replace with verified motor-specific evidence.'),
        },
        devices: [
          {
            role: 'branch-breaker', catalogNumber: '3VA5125-6EC31-0AA0', setting: { fixedIrA: 25, instantaneousPickupA: 150 },
            source: source('SYNTH-3VA5125', 'Synthetic illustrative breaker time-current bounds; no Siemens curve is represented.'), conditions: condition('cold'),
            minimumTrip: [{ currentA: 10, timeS: 1000 }, { currentA: 100, timeS: 10 }, { currentA: 1000, timeS: 0.05 }],
            maximumTotalCircuitClearing: [{ currentA: 10, timeS: 2000 }, { currentA: 100, timeS: 12 }, { currentA: 1000, timeS: 0.1 }],
            includesContactorOpening: false,
          },
          {
            role: 'overload-relay', catalogNumber: '3RU2126-4AB0', setting: { dialSettingA: 12.8 },
            source: source('SYNTH-3RU2126', 'Synthetic illustrative overload timing bounds; no Siemens relay curve is represented.'), conditions: condition('cold'),
            minimumTrip: [{ currentA: 10, timeS: 1000 }, { currentA: 100, timeS: 4 }, { currentA: 1000, timeS: 0.02 }],
            maximumTotalCircuitClearing: [{ currentA: 10, timeS: 1500 }, { currentA: 100, timeS: 6 }, { currentA: 1000, timeS: 0.04 }],
            includesContactorOpening: true,
          },
        ],
      };
    }
    if (accelerationSample) {
      const motor = draft.equipment[0];
      draft.motorAccelerationInputs = {
        [motor.id]: {
          reference: 'Synthetic motor and coupled-load acceleration case; no manufacturer or field data.',
          motorInertiaKgM2: 0.04,
          motorInertiaReference: 'Synthetic illustrative motor inertia; replace with verified machine data.',
          loadInertiaKgM2: 0.06,
          loadInertiaReference: 'Synthetic illustrative coupled-load inertia; replace with verified equipment data.',
          targetSpeedRpm: 3570,
          performanceCurve: {
            reference: 'Synthetic 60 Hz squirrel-cage speed/current/PF/torque curve; illustrative only.',
            points: [
              { speedRpm: 0, currentA: 90, powerFactor: 0.3, torqueNm: 42 },
              { speedRpm: 600, currentA: 82, powerFactor: 0.35, torqueNm: 45 },
              { speedRpm: 1200, currentA: 76, powerFactor: 0.42, torqueNm: 47 },
              { speedRpm: 1800, currentA: 68, powerFactor: 0.52, torqueNm: 46 },
              { speedRpm: 2400, currentA: 58, powerFactor: 0.68, torqueNm: 40 },
              { speedRpm: 3000, currentA: 43, powerFactor: 0.82, torqueNm: 30 },
              { speedRpm: 3300, currentA: 30, powerFactor: 0.9, torqueNm: 24 },
              { speedRpm: 3570, currentA: 14, powerFactor: 0.86, torqueNm: 20 },
            ],
          },
          loadTorqueCurve: {
            reference: 'Synthetic coupled-load torque versus speed curve; illustrative only.',
            points: [
              { speedRpm: 0, torqueNm: 12 }, { speedRpm: 600, torqueNm: 12.5 },
              { speedRpm: 1200, torqueNm: 13 }, { speedRpm: 1800, torqueNm: 14 },
              { speedRpm: 2400, torqueNm: 15 }, { speedRpm: 3000, torqueNm: 17 },
              { speedRpm: 3300, torqueNm: 18.5 }, { speedRpm: 3570, torqueNm: 19.5 },
            ],
          },
        },
      };
      draft.criteria.motorAcceleration = { maximumTimeS: 6 };
    }
    clearDistributionBaseline(); writeDraft(draft);
    status(manufacturerMotorSample ? 'Manufacturer motor example loaded: nameplate and typical starting values are sourced; the plant, design-current applicability, rotor and operating assumptions are illustrative. Motor protection remains unresolved.' : faultEvolutionSample ? 'Synthetic fault evolution example loaded; source multipliers are illustrative histories, not measured motor decay or protection evidence.' : protectionTimingRangeSample ? 'Synthetic stall-range timing example loaded; all curves, conditions, source references, and bounds are illustrative and unverified. The range is not a motor current trajectory; motor Apply remains blocked.' : protectionTimingSample ? 'Synthetic protection timing example loaded; every curve, source reference, condition, setting, and bound is illustrative, unverified, and not manufacturer or field data.' : motorThermalSample ? 'Synthetic motor thermal-setting sample loaded with a unit current-scaling factor assumed for a counterfactual reference; all motor, relay, CT, and operating values are illustrative, not field data, and motor Apply remains blocked.' : accelerationSample ? 'Synthetic motor acceleration sample loaded. Curves, inertia, references, and duration criterion are illustrative; motor Apply remains blocked.' : faultStudySample ? 'Synthetic motor fault network sample loaded. Explicit source equivalents support initial RMS screening only; complete protection remains unresolved.' : branchBreaker ? 'Synthetic breaker research sample loaded with squirrel-cage rotor and proposed 150 A TM230 setting. No setting is treated as installed.' : 'Synthetic 25-load motor starter sample loaded. Complete motor protection remains unresolved.');
  } catch (error) { if (token === state.generationToken) status(`Could not load motor starter sample: ${error.message}`, 'error'); }
}
async function generate() {
  invalidate('Running proposal generation…');
  const token = ++state.generationToken;
  try {
    const rawInput = inputModel();
    if (rawInput.projectEquipmentAdoption) {
      const context = projectEquipmentContext();
      const adoptionValidation = validateDesignSynthesisProjectEquipmentAdoption({
        adoption: rawInput.projectEquipmentAdoption,
        rows: rawInput.equipment,
        equipment: getEquipment(),
        loads: getLoads(),
        ...context,
        lastApplied: getItem(LAST_APPLIED_KEY, {}, context.scenario) || {},
      });
      if (!adoptionValidation.ok) throw new Error('Reviewed project equipment is stale or no longer matches this draft. Review the current project records and copy the selection again before generating.');
    }
    if (rawInput.projectTrayAdoption) {
      if (state.projectTrayReviewDirty) throw new Error('Review and copy the edited project-tray basis before generating.');
      const trayValidation = await validateProjectTrayHandoff({ ...projectTraySource(), adoption: rawInput.projectTrayAdoption, corridors: rawInput.corridors });
      if (token !== state.generationToken) return;
      if (!trayValidation.ok) throw new Error(`Reviewed project trays are stale or no longer match this draft: ${trayValidation.issues.map(item => item.message).join(' ')}`);
    }
    const baseline = resolveGenerationBaseline(rawInput);
    const input = baseline !== null && baseline !== undefined && !hasGenerationBaseline(rawInput) ? { ...rawInput, generationBaseline: baseline } : rawInput;
    let result = generateDesignProposal(input, input.projectTrayAdoption ? { projectTraySource: projectTraySource() } : {});
    if (input.projectEquipmentAdoption) result = bindDesignSynthesisProjectEquipmentProposal(result, input.projectEquipmentAdoption);
    if (token !== state.generationToken) return;
    state.proposal = result;
    state.oneLinePreview = buildDesignSynthesisOneLinePreview(result);
    state.engineSignature = result.inputSignature || result.inputs?.signature || result.inputs?.inputSignature || '';
    const promotedDraft = result.status === 'proposal' && result.distributionBaseline && hasGenerationBaseline(rawInput) ? { ...rawInput, generationBaseline: result.distributionBaseline } : rawInput;
    state.extraInput = Object.fromEntries(Object.entries(promotedDraft).filter(([key]) => !fields.includes(key)));
    state.draft = promotedDraft;
    state.signature = signature(promotedDraft);
    state.generationBaseline = result.status === 'proposal' ? (result.distributionBaseline || baseline) : baseline;
    if (result.status === 'proposal' && hasGenerationBaseline(rawInput)) setItem(DRAFT_KEY, promotedDraft);
    persistDistributionBaseline(result);
    const preview = previewDesignProposal(result);
    state.previewContext = preview.context || null;
    renderOutput(result, preview);
    document.getElementById('synthesis-download-json').disabled = false;
    document.getElementById('synthesis-download-cable-schedule').disabled = !buildPreliminaryCableSchedule(result).ok;
    document.getElementById('synthesis-download-panel-schedule').disabled = !buildPreliminaryPanelSchedule(result).ok;
    const racewaySchedule = buildPreliminaryRacewaySchedule(result);
    document.getElementById('synthesis-download-raceway-schedule').disabled = !racewaySchedule.ok;
    document.getElementById('synthesis-raceway-schedule-status').textContent = racewaySchedule.ok ? `${racewaySchedule.racewayCount} proposed raceways available for preliminary review.` : racewaySchedule.message;
    const reviewProject = reviewProjectEligibility(result);
    document.getElementById('synthesis-create-review-project').disabled = !reviewProject.ok;
    document.getElementById('synthesis-review-project-status').textContent = reviewProject.ok ? 'Creates a separate local project for review; full study histories remain in the proposal downloads.' : reviewProject.message;
    document.getElementById('synthesis-download-report').disabled = false;
    document.getElementById('synthesis-download-oneline').disabled = !state.oneLinePreview.ok;
    const canCreateProject = result.status === 'proposal'
      && preview.errors?.length === 1
      && preview.errors[0]?.code === 'project_required'
      && (preview.conflicts || []).length === 0
      && typeof window.projectManager?.newProject === 'function';
    const canReviewConflicts = result.status === 'proposal' && Boolean(preview.context?.projectId) && !preview.ok;
    const applyButton = document.getElementById('synthesis-apply');
    applyButton.disabled = result.status !== 'proposal' || (!preview.ok && !canCreateProject && !canReviewConflicts);
    applyButton.textContent = canReviewConflicts ? 'Review Apply conflicts' : canCreateProject ? 'Create Project to Apply' : 'Apply to schedules';
    const previewStatus = preview.ok ? 'Proposal generated' : canCreateProject ? 'Proposal generated; Apply will create or open a named project and regenerate' : 'Proposal generated; Apply is blocked by review conflicts';
    status(`${result.status === 'blocked' ? 'Proposal blocked' : previewStatus} for ${result.equipment?.length || 0} equipment item(s).`, result.status === 'blocked' || (!preview.ok && !canCreateProject) ? 'error' : 'success');
  }
  catch (error) { invalidate(); status(`Generation failed: ${error.message}`, 'error'); }
}
function bind() {
  bindProposalEvidence(document.getElementById('synthesis-output'));
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-review-starting-source]')) return;
    openStartingSourcePicker({ readSource: () => readDraft().supply, readFaultStudy: () => readDraft().faultStudy, commitSource: supply => { const draft = readDraft(); writeDraft({ ...draft, supply }); status('Reviewed starting source impedance copied into the draft.', 'success'); } })
      .catch(error => status(`Cannot review starting source: ${error.message}`, 'error'));
  });
  const updateCorridor = request => {
    try {
      const draft = readDraft();
      const corridors = editCorridorGraph(draft.corridors, request);
      if (!corridors) { status('Corridor graph is invalid; correct its JSON before using the table editor.', 'error'); return; }
      writeDraft({ ...draft, corridors });
    } catch { status('Correct invalid draft JSON before using the corridor table editor.', 'error'); }
  };
  document.addEventListener('change', event => {
    if (event.target.matches('[data-alternate-endpoint-policy]') && ['nearest', 'allow'].includes(event.target.value)) { const draft = readDraft(); draft.criteria = { ...draft.criteria, allowAlternateEndpointAttachments: event.target.value === 'allow' }; writeDraft(draft); }
    if (event.target.matches('[data-route-preview-select]') && state.proposal && state.signature === signature(inputModel())) { const container = document.querySelector('[data-route-preview-content]'); if (container) { container.innerHTML = renderDesignSynthesisRoutePreview(state.proposal, event.target.value); container.querySelector('[data-route-preview-select]')?.focus(); } }
    if (event.target.matches('[data-project-tray-select], [data-project-tray-ack], [data-project-tray-evidence-confirm]')) invalidateProjectTrayReview();
    if (event.target.matches('[data-project-equipment-select]')) {
      state.selectedProjectEquipmentIds = [...document.querySelectorAll('[data-project-equipment-select]:checked')].map(input => input.dataset.projectEquipmentSelect);
      state.pendingProjectEquipmentAdoption = null;
      document.querySelector('#synthesis-project-equipment [data-project-equipment-pending]')?.remove();
    }
    if (event.target.matches('[data-project-equipment-ack]')) {
      state.projectEquipmentAcknowledgements = Object.fromEntries([...document.querySelectorAll('[data-project-equipment-ack]')].map(input => [input.dataset.projectEquipmentAck, input.checked]));
      state.pendingProjectEquipmentAdoption = null;
      document.querySelector('#synthesis-project-equipment [data-project-equipment-pending]')?.remove();
    }
    if (event.target.matches('[data-starter-basis-control]')) mutateStarterBasis(event.target);
    if (event.target.matches('[data-motor-nameplate-field]')) mutateMotorNameplate(event.target);
    if (event.target.matches('[data-corridor-field]')) updateCorridor({ action: 'edit', kind: event.target.dataset.corridorKind, index: Number(event.target.dataset.corridorIndex), field: event.target.dataset.corridorField, value: event.target.value });
  });
  document.addEventListener('input', event => { if (event.target.matches('[data-project-tray-reference], [data-project-tray-thermal-reference], [data-project-tray-installation-reference]')) invalidateProjectTrayReview(); });
  fields.forEach(field => document.getElementById(`synthesis-${field}`)?.addEventListener('input', () => { try { const draft = readDraft(); setItem(DRAFT_KEY, draft); renderInputControls(draft); } catch { if (field === 'corridors') { const editor = document.getElementById('synthesis-corridor-editor'); if (editor) editor.innerHTML = '<p>Correct invalid corridor JSON before using the table editor.</p>'; } } invalidate(); }));
  for (const id of ['synthesis-fault-study', 'synthesis-fault-scenarios', 'synthesis-fault-evolution', 'synthesis-cable-fault-withstand']) document.getElementById(id)?.addEventListener('input', event => {
    try { writeDraft(readDraft(), { renderControls: false }); }
    catch { invalidate(); }
    if (event.target.id === 'synthesis-fault-scenarios' && event.target.value.trim()) {
      try { JSON.parse(event.target.value); }
      catch { status('Fault-scenario JSON is invalid and retained in the draft. Correct it before generating.', 'error'); }
    }
    if (event.target.id === 'synthesis-fault-evolution' && event.target.value.trim()) {
      try { JSON.parse(event.target.value); }
      catch { status('Fault-evolution JSON is invalid and retained in the draft. Correct it before generating.', 'error'); }
    }
    if (event.target.id === 'synthesis-cable-fault-withstand' && event.target.value.trim()) {
      try { JSON.parse(event.target.value); }
      catch { status('Cable fault-withstand JSON is invalid and retained in the draft. Correct it before generating.', 'error'); }
    }
  });
  document.getElementById('synthesis-motor-acceleration')?.addEventListener('input', event => {
    const draft = readDraft();
    draft.motorAccelerationInputs = event.target.value;
    writeDraft(draft, { renderControls: false });
    if (event.target.value.trim()) {
      try { JSON.parse(event.target.value); }
      catch { status('Motor acceleration JSON is invalid and retained in the draft. Correct it before generating.', 'error'); }
    }
  });
  document.addEventListener('change', event => { if (event.target.matches('[data-synthesis-control]')) mutateControl(event.target); if (event.target.matches('[data-load-flow-control]')) mutateLoadFlowControl(event.target); if (event.target.matches('[data-motor-acceleration-criterion]')) mutateMotorAccelerationCriterion(event.target); if (event.target.matches('[data-equipment-field]')) mutateEquipment(event.target); if (event.target.matches('[data-panel-override-field]')) mutatePanelOverride(event.target); if (event.target.matches('[data-thermal-edge-field]')) mutateThermalEdge(event.target); if (event.target.matches('[data-thermal-global]')) mutateThermalGlobal(event.target); if (event.target.matches('[data-endpoint-installation]')) mutateEndpointInstallation(event.target); });
  document.getElementById('synthesis-add-panel-override')?.addEventListener('click', () => { const draft = readDraft(); const locations = { ...(draft.overrides?.panelLocations || {}) }; let id = 'PANEL-NEW'; let index = 1; while (locations[id]) id = `PANEL-NEW-${index++}`; locations[id] = { x: '', y: '', z: '', note: '' }; writeDraft({ ...draft, overrides: { ...(draft.overrides || {}), panelLocations: locations } }); });
  document.addEventListener('click', event => { const button = event.target.closest('[data-panel-override-remove]'); if (!button) return; const draft = readDraft(); const locations = { ...(draft.overrides?.panelLocations || {}) }; delete locations[button.dataset.panelOverrideRemove]; writeDraft({ ...draft, overrides: { ...(draft.overrides || {}), panelLocations: locations } }); });
  document.addEventListener('click', event => { const button = event.target.closest('[data-panel-location-candidate]'); if (button) usePanelLocationCandidate(button); });
  document.addEventListener('click', event => {
    if (event.target.closest('[data-project-tray-bind]')) bindProjectTrayReuse();
    if (event.target.closest('[data-corridor-initialize]')) updateCorridor({ action: 'initialize' });
    const add = event.target.closest('[data-corridor-add]');
    const remove = event.target.closest('[data-corridor-remove]');
    if (add) updateCorridor({ action: 'add', kind: add.dataset.corridorAdd });
    if (remove) updateCorridor({ action: 'remove', kind: remove.dataset.corridorRemove, index: Number(remove.dataset.corridorIndex) });
    if (event.target.closest('[data-project-tray-review]')) reviewSelectedProjectTrays();
    if (event.target.closest('[data-project-tray-copy]')) useReviewedProjectTrays();
    if (event.target.closest('[data-project-equipment-review]')) reviewSelectedProjectEquipment();
    if (event.target.closest('[data-project-equipment-copy]')) useReviewedProjectEquipment();
  });
  document.getElementById('synthesis-load-sample')?.addEventListener('click', () => loadSample());
  document.getElementById('synthesis-load-capacity-sample')?.addEventListener('click', () => loadSample(TRAY_CONGESTION_SAMPLE_URL, 'Synthetic shared-tray capacity sample loaded.'));
  document.getElementById('synthesis-load-existing-tray-sample')?.addEventListener('click', () => loadSample(EXISTING_TRAY_SAMPLE_URL, 'Synthetic existing-tray occupancy sample loaded; project tray reuse remains blocked.'));
  document.getElementById('synthesis-load-mixed-sample')?.addEventListener('click', loadMixedVoltageSample);
  document.getElementById('synthesis-load-motor-sample')?.addEventListener('click', () => loadMotorStarterSample());
  document.getElementById('synthesis-load-motor-breaker-sample')?.addEventListener('click', () => loadMotorStarterSample({ branchBreaker: true }));
  document.getElementById('synthesis-load-manufacturer-motor-sample')?.addEventListener('click', () => loadMotorStarterSample({ branchBreaker: true, manufacturerMotorSample: true }));
  document.getElementById('synthesis-load-motor-fault-sample')?.addEventListener('click', () => loadMotorStarterSample({ branchBreaker: true, faultStudySample: true }));
  document.getElementById('synthesis-load-motor-fault-evolution-sample')?.addEventListener('click', () => loadMotorStarterSample({ branchBreaker: true, faultStudySample: true, faultEvolutionSample: true }));
  document.getElementById('synthesis-load-motor-acceleration-sample')?.addEventListener('click', () => loadMotorStarterSample({ accelerationSample: true }));
  document.getElementById('synthesis-load-motor-thermal-sample')?.addEventListener('click', () => loadMotorStarterSample({ accelerationSample: true, motorThermalSample: true }));
  document.getElementById('synthesis-load-motor-protection-timing-sample')?.addEventListener('click', () => loadMotorStarterSample({ branchBreaker: true, accelerationSample: true, protectionTimingSample: true }));
  document.getElementById('synthesis-load-motor-stall-range-sample')?.addEventListener('click', () => loadMotorStarterSample({ branchBreaker: true, accelerationSample: true, protectionTimingRangeSample: true }));
  document.getElementById('synthesis-load-fault-scenarios-sample')?.addEventListener('click', loadFaultScenariosSample);
  document.getElementById('synthesis-generate')?.addEventListener('click', generate);
  document.getElementById('synthesis-import')?.addEventListener('change', async event => { const file = event.target.files?.[0]; if (!file) return; invalidate('Importing draft…'); const token = ++state.generationToken; try { const draft = JSON.parse(await file.text()); if (token !== state.generationToken) return; if (!draft.generationBaseline) clearDistributionBaseline(); writeDraft(draft); status(`Imported ${file.name}.`); } catch (error) { if (token === state.generationToken) status(`Import failed: ${error.message}`, 'error'); } finally { if (event.target.files?.[0] === file) event.target.value = ''; } });
  document.getElementById('synthesis-download-json')?.addEventListener('click', () => { if (state.proposal && state.signature === signature(inputModel())) download('design-synthesis-proposal.json', JSON.stringify(state.proposal, null, 2), 'application/json'); });
  document.getElementById('synthesis-download-cable-schedule')?.addEventListener('click', () => { if (state.proposal && state.signature === signature(inputModel())) { const schedule = buildPreliminaryCableSchedule(state.proposal); if (schedule.ok) download('preliminary-cable-schedule.csv', schedule.csv, 'text/csv;charset=utf-8'); } });
  document.getElementById('synthesis-download-panel-schedule')?.addEventListener('click', () => { if (state.proposal && state.signature === signature(inputModel())) { const schedule = buildPreliminaryPanelSchedule(state.proposal); if (schedule.ok) download('preliminary-panel-schedule.csv', schedule.csv, 'text/csv;charset=utf-8'); } });
  document.getElementById('synthesis-download-raceway-schedule')?.addEventListener('click', () => { if (state.proposal && state.signature === signature(inputModel())) { const schedule = buildPreliminaryRacewaySchedule(state.proposal); if (schedule.ok) download('preliminary-raceway-schedule.csv', schedule.csv, 'text/csv;charset=utf-8'); } });
  document.getElementById('synthesis-download-report')?.addEventListener('click', () => { if (state.proposal && state.signature === signature(inputModel())) download('design-synthesis-report.txt', reportText(state.proposal), 'text/plain'); });
  document.getElementById('synthesis-download-oneline')?.addEventListener('click', () => { if (state.proposal && state.oneLinePreview?.ok && state.signature === signature(inputModel())) download('design-synthesis-preliminary-one-line.svg', state.oneLinePreview.svg, 'image/svg+xml'); });
  document.getElementById('synthesis-create-review-project')?.addEventListener('click', async () => {
    const proposal = state.proposal; const expectedSignature = state.signature; const context = state.previewContext;
    if (!proposal || !context || expectedSignature !== signature(inputModel())) return;
    const button = document.getElementById('synthesis-create-review-project');
    button.disabled = true; status('Rechecking and creating the separate review project…');
    await new Promise(resolve => window.requestAnimationFrame(resolve));
    if (state.proposal !== proposal || expectedSignature !== signature(inputModel())) { status('Inputs changed. Generate the proposal again.', 'error'); return; }
    const result = createReviewProject(proposal, { expectedContext: context });
    button.disabled = !reviewProjectEligibility(state.proposal).ok;
    if (!result.ok) { status(result.message, 'error'); return; }
    document.getElementById('synthesis-review-project-status').textContent = `Created ${result.name}. Open it from the project manager; the current project is unchanged.`;
    window.projectManager?.refreshProjectWorkspace?.();
    status(`Separate review project created: ${result.name}`, 'success');
  });
  document.getElementById('synthesis-apply')?.addEventListener('click', async () => { if (!state.proposal || state.proposal.status !== 'proposal' || state.signature !== signature(inputModel()) || !state.previewContext) return; const applyButton = document.getElementById('synthesis-apply'); const preview = previewDesignProposal(state.proposal, { expectedContext: state.previewContext }); if (!preview.ok) { const projectRequired = preview.errors.some(item => item.code === 'project_required'); if (projectRequired && window.projectManager?.newProject) { writeProjectSessionValue(PENDING_DRAFT_KEY, { draft: inputModel(), signature: state.signature, generationBaseline: state.generationBaseline }); applyButton.disabled = true; status('A named project is required. Create one in the next dialog; the draft will be regenerated after project readiness.', 'error'); try { const created = await window.projectManager.newProject(); if (created === false) { writeProjectSessionValue(PENDING_DRAFT_KEY, null); applyButton.disabled = false; status('Project creation cancelled. Generate or open a named project before applying.', 'error'); } } catch (error) { writeProjectSessionValue(PENDING_DRAFT_KEY, null); applyButton.disabled = false; status(`Project creation failed: ${error.message}`, 'error'); } return; } status(`Apply blocked: ${preview.errors.concat(preview.conflicts || []).map(item => item.message || item.code).join('; ')}`, 'error'); return; } const result = applyDesignProposal(state.proposal, { previewContext: state.previewContext }); if (!result.applied) { status(`Apply failed: ${(result.errors || []).map(item => item.message || item.code).join('; ')}`, 'error'); return; } status('Applied proposal as one undoable canonical project mutation. Opening Cable Schedule for review.', 'success'); window.setTimeout(() => { window.location.href = 'cableschedule.html?designSynthesisApplied=1'; }, 250); });
  window.addEventListener('storage', () => { state.pendingProjectEquipmentAdoption = null; state.pendingProjectTrayHandoff = null; invalidate('Project data changed. Generate a new proposal.'); invalidateSavedFaultEvolutionEvidence(); renderProjectEquipmentPicker(readDraft()); renderProjectTrayPicker(readDraft()); });
  [...new Set([
    'equipment', 'loads', 'panels', 'cables', 'trays', 'conduits', 'oneLine', 'scenario', 'latestRouteResults',
    STORAGE_KEYS.equipment, STORAGE_KEYS.loads, STORAGE_KEYS.panels, STORAGE_KEYS.cables,
    STORAGE_KEYS.trays, STORAGE_KEYS.conduits, STORAGE_KEYS.ductbanks, STORAGE_KEYS.oneLine,
    STORAGE_KEYS.designBasis, STORAGE_KEYS.projectMeta,
  ])].forEach(eventName => on(eventName, () => { state.pendingProjectEquipmentAdoption = null; state.pendingProjectTrayHandoff = null; invalidate('Project data changed. Generate a new proposal.'); invalidateSavedFaultEvolutionEvidence(); renderProjectEquipmentPicker(readDraft()); renderProjectTrayPicker(readDraft()); }));
  ['projectMeta', FAULT_EVOLUTION_VALIDATION_KEY, 'designSynthesisFaultStudyValidation', 'designSynthesisDeviceFaultValidation', 'designSynthesisDeviceEvidence'].forEach(eventName => on(eventName, invalidateSavedFaultEvolutionEvidence));
  refreshSavedFaultEvolutionEvidence();
}
window.addEventListener('DOMContentLoaded', async () => {
  try {
    mountPersistentNavigation();
    if (!window.__ctrProjectReady) await new Promise(resolve => window.addEventListener('ctr:project-ready', resolve, { once: true }));
    bind();
    window.addEventListener('ctr:project-ready', refreshSavedFaultEvolutionEvidence);
    const pending = readProjectSessionValue(PENDING_DRAFT_KEY, null);
    if (pending?.draft) await restorePendingDraft();
    else {
      const saved = getItem(DRAFT_KEY, null);
      if (saved && typeof saved === 'object') writeDraft(saved);
      else await loadSample();
    }
  } catch (error) {
    document.getElementById('synthesis-initializing').textContent = `Could not prepare the workspace: ${error.message || String(error)}. Reload to try again.`;
    console.error('Design synthesis initialization failed', error);
    return;
  }
  document.getElementById('synthesis-generate').disabled = false;
  document.getElementById('synthesis-workspace-inputs').inert = false;
  document.getElementById('synthesis-initializing').hidden = true;
});


