// Real concurrent SQL, only in a verified non-production DB and random probe tables.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert/strict');
function values(file) {
  const result = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/);
    if (match) result[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return result;
}
async function main() {
  const candidate = path.resolve(__dirname, '..'), live = process.env.CRM_LIVE_ROOT || '/home/waqtmoney/public_html/payday-api';
  assert.notEqual(candidate, path.resolve(live));
  const prod = values(path.join(live, '.env')), testing = values(path.join(live, '../testing-api/.env'));
  const testModeFile = path.join(live, '../testing-api/.env.development');
  if (fs.existsSync(testModeFile)) Object.assign(testing, values(testModeFile));
  assert.ok(testing.DB_NAME && prod.DB_NAME && testing.DB_NAME !== prod.DB_NAME);
  const mysql = require('../node_modules/mysql');
  const master = prod.DB_MASTER_NAME || `${prod.DB_PREFIX || ''}payday_crm_master`;
  assert.match(master, /^[a-zA-Z0-9_-]+$/);
  const connection = mysql.createConnection({ host: prod.DB_HOST, port: Number(prod.DB_PORT || 3306), user: prod.DB_USER, password: prod.DB_PASSWORD ?? prod.DB_PASS, database: prod.DB_NAME });
  try {
    const companies = await new Promise((resolve, reject) => connection.query('SELECT db_name FROM `' + master + '`.tenants WHERE status="active"', (error, rows) => error ? reject(error) : resolve(rows)));
    assert.ok(!companies.some(company => company.db_name === testing.DB_NAME));
  } finally { connection.end(); }
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_NAME', 'DB_PASSWORD', 'DB_PASS']) process.env[key] = testing[key] || '';
  process.env.DB_PASSWORD = testing.DB_PASSWORD ?? testing.DB_PASS ?? '';
  process.env.NODE_ENV = 'production'; process.env.DB_AUTO_CREATE = 'false'; delete process.env.PORT;
  process.env.CORS_ORIGIN = 'https://synthetic-security-test.invalid';
  const db = require('../config/db'), originalQuery = db.query;
  db.queryMaster = async () => { throw new Error('Master writes prohibited'); };
  const suffix = crypto.randomBytes(10).toString('hex');
  const sanctions = 'security_sanctions_' + suffix, leads = 'security_leads_' + suffix;
  for (const name of [sanctions, leads]) assert.match(name, /^security_(?:sanctions|leads)_[a-f0-9]{20}$/);
  db.query = (sql, params) => originalQuery(sql.replace(/\blead_sanctions\b/g, '`' + sanctions + '`'), params);
  const stub = (file, exports) => { const key = require.resolve(path.join(candidate, file)); require.cache[key] = { id: key, filename: key, loaded: true, exports }; };
  let activities = 0, mails = 0, failLead = false;
  stub('models/leadModel.js', {
    findById: async () => ({ rawId: '1', id: 'APP-SYN', name: 'Synthetic borrower' }),
    updateStatus: async (_id, status) => { if (failLead) throw new Error('Synthetic lead rollback'); await originalQuery('UPDATE `' + leads + '` SET status=? WHERE id=1', [status]); },
  });
  stub('models/activityModel.js', { createForLead: async () => { activities++; } });
  stub('services/sanctionLetterService.js', { sendSanctionDecisionConfirmationEmail: async () => { mails++; } });
  global.fetch = async () => { throw new Error('Provider access prohibited'); };
  const pool = db.getTenantPool({ slug: 'security-probe', db_name: testing.DB_NAME });
  let createdSanctions = false, createdLeads = false;
  try {
    await db.tenantLocalStorage.run({ pool, tenant: { slug: 'security-probe' } }, async () => {
      assert.equal((await originalQuery('SELECT DATABASE() AS name'))[0].name, testing.DB_NAME);
      await originalQuery('CREATE TABLE `' + sanctions + '` (id INT PRIMARY KEY, lead_id VARCHAR(30), application_id VARCHAR(30), decision_token VARCHAR(100), customer_decision VARCHAR(20), customer_decision_at DATETIME NULL, customer_decision_notes TEXT, customer_decision_ip VARCHAR(100), customer_decision_user_agent VARCHAR(500), status VARCHAR(20), superseded_by_sanction_id INT NULL, created_at DATETIME NOT NULL) ENGINE=InnoDB'); createdSanctions = true;
      await originalQuery('CREATE TABLE `' + leads + '` (id INT PRIMARY KEY, status VARCHAR(30)) ENGINE=InnoDB'); createdLeads = true;
      await originalQuery('INSERT INTO `' + leads + '` VALUES (1, "Recommended")');
      await originalQuery('INSERT INTO `' + sanctions + '` (id,lead_id,application_id,decision_token,customer_decision,status,created_at) VALUES (1,"1","APP-SYN","SYN-TOKEN","pending","sent",NOW())');
      const service = require('../services/customerSanctionDecisionService');
      const results = await Promise.all([service.record('SYN-TOKEN', 'accept'), service.record('SYN-TOKEN', 'reject')]);
      assert.equal(results[0].customerDecision, results[1].customerDecision);
      const saved = (await originalQuery('SELECT customer_decision FROM `' + sanctions + '` WHERE id=1'))[0].customer_decision;
      assert.equal(saved, results[0].customerDecision);
      assert.equal((await originalQuery('SELECT status FROM `' + leads + '` WHERE id=1'))[0].status, saved === 'accepted' ? 'Approved' : 'Rejected');
      assert.equal(activities, 1); assert.equal(mails, 1);
      await originalQuery('UPDATE `' + sanctions + '` SET customer_decision="pending",status="sent" WHERE id=1');
      await originalQuery('UPDATE `' + leads + '` SET status="Recommended" WHERE id=1');
      failLead = true;
      await assert.rejects(service.record('SYN-TOKEN', 'accept'), /Synthetic lead rollback/);
      assert.equal((await originalQuery('SELECT customer_decision FROM `' + sanctions + '` WHERE id=1'))[0].customer_decision, 'pending');
      assert.equal((await originalQuery('SELECT status FROM `' + leads + '` WHERE id=1'))[0].status, 'Recommended');
      assert.equal(mails, 1);
      await originalQuery('UPDATE `' + sanctions + '` SET status="superseded",superseded_by_sanction_id=2 WHERE id=1');
      await assert.rejects(service.record('SYN-TOKEN', 'accept'), error => error.statusCode === 409);
    });
    console.log(JSON.stringify({ sanctionSqlSelfTest: 'passed', concurrentOppositeDecisionsConsistent: true, repeatedNotifications: false, failedLeadUpdateRolledBackDecision: true, supersededTokenDenied: true, productionFinancialWrites: false, emailsSent: false, providerCalls: false }));
  } finally {
    await db.tenantLocalStorage.run({ pool }, async () => {
      if (createdSanctions) await originalQuery('DROP TABLE `' + sanctions + '`');
      if (createdLeads) await originalQuery('DROP TABLE `' + leads + '`');
    });
    await new Promise(resolve => pool.end(resolve));
  }
}
main().catch(error => { console.error(JSON.stringify({ sanctionSqlSelfTest: 'failed', code: error.code || error.name, location: String(error.stack || '').split('\n').slice(1, 3) })); process.exitCode = 1; });
