const { query } = require('../config/db');

async function getHealth(req, res) {
  try {
    const db = await query('SELECT 1 AS ok');
    res.json({
      status: 'ok',
      service: 'payday-loan-crm-api',
      database: db[0]?.ok === 1 ? 'connected' : 'unknown',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(503).json({
      status: 'degraded',
      success: false,
      service: 'payday-loan-crm-api',
      database: 'disconnected',
      message: isDev ? error.message : 'Database service temporarily unavailable.',
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = { getHealth };
