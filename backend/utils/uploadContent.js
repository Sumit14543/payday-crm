const fs = require('fs/promises');
const path = require('path');
function recognizedType(header) {
  if (header.subarray(0, 5).toString() === '%PDF-') return ['.pdf', 'application/pdf'];
  if (header.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return ['.png', 'image/png'];
  if (header.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return ['.jpg', 'image/jpeg'];
  if (header.subarray(0, 4).toString() === 'RIFF' && header.subarray(8, 12).toString() === 'WEBP') return ['.webp', 'image/webp'];
  if (header.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex'))) return ['.webm', 'video/webm'];
  if (header.subarray(4, 8).toString() === 'ftyp') {
    const brand = header.subarray(8, 12).toString();
    if (brand === 'qt  ') return ['.mov', 'video/quicktime'];
    if (brand.startsWith('3g')) return ['.3gp', 'video/3gpp'];
    if (/^(isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV|dash)$/.test(brand)) return ['.mp4', 'video/mp4'];
  }
  return null;
}
async function removeFiles(files) { await Promise.allSettled(files.map(file => fs.unlink(file.path))); }
async function validateFiles(files) {
  try {
    for (const file of files) {
      const handle = await fs.open(file.path, 'r');
      let type;
      try { const bytes = Buffer.alloc(64); const { bytesRead } = await handle.read(bytes, 0, 64, 0); type = recognizedType(bytes.subarray(0, bytesRead)); }
      finally { await handle.close(); }
      const extension = path.extname(file.originalname || '').toLowerCase().replace('.jpeg', '.jpg');
      if (!type || type[0] !== extension) { const error = new Error('The uploaded file content does not match its document type.'); error.statusCode = 400; error.publicMessage = error.message; throw error; }
      file.mimetype = type[1];
    }
  } catch (error) { await removeFiles(files); throw error; }
}
module.exports = { recognizedType, validateFiles, removeFiles };
