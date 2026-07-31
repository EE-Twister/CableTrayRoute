import assert from 'node:assert/strict';
import {
  CABLE_LIBRARY_EVIDENCE_STATUS,
  assessCableTypical,
  normalizeCableCatalogProduct,
  normalizeCableTypical,
  summarizeCableLibrary
} from '../analysis/cableLibrary.mjs';

function verifiedTypical(overrides = {}) {
  return {
    label: 'Verified 12 AWG THHN',
    manufacturer: 'Southwire',
    model: 'SPEC10000',
    catalog_evidence_status: 'source_verified',
    catalog_source: 'Southwire manufacturer product page',
    catalog_last_verified: '2026-07-31',
    datasheet_url: 'https://www.southwire.com/wire-cable/building-wire/simpull-sup-sup-thhn-thwn-2-copper/p/SPEC10000',
    conductor_size: '#12 AWG',
    conductor_material: 'Copper',
    insulation_type: 'THHN',
    cable_rating: 600,
    ...overrides
  };
}

console.log('cable library governance');

{
  const assessment = assessCableTypical(verifiedTypical());
  assert.equal(assessment.sourceVerified, true);
  assert.equal(assessment.status, CABLE_LIBRARY_EVIDENCE_STATUS.sourceVerified);
  assert.deepEqual(assessment.missing, []);
  console.log('  ✓ accepts a complete source-verified cable typical');
}

{
  const assessment = assessCableTypical(verifiedTypical({ datasheet_url: '', catalog_last_verified: '2026-02-31' }));
  assert.equal(assessment.sourceVerified, false);
  assert.equal(assessment.status, CABLE_LIBRARY_EVIDENCE_STATUS.screening);
  assert.ok(assessment.missing.includes('manufacturer product or datasheet URL'));
  assert.ok(assessment.missing.includes('last verified date'));
  console.log('  ✓ downgrades incomplete source-verification claims to screening');
}

{
  const normalized = normalizeCableTypical(verifiedTypical({ conductor_size: '' }));
  assert.equal(normalized.catalog_evidence_status, CABLE_LIBRARY_EVIDENCE_STATUS.screening);
  console.log('  ✓ normalizes incomplete imported records to screening');
}

{
  const summary = summarizeCableLibrary([
    verifiedTypical(),
    { label: 'Project control cable', catalog_evidence_status: 'screening' },
    verifiedTypical({ model: '' })
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.source_verified, 1);
  assert.equal(summary.screening, 2);
  console.log('  ✓ summarizes source-verified and screening typicals');
}

{
  const typical = normalizeCableCatalogProduct({
    id: 'CU-THHN-12', manufacturer: 'Southwire', catalogNumber: 'SPEC10000', category: 'cable',
    evidenceStatus: 'source_verified', source: 'Southwire manufacturer product page', lastVerified: '2026-07-31',
    datasheetUrl: 'https://www.southwire.com/wire-cable/building-wire/simpull-sup-sup-thhn-thwn-2-copper/p/SPEC10000',
    cable_type: 'Power', cable_conductors: 1, cable_conductor_size: '#12 AWG',
    cable_conductor_material: 'Copper', cable_insulation_type: 'THHN/THWN-2', cable_voltage_rating: 600,
  });
  assert.ok(typical);
  assert.equal(typical.label, 'Southwire SPEC10000 #12 AWG');
  assert.equal(typical.catalog_evidence_status, CABLE_LIBRARY_EVIDENCE_STATUS.sourceVerified);
  assert.equal(typical.cable_rating, 600);
  console.log('  adapts a complete governed cable catalog product into a source-verified typical');
}

{
  assert.equal(normalizeCableCatalogProduct({ category: 'tray' }), null);
  assert.equal(normalizeCableCatalogProduct({ category: 'cable', manufacturer: 'ACME' }), null);
  console.log('  ignores unrelated or incomplete shared catalog products');
}
