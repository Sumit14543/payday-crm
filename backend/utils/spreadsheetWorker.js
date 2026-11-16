const { parentPort, workerData } = require('worker_threads');
try {
  const xlsx = require('xlsx');
  const workbook = xlsx.read(Buffer.from(workerData), { type: 'buffer', sheetRows: 10002, sheets: 0, cellHTML: false, cellFormula: false, bookVBA: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = sheet ? xlsx.utils.sheet_to_json(sheet) : [];
  if (rows.length > 10000) throw new Error('Upload at most 10,000 repayment rows at a time.');
  parentPort.postMessage({ rows });
} catch (error) { parentPort.postMessage({ error: error.message }); }
