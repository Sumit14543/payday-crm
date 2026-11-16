const test = require('node:test'), assert = require('node:assert/strict');
const path = require('node:path');
const backend = name => require('../backend/node_modules/' + name);

test('patched mailer builds HTML mail with PDF attachment and original recipient/from fields', async () => {
  const transport = backend('nodemailer').createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  const result = await transport.sendMail({ from: 'Waqt Finance <synthetic@company.invalid>', to: 'borrower@example.invalid',
    subject: 'Synthetic sanction confirmation', html: '<p>Synthetic accepted sanction</p>',
    attachments: [{ filename: 'sanction.pdf', content: Buffer.from('%PDF-1.4\nSynthetic\n%%EOF'), contentType: 'application/pdf' }] });
  const mime = result.message.toString();
  assert.deepEqual(result.envelope.to, ['borrower@example.invalid']);
  assert.equal(result.envelope.from, 'synthetic@company.invalid');
  assert.match(mime, /Content-Type: multipart\/mixed/); assert.match(mime, /application\/pdf/);
  assert.match(mime, /Synthetic accepted sanction/);
});

test('patched native image processing preserves PNG logo resize and PDF buffer input compatibility', async () => {
  const sharp = backend('sharp');
  const original = await sharp({ create: { width: 320, height: 80, channels: 3, background: '#059669' } }).png().toBuffer();
  const output = await sharp(original).png().resize({ width: 160, withoutEnlargement: true }).toBuffer();
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 160); assert.equal(metadata.height, 40); assert.equal(metadata.format, 'png');
  const pdf = new (backend('pdfkit'))(); const buffers = [];
  await new Promise((resolve, reject) => { pdf.on('data', value => buffers.push(value)); pdf.on('end', resolve); pdf.on('error', reject); pdf.image(output, 10, 10); pdf.text('Synthetic sanction'); pdf.end(); });
  assert.equal(Buffer.concat(buffers).subarray(0, 5).toString(), '%PDF-');
});

test('patched nodemon matcher retains JS watch and node_modules ignore behavior', () => {
  const match = backend('nodemon/lib/monitor/match');
  const source = path.resolve('backend/controllers/synthetic.js'), ignored = path.resolve('node_modules/synthetic.js');
  const result = match([source, ignored], ['**/*.js', '!**/node_modules/**'], 'js');
  assert.ok(result.result.some(file => file.toLowerCase() === source.toLowerCase()));
  assert.ok(!result.result.some(file => file.toLowerCase() === ignored.toLowerCase()));
});

test('patched multipart parser accepts valid PDFs and rejects oversized or extra files', async () => {
  const express = backend('express'), multer = backend('multer');
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: 100 },
    fileFilter: (_req, file, callback) => callback(null, file.mimetype === 'application/pdf') });
  app.post('/proof', upload.single('proof'), (req, res) => res.json({ pdf: req.file?.buffer.subarray(0, 5).toString() }));
  app.use((error, _req, res, _next) => res.status(400).json({ code: error.code }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/proof';
    const form = new FormData(); form.append('proof', new Blob(['%PDF-1.4\nSynthetic'], { type: 'application/pdf' }), 'proof.pdf');
    const valid = await fetch(url, { method: 'POST', body: form }); assert.equal(valid.status, 200); assert.equal((await valid.json()).pdf, '%PDF-');
    const large = new FormData(); large.append('proof', new Blob(['%PDF-' + 'x'.repeat(120)], { type: 'application/pdf' }), 'proof.pdf');
    const rejected = await fetch(url, { method: 'POST', body: large }); assert.equal(rejected.status, 400); assert.equal((await rejected.json()).code, 'LIMIT_FILE_SIZE');
    const extra = new FormData(); for (const name of ['one.pdf', 'two.pdf']) extra.append('proof', new Blob(['%PDF-'], { type: 'application/pdf' }), name);
    const duplicate = await fetch(url, { method: 'POST', body: extra }); assert.equal(duplicate.status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
