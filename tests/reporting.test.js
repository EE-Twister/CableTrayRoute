const assert = require('assert');

function describe(name, fn){
  console.log(name);
  fn();
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
  const { toCSV, toPDF } = await import('../reports/reporting.mjs');
  const { generateArcFlashLabel } = await import('../reports/labels.mjs');

  describe('reporting engine', () => {
    it('exports CSV', () => {
      const headers = ['cable', 'length'];
      const rows = [{ cable: 'C1', length: 10 }];
      const csv = toCSV(headers, rows);
      assert(csv.includes('cable,length'));
      assert(csv.includes('C1,10'));
    });

    it('exports PDF', () => {
      const headers = ['cable', 'length'];
      const rows = [{ cable: 'C1', length: 10 }];
      const pdf = toPDF('Test', headers, rows);
      assert(pdf.byteLength > 0);
    });
  });

  describe('label templates', () => {
    it('fills template with data', () => {
      const svg = generateArcFlashLabel({
        equipment: 'MCC-1',
        incidentEnergy: '5 cal/cm^2',
        boundary: '3 ft'
      });
      assert(svg.includes('MCC-1'));
      assert(svg.includes('5 cal/cm^2'));
      assert(svg.includes('3 ft'));
    });
  });
})();
