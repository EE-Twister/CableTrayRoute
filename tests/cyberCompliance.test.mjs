import assert from 'assert';
import {
  assessCyberAsset,
  buildCyberComplianceLetter,
  deriveCyberAssets,
  normalizeCyberAsset,
  runCyberComplianceStudy
} from '../analysis/cyberCompliance.mjs';
import { buildAdvancedStudySections } from '../analysis/projectReport.mjs';
import { getSectionDef } from '../analysis/reportPackage.mjs';

function it(name, fn) {
  try { fn(); console.log('✓', name); }
  catch (error) { console.error('✗', name, error.message || error); process.exitCode = 1; }
}

it('normalizes protocol, remote-access, and evidence fields', () => {
  const asset = normalizeCyberAsset({ id: 'REL-1', protocols: 'IEC 61850; HTTPS', remoteAccess: { enabled: true, mfa: true, logging: true, approvedPath: true }, passwordPolicy: true, patchCurrent: true });
  assert.deepStrictEqual(asset.protocols, ['IEC 61850', 'HTTPS']);
  assert.strictEqual(asset.remoteAccess.mfa, true);
});

it('derives deduplicated cyber assets from project records', () => {
  const assets = deriveCyberAssets({ equipment: [{ id: 'RTU-1', category: 'RTU' }], panels: [{ id: 'P-1' }], oneLine: { sheets: [{ components: [{ id: 'RTU-1', type: 'rtu' }, { id: 'REL-1', type: 'relay' }] }] } });
  assert.deepStrictEqual(assets.map(asset => asset.id), ['RTU-1', 'P-1', 'REL-1']);
});

it('flags missing remote-access and firmware evidence', () => {
  const result = assessCyberAsset({ id: 'REL-1', cyberAssetClass: 'Protective relay', cyberCriticality: 'bes', remoteAccess: true, cipEvidence: 'CIP inventory' });
  assert.strictEqual(result.overall, 'gap');
  assert.ok(result.checks.some(check => check.id === 'CIP-007' && check.status === 'gap'));
  assert.ok(result.checks.some(check => check.id === 'IEC-SR3' && check.status === 'gap'));
});

it('passes a fully evidenced remote critical asset', () => {
  const result = runCyberComplianceStudy([{
    id: 'RTU-1', cyberAssetClass: 'RTU', cyberCriticality: 'bes', cipEvidence: 'CIP-002 inventory', zone: 'ESP-01',
    firmwareVersion: '4.2.1', protocols: ['DNP3/TLS'], passwordPolicy: true, patchCurrent: true,
    remoteAccess: { enabled: true, mfa: true, logging: true, approvedPath: true }
  }], { assessedAt: '2026-07-31T00:00:00.000Z' });
  assert.strictEqual(result.overall, 'screening_complete');
  assert.strictEqual(result.summary.gap, 0);
  assert.match(buildCyberComplianceLetter(result, { projectName: 'North Substation' }), /North Substation/);
  assert.strictEqual(getSectionDef('cyberCompliance').studyKey, 'cyberCompliance');
  assert.strictEqual(buildAdvancedStudySections({ cyberCompliance: result }).cyberCompliance.rows.length, 6);
});
