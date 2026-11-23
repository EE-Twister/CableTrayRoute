import { fingerprintStudyValue } from './studyLifecycle.mjs';
import { mergeAdoptedProjectRecord } from './designSynthesisProjectEquipment.mjs';

const COLLECTIONS = ['equipment', 'panels', 'loads', 'cables', 'trays', 'conduits'];

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function stableIdentity(record, collection) {
  const marker = record?._designSynthesis;
  return String(marker?.identity || record?.id || record?.ref || record?.tag || `${collection}:${JSON.stringify(record)}`);
}

function marker(record) {
  return record?._designSynthesis && typeof record._designSynthesis === 'object'
    ? record._designSynthesis
    : null;
}

function withoutMarker(record) {
  const copy = clone(record);
  delete copy._designSynthesis;
  return copy;
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameSnapshot(value, snapshot) {
  if (snapshot && typeof snapshot === 'object' && typeof snapshot.fingerprint === 'string') {
    return fingerprintStudyValue(value) === snapshot.fingerprint;
  }
  return same(value, snapshot);
}

function finite(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)); }

function panelLocationOverride(record) {
  const override = record?.locationOverride;
  if (override === undefined) return { present: false, valid: true, value: null };
  const valid = override && finite(override.x) && finite(override.y) && finite(override.z)
    && (override.note === undefined || typeof override.note === 'string');
  return { present: true, valid, value: valid ? { x: Number(override.x), y: Number(override.y), z: Number(override.z) } : null };
}

function withoutPanelLocation(record) {
  const copy = withoutMarker(record);
  delete copy.x;
  delete copy.y;
  delete copy.z;
  return copy;
}

function samePanelLocation(record, location) {
  return location && finite(record?.x) && finite(record?.y) && finite(record?.z)
    && Number(record.x) === location.x && Number(record.y) === location.y && Number(record.z) === location.z;
}

function mirrorMatchesBaseline(mirror, snapshot) {
  if (!mirror || !snapshot) return false;
  if (typeof snapshot.fingerprint === 'string' && fingerprintStudyValue(withoutMarker(mirror)) === snapshot.fingerprint) return true;
  return false;
}

function identityAliases(record, collection) {
  const values = [record?.id, record?.ref, record?.tag, record?.tray_id, record?.trayId];
  return [...new Set(values.filter(value => value !== undefined && value !== null && String(value).trim() !== '')
    .map(value => String(value).trim().toLowerCase()))].map(value => `${collection}:${value}`);
}

/**
 * Compute a safe, deterministic merge of a generated proposal into the
 * canonical project. This function has no storage or DOM dependencies.
 */
