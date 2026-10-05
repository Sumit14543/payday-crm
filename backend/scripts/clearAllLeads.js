const { connectDatabase, query } = require('../config/db');

async function purgeAllLeads() {
  await connectDatabase();
  console.log('--- PURGING ALL LEADS AND LOAN APPLICATIONS FROM DATABASE ---');

  const leadTables = [
    'lead_call_logs',
    'lead_followups',
    'lead_document_checks',
    'lead_document_requests',
    'lead_credit_handoffs',
    'lead_cam_sheets',
    'lead_sanctions',
    'lead_loan_agreements',
    'lead_esign_requests',
    'lead_accounting_payments',
    'lead_activities',
    'lead_status_events',
    'lead_consents',
    'loan_repayment_schedule',
    'loan_repayments',
    'collection_call_logs',
    'collection_followups',
    'collection_ptps',
    'collection_cases',
    'loans',
    'customers',
    'aadhaar_reports',
    'cibil_reports',
    'income_lines',
    'invoices',
    'commissions',
    'payment_links',
    'integration_ingestion_logs',
    'loan_applications'
  ];

  await query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of leadTables) {
    try {
      await query(`DELETE FROM ${table}`);
      console.log(`Cleared table: ${table}`);
    } catch (err) {
      console.error(`Failed clearing ${table}:`, err.message);
    }
  }
  await query('SET FOREIGN_KEY_CHECKS = 1');

  const count = await query('SELECT COUNT(*) AS total FROM loan_applications');
  console.log('Total loan_applications remaining in DB:', count[0].total);
  process.exit(0);
}

purgeAllLeads();
