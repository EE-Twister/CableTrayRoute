import assert from 'assert';
import { csvCell } from '../utils/csv.mjs';

assert.strictEqual(csvCell('plain'), 'plain');
assert.strictEqual(csvCell(null), '');
assert.strictEqual(csvCell(42), '42');
assert.strictEqual(csvCell(-5), '-5', 'numbers are untouched');
assert.strictEqual(csvCell('-5'), '-5', 'numeric text is untouched');
assert.strictEqual(csvCell('=SUM(A1)'), "'=SUM(A1)", 'formula neutralised');
assert.strictEqual(csvCell('@cmd'), "'@cmd");
assert.strictEqual(csvCell('+1+1'), "'+1+1");
assert.strictEqual(csvCell('-x'), "'-x");
assert.strictEqual(csvCell('a,b'), '"a,b"');
assert.strictEqual(csvCell('say "hi"'), '"say ""hi"""');
assert.strictEqual(csvCell('one\ntwo'), '"one\ntwo"');
assert.strictEqual(csvCell('=A,B'), `"'=A,B"`, 'formula guard then quoting');
console.log('csvCell tests passed');
