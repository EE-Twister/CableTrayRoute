import assert from 'node:assert/strict';
import {
  assignCatalogProductToRoute,
  compatibleRouteCatalogProducts,
  routeCatalogOptionLabel
} from '../analysis/routingCatalog.mjs';

const approvedTray = {
  id: 'ACME-TRAY-24-4', manufacturer: 'Acme', catalogNumber: 'TR-24-4',
  category: 'tray', description: '24 in x 4 in tray', unit: 'EA', approved: true,
  source: 'Approved list', lastVerified: '2026-07-31',
  width_in: 24, depth_in: 4
};

const screeningTray = { ...approvedTray, id: 'SCREEN-TRAY', catalogNumber: 'SCREEN-24-4', approved: false };

function check(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

check('filters routing choices to compatible approved tray products', () => {
  const choices = compatibleRouteCatalogProducts([approvedTray, screeningTray], { inside_width: 24, tray_depth: 4 }, 'tray');
  assert.equal(choices.length, 1);
  assert.equal(routeCatalogOptionLabel(choices[0]), 'Acme TR-24-4 — 24 in × 4 in');
});

check('rejects unapproved and dimension-mismatched assignments', () => {
  const route = { tray_id: 'T-1', inside_width: 24, tray_depth: 4 };
  assert.equal(assignCatalogProductToRoute(route, screeningTray).valid, false);
  assert.equal(assignCatalogProductToRoute(route, { ...approvedTray, width_in: 12 }).valid, false);
});

check('stores a traceable approved-product snapshot on assigned route segments', () => {
  const result = assignCatalogProductToRoute({ tray_id: 'T-1', inside_width: 24, tray_depth: 4 }, approvedTray);
  assert.equal(result.valid, true);
  assert.equal(result.route.catalog_number, 'TR-24-4');
  assert.equal(result.route.approved_part, true);
  assert.equal(result.route.catalog_source, 'Approved list');
});
