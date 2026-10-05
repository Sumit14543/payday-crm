const { bootstrap } = require('../database/bootstrap');

async function databaseReady(req, res, next) {
  try {
    await bootstrap();
    return next();
  } catch (error) {
    const { formatDatabaseError } = require('../config/db');
    return res.status(503).json({
      success: false,
      message: formatDatabaseError(error),
    });
  }
}

module.exports = databaseReady;
