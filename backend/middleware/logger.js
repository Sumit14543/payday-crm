function logger(req, res, next) {
  if (req.url === '/api/health' || req.url === '/health' || req.url === '/api/health-check-diagnostic') {
    return next();
  }
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
}

module.exports = logger;
