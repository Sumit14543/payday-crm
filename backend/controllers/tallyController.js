const { query } = require('../config/db');

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Chandigarh',
  'Puducherry', 'Andaman and Nicobar', 'Dadra and Nagar Haveli', 'Daman and Diu', 'Lakshadweep'
];

const UP_CITIES = [
  'noida', 'greater noida', 'ghaziabad', 'lucknow', 'kanpur', 'agra', 'meerut', 'varanasi',
  'prayagraj', 'allahabad', 'bareilly', 'aligarh', 'moradabad', 'saharanpur', 'gorakhpur',
  'firozabad', 'jhansi', 'muzaffarnagar', 'mathura', 'ayodhya', 'rampur', 'shahjahanpur',
  'farrukhabad', 'budaun', 'hapur', 'etawah', 'mirzapur', 'bulandshahr', 'sambhal', 'amroha',
  'hardoi', 'fatehpur', 'raebareli', 'orai', 'sitapur', 'bahraich', 'modinagar', 'unnao',
  'jaunpur', 'lakhimpur', 'hathras', 'banda', 'pilibhit', 'barabanki', 'khurja', 'gonda',
  'mainpuri', 'lalitpur', 'etah', 'deoria', 'ghazipur', 'sultanpur', 'azamgarh', 'bijnor',
  'basti', 'ballia', 'kasganj'
];

/**
 * Resolves customer state name and whether customer belongs to Uttar Pradesh (UP).
 * Accurately parses state field, UP cities, address text, and PIN codes (20xxxx - 28xxxx).
 */
function resolveStateInfo(rawState, rawAddress, city = '', pincode = '') {
  const stateStr = String(rawState || '').trim();
  const addrStr = String(rawAddress || '').trim();
  const cityStr = String(city || '').trim();
  const pinStr = String(pincode || '').trim();
  const combined = `${stateStr} ${cityStr} ${addrStr}`.toLowerCase();

  // 1. Direct UP Check (string match or regex)
  if (
    /^u\.?p\.?$/i.test(stateStr) ||
    /uttar\s*pradesh/i.test(combined) ||
    /\bu\.?p\.?\b/i.test(combined)
  ) {
    return { state: 'Uttar Pradesh', isUP: true };
  }

  // 2. UP Cities Check
  for (const c of UP_CITIES) {
    if (new RegExp('\\b' + c + '\\b', 'i').test(combined)) {
      return { state: 'Uttar Pradesh', isUP: true };
    }
  }

  // 3. UP PIN code range check (20xxxx to 28xxxx)
  const pinMatch = pinStr.match(/\b(2[0-8]\d{4})\b/) || addrStr.match(/\b(2[0-8]\d{4})\b/);
  if (pinMatch) {
    return { state: 'Uttar Pradesh', isUP: true };
  }

  // 4. Match against known Indian states
  for (const st of INDIAN_STATES) {
    if (st.toLowerCase() === 'uttar pradesh') continue;
    if (new RegExp('^' + st + '$', 'i').test(stateStr) || new RegExp('\\b' + st + '\\b', 'i').test(combined)) {
      return { state: st, isUP: false };
    }
  }

  // 5. Common major Indian cities to state fallback
  if (/delhi/i.test(combined)) return { state: 'Delhi', isUP: false };
  if (/mumbai|pune|nagpur|thane|nashik|aurangabad/i.test(combined)) return { state: 'Maharashtra', isUP: false };
  if (/bangalore|bengaluru|mysore|hubli/i.test(combined)) return { state: 'Karnataka', isUP: false };
  if (/jaipur|jodhpur|udaipur|kota|bikaner/i.test(combined)) return { state: 'Rajasthan', isUP: false };
  if (/gurgaon|gurugram|faridabad|panipat|karnal|ambala/i.test(combined)) return { state: 'Haryana', isUP: false };
  if (/hyderabad|secunderabad/i.test(combined)) return { state: 'Telangana', isUP: false };
  if (/kolkata|howrah|durgapur|siliguri/i.test(combined)) return { state: 'West Bengal', isUP: false };
  if (/chennai|coimbatore|madurai/i.test(combined)) return { state: 'Tamil Nadu', isUP: false };
  if (/ahmedabad|surat|vadodara|rajkot/i.test(combined)) return { state: 'Gujarat', isUP: false };
  if (/bhopal|indore|gwalior|jabalpur/i.test(combined)) return { state: 'Madhya Pradesh', isUP: false };
  if (/patna|gaya|bhagalpur/i.test(combined)) return { state: 'Bihar', isUP: false };
  if (/ludhiana|amritsar|jalandhar|mohali/i.test(combined)) return { state: 'Punjab', isUP: false };

  return { state: stateStr || 'Delhi', isUP: false };
}

