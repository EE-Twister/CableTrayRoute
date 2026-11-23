import {
  calculateCableThermalRating,
} from '../../analysis/cableThermalModel.mjs';
import {
  captureStudyRunContext,
  getStudyAssessment,
  getStudies,
  on,
  saveStudyResult,
} from '../../dataStore.mjs';
import { studyLifecycleMetadataRows } from '../../analysis/studyExportMetadata.mjs';

const STUDY_KEY = 'cableThermalDetailed';
const FORM_ID = 'cable-thermal-detailed-form';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = (value, fallback = '') => value === null || value === undefined || value === '' ? fallback : (Number.isFinite(Number(value)) ? String(value) : fallback);

function input(label, name, value, attrs = '') {
  return `<label>${esc(label)}<input data-thermal-field="${esc(name)}" name="${esc(name)}" type="number" step="any" value="${esc(number(value))}" ${attrs}></label>`;
}

function profileValue(profile, path) {
  return path.split('.').reduce((value, key) => value?.[key], profile);
}

function parseProfileForm(form, profile) {
  const value = name => String(form.elements[name]?.value ?? '').trim();
  const n = name => { const raw = value(name); if (!raw) throw new Error(`${name} is required.`); const parsed = Number(raw); if (!Number.isFinite(parsed)) throw new Error(`${name} must be finite.`); return parsed; };
  const cable = { ...profile.cable, sizeMm2: n('sizeMm2'), maxTempC: n('maxTempC'), acResistanceOhmPerKm: n('acResistanceOhmPerKm'), acResistanceTempC: n('acResistanceTempC'), acResistanceFrequencyHz: n('acResistanceFrequencyHz'), dielectricLossWPerM: n('dielectricLossWPerM'), lambdaSheath: n('lambdaSheath'), outerDiameterMm: n('outerDiameterMm'), jacketInnerDiameterMm: n('jacketInnerDiameterMm'), jacketResistivityKmPerW: n('jacketResistivityKmPerW') };
  cable.material = value('material');
  cable.metallicSheath = form.elements.metallicSheath.checked;
  cable.insulationLayers = Array.from(form.querySelectorAll('[data-layer-row]')).map(row => ({ name: row.querySelector('[data-layer-name]').value.trim(), innerDiameterMm: nLayer(row, 'data-layer-inner'), outerDiameterMm: nLayer(row, 'data-layer-outer'), resistivityKmPerW: nLayer(row, 'data-layer-rho') }));
  function nLayer(row, attribute) { const raw = row.querySelector(`[${attribute}]`)?.value?.trim(); const parsed = Number(raw); if (!raw || !Number.isFinite(parsed)) throw new Error(`Insulation layer ${attribute} is required.`); return parsed; }
  return { cable, installation: { formation: value('formation'), burialDepthMm: n('burialDepthMm'), spacingMm: value('spacingMm') === '' ? null : n('spacingMm'), soilResistivityKmPerW: n('soilResistivityKmPerW'), ambientTempC: n('ambientTempC'), frequencyHz: n('frequencyHz') } };
}

