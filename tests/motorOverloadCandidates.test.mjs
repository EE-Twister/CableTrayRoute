import assert from 'node:assert/strict';
import test from 'node:test';
import { selectMotorOverloadCandidate, SIEMENS_3RU2_CANDIDATES } from '../analysis/motorOverloadCandidates.mjs';

// Synthetic motor inputs exercise independently transcribed Siemens catalog ranges.
const motorFixture = nameplateCurrentA => ({
  motor: { nameplateCurrentA, ratedVoltageV: 460, starterType: 'dol' },
  phases: 3,
});

test('source-backed Siemens order numbers retain exact low-current ranges and per-range trip classes', () => {
  assert.deepEqual(SIEMENS_3RU2_CANDIDATES.filter(item => item.size === 'S2').map(item => [item.catalogNumber, item.minSettingA, item.maxSettingA]), [
    ['3RU2136-4EB0', 22, 32],
    ['3RU2136-4FB0', 28, 40],
    ['3RU2136-4GB0', 36, 45],
    ['3RU2136-4HB0', 40, 50],
    ['3RU2136-4QB0', 47, 57],
    ['3RU2136-4JB0', 54, 65],
    ['3RU2136-4KB0', 62, 73],
  ]);
  assert.deepEqual(SIEMENS_3RU2_CANDIDATES.filter(item => item.size === 'S00').slice(0, 3).map(item => [item.catalogNumber, item.minSettingA, item.maxSettingA]), [
    ['3RU2116-0AB0', 0.11, 0.16],
    ['3RU2116-0BB0', 0.14, 0.2],
    ['3RU2116-0CB0', 0.18, 0.25],
  ]);
  assert.deepEqual(SIEMENS_3RU2_CANDIDATES.filter(item => item.size === 'S0').slice(8, 12).map(item => [item.catalogNumber, item.minSettingA, item.maxSettingA]), [
    ['3RU2126-4AB0', 11, 16],
    ['3RU2126-4BB0', 14, 20],
    ['3RU2126-4CB0', 17, 22],
    ['3RU2126-4DB0', 20, 25],
  ]);
  for (const item of SIEMENS_3RU2_CANDIDATES) {
    assert.equal(item.tripClass, item.catalogNumber === '3RU2136-4KB0' ? '10A' : '10');
    assert.equal(item.phases, 3);
    assert.match(item.assemblyScope, /contactor-mounted/);
    assert.equal(item.sourceDocuments.length, 3);
    assert.ok(item.sourceDocuments.every(source => source.url.startsWith('https://')));
    assert.ok(item.sourceDocuments.every(source => source.publisher === 'Siemens AG' && source.title && source.revision && source.page));
    assert.ok(item.sourceDocuments.every(source => source.accessedOn === null || /^\d{4}-\d{2}-\d{2}$/.test(source.accessedOn)));
    const tableSource = item.sourceDocuments.find(source => source.id === `siemens_ic10_2021_page_7_${item.size === 'S2' ? '99' : '98'}`);
    assert.equal(tableSource.url, 'https://cache.industry.siemens.com/dl/files/999/109771999/att_1058579/v1/SIRIUS_IC10_chap07_English_2021_202103301020326928.pdf');
    assert.equal(tableSource.page, item.size === 'S2' ? '7/99' : '7/98');
    assert.equal(tableSource.sha256, '0f9bd5ec76a0d5dbc84816dc53472b88aa2b748030c937e0aa05ea1166611dfe');
    for (const field of ['catalogNumber', 'minSettingA', 'maxSettingA', 'size', 'tripClass', 'assemblyScope']) {
      assert.ok(item.fieldSources[field].length > 0);
      assert.ok(item.fieldSources[field].every(sourceId => sourceId === `siemens_ic10_2021_page_7_${item.size === 'S2' ? '99' : '98'}`));
      assert.ok(item.fieldSources[field].every(sourceId => item.sourceDocuments.some(source => source.id === sourceId)));
    }
    assert.deepEqual(item.fieldSources.phases, ['siemens_3ru2_operating_manual_2014']);
  }
});

