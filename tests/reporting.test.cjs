const assert = require('assert');

const pending = [];

function describe(name, fn){
  console.log(name);
  fn();
}

function it(name, fn){
  const task = (async () => fn())()
    .then(() => console.log('  \u2713', name))
    .catch(err => { console.log('  \u2717', name); console.error(err); });
  pending.push(task);
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

    it('exports PDF', async () => {
      const headers = ['cable', 'length'];
      const rows = [{ cable: 'C1', length: 10 }];
      const pdf = await toPDF('Test', headers, rows);
      assert(pdf.byteLength > 0);
    });

    it('neutralizes spreadsheet formula strings in CSV cells', () => {
      const headers = ['name', 'value'];
      const rows = [{ name: '=HYPERLINK("https://example.com")', value: '  +SUM(1,2)' }];
      const csv = toCSV(headers, rows);
      assert(csv.includes("'=HYPERLINK"));
      assert(csv.includes("'  +SUM(1,2)"));
    });

    it('keeps numeric values unchanged for CSV exports', () => {
      const headers = ['delta'];
      const rows = [{ delta: -5 }];
      const csv = toCSV(headers, rows);
      assert(csv.includes('-5'));
      assert(!csv.includes("'-5"));
    });

    it('quotes cells containing line breaks so a row does not split', () => {
      const csv = toCSV(['note', 'tag'], [{ note: 'line one\nline two', tag: 'A' }]);
      assert.strictEqual(csv, 'note,tag\n"line one\nline two",A');
      assert.strictEqual(csv.split('\n').length, 3, 'the multi-line cell spans lines inside its quotes');
    });

    it('leaves a negative number stored as text alone but still neutralises formulas', () => {
      const csv = toCSV(['v'], [{ v: '-5' }, { v: '-0.25e-3' }, { v: '=1+1' }, { v: '-cmd|calc' }, { v: '\t=2' }]);
      const lines = csv.split('\n');
      assert.strictEqual(lines[1], '-5');
      assert.strictEqual(lines[2], '-0.25e-3');
      assert.strictEqual(lines[3], "'=1+1");
      assert.strictEqual(lines[4], "'-cmd|calc");
      assert.ok(lines[5].startsWith("'\t="), 'tab-prefixed formula is neutralised');
    });

    it('quotes headers that contain commas', () => {
      assert.strictEqual(toCSV(['Load, kW'], [{ 'Load, kW': 5 }]), '"Load, kW"\n5');
    });
  });

  describe('label templates', () => {
    it('fills template with data', () => {
      const svg = generateArcFlashLabel({
        signalWord: 'WARNING',
        signalColor: '#f57c00',
        equipmentTag: 'MCC-1',
        voltage: '480 V',
        incidentEnergy: '5 cal/cm² @ 1 ft 6 in',
        workingDistance: '1 ft 6 in (457 mm)',
        arcFlashBoundary: '3 ft (914 mm)',
        limitedApproach: '3 ft 6 in (1067 mm)',
        restrictedApproach: '1 ft (305 mm)',
        upstreamDevice: 'Main Breaker',
        ppeCategory: '2',
        studyDate: '2024-01-15'
      });
      assert(svg.includes('WARNING'));
      assert(svg.includes('MCC-1'));
      assert(svg.includes('5 cal/cm² @ 1 ft 6 in'));
      assert(svg.includes('3 ft (914 mm)'));
      assert(svg.includes('Main Breaker'));
      assert(svg.includes('Study Date'));
    });
  });
  await Promise.all(pending);
})();
