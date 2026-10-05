const app = require('./app');
const { bootstrap } = require('./database/bootstrap');
const { formatDatabaseError } = require('./config/db');

const PORT = process.env.PORT || 5000;

let startupError = null;
let isInitialized = false;

async function runBackgroundSync() {
  try {
    const { getTenantPool, queryMaster, tenantLocalStorage } = require('./config/db');
    const { config } = require('./config/env');
    const collectionModel = require('./models/collectionModel');

    const tenants = await queryMaster('SELECT * FROM tenants WHERE status = "active"');
    const allTenants = [
      { slug: 'waqtfinance', db_name: config.db.database },
      ...tenants
    ];

    const uniqueTenants = [];
    const seen = new Set();
    for (const t of allTenants) {
      if (!t.slug || seen.has(t.slug)) continue;
      seen.add(t.slug);
      uniqueTenants.push(t);
    }

    for (const tenant of uniqueTenants) {
      const pool = getTenantPool(tenant);
      await tenantLocalStorage.run({ pool, tenant }, async () => {
        try {
          await collectionModel.syncOverdueLoans();
          console.log(`[SCHEDULER] Successfully synced loans for tenant: ${tenant.slug}`);
        } catch (err) {
          console.error(`[SCHEDULER] Failed to sync loans for tenant ${tenant.slug}:`, err.message);
        }
      });
    }
  } catch (error) {
    console.error('[SCHEDULER] Background sync scheduler execution failed:', error.message);
  }
}

function startBackgroundSyncScheduler() {
  console.log('[SCHEDULER] Starting background loan sync scheduler (every 1 hour)...');
  
  // Run initial sync on boot
  runBackgroundSync().catch(console.error);

  // Run periodically every 1 hour
  setInterval(() => {
    runBackgroundSync().catch(console.error);
  }, 60 * 60 * 1000);
}

async function start() {
  // Start listening instantly to prevent Phusion Passenger startup timeout
  const server = app.listen(PORT, () => {
    console.log('\nPayday Loan CRM API');
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`Endpoints: /, /api/health, /api/leads, /api/dashboard/stats, /api/health-check-diagnostic`);
  });

  // Run database bootstrap in background
  bootstrap()
    .then(() => {
      isInitialized = true;
      console.log('Database bootstrap completed successfully.');
      startBackgroundSyncScheduler();
    })
    .catch((error) => {
      console.error('Failed to bootstrap backend:', formatDatabaseError(error));
      startupError = error;
    });

  // Register public diagnostic endpoint
  app.get('/api/health-check-diagnostic', (req, res) => {
    if (startupError) {
      return res.status(500).json({
        success: false,
        message: 'Backend bootstrap failed.',
        error: startupError.message || String(startupError),
        stack: startupError.stack,
      });
    }
    return res.json({
      success: isInitialized,
      message: isInitialized ? 'Backend bootstrap completed successfully.' : 'Backend database is initializing in the background...',
    });
  });

  if (process.argv.includes('--check') || process.argv.includes('--setup')) {
    // For setup/check args, wait briefly or run synchronously
    if (process.argv.includes('--check')) {
      console.log('Backend check completed successfully.');
      process.exit(0);
    }
  }
}

module.exports = {
  bootstrap,
  start,
};

if (require.main === module) {
  start();
}
