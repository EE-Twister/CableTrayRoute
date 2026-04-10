/**
 * Gap #48 – Cross-Sheet Off-Page Connectors
 * Unit tests for the four pure helper functions and the v4 migration.
 * No DOM required — all logic is exercised in-process.
 */

import assert from 'node:assert/strict';

// ─── Inline copies of the pure helpers (mirrored from oneline.js) ─────────────

function resolveLinkedSheetIndex(comp, sheetsArr) {
  const name = (comp.props?.linked_sheet ?? comp.linked_sheet ?? '').trim();
  if (!name) return -1;
  return sheetsArr.findIndex(s => s.name === name);
}

function findPairedConnector(linkId, subtype, sheetsArr) {
  if (!linkId) return null;
  const partnerSubtype = subtype === 'link_source' ? 'link_target' : 'link_source';
  for (let i = 0; i < sheetsArr.length; i++) {
    const found = (sheetsArr[i].components || []).find(
      c => c.type === 'sheet_link' &&
           c.subtype === partnerSubtype &&
           (c.props?.link_id ?? c.link_id ?? '') === linkId
    );
    if (found) return { sheetIndex: i, component: found };
  }
  return null;
}

function validateSheetLinks(sheetsArr) {
  const issues = [];
  sheetsArr.forEach((sheet, idx) => {
    (sheet.components || []).forEach(c => {
      if (c.type !== 'sheet_link') return;
      const linkId = (c.props?.link_id ?? c.link_id ?? '').trim();
      const linkedSheet = (c.props?.linked_sheet ?? c.linked_sheet ?? '').trim();
      if (!linkId) {
        issues.push({ component: c.id, sheetIndex: idx, message: 'Sheet link has no link_id' });
      }
      if (!linkedSheet) {
        issues.push({ component: c.id, sheetIndex: idx, message: 'Sheet link has no target sheet set' });
      }
      if (linkId) {
        const partner = findPairedConnector(linkId, c.subtype, sheetsArr);
        if (!partner) {
          issues.push({ component: c.id, sheetIndex: idx, message: `No matching paired connector for link_id "${linkId}"` });
        }
      }
    });
  });
  return issues;
}

function getSheetLinkBadgeText(comp, sheetsArr) {
  const name = (comp.props?.linked_sheet ?? comp.linked_sheet ?? '').trim();
  if (!name) return '';
  const arrow = comp.subtype === 'link_source' ? '→' : '←';
  return `${arrow} ${name}`;
}

