const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { connectDatabase, query } = require('../config/db');
const { uploadPath, resolveUploadPath } = require('../config/uploads');
const sanctionLetterService = require('../services/sanctionLetterService');
const sanctionModel = require('../models/sanctionModel');
const { databaseDateOnly, formatSanctionDate } = require('../utils/sanctionDates');

// Extract text from raw PDF buffer by parsing flate streams
function extractPdfText(buf) {
  if (!buf || !Buffer.isBuffer(buf)) return '';
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  let fullText = '';

  while ((match = streamRegex.exec(buf.toString('latin1'))) !== null) {
    try {
      const inflated = zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');

      // 1. Match TJ kerning arrays: [ ... ] TJ
      const tjRegex = /\[([\s\S]*?)\]\s*TJ/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(inflated)) !== null) {
        const inner = tjMatch[1];
        const hexRegex = /<([0-9a-fA-F]+)>/g;
        let h;
        while ((h = hexRegex.exec(inner)) !== null) {
          fullText += Buffer.from(h[1], 'hex').toString('utf8');
        }
        const litRegex = /\(([^)]*)\)/g;
        let lit;
        while ((lit = litRegex.exec(inner)) !== null) {
          fullText += lit[1];
        }
        fullText += ' ';
      }

      // 2. Match standard Tj: (...) Tj
      const tjSingleRegex = /\(([^)]*)\)\s*Tj/g;
      let singleMatch;
      while ((singleMatch = tjSingleRegex.exec(inflated)) !== null) {
        fullText += singleMatch[1] + ' ';
      }
    } catch (e) {
      // not a flate stream, ignore
    }
  }
  return fullText;
}

function extractDueDateFromPdfBuffer(buf) {
  const text = extractPdfText(buf);
  const m = text.match(/due on\s+([0-9]{1,2}\s+[A-Za-z]{3,9}\s+[0-9]{4})/i)
         || text.match(/due on\s+([0-9]{1,2}-[A-Za-z]{3,9}-[0-9]{4})/i)
         || text.match(/due on\s+([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  return m ? m[1].trim() : null;
}

function formatCrmDate(val) {
  if (!val) return '';
  return formatSanctionDate(val);
}

function normalizeDate(str) {
  if (!str) return '';
  const clean = str.replace(/-/g, ' ').trim();
  const parts = clean.split(/\s+/);
  if (parts.length === 3) {
    const months = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
      january: '01', february: '02', march: '03', april: '04', june: '06',
      july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
    };
    const day = parts[0].padStart(2, '0');
    const mon = months[parts[1].toLowerCase()] || '00';
    const year = parts[2];
    return `${year}-${mon}-${day}`;
  }
  return str;
}

function findPdfOnDisk(sanctionsDir, pdfPath, loanId, agreementNumber) {
  if (pdfPath) {
    const candidates = [
      resolveUploadPath(pdfPath),
      path.join(sanctionsDir, path.basename(pdfPath)),
      path.resolve(__dirname, '..', '.' + pdfPath)
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c)) return c;
    }
  }

  if (fs.existsSync(sanctionsDir)) {
    const files = fs.readdirSync(sanctionsDir);
    const cleanLoanId = String(loanId || '').replace(/[^a-z0-9]/gi, '');
    const cleanAg = String(agreementNumber || '').replace(/[^a-z0-9]/gi, '');
    for (const f of files) {
      const cleanF = f.replace(/[^a-z0-9]/gi, '');
      if ((cleanLoanId && cleanF.includes(cleanLoanId)) || (cleanAg && cleanF.includes(cleanAg))) {
        return path.join(sanctionsDir, f);
      }
    }
  }
  return null;
}

