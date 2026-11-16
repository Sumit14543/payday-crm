const test = require('node:test');
const assert = require('node:assert/strict');
const { readImportRows } = require('../backend/utils/readImportRows');
const xlsx = require('../backend/node_modules/xlsx');
test('bounded spreadsheet parser preserves valid Excel/CSV headers and payment amounts', async () => {
  const rows = await readImportRows(Buffer.from('Loan ID,Amount,UTR\nSYN-1,1250.50,SYN-UTR-1\n'));
  assert.equal(rows[0]['Loan ID'], 'SYN-1'); assert.equal(rows[0].Amount, 1250.5); assert.equal(rows[0].UTR, 'SYN-UTR-1');
  const sheet = xlsx.utils.json_to_sheet([{ 'Loan ID': 'SYN-2', Amount: 1100, UTR: 'SYN-UTR-2' }]), book = xlsx.utils.book_new(); xlsx.utils.book_append_sheet(book, sheet, 'Repayments');
  assert.equal((await readImportRows(xlsx.write(book, { type: 'buffer', bookType: 'xlsx' })))[0].Amount, 1100);
});
test('oversized spreadsheets and excessive rows are rejected before a repayment can run', async () => {
  await assert.rejects(readImportRows(Buffer.alloc(10 * 1024 * 1024 + 1)), /at most 10 MB/);
  await assert.rejects(readImportRows(Buffer.from('Loan ID,Amount,UTR\n' + Array.from({ length: 10001 }, (_, i) => `SYN-${i},100,UTR-${i}\n`).join(''))), /10,000/);
});
