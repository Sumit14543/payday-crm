const { query } = require('../config/db');
const { assertLeadAccess } = require('../utils/leadAccess');

async function documentAccess(req, res, next) {
  const path = String(req.documentPath || req.query?.path || req.path || '').split('?')[0];
  if (path.startsWith('/uploads/brand/')) return next();
  if (!path.startsWith('/uploads/') || path.includes('..') || path.includes('\\')) return res.status(403).json({ success: false, message: 'Invalid document reference.' });
  if (req.documentCapability?.path === path) { res.setHeader('Cache-Control', 'private, no-store'); return next(); }
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication is required.' });
  const fullPath = (process.env.PUBLIC_API_URL || 'https://payday-api.waqtmoney.com').replace(/\/$/, '') + path;
  const params = [];
  const match = column => { params.push(path, fullPath); return `${column} IN (?, ?)`; };
  const statements = [
    `SELECT lead_id, application_id FROM lead_document_requests WHERE ${match('uploaded_file')}`,
    `SELECT lead_id, application_id FROM lead_sanctions WHERE ${match('pdf_path')} OR ${match('acceptance_proof_path')}`,
    `SELECT lead_id, application_id FROM lead_loan_agreements WHERE ${match('pdf_path')} OR ${match('signed_pdf_path')}`,
    `SELECT lead_id, application_id FROM cibil_reports WHERE ${match('pdf_url')}`,
    `SELECT lead_id, application_id FROM loan_repayments WHERE ${match("CASE WHEN JSON_VALID(metadata) THEN JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.proofUrl')) END")}`,
    `SELECT CAST(id AS CHAR) AS lead_id, application_id FROM loan_applications WHERE ${match('company_id_card')} OR ${match('selfie_image')} OR ${match('salary_slip_current')} OR ${match('salary_slip_previous')} OR ${match('salary_slip_old')}`,
  ];
  const rows = await query(`SELECT DISTINCT application.id AS rawId, application.application_id AS id, application.assigned_to AS assignedTo
    FROM (${statements.join(' UNION ALL ')}) document
    JOIN loan_applications application ON (NULLIF(document.application_id, '') IS NOT NULL AND application.application_id = document.application_id)
      OR (NULLIF(document.lead_id, '') IS NOT NULL AND CAST(application.id AS CHAR) = document.lead_id)`, params);
  if (!rows.length) return res.status(404).json({ success: false, message: 'Document not found in this company.' });
  assertLeadAccess(req.user, rows.find(row => {
    try { assertLeadAccess(req.user, row); return true; } catch { return false; }
  }));
  res.setHeader('Cache-Control', 'private, no-store');
  next();
}
module.exports = documentAccess;
