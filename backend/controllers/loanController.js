const loanModel = require('../models/loanModel');
const repaymentModel = require('../models/repaymentModel');
const leadStatusModel = require('../models/leadStatusModel');
const sourceStatusWebhookService = require('../services/sourceStatusWebhookService');
const { query } = require('../config/db');
const { notFound, success } = require('../utils/http');
const xlsx = require('xlsx');

async function listLoans(req, res) {
  const loans = await loanModel.findAll(req.query);
  return res.status(200).json({
    success: true,
    data: loans,
    pagination: {
      page: loans.page || 1,
      limit: loans.limit || (loans.length || 50),
      total: loans.total !== undefined ? loans.total : loans.length,
      totalPages: loans.totalPages || 1,
    },
    message: 'OK',
  });
}

async function getLoan(req, res) {
  const loan = await loanModel.findById(req.params.id);
  if (!loan) return notFound(res, 'Loan not found');
  return success(res, loan);
}

async function resolveLoanId({ loanId, phone, pan }) {
  if (loanId) {
    const cleanId = String(loanId).trim();
    const rows = await query('SELECT id FROM loans WHERE id = ? LIMIT 1', [cleanId]);
    if (rows.length) return rows[0].id;
  }

  if (phone) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    if (cleanPhone.length >= 10) {
      const searchPhone = cleanPhone.slice(-10);
      const rows = await query(`
        SELECT l.id AS loanId FROM loans l
        LEFT JOIN customers c ON c.id = l.customer_id
        WHERE RIGHT(REPLACE(REPLACE(c.phone, ' ', ''), '-', ''), 10) = ?
          AND l.status = 'Active'
        LIMIT 1
      `, [searchPhone]);
      if (rows.length) return rows[0].loanId;
    }
  }

  if (pan) {
    const cleanPan = String(pan).trim().toUpperCase();
    if (cleanPan) {
      const rows = await query(`
        SELECT DISTINCT l.id AS loanId FROM loans l
        LEFT JOIN loan_repayment_schedule s ON s.loan_id = l.id
        LEFT JOIN loan_applications la ON la.id = s.lead_id OR la.application_id = s.application_id
        WHERE UPPER(TRIM(la.pan_number)) = ?
          AND l.status = 'Active'
        LIMIT 1
      `, [cleanPan]);
      if (rows.length) return rows[0].loanId;
    }
  }

  return null;
}

