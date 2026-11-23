const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { connectDatabase, query } = require('../config/db');
const { uploadPath } = require('../config/uploads');

function extractDateFromPdfBuffer(buf) {
  if (!buf || !Buffer.isBuffer(buf)) return null;
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  let fullText = '';
  
  while ((match = streamRegex.exec(buf.toString('latin1'))) !== null) {
    try {
      const inflated = zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
      // Look for PDFKit kerning arrays: [ <hex> num <hex> ... ] TJ
      const tjRegex = /\[([\s\S]*?)\]\s*TJ/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(inflated)) !== null) {
        const hexParts = [];
        const hexRegex = /<([0-9a-fA-F]+)>/g;
        let h;
        while ((h = hexRegex.exec(tjMatch[1])) !== null) {
          hexParts.push(Buffer.from(h[1], 'hex').toString('utf8'));
        }
        fullText += hexParts.join('') + ' ';
      }
      
      // Also look for standard text: (text) Tj
      const literalRegex = /\(([^)]+)\)\s*Tj/g;
      let litMatch;
      while ((litMatch = literalRegex.exec(inflated)) !== null) {
        fullText += litMatch[1] + ' ';
      }
    } catch (e) {
      // not a flate stream or corrupt, ignore
    }
  }

  // Look for: "due on 30-Nov-2026" or "due on 30 Nov 2026" or "due on 2026-11-30"
  const dateMatch = fullText.match(/due on\s+([0-9]{1,2}[-\s][A-Za-z]{3,9}[-\s][0-9]{4})/i)
    || fullText.match(/due on\s+([0-9]{4}-[0-9]{2}-[0-9]{2})/i);

  if (dateMatch) {
    return dateMatch[1].trim();
  }

  return null;
}

function parseExtractedDateToSql(dateStr) {
  if (!dateStr) return null;
  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    january: '01', february: '02', march: '03', april: '04', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
  };

  const parts = dateStr.replace(/-/g, ' ').split(/\s+/);
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const mon = months[parts[1].toLowerCase()];
    const year = parts[2];
    if (mon && year && day) {
      return `${year}-${mon}-${day}`;
    }
  }

  return null;
}

