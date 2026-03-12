const assert = require('assert');

function describe(name, fn){
  console.log(name); fn();
}
function it(name, fn){
  try { fn(); console.log('  \u2713', name); }
  catch(err){ console.log('  \u2717', name); console.error(err); }
}

(async () => {
  global.window = { jspdf: { jsPDF: class {
    setFontSize() {}
    text() {}
    output() { return new ArrayBuffer(1); }
  } } };
  const { buildReportZip, setBranding } = await import('../reports/exportAll.mjs');
  describe('exportAll reports', () => {
    it('builds zip with pdf, csv and labels', async () => {
      setBranding({ title: 'Test', company: 'ACME' });
      const data = {
        equipment: [{ id: 'E1', name: 'Motor' }],
        analyses: { loadFlow: [{ id: 'B1', Vm: 1 }] },
        arcFlash: { BUS1: { incidentEnergy: 1, boundary: 2, equipmentTag: 'Main Switchboard' } }
      };
      const zip = buildReportZip(data);
      const files = Object.keys(zip.files);
      assert(files.includes('reports.pdf'));
      assert(files.includes('equipment_schedule.csv'));
      assert(files.includes('loadflow_analysis.csv'));
      assert(files.includes('Main_Switchboard.svg'));
    });
  });
})();
