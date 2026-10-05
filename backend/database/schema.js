const { query } = require('../config/db');

const TARGET_CHARSET = 'utf8mb4';
const TARGET_COLLATION = 'utf8mb4_unicode_ci';
const APP_TABLES = [
  'loan_applications',
  'cibil_reports',
  'aadhaar_reports',
  'lead_activities',
  'lead_status_events',
  'lead_call_logs',
  'lead_followups',
  'lead_document_checks',
  'lead_document_requests',
  'lead_credit_handoffs',
  'lead_cam_sheets',
  'lead_esign_requests',
  'lead_sanctions',
  'lead_loan_agreements',
  'lead_accounting_payments',
  'audit_logs',
  'integration_ingestion_logs',
  'lead_consents',
  'loan_repayment_schedule',
  'loan_repayments',
  'payment_links',
  'crm_users',
  'team_members',
  'customers',
  'loans',
  'collection_cases',
  'collection_call_logs',
  'collection_followups',
  'collection_ptps',
  'commissions',
  'income_lines',
  'invoices',
];

async function ensureColumn(table, column, definition) {
  try {
    const rows = await query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
    if (rows && rows.length) return;

    await query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
  } catch (err) {
    if (err.message && (err.message.includes('Duplicate column') || err.message.includes('already exists'))) {
      return;
    }
    console.warn(`[schema] ensureColumn skipped for ${table}.${column}:`, err.message);
  }
}

async function normalizeDatabaseCollation() {
  try {
    await query(`ALTER DATABASE CHARACTER SET ${TARGET_CHARSET} COLLATE ${TARGET_COLLATION}`);
  } catch (err) {
    console.warn('[schema] normalizeDatabaseCollation skipped:', err.message);
  }
}

async function tableNeedsCollationRepair(table) {
  try {
    const rows = await query(`
      SELECT
        t.TABLE_COLLATION AS tableCollation,
        SUM(CASE
          WHEN c.COLLATION_NAME IS NOT NULL
            AND c.COLLATION_NAME <> ?
            AND c.COLLATION_NAME <> 'utf8mb4_bin'
          THEN 1 ELSE 0
        END) AS mismatchedColumns
      FROM information_schema.TABLES t
      LEFT JOIN information_schema.COLUMNS c
        ON c.TABLE_SCHEMA = t.TABLE_SCHEMA
        AND c.TABLE_NAME = t.TABLE_NAME
      WHERE t.TABLE_SCHEMA = DATABASE()
        AND t.TABLE_NAME = ?
      GROUP BY t.TABLE_COLLATION
    `, [TARGET_COLLATION, table]);

    if (!rows || !rows.length) return false;

    return rows[0].tableCollation !== TARGET_COLLATION || Number(rows[0].mismatchedColumns || 0) > 0;
  } catch (err) {
    return false;
  }
}

async function normalizeTableCollations() {
  for (const table of APP_TABLES) {
    try {
      if (await tableNeedsCollationRepair(table)) {
        await query(`ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET ${TARGET_CHARSET} COLLATE ${TARGET_COLLATION}`);
      }
    } catch (err) {
      console.warn(`[schema] normalizeTableCollations skipped for ${table}:`, err.message);
    }
  }
}

async function ensureIndex(table, indexName, definition) {
  try {
    const rows = await query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [indexName]);
    if (rows && rows.length) return;

    await query(`ALTER TABLE \`${table}\` ADD ${definition}`);
  } catch (err) {
    if (err.message && (err.message.includes('Duplicate key') || err.message.includes('already exists'))) {
      return;
    }
    console.warn(`[schema] ensureIndex skipped for ${table}.${indexName}:`, err.message);
  }
}

async function ensureLoanApplicationStatusSupportsAll() {
  const rows = await query(`
    SELECT COLUMN_TYPE AS columnType
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'loan_applications'
      AND COLUMN_NAME = 'status'
    LIMIT 1
  `);

  if (!rows.length) return;

  const columnType = String(rows[0]?.columnType || '').toLowerCase();
  
  // Check if it already contains all required statuses
  const required = ['closed', 'documents_pending', 'not_connected', 'send_to_credit'];
  const missing = required.filter(status => !columnType.includes(`'${status}'`));
  
  if (missing.length === 0) return;

  await query(`
    ALTER TABLE loan_applications
    MODIFY COLUMN status ENUM('draft','submitted','review','approved','rejected','disbursed','closed','documents_pending','not_connected','send_to_credit') DEFAULT 'draft'
  `);
}

async function repairActiveApplicationFlags() {
  await query(`
    UPDATE loan_applications
    SET is_active_application = CASE
      WHEN status IN ('rejected', 'closed') THEN 0
      ELSE 1
    END
    WHERE is_active_application IS NULL
      OR is_active_application <> CASE
        WHEN status IN ('rejected', 'closed') THEN 0
        ELSE 1
      END
  `);
}

async function repairClosedLoanApplicationStatuses() {
  await query(`
    UPDATE loan_applications la
    JOIN loan_repayment_schedule sched ON (la.application_id = sched.application_id OR la.id = sched.lead_id)
    JOIN loans l ON l.id = sched.loan_id
    SET la.status = 'closed', la.is_active_application = 0
    WHERE (l.status = 'Paid Off' OR l.balance <= 0)
      AND (la.status <> 'closed' OR la.is_active_application <> 0)
  `);

  await query(`
    UPDATE loan_applications la
    JOIN customers c ON la.mobile = c.phone
    JOIN loans l ON l.customer_id = c.id
    SET la.status = 'closed', la.is_active_application = 0
    WHERE (l.status = 'Paid Off' OR l.balance <= 0)
      AND (la.status <> 'closed' OR la.is_active_application <> 0)
  `);
}

async function repairUnworkedImportedLeadStatuses() {
  await query(`
    UPDATE loan_applications la
    SET la.status = 'draft'
    WHERE la.source_system IN ('waqtfinance', 'waqtmoney', 'geetpay', 'loaninwallet', 'salarywaves')
      AND la.status = 'submitted'
      AND la.ingested_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM lead_call_logs lcl
        WHERE lcl.application_id = la.application_id
          OR lcl.lead_id = CAST(la.id AS CHAR)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM lead_credit_handoffs lch
        WHERE lch.application_id = la.application_id
          OR lch.lead_id = CAST(la.id AS CHAR)
      )
  `);
}

async function repairUnworkedImportedLeadStatusEvents() {
  await query(`
    UPDATE lead_status_events lse
    INNER JOIN loan_applications la
      ON lse.source_key = CONCAT('bootstrap-status:', la.id)
    SET
      lse.status = 'New',
      lse.stage_key = 'application_received',
      lse.public_status = 'Application received',
      lse.title = 'Application received',
      lse.description = 'We have received your loan application.'
    WHERE la.source_system IN ('waqtfinance', 'waqtmoney', 'geetpay', 'loaninwallet', 'salarywaves')
      AND la.status = 'draft'
      AND lse.status <> 'New'
  `);
}

async function repairLeadSourceMetadata() {
  await query(`
    UPDATE loan_applications
    SET source_system = LOWER(TRIM(source))
    WHERE (
        source_system IS NULL
        OR TRIM(source_system) = ''
        OR LOWER(TRIM(source_system)) <> LOWER(TRIM(source))
      )
      AND LOWER(TRIM(COALESCE(source, ''))) IN ('waqtfinance', 'waqtmoney', 'geetpay', 'loaninwallet', 'salarywaves')
  `);

  await query(`
    UPDATE loan_applications
    SET source = LOWER(TRIM(source_system))
    WHERE (source IS NULL OR TRIM(source) = '' OR LOWER(TRIM(source)) LIKE 'manual -%')
      AND LOWER(TRIM(COALESCE(source_system, ''))) IN ('waqtfinance', 'waqtmoney', 'geetpay', 'loaninwallet', 'salarywaves')
  `);
}

