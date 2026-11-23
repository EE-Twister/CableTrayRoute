import { exactStoredValueEqual, resolveReferencedDeviceEvidence } from '../design-synthesis/deviceEvidence.mjs';
import { fingerprintStudyValue } from '../../analysis/studyLifecycle.mjs';

const key = value => value === undefined || value === null ? '' : String(value).trim().toLowerCase();
const identities = values => [...new Set(values.map(key).filter(Boolean))];
const componentIds = component => identities([
  component?.id, component?.tag, component?.ref, component?.label,
  component?.physical?.id, component?.physical?.tag,
  component?.scheduleLinks?.ref, component?.scheduleLinks?.label,
  component?.scheduleLinks?.equipmentRef, component?.scheduleLinks?.panelRef, component?.scheduleLinks?.loadRef,
]);
const cableIds = cable => identities([cable?.id, cable?.circuitId, cable?.tag]);
const hasValue = value => value !== undefined && value !== null && String(value).trim() !== '';

function endMatches(component, values) {
  const expected = componentIds(component);
  const supplied = values.filter(hasValue).map(key);
  return expected.length > 0 && supplied.length > 0 && supplied.every(value => expected.includes(value));
}

/** Resolve a selected connection against the current cable schedule, without writing it. */
export function resolveConnectionProtection({ source, target, connection, cables, evidence } = {}) {
  const generated = source?.meta?.source === 'design-synthesis' || source?._designSynthesis != null;
  const refs = identities([
    connection?.circuitId, connection?.cableId, connection?.cableRef,
    connection?.cable?.id, connection?.cable?.tag,
    connection?.scheduleLinks?.cableRef, connection?.scheduleLinks?.cable,
  ]);
  if (!refs.length) return null;
  const matches = (Array.isArray(cables) ? cables : []).filter(cable => cableIds(cable).some(id => refs.includes(id)));
  if (matches.length !== 1 || !refs.every(ref => cableIds(matches[0]).includes(ref))) {
    return generated ? { status: 'cable-unresolved' } : null;
  }
  const cable = matches[0];
  if (!endMatches(source, [cable.from, cable.from_id, cable.from_tag, connection?.cable?.from, connection?.cable?.from_id, connection?.cable?.from_tag, connection?.from]) ||
      !endMatches(target, [cable.to, cable.to_id, cable.to_tag, connection?.cable?.to, connection?.cable?.to_id, connection?.cable?.to_tag, connection?.target])) {
    return generated || cable.protectiveDevice ? { status: 'endpoint-mismatch' } : null;
  }
  const summary = cable.motor?.starterCandidateSummary;
  const reference = cable.motor?.starterCandidateEvidenceRef;
  const savedSummary = typeof reference === 'string' && evidence && Object.prototype.hasOwnProperty.call(evidence, reference) ? evidence[reference] : null;
  const validSummary = summary && savedSummary && typeof summary === 'object' && !Array.isArray(summary)
    && fingerprintStudyValue(savedSummary) === reference && exactStoredValueEqual(summary, savedSummary);
  const motorCandidate = validSummary ? summary : null;
  const motorCandidateUnavailable = Boolean(summary || reference) && !motorCandidate;
  if (!cable.protectiveDevice && !hasValue(cable.protectiveDeviceEvidenceRef)) return motorCandidate || motorCandidateUnavailable ? { status: 'motor-candidate', cableTag: cable.tag || cable.id, motorCandidate, motorCandidateUnavailable, generated } : null;
  if (!hasValue(cable.protectiveDeviceEvidenceRef)) return { status: 'evidence-unavailable', cableTag: cable.tag || cable.id, motorCandidate, motorCandidateUnavailable };
  const device = resolveReferencedDeviceEvidence(cable.protectiveDeviceEvidenceRef, cable.protectiveDevice, evidence);
  if (!device) return { status: 'evidence-unavailable', cableTag: cable.tag || cable.id, motorCandidate, motorCandidateUnavailable };
  return { status: 'candidate', cableTag: cable.tag || cable.id, device, motorCandidate, motorCandidateUnavailable, generated };
}

function appendMotorCandidate(documentRef, section, candidate, unavailable) {
  if (unavailable) {
    const note = documentRef.createElement('p'); note.className = 'right-rail-muted';
    note.textContent = 'Motor starter candidate evidence is missing or changed. Consult the original proposal before using its identities.';
    section.appendChild(note);
  }
  if (!candidate) return;
  const heading = documentRef.createElement('h5');
  heading.textContent = 'Motor starter screening candidate';
  const details = documentRef.createElement('dl');
  for (const [label, value] of [['Manufacturer', candidate.manufacturer], ['Contactor', candidate.contactor], ['Overload relay', candidate.overloadRelay], ['Short-circuit device', candidate.shortCircuitDevice]]) {
    const term = documentRef.createElement('dt'); term.textContent = label;
    const description = documentRef.createElement('dd'); description.textContent = value || 'Not available';
    details.append(term, description);
  }
  const note = documentRef.createElement('p'); note.className = 'right-rail-muted';
  note.textContent = 'Screening identities only. Motor protection, settings and coordination remain unresolved; consult the original proposal for full evidence.';
  section.append(heading, details, note);
}

