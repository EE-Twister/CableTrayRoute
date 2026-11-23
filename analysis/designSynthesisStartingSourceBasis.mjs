const METHOD = 'source-only-starting-fault-xr-v1';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Copy a single explicit utility equivalent as a starting-case candidate, not a live link. */
export function startingCaseFromFaultStudy(source, faultStudy) {
  if (!record(source) || typeof source.id !== 'string' || !source.id.trim() || !finite(source.voltage) || source.voltage <= 0 || source.phases !== 3) return { ok: false, issues: ['A three-phase supply with a stable ID and voltage is required.'] };
  if (!record(faultStudy) || !Array.isArray(faultStudy.sources)) return { ok: false, issues: ['Enter a valid fault-study source array before copying a source.'] };
  const rows = faultStudy.sources.filter(row => row?.equipmentId === source.id);
  if (rows.length !== 1) return { ok: false, issues: ['The fault study must contain exactly one equivalent for the supply ID.'] };
  const row = rows[0];
  const r = row?.impedance?.rOhm;
  const x = row?.impedance?.xOhm;
  const re = row?.emfPhaseV?.re;
  const im = row?.emfPhaseV?.im;
  if (row.inService !== true || typeof row.reference !== 'string' || !row.reference.trim() || !finite(r) || r <= 0 || !finite(x) || x < 0 || !finite(re) || !finite(im)) return { ok: false, issues: ['The supply equivalent must be in service, referenced, and have finite R > 0, X ≥ 0 and phase EMF.'] };
  const nominal = source.voltage / Math.sqrt(3);
  const emf = Math.hypot(re, im);
  if (!finite(emf) || Math.abs(emf - nominal) > nominal * 1e-9) return { ok: false, issues: ['The fault-source phase EMF magnitude must match the supply voltage base.'] };
  const faultCurrentKA = nominal / Math.hypot(r, x) / 1000;
  const xOverR = x / r;
  const requested = { faultCurrentKA, xOverR, reference: `Fault-study source snapshot ${source.id}: ${row.reference.trim()}`, confirmedSourceOnlyStartingCase: true };
  const checked = deriveStartingSourceBasis(source, requested);
  if (!checked.ok) return checked;
  return { ok: true, issues: [], requested: { ...requested, confirmedSourceOnlyStartingCase: false } };
}

/** Derive one explicitly supplied source case, never an available-fault bound. */
export function deriveStartingSourceBasis(source, requested) {
  const issues = [];
  if (!record(source) || typeof source.id !== 'string' || !source.id.trim()) issues.push('Supply requires a stable source ID.');
  if (!finite(source?.voltage) || source.voltage <= 0 || source?.phases !== 3) issues.push('Supply requires a positive line-to-line voltage and three phases.');
  if (!finite(source?.availableFaultCurrentKA) || source.availableFaultCurrentKA <= 0) issues.push('Supply requires a positive source-only available-fault upper bound in kA.');
  if (!record(requested) || !finite(requested.faultCurrentKA) || requested.faultCurrentKA <= 0) issues.push('Enter the positive source-only symmetrical three-phase fault current for the starting case in kA.');
  if (!record(requested) || !finite(requested.xOverR) || requested.xOverR < 0) issues.push('Enter a finite nonnegative source X/R ratio for the same starting case.');
  if (!record(requested) || typeof requested.reference !== 'string' || !requested.reference.trim()) issues.push('Enter a reference identifying the source case and X/R basis.');
  if (requested?.confirmedSourceOnlyStartingCase !== true) issues.push('Confirm the current and X/R represent the same source-only starting case at the stated source voltage.');
  if (finite(requested?.faultCurrentKA) && finite(source?.availableFaultCurrentKA) && requested.faultCurrentKA > source.availableFaultCurrentKA) issues.push('The starting-case current exceeds the declared source-only upper bound.');
  if (issues.length) return { ok: false, issues };
  const magnitudeOhm = (source.voltage / requested.faultCurrentKA) / (Math.sqrt(3) * 1000);
  const scale = Math.hypot(1, requested.xOverR);
  const rOhm = magnitudeOhm / scale;
  const xOhm = magnitudeOhm * (requested.xOverR / scale);
  if (!finite(magnitudeOhm) || magnitudeOhm <= 0 || !finite(rOhm) || rOhm <= 0 || !finite(xOhm) || xOhm < 0 || (requested.xOverR > 0 && xOhm === 0)) return { ok: false, issues: ['The requested impedance is outside the supported finite numeric range.'] };
  const reference = requested.reference.trim();
  const impedance = { rOhm, xOhm, reference };
  const basis = { method: METHOD, sourceId: source.id, voltageV: source.voltage, phases: source.phases, availableFaultCurrentKA: source.availableFaultCurrentKA, faultCurrentKA: requested.faultCurrentKA, xOverR: requested.xOverR, reference, confirmedSourceOnlyStartingCase: true, rOhm, xOhm };
  return { ok: true, issues: [], impedance, basis };
}

/** A stored derived basis is valid only for the exact source and values reviewed. */
export function validateStartingSourceBasis(source) {
  if (!record(source) || !Object.prototype.hasOwnProperty.call(source, 'motorStartingImpedanceBasis')) return null;
  const basis = source.motorStartingImpedanceBasis;
  if (!record(basis) || basis.method !== METHOD) return 'Derived source-impedance basis is malformed or unsupported.';
  const result = deriveStartingSourceBasis(source, basis);
  if (!result.ok) return `Derived source-impedance basis is stale or invalid: ${result.issues.join(' ')}`;
  const same = (left, right) => record(left) && Object.keys(left).length === Object.keys(right).length && Object.keys(right).every(key => left[key] === right[key]);
  if (!same(basis, result.basis) || !same(source.motorStartingImpedance, result.impedance)) return 'Derived source-impedance basis no longer matches the source or stored R/X values; review it again.';
  return null;
}

/** Do not overwrite an independently supplied or edited source impedance. */
export function prepareStartingSourceBasis(source, requested) {
  const result = deriveStartingSourceBasis(source, requested);
  if (!result.ok) return result;
  if (source.motorStartingImpedance !== undefined || source.motorStartingImpedanceBasis !== undefined) {
    const old = source.motorStartingImpedanceBasis;
    if (!record(old)) return { ok: false, issues: ['Existing source impedance is independent or malformed; resolve it before using this conversion.'] };
    const original = { id: old.sourceId, voltage: old.voltageV, phases: old.phases, availableFaultCurrentKA: old.availableFaultCurrentKA, motorStartingImpedance: source.motorStartingImpedance, motorStartingImpedanceBasis: old };
    if (validateStartingSourceBasis(original)) return { ok: false, issues: ['The existing derived impedance or its basis has been edited; resolve it before replacement.'] };
  }
  return { ...result, source: { ...structuredClone(source), motorStartingImpedance: result.impedance, motorStartingImpedanceBasis: result.basis } };
}
