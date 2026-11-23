import { collectNearestDirectionalDeviceUids } from '../tccContext.mjs';
import {
  evaluateDamageLimitConstraint,
  evaluateRideThroughConstraint
} from './equipmentCurveConstraintModel.mjs';

export { evaluateDamageLimitConstraint, evaluateRideThroughConstraint } from './equipmentCurveConstraintModel.mjs';

export const PROTECTIVE_DEVICE_TYPES = Object.freeze([
  'breaker',
  'fuse',
  'relay',
  'relay_87',
  'recloser',
  'contactor',
  'switch'
]);
const PROTECTIVE_TYPE_SET = new Set(PROTECTIVE_DEVICE_TYPES);
const EQUIPMENT_OVERLAY_KINDS = new Set(['cable', 'inrush', 'transformerDamage', 'motorStart', 'motorThermal']);

function normalizeProtectionType(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isProtectiveEntry(entry) {
  return isProtectiveDeviceType(entry?.selection?.baseDevice?.type);
}

function isComponentBoundProtectiveEntry(entry, componentDeviceUidMap) {
  const selection = entry?.selection;
  const componentId = selection?.componentId ? String(selection.componentId) : '';
  if (!componentId || selection?.kind !== 'component' || !isProtectiveEntry(entry)) return false;
  return componentDeviceUidMap?.get(componentId) === selection.uid;
}

function equipmentAssociationComponentId(overlay) {
  const value = overlay?.kind === 'cable' ? overlay?.targetId : overlay?.sourceId;
  return value ? String(value) : '';
}

function constraintKind(overlay) {
  return overlay?.kind === 'inrush' || overlay?.kind === 'motorStart'
    ? 'rideThrough'
    : 'damageLimit';
}

function buildAssociationReview(overlay, associationReason, associatedDeviceUids = []) {
  return {
    kind: constraintKind(overlay),
    status: 'review',
    screeningStatus: 'unknown',
    associationReason,
    associatedDeviceUids,
    overlay,
    entry: null
  };
}

export function resolveEquipmentProtectiveEntry(
  overlay,
  plotted = [],
  { componentFlowMap, componentDeviceUidMap, depthLimit = 4 } = {}
) {
  const componentId = equipmentAssociationComponentId(overlay);
  if (!componentId) {
    return { entry: null, reason: 'missing_equipment_reference', deviceUids: [] };
  }

  const nearestUids = [...collectNearestDirectionalDeviceUids(
    componentId,
    componentFlowMap,
    componentDeviceUidMap,
    'upstream',
    depthLimit
  )];
  if (!nearestUids.length) {
    return { entry: null, reason: 'no_nearest_upstream_device', deviceUids: [] };
  }
  if (nearestUids.length !== 1) {
    return { entry: null, reason: 'ambiguous_nearest_upstream_devices', deviceUids: nearestUids };
  }

  const uid = nearestUids[0];
  const matches = plotted.filter(entry => (
    entry?.selection?.uid === uid
    && isComponentBoundProtectiveEntry(entry, componentDeviceUidMap)
  ));
  if (!matches.length) {
    return { entry: null, reason: 'associated_device_not_plotted', deviceUids: nearestUids };
  }
  if (matches.length !== 1) {
    return { entry: null, reason: 'ambiguous_plotted_device', deviceUids: nearestUids };
  }
  return { entry: matches[0], reason: null, deviceUids: nearestUids };
}

export function isProtectiveDeviceType(value) {
  return PROTECTIVE_TYPE_SET.has(normalizeProtectionType(value));
}

export function evaluateEquipmentConstraints(plotted = [], overlays = [], associationContext = {}) {
  return overlays
    .filter(entry => EQUIPMENT_OVERLAY_KINDS.has(entry.kind))
    .map(overlay => {
      const association = resolveEquipmentProtectiveEntry(overlay, plotted, associationContext);
      if (!association.entry) {
        return buildAssociationReview(overlay, association.reason, association.deviceUids);
      }
      let evaluation;
      if (overlay.kind === 'inrush' || overlay.kind === 'motorStart') {
        evaluation = evaluateRideThroughConstraint(overlay, association.entry);
      } else {
        evaluation = evaluateDamageLimitConstraint(overlay, association.entry);
      }
      return evaluation || {
        ...buildAssociationReview(overlay, 'constraint_data_incomplete', association.deviceUids),
        entry: association.entry
      };
    })
    .filter(Boolean);
}