export function renderConnectionProtection(documentRef, result) {
  if (!result) return null;
  const section = documentRef.createElement('section');
  section.className = 'connection-protection-review';
  const heading = documentRef.createElement('h5');
  heading.textContent = 'Cable protective-device candidate';
  section.appendChild(heading);
  if (result.status !== 'candidate') {
    const message = documentRef.createElement('p');
    message.className = 'right-rail-muted';
    message.textContent = result.status === 'endpoint-mismatch'
      ? 'The drawing endpoints do not match the linked project cable. Review the connection and Cable Schedule.'
      : result.status === 'cable-unresolved'
        ? 'The connection does not resolve to one project cable. Review its cable reference before using device details.'
        : result.status === 'motor-candidate'
          ? 'No separate cable protective-device candidate is recorded.'
        : 'The selected device evidence is missing or does not match the project cable. Review the Cable Schedule.';
    section.appendChild(message);
    appendMotorCandidate(documentRef, section, result.motorCandidate, result.motorCandidateUnavailable);
    return section;
  }
  const device = result.device;
  const number = value => typeof value === 'number' && Number.isFinite(value) && value > 0 ? String(value) : null;
  const current = number(device.continuousCurrentA);
  const interrupting = number(device.interruptingRatingKA);
  const voltage = number(device.interruptingRatingVoltageVac);
  const rows = [
    ['Cable', result.cableTag],
    ['Candidate', [device.manufacturer || device.vendor, device.catalogNumber || device.id].filter(Boolean).join(' ') || 'Not available'],
    ['Continuous current', current ? `${current} A` : 'Not available'],
    ['Standalone interrupting rating', interrupting && voltage ? `${interrupting} kA at ${voltage} V` : 'Not available'],
    ['Evidence', 'Stored candidate reference matches the cable summary; source and installation require review.'],
    ['Coordination', device.coordinationStatus || 'Not evaluated'],
  ];
  const details = documentRef.createElement('dl');
  for (const [label, value] of rows) {
    const term = documentRef.createElement('dt'); term.textContent = label;
    const description = documentRef.createElement('dd'); description.textContent = String(value || 'Not available');
    details.append(term, description);
  }
  const note = documentRef.createElement('p');
  note.className = 'right-rail-muted';
  note.textContent = result.generated
    ? 'Screening candidate at the proposed source end; not an installed device, coordination result, or assembly rating.'
    : 'Screening candidate associated with this cable; device location and installation require review.';
  section.append(details, note);
  appendMotorCandidate(documentRef, section, result.motorCandidate, result.motorCandidateUnavailable);
  return section;
}

/** Keep the read-only detail current without resetting the connection edit form. */
export function createConnectionProtectionController({ documentRef, on, cableEvent, getCables, getEvidence, getContext, toggle, render }) {
  const build = context => renderConnectionProtection(documentRef, resolveConnectionProtection({
    source: context.source, target: context.target, connection: context.conn,
    cables: getCables(), evidence: getEvidence(),
  }));
  const refresh = () => {
    const inspector = documentRef.querySelector('.connection-inspector');
    const context = getContext();
    if (!inspector || !context) return;
    const current = inspector.querySelector('.connection-protection-review');
    const next = build(context);
    if (current && next) current.replaceWith(next);
    else if (current) current.remove();
    else if (next) inspector.querySelector('.right-rail-muted')?.after(next);
  };
  on(cableEvent, refresh);
  on('designSynthesisDeviceEvidence', refresh);
  return { build, ...createConnectionProtectionOverlay({ toggle, on, cableEvent, getCables, getEvidence, render }) };
}

/** Optional drawing labels are read-only and share the inspector's evidence checks. */
export function createConnectionProtectionOverlay({ toggle, on, cableEvent, getCables, getEvidence, render }) {
  const refresh = () => { if (toggle?.checked) render(); };
  toggle?.addEventListener('change', render);
  on(cableEvent, refresh);
  on('designSynthesisDeviceEvidence', refresh);
  return {
    forRender() {
      if (!toggle?.checked) return () => '';
      const cables = getCables();
      const evidence = getEvidence();
      return (source, target, connection) => {
        const result = resolveConnectionProtection({ source, target, connection, cables, evidence });
        if (!result) return '';
      if (result.status === 'motor-candidate') return result.motorCandidate ? '[MOTOR STARTER CANDIDATE]' : '[MOTOR STARTER CANDIDATE UNAVAILABLE]';
      if (result.status !== 'candidate') return '[DEVICE CANDIDATE UNAVAILABLE]';
        const device = result.device;
        const name = [device.manufacturer || device.vendor, device.catalogNumber || device.id].filter(Boolean).join(' ');
        const current = Number.isFinite(device.continuousCurrentA) && device.continuousCurrentA > 0 ? ` ${device.continuousCurrentA} A` : '';
        return `[PROPOSED DEVICE: ${name || 'identity unavailable'}${current}]`;
      };
    },
  };
}
