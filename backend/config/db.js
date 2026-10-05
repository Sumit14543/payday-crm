const mysql = require('mysql');
const { AsyncLocalStorage } = require('async_hooks');
const { config } = require('./env');

const MASTER_DB_NAME = process.env.DB_MASTER_NAME || `${process.env.DB_PREFIX || ''}payday_crm_master`;

let masterPool;
let defaultPool;
let connectionPromise;

// Cache map for tenant connection pools: tenantSlug -> Pool
const tenantPools = new Map();

// Local storage context for request-specific pool switching
const tenantLocalStorage = new AsyncLocalStorage();

function createDatabaseIfNeeded(dbName = config.db.database) {
  if (!config.db.autoCreate) {
    console.log(`[DB] Database auto-creation is disabled (DB_AUTO_CREATE=false). Skipping creation for: ${dbName}`);
    return Promise.resolve();
  }

  const connection = mysql.createConnection({
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    port: config.db.port,
    multipleStatements: true,
  });

  return new Promise((resolve, reject) => {
    connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      (error) => {
        connection.end();
        if (error) {
          error.database = dbName;
          reject(error);
        } else {
          resolve();
        }
      },
    );
  });
}

function connectDatabase() {
  if (connectionPromise) return connectionPromise;

  // 1. Create master DB pool
  masterPool = mysql.createPool({
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    port: config.db.port,
    database: MASTER_DB_NAME,
    connectionLimit: 5,
    multipleStatements: true,
    charset: 'UTF8MB4_UNICODE_CI',
    connectTimeout: 10000,
    acquireTimeout: 10000,
  });

  // 2. Create default tenant pool (for Waqt Finance)
  defaultPool = mysql.createPool({
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    port: config.db.port,
    database: config.db.database,
    connectionLimit: config.db.connectionLimit,
    multipleStatements: true,
    charset: 'UTF8MB4_UNICODE_CI',
    connectTimeout: 10000,
    acquireTimeout: 10000,
  });

  // Store in cache map under default slug
  tenantPools.set('waqtfinance', defaultPool);

  connectionPromise = new Promise((resolve, reject) => {
    masterPool.query('SELECT 1 AS ok', (err) => {
      if (err) {
        connectionPromise = null;
        masterPool = null;
        defaultPool = null;
        err.database = MASTER_DB_NAME;
        return reject(err);
      }
      resolve();
    });
  });

  return connectionPromise;
}

function getTenantPool(tenantConfig) {
  const slug = tenantConfig.slug;
  if (tenantPools.has(slug)) {
    return tenantPools.get(slug);
  }

  const rawHost = tenantConfig.db_host || config.db.host;
  const host = rawHost === 'localhost' ? '127.0.0.1' : rawHost;

  const pool = mysql.createPool({
    host,
    user: tenantConfig.db_user || config.db.user,
    password: tenantConfig.db_password || config.db.password,
    port: tenantConfig.db_port || config.db.port,
    database: tenantConfig.db_name,
    connectionLimit: config.db.connectionLimit,
    multipleStatements: true,
    charset: 'UTF8MB4_UNICODE_CI',
    connectTimeout: 10000,
    acquireTimeout: 10000,
  });

  tenantPools.set(slug, pool);
  return pool;
}

function isDatabaseInitialized() {
  return Boolean(masterPool && defaultPool);
}

