import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const sources = [
  {
    file: 'tcc-number-153-2.xlsx',
    sheet: '153_2',
    inspectRange: 'P1:AC100',
    renderRange: 'N1:AE100',
    preview: 'minimum-melting.png',
  },
  {
    file: 'tcc-number-153-2-2.xlsx',
    sheet: '153_22',
    inspectRange: 'N1:AA100',
    renderRange: 'L1:AC100',
    preview: 'total-clearing.png',
  },
];

for (const source of sources) {
  const input = await FileBlob.load(new URL(source.file, import.meta.url).pathname.slice(1));
  const workbook = await SpreadsheetFile.importXlsx(input);
  const sheetSummary = await workbook.inspect({
    kind: 'sheet',
    include: 'id,name',
    maxChars: 3000,
  });
  const region = await workbook.inspect({
    kind: 'region',
    sheetId: source.sheet,
    range: source.inspectRange,
    maxChars: 12000,
    tableMaxRows: 100,
    tableMaxCols: 16,
    tableMaxCellChars: 80,
  });
  console.log(`=== ${source.file} sheets ===`);
  console.log(sheetSummary.ndjson);
  console.log(`=== ${source.file} ${source.inspectRange} ===`);
  console.log(region.ndjson);

  const preview = await workbook.render({
    sheetName: source.sheet,
    range: source.renderRange,
    scale: 1,
    format: 'png',
  });
  await fs.writeFile(new URL(source.preview, import.meta.url), new Uint8Array(await preview.arrayBuffer()));
}
