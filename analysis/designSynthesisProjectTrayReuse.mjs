const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value.trim() : '';
const key = value => String(value ?? '').trim().toLowerCase();

/** Check user-supplied evidence for preliminary reuse; references are not verified. */
export function validateProjectTrayReuseBasis({ adoption, corridors } = {}) {
  const issues = [];
  const add = (code, message) => issues.push({ code, message });
  const evidence = adoption?.reuseEvidence;
  if (!object(adoption) || adoption.schemaVersion !== 'project-trays-v2' || !Array.isArray(adoption.selectedTrayIds)) {
    add('PROJECT_TRAY_REUSE_BINDING_REQUIRED', 'A current reviewed project-tray binding is required.');
    return { ok: false, issues };
  }
  if (adoption.acknowledgements?.replaceGenerated !== true) add('PROJECT_TRAY_REPLACEMENT_BASIS_REQUIRED', 'Confirm that generated cables and routes are uninstalled proposals to be replaced.');
  if (!object(evidence) || Object.keys(evidence).some(name => !['thermalReference', 'installationReference', 'coverageConfirmed'].includes(name)) || evidence.coverageConfirmed !== true || !text(evidence.thermalReference) || !text(evidence.installationReference)) {
    add('PROJECT_TRAY_REUSE_EVIDENCE_REQUIRED', 'Provide references for existing and proposed cable thermal interaction and tray installation suitability, and confirm that they cover all selected trays and the proposed configuration.');
  }
  const edges = Array.isArray(corridors?.edges) ? corridors.edges : [];
  const selected = new Set(adoption.selectedTrayIds.map(key));
  const existing = edges.filter(edge => Object.prototype.hasOwnProperty.call(edge || {}, 'existingTray'));
  if (!existing.length || existing.some(edge => !selected.has(key(edge.id)) || key(edge.id) !== key(edge.existingTray?.trayId))) add('PROJECT_TRAY_REUSE_EDGE_UNREVIEWED', 'Every existing-tray edge must be included in the reviewed project-tray selection.');
  for (const edge of existing) {
    const thermal = edge.thermal;
    if (!object(thermal) || typeof thermal.ambientTempC !== 'number' || !Number.isFinite(thermal.ambientTempC) || thermal.ambientTempC < 0 || thermal.ambientTempC > 90
      || !Number.isSafeInteger(thermal.bundledConductors) || thermal.bundledConductors < 1
      || typeof thermal.solidCoverContinuousLengthFt !== 'number' || !Number.isFinite(thermal.solidCoverContinuousLengthFt) || thermal.solidCoverContinuousLengthFt < 0) {
      add('PROJECT_TRAY_EXPLICIT_THERMAL_BASIS_REQUIRED', `Tray ${edge.id || '(missing)'} requires explicit ambient temperature, grouped-conductor count, and continuous solid-cover length, including zero where appropriate.`);
    }
  }
  return { ok: issues.length === 0, issues };
}
import { fingerprintProjectRecordHex } from '../utils/projectRecordFingerprint.mjs';


/** Bind the stated evidence to the current design inputs, excluding only this
 * binding itself. This is a user-supplied
 * assertion about the referenced evidence, not independent verification. */
export function buildProjectTrayReuseBinding(input = {}) {
  const validation = validateProjectTrayReuseBasis({ adoption: input?.projectTrayAdoption, corridors: input?.corridors });
  if (!validation.ok) return validation;
  try {
    const relevant = { ...input };
    delete relevant.projectTrayReuseBinding;
    return { ok: true, issues: [], binding: { schemaVersion: 'project-tray-reuse-input-v1', inputFingerprint: fingerprintProjectRecordHex(relevant) } };
  } catch {
    return { ok: false, issues: [{ code: 'PROJECT_TRAY_REUSE_INPUT_INVALID', message: 'The referenced tray reuse basis cannot be bound to the current design inputs.' }] };
  }
}

export function validateProjectTrayReuseBinding(input = {}) {
  const built = buildProjectTrayReuseBinding(input);
  if (!built.ok) return built;
  const binding = input?.projectTrayReuseBinding;
  if (!object(binding) || Object.keys(binding).length !== 2 || binding.schemaVersion !== built.binding.schemaVersion || binding.inputFingerprint !== built.binding.inputFingerprint) {
    return { ok: false, issues: [{ code: 'PROJECT_TRAY_REUSE_BINDING_STALE', message: 'Bind the referenced tray reuse basis to the current design inputs before generating or applying.' }] };
  }
  return { ok: true, issues: [] };
}
