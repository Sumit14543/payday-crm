const { bootstrap } = require('../database/bootstrap');

async function databaseReady(req, res, next) {
  try {
    await bootstrap();
    return next();
  } catch (error) {
    const { formatDatabaseError } = require('../config/db');
    return res.status(503).json({
      success: false,
      message: process.env.NODE_ENV === 'production'
        ? 'Service temporarily unavailable. Please try again shortly.'
        : formatDatabaseError(error),
    });
  }
}

module.exports = databaseReady;