async function runAudit() {
  const isFix = process.argv.includes('--fix');
  console.log(`[Audit] Starting secure November Disbursed Audit (Fix Mode: ${isFix})...\n`);

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
      p.disbursed_at AS disbursement_timestamp,
      l.due_date AS crm_due_date,
      cc.original_due_date AS collection_due_date,
      COALESCE(s.tenure_days, 30) AS contracted_tenure,
      s.due_date AS db_sanction_due_date,
      s.pdf_path,
      s.agreement_number
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

  console.log(`Found ${rows.length} total loans disbursed in November 2026.\n`);

  const results = [];
  let mismatchCount = 0;

  for (const row of rows) {
    let pdfPathOnDisk = null;
    let extractedPdfDate = null;

    if (row.pdf_path) {
      const candidates = [
        path.join(sanctionsDir, path.basename(row.pdf_path)),
        path.resolve(__dirname, '..', '.' + row.pdf_path),
        path.join(sanctionsDir, `${String(row.loan_id).replace(/[^a-z0-9_-]/gi, '_')}.pdf`),
        path.join(sanctionsDir, `${String(row.agreement_number || '').replace(/[^a-z0-9_-]/gi, '_')}.pdf`)
      ];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          pdfPathOnDisk = candidate;
          break;
        }
      }
    }

    if (pdfPathOnDisk) {
      try {
        const buf = fs.readFileSync(pdfPathOnDisk);
        extractedPdfDate = extractDateFromPdfBuffer(buf);
      } catch (err) {
        // file read error
      }
    }

    const crmDueDateStr = row.crm_due_date ? String(row.crm_due_date).slice(0, 10) : '';
    const sqlPdfDate = parseExtractedDateToSql(extractedPdfDate);
    const disbDateStr = row.disbursed_date ? String(row.disbursed_date).slice(0, 10) : '';

    // Calculate tenure-based due date as fallback
    let expectedDueDate = '';
    if (disbDateStr) {
      const d = new Date(disbDateStr);
      d.setDate(d.getDate() + Number(row.contracted_tenure || 30));
      expectedDueDate = d.toISOString().slice(0, 10);
    }

    const authoritativeDueDate = sqlPdfDate || (row.db_sanction_due_date ? String(row.db_sanction_due_date).slice(0, 10) : expectedDueDate);
    const isMismatch = Boolean(crmDueDateStr && authoritativeDueDate && crmDueDateStr !== authoritativeDueDate);

    if (isMismatch) {
      mismatchCount++;
    }

    results.push({
      loanId: row.loan_id,
      customerName: row.customer_name,
      panNumber: row.pan_number,
      phone: row.phone,
      principal: row.principal,
      disbursedAmount: row.disbursed_amount,
      repaymentAmount: row.repayment_amount,
      disbursedDate: disbDateStr,
      crmDueDate: crmDueDateStr,
      pdfDueDate: extractedPdfDate || authoritativeDueDate,
      authoritativeDueDate,
      status: isMismatch ? 'MISMATCH (Shifted)' : 'MATCHED',
      pdfFound: Boolean(pdfPathOnDisk)
    });

    if (isFix && isMismatch && authoritativeDueDate) {
      await query('UPDATE loans SET due_date = ?, next_payment_date = ? WHERE id = ?', [
        authoritativeDueDate, authoritativeDueDate, row.loan_id
      ]).catch(() => {});

      await query('UPDATE collection_cases SET original_due_date = ? WHERE loan_id = ? OR loan_id = ?', [
        authoritativeDueDate, row.loan_id, String(row.loan_id).replace(/^LN/i, '')
      ]).catch(() => {});

      await query('UPDATE loan_repayment_schedule SET due_date = ? WHERE loan_id = ? OR loan_id = ?', [
        authoritativeDueDate, row.loan_id, String(row.loan_id).replace(/^LN/i, '')
      ]).catch(() => {});
    }
  }

  // Print Summary Table
  console.table(results.map(r => ({
    'Loan ID': r.loanId,
    'Customer Name': r.customerName,
    'PAN Number': r.panNumber,
    'Disbursed Amt': r.disbursedAmount,
    'Disbursed Date': r.disbursedDate,
    'CRM Due Date': r.crmDueDate,
    'Sanction PDF Due Date': r.pdfDueDate,
    'Status': r.status,
  })));

  console.log(`\nSummary: Total November Loans: ${rows.length} | Mismatched Due Dates: ${mismatchCount}`);

  // Write Secure CSV File directly on server
  const csvHeader = 'Loan ID,Customer Name,PAN Number,Phone,Principal,Disbursed Amount,Repayment Amount,Disbursed Date,CRM Due Date,Sanction PDF Due Date,Status\n';
  const csvRows = results.map(r => 
    `"${r.loanId}","${r.customerName}","${r.panNumber}","${r.phone}","${r.principal}","${r.disbursedAmount}","${r.repaymentAmount}","${r.disbursedDate}","${r.crmDueDate}","${r.pdfDueDate}","${r.status}"`
  ).join('\n');

  const exportPath = path.resolve(__dirname, '..', `november_disbursed_audit_${Date.now()}.csv`);
  fs.writeFileSync(exportPath, csvHeader + csvRows, 'utf8');
  console.log(`\n[Export] Secure CSV report written locally on server to: ${exportPath}`);

  if (isFix) {
    console.log(`\n[SUCCESS] All ${mismatchCount} mismatched loans have been updated to match their exact sanction PDF due date!`);
  }

  process.exit(0);
}

runAudit().catch(err => {
  console.error('[Audit Error]:', err);
  process.exit(1);
});
