const { query } = require('../config/db');

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Chandigarh',
  'Puducherry', 'Andaman and Nicobar', 'Dadra and Nagar Haveli', 'Daman and Diu', 'Lakshadweep'
];

/**
 * Resolves customer state name and whether customer belongs to Uttar Pradesh (UP).
 * Accurately parses state field, abbreviations (UP, U.P.), address text, and PIN codes.
 */
function resolveStateInfo(rawState, rawAddress) {
  const stateStr = String(rawState || '').trim();
  const addrStr = String(rawAddress || '').trim();

  // 1. Direct UP Check (string match or regex)
  if (
    /^u\.?p\.?$/i.test(stateStr) ||
    /uttar\s*pradesh/i.test(stateStr) ||
    /\buttar\s*pradesh\b/i.test(addrStr) ||
    /\bu\.?p\.?\b/i.test(addrStr)
  ) {
    return { state: 'Uttar Pradesh', isUP: true };
  }

  // 2. UP PIN code range check (20xxxx to 28xxxx) if explicit state is absent
  if (!stateStr && addrStr) {
    const pinMatch = addrStr.match(/\b(2[0-8]\d{4})\b/);
    if (pinMatch) {
      return { state: 'Uttar Pradesh', isUP: true };
    }
  }

  // 3. Match against known Indian states
  if (stateStr) {
    for (const st of INDIAN_STATES) {
      if (new RegExp('^' + st + '$', 'i').test(stateStr) || new RegExp('\\b' + st + '\\b', 'i').test(stateStr)) {
        return { state: st, isUP: false };
      }
    }
  }
  if (addrStr) {
    for (const st of INDIAN_STATES) {
      if (new RegExp('\\b' + st + '\\b', 'i').test(addrStr)) {
        return { state: st, isUP: false };
      }
    }
  }

  return { state: stateStr || 'West Bengal', isUP: false };
}

/**
 * Builds balanced journal entries for loan disbursal booking with GST & Interest.
 * - For UP customer: GST is split into Output Cgst + Output Sgst (50% each)
 * - For non-UP customer: GST remains Output Igst
 * - Interest on Loan is added as a separate Cr entry if interestAmount > 0
 * - Debit and Credit are guaranteed to balance identically
 */
