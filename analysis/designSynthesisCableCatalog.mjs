// Frozen table transcribed from Southwire SPEC45301 rev1.000.008, archived
// 2026-10-24. Values are R at 75 C and X at 60 Hz in ohms per 1,000 ft.
// The source PDF SHA-256 is included in the exported source metadata below.
export const SOUTHWIRE_MC_SOURCE = Object.freeze({
  sourceId: 'southwire-spec45301-rev1.000.008-pdf-2026-10-24',
  revision: 'Southwire SPEC45301 rev1.000.008',
  sourceUrl: 'https://cabletechsupport.southwire.com/cablespec/download_spec/?country=US&spec=45301',
  productUrl: 'https://cabletechsupport.southwire.com/en/tile/9/spec/45301/?country=US',
  accessedOn: '2026-10-24',
  sha256: 'd01fb6ec8ab42ea8b6144ea982ccf23ee662190c818621ea9d1d16f7735d3341',
  status: 'frozen-primary-pdf-transcription',
  caveat: 'An earlier indexed/cached extract for this same printed revision differed from the archived PDF. Values here follow the archived PDF; do not mix the cached extract or live HTML values into this snapshot.',
});
export const SOUTHWIRE_SPEC45301_SOURCE = SOUTHWIRE_MC_SOURCE;
export const SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT = `${SOUTHWIRE_MC_SOURCE.sourceId}:${SOUTHWIRE_MC_SOURCE.sha256}`;

// Exact stock identifiers matter: 500 kcmil has multiple ground-conductor
// variants. The selected 380618 row is the 2 AWG ground construction.
export const SOURCED_MC_R_X = Object.freeze(Object.fromEntries(Object.entries({
  '#8 AWG': { r: 0.810, x: 0.052, od: 0.833, stockId: '606939', source: SOUTHWIRE_SPEC45301_SOURCE.revision },
  '#6 AWG': { r: 0.510, x: 0.051, od: 0.910, stockId: '606947', source: SOUTHWIRE_SPEC45301_SOURCE.revision },
  '#4 AWG': { r: 0.320, x: 0.048, od: 1.012, stockId: '606954', source: SOUTHWIRE_SPEC45301_SOURCE.revision },
  '#3 AWG': { r: 0.254, x: 0.047, od: 1.070, stockId: '671892', source: SOUTHWIRE_SPEC45301_SOURCE.revision },
  '#2 AWG': { r: 0.201, x: 0.045, od: 1.137, stockId: '560466', source: SOUTHWIRE_SPEC45301_SOURCE.revision },
  '#1 AWG': { r: 0.159, x: 0.046, od: 1.282, stockId: '550801', source: SOUTHWIRE_SPEC45301_SOURCE.revision },
  '1/0 AWG': { r: 0.127, x: 0.044, od: 1.364, stockId: '560474', source: SOUTHWIRE_SPEC45301_SOURCE.revision },
  '2/0 AWG': { r: 0.102, x: 0.043, od: 1.459, stockId: '560482', source: SOUTHWIRE_SPEC45301_SOURCE.revision },
  '3/0 AWG': { r: 0.079, x: 0.042, od: 1.567, stockId: '890339', source: SOUTHWIRE_SPEC45301_SOURCE.revision },
  '4/0 AWG': { r: 0.063, x: 0.041, od: 1.783, stockId: '383679', source: SOUTHWIRE_SPEC45301_SOURCE.revision },
  '250 kcmil': { r: 0.053, x: 0.041, od: 1.917, stockId: '601377', source: SOUTHWIRE_SPEC45301_SOURCE.revision },
  '350 kcmil': { r: 0.039, x: 0.040, od: 2.131, stockId: '383646', source: SOUTHWIRE_SPEC45301_SOURCE.revision },
  '500 kcmil': { r: 0.027, x: 0.039, od: 2.432, stockId: '380618', source: SOUTHWIRE_SPEC45301_SOURCE.revision },
  '600 kcmil': { r: 0.024, x: 0.039, od: 2.665, stockId: '890391', source: SOUTHWIRE_SPEC45301_SOURCE.revision },
  '750 kcmil': { r: 0.019, x: 0.038, od: 2.942, stockId: '890405', source: SOUTHWIRE_SPEC45301_SOURCE.revision },
}).map(([size, row]) => [size, Object.freeze(row)])));

export function sourcedCableImpedance(size, lengthFt) {
  const source = SOURCED_MC_R_X[size];
  if (lengthFt === null || lengthFt === undefined || (typeof lengthFt === 'string' && !lengthFt.trim())) return null;
  const length = Number(lengthFt);
  if (!source || !Number.isFinite(length) || length < 0) return null;
  return { r: source.r * length / 1000, x: source.x * length / 1000, r_ohm_per_kft: source.r, x_ohm_per_kft: source.x, source: source.source,
    cableStockId: source.stockId, cableCatalogFingerprint: SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT };
}
