import snapshot from '../data/designSynthesisDevices.json' with { type: 'json' };
import { fingerprintStudyValue } from './studyLifecycle.mjs';

// Bind the research annotations to the reviewed snapshot records. A changed
// catalog record needs a new review, even if its ID and ampere rating match.
const REVIEWED = Object.freeze({
  eaton_series_c_fd3020: ['fnv1a-e2eb3703', 32, 29, 'TC012037EN', 'vector-segments'],
  eaton_series_c_hfd3080: ['fnv1a-71cef066', 41, 38, 'TC012046EN', 'vector-segments-point-join-unverified'],
  eaton_series_c_fd3125: ['fnv1a-1e40cb6c', 45, 42, 'TC012031EN', 'raster-incomplete'],
  eaton_series_c_hfd3150: ['fnv1a-8c25c504', 46, 43, 'TC012032EN', 'vector-current-domain-gap'],
  eaton_series_c_fd3175: ['fnv1a-bf5bd8c6', 47, 44, 'TC012033EN', 'vector-segments'],
  eaton_series_c_hfd3200: ['fnv1a-fc3b1b84', 48, 45, 'TC012034EN', 'vector-current-domain-gap'],
  eaton_series_c_fd3225: ['fnv1a-4dafd32a', 49, 46, 'TC012035EN', 'vector-current-domain-gap'],
  eaton_series_c_kdb3400: ['fnv1a-68893a00', 17, 9, 'SC-4118-87B', 'configuration-unresolved'],
});
const F_URL = 'https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/molded-case-circuit-breakers/series-c-molded-case-circuit-breakers/f-frame-time-current-curves-tc01200002e.pdf';
const K_URL = 'https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/molded-case-circuit-breakers/series-c-molded-case-circuit-breakers/k-frame-time-current-curves-td012034en.pdf';
const references = new Map(snapshot.records.map(record => [record.id, record]));

function sameValue(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a).sort(); const right = Object.keys(b).sort();
  return left.length === right.length && left.every((key, index) => key === right[index] && sameValue(a[key], b[key]));
}

export function designSynthesisCurveSourceEvidence(record) {
  const profile = REVIEWED[record?.id]; const reference = references.get(record?.id);
  if (!profile || !reference || fingerprintStudyValue(reference) !== profile[0] || !sameValue(record, reference)) return null;
  const [fingerprint, page, figure, curveId, sourceStatus] = profile;
  const isKFrame = sourceStatus === 'configuration-unresolved';
  return {
    schema: 'design-synthesis-curve-source-research-v1', researchStatus: 'candidate', libraryStatus: 'screening',
    snapshotRecordFingerprint: fingerprint, sourceStatus, pageOneBased: page, figure, curveId,
    source: { publisher: 'Eaton', document: isKFrame ? 'TD012034EN, September 2015' : 'TC01200002E, April 2022',
      url: isKFrame ? K_URL : F_URL,
      sha256: isKFrame ? 'a6823a8fbf821131606a0b8b999f5ced5ffeb47299b87b55dfd57cae24a778d1' : 'b7e6ccdb7229f5f2c30573c1dbc64b42fbd22b8e640ecd7ceb82b943cc8d22ff' },
    conditions: isKFrame ? 'KT family chart: adjustable magnetic settings, percent-of-rated-current axis; KDB3400 applicability unresolved.'
      : 'Cold rated ambient (value unspecified), all poles in series, open air, four feet of 60/75 C wire per terminal; instantaneous single-pole. Tails 240/480/600 V; other voltages unqualified.',
    limits: isKFrame ? 'Fixed-magnetic setting and applicability require manufacturer evidence.'
      : sourceStatus === 'raster-incomplete' ? 'Sparse uncalibrated raster; no complete curve or voltage tails.'
        : sourceStatus === 'vector-current-domain-gap' ? 'Current-domain gaps; no complete clearing boundary.'
          : 'Research segments only; connectivity and stroke uncertainty do not establish a qualified clearing boundary.',
    clearingEvaluation: 'unevaluated', coordination: 'unevaluated', sourceAccessedOn: '2026-10-26',
  };
}