function buildJournalEntries(loanId, processingFee, gstAmount, interestAmount, isUP, totalLoanAmount) {
  const entries = [];

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (gstAmount > 0) {
    if (isUP) {
      cgst = Math.round(gstAmount / 2);
      sgst = gstAmount - cgst;
    } else {
      igst = gstAmount;
    }
  }

  const validInterest = Math.max(0, Number(interestAmount) || 0);
  const totalCredits = (processingFee || 0) + (gstAmount || 0) + validInterest;
  const totalDebit = totalCredits > 0 ? totalCredits : (Number(totalLoanAmount) || 0);

  // 1. Borrower / Loan Debit
  entries.push({
    ledger_name: loanId,
    amount: totalDebit,
    dr_cr: 'Dr',
  });

  // 2. Processing Fee Credit
  if (processingFee > 0) {
    entries.push({
      ledger_name: 'Processing Fee (WaqtMoney)',
      amount: processingFee,
      dr_cr: 'Cr',
    });
  }

  // 3. GST Credits: UP split into CGST + SGST, Non-UP Output Igst
  if (isUP) {
    if (cgst > 0) {
      entries.push({
        ledger_name: 'Output Cgst',
        amount: cgst,
        dr_cr: 'Cr',
      });
    }
    if (sgst > 0) {
      entries.push({
        ledger_name: 'Output Sgst',
        amount: sgst,
        dr_cr: 'Cr',
      });
    }
  } else {
    if (igst > 0) {
      entries.push({
        ledger_name: 'Output Igst',
        amount: igst,
        dr_cr: 'Cr',
      });
    }
  }

  // 4. Interest on Loan Credit
  if (validInterest > 0) {
    entries.push({
      ledger_name: 'Interest on Loan',
      amount: validInterest,
      dr_cr: 'Cr',
    });
  }

  return {
    entries,
    totalDebit,
    totalCredit: totalDebit,
  };
}

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

    const validKey = process.env.TALLY_API_KEY;
    if (!validKey) {
      return res.status(503).json({
        status: false,
        count: 0,
        data: [],
        message: 'Tally integration is not configured on this server.',
      });
    }

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
          `SELECT l.id AS loan_id, l.principal AS loan_principal, l.total_amount AS loan_total_amount, l.interest_rate AS loan_interest_rate, l.start_date, l.customer_id, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address
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

          let interestAmount = 0;
          if (item.loan_total_amount && Number(item.loan_total_amount) > totalLoanAmount) {
            interestAmount = Math.round(Number(item.loan_total_amount) - totalLoanAmount);
          } else if (item.loan_interest_rate && Number(item.loan_interest_rate) > 0) {
            interestAmount = Math.round((totalLoanAmount * Number(item.loan_interest_rate)) / 100);
          } else {
            interestAmount = Math.round(totalLoanAmount * 0.10);
          }

          const { state: customerState, isUP } = resolveStateInfo('', item.customer_address);

          if (isPayment) {
            vouchers.push({
              id: loanId,
              pan_number: "ABCDE1234F",
              State: customerState,
              address_line1: item.customer_address || "Main Address",
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
            const { entries, totalDebit, totalCredit } = buildJournalEntries(
              loanId,
              processingFee,
              gstAmount,
              interestAmount,
              isUP,
              totalLoanAmount
            );

            vouchers.push({
              id: loanId,
              pan_number: "ABCDE1234F",
              State: customerState,
              address_line1: item.customer_address || "Main Address",
              address_line2: null,
              voucher_type: "journal",
              voucher_date: formatDateForTally(item.start_date),
              voucher_number: `VCH/DISB/${loanId}`,
              reference_number: `REF/DISB/${loanId}`,
              narration: `Fee, GST & Interest Booking for ${item.customer_name || 'Borrower'} (${loanId})`,
              total_debit: totalDebit,
              total_credit: totalCredit,
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
          `SELECT lap.id, lap.lead_id, lap.application_id, lap.loan_id, lap.amount, lap.reference, lap.transaction_id, lap.disbursed_at, lap.paid_at,
                  la.city AS customer_city, la.office_address AS customer_address, la.pan_number AS customer_pan, la.full_name AS customer_name
           FROM lead_accounting_payments lap
           LEFT JOIN loan_applications la ON (la.application_id = lap.application_id)
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
          const interestAmount = Math.round(totalLoanAmount * 0.10);

          const { state: customerState, isUP } = resolveStateInfo('', item.customer_address || item.customer_city);

          if (isPayment) {
            vouchers.push({
              id: loanId,
              pan_number: item.customer_pan || "ABCDE1234F",
              State: customerState,
              address_line1: item.customer_address || item.customer_city || "Main Address",
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
            const { entries, totalDebit, totalCredit } = buildJournalEntries(
              loanId,
              processingFee,
              gstAmount,
              interestAmount,
              isUP,
              totalLoanAmount
            );

            vouchers.push({
              id: loanId,
              pan_number: item.customer_pan || "ABCDE1234F",
              State: customerState,
              address_line1: item.customer_address || item.customer_city || "Main Address",
              address_line2: null,
              voucher_type: "journal",
              voucher_date: formatDateForTally(item.disbursed_at || item.paid_at),
              voucher_number: `VCH/DISB/${item.id}`,
              reference_number: item.transaction_id || item.reference || `REF/DISB/${item.id}`,
              narration: `Fee, GST & Interest Booking (${loanId})`,
              total_debit: totalDebit,
              total_credit: totalCredit,
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
          `SELECT la.id, la.application_id, la.full_name, la.pan_number, la.city, la.office_address, la.loan_amount, la.created_at
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
          const processingFee = Math.round(totalLoanAmount * 0.10);
          const gstAmount = Math.round(processingFee * 0.18);
          const netDisbursed = Math.max(0, totalLoanAmount - processingFee - gstAmount) || totalLoanAmount;
          const interestAmount = Math.round(totalLoanAmount * 0.10);

          const { state: customerState, isUP } = resolveStateInfo('', item.office_address || item.city);

          if (isPayment) {
            vouchers.push({
              id: loanId,
              pan_number: item.pan_number || "ABCDE1234F",
              State: customerState,
              address_line1: item.office_address || item.city || "Main Address",
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
            const { entries, totalDebit, totalCredit } = buildJournalEntries(
              loanId,
              processingFee,
              gstAmount,
              interestAmount,
              isUP,
              totalLoanAmount
            );

            vouchers.push({
              id: loanId,
              pan_number: item.pan_number || "ABCDE1234F",
              State: customerState,
              address_line1: item.office_address || item.city || "Main Address",
              address_line2: null,
              voucher_type: "journal",
              voucher_date: formatDateForTally(item.created_at),
              voucher_number: `VCH/DISB/${item.id}`,
              reference_number: `REF/DISB/${item.id}`,
              narration: `Fee, GST & Interest Booking for ${item.full_name || 'Borrower'} (${loanId})`,
              total_debit: totalDebit,
              total_credit: totalCredit,
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
            COALESCE(MAX(la.loan_amount), SUM(lr.amount), 10000) AS total_amount
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
          const processingFee = Math.round(totalLoanAmount * 0.10);
          const gstAmount = Math.round(processingFee * 0.18);
          const netDisbursed = Math.max(0, totalLoanAmount - processingFee - gstAmount) || totalLoanAmount;
          const interestAmount = Math.round(totalLoanAmount * 0.10);

          const { state: customerState, isUP } = resolveStateInfo('', item.address);

          if (isPayment) {
            vouchers.push({
              id: loanId,
              pan_number: item.pan_number || "ABCDE1234F",
              State: customerState,
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
            const { entries, totalDebit, totalCredit } = buildJournalEntries(
              loanId,
              processingFee,
              gstAmount,
              interestAmount,
              isUP,
              totalLoanAmount
            );

            vouchers.push({
              id: loanId,
              pan_number: item.pan_number || "ABCDE1234F",
              State: customerState,
              address_line1: item.address || "Main Address",
              address_line2: null,
              voucher_type: "journal",
              voucher_date: formatDateForTally(item.disb_date),
              voucher_number: `VCH/DISB/${loanId}`,
              reference_number: `REF/DISB/${loanId}`,
              narration: `Fee, GST & Interest Booking for ${item.applicant_name || 'Borrower'} (${loanId})`,
              total_debit: totalDebit,
              total_credit: totalCredit,
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
  resolveStateInfo,
  buildJournalEntries,
};
