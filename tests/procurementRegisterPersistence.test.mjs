import assert from 'node:assert/strict';
import {
  exportProject,
  getProcurementRegister,
  importProject,
  setProcurementRegister
} from '../dataStore.mjs';

const register = [{
  spec_key: 'v2::type=power|size=%2312%20awg|material=copper',
  vendor: 'Example Vendor',
  quote_number: 'Q-100',
  need_by_date: '2026-09-01',
  lead_time_weeks: 8,
  po_number: 'PO-100',
  status: 'Ordered',
  promised_delivery_date: '2026-08-28',
  received_quantity_ft: 250,
}];

setProcurementRegister(register);
assert.deepStrictEqual(getProcurementRegister(), register);

const exported = exportProject();
assert.deepStrictEqual(exported.settings.procurementRegister, register);

setProcurementRegister([]);
assert.deepStrictEqual(getProcurementRegister(), []);
assert.strictEqual(importProject(exported), true);
assert.deepStrictEqual(getProcurementRegister(), register);

console.log('✓ procurement register survives project export/import');
