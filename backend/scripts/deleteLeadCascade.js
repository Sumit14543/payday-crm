const mysql = require('mysql');
const { config } = require('../config/env');

const [, , tenantSlug, leadIdentifier] = process.argv;

if (!tenantSlug || !leadIdentifier) {
  console.log('\n❌ Missing arguments!');
  console.log('Usage: node scripts/deleteLeadCascade.js <tenant_slug> <lead_id_or_application_id>');
  console.log('Example: node scripts/deleteLeadCascade.js waqtfinance APP-00000000000000000000000000003102\n');
  process.exit(1);
}

// Determine database name based on tenant slug
let dbName;
if (tenantSlug === 'waqtfinance') {
  dbName = config.db.database;
} else {
  const dbPrefix = process.env.DB_PREFIX || '';
  dbName = `${dbPrefix}payday_${tenantSlug}`;
}

const connection = mysql.createConnection({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  port: config.db.port,
  database: dbName,
});

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

async function main() {
  console.log('========================================================');
  console.log('🗑️  CASCADE DELETE LEAD TOOL');
  console.log('========================================================');
  console.log(`Tenant Slug     : ${tenantSlug}`);
  console.log(`Database        : ${dbName}`);
  console.log(`Lead Identifier : ${leadIdentifier}`);
  console.log('--------------------------------------------------------\n');

  try {
    // Connect to database
    await new Promise((resolve, reject) => {
      connection.connect((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✅ Connected to database.');

    // 1. Resolve the lead
    const leads = await runQuery(
      'SELECT id, application_id, mobile, email, pan_number FROM loan_applications WHERE application_id = ? OR id = ? OR source_lead_id = ? LIMIT 1',
      [leadIdentifier, Number.isInteger(Number(leadIdentifier)) ? Number(leadIdentifier) : -1, leadIdentifier]
    );

    if (!leads.length) {
      console.log('❌ Lead not found in database. Double-check the ID.');
      connection.end();
      process.exit(0);
    }

    const lead = leads[0];
    const applicationId = lead.application_id || '';
    const leadId = lead.id || '';
    const mobile = lead.mobile || '';
    const email = lead.email || '';
    const pan = lead.pan_number || '';

    let customerId = '';
    if (mobile || email) {
      const customers = await runQuery(
        'SELECT id FROM customers WHERE (phone = ? AND phone != "") OR (email = ? AND email != "") LIMIT 1',
        [mobile, email]
      );
      if (customers.length) {
        customerId = customers[0].id;
      }
    }

    console.log(`Found Lead:`);
    console.log(`- Lead ID (integer): ${leadId}`);
    console.log(`- Application ID   : ${applicationId}`);
    console.log(`- Customer ID      : ${customerId || 'None'}`);

    // 2. Resolve Loan IDs
    const scheduleLoans = await runQuery(
      'SELECT DISTINCT loan_id FROM loan_repayment_schedule WHERE lead_id = ? OR application_id = ?',
      [leadId, applicationId]
    );
    const accountingLoans = await runQuery(
      'SELECT DISTINCT loan_id FROM lead_accounting_payments WHERE lead_id = ? OR application_id = ?',
      [leadId, applicationId]
    );
    const loanIds = Array.from(new Set([
      ...scheduleLoans.map(l => l.loan_id),
      ...accountingLoans.map(l => l.loan_id)
    ])).filter(Boolean);

    if (loanIds.length) {
      console.log(`- Found Associated Loan IDs: ${loanIds.join(', ')}`);
    }

    // 3. Resolve Collection Case IDs
    let caseIds = [];
    if (loanIds.length) {
      const loanPlaceholder = loanIds.map(() => '?').join(', ');
      const cases = await runQuery(`
        SELECT id FROM collection_cases
        WHERE loan_id IN (${loanPlaceholder})
      `, loanIds);
      caseIds = cases.map(c => c.id).filter(Boolean);
    }
    if (caseIds.length) {
      console.log(`- Found Associated Collection Cases: ${caseIds.join(', ')}`);
    }

    console.log('\nStarting cascading deletion...');

    const counts = {};

    // Helper deletion function
    const deleteByLead = async (table) => {
      const result = await runQuery(
        `DELETE FROM ${table} WHERE lead_id = ? OR application_id = ?`,
        [leadId, applicationId]
      );
      counts[table] = result.affectedRows || 0;
    };

    // Lead tables deletion
    await deleteByLead('lead_accounting_payments');
    await deleteByLead('lead_loan_agreements');
    await deleteByLead('lead_sanctions');
    await deleteByLead('lead_esign_requests');
    await deleteByLead('lead_cam_sheets');
    await deleteByLead('lead_credit_handoffs');
    await deleteByLead('lead_document_requests');
    await deleteByLead('lead_document_checks');
    await deleteByLead('lead_followups');
    await deleteByLead('lead_call_logs');
    await deleteByLead('lead_status_events');
    await deleteByLead('lead_activities');
    await deleteByLead('lead_consents');
    await deleteByLead('aadhaar_reports');
    await deleteByLead('cibil_reports');

    // Loan tables deletion
    if (loanIds.length) {
      const placeholders = loanIds.map(() => '?').join(', ');
      
      const scheduleResult = await runQuery(`DELETE FROM loan_repayment_schedule WHERE loan_id IN (${placeholders})`, loanIds);
      counts.loan_repayment_schedule = scheduleResult.affectedRows || 0;

      const repaymentsResult = await runQuery(`DELETE FROM loan_repayments WHERE loan_id IN (${placeholders})`, loanIds);
      counts.loan_repayments = repaymentsResult.affectedRows || 0;

      const linksResult = await runQuery(`DELETE FROM payment_links WHERE loan_id IN (${placeholders})`, loanIds);
      counts.payment_links = linksResult.affectedRows || 0;

      const loansResult = await runQuery(`DELETE FROM loans WHERE id IN (${placeholders})`, loanIds);
      counts.loans = loansResult.affectedRows || 0;
    }

    // Collection tables deletion
    if (caseIds.length) {
      const placeholders = caseIds.map(() => '?').join(', ');

      const callsResult = await runQuery(`DELETE FROM collection_call_logs WHERE case_id IN (${placeholders})`, caseIds);
      counts.collection_call_logs = callsResult.affectedRows || 0;

      const followupsResult = await runQuery(`DELETE FROM collection_followups WHERE case_id IN (${placeholders})`, caseIds);
      counts.collection_followups = followupsResult.affectedRows || 0;

      const ptpsResult = await runQuery(`DELETE FROM collection_ptps WHERE case_id IN (${placeholders})`, caseIds);
      counts.collection_ptps = ptpsResult.affectedRows || 0;

      const casesResult = await runQuery(`DELETE FROM collection_cases WHERE id IN (${placeholders})`, caseIds);
      counts.collection_cases = casesResult.affectedRows || 0;
    }

    // Customer table deletion (only if they don't have other active leads)
    if (customerId && mobile) {
      const otherLeads = await runQuery(
        'SELECT COUNT(*) AS count FROM loan_applications WHERE mobile = ? AND id != ?',
        [mobile, leadId]
      );
      if (Number(otherLeads[0].count) === 0) {
        const customerResult = await runQuery('DELETE FROM customers WHERE id = ?', [customerId]);
        counts.customers = customerResult.affectedRows || 0;
        console.log('Customer record deleted since no other active leads were linked.');
      } else {
        console.log('Skipped customer deletion: customer has other active leads linked.');
      }
    }

    // Main lead table deletion
    const leadResult = await runQuery('DELETE FROM loan_applications WHERE id = ?', [leadId]);
    counts.loan_applications = leadResult.affectedRows || 0;

    console.log('\nDeletion counts:');
    Object.keys(counts).forEach(table => {
      if (counts[table] > 0) {
        console.log(`- ${table}: ${counts[table]} rows removed`);
      }
    });

    console.log('\n✅ Cascading deletion completed successfully.');

  } catch (error) {
    console.error('❌ Deletion failed:', error);
  } finally {
    connection.end();
  }
}

main();