// Minimal replica of the v4 migration block (from migrateDiagram in oneline.js)
function migrateV3toV4(data) {
  const version = data.version || 0;
  let migrated = JSON.parse(JSON.stringify(data)); // deep clone
  if (version < 4) {
    migrated.sheets = (migrated.sheets || []).map(s => ({
      ...s,
      components: (s.components || []).map(c => {
        if (c.type !== 'sheet_link') return c;
        const nc = { ...c, props: { ...(c.props || {}) } };
        if ('target_sheet' in nc.props && !('linked_sheet' in nc.props)) {
          nc.props.linked_sheet = nc.props.target_sheet;
          delete nc.props.target_sheet;
        }
        if ('from_sheet' in nc.props && !('linked_sheet' in nc.props)) {
          nc.props.linked_sheet = nc.props.from_sheet;
          delete nc.props.from_sheet;
        }
        return nc;
      })
    }));
  }
  migrated.version = 4;
  return migrated;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeSource = (id, linkId, linkedSheet) => ({
  id, type: 'sheet_link', subtype: 'link_source',
  props: { link_id: linkId, linked_sheet: linkedSheet, notes: '' }
});

const makeTarget = (id, linkId, linkedSheet) => ({
  id, type: 'sheet_link', subtype: 'link_target',
  props: { link_id: linkId, linked_sheet: linkedSheet, notes: '' }
});

const makeBreaker = (id) => ({ id, type: 'breaker', subtype: 'lv_cb', props: {} });

// ─── Tests ────────────────────────────────────────────────────────────────────

// resolveLinkedSheetIndex

{
  console.log('Gap #48 – Test 1: resolveLinkedSheetIndex finds matching sheet by name');
  const sheets = [{ name: 'Sheet 1', components: [] }, { name: 'Sheet 2', components: [] }];
  const comp = makeSource('s1', 'L1', 'Sheet 2');
  assert.equal(resolveLinkedSheetIndex(comp, sheets), 1);
  console.log('  PASS');
}

{
  console.log('Gap #48 – Test 2: resolveLinkedSheetIndex returns -1 when name not found');
  const sheets = [{ name: 'Sheet 1', components: [] }, { name: 'Sheet 2', components: [] }];
  const comp = makeSource('s1', 'L1', 'Sheet 99');
  assert.equal(resolveLinkedSheetIndex(comp, sheets), -1);
  console.log('  PASS');
}

{
  console.log('Gap #48 – Test 3: resolveLinkedSheetIndex returns -1 for empty linked_sheet');
  const sheets = [{ name: 'Sheet 1', components: [] }];
  const comp = makeSource('s1', 'L1', '');
  assert.equal(resolveLinkedSheetIndex(comp, sheets), -1);
  console.log('  PASS');
}

// findPairedConnector

{
  console.log('Gap #48 – Test 4: findPairedConnector locates link_target partner on another sheet');
  const target = makeTarget('t1', 'L1', 'Sheet 1');
  const sheets = [
    { name: 'Sheet 1', components: [makeSource('s1', 'L1', 'Sheet 2')] },
    { name: 'Sheet 2', components: [target] }
  ];
  const result = findPairedConnector('L1', 'link_source', sheets);
  assert.ok(result !== null);
  assert.equal(result.sheetIndex, 1);
  assert.equal(result.component.id, 't1');
  console.log('  PASS');
}

{
  console.log('Gap #48 – Test 5: findPairedConnector locates link_source partner on another sheet');
  const source = makeSource('s1', 'L1', 'Sheet 2');
  const sheets = [
    { name: 'Sheet 1', components: [source] },
    { name: 'Sheet 2', components: [makeTarget('t1', 'L1', 'Sheet 1')] }
  ];
  const result = findPairedConnector('L1', 'link_target', sheets);
  assert.ok(result !== null);
  assert.equal(result.sheetIndex, 0);
  assert.equal(result.component.id, 's1');
  console.log('  PASS');
}

{
  console.log('Gap #48 – Test 6: findPairedConnector returns null when no matching partner exists');
  const sheets = [
    { name: 'Sheet 1', components: [makeSource('s1', 'L1', 'Sheet 2')] },
    { name: 'Sheet 2', components: [] }
  ];
  const result = findPairedConnector('L1', 'link_source', sheets);
  assert.equal(result, null);
  console.log('  PASS');
}

{
  console.log('Gap #48 – Test 7: findPairedConnector returns null when linkId is empty string');
  const sheets = [
    { name: 'Sheet 1', components: [makeTarget('t1', 'L1', 'Sheet 1')] }
  ];
  const result = findPairedConnector('', 'link_source', sheets);
  assert.equal(result, null);
  console.log('  PASS');
}

// validateSheetLinks

{
  console.log('Gap #48 – Test 8: validateSheetLinks accepts a correctly paired source/target pair');
  const sheets = [
    { name: 'Sheet 1', components: [makeSource('s1', 'L1', 'Sheet 2')] },
    { name: 'Sheet 2', components: [makeTarget('t1', 'L1', 'Sheet 1')] }
  ];
  const issues = validateSheetLinks(sheets);
  assert.equal(issues.length, 0);
  console.log('  PASS');
}

{
  console.log('Gap #48 – Test 9: validateSheetLinks flags unpaired source');
  const sheets = [
    { name: 'Sheet 1', components: [makeSource('s1', 'X1', 'Sheet 2')] },
    { name: 'Sheet 2', components: [] }
  ];
  const issues = validateSheetLinks(sheets);
  assert.ok(issues.some(i => i.message.includes('No matching paired connector') && i.message.includes('X1')));
  console.log('  PASS');
}

{
  console.log('Gap #48 – Test 10: validateSheetLinks flags missing link_id');
  const sheets = [
    { name: 'Sheet 1', components: [makeSource('s1', '', 'Sheet 2')] }
  ];
  const issues = validateSheetLinks(sheets);
  assert.ok(issues.some(i => i.message === 'Sheet link has no link_id'));
  console.log('  PASS');
}

{
  console.log('Gap #48 – Test 11: validateSheetLinks flags missing linked_sheet');
  const sheets = [
    { name: 'Sheet 1', components: [makeSource('s1', 'L1', '')] }
  ];
  const issues = validateSheetLinks(sheets);
  assert.ok(issues.some(i => i.message === 'Sheet link has no target sheet set'));
  console.log('  PASS');
}

{
  console.log('Gap #48 – Test 12: validateSheetLinks returns empty for diagram with no sheet_link components');
  const sheets = [
    { name: 'Sheet 1', components: [makeBreaker('b1'), makeBreaker('b2')] }
  ];
  const issues = validateSheetLinks(sheets);
  assert.equal(issues.length, 0);
  console.log('  PASS');
}

// getSheetLinkBadgeText

{
  console.log('Gap #48 – Test 13: getSheetLinkBadgeText returns "→ Sheet 2" for link_source');
  const comp = makeSource('s1', 'L1', 'Sheet 2');
  const sheets = [{ name: 'Sheet 1' }, { name: 'Sheet 2' }];
  assert.equal(getSheetLinkBadgeText(comp, sheets), '→ Sheet 2');
  console.log('  PASS');
}

{
  console.log('Gap #48 – Test 14: getSheetLinkBadgeText returns "← Sheet 1" for link_target');
  const comp = makeTarget('t1', 'L1', 'Sheet 1');
  const sheets = [{ name: 'Sheet 1' }, { name: 'Sheet 2' }];
  assert.equal(getSheetLinkBadgeText(comp, sheets), '← Sheet 1');
  console.log('  PASS');
}

{
  console.log('Gap #48 – Test 15: getSheetLinkBadgeText returns empty string when linked_sheet is empty');
  const comp = makeSource('s1', 'L1', '');
  const sheets = [{ name: 'Sheet 1' }];
  assert.equal(getSheetLinkBadgeText(comp, sheets), '');
  console.log('  PASS');
}

// Migration v3 → v4

{
  console.log('Gap #48 – Test 16: migration v3→v4 renames target_sheet to linked_sheet on link_source');
  const v3Data = {
    version: 3,
    sheets: [{
      name: 'Sheet 1',
      components: [{
        id: 's1', type: 'sheet_link', subtype: 'link_source',
        props: { link_id: 'L1', target_sheet: 'Sheet 2', notes: '' }
      }]
    }]
  };
  const result = migrateV3toV4(v3Data);
  const migratedComp = result.sheets[0].components[0];
  assert.equal(migratedComp.props.linked_sheet, 'Sheet 2');
  assert.ok(!('target_sheet' in migratedComp.props), 'target_sheet should be removed');
  assert.equal(result.version, 4);
  console.log('  PASS');
}

{
  console.log('Gap #48 – Test 17: migration v3→v4 renames from_sheet to linked_sheet on link_target');
  const v3Data = {
    version: 3,
    sheets: [{
      name: 'Sheet 2',
      components: [{
        id: 't1', type: 'sheet_link', subtype: 'link_target',
        props: { link_id: 'L1', from_sheet: 'Sheet 1', notes: '' }
      }]
    }]
  };
  const result = migrateV3toV4(v3Data);
  const migratedComp = result.sheets[0].components[0];
  assert.equal(migratedComp.props.linked_sheet, 'Sheet 1');
  assert.ok(!('from_sheet' in migratedComp.props), 'from_sheet should be removed');
  assert.equal(result.version, 4);
  console.log('  PASS');
}

console.log('\nAll Gap #48 cross-sheet off-page connector tests passed.');