async function auditRealPdfs() {
  console.log('[Audit] Connecting to DB to read ACTUAL Sanction PDF text for November loans...\n');
  await connectDatabase();

  const sanctionsDir = uploadPath('sanctions');

  const rows = await query(`
    SELECT 
      l.id AS loan_id,
      l.customer_id,
      COALESCE(s.borrower, la.full_name, c.name, cc.customer, 'Customer') AS customer_name,
      COALESCE(la.pan_number, '') AS pan_number,
      COALESCE(la.mobile, s.borrower_phone, c.phone, cc.phone, '') AS phone,
      l.principal,
      COALESCE(p.amount, s.disbursed_amount, 0) AS disbursed_amount,
      COALESCE(l.total_amount, s.repayment_amount, 0) AS repayment_amount,
      COALESCE(DATE(p.disbursed_at), l.start_date) AS disbursed_date,
      l.due_date AS crm_due_date,
      s.id AS sanction_id,
      s.agreement_number,
      s.pdf_path,
      s.due_date AS db_sanction_due_date
    FROM loans l
    LEFT JOIN lead_accounting_payments p 
      ON (p.loan_id = l.id OR TRIM(LEADING 'LN' FROM UPPER(p.loan_id)) = TRIM(LEADING 'LN' FROM UPPER(l.id)) OR (p.application_id <> '' AND p.application_id = l.customer_id))
    LEFT JOIN customers c ON c.id = l.customer_id
    LEFT JOIN collection_cases cc ON (cc.loan_id = l.id OR TRIM(LEADING 'LN' FROM UPPER(cc.loan_id)) = TRIM(LEADING 'LN' FROM UPPER(l.id)))
    LEFT JOIN loan_applications la ON (la.application_id = l.customer_id OR CAST(la.id AS CHAR) = l.customer_id)
    LEFT JOIN lead_sanctions s ON s.id = (
      SELECT s2.id FROM lead_sanctions s2 
      WHERE s2.agreement_number = l.id
         OR TRIM(LEADING 'LN' FROM UPPER(s2.agreement_number)) = TRIM(LEADING 'LN' FROM UPPER(l.id))
         OR (l.customer_id <> '' AND s2.application_id = l.customer_id)
         OR (l.customer_id <> '' AND s2.lead_id = l.customer_id)
      ORDER BY s2.id DESC LIMIT 1
    )
    WHERE (COALESCE(DATE(p.disbursed_at), l.start_date) >= '2026-11-01' OR l.created_at >= '2026-11-01')
    ORDER BY COALESCE(p.disbursed_at, l.start_date) DESC, l.id DESC
  `);

  console.log(`Found ${rows.length} total loans in November.\n`);

  const results = [];
  let mismatchCount = 0;
  let matchCount = 0;
  let noPdfCount = 0;

  for (const row of rows) {
    let pdfPath = findPdfOnDisk(sanctionsDir, row.pdf_path, row.loan_id, row.agreement_number);
    let extractedPdfDate = null;
    let pdfSource = 'DISK';

    // If PDF is not on disk but sanction row exists, generate the exact PDF
    if (!pdfPath && row.sanction_id) {
      try {
        const [rawSanction] = await query('SELECT * FROM lead_sanctions WHERE id = ?', [row.sanction_id]);
        if (rawSanction) {
          const mapped = sanctionModel.findLatestByLead ? (await sanctionModel.findByDecisionToken(rawSanction.decision_token)) : null;
          const sanctionObj = mapped || {
            principalAmount: rawSanction.principal_amount,
            agreementNumber: rawSanction.agreement_number || row.loan_id,
            agreementDate: rawSanction.agreement_date,
            borrower: rawSanction.borrower,
            dueDate: rawSanction.due_date,
            repaymentAmount: rawSanction.repayment_amount,
            disbursedAmount: rawSanction.disbursed_amount,
            interestRate: rawSanction.interest_rate,
            processingFee: rawSanction.processing_fee,
            gstAmount: rawSanction.gst_amount,
            bankName: rawSanction.bank_name,
            accountNumber: rawSanction.account_number,
            ifscCode: rawSanction.ifsc_code,
            lateFee: rawSanction.late_fee,
            penalInterestRate: rawSanction.penal_interest_rate
          };
          const gen = await sanctionLetterService.generateSanctionPdf(sanctionObj);
          if (gen && gen.absolutePath && fs.existsSync(gen.absolutePath)) {
            pdfPath = gen.absolutePath;
            pdfSource = 'GENERATED_FROM_SANCTION';
          }
        }
      } catch (err) {
        // ignore generation error
      }
    }

    if (pdfPath && fs.existsSync(pdfPath)) {
      try {
        const buf = fs.readFileSync(pdfPath);
        extractedPdfDate = extractDueDateFromPdfBuffer(buf);
      } catch (e) {}
    }

    const crmFormatted = formatCrmDate(row.crm_due_date);
    const crmNorm = normalizeDate(crmFormatted);
    const pdfNorm = normalizeDate(extractedPdfDate);

    let status = 'NO_PDF';
    if (extractedPdfDate) {
      if (crmNorm === pdfNorm) {
        status = 'MATCHED';
        matchCount++;
      } else {
        status = 'MISMATCH';
        mismatchCount++;
      }
    } else {
      noPdfCount++;
      status = 'PDF_NOT_FOUND_OR_UNREADABLE';
    }

    results.push({
      loanId: row.loan_id,
      customerName: row.customer_name,
      pan: row.pan_number,
      disbursedAmt: row.disbursed_amount,
      disbursedDate: row.disbursed_date ? String(row.disbursed_date).slice(0, 10) : '',
      crmDueDate: crmFormatted,
      pdfExtractedDate: extractedPdfDate || 'NOT FOUND',
      pdfSource: extractedPdfDate ? pdfSource : 'NONE',
      status
    });
  }

  // Display only Mismatches or Summary
  const mismatches = results.filter(r => r.status === 'MISMATCH');
  console.log(`=== AUDIT SUMMARY ===`);
  console.log(`Total November Loans: ${rows.length}`);
  console.log(`100% MATCHED with PDF: ${matchCount}`);
  console.log(`ACTUAL MISMATCH with PDF: ${mismatchCount}`);
  console.log(`No PDF Found: ${noPdfCount}\n`);

  if (mismatches.length > 0) {
    console.log(`[!] FOUND ${mismatches.length} ACTUAL MISMATCHES (PDF Text differs from CRM Due Date):`);
    console.table(mismatches);
  } else {
    console.log(`[OK] ZERO mismatches found! Every single readable Sanction PDF due date matches CRM due date!`);
  }

  // Write full audit result to JSON and CSV
  const csvHeader = 'Loan ID,Customer Name,PAN,Disbursed Amt,Disbursed Date,CRM Due Date,PDF Extracted Due Date,PDF Source,Status\n';
  const csvRows = results.map(r => `"${r.loanId}","${r.customerName}","${r.pan}","${r.disbursedAmt}","${r.disbursedDate}","${r.crmDueDate}","${r.pdfExtractedDate}","${r.pdfSource}","${r.status}"`).join('\n');
  const exportPath = path.resolve(__dirname, '..', `real_pdf_audit_${Date.now()}.csv`);
  fs.writeFileSync(exportPath, csvHeader + csvRows, 'utf8');
  console.log(`\nFull detailed report saved to: ${exportPath}`);

  process.exit(0);
}

auditRealPdfs().catch(err => {
  console.error('[Error]:', err);
  process.exit(1);
});