async function bulkRepayment(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Please upload an Excel or CSV file.' });
  }

  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet);

    if (!rows.length) {
      return res.status(400).json({ success: false, message: 'The uploaded file is empty.' });
    }

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    // Phase 1 Optimization: Pre-fetch existing references in batch to eliminate N+1 queries
    const allReferences = Array.from(new Set(
      rows
        .map(r => {
          const refKey = Object.keys(r).find(k => /reference|utr|transaction/i.test(k));
          return refKey ? String(r[refKey] || '').trim() : '';
        })
        .filter(Boolean)
    ));

    const existingRefsSet = new Set();
    if (allReferences.length > 0) {
      for (let c = 0; c < allReferences.length; c += 500) {
        const chunk = allReferences.slice(c, c + 500);
        const placeholders = chunk.map(() => '?').join(',');
        const existingRows = await query(`SELECT reference FROM loan_repayments WHERE reference IN (${placeholders})`, chunk);
        (existingRows || []).forEach(er => existingRefsSet.add(String(er.reference || '').trim()));
      }
    }

    const loanResolutionCache = new Map();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed header + 1-indexed loop

      // Find keys using regex to support flexible column headers
      const loanIdKey = Object.keys(row).find(k => /loan\s*id|agreement\s*number/i.test(k));
      const phoneKey = Object.keys(row).find(k => /phone|mobile/i.test(k));
      const panKey = Object.keys(row).find(k => /pan/i.test(k));
      const amountKey = Object.keys(row).find(k => /amount/i.test(k));
      const referenceKey = Object.keys(row).find(k => /reference|utr|transaction/i.test(k));
      const dateKey = Object.keys(row).find(k => /date/i.test(k));
      const methodKey = Object.keys(row).find(k => /method/i.test(k));
      const notesKey = Object.keys(row).find(k => /note|remark/i.test(k));

      const rawLoanId = loanIdKey ? row[loanIdKey] : null;
      const rawPhone = phoneKey ? row[phoneKey] : null;
      const rawPan = panKey ? row[panKey] : null;
      const rawAmount = amountKey ? row[amountKey] : null;
      const rawReference = referenceKey ? row[referenceKey] : null;
      const rawMethod = methodKey ? row[methodKey] : null;
      const rawDate = dateKey ? row[dateKey] : null;
      const rawNotes = notesKey ? row[notesKey] : null;

      // Validation
      const amount = Number(rawAmount);
      if (!rawAmount || !Number.isFinite(amount) || amount <= 0) {
        failureCount++;
        results.push({ row: rowNum, status: 'Failed', reference: rawReference || 'N/A', reason: 'Invalid or missing payment amount.' });
        continue;
      }

      const reference = String(rawReference || '').trim();
      if (!reference) {
        failureCount++;
        results.push({ row: rowNum, status: 'Failed', reference: 'N/A', reason: 'Payment reference/UTR is required.' });
        continue;
      }

      // Check duplicate reference in repayments (O(1) memory lookup)
      if (existingRefsSet.has(reference)) {
        failureCount++;
        results.push({ row: rowNum, status: 'Failed', reference, reason: 'Duplicate transaction reference (UTR already recorded).' });
        continue;
      }
      // Record in set to prevent duplicate entries inside the same file
      existingRefsSet.add(reference);

      // Resolve loanId using batch cache or query
      const cacheKey = `${String(rawLoanId || '').trim()}|${String(rawPhone || '').trim()}|${String(rawPan || '').trim()}`;
      let resolvedLoanId;
      if (loanResolutionCache.has(cacheKey)) {
        resolvedLoanId = loanResolutionCache.get(cacheKey);
      } else {
        resolvedLoanId = await resolveLoanId({ loanId: rawLoanId, phone: rawPhone, pan: rawPan });
        loanResolutionCache.set(cacheKey, resolvedLoanId);
      }

      if (!resolvedLoanId) {
        failureCount++;
        results.push({ row: rowNum, status: 'Failed', reference, reason: 'Could not resolve active loan using ID, Phone, or PAN.' });
        continue;
      }

      // Fetch loan context
      const context = await repaymentModel.findLoanContext({ loanId: resolvedLoanId });
      if (!context) {
        failureCount++;
        results.push({ row: rowNum, status: 'Failed', reference, reason: `Active loan account details not found for ID: ${resolvedLoanId}` });
        continue;
      }

      try {
        // Record repayment
        const repayment = await repaymentModel.createRepayment(context, {
          amount,
          method: String(rawMethod || 'Excel Upload').trim(),
          metadata: {
            notes: String(rawNotes || 'Bulk uploaded repayment').trim(),
            source: 'bulk_excel_upload',
          },
          paidAt: rawDate ? new Date(rawDate) : null,
          receivedBy: req.user?.name || 'Superadmin',
          reference,
        });

        const loanUpdate = await repaymentModel.refreshLoanAfterRepayment(context);
        const summary = await repaymentModel.repaymentSummaryByLead(context.lead);

        // Record status change in lead history
        await leadStatusModel.createForLead(context.lead, {
          actor: req.user?.name || 'Superadmin',
          actorRole: req.user?.role || 'superadmin',
          description: loanUpdate.balance <= 0
            ? 'Repayment collected in bulk and loan closed.'
            : 'Repayment collected in bulk and balance updated.',
          metadata: {
            amount: repayment.amount,
            balance: loanUpdate.balance,
            loanId: context.loan.id,
            method: repayment.method,
            reference,
            totalPaid: loanUpdate.totalPaid,
          },
          publicStatus: loanUpdate.balance <= 0 ? 'Repayment completed' : 'Repayment received',
          source: 'bulk_repayment_upload',
          sourceKey: `bulk-repayment:${repayment.reference}`,
          stageKey: loanUpdate.balance <= 0 ? 'closed' : 'repayment_active',
          status: context.lead.status || 'Converted',
          title: loanUpdate.balance <= 0 ? 'Repayment completed' : 'Repayment received',
        });

        // Sync customer statistics
        await query(`
          UPDATE customers
          SET active_loans = (SELECT COUNT(*) FROM loans WHERE customer_id = ? AND status IN ('Active', 'Overdue')),
              total_repaid = (SELECT COALESCE(SUM(amount_paid), 0) FROM loans WHERE customer_id = ?)
          WHERE id = ?
        `, [context.loan.customerId, context.loan.customerId, context.loan.customerId]);

        // If loan is closed, sync lead status to closed
        if (loanUpdate.balance <= 0) {
          await query(`
            UPDATE loan_applications la
            JOIN loan_repayment_schedule sched ON (la.application_id = sched.application_id OR la.id = sched.lead_id)
            JOIN loans l ON l.id = sched.loan_id
            SET la.status = 'closed', la.is_active_application = 0
            WHERE l.id = ?
          `, [context.loan.id]);
        }

        // Trigger webhooks
        await sourceStatusWebhookService.dispatchRepaymentEvent(context.lead, repayment, summary);

        successCount++;
        results.push({
          row: rowNum,
          status: 'Success',
          loanId: resolvedLoanId,
          customer: context.customerName,
          amount,
          reference,
          balance: loanUpdate.balance,
          closed: loanUpdate.balance <= 0
        });

      } catch (err) {
        failureCount++;
        results.push({ row: rowNum, status: 'Failed', reference, reason: `Processing error: ${err.message}` });
      }
    }

    return res.json({
      success: true,
      totalRows: rows.length,
      successCount,
      failureCount,
      results
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: `Failed to process upload: ${error.message}` });
  }
}

