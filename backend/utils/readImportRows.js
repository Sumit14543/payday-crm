const { Worker } = require('worker_threads');
const path = require('path');
function readImportRows(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > 10 * 1024 * 1024) return Promise.reject(new Error('Upload a spreadsheet of at most 10 MB.'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'spreadsheetWorker.js'), { workerData: buffer, resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 } });
    let finished = false;
    const finish = (error, rows) => { if (finished) return; finished = true; clearTimeout(timer); worker.terminate().catch(() => {}); if (error) reject(error); else resolve(rows); };
    const timer = setTimeout(() => finish(new Error('Spreadsheet processing timed out. Split the file into smaller uploads.')), 15000);
    worker.once('message', message => finish(message.error ? new Error(message.error) : null, message.rows));
    worker.once('error', () => finish(new Error('Spreadsheet exceeded safe processing limits or is invalid.')));
    worker.once('exit', () => { if (!finished) finish(new Error('Spreadsheet processing stopped before completion.')); });
  });
}
module.exports = { readImportRows };