function query(sql, params = []) {
  // Retrieve request-specific pool from AsyncLocalStorage context
  const store = tenantLocalStorage.getStore();
  const activePool = store && store.pool ? store.pool : defaultPool;

  if (!activePool) {
    return Promise.reject(new Error('Database pool has not been initialized'));
  }

  return new Promise((resolve, reject) => {
    activePool.query(sql, params, (error, results) => {
      if (error) {
        if (activePool.config && activePool.config.connectionConfig) {
          error.database = activePool.config.connectionConfig.database;
        }
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

function queryMaster(sql, params = []) {
  if (!masterPool) {
    return Promise.reject(new Error('Master Database pool has not been initialized'));
  }

  return new Promise((resolve, reject) => {
    masterPool.query(sql, params, (error, results) => {
      if (error) {
        error.database = MASTER_DB_NAME;
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

function getActiveBrand() {
  const store = tenantLocalStorage.getStore();
  const tenant = store && store.tenant ? store.tenant : null;
  if (tenant) {
    return {
      slug: tenant.slug,
      name: tenant.name || 'Waqt Finance',
      cin: tenant.cin || 'CIN-U67120RJ1995PTC009521',
      gstin: tenant.gstin || 'GSTIN : 08AAACW1509R1ZX',
      website: tenant.website || 'www.waqtfinance.com',
      lender: tenant.lender || 'WAQT FINANCE PRIVATE LIMITED',
      address: tenant.address || '15 K- 5 Jyoti Nagar Housing Board Colony, Sahakar Marg, Jaipur, Rajasthan 302005',
      phone: tenant.phone || '+91 92170 86608',
      email: tenant.email || 'customercare@waqtfinance.com',
      logoUrl: tenant.logo_url || '/logo.webp',
      themeColor: tenant.theme_color || (tenant.slug === 'waqtfinance' ? '#059669' : '#16a34a'),
    };
  }
  return {
    name: 'Waqt Finance',
    cin: 'CIN-U67120RJ1995PTC009521',
    gstin: 'GSTIN : 08AAACW1509R1ZX',
    website: 'www.waqtfinance.com',
    lender: 'WAQT FINANCE PRIVATE LIMITED',
    address: '15 K- 5 Jyoti Nagar Housing Board Colony, Sahakar Marg, Jaipur, Rajasthan 302005',
    phone: '+91 92170 86608',
    email: 'customercare@waqtfinance.com',
    logoUrl: '/logo.webp',
    themeColor: '#059669',
  };
}

function formatDatabaseError(error) {
  const dbName = (error && error.database) || config.db.database;
  if (error && error.code === 'ER_ACCESS_DENIED_ERROR') {
    return [
      'MySQL access denied.',
      `Tried ${config.db.user}@${config.db.host}:${config.db.port}/${dbName}.`,
      'Check DB_USER and DB_PASS/DB_PASSWORD in backend/.env.',
    ].join(' ');
  }

  if (error && error.code === 'ER_DBACCESS_DENIED_ERROR') {
    return [
      'MySQL user does not have permission for this database operation.',
      `Tried ${config.db.user}@${config.db.host}:${config.db.port}/${dbName}.`,
      'For hosted MySQL, keep DB_AUTO_CREATE=false and create the database from the hosting panel.',
    ].join(' ');
  }

  if (error && error.code === 'ER_BAD_DB_ERROR') {
    return [
      'MySQL database was not found.',
      `Tried ${config.db.host}:${config.db.port}/${dbName}.`,
      'Check DB_NAME, or set DB_AUTO_CREATE=true only for a user allowed to create databases.',
    ].join(' ');
  }

  if (error && ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'PROTOCOL_SEQUENCE_TIMEOUT'].includes(error.code)) {
    const isLocalhost = config.db.host === 'localhost';
    return [
      'Could not connect to MySQL.',
      `Tried ${config.db.host}:${config.db.port}.`,
      isLocalhost ? 'Tip: If MySQL is bound to 127.0.0.1 on a custom port (like 2499), try setting DB_HOST=127.0.0.1 instead of localhost in backend/.env.' : '',
      'Check DB_HOST/DB_PORT, remote MySQL access, firewall, and hosting IP allowlist.',
    ].filter(Boolean).join(' ');
  }

  return error && error.message ? error.message : String(error);
}

module.exports = {
  connectDatabase,
  createDatabaseIfNeeded,
  formatDatabaseError,
  isDatabaseInitialized,
  getTenantPool,
  tenantLocalStorage,
  query,
  queryMaster,
  getActiveBrand,
};
