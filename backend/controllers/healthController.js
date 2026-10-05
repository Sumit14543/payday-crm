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
    res.status(503).json({
      status: 'degraded',
      success: false,
      service: 'payday-loan-crm-api',
      database: 'disconnected',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

async function restartServer(req, res) {
  res.json({ success: true, message: 'Server process restarting...' });
  setTimeout(() => {
    process.exit(0);
  }, 500);
}

module.exports = { getHealth, restartServer };
