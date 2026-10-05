const { query } = require('../config/db');

/**
 * Helper to format Javascript dates to DD-MM-YYYY for Tally
 */
function formatDateForTally(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * GET /api/tally/vouchers
 * Endpoint for Tally Connector integration
 * Accepts authentication via:
 *  - Header: x-api-key: WAQT-TALLY-SECRET-KEY-2026
 *  - Header: Authorization: Bearer WAQT-TALLY-SECRET-KEY-2026
 *  - Query param: ?api_key=WAQT-TALLY-SECRET-KEY-2026
 * Accepts optional query parameters:
 *  - startDate (YYYY-MM-DD)
 *  - endDate (YYYY-MM-DD)
 *  - voucherType ("journal" | "receipt" | "payment" | "all")
 */
async function getTallyVouchers(req, res) {
  try {
    // 1. API Key Authentication Check
    const apiKey =
      req.headers['x-api-key'] ||
      req.headers['x-tally-api-key'] ||
      (req.headers['authorization'] ? req.headers['authorization'].replace('Bearer ', '').trim() : null) ||
      req.query.api_key ||
      req.query.apiKey;

    const validKey = process.env.TALLY_API_KEY || 'WAQT-TALLY-SECRET-KEY-DEVELOPER-2026!!';

    if (apiKey !== validKey) {
      return res.status(401).json({
        status: false,
        count: 0,
        data: [],
        message: 'Unauthorized: Invalid or missing API Key for Tally integration.',
      });
    }

    const { startDate, endDate, voucherType = 'all' } = req.query;

    const vouchers = [];
    const processedLoanIds = new Set();

    // 1. DISBURSAL VOUCHERS (Journal / Payment)
    if (voucherType === 'all' || voucherType === 'journal' || voucherType === 'payment') {
      const isPayment = voucherType === 'payment';

      // Source 1A: Query `loans` table as primary source for disbursals
      try {
        let loanWhere = 'WHERE 1=1';
        const loanParams = [];

        if (startDate && endDate) {
          loanWhere += ' AND (l.start_date BETWEEN ? AND ?)';
          loanParams.push(startDate, endDate);
        }

        const loansList = await query(
          `SELECT l.id AS loan_id, l.principal AS loan_principal, l.start_date, l.customer_id, c.name AS customer_name, c.phone AS customer_phone
           FROM loans l
           LEFT JOIN customers c ON c.id = l.customer_id
           ${loanWhere}
           ORDER BY l.id DESC LIMIT 500`,
          loanParams
        );

        (loansList || []).forEach((item) => {
          const loanId = item.loan_id;
          if (!loanId || processedLoanIds.has(loanId)) return;
          processedLoanIds.add(loanId);

          const totalLoanAmount = Number(item.loan_principal || 0);
          const processingFee = Math.round(totalLoanAmount * 0.10);
          const gstAmount = Math.round(processingFee * 0.18);
          const netDisbursed = Math.max(0, totalLoanAmount - processingFee - gstAmount) || totalLoanAmount;
          const feeAndGstTotal = processingFee + gstAmount;

          if (isPayment) {
            vouchers.push({
              id: loanId,
              pan_number: "ABCDE1234F",
              State: "West Bengal",
              address_line1: "Main Address",
              address_line2: null,
              voucher_type: "payment",
              voucher_date: formatDateForTally(item.start_date),
              voucher_number: `VCH/PAY/${loanId}`,
              reference_number: `REF/PAY/${loanId}`,
              narration: `Payment Disbursed to ${item.customer_name || 'Borrower'} (${loanId})`,
              total_debit: netDisbursed,
              total_credit: netDisbursed,
              entries: [
                { ledger_name: loanId, amount: netDisbursed, dr_cr: "Dr" },
                { ledger_name: "Bank / Disbursal Gateway Account", amount: netDisbursed, dr_cr: "Cr" }
              ]
            });
          } else {
            const entries = [
              { ledger_name: loanId, amount: feeAndGstTotal > 0 ? feeAndGstTotal : totalLoanAmount, dr_cr: "Dr" }
            ];
            if (processingFee > 0) entries.push({ ledger_name: "Processing Fee (WaqtMoney)", amount: processingFee, dr_cr: "Cr" });
            if (gstAmount > 0) entries.push({ ledger_name: "Output Igst", amount: gstAmount, dr_cr: "Cr" });

            vouchers.push({
              id: loanId,
              pan_number: "ABCDE1234F",
              State: "West Bengal",
              address_line1: "Main Address",
              address_line2: null,
              voucher_type: "journal",
              voucher_date: formatDateForTally(item.start_date),
              voucher_number: `VCH/DISB/${loanId}`,
              reference_number: `REF/DISB/${loanId}`,
              narration: `Fee & GST Booking for ${item.customer_name || 'Borrower'} (${loanId})`,
              total_debit: feeAndGstTotal > 0 ? feeAndGstTotal : totalLoanAmount,
              total_credit: feeAndGstTotal > 0 ? feeAndGstTotal : totalLoanAmount,
              entries
            });
          }
        });
      } catch (err) {
        console.error('[Tally API] Error fetching loans:', err.message);
      }

      // Source 1B: Query `lead_accounting_payments` table
      try {
        let lapWhere = 'WHERE 1=1';
        const lapParams = [];

        if (startDate && endDate) {
          lapWhere += ' AND (COALESCE(lap.disbursed_at, lap.paid_at) BETWEEN ? AND ?)';
          lapParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }

        const lapList = await query(
          `SELECT lap.id, lap.lead_id, lap.application_id, lap.loan_id, lap.amount, lap.reference, lap.transaction_id, lap.disbursed_at, lap.paid_at
           FROM lead_accounting_payments lap
           ${lapWhere}
           ORDER BY lap.id DESC LIMIT 500`,
          lapParams
        );

        (lapList || []).forEach((item) => {
          const loanId = item.loan_id || `LOAN-${item.application_id || item.lead_id || item.id}`;
          if (!loanId || processedLoanIds.has(loanId)) return;
          processedLoanIds.add(loanId);

          const totalLoanAmount = Number(item.amount || 0);
          const processingFee = Math.round(totalLoanAmount * 0.10);
          const gstAmount = Math.round(processingFee * 0.18);
          const netDisbursed = Math.max(0, totalLoanAmount - processingFee - gstAmount) || totalLoanAmount;
          const feeAndGstTotal = processingFee + gstAmount;

          if (isPayment) {
            vouchers.push({
              id: loanId,
              pan_number: "ABCDE1234F",
              State: "West Bengal",
              address_line1: "Main Address",
              address_line2: null,
              voucher_type: "payment",
              voucher_date: formatDateForTally(item.disbursed_at || item.paid_at),
              voucher_number: `VCH/PAY/${item.id}`,
              reference_number: item.transaction_id || item.reference || `REF/PAY/${item.id}`,
              narration: `Payment Disbursed (${loanId})`,
              total_debit: netDisbursed,
              total_credit: netDisbursed,
              entries: [
                { ledger_name: loanId, amount: netDisbursed, dr_cr: "Dr" },
                { ledger_name: "Bank / Disbursal Gateway Account", amount: netDisbursed, dr_cr: "Cr" }
              ]
            });
          } else {
            const entries = [
              { ledger_name: loanId, amount: feeAndGstTotal > 0 ? feeAndGstTotal : totalLoanAmount, dr_cr: "Dr" }
            ];
            if (processingFee > 0) entries.push({ ledger_name: "Processing Fee (WaqtMoney)", amount: processingFee, dr_cr: "Cr" });
            if (gstAmount > 0) entries.push({ ledger_name: "Output Igst", amount: gstAmount, dr_cr: "Cr" });

            vouchers.push({
              id: loanId,
              pan_number: "ABCDE1234F",
              State: "West Bengal",
              address_line1: "Main Address",
              address_line2: null,
              voucher_type: "journal",
              voucher_date: formatDateForTally(item.disbursed_at || item.paid_at),
              voucher_number: `VCH/DISB/${item.id}`,
              reference_number: item.transaction_id || item.reference || `REF/DISB/${item.id}`,
              narration: `Fee & GST Booking (${loanId})`,
              total_debit: feeAndGstTotal > 0 ? feeAndGstTotal : totalLoanAmount,
              total_credit: feeAndGstTotal > 0 ? feeAndGstTotal : totalLoanAmount,
              entries
            });
          }
        });
      } catch (err) {
        console.error('[Tally API] Error fetching lap:', err.message);
      }

      // Source 1C: Query `loan_applications` as fallback for all applications
      try {
        let laWhere = 'WHERE 1=1';
        const laParams = [];

        if (startDate && endDate) {
          laWhere += ' AND (la.created_at BETWEEN ? AND ?)';
          laParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }

        const laList = await query(
          `SELECT la.id, la.application_id, la.full_name, la.pan_number, la.city, la.state, la.loan_amount, la.processing_fee, la.gst_amount, la.created_at
           FROM loan_applications la
           ${laWhere}
           ORDER BY la.id DESC LIMIT 500`,
          laParams
        );

        (laList || []).forEach((item) => {
          const loanId = item.application_id || `LOAN-${item.id}`;
          if (!loanId || processedLoanIds.has(loanId)) return;
          processedLoanIds.add(loanId);

          const totalLoanAmount = Number(item.loan_amount || 0);
          const processingFee = Number(item.processing_fee || Math.round(totalLoanAmount * 0.10) || 0);
          const gstAmount = Number(item.gst_amount || Math.round(processingFee * 0.18) || 0);
          const netDisbursed = Math.max(0, totalLoanAmount - processingFee - gstAmount) || totalLoanAmount;
          const feeAndGstTotal = processingFee + gstAmount;

          if (isPayment) {
            vouchers.push({
              id: loanId,
              pan_number: item.pan_number || "ABCDE1234F",
              State: item.state || "West Bengal",
              address_line1: item.city || "Main Address",
              address_line2: null,
              voucher_type: "payment",
              voucher_date: formatDateForTally(item.created_at),
              voucher_number: `VCH/PAY/${item.id}`,
              reference_number: `REF/PAY/${item.id}`,
              narration: `Payment Disbursed to ${item.full_name || 'Borrower'} (${loanId})`,
              total_debit: netDisbursed,
              total_credit: netDisbursed,
              entries: [
                { ledger_name: loanId, amount: netDisbursed, dr_cr: "Dr" },
                { ledger_name: "Bank / Disbursal Gateway Account", amount: netDisbursed, dr_cr: "Cr" }
              ]
            });
          } else {
            const entries = [
              { ledger_name: loanId, amount: feeAndGstTotal > 0 ? feeAndGstTotal : totalLoanAmount, dr_cr: "Dr" }
            ];
            if (processingFee > 0) entries.push({ ledger_name: "Processing Fee (WaqtMoney)", amount: processingFee, dr_cr: "Cr" });
            if (gstAmount > 0) entries.push({ ledger_name: "Output Igst", amount: gstAmount, dr_cr: "Cr" });

            vouchers.push({
              id: loanId,
              pan_number: item.pan_number || "ABCDE1234F",
              State: item.state || "West Bengal",
              address_line1: item.city || "Main Address",
              address_line2: null,
              voucher_type: "journal",
              voucher_date: formatDateForTally(item.created_at),
              voucher_number: `VCH/DISB/${item.id}`,
              reference_number: `REF/DISB/${item.id}`,
              narration: `Fee & GST Booking for ${item.full_name || 'Borrower'} (${loanId})`,
              total_debit: feeAndGstTotal > 0 ? feeAndGstTotal : totalLoanAmount,
              total_credit: feeAndGstTotal > 0 ? feeAndGstTotal : totalLoanAmount,
              entries
            });
          }
        });
      } catch (err) {
        console.error('[Tally API] Error fetching loan applications:', err.message);
      }

      // Source 1D: Query `loan_repayments` for distinct loan_ids as disbursals
      try {
        let lrWhere = 'WHERE lr.loan_id IS NOT NULL AND lr.loan_id <> ""';
        const lrParams = [];

        if (startDate && endDate) {
          lrWhere += ' AND (COALESCE(lr.received_at, lr.created_at) BETWEEN ? AND ?)';
          lrParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }

        const lrLoans = await query(
          `SELECT 
            lr.loan_id,
            MIN(COALESCE(lr.received_at, lr.created_at)) AS disb_date,
            COALESCE(MAX(la.full_name), 'Borrower') AS applicant_name,
            COALESCE(MAX(la.pan_number), 'ABCDE1234F') AS pan_number,
            COALESCE(MAX(la.city), 'Main Address') AS address,
            COALESCE(MAX(la.loan_amount), SUM(lr.amount), 10000) AS total_amount,
            COALESCE(MAX(la.processing_fee), 0) AS processing_fee,
            COALESCE(MAX(la.gst_amount), 0) AS gst_amount
           FROM loan_repayments lr
           LEFT JOIN loan_applications la ON (la.application_id = lr.loan_id OR lr.lead_id = CAST(la.id AS CHAR) OR lr.customer_id = CAST(la.id AS CHAR))
           ${lrWhere}
           GROUP BY lr.loan_id
           ORDER BY disb_date DESC LIMIT 500`,
          lrParams
        );

        (lrLoans || []).forEach((item) => {
          const loanId = item.loan_id;
          if (!loanId || processedLoanIds.has(loanId)) return;
          processedLoanIds.add(loanId);

          const totalLoanAmount = Number(item.total_amount || 10000);
          const processingFee = Number(item.processing_fee || Math.round(totalLoanAmount * 0.10) || 0);
          const gstAmount = Number(item.gst_amount || Math.round(processingFee * 0.18) || 0);
          const netDisbursed = Math.max(0, totalLoanAmount - processingFee - gstAmount) || totalLoanAmount;
          const feeAndGstTotal = processingFee + gstAmount;

          if (isPayment) {
            vouchers.push({
              id: loanId,
              pan_number: item.pan_number || "ABCDE1234F",
              State: "West Bengal",
              address_line1: item.address || "Main Address",
              address_line2: null,
              voucher_type: "payment",
              voucher_date: formatDateForTally(item.disb_date),
              voucher_number: `VCH/PAY/${loanId}`,
              reference_number: `REF/PAY/${loanId}`,
              narration: `Payment Disbursed to ${item.applicant_name || 'Borrower'} (${loanId})`,
              total_debit: netDisbursed,
              total_credit: netDisbursed,
              entries: [
                { ledger_name: loanId, amount: netDisbursed, dr_cr: "Dr" },
                { ledger_name: "Bank / Disbursal Gateway Account", amount: netDisbursed, dr_cr: "Cr" }
              ]
            });
          } else {
            const entries = [
              { ledger_name: loanId, amount: feeAndGstTotal > 0 ? feeAndGstTotal : totalLoanAmount, dr_cr: "Dr" }
            ];
            if (processingFee > 0) entries.push({ ledger_name: "Processing Fee (WaqtMoney)", amount: processingFee, dr_cr: "Cr" });
            if (gstAmount > 0) entries.push({ ledger_name: "Output Igst", amount: gstAmount, dr_cr: "Cr" });

            vouchers.push({
              id: loanId,
              pan_number: item.pan_number || "ABCDE1234F",
              State: "West Bengal",
              address_line1: item.address || "Main Address",
              address_line2: null,
              voucher_type: "journal",
              voucher_date: formatDateForTally(item.disb_date),
              voucher_number: `VCH/DISB/${loanId}`,
              reference_number: `REF/DISB/${loanId}`,
              narration: `Fee & GST Booking for ${item.applicant_name || 'Borrower'} (${loanId})`,
              total_debit: feeAndGstTotal > 0 ? feeAndGstTotal : totalLoanAmount,
              total_credit: feeAndGstTotal > 0 ? feeAndGstTotal : totalLoanAmount,
              entries
            });
          }
        });
      } catch (err) {
        console.error('[Tally API] Error fetching loan_repayments disbursals:', err.message);
      }
    }

    // 2. REPAYMENT VOUCHERS (Receipt)
    if (voucherType === 'all' || voucherType === 'receipt') {
      try {
        let repaymentWhere = 'WHERE 1=1';
        const repaymentParams = [];

        if (startDate && endDate) {
          repaymentWhere += ' AND (COALESCE(lr.received_at, lr.created_at) BETWEEN ? AND ?)';
          repaymentParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }

        const repayments = await query(
          `SELECT 
            lr.id AS repayment_id,
            lr.loan_id,
            lr.amount,
            lr.reference,
            lr.method,
            lr.received_at,
            lr.created_at
           FROM loan_repayments lr
           ${repaymentWhere}
           ORDER BY lr.id DESC LIMIT 500`,
          repaymentParams
        );

        (repayments || []).forEach((item) => {
          const loanId = item.loan_id || `LOAN-${item.repayment_id}`;
          const amount = Number(item.amount || 0);

          vouchers.push({
            id: loanId,
            pan_number: "ABCDE1234F",
            State: "West Bengal",
            address_line1: "Main Address",
            address_line2: null,
            voucher_type: "receipt",
            voucher_date: formatDateForTally(item.received_at || item.created_at),
            voucher_number: `VCH/REC/${item.repayment_id}`,
            reference_number: item.reference || `REF/REC/${item.repayment_id}`,
            narration: `Repayment Received for ${loanId} via ${item.method || 'ONLINE'}`,
            total_debit: amount,
            total_credit: amount,
            entries: [
              {
                ledger_name: "Bank / Collection Gateway Account",
                amount: amount,
                dr_cr: "Dr"
              },
              {
                ledger_name: loanId,
                amount: amount,
                dr_cr: "Cr"
              }
            ]
          });
        });
      } catch (err) {
        console.error('[Tally API] Repayment query error:', err.message);
      }
    }

    // Optional Limit Query Param (e.g. ?limit=5 or ?limit=10)
    let finalVouchers = vouchers;
    if (req.query.limit) {
      const parsedLimit = parseInt(req.query.limit, 10);
      if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
        finalVouchers = vouchers.slice(0, parsedLimit);
      }
    }

    return res.status(200).json({
      status: true,
      count: finalVouchers.length,
      data: finalVouchers,
      message: "Data fetched successfully."
    });
  } catch (error) {
    console.error('[Tally API] Failed to fetch vouchers:', error);
    return res.status(500).json({
      status: false,
      count: 0,
      data: [],
      message: "Failed to fetch Tally vouchers: " + error.message
    });
  }
}

module.exports = {
  getTallyVouchers,
};
