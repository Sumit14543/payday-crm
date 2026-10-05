function success(res, data, message = 'OK', statusCode = 200) {
  return res.status(statusCode).json({ success: true, data, message });
}

function notFound(res, message = 'Resource not found') {
  return res.status(404).json({ success: false, message });
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => body[field] === undefined || body[field] === null || String(body[field]).trim() === '');
  if (!missing.length) return;

  const error = new Error(`Missing required field(s): ${missing.join(', ')}`);
  error.statusCode = 400;
  error.publicMessage = error.message;
  throw error;
}

module.exports = {
  notFound,
  requireFields,
  success,
};