test('selector uses explicit nameplate dial current and resolves overlapping ranges deterministically', () => {
  const result = selectMotorOverloadCandidate(motorFixture(44));
  assert.equal(result.status, 'screening_only');
  assert.equal(result.candidate.catalogNumber, '3RU2136-4GB0');
  assert.equal(result.candidate.dialSettingA, 44);
  assert.equal(result.candidate.dialSettingBasis, 'explicit motor.nameplateCurrentA per Siemens 3RU2 operating manual §9.1');
  assert.equal(result.candidate.motorNameplateVoltageV, 460);
  assert.equal(result.candidate.voltageApplicability.startsWith('unresolved'), true);
  assert.match(result.candidate.protectionStatus, /not established/);
  assert.ok(result.candidate.unresolved.some(item => item.includes('NEC permitted overload trip limit')));
  assert.ok(result.candidate.unresolved.some(item => item.includes('complete starter assembly')));
});

test('returned evidence metadata is detached from the catalog inventory', () => {
  const result = selectMotorOverloadCandidate(motorFixture(12.8));
  result.candidate.sourceDocuments[0].title = 'mutated consumer copy';
  result.candidate.fieldSources.catalogNumber.push('mutated consumer copy');
  const next = selectMotorOverloadCandidate(motorFixture(12.8));
  assert.notEqual(next.candidate.sourceDocuments[0].title, 'mutated consumer copy');
  assert.ok(!next.candidate.fieldSources.catalogNumber.includes('mutated consumer copy'));
  assert.throws(() => SIEMENS_3RU2_CANDIDATES[0].fieldSources.catalogNumber.push('mutated catalog'));
});

test('selector includes range endpoints and rejects currents outside the sourced inventory', () => {
  assert.equal(selectMotorOverloadCandidate(motorFixture(22)).candidate.catalogNumber, '3RU2126-4CB0');
  assert.equal(selectMotorOverloadCandidate(motorFixture(73)).candidate.catalogNumber, '3RU2136-4KB0');
  assert.equal(selectMotorOverloadCandidate(motorFixture(73)).candidate.tripClass, '10A');
  const below = selectMotorOverloadCandidate(motorFixture(0.1));
  const above = selectMotorOverloadCandidate(motorFixture(73.01));
  assert.equal(below.issues[0].code, 'MOTOR_NAMEPLATE_CURRENT_OUTSIDE_CATALOG');
  assert.equal(above.issues[0].code, 'MOTOR_NAMEPLATE_CURRENT_OUTSIDE_CATALOG');
});

test('selector returns low-current S00/S0 candidates for synthetic industrial motor nameplates', () => {
  const small = selectMotorOverloadCandidate(motorFixture(0.15));
  const motor12A = selectMotorOverloadCandidate(motorFixture(12.8));
  assert.equal(small.candidate.catalogNumber, '3RU2116-0AB0');
  assert.equal(small.candidate.size, 'S00');
  assert.equal(motor12A.candidate.catalogNumber, '3RU2116-4AB0');
  assert.equal(motor12A.candidate.size, 'S00');
  assert.equal(motor12A.candidate.dialSettingA, 12.8);
});

test('selector never falls back to design-table FLC and blocks unsupported scope', () => {
  const missingNameplate = selectMotorOverloadCandidate({ motor: { fullLoadCurrentA: 42, ratedVoltageV: 460, starterType: 'dol' }, phases: 3 });
  assert.equal(missingNameplate.issues[0].code, 'MOTOR_NAMEPLATE_CURRENT_REQUIRED');
  assert.equal(selectMotorOverloadCandidate({ motor: { nameplateCurrentA: 42, starterType: 'dol' }, phases: 3 }).issues[0].code, 'MOTOR_NAMEPLATE_VOLTAGE_REQUIRED');
  assert.equal(selectMotorOverloadCandidate({ ...motorFixture(42), phases: 1 }).issues[0].code, 'UNSUPPORTED_OVERLOAD_PHASES');
  assert.equal(selectMotorOverloadCandidate({ ...motorFixture(42), motor: { ...motorFixture(42).motor, starterType: 'vfd' } }).issues[0].code, 'UNSUPPORTED_OVERLOAD_STARTER');
});