async function downloadNocPdf(req, res) {
  const nocService = require('../services/nocService');
  const loanId = req.params.id;
  const loanData = await nocService.fetchLoanNocDetails(loanId);
  if (!loanData) {
    return res.status(404).json({ success: false, message: 'Loan account not found.' });
  }
  const buffer = await nocService.buildNocPdfBuffer(loanData);
  const fileName = `NOC_${String(loanData.loanId).replace(/[^a-zA-Z0-9_-]/g, '')}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  return res.send(buffer);
}

async function sendNocEmail(req, res) {
  const nocService = require('../services/nocService');
  const loanId = req.params.id;
  const result = await nocService.triggerNocForClosedLoan({ loanId });
  if (!result) {
    return res.status(400).json({ success: false, message: 'Unable to send NOC email. Ensure loan account is closed and borrower has a valid email address.' });
  }
  return res.json({ success: true, message: 'NOC certificate emailed successfully to borrower.', data: result });
}

async function recordRepayment(req, res) {
  const loanId = req.params.id;
  const {
    amount,
    method = 'Bank Transfer',
    reference,
    notes = '',
    paidAt = null,
    closeFully = false,
  } = req.body;

  const context = await repaymentModel.findLoanContext({ loanId });
  if (!context) {
    return notFound(res, 'Loan record not found.');
  }

  const isFullClose = Boolean(closeFully);
  const numAmount = Number(amount);
  const remainingBalance = Number(context.loan.balance || (context.loan.totalAmount - context.loan.amountPaid) || 0);

  if (!isFullClose && (!Number.isFinite(numAmount) || numAmount <= 0)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid repayment amount greater than 0.' });
  }

  const effectiveAmount = isFullClose && (!Number.isFinite(numAmount) || numAmount <= 0)
    ? remainingBalance
    : numAmount;

  const paymentRef = (reference && String(reference).trim()) ? String(reference).trim() : `MAN-${Date.now()}`;
  let repayment = null;

  if (effectiveAmount > 0) {
    repayment = await repaymentModel.createRepayment(context, {
      amount: effectiveAmount,
      method: String(method || 'Bank Transfer').trim(),
      reference: paymentRef,
      metadata: {
        notes: String(notes || (isFullClose ? 'Full settlement recorded' : 'Repayment recorded')).trim(),
        source: 'manual_repayment',
      },
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      receivedBy: req.user?.name || 'Accountant',
    });
  }

  const loanUpdate = await repaymentModel.refreshLoanAfterRepayment(context, { closeFully: isFullClose });
  loanModel.invalidateLoansCache();

  // Record status log
  if (context.lead && (context.lead.id || context.lead.rawId)) {
    try {
      await leadStatusModel.createForLead(context.lead, {
        actor: req.user?.name || 'Accountant',
        actorRole: req.user?.role || 'accountant',
        description: (isFullClose || loanUpdate.balance <= 0)
          ? `Loan settled and marked Paid Off. Amount: ₹${effectiveAmount || 0}`
          : `Repayment of ₹${effectiveAmount} received. Remaining balance: ₹${loanUpdate.balance}`,
        metadata: {
          amount: effectiveAmount,
          balance: loanUpdate.balance,
          loanId: context.loan.id,
          method: method || 'Bank Transfer',
          reference: paymentRef,
          totalPaid: loanUpdate.totalPaid,
        },
        publicStatus: (isFullClose || loanUpdate.balance <= 0) ? 'Repayment completed' : 'Repayment received',
        source: 'loan_management',
        sourceKey: `manual-repayment:${paymentRef}`,
        stageKey: (isFullClose || loanUpdate.balance <= 0) ? 'closed' : 'repayment_active',
        status: context.lead.status || 'Converted',
        title: (isFullClose || loanUpdate.balance <= 0) ? 'Loan Settled / Paid Off' : 'Repayment received',
      });
    } catch (logErr) {
      console.error('[loanController] Failed to record lead status log:', logErr);
    }
  }

  // Update customer active loan counts
  if (context.loan.customerId) {
    try {
      await query(`
        UPDATE customers
        SET active_loans = (SELECT COUNT(*) FROM loans WHERE customer_id = ? AND status IN ('Active', 'Overdue')),
            total_repaid = (SELECT COALESCE(SUM(amount_paid), 0) FROM loans WHERE customer_id = ?)
        WHERE id = ?
      `, [context.loan.customerId, context.loan.customerId, context.loan.customerId]);
    } catch (custErr) {
      console.error('[loanController] Failed to update customer counts:', custErr);
    }
  }

  // Webhook notification if repayment happened
  if (repayment) {
    try {
      const summary = await repaymentModel.repaymentSummaryByLead(context.lead);
      await sourceStatusWebhookService.dispatchRepaymentEvent(context.lead, repayment, summary);
    } catch (whErr) {
      console.error('[loanController] Webhook dispatch error:', whErr);
    }
  }

  return success(res, {
    loanId,
    amount: effectiveAmount,
    balance: loanUpdate.balance,
    status: loanUpdate.loanStatus,
    paymentStatus: loanUpdate.paymentStatus,
    repayment,
  }, (isFullClose || loanUpdate.balance <= 0) ? 'Loan successfully settled and marked as Paid Off.' : 'Repayment recorded successfully.');
}

async function markPaidOff(req, res) {
  req.body = { ...req.body, closeFully: true };
  return recordRepayment(req, res);
}

async function updateLoanStatus(req, res) {
  const loanId = req.params.id;
  const { status } = req.body;
  if (!['Active', 'Paid Off', 'Overdue'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid loan status value.' });
  }

  if (status === 'Paid Off') {
    req.body = { ...req.body, closeFully: true };
    return recordRepayment(req, res);
  }

  await query('UPDATE loans SET status = ? WHERE id = ?', [status, loanId]);
  loanModel.invalidateLoansCache();
  return success(res, { loanId, status }, `Loan status updated to ${status}.`);
}

module.exports = {
  getLoan,
  listLoans,
  bulkRepayment,
  downloadNocPdf,
  sendNocEmail,
  recordRepayment,
  markPaidOff,
  updateLoanStatus,
};