function renderResult(target, result, profile = null, isReference = false) {
  const temps = result.temperatures.conductorCByPhase.map((temp, index) => `<tr><td>Phase ${index + 1}</td><td>${temp.toFixed(2)} °C</td><td>${result.temperatures.sheathCByPhase?.[index]?.toFixed(2) || '—'} °C</td><td>${result.temperatures.surfaceCByPhase?.[index]?.toFixed(2) || '—'} °C</td><td>${result.thermalResistances.T4EffectiveByCable_KmPerW[index].toFixed(4)} K·m/W</td></tr>`).join('');
  const losses = result.losses || {};
  const totalLoss = losses.totalLossWPerM ?? losses.phaseHeatWPerM ?? 0;
  target.hidden = false;
  const reference = profile?.reference?.ampacityA ? `<p class="field-hint">${isReference ? `Published reference comparison: ${profile.reference.ampacityA.toFixed(2)} A (Δ ${(result.ampacityA - profile.reference.ampacityA).toFixed(2)} A)` : 'Customized inputs: published profile ampacity is not presented as the calculated result.'}</p>` : '';
  target.innerHTML = `<p class="field-hint">Screening only; specified losses and geometry are used without arbitrary bonding or voltage calculation.</p>${reference}<p><strong>Limiting current:</strong> ${result.ampacityA.toFixed(2)} A (phase ${result.limitingPhase + 1})</p><table><thead><tr><th>Phase</th><th>Conductor</th><th>Sheath</th><th>Surface</th><th>T4 effective</th></tr></thead><tbody>${temps}</tbody></table><p>Thermal breakdown: T1 ${result.thermalResistances.T1_KmPerW.toFixed(4)}, T3 ${result.thermalResistances.T3effective_KmPerW.toFixed(4)}, T4 max ${Math.max(...result.thermalResistances.T4EffectiveByCable_KmPerW).toFixed(4)} K·m/W; Wc ${(losses.conductorLossWPerM ?? 0).toFixed(4)} W/m, Ws ${(losses.sheathLossWPerM ?? 0).toFixed(4)} W/m, Wd ${(losses.dielectricLossWPerM ?? 0).toFixed(4)} W/m, total ${totalLoss.toFixed(4)} W/m.</p><details><summary>Sources and limitations</summary><ul>${[...(result.assumptions || []), `Source profile: ${result.provenance?.source?.id || result.provenance?.source?.profileId || 'user-entered'}`].map(item => `<li>${esc(item)}</li>`).join('')}</ul></details>`;
}