export function reconcileDesignProposal({ current = {}, proposal, lastApplied = {}, projectEquipmentAdoption = null } = {}) {
  const result = {
    ok: true,
    conflicts: [],
    errors: [],
    updates: {},
    removed: {},
    added: {},
    next: {},
    snapshot: { records: {}, projectEquipmentAdoption: null },
  };
  if (!proposal || typeof proposal !== 'object') {
    result.ok = false;
    result.errors.push({ code: 'invalid_proposal', message: 'A design proposal is required.' });
    return result;
  }
  const currentPanels = Array.isArray(current.panels) ? current.panels : [];
  const currentEquipment = Array.isArray(current.equipment) ? current.equipment : [];
  const adoptedPairs = Array.isArray(projectEquipmentAdoption?.pairs) ? projectEquipmentAdoption.pairs : [];
  const previousAdoption = lastApplied.projectEquipmentAdoption || {};
  const adoptionSnapshot = {
    bindingFingerprint: projectEquipmentAdoption?.bindingFingerprint || null,
    projectId: projectEquipmentAdoption?.projectId || null,
    scenario: projectEquipmentAdoption?.scenario || null,
    pairs: adoptedPairs.map(pair => ({ equipmentId: pair.equipmentId, loadId: pair.loadId, ...(pair.sourceKind ? { sourceKind: pair.sourceKind } : {}) })),
    records: { equipment: {}, loads: {} },
  };
  const panelOverrides = new Map((Array.isArray(proposal.panels) ? proposal.panels : []).map(panel => [stableIdentity(panel, 'panels'), panelLocationOverride(panel)]));
  currentPanels.forEach(panel => {
    const identity = stableIdentity(panel, 'panels');
    const proposedOverride = panelOverrides.get(identity);
    if (!proposedOverride?.present) return;
    const mirror = currentEquipment.find(record => stableIdentity(record, 'equipment') === identity);
    const mirrorSnapshot = lastApplied.records?.equipment?.[identity];
    const mirrorSelectiveMatch = mirror && mirrorSnapshot?.nonLocationFingerprint && fingerprintStudyValue(withoutPanelLocation(mirror)) === mirrorSnapshot.nonLocationFingerprint && samePanelLocation(mirror, { x: Number(panel.x), y: Number(panel.y), z: Number(panel.z) });
    if (mirror && (!samePanelLocation(panel, { x: Number(mirror.x), y: Number(mirror.y), z: Number(mirror.z) })) && !mirrorMatchesBaseline(mirror, mirrorSnapshot) && !mirrorSelectiveMatch) {
      result.conflicts.push({ code: 'panel_mirror_mismatch', collection: 'panels', identity, message: 'Panel location does not match its equipment mirror.' });
    }
  });
  for (const collection of COLLECTIONS) {
    if (!Array.isArray(proposal[collection])) {
      result.next[collection] = Array.isArray(current[collection]) ? current[collection].map(clone) : [];
      continue;
    }
    const existing = Array.isArray(current[collection]) ? current[collection] : [];
    const generated = Array.isArray(proposal[collection]) ? proposal[collection] : [];
    const oldSnapshots = lastApplied.records?.[collection] || {};
    const byIdentity = new Map();
    const aliases = new Map();
    existing.forEach((record, index) => {
      const identity = stableIdentity(record, collection);
      if (byIdentity.has(identity)) result.conflicts.push({ code: 'duplicate_current_identity', collection, identity });
      byIdentity.set(identity, { record, index });
      for (const alias of identityAliases(record, collection)) {
        if (aliases.has(alias) && aliases.get(alias).index !== index) result.conflicts.push({ code: 'duplicate_current_alias', collection, alias });
        aliases.set(alias, { record, index });
      }
    });
    const seen = new Set();
    const seenAliases = new Set();
    const next = existing.map(clone);
    result.snapshot.records[collection] = {};

    generated.forEach((sourceRecord, generatedIndex) => {
      const identity = stableIdentity(sourceRecord, collection);
      if (seen.has(identity)) {
        result.conflicts.push({ code: 'duplicate_proposal_identity', collection, identity, generatedIndex });
        return;
      }
      seen.add(identity);
      for (const alias of identityAliases(sourceRecord, collection)) {
        if (seenAliases.has(alias)) result.conflicts.push({ code: 'duplicate_proposal_alias', collection, alias });
        seenAliases.add(alias);
      }
      const source = withoutMarker(sourceRecord);
      const adoptedPair = collection === 'equipment'
        ? adoptedPairs.find(pair => String(pair.equipmentId) === identity)
        : collection === 'loads'
          ? adoptedPairs.find(pair => String(pair.loadId) === identity)
          : null;
      const sourceOverride = collection === 'panels' ? panelLocationOverride(sourceRecord) : panelOverrides.get(identity) || { present: false, valid: true, value: null };
      if (!sourceOverride.valid) {
        result.conflicts.push({ code: 'invalid_panel_location_override', collection, identity, message: 'Panel location override requires finite x, y, and z coordinates.' });
        return;
      }
      const prior = byIdentity.get(identity);
      const priorMarker = prior && marker(prior.record);
      const priorSnapshot = oldSnapshots[identity];
      const nextRecord = {
        ...clone(source),
        _designSynthesis: {
          ...(marker(sourceRecord) || {}),
          identity,
          collection,
          source: marker(sourceRecord)?.source || 'design-synthesis',
        },
      };
      result.snapshot.records[collection][identity] = { fingerprint: fingerprintStudyValue(withoutMarker(nextRecord)) };

      if (prior) {
        const isGenerated = Boolean(priorMarker);
        if (!isGenerated && adoptedPair && ['equipment', 'loads'].includes(collection)) {
          const otherAlias = identityAliases(source, collection)
            .map(alias => aliases.get(alias))
            .find(entry => entry && entry.index !== prior.index);
          if (otherAlias) {
            result.conflicts.push({ code: 'project_equipment_adoption_alias_collision', collection, identity, message: `Adopted ${collection} identity ${identity} also aliases a different project record.` });
            return;
          }
          const priorRecordAdoption = previousAdoption.records?.[collection]?.[identity] || null;
          const merged = mergeAdoptedProjectRecord({ current: prior.record, generated: source, collection, priorAdoption: priorRecordAdoption });
          if (!merged.ok) {
            result.conflicts.push(merged.issue);
            return;
          }
          if (!priorRecordAdoption) {
            const expectedFingerprint = collection === 'equipment' ? adoptedPair.equipmentFingerprint : adoptedPair.loadFingerprint;
            if (fingerprintStudyValue(prior.record) !== expectedFingerprint) {
              result.conflicts.push({ code: 'project_equipment_adoption_source_changed', collection, identity, message: `Adopted ${collection} record ${identity} changed after its exact-record review.` });
              return;
            }
          }
          if (!same(prior.record, merged.record)) {
            next[prior.index] = merged.record;
            (result.updates[collection] ||= []).push(identity);
          }
          adoptionSnapshot.records[collection][identity] = {
            equipmentId: adoptedPair.equipmentId,
            loadId: adoptedPair.loadId,
            fields: merged.adoption.fields,
          };
          return;
        }
        if (isGenerated && !priorSnapshot) {
          result.conflicts.push({ code: 'unproven_generated_ownership', collection, identity });
          return;
        }
        const isUserChange = isGenerated && priorSnapshot && !sameSnapshot(withoutMarker(prior.record), priorSnapshot);
        if (!isGenerated) {
          result.conflicts.push({ code: 'user_record_collision', collection, identity, field: 'identity' });
          return;
        }
        const acceptedPanelOverride = isUserChange && sourceOverride.present && sourceOverride.valid && sourceOverride.value
          && samePanelLocation(prior.record, sourceOverride.value)
          && sourceOverride.value.x === Number(source.x) && sourceOverride.value.y === Number(source.y) && sourceOverride.value.z === Number(source.z)
          && typeof priorSnapshot.nonLocationFingerprint === 'string'
          && fingerprintStudyValue(withoutPanelLocation(prior.record)) === priorSnapshot.nonLocationFingerprint;
        if (isUserChange && !acceptedPanelOverride) {
          result.conflicts.push({ code: 'generated_record_modified', collection, identity, message: 'A generated record was manually changed.' });
          return;
        }
        if (!same(prior.record, nextRecord)) {
          next[prior.index] = nextRecord;
          (result.updates[collection] ||= []).push(identity);
        }
          return;
      }
      // A same-tag/ref user record may have a different id. Treat it as a
      // collision because generated synthesis must never silently overwrite it.
      const collision = existing.find(record => !marker(record) && identityAliases(record, collection)
        .some(alias => identityAliases(source, collection).includes(alias)));
      if (collision) {
        result.conflicts.push({ code: 'user_record_collision', collection, identity, field: source.tag ? 'tag' : 'ref' });
        return;
      }
      next.push(nextRecord);
      (result.added[collection] ||= []).push(identity);
    });

      existing.forEach((record, index) => {
      const identity = stableIdentity(record, collection);
      if (!marker(record)) {
        const previousRecordAdoption = previousAdoption.records?.[collection]?.[identity];
        if (!previousRecordAdoption || seen.has(identity) || !['equipment', 'loads'].includes(collection)) return;
        const restored = mergeAdoptedProjectRecord({ current: record, generated: {}, collection, priorAdoption: previousRecordAdoption });
        if (!restored.ok) {
          result.conflicts.push(restored.issue);
          return;
        }
        if (!same(record, restored.record)) {
          next[index] = restored.record;
          (result.updates[collection] ||= []).push(identity);
        }
        return;
      }
      if (seen.has(identity)) return;
      const priorSnapshot = oldSnapshots[identity];
      if (!priorSnapshot) {
        result.conflicts.push({ code: 'unproven_generated_ownership', collection, identity });
        return;
      }
      if (priorSnapshot && !sameSnapshot(withoutMarker(record), priorSnapshot)) {
        result.conflicts.push({ code: 'obsolete_generated_modified', collection, identity, message: 'An obsolete generated record was manually changed.' });
        return;
      }
      next[index] = null;
      (result.removed[collection] ||= []).push(identity);
    });
    result.next[collection] = next.filter(Boolean);
  }
  adoptionSnapshot.records.equipment = adoptionSnapshot.records.equipment || {};
  adoptionSnapshot.records.loads = adoptionSnapshot.records.loads || {};
  if (adoptedPairs.length || Object.values(previousAdoption.records || {}).some(rows => Object.keys(rows || {}).length)) {
    result.snapshot.projectEquipmentAdoption = adoptionSnapshot;
  }
  result.ok = result.conflicts.length === 0 && result.errors.length === 0;
  return result;
}

