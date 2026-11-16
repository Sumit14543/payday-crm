const sessions = require('../services/authSessions');
async function verifyTenantSession(req, res, next) {
  if (req.user) {
    try { req.user = await sessions.verifySession(req.user); }
    catch (error) { req.user = null; return next(error); }
  }
  next();
}
module.exports = verifyTenantSession;
module.exports.clearSessionCache = () => {};