function clean(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeReferenceType(value, index) {
  const fallback = index === 0 ? 'primary' : index === 1 ? 'secondary' : `reference_${index + 1}`;
  const normalized = clean(value || fallback).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  if (['primary', 'reference1', 'reference_1', 'ref1', 'ref_1', 'first', 'first_reference'].includes(normalized)) return 'primary';
  if (['secondary', 'reference2', 'reference_2', 'ref2', 'ref_2', 'second', 'second_reference'].includes(normalized)) return 'secondary';
  return normalized;
}

function referencesFromSourcePayload(payload = {}) {
  const payloadSources = [payload, payload.rawPayload && typeof payload.rawPayload === 'object' ? payload.rawPayload : {}];
  const explicitReferences = payloadSources.flatMap((source) => (
    Array.isArray(source.references)
      ? source.references
      : Array.isArray(source.referenceDetails)
        ? source.referenceDetails
        : Array.isArray(source.loanReferences)
          ? source.loanReferences
          : []
  ));
  const references = explicitReferences.map((reference, index) => ({
    referenceType: normalizeReferenceType(reference.referenceType || reference.reference_type || reference.type, index),
    fullName: clean(reference.fullName || reference.full_name || reference.name || reference.referenceName || reference.reference_name || ''),
    mobile: clean(reference.mobile || reference.phone || reference.mobileNumber || reference.mobile_number || reference.referenceMobile || reference.reference_mobile || ''),
    relation: clean(reference.relation || reference.relationship || reference.referenceRelation || reference.reference_relation || ''),
  }));

  payloadSources.flatMap((source) => [
    {
      referenceType: 'primary',
      fullName: source.reference1Name || source.reference1_name || source.ref1Name || source.ref1_name || source.reference1?.fullName || source.reference1?.full_name || source.reference1?.name,
      mobile: source.reference1Mobile || source.reference1_mobile || source.ref1Mobile || source.ref1_mobile || source.reference1?.mobile || source.reference1?.phone || source.reference1?.mobileNumber || source.reference1?.mobile_number,
      relation: source.reference1Relation || source.reference1_relation || source.ref1Relation || source.ref1_relation || source.reference1?.relation || source.reference1?.relationship,
    },
    {
      referenceType: 'secondary',
      fullName: source.reference2Name || source.reference2_name || source.ref2Name || source.ref2_name || source.reference2?.fullName || source.reference2?.full_name || source.reference2?.name,
      mobile: source.reference2Mobile || source.reference2_mobile || source.ref2Mobile || source.ref2_mobile || source.reference2?.mobile || source.reference2?.phone || source.reference2?.mobileNumber || source.reference2?.mobile_number,
      relation: source.reference2Relation || source.reference2_relation || source.ref2Relation || source.ref2_relation || source.reference2?.relation || source.reference2?.relationship,
    },
  ]).forEach((reference) => {
    const normalized = {
      referenceType: reference.referenceType,
      fullName: clean(reference.fullName || ''),
      mobile: clean(reference.mobile || ''),
      relation: clean(reference.relation || ''),
    };
    if (!normalized.fullName && !normalized.mobile && !normalized.relation) return;
    const existingIndex = references.findIndex((item) => item.referenceType === normalized.referenceType);
    if (existingIndex >= 0) {
      references[existingIndex] = {
        ...references[existingIndex],
        fullName: normalized.fullName || references[existingIndex].fullName,
        mobile: normalized.mobile || references[existingIndex].mobile,
        relation: normalized.relation || references[existingIndex].relation,
      };
    } else {
      references.push(normalized);
    }
  });

  return {
    primary: references.find((reference) => reference.referenceType === 'primary') || {},
    secondary: references.find((reference) => reference.referenceType === 'secondary') || {},
  };
}

async function repairLeadReferencesFromSourcePayload() {
  const rows = await query(`
    SELECT
      id,
      reference1_name,
      reference1_mobile,
      reference1_relation,
      reference2_name,
      reference2_mobile,
      reference2_relation,
      source_payload
    FROM loan_applications
    WHERE source_payload IS NOT NULL
      AND TRIM(source_payload) <> ''
      AND (
        reference1_name IS NULL OR TRIM(reference1_name) = ''
        OR reference1_mobile IS NULL OR TRIM(reference1_mobile) = ''
        OR reference1_relation IS NULL OR TRIM(reference1_relation) = ''
        OR reference2_name IS NULL OR TRIM(reference2_name) = ''
        OR reference2_mobile IS NULL OR TRIM(reference2_mobile) = ''
        OR reference2_relation IS NULL OR TRIM(reference2_relation) = ''
      )
    LIMIT 100
  `);

  for (const row of rows) {
    let payload;
    try {
      payload = JSON.parse(row.source_payload);
    } catch {
      continue;
    }
    const references = referencesFromSourcePayload(payload);
    const primary = references.primary;
    const secondary = references.secondary;
    const next = {
      reference1_name: clean(row.reference1_name) || primary.fullName || '',
      reference1_mobile: clean(row.reference1_mobile) || primary.mobile || '',
      reference1_relation: clean(row.reference1_relation) || primary.relation || '',
      reference2_name: clean(row.reference2_name) || secondary.fullName || '',
      reference2_mobile: clean(row.reference2_mobile) || secondary.mobile || '',
      reference2_relation: clean(row.reference2_relation) || secondary.relation || '',
    };
    if (!next.reference1_name && !next.reference1_mobile && !next.reference1_relation &&
      !next.reference2_name && !next.reference2_mobile && !next.reference2_relation) {
      continue;
    }

    await query(`
      UPDATE loan_applications
      SET
        reference1_name = ?,
        reference1_mobile = ?,
        reference1_relation = ?,
        reference2_name = ?,
        reference2_mobile = ?,
        reference2_relation = ?
      WHERE id = ?
    `, [
      next.reference1_name,
      next.reference1_mobile,
      next.reference1_relation,
      next.reference2_name,
      next.reference2_mobile,
      next.reference2_relation,
      row.id,
    ]);
  }
}

async function migrate() {
  await normalizeDatabaseCollation();

  await query(`
    CREATE TABLE IF NOT EXISTS loan_applications (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      application_id VARCHAR(50) NOT NULL,
      user_id INT UNSIGNED DEFAULT NULL,
      loan_type ENUM('payday','personal','business','edi','lap','vehicle') NOT NULL DEFAULT 'payday',
      full_name VARCHAR(255) DEFAULT NULL,
      mobile VARCHAR(15) NOT NULL,
      email VARCHAR(255) DEFAULT NULL,
      dob DATE DEFAULT NULL,
      pan_number VARCHAR(10) DEFAULT NULL,
      uan_number VARCHAR(50) DEFAULT NULL,
      aadhaar_number VARCHAR(12) DEFAULT NULL,
      aadhaar_verified TINYINT(1) DEFAULT NULL,
      aadhaar_unique_id VARCHAR(50) DEFAULT NULL,
      aadhaar_masked VARCHAR(20) DEFAULT NULL,
      cibil_report_url VARCHAR(255) DEFAULT NULL,
      employment_status ENUM('salaried','self') DEFAULT NULL,
      monthly_income DECIMAL(15,2) DEFAULT NULL,
      income_received_in ENUM('account','cash','cheque') DEFAULT NULL,
      city VARCHAR(100) DEFAULT NULL,
      pincode VARCHAR(10) DEFAULT NULL,
      loan_amount DECIMAL(15,2) DEFAULT NULL,
      loan_purpose VARCHAR(255) DEFAULT NULL,
      has_running_loan TINYINT(1) DEFAULT NULL,
      business_name VARCHAR(255) DEFAULT NULL,
      annual_turnover DECIMAL(15,2) DEFAULT NULL,
      daily_sales DECIMAL(15,2) DEFAULT NULL,
      property_type ENUM('residential','commercial') DEFAULT NULL,
      property_value DECIMAL(15,2) DEFAULT NULL,
      vehicle_type ENUM('car','bike','commercial') DEFAULT NULL,
      vehicle_price DECIMAL(15,2) DEFAULT NULL,
      company_name VARCHAR(255) DEFAULT NULL,
      designation VARCHAR(255) DEFAULT NULL,
      office_email VARCHAR(255) DEFAULT NULL,
      salary_day TINYINT DEFAULT NULL,
      office_address TEXT DEFAULT NULL,
      reference1_name VARCHAR(255) DEFAULT NULL,
      reference1_mobile VARCHAR(15) DEFAULT NULL,
      reference1_relation VARCHAR(100) DEFAULT NULL,
      reference2_name VARCHAR(255) DEFAULT NULL,
      reference2_mobile VARCHAR(15) DEFAULT NULL,
      reference2_relation VARCHAR(100) DEFAULT NULL,
      education VARCHAR(100) DEFAULT NULL,
      experience_years INT DEFAULT NULL,
      bank_name VARCHAR(255) DEFAULT NULL,
      branch_name VARCHAR(255) DEFAULT NULL,
      account_holder VARCHAR(255) DEFAULT NULL,
      account_number VARCHAR(50) DEFAULT NULL,
      ifsc_code VARCHAR(20) DEFAULT NULL,
      salary_slip_current VARCHAR(255) DEFAULT NULL,
      salary_slip_previous VARCHAR(255) DEFAULT NULL,
      salary_slip_old VARCHAR(255) DEFAULT NULL,
      company_id_card VARCHAR(255) DEFAULT NULL,
      selfie_image VARCHAR(255) DEFAULT NULL,
      priority VARCHAR(20) DEFAULT NULL,
      assigned_to VARCHAR(120) DEFAULT NULL,
      source VARCHAR(80) DEFAULT NULL,
      source_system VARCHAR(40) DEFAULT NULL,
      source_lead_id VARCHAR(120) DEFAULT NULL,
      source_application_id VARCHAR(120) DEFAULT NULL,
      source_status VARCHAR(80) DEFAULT NULL,
      source_payload LONGTEXT DEFAULT NULL,
      ingested_at DATETIME DEFAULT NULL,
      status ENUM('draft','submitted','review','approved','rejected','disbursed','closed','documents_pending','not_connected','send_to_credit') DEFAULT 'draft',
      is_active_application TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_loan_applications_application_id (application_id),
      INDEX idx_loan_applications_status (status),
      INDEX idx_loan_applications_active_lookup (is_active_application, mobile, email, pan_number, aadhaar_number),
      INDEX idx_loan_applications_assigned_to (assigned_to),
      INDEX idx_loan_applications_mobile (mobile),
      INDEX idx_loan_applications_source (source_system, source_lead_id),
      UNIQUE KEY uq_loan_applications_source_lead (source_system, source_lead_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS cibil_reports (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      lead_id VARCHAR(30) DEFAULT NULL,
      application_id VARCHAR(50) DEFAULT NULL,
      full_name VARCHAR(255) DEFAULT NULL,
      email VARCHAR(255) DEFAULT NULL,
      mobile VARCHAR(15) DEFAULT NULL,
      pan VARCHAR(20) DEFAULT NULL,
      score INT DEFAULT NULL,
      pdf_url VARCHAR(1024) DEFAULT NULL,
      ref_id VARCHAR(120) DEFAULT NULL,
      analysis_json LONGTEXT DEFAULT NULL,
      analysis_raw_response LONGTEXT DEFAULT NULL,
      analysis_status VARCHAR(40) DEFAULT NULL,
      analysis_error TEXT DEFAULT NULL,
      analysis_model VARCHAR(80) DEFAULT NULL,
      analysis_response_id VARCHAR(120) DEFAULT NULL,
      analyzed_at DATETIME DEFAULT NULL,
      raw_response LONGTEXT DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_cibil_reports_lead_id (lead_id),
      INDEX idx_cibil_reports_application_id (application_id),
      INDEX idx_cibil_reports_mobile (mobile),
      INDEX idx_cibil_reports_pan (pan),
      INDEX idx_cibil_reports_ref_id (ref_id),
      INDEX idx_cibil_reports_created_at (created_at)
    );

    CREATE TABLE IF NOT EXISTS aadhaar_reports (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      lead_id VARCHAR(30) DEFAULT NULL,
      application_id VARCHAR(50) DEFAULT NULL,
      unique_id VARCHAR(80) DEFAULT NULL,
      full_name VARCHAR(255) DEFAULT NULL,
      dob VARCHAR(30) DEFAULT NULL,
      gender VARCHAR(30) DEFAULT NULL,
      mobile VARCHAR(20) DEFAULT NULL,
      aadhaar_masked VARCHAR(30) DEFAULT NULL,
      address TEXT DEFAULT NULL,
      raw_response LONGTEXT DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_aadhaar_reports_lead_id (lead_id),
      INDEX idx_aadhaar_reports_application_id (application_id),
      INDEX idx_aadhaar_reports_unique_id (unique_id),
      INDEX idx_aadhaar_reports_created_at (created_at)
    );

    CREATE TABLE IF NOT EXISTS lead_activities (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      lead_id VARCHAR(30) DEFAULT NULL,
      application_id VARCHAR(50) DEFAULT NULL,
      type VARCHAR(40) NOT NULL DEFAULT 'note',
      description TEXT NOT NULL,
      actor VARCHAR(120) NOT NULL DEFAULT 'System',
      metadata LONGTEXT DEFAULT NULL,
      source_key VARCHAR(160) DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_lead_activities_source_key (source_key),
      INDEX idx_lead_activities_lead_id (lead_id),
      INDEX idx_lead_activities_application_id (application_id),
      INDEX idx_lead_activities_created_at (created_at)
    );

    CREATE TABLE IF NOT EXISTS lead_status_events (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      lead_id VARCHAR(30) DEFAULT NULL,
      application_id VARCHAR(50) NOT NULL,
      status VARCHAR(80) NOT NULL,
      stage_key VARCHAR(80) NOT NULL,
      public_status VARCHAR(120) NOT NULL,
      title VARCHAR(160) NOT NULL,
      description TEXT DEFAULT NULL,
      actor VARCHAR(120) NOT NULL DEFAULT 'System',
      actor_role VARCHAR(80) DEFAULT NULL,
      source VARCHAR(80) NOT NULL DEFAULT 'system',
      source_key VARCHAR(190) DEFAULT NULL,
      metadata LONGTEXT DEFAULT NULL,
      is_customer_visible TINYINT(1) NOT NULL DEFAULT 1,
      occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_lead_status_events_source_key (source_key),
      INDEX idx_lead_status_events_lead_id (lead_id),
      INDEX idx_lead_status_events_application_id (application_id),
      INDEX idx_lead_status_events_stage (stage_key),
      INDEX idx_lead_status_events_occurred_at (occurred_at)
    );

    CREATE TABLE IF NOT EXISTS lead_call_logs (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      lead_id VARCHAR(30) DEFAULT NULL,
      application_id VARCHAR(50) DEFAULT NULL,
      disposition VARCHAR(80) NOT NULL,
      sub_disposition VARCHAR(120) DEFAULT NULL,
      notes TEXT DEFAULT NULL,
      call_duration_seconds INT NOT NULL DEFAULT 0,
      next_followup_at DATETIME DEFAULT NULL,
      actor VARCHAR(120) NOT NULL DEFAULT 'CRM User',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_lead_call_logs_lead_id (lead_id),
      INDEX idx_lead_call_logs_application_id (application_id),
      INDEX idx_lead_call_logs_followup (next_followup_at),
      INDEX idx_lead_call_logs_created_at (created_at)
    );

    CREATE TABLE IF NOT EXISTS lead_followups (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      lead_id VARCHAR(30) DEFAULT NULL,
      application_id VARCHAR(50) DEFAULT NULL,
      due_at DATETIME NOT NULL,
      reason VARCHAR(160) DEFAULT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'open',
      notes TEXT DEFAULT NULL,
      actor VARCHAR(120) NOT NULL DEFAULT 'CRM User',
      completed_at DATETIME DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_lead_followups_lead_id (lead_id),
      INDEX idx_lead_followups_application_id (application_id),
      INDEX idx_lead_followups_due_at (due_at),
      INDEX idx_lead_followups_status (status)
    );

    CREATE TABLE IF NOT EXISTS lead_document_checks (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      lead_id VARCHAR(30) DEFAULT NULL,
      application_id VARCHAR(50) DEFAULT NULL,
      document_key VARCHAR(80) NOT NULL,
      label VARCHAR(160) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      remark TEXT DEFAULT NULL,
      verified_by VARCHAR(120) DEFAULT NULL,
      verified_at DATETIME DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_lead_document_check (application_id, document_key),
      INDEX idx_lead_document_checks_lead_id (lead_id),
      INDEX idx_lead_document_checks_application_id (application_id),
      INDEX idx_lead_document_checks_status (status)
    );

    CREATE TABLE IF NOT EXISTS lead_document_requests (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      lead_id VARCHAR(30) DEFAULT NULL,
      application_id VARCHAR(50) DEFAULT NULL,
      document_key VARCHAR(80) NOT NULL,
      label VARCHAR(160) NOT NULL,
      token VARCHAR(80) NOT NULL,
      group_token VARCHAR(80) DEFAULT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      requested_by VARCHAR(120) NOT NULL DEFAULT 'CRM User',
      uploaded_file VARCHAR(255) DEFAULT NULL,
      original_file_name VARCHAR(255) DEFAULT NULL,
      mime_type VARCHAR(120) DEFAULT NULL,
      file_size INT UNSIGNED DEFAULT NULL,
      expires_at DATETIME NOT NULL,
      uploaded_at DATETIME DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_lead_document_requests_token (token),
      INDEX idx_lead_document_requests_group_token (group_token),
      INDEX idx_lead_document_requests_lead_id (lead_id),
      INDEX idx_lead_document_requests_application_id (application_id),
      INDEX idx_lead_document_requests_document_key (document_key),
      INDEX idx_lead_document_requests_status (status)
    );

    CREATE TABLE IF NOT EXISTS lead_credit_handoffs (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      lead_id VARCHAR(30) DEFAULT NULL,
      application_id VARCHAR(50) DEFAULT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'ready',
      checklist_snapshot LONGTEXT DEFAULT NULL,
      notes TEXT DEFAULT NULL,
      submitted_by VARCHAR(120) NOT NULL DEFAULT 'CRM User',
      submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_by VARCHAR(120) DEFAULT NULL,
      reviewed_at DATETIME DEFAULT NULL,
      decision VARCHAR(80) DEFAULT NULL,
      decision_notes TEXT DEFAULT NULL,
      INDEX idx_lead_credit_handoffs_lead_id (lead_id),
      INDEX idx_lead_credit_handoffs_application_id (application_id),
      INDEX idx_lead_credit_handoffs_status (status),
      INDEX idx_lead_credit_handoffs_submitted_at (submitted_at)
    );

    CREATE TABLE IF NOT EXISTS lead_cam_sheets (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      lead_id VARCHAR(30) DEFAULT NULL,
      application_id VARCHAR(50) DEFAULT NULL,
      version INT NOT NULL DEFAULT 1,
      status VARCHAR(40) NOT NULL DEFAULT 'draft',
      requested_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      recommended_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      approved_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      loan_term_days INT NOT NULL DEFAULT 30,
      interest_rate DECIMAL(8,2) NOT NULL DEFAULT 0,
      processing_fee_rate DECIMAL(8,2) NOT NULL DEFAULT 0,
      total_repayment DECIMAL(15,2) NOT NULL DEFAULT 0,
      monthly_income DECIMAL(15,2) NOT NULL DEFAULT 0,
      monthly_expenses DECIMAL(15,2) NOT NULL DEFAULT 0,
      net_income DECIMAL(15,2) NOT NULL DEFAULT 0,
      dti_ratio DECIMAL(8,2) NOT NULL DEFAULT 0,
      repayment_buffer DECIMAL(12,4) NOT NULL DEFAULT 0,
      policy_score INT NOT NULL DEFAULT 0,
      verification_score INT NOT NULL DEFAULT 0,
      risk_grade VARCHAR(20) DEFAULT NULL,
      credit_risk VARCHAR(40) DEFAULT NULL,
      repayment_capacity VARCHAR(40) DEFAULT NULL,
      recommendation VARCHAR(80) DEFAULT NULL,
      deviation_level VARCHAR(40) DEFAULT NULL,
      decision_reason TEXT DEFAULT NULL,
      conditions TEXT DEFAULT NULL,
      notes TEXT DEFAULT NULL,
      snapshot LONGTEXT DEFAULT NULL,
      created_by VARCHAR(120) NOT NULL DEFAULT 'Credit Manager',
      decided_by VARCHAR(120) DEFAULT NULL,
      decided_at DATETIME DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_lead_cam_sheets_lead_id (lead_id),
      INDEX idx_lead_cam_sheets_application_id (application_id),
      INDEX idx_lead_cam_sheets_status (status),
      INDEX idx_lead_cam_sheets_created_at (created_at)
    );

    CREATE TABLE IF NOT EXISTS lead_esign_requests (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      lead_id VARCHAR(30) DEFAULT NULL,
      application_id VARCHAR(50) DEFAULT NULL,
      cam_sheet_id INT UNSIGNED DEFAULT NULL,
      token VARCHAR(80) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      signer_name VARCHAR(255) DEFAULT NULL,
      signer_email VARCHAR(255) DEFAULT NULL,
      signer_phone VARCHAR(40) DEFAULT NULL,
      agreement_url VARCHAR(255) DEFAULT NULL,
      signed_file_url VARCHAR(255) DEFAULT NULL,
      otp_code VARCHAR(12) DEFAULT NULL,
      consent_text TEXT DEFAULT NULL,
      signed_at DATETIME DEFAULT NULL,
      expires_at DATETIME NOT NULL,
      signer_ip VARCHAR(80) DEFAULT NULL,
      signer_user_agent VARCHAR(512) DEFAULT NULL,
      metadata LONGTEXT DEFAULT NULL,
      created_by VARCHAR(120) NOT NULL DEFAULT 'Credit Manager',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_lead_esign_requests_token (token),
      INDEX idx_lead_esign_requests_lead_id (lead_id),
      INDEX idx_lead_esign_requests_application_id (application_id),
      INDEX idx_lead_esign_requests_status (status),
      INDEX idx_lead_esign_requests_expires_at (expires_at)
    );

    CREATE TABLE IF NOT EXISTS lead_sanctions (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      lead_id VARCHAR(30) DEFAULT NULL,
      application_id VARCHAR(50) DEFAULT NULL,
      cam_sheet_id INT UNSIGNED DEFAULT NULL,
      agreement_number VARCHAR(80) NOT NULL,
      agreement_date DATE NOT NULL,
      borrower VARCHAR(255) NOT NULL,
      lender VARCHAR(255) NOT NULL DEFAULT 'WAQT FINANCE PRIVATE LIMITED',
      borrower_email VARCHAR(255) DEFAULT NULL,
      borrower_phone VARCHAR(40) DEFAULT NULL,
      principal_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      tenure_days INT NOT NULL DEFAULT 30,
      interest_rate DECIMAL(8,2) NOT NULL DEFAULT 0,
      interest_rate_label VARCHAR(120) DEFAULT NULL,
      processing_fee DECIMAL(15,2) NOT NULL DEFAULT 0,
      gst_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      disbursed_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      disbursement_date DATE DEFAULT NULL,
      disbursement_mode VARCHAR(80) DEFAULT NULL,
      due_date DATE NOT NULL,
      repayment_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      apr DECIMAL(8,2) NOT NULL DEFAULT 0,
      bank_name VARCHAR(255) DEFAULT NULL,
      account_number VARCHAR(50) DEFAULT NULL,
      ifsc_code VARCHAR(20) DEFAULT NULL,
      penal_interest_rate DECIMAL(8,2) NOT NULL DEFAULT 2,
      late_fee VARCHAR(255) DEFAULT NULL,
      conditions TEXT DEFAULT NULL,
      pdf_path VARCHAR(255) DEFAULT NULL,
      acceptance_proof_path VARCHAR(255) DEFAULT NULL,
      acceptance_proof_original_file_name VARCHAR(255) DEFAULT NULL,
      acceptance_proof_uploaded_at DATETIME DEFAULT NULL,
      acceptance_proof_uploaded_by VARCHAR(120) DEFAULT NULL,
      email_to VARCHAR(255) DEFAULT NULL,
      email_status VARCHAR(40) NOT NULL DEFAULT 'pending',
      email_error TEXT DEFAULT NULL,
      whatsapp_status VARCHAR(40) NOT NULL DEFAULT 'pending',
      whatsapp_error TEXT DEFAULT NULL,
      whatsapp_sent_at DATETIME DEFAULT NULL,
      parent_sanction_id INT UNSIGNED DEFAULT NULL,
      revision_number INT NOT NULL DEFAULT 0,
      revision_reason TEXT DEFAULT NULL,
      superseded_by_sanction_id INT UNSIGNED DEFAULT NULL,
      superseded_at DATETIME DEFAULT NULL,
      sent_at DATETIME DEFAULT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'sent',
      created_by VARCHAR(120) NOT NULL DEFAULT 'Credit Manager',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_lead_sanctions_agreement_number (agreement_number),
      INDEX idx_lead_sanctions_lead_id (lead_id),
      INDEX idx_lead_sanctions_application_id (application_id),
      INDEX idx_lead_sanctions_status (status),
      INDEX idx_lead_sanctions_email_status (email_status)
    );

    CREATE TABLE IF NOT EXISTS lead_loan_agreements (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      lead_id VARCHAR(30) DEFAULT NULL,
      application_id VARCHAR(50) DEFAULT NULL,
      sanction_id INT UNSIGNED DEFAULT NULL,
      cam_sheet_id INT UNSIGNED DEFAULT NULL,
      agreement_number VARCHAR(80) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'draft',
      provider VARCHAR(40) NOT NULL DEFAULT 'digio',
      signer_name VARCHAR(255) DEFAULT NULL,
      signer_email VARCHAR(255) DEFAULT NULL,
      signer_phone VARCHAR(40) DEFAULT NULL,
      pdf_path VARCHAR(255) DEFAULT NULL,
      signed_pdf_path VARCHAR(255) DEFAULT NULL,
      provider_document_id VARCHAR(160) DEFAULT NULL,
      provider_request_id VARCHAR(160) DEFAULT NULL,
      provider_status VARCHAR(80) DEFAULT NULL,
      signing_url VARCHAR(1024) DEFAULT NULL,
      whatsapp_status VARCHAR(40) NOT NULL DEFAULT 'pending',
      whatsapp_error TEXT DEFAULT NULL,
      whatsapp_sent_at DATETIME DEFAULT NULL,
      superseded_by_agreement_id INT UNSIGNED DEFAULT NULL,
      superseded_at DATETIME DEFAULT NULL,
      sent_at DATETIME DEFAULT NULL,
      signed_at DATETIME DEFAULT NULL,
      expires_at DATETIME DEFAULT NULL,
      error_message TEXT DEFAULT NULL,
      metadata LONGTEXT DEFAULT NULL,
      created_by VARCHAR(120) NOT NULL DEFAULT 'Credit Manager',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_lead_loan_agreements_lead_id (lead_id),
      INDEX idx_lead_loan_agreements_application_id (application_id),
      INDEX idx_lead_loan_agreements_sanction_id (sanction_id),
      INDEX idx_lead_loan_agreements_status (status),
      INDEX idx_lead_loan_agreements_provider_document_id (provider_document_id),
      INDEX idx_lead_loan_agreements_agreement_number (agreement_number)
    );

    CREATE TABLE IF NOT EXISTS lead_accounting_payments (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      lead_id VARCHAR(30) DEFAULT NULL,
      application_id VARCHAR(50) DEFAULT NULL,
      loan_id VARCHAR(32) DEFAULT NULL,
      amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      method VARCHAR(80) NOT NULL DEFAULT 'Bank Transfer',
      reference VARCHAR(120) DEFAULT NULL,
      transfer_type VARCHAR(20) DEFAULT NULL,
      transaction_id VARCHAR(120) DEFAULT NULL,
      notes TEXT DEFAULT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'paid',
      paid_by VARCHAR(120) NOT NULL DEFAULT 'Accountant',
      disbursed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      account_number VARCHAR(50) DEFAULT NULL,
      bank_name VARCHAR(255) DEFAULT NULL,
      ifsc_code VARCHAR(20) DEFAULT NULL,
      INDEX idx_lead_accounting_payments_lead_id (lead_id),
      INDEX idx_lead_accounting_payments_application_id (application_id),
      INDEX idx_lead_accounting_payments_loan_id (loan_id),
      INDEX idx_lead_accounting_payments_transaction_id (transaction_id),
      INDEX idx_lead_accounting_payments_paid_at (paid_at)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      action VARCHAR(80) NOT NULL,
      actor_email VARCHAR(255) DEFAULT NULL,
      actor_name VARCHAR(120) DEFAULT NULL,
      actor_role VARCHAR(80) DEFAULT NULL,
      lead_id VARCHAR(30) DEFAULT NULL,
      application_id VARCHAR(50) DEFAULT NULL,
      entity_type VARCHAR(80) DEFAULT NULL,
      entity_id VARCHAR(120) DEFAULT NULL,
      ip_address VARCHAR(80) DEFAULT NULL,
      user_agent VARCHAR(512) DEFAULT NULL,
      metadata LONGTEXT DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_logs_action (action),
      INDEX idx_audit_logs_actor_role (actor_role),
      INDEX idx_audit_logs_lead_id (lead_id),
      INDEX idx_audit_logs_application_id (application_id),
      INDEX idx_audit_logs_created_at (created_at)
    );

    CREATE TABLE IF NOT EXISTS integration_ingestion_logs (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      source_system VARCHAR(40) DEFAULT NULL,
      source_lead_id VARCHAR(120) DEFAULT NULL,
      source_application_id VARCHAR(120) DEFAULT NULL,
      endpoint VARCHAR(160) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'received',
      status_code INT DEFAULT NULL,
      crm_application_id VARCHAR(50) DEFAULT NULL,
      crm_lead_id VARCHAR(30) DEFAULT NULL,
      request_payload LONGTEXT DEFAULT NULL,
      response_payload LONGTEXT DEFAULT NULL,
      error_message TEXT DEFAULT NULL,
      ip_address VARCHAR(80) DEFAULT NULL,
      user_agent VARCHAR(512) DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_integration_logs_source (source_system, source_lead_id),
      INDEX idx_integration_logs_status (status),
      INDEX idx_integration_logs_created_at (created_at),
      INDEX idx_integration_logs_crm_application_id (crm_application_id)
    );

    CREATE TABLE IF NOT EXISTS lead_consents (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      lead_id VARCHAR(30) DEFAULT NULL,
      application_id VARCHAR(50) DEFAULT NULL,
      consent_type VARCHAR(80) NOT NULL,
      consent_text TEXT DEFAULT NULL,
      consent_version VARCHAR(40) DEFAULT NULL,
      accepted TINYINT(1) NOT NULL DEFAULT 1,
      source VARCHAR(80) NOT NULL DEFAULT 'crm',
      ip_address VARCHAR(80) DEFAULT NULL,
      user_agent VARCHAR(512) DEFAULT NULL,
      accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_lead_consents_version (application_id, consent_type, consent_version),
      INDEX idx_lead_consents_lead_id (lead_id),
      INDEX idx_lead_consents_application_id (application_id),
      INDEX idx_lead_consents_type (consent_type)
    );

    CREATE TABLE IF NOT EXISTS loan_repayment_schedule (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      loan_id VARCHAR(32) NOT NULL,
      customer_id VARCHAR(32) DEFAULT NULL,
      lead_id VARCHAR(30) DEFAULT NULL,
      application_id VARCHAR(50) DEFAULT NULL,
      installment_number INT NOT NULL DEFAULT 1,
      due_date DATE NOT NULL,
      principal_due DECIMAL(15,2) NOT NULL DEFAULT 0,
      interest_due DECIMAL(15,2) NOT NULL DEFAULT 0,
      fees_due DECIMAL(15,2) NOT NULL DEFAULT 0,
      penalty_due DECIMAL(15,2) NOT NULL DEFAULT 0,
      total_due DECIMAL(15,2) NOT NULL DEFAULT 0,
      amount_paid DECIMAL(15,2) NOT NULL DEFAULT 0,
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      paid_at DATETIME DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_repayment_schedule_installment (loan_id, installment_number),
      INDEX idx_repayment_schedule_loan_id (loan_id),
      INDEX idx_repayment_schedule_due_date (due_date),
      INDEX idx_repayment_schedule_status (status),
      INDEX idx_repayment_schedule_application_id (application_id)
    );

    CREATE TABLE IF NOT EXISTS loan_repayments (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      loan_id VARCHAR(32) NOT NULL,
      repayment_schedule_id INT UNSIGNED DEFAULT NULL,
      customer_id VARCHAR(32) DEFAULT NULL,
      lead_id VARCHAR(30) DEFAULT NULL,
      application_id VARCHAR(50) DEFAULT NULL,
      amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      principal_component DECIMAL(15,2) NOT NULL DEFAULT 0,
      interest_component DECIMAL(15,2) NOT NULL DEFAULT 0,
      fees_component DECIMAL(15,2) NOT NULL DEFAULT 0,
      penalty_component DECIMAL(15,2) NOT NULL DEFAULT 0,
      method VARCHAR(80) DEFAULT NULL,
      reference VARCHAR(120) DEFAULT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'received',
      received_by VARCHAR(120) DEFAULT NULL,
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata LONGTEXT DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_loan_repayments_reference (reference),
      INDEX idx_loan_repayments_loan_id (loan_id),
      INDEX idx_loan_repayments_schedule_id (repayment_schedule_id),
      INDEX idx_loan_repayments_application_id (application_id),
      INDEX idx_loan_repayments_received_at (received_at)
    );

    CREATE TABLE IF NOT EXISTS payment_links (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      loan_id VARCHAR(32) NOT NULL,
      customer_id VARCHAR(32) DEFAULT NULL,
      lead_id VARCHAR(30) DEFAULT NULL,
      application_id VARCHAR(50) DEFAULT NULL,
      amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      currency VARCHAR(8) NOT NULL DEFAULT 'INR',
      gateway VARCHAR(40) NOT NULL DEFAULT 'cashfree',
      gateway_link_id VARCHAR(120) NOT NULL,
      link_url VARCHAR(1024) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'created',
      expires_at DATETIME DEFAULT NULL,
      paid_at DATETIME DEFAULT NULL,
      payment_reference VARCHAR(120) DEFAULT NULL,
      created_by VARCHAR(120) DEFAULT NULL,
      metadata LONGTEXT DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_payment_links_gateway_link_id (gateway_link_id),
      INDEX idx_payment_links_loan_id (loan_id),
      INDEX idx_payment_links_lead_id (lead_id),
      INDEX idx_payment_links_application_id (application_id),
      INDEX idx_payment_links_status (status),
      INDEX idx_payment_links_created_at (created_at)
    );

    INSERT IGNORE INTO lead_activities (
      lead_id, application_id, type, description, actor, source_key, created_at
    )
    SELECT
      CAST(id AS CHAR),
      application_id,
      'status',
      CONCAT('Lead imported from loan_applications with status ', status),
      'System',
      CONCAT('lead-created:', id),
      created_at
    FROM loan_applications;

    INSERT IGNORE INTO lead_status_events (
      lead_id, application_id, status, stage_key, public_status, title,
      description, actor, source, source_key, occurred_at, created_at
    )
    SELECT
      CAST(id AS CHAR),
      COALESCE(NULLIF(application_id, ''), CONCAT('APP-', id)),
      CASE status
        WHEN 'draft' THEN 'New'
        WHEN 'submitted' THEN 'New'
        WHEN 'review' THEN 'Document Collection'
        WHEN 'approved' THEN 'Qualified'
        WHEN 'rejected' THEN 'Lost'
        WHEN 'disbursed' THEN 'Converted'
        ELSE 'New'
      END,
      CASE status
        WHEN 'draft' THEN 'application_received'
        WHEN 'submitted' THEN 'telecaller_contacted'
        WHEN 'review' THEN 'documents_review'
        WHEN 'approved' THEN 'approved'
        WHEN 'rejected' THEN 'rejected'
        WHEN 'disbursed' THEN 'disbursed'
        ELSE 'application_received'
      END,
      CASE status
        WHEN 'draft' THEN 'Application received'
        WHEN 'submitted' THEN 'Contact in progress'
        WHEN 'review' THEN 'Documents under review'
        WHEN 'approved' THEN 'Loan approved'
        WHEN 'rejected' THEN 'Application closed'
        WHEN 'disbursed' THEN 'Loan disbursed'
        ELSE 'Application received'
      END,
      CASE status
        WHEN 'draft' THEN 'Application received'
        WHEN 'submitted' THEN 'Contact in progress'
        WHEN 'review' THEN 'Documents under review'
        WHEN 'approved' THEN 'Loan approved'
        WHEN 'rejected' THEN 'Application closed'
        WHEN 'disbursed' THEN 'Loan disbursed'
        ELSE 'Application received'
      END,
      CASE status
        WHEN 'draft' THEN 'We have received your loan application.'
        WHEN 'submitted' THEN 'Our team has started contacting you for verification.'
        WHEN 'review' THEN 'Your documents and eligibility are being reviewed.'
        WHEN 'approved' THEN 'Your loan has been approved and is moving to agreement/disbursement.'
        WHEN 'rejected' THEN 'Your application could not be approved at this stage.'
        WHEN 'disbursed' THEN 'Your loan amount has been disbursed.'
        ELSE 'We have received your loan application.'
      END,
      'System',
      'migration',
      CONCAT('bootstrap-status:', id),
      created_at,
      created_at
    FROM loan_applications;

    CREATE TABLE IF NOT EXISTS crm_users (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(160) NOT NULL,
      name VARCHAR(120) NOT NULL,
      role VARCHAR(60) NOT NULL,
      password_salt VARCHAR(64) NOT NULL,
      password_hash VARCHAR(128) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      last_login_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_crm_users_email_role (email, role),
      INDEX idx_crm_users_role (role),
      INDEX idx_crm_users_active (is_active)
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id VARCHAR(32) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      role VARCHAR(80) NOT NULL,
      active_leads INT NOT NULL DEFAULT 0,
      leads INT NOT NULL DEFAULT 0,
      commission DECIMAL(12,2) NOT NULL DEFAULT 0,
      sales DECIMAL(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(40) NOT NULL DEFAULT 'Sales',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id VARCHAR(32) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(160) NOT NULL,
      phone VARCHAR(40) NOT NULL,
      address VARCHAR(255),
      credit_score INT NOT NULL DEFAULT 0,
      total_loans INT NOT NULL DEFAULT 0,
      active_loans INT NOT NULL DEFAULT 0,
      total_borrowed DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_repaid DECIMAL(12,2) NOT NULL DEFAULT 0,
      on_time_payments INT NOT NULL DEFAULT 0,
      late_payments INT NOT NULL DEFAULT 0,
      defaulted INT NOT NULL DEFAULT 0,
      join_date DATE NOT NULL,
      last_loan_date DATE NULL,
      risk_level VARCHAR(40) NOT NULL DEFAULT 'Medium',
      lifetime_value DECIMAL(12,2) NOT NULL DEFAULT 0,
      monthly_income DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_customers_risk (risk_level)
    );

    CREATE TABLE IF NOT EXISTS loans (
      id VARCHAR(32) PRIMARY KEY,
      customer_id VARCHAR(32) NOT NULL,
      principal DECIMAL(12,2) NOT NULL,
      interest_rate DECIMAL(6,2) NOT NULL DEFAULT 15,
      total_amount DECIMAL(12,2) NOT NULL,
      amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
      balance DECIMAL(12,2) NOT NULL,
      start_date DATE NOT NULL,
      due_date DATE NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'Active',
      payment_status VARCHAR(40) NOT NULL DEFAULT 'Pending',
      next_payment_date DATE NULL,
      next_payment_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_loans_status (status),
      INDEX idx_loans_customer (customer_id)
    );

    CREATE TABLE IF NOT EXISTS collection_cases (
      id VARCHAR(32) PRIMARY KEY,
      loan_id VARCHAR(32) NOT NULL,
      customer_id VARCHAR(32) NOT NULL,
      customer VARCHAR(120) NOT NULL,
      phone VARCHAR(40) NOT NULL,
      total_due DECIMAL(12,2) NOT NULL,
      days_overdue INT NOT NULL,
      original_due_date DATE NOT NULL,
      last_contact_date DATE NULL,
      last_payment_date DATE NULL,
      status VARCHAR(80) NOT NULL,
      assigned_to VARCHAR(120),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS collection_call_logs (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      case_id VARCHAR(32) NOT NULL,
      loan_id VARCHAR(32) DEFAULT NULL,
      disposition VARCHAR(80) NOT NULL,
      sub_disposition VARCHAR(120) DEFAULT NULL,
      notes TEXT DEFAULT NULL,
      next_action_at DATETIME DEFAULT NULL,
      actor VARCHAR(120) NOT NULL DEFAULT 'Collection Agent',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_collection_call_logs_case_id (case_id),
      INDEX idx_collection_call_logs_loan_id (loan_id),
      INDEX idx_collection_call_logs_disposition (disposition),
      INDEX idx_collection_call_logs_created_at (created_at)
    );

    CREATE TABLE IF NOT EXISTS collection_followups (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      case_id VARCHAR(32) NOT NULL,
      loan_id VARCHAR(32) DEFAULT NULL,
      due_at DATETIME NOT NULL,
      reason VARCHAR(120) NOT NULL DEFAULT 'follow_up',
      status VARCHAR(40) NOT NULL DEFAULT 'open',
      notes TEXT DEFAULT NULL,
      actor VARCHAR(120) NOT NULL DEFAULT 'Collection Agent',
      completed_at DATETIME DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_collection_followups_case_id (case_id),
      INDEX idx_collection_followups_loan_id (loan_id),
      INDEX idx_collection_followups_due_at (due_at),
      INDEX idx_collection_followups_status (status)
    );

    CREATE TABLE IF NOT EXISTS collection_ptps (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      case_id VARCHAR(32) NOT NULL,
      loan_id VARCHAR(32) DEFAULT NULL,
      amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      ptp_date DATE NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'active',
      kept_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      paid_at DATETIME DEFAULT NULL,
      broken_at DATETIME DEFAULT NULL,
      notes TEXT DEFAULT NULL,
      actor VARCHAR(120) NOT NULL DEFAULT 'Collection Agent',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_collection_ptps_case_id (case_id),
      INDEX idx_collection_ptps_loan_id (loan_id),
      INDEX idx_collection_ptps_ptp_date (ptp_date),
      INDEX idx_collection_ptps_status (status)
    );

    CREATE TABLE IF NOT EXISTS commissions (
      id VARCHAR(32) PRIMARY KEY,
      member_name VARCHAR(120) NOT NULL,
      volume DECIMAL(12,2) NOT NULL,
      commission DECIMAL(12,2) NOT NULL,
      clawback DECIMAL(12,2) NOT NULL DEFAULT 0,
      payout VARCHAR(40) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS income_lines (
      id VARCHAR(32) PRIMARY KEY,
      source VARCHAR(120) NOT NULL,
      today_amount DECIMAL(12,2) NOT NULL,
      month_amount DECIMAL(12,2) NOT NULL,
      trend VARCHAR(80) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id VARCHAR(32) PRIMARY KEY,
      payee VARCHAR(120) NOT NULL,
      type VARCHAR(80) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      status VARCHAR(80) NOT NULL,
      due_date DATE NOT NULL
    );
  `);

  await normalizeTableCollations();

  await ensureColumn('loan_applications', 'priority', 'priority VARCHAR(20) DEFAULT NULL');
  await ensureColumn('loan_applications', 'assigned_to', 'assigned_to VARCHAR(120) DEFAULT NULL');
  await ensureColumn('loan_applications', 'video_kyc', 'video_kyc VARCHAR(255) DEFAULT NULL');
  await ensureColumn('loan_applications', 'source', 'source VARCHAR(80) DEFAULT NULL');
  await ensureColumn('loan_applications', 'source_system', 'source_system VARCHAR(40) DEFAULT NULL');
  await ensureColumn('loan_applications', 'source_lead_id', 'source_lead_id VARCHAR(120) DEFAULT NULL');
  await ensureColumn('loan_applications', 'source_application_id', 'source_application_id VARCHAR(120) DEFAULT NULL');
  await ensureColumn('loan_applications', 'source_status', 'source_status VARCHAR(80) DEFAULT NULL');
  await ensureColumn('loan_applications', 'source_payload', 'source_payload LONGTEXT DEFAULT NULL');
  await ensureColumn('loan_applications', 'ingested_at', 'ingested_at DATETIME DEFAULT NULL');
  await ensureColumn('loan_applications', 'is_active_application', 'is_active_application TINYINT(1) NOT NULL DEFAULT 1');
  await ensureColumn('loan_applications', 'dob', 'dob DATE DEFAULT NULL');
  await ensureColumn('loan_applications', 'uan_number', 'uan_number VARCHAR(50) DEFAULT NULL');
  await ensureColumn('loan_applications', 'aadhaar_number', 'aadhaar_number VARCHAR(12) DEFAULT NULL');
  await ensureColumn('loan_applications', 'aadhaar_unique_id', 'aadhaar_unique_id VARCHAR(50) DEFAULT NULL');
  await ensureColumn('loan_applications', 'employment_status', "employment_status ENUM('salaried','self') DEFAULT NULL");
  await ensureColumn('loan_applications', 'monthly_income', 'monthly_income DECIMAL(15,2) DEFAULT NULL');
  await ensureColumn('loan_applications', 'city', 'city VARCHAR(100) DEFAULT NULL');
  await ensureColumn('loan_applications', 'pincode', 'pincode VARCHAR(10) DEFAULT NULL');
  await ensureColumn('loan_applications', 'loan_amount', 'loan_amount DECIMAL(15,2) DEFAULT NULL');
  await ensureColumn('loan_applications', 'loan_purpose', 'loan_purpose VARCHAR(255) DEFAULT NULL');
  await ensureColumn('loan_applications', 'company_name', 'company_name VARCHAR(255) DEFAULT NULL');
  await ensureColumn('loan_applications', 'designation', 'designation VARCHAR(255) DEFAULT NULL');
  await ensureColumn('loan_applications', 'office_email', 'office_email VARCHAR(255) DEFAULT NULL');
  await ensureColumn('loan_applications', 'office_address', 'office_address TEXT DEFAULT NULL');
  await ensureColumn('loan_applications', 'bank_name', 'bank_name VARCHAR(255) DEFAULT NULL');
  await ensureColumn('loan_applications', 'branch_name', 'branch_name VARCHAR(255) DEFAULT NULL');
  await ensureColumn('loan_applications', 'account_holder', 'account_holder VARCHAR(255) DEFAULT NULL');
  await ensureColumn('loan_applications', 'account_number', 'account_number VARCHAR(50) DEFAULT NULL');
  await ensureColumn('loan_applications', 'ifsc_code', 'ifsc_code VARCHAR(20) DEFAULT NULL');
  await ensureLoanApplicationStatusSupportsAll();
  await repairActiveApplicationFlags();
  await repairClosedLoanApplicationStatuses();
  await ensureColumn('loan_applications', 'reference1_name', 'reference1_name VARCHAR(255) DEFAULT NULL');
  await ensureColumn('loan_applications', 'reference1_mobile', 'reference1_mobile VARCHAR(15) DEFAULT NULL');
  await ensureColumn('loan_applications', 'reference1_relation', 'reference1_relation VARCHAR(100) DEFAULT NULL');
  await ensureColumn('loan_applications', 'reference2_name', 'reference2_name VARCHAR(255) DEFAULT NULL');
  await ensureColumn('loan_applications', 'reference2_mobile', 'reference2_mobile VARCHAR(15) DEFAULT NULL');
  await ensureColumn('loan_applications', 'reference2_relation', 'reference2_relation VARCHAR(100) DEFAULT NULL');
  await ensureColumn('loan_applications', 'additional_references', 'additional_references LONGTEXT DEFAULT NULL');
  await repairLeadReferencesFromSourcePayload();
  await repairLeadSourceMetadata();
  await ensureIndex('loan_applications', 'idx_loan_applications_source', 'INDEX idx_loan_applications_source (source_system, source_lead_id)');
  await ensureIndex('loan_applications', 'idx_loan_applications_source_status', 'INDEX idx_loan_applications_source_status (source_status)');
  await ensureIndex('loan_applications', 'idx_loan_applications_active_lookup', 'INDEX idx_loan_applications_active_lookup (is_active_application, mobile, email, pan_number, aadhaar_number)');
  await ensureIndex('loan_applications', 'uq_loan_applications_source_lead', 'UNIQUE KEY uq_loan_applications_source_lead (source_system, source_lead_id)');
  await repairUnworkedImportedLeadStatuses();
  await repairUnworkedImportedLeadStatusEvents();
  await ensureIndex('lead_status_events', 'idx_lead_status_events_lead_id', 'INDEX idx_lead_status_events_lead_id (lead_id)');
  await ensureIndex('lead_status_events', 'idx_lead_status_events_application_id', 'INDEX idx_lead_status_events_application_id (application_id)');
  await ensureIndex('lead_status_events', 'idx_lead_status_events_occurred_at', 'INDEX idx_lead_status_events_occurred_at (occurred_at)');
  await ensureColumn('lead_document_requests', 'group_token', 'group_token VARCHAR(80) DEFAULT NULL');
  await ensureColumn('cibil_reports', 'analysis_json', 'analysis_json LONGTEXT DEFAULT NULL');
  await ensureColumn('cibil_reports', 'lead_id', 'lead_id VARCHAR(30) DEFAULT NULL');
  await ensureColumn('cibil_reports', 'application_id', 'application_id VARCHAR(50) DEFAULT NULL');
  await ensureColumn('cibil_reports', 'analysis_raw_response', 'analysis_raw_response LONGTEXT DEFAULT NULL');
  await ensureColumn('cibil_reports', 'analysis_status', 'analysis_status VARCHAR(40) DEFAULT NULL');
  await ensureColumn('cibil_reports', 'analysis_error', 'analysis_error TEXT DEFAULT NULL');
  await ensureColumn('cibil_reports', 'analysis_model', 'analysis_model VARCHAR(80) DEFAULT NULL');
  await ensureColumn('cibil_reports', 'analysis_response_id', 'analysis_response_id VARCHAR(120) DEFAULT NULL');
  await ensureColumn('cibil_reports', 'analyzed_at', 'analyzed_at DATETIME DEFAULT NULL');
  await ensureIndex('cibil_reports', 'idx_cibil_reports_lead_id', 'INDEX idx_cibil_reports_lead_id (lead_id)');
  await ensureIndex('cibil_reports', 'idx_cibil_reports_application_id', 'INDEX idx_cibil_reports_application_id (application_id)');
  await ensureIndex('integration_ingestion_logs', 'idx_integration_logs_source', 'INDEX idx_integration_logs_source (source_system, source_lead_id)');
  await ensureIndex('integration_ingestion_logs', 'idx_integration_logs_created_at', 'INDEX idx_integration_logs_created_at (created_at)');
  await ensureIndex('lead_consents', 'idx_lead_consents_application_id', 'INDEX idx_lead_consents_application_id (application_id)');
  await ensureIndex('loan_repayment_schedule', 'idx_repayment_schedule_loan_id', 'INDEX idx_repayment_schedule_loan_id (loan_id)');
  await ensureIndex('loan_repayment_schedule', 'idx_repayment_schedule_due_date', 'INDEX idx_repayment_schedule_due_date (due_date)');
  await ensureIndex('loan_repayments', 'idx_loan_repayments_loan_id', 'INDEX idx_loan_repayments_loan_id (loan_id)');
  await ensureColumn('payment_links', 'metadata', 'metadata LONGTEXT DEFAULT NULL');
  await ensureIndex('payment_links', 'idx_payment_links_loan_id', 'INDEX idx_payment_links_loan_id (loan_id)');
  await ensureColumn('lead_sanctions', 'borrower_email', 'borrower_email VARCHAR(255) DEFAULT NULL');
  await ensureColumn('lead_sanctions', 'borrower_phone', 'borrower_phone VARCHAR(40) DEFAULT NULL');
  await ensureColumn('lead_sanctions', 'disbursement_date', 'disbursement_date DATE DEFAULT NULL');
  await ensureColumn('lead_sanctions', 'disbursement_mode', 'disbursement_mode VARCHAR(80) DEFAULT NULL');
  await ensureColumn('lead_sanctions', 'bank_name', 'bank_name VARCHAR(255) DEFAULT NULL');
  await ensureColumn('lead_sanctions', 'account_number', 'account_number VARCHAR(50) DEFAULT NULL');
  await ensureColumn('lead_sanctions', 'ifsc_code', 'ifsc_code VARCHAR(20) DEFAULT NULL');
  await ensureColumn('lead_sanctions', 'penal_interest_rate', 'penal_interest_rate DECIMAL(8,2) NOT NULL DEFAULT 2');
  await ensureColumn('lead_sanctions', 'late_fee', 'late_fee VARCHAR(255) DEFAULT NULL');
  await ensureColumn('lead_sanctions', 'acceptance_proof_path', 'acceptance_proof_path VARCHAR(255) DEFAULT NULL');
  await ensureColumn('lead_sanctions', 'acceptance_proof_original_file_name', 'acceptance_proof_original_file_name VARCHAR(255) DEFAULT NULL');
  await ensureColumn('lead_sanctions', 'acceptance_proof_uploaded_at', 'acceptance_proof_uploaded_at DATETIME DEFAULT NULL');
  await ensureColumn('lead_sanctions', 'acceptance_proof_uploaded_by', 'acceptance_proof_uploaded_by VARCHAR(120) DEFAULT NULL');
  await ensureColumn('lead_sanctions', 'whatsapp_status', "whatsapp_status VARCHAR(40) NOT NULL DEFAULT 'pending'");
  await ensureColumn('lead_sanctions', 'whatsapp_error', 'whatsapp_error TEXT DEFAULT NULL');
  await ensureColumn('lead_sanctions', 'whatsapp_sent_at', 'whatsapp_sent_at DATETIME DEFAULT NULL');
  await ensureColumn('lead_sanctions', 'parent_sanction_id', 'parent_sanction_id INT UNSIGNED DEFAULT NULL');
  await ensureColumn('lead_sanctions', 'revision_number', 'revision_number INT NOT NULL DEFAULT 0');
  await ensureColumn('lead_sanctions', 'revision_reason', 'revision_reason TEXT DEFAULT NULL');
  await ensureColumn('lead_sanctions', 'superseded_by_sanction_id', 'superseded_by_sanction_id INT UNSIGNED DEFAULT NULL');
  await ensureColumn('lead_sanctions', 'superseded_at', 'superseded_at DATETIME DEFAULT NULL');
  await ensureColumn('lead_loan_agreements', 'signing_url', 'signing_url VARCHAR(1024) DEFAULT NULL');
  await ensureColumn('lead_loan_agreements', 'signed_pdf_path', 'signed_pdf_path VARCHAR(255) DEFAULT NULL');
  await ensureColumn('lead_loan_agreements', 'provider_request_id', 'provider_request_id VARCHAR(160) DEFAULT NULL');
  await ensureColumn('lead_loan_agreements', 'provider_status', 'provider_status VARCHAR(80) DEFAULT NULL');
  await ensureColumn('lead_loan_agreements', 'whatsapp_status', "whatsapp_status VARCHAR(40) NOT NULL DEFAULT 'pending'");
  await ensureColumn('lead_loan_agreements', 'whatsapp_error', 'whatsapp_error TEXT DEFAULT NULL');
  await ensureColumn('lead_loan_agreements', 'whatsapp_sent_at', 'whatsapp_sent_at DATETIME DEFAULT NULL');
  await ensureColumn('lead_loan_agreements', 'superseded_by_agreement_id', 'superseded_by_agreement_id INT UNSIGNED DEFAULT NULL');
  await ensureColumn('lead_loan_agreements', 'superseded_at', 'superseded_at DATETIME DEFAULT NULL');
  await ensureColumn('lead_accounting_payments', 'loan_id', 'loan_id VARCHAR(32) DEFAULT NULL');
  await ensureColumn('lead_accounting_payments', 'transfer_type', 'transfer_type VARCHAR(20) DEFAULT NULL');
  await ensureColumn('lead_accounting_payments', 'transaction_id', 'transaction_id VARCHAR(120) DEFAULT NULL');
  await ensureColumn('lead_accounting_payments', 'disbursed_at', 'disbursed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
  await ensureColumn('lead_accounting_payments', 'account_number', 'account_number VARCHAR(50) DEFAULT NULL');
  await ensureColumn('lead_accounting_payments', 'bank_name', 'bank_name VARCHAR(255) DEFAULT NULL');
  await ensureColumn('lead_accounting_payments', 'ifsc_code', 'ifsc_code VARCHAR(20) DEFAULT NULL');
  await ensureIndex('lead_accounting_payments', 'idx_lead_accounting_payments_loan_id', 'INDEX idx_lead_accounting_payments_loan_id (loan_id)');
  await ensureIndex('lead_accounting_payments', 'idx_lead_accounting_payments_transaction_id', 'INDEX idx_lead_accounting_payments_transaction_id (transaction_id)');
  await ensureIndex('lead_accounting_payments', 'uq_lead_accounting_payments_transaction_id', 'UNIQUE KEY uq_lead_accounting_payments_transaction_id (transaction_id)');

  // Performance Indexes for high-speed dashboard and lead filtering
  await ensureIndex('loan_applications', 'idx_loan_applications_created_at', 'INDEX idx_loan_applications_created_at (created_at DESC)');
  await ensureIndex('loan_applications', 'idx_loan_applications_status_created', 'INDEX idx_loan_applications_status_created (status, created_at DESC)');
  await ensureIndex('loan_applications', 'idx_loan_applications_assigned_created', 'INDEX idx_loan_applications_assigned_created (assigned_to, created_at DESC)');
  await ensureIndex('loan_applications', 'idx_loan_applications_mobile', 'INDEX idx_loan_applications_mobile (mobile)');
  await ensureIndex('loan_applications', 'idx_loan_applications_email', 'INDEX idx_loan_applications_email (email)');
  await ensureIndex('loan_applications', 'idx_loan_applications_pan', 'INDEX idx_loan_applications_pan (pan_number)');
  await ensureIndex('loans', 'idx_loans_status', 'INDEX idx_loans_status (status)');
  await ensureIndex('loans', 'idx_loans_due_date', 'INDEX idx_loans_due_date (due_date)');
  await ensureIndex('loans', 'idx_loans_status_due_date', 'INDEX idx_loans_status_due_date (status, due_date ASC)');
  await ensureIndex('loan_repayments', 'idx_loan_repayments_loan_status', 'INDEX idx_loan_repayments_loan_status (loan_id, status)');
  await ensureIndex('loans', 'idx_loans_created_at', 'INDEX idx_loans_created_at (created_at DESC)');
  await ensureIndex('loans', 'idx_loans_customer_id', 'INDEX idx_loans_customer_id (customer_id)');
  await ensureIndex('collection_cases', 'idx_collection_cases_status', 'INDEX idx_collection_cases_status (status)');
  await ensureIndex('collection_cases', 'idx_collection_cases_loan_id', 'INDEX idx_collection_cases_loan_id (loan_id)');
  await ensureIndex('audit_logs', 'idx_audit_logs_created_at', 'INDEX idx_audit_logs_created_at (created_at DESC)');

  // Admin & Performance Panel Indexes
  await ensureIndex('lead_call_logs', 'idx_lead_call_logs_created_at', 'INDEX idx_lead_call_logs_created_at (created_at)');
  await ensureIndex('lead_call_logs', 'idx_lead_call_logs_actor_created', 'INDEX idx_lead_call_logs_actor_created (actor, created_at)');
  await ensureIndex('lead_sanctions', 'idx_lead_sanctions_app_created', 'INDEX idx_lead_sanctions_app_created (application_id, created_at DESC)');
  await ensureIndex('lead_sanctions', 'idx_lead_sanctions_lead_created', 'INDEX idx_lead_sanctions_lead_created (lead_id, created_at DESC)');
  await ensureIndex('lead_loan_agreements', 'idx_lead_agreements_app_status', 'INDEX idx_lead_agreements_app_status (application_id, status)');
  await ensureIndex('lead_loan_agreements', 'idx_lead_agreements_lead_status', 'INDEX idx_lead_agreements_lead_status (lead_id, status)');
  await ensureIndex('lead_credit_handoffs', 'idx_lead_handoffs_app_created', 'INDEX idx_lead_handoffs_app_created (application_id, submitted_at DESC)');
  await ensureIndex('lead_credit_handoffs', 'idx_lead_handoffs_lead_created', 'INDEX idx_lead_handoffs_lead_created (lead_id, submitted_at DESC)');
  await ensureIndex('lead_cam_sheets', 'idx_lead_cam_app_created', 'INDEX idx_lead_cam_app_created (application_id, created_at DESC)');
  await ensureIndex('lead_cam_sheets', 'idx_lead_cam_lead_created', 'INDEX idx_lead_cam_lead_created (lead_id, created_at DESC)');
  await ensureIndex('lead_accounting_payments', 'idx_lead_payments_app_disbursed', 'INDEX idx_lead_payments_app_disbursed (application_id, disbursed_at DESC)');
  await ensureIndex('lead_accounting_payments', 'idx_lead_payments_lead_disbursed', 'INDEX idx_lead_payments_lead_disbursed (lead_id, disbursed_at DESC)');
  await ensureIndex('lead_followups', 'idx_lead_followups_due_at', 'INDEX idx_lead_followups_due_at (due_at)');
  await ensureIndex('lead_followups', 'idx_lead_followups_lead_id', 'INDEX idx_lead_followups_lead_id (lead_id)');
  await ensureIndex('crm_users', 'idx_crm_users_role', 'INDEX idx_crm_users_role (role, is_active)');
  await ensureIndex('crm_users', 'idx_crm_users_auth_lookup', 'INDEX idx_crm_users_auth_lookup (email, role, is_active)');
  await ensureIndex('loans', 'idx_loans_status_balance', 'INDEX idx_loans_status_balance (status, balance)');
  await ensureIndex('lead_activities', 'idx_lead_activities_lead_created', 'INDEX idx_lead_activities_lead_created (lead_id, created_at DESC)');
  await ensureIndex('lead_activities', 'idx_lead_activities_app_created', 'INDEX idx_lead_activities_app_created (application_id, created_at DESC)');
  await ensureIndex('customers', 'idx_customers_phone', 'INDEX idx_customers_phone (phone)');
  await ensureIndex('customers', 'idx_customers_email', 'INDEX idx_customers_email (email)');
  await ensureIndex('loan_repayment_schedule', 'idx_repayment_schedule_loan_inst', 'INDEX idx_repayment_schedule_loan_inst (loan_id, installment_number ASC)');
  await ensureIndex('collection_cases', 'idx_collection_cases_customer_phone', 'INDEX idx_collection_cases_customer_phone (phone)');
  await ensureIndex('collection_cases', 'idx_collection_cases_cust_id', 'INDEX idx_collection_cases_cust_id (customer_id)');
  await ensureIndex('collection_cases', 'idx_collection_cases_status_loan', 'INDEX idx_collection_cases_status_loan (status, loan_id)');
  await ensureIndex('collection_ptps', 'idx_collection_ptps_case_status', 'INDEX idx_collection_ptps_case_status (case_id, status)');

  // Critical Performance Composite Indexes for Collections & Reports
  await ensureIndex('cibil_reports', 'idx_cibil_reports_mobile', 'INDEX idx_cibil_reports_mobile (mobile_number)');
  await ensureIndex('cibil_reports', 'idx_cibil_reports_pan', 'INDEX idx_cibil_reports_pan (pan)');
  await ensureIndex('aadhaar_reports', 'idx_aadhaar_app_id', 'INDEX idx_aadhaar_app_id (application_id)');
  await ensureIndex('aadhaar_reports', 'idx_aadhaar_lead_id', 'INDEX idx_aadhaar_lead_id (lead_id)');
  await ensureIndex('aadhaar_reports', 'idx_aadhaar_mobile', 'INDEX idx_aadhaar_mobile (mobile)');
  await ensureIndex('loan_repayments', 'idx_loan_repayments_status_date', 'INDEX idx_loan_repayments_status_date (status, payment_date)');
  await ensureIndex('loan_repayment_schedule', 'idx_repayment_schedule_status_due', 'INDEX idx_repayment_schedule_status_due (status, due_date)');
  await ensureIndex('loans', 'idx_loans_customer_status', 'INDEX idx_loans_customer_status (customer_id, status)');
  await ensureIndex('loan_applications', 'idx_loan_applications_source_lead', 'INDEX idx_loan_applications_source_lead (source_lead_id)');



  // Backfill existing rows with bank account details if they are NULL or empty
  try {
    await query(`
      UPDATE lead_accounting_payments payment
      LEFT JOIN lead_sanctions sanction
        ON sanction.id = COALESCE(
          (SELECT s2.id FROM lead_sanctions s2 WHERE payment.application_id <> '' AND s2.application_id = payment.application_id ORDER BY s2.created_at DESC, s2.id DESC LIMIT 1),
          (SELECT s2.id FROM lead_sanctions s2 WHERE payment.lead_id <> '' AND s2.lead_id = payment.lead_id ORDER BY s2.created_at DESC, s2.id DESC LIMIT 1)
        )
      LEFT JOIN loan_applications la1
        ON payment.application_id <> '' AND la1.application_id = payment.application_id
      LEFT JOIN loan_applications la2
        ON payment.lead_id <> '' AND la2.id = CAST(payment.lead_id AS UNSIGNED)
      SET 
        payment.account_number = COALESCE(NULLIF(payment.account_number, ''), NULLIF(sanction.account_number, ''), NULLIF(la1.account_number, ''), NULLIF(la2.account_number, '')),
        payment.bank_name = COALESCE(NULLIF(payment.bank_name, ''), NULLIF(sanction.bank_name, ''), NULLIF(la1.bank_name, ''), NULLIF(la2.bank_name, '')),
        payment.ifsc_code = COALESCE(NULLIF(payment.ifsc_code, ''), NULLIF(sanction.ifsc_code, ''), NULLIF(la1.ifsc_code, ''), NULLIF(la2.ifsc_code, ''))
      WHERE payment.account_number IS NULL OR payment.account_number = '';
    `);
  } catch (backfillError) {
    console.error('⚠️ Failed to backfill bank details for existing payments:', backfillError);
  }

  // 1-Click Reloan Migrations
  await ensureColumn('loan_applications', 'is_reloan', 'is_reloan TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('loan_applications', 'previous_loan_id', 'previous_loan_id VARCHAR(32) DEFAULT NULL');
  await ensureColumn('loan_applications', 'last_login_at', 'last_login_at DATETIME DEFAULT NULL');
  await ensureColumn('customers', 'last_login_at', 'last_login_at DATETIME DEFAULT NULL');
  await ensureColumn('collection_cases', 'last_login_at', 'last_login_at DATETIME DEFAULT NULL');

  // Lead Assignment & Product Mappings Migrations
  await ensureColumn('crm_users', 'last_assigned_at', 'last_assigned_at TIMESTAMP NULL DEFAULT NULL');
  await ensureColumn('crm_users', 'on_duty', 'on_duty TINYINT(1) DEFAULT 1');
  await ensureColumn('crm_users', 'login_otp_code', 'login_otp_code VARCHAR(10) DEFAULT NULL');
  await ensureColumn('crm_users', 'login_otp_expires_at', 'login_otp_expires_at DATETIME DEFAULT NULL');
  await ensureColumn('crm_users', 'login_otp_token', 'login_otp_token VARCHAR(255) DEFAULT NULL');

  await query(`
    CREATE TABLE IF NOT EXISTS user_product_mappings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      product_slug VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES crm_users(id) ON DELETE CASCADE,
      UNIQUE KEY uniq_user_product (user_id, product_slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Official Email OTP Verification Migrations
  await ensureOfficialEmailColumns();

  // BillDesk eMandate Migrations
  await ensureBilldeskEmandateColumns();

  // Ensure support user accounts exist
  await ensureCrmUserRoleSupportsProductAdmin();
  await ensureSupportUsers();
}

async function ensureCrmUserRoleSupportsProductAdmin() {
  try {
    await query(`ALTER TABLE crm_users MODIFY COLUMN role VARCHAR(80) NOT NULL`);
  } catch (err) {
    console.warn('[schema] ensureCrmUserRoleSupportsProductAdmin skipped:', err.message);
  }
}

async function ensureSupportUsers() {
  await ensureCrmUserRoleSupportsProductAdmin();

  const users = [
    { email: 'support@waqtmoney.in', name: 'Waqt Support Telecaller', role: 'telecaller' },
    { email: 'support@waqtfinance.com', name: 'Waqt Support Telecaller', role: 'telecaller' },
    { email: 'support@waqtmoney.in', name: 'Waqt Support Admin', role: 'product-admin' },
    { email: 'support@waqtfinance.com', name: 'Waqt Support Admin', role: 'product-admin' },
    { email: 'telecaller@waqtfinance.com', name: 'Waqt Telecaller', role: 'telecaller' },
  ];

  const salt = '45fc08e36726dcad454fdc48a13b0c61';
  const hash = 'df0f082a63d1ba7ee1d265f71b286a2dd4a7dea87d7124a4fcf46f85cc83e621'; // WaqtSupport@2026##

  for (const u of users) {
    try {
      await query(
        `INSERT INTO crm_users (email, name, role, password_salt, password_hash, is_active, on_duty)
         VALUES (?, ?, ?, ?, ?, 1, 1)
         ON DUPLICATE KEY UPDATE name = VALUES(name), password_salt = VALUES(password_salt), password_hash = VALUES(password_hash), is_active = 1, on_duty = 1`,
        [u.email, u.name, u.role, salt, hash]
      );
    } catch (e) {
      console.error('[SCHEMA] ensureSupportUsers failed for:', u.email, u.role, e.message);
      throw e;
    }
  }
}

async function ensureOfficialEmailColumns() {
  await ensureColumn('loan_applications', 'office_email', 'office_email VARCHAR(255) DEFAULT NULL');
  await ensureColumn('loan_applications', 'official_email_verified', 'official_email_verified TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('loan_applications', 'official_email_verified_at', 'official_email_verified_at DATETIME DEFAULT NULL');
  await ensureColumn('loan_applications', 'official_email_verified_by', 'official_email_verified_by VARCHAR(255) DEFAULT NULL');

  await query(`
    CREATE TABLE IF NOT EXISTS official_email_otps (
      id INT AUTO_INCREMENT PRIMARY KEY,
      application_id VARCHAR(120) NOT NULL,
      official_email VARCHAR(255) NOT NULL,
      otp_hash VARCHAR(255) NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      max_attempts INT NOT NULL DEFAULT 3,
      expires_at DATETIME NOT NULL,
      resend_available_at DATETIME NOT NULL,
      is_used TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by VARCHAR(255) DEFAULT NULL,
      INDEX idx_off_email_app (application_id),
      INDEX idx_off_email_exp (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function ensureBilldeskEmandateColumns() {
  await ensureColumn('loan_applications', 'emandate_provider', "emandate_provider VARCHAR(50) NOT NULL DEFAULT 'cashfree'");
  await ensureColumn('loan_applications', 'emandate_status', "emandate_status VARCHAR(50) NOT NULL DEFAULT 'PENDING'");
  await ensureColumn('loan_applications', 'emandate_id', 'emandate_id VARCHAR(120) DEFAULT NULL');
  await ensureColumn('loan_applications', 'emandate_ref_id', 'emandate_ref_id VARCHAR(120) DEFAULT NULL');
  await ensureColumn('loan_applications', 'emandate_plan_name', 'emandate_plan_name VARCHAR(120) DEFAULT NULL');
  await ensureColumn('loan_applications', 'emandate_auth_url', 'emandate_auth_url TEXT DEFAULT NULL');
  await ensureColumn('loan_applications', 'emandate_bank_name', 'emandate_bank_name VARCHAR(120) DEFAULT NULL');
  await ensureColumn('loan_applications', 'emandate_payment_mode', "emandate_payment_mode VARCHAR(100) DEFAULT NULL");
  await ensureColumn('loan_applications', 'emandate_upi_id', "emandate_upi_id VARCHAR(120) DEFAULT NULL");
  await ensureColumn('loan_applications', 'emandate_account_number', "emandate_account_number VARCHAR(120) DEFAULT NULL");
  await ensureColumn('loan_applications', 'emandate_max_amount', 'emandate_max_amount DECIMAL(12,2) DEFAULT NULL');
  await ensureColumn('loan_applications', 'emandate_registered_at', 'emandate_registered_at DATETIME DEFAULT NULL');

  await query(`
    CREATE TABLE IF NOT EXISTS billdesk_emandates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      application_id VARCHAR(120) NOT NULL,
      billdesk_order_id VARCHAR(120) DEFAULT NULL,
      billdesk_txn_id VARCHAR(120) DEFAULT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
      auth_url TEXT DEFAULT NULL,
      bank_name VARCHAR(120) DEFAULT NULL,
      max_amount DECIMAL(12,2) DEFAULT NULL,
      jose_request TEXT DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_bd_app (application_id),
      INDEX idx_bd_order (billdesk_order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS razorpay_emandates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      application_id VARCHAR(120) NOT NULL,
      razorpay_customer_id VARCHAR(120) DEFAULT NULL,
      razorpay_subscription_id VARCHAR(120) DEFAULT NULL,
      razorpay_order_id VARCHAR(120) DEFAULT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
      auth_url TEXT DEFAULT NULL,
      bank_name VARCHAR(120) DEFAULT NULL,
      max_amount DECIMAL(12,2) DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_rzp_app (application_id),
      INDEX idx_rzp_sub (razorpay_subscription_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // Ensure Account Aggregator Tables
  await ensureAccountAggregatorTables();
}

async function ensureAccountAggregatorTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS lead_account_aggregator_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      application_id VARCHAR(120) NOT NULL,
      tracking_id VARCHAR(120) NOT NULL,
      digital_flow_request_id VARCHAR(120) DEFAULT NULL,
      redirection_url TEXT DEFAULT NULL,
      template_code VARCHAR(50) DEFAULT 'CT003',
      status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
      consent_id VARCHAR(120) DEFAULT NULL,
      reference_id VARCHAR(120) DEFAULT NULL,
      analysis_id VARCHAR(120) DEFAULT NULL,
      fip_name VARCHAR(120) DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_aa_app (application_id),
      INDEX idx_aa_tracking (tracking_id),
      INDEX idx_aa_flow_req (digital_flow_request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS lead_account_aggregator_analytics (
      id INT AUTO_INCREMENT PRIMARY KEY,
      application_id VARCHAR(120) NOT NULL,
      tracking_id VARCHAR(120) NOT NULL,
      reference_id VARCHAR(120) DEFAULT NULL,
      analysis_id VARCHAR(120) DEFAULT NULL,
      avg_monthly_credits DECIMAL(12,2) DEFAULT 0,
      avg_monthly_debits DECIMAL(12,2) DEFAULT 0,
      net_cash_flow DECIMAL(12,2) DEFAULT 0,
      salary_detected TINYINT(1) DEFAULT 0,
      detected_employer VARCHAR(255) DEFAULT NULL,
      avg_salary DECIMAL(12,2) DEFAULT 0,
      bounces_count INT DEFAULT 0,
      risk_score VARCHAR(50) DEFAULT 'LOW_RISK',
      raw_analytics_json LONGTEXT DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_aa_an_app (application_id),
      INDEX idx_aa_an_tracking (tracking_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = {
  migrate,
  ensureOfficialEmailColumns,
  ensureBilldeskEmandateColumns,
  ensureRazorpayEmandateColumns: ensureBilldeskEmandateColumns,
  ensureAccountAggregatorTables,
  ensureCrmUserRoleSupportsProductAdmin,
  ensureSupportUsers,
};


