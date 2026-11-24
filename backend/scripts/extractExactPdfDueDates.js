const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { connectDatabase, query } = require('../config/db');
const { uploadPath, resolveUploadPath } = require('../config/uploads');

function extractDateFromPdf(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const buf = fs.readFileSync(filePath);
    const content = buf.toString('latin1');
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    let fullText = '';

    while ((match = streamRegex.exec(content)) !== null) {
      try {
        const inflated = zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
        
        // 1. Text arrays: [(...) num (...)] TJ or [<hex> num <hex>] TJ
        const tjRegex = /\[([\s\S]*?)\]\s*TJ/g;
        let tjMatch;
        while ((tjMatch = tjRegex.exec(inflated)) !== null) {
          const inner = tjMatch[1];
          const litRegex = /\(([^)]*)\)/g;
          let lit;
          while ((lit = litRegex.exec(inner)) !== null) {
            fullText += lit[1];
          }
          const hexRegex = /<([0-9a-fA-F]+)>/g;
          let h;
          while ((h = hexRegex.exec(inner)) !== null) {
            fullText += Buffer.from(h[1], 'hex').toString('utf8');
          }
          fullText += ' ';
        }

        // 2. Direct string: (...) Tj
        const singleRegex = /\(([^)]*)\)\s*Tj/g;
        let singleMatch;
        while ((singleMatch = singleRegex.exec(inflated)) !== null) {
          fullText += singleMatch[1] + ' ';
        }
      } catch (e) {}
    }

    // Match exact phrase printed by sanctionLetterService: "due on <date>"
    const m = fullText.match(/due on\s+([0-9]{1,2}[-\s][A-Za-z]{3,9}[-\s][0-9]{4})/i)
           || fullText.match(/due on\s+([0-9]{4}-[0-9]{2}-[0-9]{2})/i);

    return m ? m[1].trim() : null;
  } catch (err) {
    return null;
  }
}

async function run() {
  await connectDatabase();
  const sanctionsDir = uploadPath('sanctions');

  const rows = await query(`
    SELECT 
      l.id AS loan_id,
      COALESCE(s.borrower, la.full_name, c.name, 'Customer') AS customer_name,
      l.principal,
      COALESCE(p.amount, s.disbursed_amount, 0) AS disbursed_amount,
      COALESCE(DATE(p.disbursed_at), l.start_date) AS disbursed_date,
      l.due_date AS crm_due_date,
      s.due_date AS sanction_table_due_date,
      s.pdf_path,
      s.agreement_number
    FROM loans l
    LEFT JOIN lead_accounting_payments p ON (p.loan_id = l.id)
    LEFT JOIN customers c ON c.id = l.customer_id
    LEFT JOIN loan_applications la ON (la.application_id = l.customer_id)
    LEFT JOIN lead_sanctions s ON s.id = (
      SELECT s2.id FROM lead_sanctions s2 
      WHERE s2.agreement_number = l.id
         OR TRIM(LEADING 'LN' FROM UPPER(s2.agreement_number)) = TRIM(LEADING 'LN' FROM UPPER(l.id))
         OR s2.application_id = l.customer_id
      ORDER BY s2.id DESC LIMIT 1
    )
    WHERE (COALESCE(DATE(p.disbursed_at), l.start_date) >= '2026-11-01' OR l.created_at >= '2026-11-01')
    ORDER BY COALESCE(p.disbursed_at, l.start_date) ASC, l.id ASC
  `);

  console.log(`\n========================================================================`);
  console.log(`  EXACT NOVEMBER SANCTION PDF DUE DATE AUDIT (${rows.length} Loans)`);
  console.log(`========================================================================\n`);

  let countMatched = 0;
  let countMismatch = 0;
  const list = [];

  for (const r of rows) {
    let physicalPdfPath = null;
    if (r.pdf_path) {
      const candidates = [
        resolveUploadPath(r.pdf_path),
        path.join(sanctionsDir, path.basename(r.pdf_path)),
        path.resolve(__dirname, '..', '.' + r.pdf_path)
      ];
      for (const c of candidates) {
        if (c && fs.existsSync(c)) {
          physicalPdfPath = c;
          break;
        }
      }
    }

    const dateInsidePdf = physicalPdfPath ? extractDateFromPdf(physicalPdfPath) : null;
    const crmDate = r.crm_due_date ? String(r.crm_due_date).slice(0, 10) : 'N/A';
    const sanctionTableDate = r.sanction_table_due_date ? String(r.sanction_table_due_date).slice(0, 10) : 'N/A';
    const effectivePdfDate = dateInsidePdf || sanctionTableDate;

    const isMatch = (crmDate === effectivePdfDate) || (effectivePdfDate === 'N/A');

    if (isMatch) countMatched++;
    else countMismatch++;

    list.push({
      loanId: r.loan_id,
      customer: r.customer_name,
      disbursedDate: r.disbursed_date ? String(r.disbursed_date).slice(0, 10) : 'N/A',
      crmDueDate: crmDate,
      sanctionDueDate: effectivePdfDate,
      source: dateInsidePdf ? 'READ_FROM_PDF_TEXT' : 'SANCTION_DATABASE_RECORD',
      isMatch
    });
  }

  console.table(list.slice(0, 25)); // Print first 25
  console.log(`\nTotal: ${rows.length} | Matched: ${countMatched} | Mismatched: ${countMismatch}`);

  // Save full JSON result
  const outPath = path.resolve(__dirname, '../../exact_november_pdf_due_dates.json');
  fs.writeFileSync(outPath, JSON.stringify(list, null, 2));
  console.log(`\nFull report saved to: ${outPath}\n`);

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