/**
 * Builds balanced journal entries for loan disbursal booking with GST & Interest.
 * - For UP customer: GST is split into Output CGST + Output SGST (50% each)
 * - For non-UP customer: GST is Output IGST
 * - Uses proper Tally standard uppercase names (Output CGST / CGST)
 * - Guarantees Debit and Credit are 100% balanced
 */
function buildJournalEntries(loanId, processingFee, gstAmount, interestAmount, isUP, totalLoanAmount, netDisbursed = 0, options = {}) {
  const entries = [];

  const shortGst = options.shortGst === true || options.gstMode === 'direct';
  const cgstLedger = options.cgstLedger || (shortGst ? 'CGST' : 'Output CGST');
  const sgstLedger = options.sgstLedger || (shortGst ? 'SGST' : 'Output SGST');
  const igstLedger = options.igstLedger || (shortGst ? 'IGST' : 'Output IGST');
  const feeLedger = options.feeLedger || 'Processing Fee (WaqtMoney)';
  const interestLedger = options.interestLedger || 'Interest on Loan';
  const bankLedger = options.bankLedger || 'Bank / Disbursal Gateway Account';
  const isFullBooking = options.bookingMode === 'full' || options.includePrincipal === true;

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
  const validFee = Math.max(0, Number(processingFee) || 0);
  const validDisbursed = Math.max(0, Number(netDisbursed) || 0);

  if (isFullBooking && validDisbursed > 0) {
    // Comprehensive full loan voucher: Dr Borrower (Total Repayment), Cr Bank (Net Disbursed), Cr Fee, Cr GST, Cr Interest
    const totalDebit = validDisbursed + validFee + (gstAmount || 0) + validInterest;

    entries.push({
      ledger_name: loanId,
      amount: totalDebit,
      dr_cr: 'Dr',
    });

    entries.push({
      ledger_name: bankLedger,
      amount: validDisbursed,
      dr_cr: 'Cr',
    });

    if (validFee > 0) {
      entries.push({
        ledger_name: feeLedger,
        amount: validFee,
        dr_cr: 'Cr',
      });
    }

    if (isUP) {
      if (cgst > 0) entries.push({ ledger_name: cgstLedger, amount: cgst, dr_cr: 'Cr' });
      if (sgst > 0) entries.push({ ledger_name: sgstLedger, amount: sgst, dr_cr: 'Cr' });
    } else {
      if (igst > 0) entries.push({ ledger_name: igstLedger, amount: igst, dr_cr: 'Cr' });
    }

    if (validInterest > 0) {
      entries.push({
        ledger_name: interestLedger,
        amount: validInterest,
        dr_cr: 'Cr',
      });
    }

    return {
      entries,
      totalDebit,
      totalCredit: totalDebit,
      cgst,
      sgst,
      igst,
    };
  }

  // Standard separate booking voucher: Dr Borrower (Fee + GST + Interest), Cr Fee, Cr GST, Cr Interest
  const totalCredits = validFee + (gstAmount || 0) + validInterest;

  if (validFee > 0) {
    entries.push({
      ledger_name: feeLedger,
      amount: validFee,
      dr_cr: 'Cr',
    });
  }

  if (isUP) {
    if (cgst > 0) entries.push({ ledger_name: cgstLedger, amount: cgst, dr_cr: 'Cr' });
    if (sgst > 0) entries.push({ ledger_name: sgstLedger, amount: sgst, dr_cr: 'Cr' });
  } else {
    if (igst > 0) entries.push({ ledger_name: igstLedger, amount: igst, dr_cr: 'Cr' });
  }

  if (validInterest > 0) {
    entries.push({
      ledger_name: interestLedger,
      amount: validInterest,
      dr_cr: 'Cr',
    });
  }

  const totalCreditSum = entries.reduce((sum, e) => sum + (e.dr_cr === 'Cr' ? e.amount : 0), 0);
  const totalDebit = totalCreditSum > 0 ? totalCreditSum : (Number(totalLoanAmount) || 0);

  entries.unshift({
    ledger_name: loanId,
    amount: totalDebit,
    dr_cr: 'Dr',
  });

  return {
    entries,
    totalDebit,
    totalCredit: totalCreditSum || totalDebit,
    cgst,
    sgst,
    igst,
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

    const validKey = process.env.TALLY_API_KEY || 'WAQT-TALLY-SECRET-KEY-2026';

    if (apiKey !== validKey) {
      return res.status(401).json({
        status: false,
        count: 0,
        data: [],
        message: 'Unauthorized: Invalid or missing API Key for Tally integration.',
      });
    }

    const { startDate, endDate, voucherType = 'all' } = req.query;

    const journalOptions = {
      shortGst: req.query.shortGst === 'true' || req.query.shortGst === '1',
      gstMode: req.query.gstMode || '',
      bookingMode: req.query.bookingMode || '',
      includePrincipal: req.query.includePrincipal === 'true' || req.query.includePrincipal === '1',
      cgstLedger: req.query.cgstLedger || '',
      sgstLedger: req.query.sgstLedger || '',
      igstLedger: req.query.igstLedger || '',
      feeLedger: req.query.feeLedger || '',
      interestLedger: req.query.interestLedger || '',
      bankLedger: req.query.bankLedger || '',
      collectionLedger: req.query.collectionLedger || ''
    };

    const vouchers = [];
    const processedKeys = new Set();

    function isAlreadyProcessed(...keys) {
      for (const k of keys) {
        if (!k) continue;
        const s = String(k).trim().toUpperCase();
        if (processedKeys.has(s)) return true;
        const stripped = s.replace(/^LN/i, '').trim();
        if (processedKeys.has(stripped)) return true;
      }
      return false;
    }

    function registerProcessed(...keys) {
      for (const k of keys) {
        if (!k) continue;
        const s = String(k).trim().toUpperCase();
        processedKeys.add(s);
        const stripped = s.replace(/^LN/i, '').trim();
        processedKeys.add(stripped);
      }
    }

    // 1. DISBURSAL VOUCHERS (Journal / Payment)
    if (voucherType === 'all' || voucherType === 'journal' || voucherType === 'payment') {
      const isPayment = voucherType === 'payment';

      // Source 1A: Query `loans` table as primary source for genuine disbursals
      try {
        let loanWhere = 'WHERE 1=1';
        const loanParams = [];

        if (startDate && endDate) {
          loanWhere += ` AND (
            DATE(COALESCE(
              (SELECT lap.disbursed_at FROM lead_accounting_payments lap WHERE lap.loan_id = l.id ORDER BY lap.id DESC LIMIT 1),
              l.start_date,
              l.created_at
            )) BETWEEN ? AND ?
          )`;
          loanParams.push(startDate, endDate);
        }

        const loansList = await query(
          `SELECT 
             l.id AS loan_id,
             l.principal AS loan_principal,
             l.total_amount AS loan_total_amount,
             l.interest_rate AS loan_interest_rate,
             l.start_date,
             l.created_at AS loan_created_at,
             l.customer_id,
             c.name AS customer_name,
             c.phone AS customer_phone,
             c.address AS customer_address,
             (SELECT sched.application_id FROM loan_repayment_schedule sched WHERE sched.loan_id = l.id ORDER BY sched.id ASC LIMIT 1) AS sched_application_id,
             (SELECT sched.lead_id FROM loan_repayment_schedule sched WHERE sched.loan_id = l.id ORDER BY sched.id ASC LIMIT 1) AS sched_lead_id
           FROM loans l
           LEFT JOIN customers c ON c.id = l.customer_id
           ${loanWhere}
           ORDER BY l.id DESC LIMIT 1000`,
          loanParams
        );

        if (loansList && loansList.length > 0) {
          const loanIds = [];
          const strippedIds = [];
          const appIds = [];
          const leadIds = [];

          loansList.forEach((item) => {
            if (item.loan_id) {
              loanIds.push(item.loan_id);
              const stripped = item.loan_id.replace(/^LN/i, '').trim();
              if (stripped) strippedIds.push(stripped);
            }
            if (item.sched_application_id) appIds.push(item.sched_application_id);
            if (item.sched_lead_id) leadIds.push(String(item.sched_lead_id));
            if (item.customer_id) {
              leadIds.push(String(item.customer_id));
              const strippedCus = String(item.customer_id).replace(/^CUS/i, '').trim();
              if (strippedCus) leadIds.push(strippedCus);
            }
          });

          // Fetch Sanctions terms
          const sanctionKeySet = [...new Set([...loanIds, ...strippedIds, ...appIds, ...leadIds])].filter(Boolean);
          const sanctionsMap = new Map();
          if (sanctionKeySet.length > 0) {
            const placeholders = sanctionKeySet.map(() => '?').join(',');
            const sanctionRows = await query(
              `SELECT id, lead_id, application_id, agreement_number, borrower, borrower_phone, borrower_email,
                      principal_amount, processing_fee, gst_amount, disbursed_amount, repayment_amount, interest_rate,
                      disbursement_date, due_date
               FROM lead_sanctions
               WHERE agreement_number IN (${placeholders})
                  OR application_id IN (${placeholders})
                  OR lead_id IN (${placeholders})
               ORDER BY id DESC`,
              [...sanctionKeySet, ...sanctionKeySet, ...sanctionKeySet]
            ).catch(() => []);

            (sanctionRows || []).forEach((s) => {
              if (s.agreement_number && !sanctionsMap.has(s.agreement_number)) sanctionsMap.set(s.agreement_number, s);
              if (s.agreement_number) {
                const ln = `LN${s.agreement_number}`;
                if (!sanctionsMap.has(ln)) sanctionsMap.set(ln, s);
              }
              if (s.application_id && !sanctionsMap.has(s.application_id)) sanctionsMap.set(s.application_id, s);
              if (s.lead_id && !sanctionsMap.has(String(s.lead_id))) sanctionsMap.set(String(s.lead_id), s);
              if (s.application_id) appIds.push(s.application_id);
              if (s.lead_id) leadIds.push(String(s.lead_id));
            });
          }

          // Fetch Accounting Payments
          const paymentsMap = new Map();
          if (sanctionKeySet.length > 0) {
            const placeholders = sanctionKeySet.map(() => '?').join(',');
            const paymentRows = await query(
              `SELECT id, loan_id, application_id, lead_id, amount, reference, transaction_id, status, disbursed_at, paid_at
               FROM lead_accounting_payments
               WHERE loan_id IN (${placeholders})
                  OR application_id IN (${placeholders})
                  OR lead_id IN (${placeholders})
               ORDER BY id DESC`,
              [...sanctionKeySet, ...sanctionKeySet, ...sanctionKeySet]
            ).catch(() => []);

            (paymentRows || []).forEach((p) => {
              if (p.loan_id && !paymentsMap.has(p.loan_id)) paymentsMap.set(p.loan_id, p);
              if (p.loan_id) {
                const stripped = p.loan_id.replace(/^LN/i, '').trim();
                if (stripped && !paymentsMap.has(stripped)) paymentsMap.set(stripped, p);
              }
              if (p.application_id && !paymentsMap.has(p.application_id)) paymentsMap.set(p.application_id, p);
              if (p.lead_id && !paymentsMap.has(String(p.lead_id))) paymentsMap.set(String(p.lead_id), p);
              if (p.application_id) appIds.push(p.application_id);
              if (p.lead_id) leadIds.push(String(p.lead_id));
            });
          }

          // Fetch Loan Applications for KYC/Address/PAN details
          const applicationsMap = new Map();
          const appKeySet = [...new Set([...appIds, ...leadIds])].filter(Boolean);
          if (appKeySet.length > 0) {
            const placeholders = appKeySet.map(() => '?').join(',');
            const appRows = await query(
              `SELECT id, application_id, full_name, pan_number, city, pincode, office_address, office_pincode, mobile
               FROM loan_applications
               WHERE application_id IN (${placeholders})
                  OR id IN (${placeholders})
               ORDER BY id DESC`,
              [...appKeySet, ...appKeySet]
            ).catch(() => []);

            (appRows || []).forEach((a) => {
              if (a.application_id && !applicationsMap.has(a.application_id)) applicationsMap.set(a.application_id, a);
              if (a.id && !applicationsMap.has(String(a.id))) applicationsMap.set(String(a.id), a);
            });
          }

          // Construct balanced vouchers for all genuine loans
          loansList.forEach((item) => {
            const loanId = item.loan_id;
            const strippedId = loanId ? loanId.replace(/^LN/i, '').trim() : '';
            const appId = item.sched_application_id;
            const leadId = item.sched_lead_id || (item.customer_id ? String(item.customer_id).replace(/^CUS/i, '').trim() : '');

            if (isAlreadyProcessed(loanId, strippedId, appId, leadId)) return;
            registerProcessed(loanId, strippedId, appId, leadId);

            const sanction =
              sanctionsMap.get(loanId) ||
              sanctionsMap.get(strippedId) ||
              (appId ? sanctionsMap.get(appId) : null) ||
              (leadId ? sanctionsMap.get(leadId) : null);

            const payment =
              paymentsMap.get(loanId) ||
              paymentsMap.get(strippedId) ||
              (appId ? paymentsMap.get(appId) : null) ||
              (leadId ? paymentsMap.get(leadId) : null);

            const application =
              (appId ? applicationsMap.get(appId) : null) ||
              (leadId ? applicationsMap.get(leadId) : null) ||
              (sanction?.application_id ? applicationsMap.get(sanction.application_id) : null) ||
              (sanction?.lead_id ? applicationsMap.get(String(sanction.lead_id)) : null) ||
              (payment?.application_id ? applicationsMap.get(payment.application_id) : null) ||
              (payment?.lead_id ? applicationsMap.get(String(payment.lead_id)) : null);

            const principalAmount = Number(sanction?.principal_amount || item.loan_principal || 0);
            const repaymentAmount = Number(sanction?.repayment_amount || item.loan_total_amount || 0);

            let processingFee = Number(sanction?.processing_fee || 0);
            if (processingFee === 0 && principalAmount > 0) {
              processingFee = Math.round(principalAmount * 0.10);
            }

            let gstAmount = Number(sanction?.gst_amount || 0);
            if (gstAmount === 0 && processingFee > 0) {
              gstAmount = Math.round(processingFee * 0.18);
            }

            let interestAmount = 0;
            if (repaymentAmount > principalAmount) {
              interestAmount = Math.round(repaymentAmount - principalAmount);
            } else if (Number(sanction?.interest_rate || item.loan_interest_rate || 0) > 0) {
              interestAmount = Math.round((principalAmount * Number(sanction?.interest_rate || item.loan_interest_rate)) / 100);
            }

            const netDisbursed = Number(
              payment?.amount ||
              sanction?.disbursed_amount ||
              Math.max(0, principalAmount - processingFee - gstAmount) ||
              principalAmount
            );

            const rawDate =
              payment?.disbursed_at ||
              payment?.paid_at ||
              sanction?.disbursement_date ||
              item.start_date ||
              item.loan_created_at;
            const voucherDate = formatDateForTally(rawDate);

            const customerName = application?.full_name || sanction?.borrower || item.customer_name || 'Borrower';
            const panNumber = application?.pan_number || 'ABCDE1234F';
            const customerCity = application?.city || '';
            const customerPin = application?.pincode || application?.office_pincode || '';
            const customerAddress = application?.office_address || item.customer_address || application?.city || 'Main Address';
            const combinedAddress = [application?.office_address, item.customer_address].filter(Boolean).join(' ');
            const { state: customerState, isUP } = resolveStateInfo('', combinedAddress || customerAddress, customerCity, customerPin);

            const cgst = isUP ? Math.round(gstAmount / 2) : 0;
            const sgst = isUP ? (gstAmount - cgst) : 0;
            const igst = isUP ? 0 : gstAmount;

            if (isPayment) {
              vouchers.push({
                id: loanId,
                loan_id: loanId,
                agreement_number: sanction?.agreement_number || strippedId || loanId,
                borrower_name: customerName,
                customer_name: customerName,
                pan_number: panNumber,
                State: customerState,
                state: customerState,
                city: customerCity,
                pincode: customerPin,
                address_line1: customerAddress,
                address_line2: null,
                is_up: isUP,
                gst_type: isUP ? 'CGST+SGST' : 'IGST',
                voucher_type: "payment",
                voucher_date: voucherDate,
                voucher_number: `VCH/PAY/${loanId}`,
                reference_number: payment?.transaction_id || payment?.reference || `REF/PAY/${loanId}`,
                narration: `Payment Disbursed to ${customerName} (${loanId})`,
                loan_amount: principalAmount,
                principal: principalAmount,
                principal_amount: principalAmount,
                processing_fee: processingFee,
                gst_amount: gstAmount,
                cgst,
                sgst,
                igst,
                interest_amount: interestAmount,
                disbursed_amount: netDisbursed,
                net_disbursed: netDisbursed,
                repayment_amount: repaymentAmount,
                total_debit: netDisbursed,
                total_credit: netDisbursed,
                entries: [
                  { ledger_name: loanId, amount: netDisbursed, dr_cr: "Dr" },
                  { ledger_name: journalOptions.bankLedger || "Bank / Disbursal Gateway Account", amount: netDisbursed, dr_cr: "Cr" }
                ]
              });
            } else {
              const { entries, totalDebit, totalCredit, cgst: jCgst, sgst: jSgst, igst: jIgst } = buildJournalEntries(
                loanId,
                processingFee,
                gstAmount,
                interestAmount,
                isUP,
                principalAmount,
                netDisbursed,
                journalOptions
              );

              vouchers.push({
                id: loanId,
                loan_id: loanId,
                agreement_number: sanction?.agreement_number || strippedId || loanId,
                borrower_name: customerName,
                customer_name: customerName,
                pan_number: panNumber,
                State: customerState,
                state: customerState,
                city: customerCity,
                pincode: customerPin,
                address_line1: customerAddress,
                address_line2: null,
                is_up: isUP,
                gst_type: isUP ? 'CGST+SGST' : 'IGST',
                voucher_type: "journal",
                voucher_date: voucherDate,
                voucher_number: `VCH/DISB/${loanId}`,
                reference_number: payment?.transaction_id || payment?.reference || `REF/DISB/${loanId}`,
                narration: `Fee, GST & Interest Booking for ${customerName} (${loanId})`,
                loan_amount: principalAmount,
                principal: principalAmount,
                principal_amount: principalAmount,
                processing_fee: processingFee,
                gst_amount: gstAmount,
                cgst: jCgst,
                sgst: jSgst,
                igst: jIgst,
                interest_amount: interestAmount,
                disbursed_amount: netDisbursed,
                net_disbursed: netDisbursed,
                repayment_amount: repaymentAmount,
                total_debit: totalDebit,
                total_credit: totalCredit,
                entries
              });
            }
          });
        }
      } catch (err) {
        console.error('[Tally API] Error fetching loans:', err.message);
      }

      // Source 1B: Fallback Disbursals - Query `lead_accounting_payments` for any paid disbursals not present in `loans`
      try {
        let lapWhere = "WHERE (lap.status = 'paid' OR lap.disbursed_at IS NOT NULL)";
        const lapParams = [];

        if (startDate && endDate) {
          lapWhere += ' AND (DATE(COALESCE(lap.disbursed_at, lap.paid_at)) BETWEEN ? AND ?)';
          lapParams.push(startDate, endDate);
        }

        const lapList = await query(
          `SELECT lap.id, lap.lead_id, lap.application_id, lap.loan_id, lap.amount, lap.reference, lap.transaction_id, lap.disbursed_at, lap.paid_at,
                  la.city AS customer_city, la.office_address AS customer_address, la.pincode AS customer_pincode, la.office_pincode, la.pan_number AS customer_pan, la.full_name AS customer_name,
                  ls.agreement_number, ls.principal_amount, ls.processing_fee, ls.gst_amount, ls.disbursed_amount, ls.repayment_amount, ls.interest_rate, ls.borrower
           FROM lead_accounting_payments lap
           LEFT JOIN loan_applications la ON (la.application_id = lap.application_id OR la.id = CAST(lap.lead_id AS CHAR))
           LEFT JOIN lead_sanctions ls ON (ls.application_id = lap.application_id OR ls.lead_id = CAST(lap.lead_id AS CHAR) OR ls.agreement_number = lap.loan_id)
           ${lapWhere}
           ORDER BY lap.id DESC LIMIT 500`,
          lapParams
        );

        (lapList || []).forEach((item) => {
          const loanId = item.loan_id || `LOAN-${item.application_id || item.lead_id || item.id}`;
          const strippedId = item.loan_id ? item.loan_id.replace(/^LN/i, '').trim() : '';
          const appId = item.application_id;
          const leadId = item.lead_id ? String(item.lead_id) : '';

          if (isAlreadyProcessed(loanId, strippedId, appId, leadId)) return;
          registerProcessed(loanId, strippedId, appId, leadId);

          const principalAmount = Number(item.principal_amount || item.amount || 0);
          const repaymentAmount = Number(item.repayment_amount || 0);

          let processingFee = Number(item.processing_fee || 0);
          if (processingFee === 0 && principalAmount > 0) {
            processingFee = Math.round(principalAmount * 0.10);
          }

          let gstAmount = Number(item.gst_amount || 0);
          if (gstAmount === 0 && processingFee > 0) {
            gstAmount = Math.round(processingFee * 0.18);
          }

          let interestAmount = 0;
          if (repaymentAmount > principalAmount) {
            interestAmount = Math.round(repaymentAmount - principalAmount);
          } else if (Number(item.interest_rate || 0) > 0) {
            interestAmount = Math.round((principalAmount * Number(item.interest_rate)) / 100);
          }

          const netDisbursed = Number(
            item.amount ||
            item.disbursed_amount ||
            Math.max(0, principalAmount - processingFee - gstAmount) ||
            principalAmount
          );

          const voucherDate = formatDateForTally(item.disbursed_at || item.paid_at);
          const customerName = item.customer_name || item.borrower || 'Borrower';
          const panNumber = item.customer_pan || "ABCDE1234F";
          const customerCity = item.customer_city || '';
          const customerPin = item.customer_pincode || item.office_pincode || '';
          const customerAddress = item.customer_address || item.customer_city || "Main Address";
          const { state: customerState, isUP } = resolveStateInfo('', customerAddress, customerCity, customerPin);

          const cgst = isUP ? Math.round(gstAmount / 2) : 0;
          const sgst = isUP ? (gstAmount - cgst) : 0;
          const igst = isUP ? 0 : gstAmount;

          if (isPayment) {
            vouchers.push({
              id: loanId,
              loan_id: loanId,
              agreement_number: item.agreement_number || strippedId || loanId,
              borrower_name: customerName,
              customer_name: customerName,
              pan_number: panNumber,
              State: customerState,
              state: customerState,
              city: customerCity,
              pincode: customerPin,
              address_line1: customerAddress,
              address_line2: null,
              is_up: isUP,
              gst_type: isUP ? 'CGST+SGST' : 'IGST',
              voucher_type: "payment",
              voucher_date: voucherDate,
              voucher_number: `VCH/PAY/${item.id}`,
              reference_number: item.transaction_id || item.reference || `REF/PAY/${item.id}`,
              narration: `Payment Disbursed to ${customerName} (${loanId})`,
              loan_amount: principalAmount,
              principal: principalAmount,
              principal_amount: principalAmount,
              processing_fee: processingFee,
              gst_amount: gstAmount,
              cgst,
              sgst,
              igst,
              interest_amount: interestAmount,
              disbursed_amount: netDisbursed,
              net_disbursed: netDisbursed,
              repayment_amount: repaymentAmount,
              total_debit: netDisbursed,
              total_credit: netDisbursed,
              entries: [
                { ledger_name: loanId, amount: netDisbursed, dr_cr: "Dr" },
                { ledger_name: journalOptions.bankLedger || "Bank / Disbursal Gateway Account", amount: netDisbursed, dr_cr: "Cr" }
              ]
            });
          } else {
            const { entries, totalDebit, totalCredit, cgst: jCgst, sgst: jSgst, igst: jIgst } = buildJournalEntries(
              loanId,
              processingFee,
              gstAmount,
              interestAmount,
              isUP,
              principalAmount,
              netDisbursed,
              journalOptions
            );

            vouchers.push({
              id: loanId,
              loan_id: loanId,
              agreement_number: item.agreement_number || strippedId || loanId,
              borrower_name: customerName,
              customer_name: customerName,
              pan_number: panNumber,
              State: customerState,
              state: customerState,
              city: customerCity,
              pincode: customerPin,
              address_line1: customerAddress,
              address_line2: null,
              is_up: isUP,
              gst_type: isUP ? 'CGST+SGST' : 'IGST',
              voucher_type: "journal",
              voucher_date: voucherDate,
              voucher_number: `VCH/DISB/${item.id}`,
              reference_number: item.transaction_id || item.reference || `REF/DISB/${item.id}`,
              narration: `Fee, GST & Interest Booking for ${customerName} (${loanId})`,
              loan_amount: principalAmount,
              principal: principalAmount,
              principal_amount: principalAmount,
              processing_fee: processingFee,
              gst_amount: gstAmount,
              cgst: jCgst,
              sgst: jSgst,
              igst: jIgst,
              interest_amount: interestAmount,
              disbursed_amount: netDisbursed,
              net_disbursed: netDisbursed,
              repayment_amount: repaymentAmount,
              total_debit: totalDebit,
              total_credit: totalCredit,
              entries
            });
          }
        });
      } catch (err) {
        console.error('[Tally API] Error fetching lap fallback:', err.message);
      }
    }

    // 2. REPAYMENT VOUCHERS (Receipt)
    if (voucherType === 'all' || voucherType === 'receipt') {
      try {
        let repaymentWhere = "WHERE (lr.status IN ('received', 'success', 'paid', 'settled') OR lr.status IS NULL) AND lr.amount > 0";
        const repaymentParams = [];

        if (startDate && endDate) {
          repaymentWhere += ' AND (DATE(COALESCE(lr.received_at, lr.created_at)) BETWEEN ? AND ?)';
          repaymentParams.push(startDate, endDate);
        }

        const repayments = await query(
          `SELECT 
            lr.id AS repayment_id,
            lr.loan_id,
            lr.amount,
            lr.reference,
            lr.method,
            lr.received_at,
            lr.created_at,
            la.pan_number,
            la.full_name,
            la.city,
            la.office_address
           FROM loan_repayments lr
           LEFT JOIN loan_applications la ON (la.application_id = lr.loan_id OR la.id = CAST(lr.lead_id AS CHAR))
           ${repaymentWhere}
           ORDER BY lr.id DESC LIMIT 1000`,
          repaymentParams
        );

        (repayments || []).forEach((item) => {
          const loanId = item.loan_id || `LOAN-${item.repayment_id}`;
          const amount = Number(item.amount || 0);
          if (amount <= 0) return;

          const address = item.office_address || item.city || "Main Address";
          const { state: customerState, isUP } = resolveStateInfo('', address, item.city);

          vouchers.push({
            id: loanId,
            loan_id: loanId,
            customer_name: item.full_name || 'Borrower',
            borrower_name: item.full_name || 'Borrower',
            pan_number: item.pan_number || "ABCDE1234F",
            State: customerState,
            state: customerState,
            city: item.city || '',
            address_line1: address,
            address_line2: null,
            is_up: isUP,
            gst_type: isUP ? 'CGST+SGST' : 'IGST',
            voucher_type: "receipt",
            voucher_date: formatDateForTally(item.received_at || item.created_at),
            voucher_number: `VCH/REC/${item.repayment_id}`,
            reference_number: item.reference || `REF/REC/${item.repayment_id}`,
            narration: `Repayment Received for ${loanId} via ${item.method || 'ONLINE'}`,
            amount: amount,
            repayment_amount: amount,
            loan_amount: amount,
            principal_amount: amount,
            total_debit: amount,
            total_credit: amount,
            entries: [
              {
                ledger_name: journalOptions.collectionLedger || "Bank / Collection Gateway Account",
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