function csvForResult(result, assessment = {}) {
  const rows = [
    ...studyLifecycleMetadataRows(result, { assessment }),
    ['studyKey', STUDY_KEY], ['readiness', result.readiness], ['isReferenceProfile', result.isReferenceProfile === true], ['sourceProfileId', result.provenance?.source?.profileId || result.provenance?.source?.id || ''], ['sourceProfileSourceIds', JSON.stringify(result.provenance?.source?.sourceIds || [])], ['sourceProfileUrl', result.provenance?.source?.url || ''], ['sourceProfileReferenceUrls', JSON.stringify(result.provenance?.source?.referenceUrls || result.provenance?.source?.urls || [])], ['normalizedInputJson', JSON.stringify(result.normalizedInputs)], ['lossesJson', JSON.stringify(result.losses)], ['thermalResistancesJson', JSON.stringify(result.thermalResistances)], ['phasePositionsMm', JSON.stringify(result.phasePositionsMm || [])], ['limitingCurrentA', result.ampacityA], ['limitingPhase', result.limitingPhase], ['temperaturesJson', JSON.stringify(result.temperatures)]
  ];
  return rows.map(row => row.map(cell => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
}

export function initCableThermalPanel({ profiles = null, manufacturerRecords = [], manufacturerRecordConditions = null } = {}) {
  const section = document.getElementById('cable-thermal-detailed');
  if (!section || section.dataset.thermalInitialized === 'true') return null;
  section.dataset.thermalInitialized = 'true';
  const available = (Array.isArray(profiles) ? profiles : []).map(profile => ({
    ...profile,
    cable: { ...profile.cable, source: profile.cable?.source || { id: profile.sourceIds?.[0] || profile.id, url: profile.sourceUrl || '' } },
  }));
  if (!available.length) {
    section.insertAdjacentHTML('beforeend', '<p role="alert">Published thermal reference profiles could not be loaded. No calculation preset is available.</p>');
    return null;
  }
  const saved = getStudies()?.[STUDY_KEY];
  section.innerHTML = `<h2 id="cable-thermal-detailed-heading">Detailed direct-burial cable thermal screen</h2><p class="field-hint">Thermal-only screening with specified losses and editable construction layers. Published profiles are comparison references, not complete commercial model presets.</p><form id="${FORM_ID}" novalidate><div class="field-row"><label for="thermal-profile">Reference profile</label><select id="thermal-profile" name="profileId">${available.map(p => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('')}</select><p id="thermal-profile-source" class="field-hint"></p></div><fieldset><legend>Cable properties</legend><div class="field-row">${input('Size (mm²)', 'sizeMm2')}<label>Material<select name="material"><option value="Cu">Copper (Cu)</option><option value="Al">Aluminium (Al)</option></select></label>${input('Maximum conductor temperature (°C)', 'maxTempC', '', 'required')}${input('AC resistance (Ω/km)', 'acResistanceOhmPerKm', '', 'required')}${input('Resistance temperature (°C)', 'acResistanceTempC', '', 'required')}${input('Resistance frequency (Hz)', 'acResistanceFrequencyHz', '', 'required')}${input('Dielectric loss (W/m)', 'dielectricLossWPerM', '', 'required')}${input('Sheath loss factor λ', 'lambdaSheath', '', 'required')}${input('Outer diameter (mm)', 'outerDiameterMm', '', 'required')}${input('Jacket inner diameter (mm)', 'jacketInnerDiameterMm', '', 'required')}${input('Jacket resistivity (K·m/W)', 'jacketResistivityKmPerW', '', 'required')}<label><input type="checkbox" name="metallicSheath"> Metallic sheath</label></div><table><caption>Insulation layers</caption><thead><tr><th>Name</th><th>Inner diameter (mm)</th><th>Outer diameter (mm)</th><th>Resistivity (K·m/W)</th><th>Action</th></tr></thead><tbody id="thermal-layers"></tbody></table><button type="button" class="btn" id="thermal-add-layer-btn">Add insulation layer</button></fieldset><fieldset><legend>Direct burial installation</legend><div class="field-row"><label>Formation<select name="formation"><option value="isolated">Isolated</option><option value="flat-spaced">Flat spaced</option><option value="trefoil-spaced">Trefoil spaced</option><option value="trefoil-touching">Trefoil touching</option></select></label>${input('Mean cable centre depth (mm)', 'burialDepthMm', '', 'required')}${input('Centre spacing (mm)', 'spacingMm')}${input('Soil resistivity (K·m/W)', 'soilResistivityKmPerW', '', 'required')}${input('Ambient temperature (°C)', 'ambientTempC', '', 'required')}${input('Frequency (Hz)', 'frequencyHz', '', 'required')}</div></fieldset><div class="button-row"><button type="button" class="btn" id="thermal-run-btn">Run thermal screen</button><button type="button" class="btn" id="thermal-export-csv-btn" disabled>Export CSV</button></div><div id="thermal-input-error" role="alert" hidden></div></form><div id="thermal-results" class="results-panel" role="region" aria-live="polite" hidden></div>`;
  const form = document.getElementById(FORM_ID);
  const layers = document.getElementById('thermal-layers');
  const results = document.getElementById('thermal-results');
  const error = document.getElementById('thermal-input-error');
  if (manufacturerRecords.length) {
    const sourceUrl = manufacturerRecords[0]?.sourceUrl || manufacturerRecords[0]?.url || '';
    const conditions = manufacturerRecordConditions || {};
    const conditionText = `formation ${conditions.formation || '—'}, soil ${conditions.soilResistivityKmPerW ?? '—'} K·m/W, burial ${conditions.burialDepthMm ?? '—'} mm, ground ${conditions.groundTempC ?? '—'} °C, frequency ${conditions.frequencyHz ?? '—'} Hz, maximum conductor temperature ${conditions.maxConductorTempC ?? '—'} °C`;
    section.insertAdjacentHTML('beforeend', `<details class="field-hint"><summary>Manufacturer source-only records</summary><p>These records are reference data only and are not complete thermal-model presets.</p>${sourceUrl ? `<p><a href="${esc(sourceUrl)}" target="_blank" rel="noreferrer">Manufacturer source datasheet</a></p>` : ''}<table><thead><tr><th>Record</th><th>Size</th><th>Rac at 90 °C</th><th>Dielectric loss</th><th>Published buried ampacity</th></tr></thead><tbody>${manufacturerRecords.map(record => `<tr><td>${esc(record.label || record.id)}</td><td>${esc(record.sizeMm2)} mm²</td><td>${esc(record.acResistance90OhmPerKm)} Ω/km</td><td>${esc(record.dielectricLossWPerKm)} W/km</td><td>${esc(record.publishedBuriedAmpacityA)} A</td></tr>`).join('')}</tbody></table><p>Common conditions: ${esc(conditionText)}.</p><p>Missing inputs: ${esc(conditions.missingInputs?.join('; ') || 'Missing construction and bonding inputs.')}</p></details>`);
  }
  let currentResult = null;
  let saving = false;
  function renderLayers(layerValues) {
    layers.innerHTML = layerValues.map((layer, index) => `<tr data-layer-row><td><label class="sr-only" for="thermal-layer-name-${index}">Layer ${index + 1} name</label><input id="thermal-layer-name-${index}" data-layer-name value="${esc(layer.name)}"></td><td><label class="sr-only" for="thermal-layer-inner-${index}">Layer ${index + 1} inner diameter</label><input id="thermal-layer-inner-${index}" data-layer-inner type="number" step="any" value="${esc(layer.innerDiameterMm)}"></td><td><label class="sr-only" for="thermal-layer-outer-${index}">Layer ${index + 1} outer diameter</label><input id="thermal-layer-outer-${index}" data-layer-outer type="number" step="any" value="${esc(layer.outerDiameterMm)}"></td><td><label class="sr-only" for="thermal-layer-rho-${index}">Layer ${index + 1} resistivity</label><input id="thermal-layer-rho-${index}" data-layer-rho type="number" step="any" value="${esc(layer.resistivityKmPerW)}"></td><td><button type="button" class="btn thermal-remove-layer-btn" aria-label="Remove layer ${index + 1}">Remove</button></td></tr>`).join('');
    layers.querySelectorAll('.thermal-remove-layer-btn').forEach(button => button.addEventListener('click', () => { button.closest('tr').remove(); form.querySelector('input[data-thermal-field]')?.dispatchEvent(new Event('input', { bubbles: true })); }));
  }
  function showProfile(id) {
    const profile = available.find(item => item.id === id) || available[0];
    form.elements.material.value = profile.cable.material;
    ['sizeMm2', 'maxTempC', 'acResistanceOhmPerKm', 'acResistanceTempC', 'acResistanceFrequencyHz', 'dielectricLossWPerM', 'lambdaSheath', 'outerDiameterMm', 'jacketInnerDiameterMm', 'jacketResistivityKmPerW'].forEach(key => { form.elements[key].value = number(profileValue(profile, `cable.${key}`)); });
    form.elements.formation.value = profile.installation.formation;
    ['burialDepthMm', 'spacingMm', 'soilResistivityKmPerW', 'ambientTempC', 'frequencyHz'].forEach(key => { form.elements[key].value = number(profileValue(profile, `installation.${key}`)); });
    form.elements.metallicSheath.checked = profile.cable.metallicSheath === true;
    renderLayers(profile.cable.insulationLayers);
    const source = profile.reference?.urls?.join(', ') || profile.cable.source?.urls?.join(', ') || profile.cable.source?.url || 'Source not supplied';
    const evidence = String(profile.evidenceClass || 'reference').replaceAll('_', ' ');
    const publisher = profile.cable.source?.sourceRecords?.[0]?.publisher || 'Published source';
    document.getElementById('thermal-profile-source').innerHTML = `${esc(evidence)} — ${esc(publisher)} — <a href="${esc(profile.reference?.urls?.[0] || profile.cable.source?.url || '#')}" target="_blank" rel="noreferrer">Published source</a>`;
    markStale();
  }
  document.getElementById('thermal-add-layer-btn').addEventListener('click', () => { renderLayers([...Array.from(layers.querySelectorAll('[data-layer-row]')).map(row => ({ name: row.querySelector('[data-layer-name]').value, innerDiameterMm: row.querySelector('[data-layer-inner]').value, outerDiameterMm: row.querySelector('[data-layer-outer]').value, resistivityKmPerW: row.querySelector('[data-layer-rho]').value })), { name: 'new layer', innerDiameterMm: '', outerDiameterMm: '', resistivityKmPerW: '' }]); form.querySelector('input[data-thermal-field]')?.dispatchEvent(new Event('input', { bubbles: true })); });
  function markStale() { if (currentResult) { results.hidden = false; results.insertAdjacentHTML('afterbegin', '<p class="field-hint">Inputs changed; displayed result is stale. Run again before exporting.</p>'); } currentResult = null; document.getElementById('thermal-export-csv-btn').disabled = true; }
  form.addEventListener('input', event => { if (event.target.name !== 'profileId') markStale(); });
  document.getElementById('thermal-profile').addEventListener('change', event => showProfile(event.target.value));
  document.getElementById('thermal-run-btn').addEventListener('click', () => {
    error.hidden = true;
    try {
      const profile = available.find(item => item.id === form.elements.profileId.value) || available[0];
      const inputs = parseProfileForm(form, profile);
      inputs.cable.source = { ...(profile.cable.source || {}), profileId: profile.id, sourceIds: profile.sourceIds || [profile.cable.source?.id || profile.id], referenceUrls: profile.reference?.urls || [] };
      const computational = value => JSON.stringify({ cable: { ...value.cable, source: undefined, metadata: undefined, assumptions: undefined, modelLimits: undefined }, installation: value.installation });
      const isReference = computational(inputs) === computational(profile);
      const runContext = captureStudyRunContext(STUDY_KEY, { inputs, options: { profileId: profile.id }, dependencies: [] });
      currentResult = calculateCableThermalRating(inputs);
      currentResult.profileId = profile.id;
      currentResult.timestamp = Date.now();
      currentResult.isReferenceProfile = isReference;
      saving = true;
      try { saveStudyResult(STUDY_KEY, currentResult, runContext); } finally { saving = false; }
      renderResult(results, currentResult, profile, isReference);
      document.getElementById('thermal-export-csv-btn').disabled = false;
    } catch (err) { currentResult = null; results.hidden = true; document.getElementById('thermal-export-csv-btn').disabled = true; error.textContent = err.message || 'Thermal inputs require review.'; error.hidden = false; }
  });
  const invalidate = () => { currentResult = null; document.getElementById('thermal-export-csv-btn').disabled = true; if (!results.hidden) results.insertAdjacentHTML('afterbegin', '<p class="field-hint">Active project or scenario changed; displayed result is historical until rerun.</p>'); };
  const clearForStoreChange = () => { if (saving) return; invalidate(); };
  const clearForStudyResultsChange = detail => { if (saving) return; const active = detail?.[STUDY_KEY] || getStudies()?.[STUDY_KEY]; if (active && currentResult && JSON.stringify(active) === JSON.stringify(currentResult)) return; if (!active && !currentResult) return; invalidate(); };
  on('scenario', clearForStoreChange);
  on('studyResults', clearForStudyResultsChange);
  on('projectMeta', clearForStoreChange);
  document.getElementById('thermal-export-csv-btn').addEventListener('click', () => { const assessment = getStudyAssessment(STUDY_KEY); const active = getStudies()?.[STUDY_KEY]; if (!currentResult || !active || JSON.stringify(active) !== JSON.stringify(currentResult) || !assessment?.eligible) return; const blob = new Blob([csvForResult(currentResult, assessment)], { type: 'text/csv' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'cable-thermal-detailed.csv'; link.click(); URL.revokeObjectURL(link.href); });
  showProfile(saved?.profileId || available[0].id);
  if (saved?.normalizedInputs || saved?.ampacityA) { const restored = saved.normalizedInputs; if (restored) { const profile = available.find(item => item.id === saved.profileId) || available[0]; form.elements.profileId.value = profile.id; showProfile(profile.id); const source = restored.cable; ['sizeMm2', 'maxTempC', 'acResistanceOhmPerKm', 'acResistanceTempC', 'acResistanceFrequencyHz', 'dielectricLossWPerM', 'lambdaSheath', 'outerDiameterMm', 'jacketInnerDiameterMm', 'jacketResistivityKmPerW'].forEach(key => { form.elements[key].value = number(source[key]); }); form.elements.material.value = source.material; form.elements.metallicSheath.checked = source.metallicSheath === true; renderLayers(source.insulationLayers); Object.entries(restored.installation).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = key === 'formation' ? String(value) : number(value); }); } renderResult(results, saved, null, false); results.insertAdjacentHTML('afterbegin', '<p class="field-hint">Historical result shown as stale until inputs are run again.</p>'); document.getElementById('thermal-export-csv-btn').disabled = true; }
  return { studyKey: STUDY_KEY, form, getCurrentResult: () => currentResult };
}

export { csvForResult };