/** Return generated panel locations that can be safely offered as explicit overrides. */
export function getPanelLocationOverrideCandidates({ current = {}, lastApplied = {} } = {}) {
  const panels = Array.isArray(current.panels) ? current.panels : [];
  const equipment = Array.isArray(current.equipment) ? current.equipment : [];
  const snapshots = lastApplied.records?.panels || {};
  return panels.flatMap(panel => {
    const identity = stableIdentity(panel, 'panels');
    const snapshot = snapshots[identity];
    if (!marker(panel) || !snapshot || typeof snapshot.nonLocationFingerprint !== 'string' || !finite(panel.x) || !finite(panel.y) || !finite(panel.z)) return [];
    if (fingerprintStudyValue(withoutPanelLocation(panel)) !== snapshot.nonLocationFingerprint) return [];
    const mirror = equipment.find(record => stableIdentity(record, 'equipment') === identity);
    const mirrorSnapshot = lastApplied.records?.equipment?.[identity];
    const mirrorSelectiveMatch = mirror && mirrorSnapshot?.nonLocationFingerprint && fingerprintStudyValue(withoutPanelLocation(mirror)) === mirrorSnapshot.nonLocationFingerprint && samePanelLocation(mirror, { x: Number(panel.x), y: Number(panel.y), z: Number(panel.z) });
    if (mirror && !mirrorMatchesBaseline(mirror, mirrorSnapshot) && !mirrorSelectiveMatch) return [];
    return [{ panelId: identity, location: { x: Number(panel.x), y: Number(panel.y), z: Number(panel.z) }, override: { x: Number(panel.x), y: Number(panel.y), z: Number(panel.z) } }];
  });
}

export { COLLECTIONS, stableIdentity };
