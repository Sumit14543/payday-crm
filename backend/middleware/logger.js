function logger(req, res, next) {
  if (req.url === '/api/health' || req.url === '/health' || req.url === '/api/health-check-diagnostic') {
    return next();
  }
  const path = String(req.path || req.url || '').split('?')[0].replace(/(\/(?:document-upload|esign|sanction-decision)\/)[^/]+/gi, '$1[redacted]');
  console.log(new Date().toISOString() + ' ' + req.method + ' ' + path);
  next();
}

module.exports = logger;
