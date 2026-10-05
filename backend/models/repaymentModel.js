const { query } = require('../config/db');

function clean(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function mapRepayment(row) {
  if (!row) return null;

  return {
    id: row.id,
    loanId: row.loan_id || '',
    repaymentScheduleId: row.repayment_schedule_id || null,
    customerId: row.customer_id || '',
    leadId: row.lead_id || '',
    applicationId: row.application_id || '',
    amount: Number(row.amount || 0),
    principalComponent: Number(row.principal_component || 0),
    interestComponent: Number(row.interest_component || 0),
    feesComponent: Number(row.fees_component || 0),
    penaltyComponent: Number(row.penalty_component || 0),
    method: row.method || '',
    reference: row.reference || '',
    status: row.status || 'received',
    receivedBy: row.received_by || '',
    receivedAt: row.received_at,
    metadata: parseMetadata(row.metadata),
    createdAt: row.created_at,
  };
}

function parseMetadata(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapContext(row) {
  if (!row) return null;

  return {
    loan: {
      id: row.loanId || '',
      customerId: row.customerId || '',
      principal: Number(row.principal || 0),
      totalAmount: Number(row.totalAmount || 0),
      amountPaid: Number(row.amountPaid || 0),
      balance: Number(row.balance || 0),
      dueDate: row.dueDate,
      status: row.loanStatus || '',
      paymentStatus: row.paymentStatus || '',
    },
    schedule: row.scheduleId ? {
      id: row.scheduleId,
      feesDue: Number(row.scheduleFeesDue || 0),
      interestDue: Number(row.scheduleInterestDue || 0),
      totalDue: Number(row.scheduleTotalDue || 0),
      amountPaid: Number(row.scheduleAmountPaid || 0),
      penaltyDue: Number(row.schedulePenaltyDue || 0),
      principalDue: Number(row.schedulePrincipalDue || 0),
      dueDate: row.scheduleDueDate,
      status: row.scheduleStatus || '',
    } : null,
    lead: {
      id: row.applicationId || '',
      rawId: String(row.rawLeadId || ''),
      name: row.customerName || '',
      phone: row.phone || '',
      email: row.email || '',
      sourceSystem: row.sourceSystem || '',
      sourceLeadId: row.sourceLeadId || '',
      sourceApplicationId: row.sourceApplicationId || '',
      status: row.leadStatus || '',
    },
    collectionCase: {
      id: row.collectionCaseId || '',
      status: row.collectionStatus || '',
      totalDue: Number(row.collectionTotalDue || 0),
    },
  };
}

async function findByReference(reference) {
  const rows = await query('SELECT * FROM loan_repayments WHERE reference = ? LIMIT 1', [reference]);
  return mapRepayment(rows[0]);
}

async function findLoanContext({ loanId, sourceSystem, sourceLeadId, sourceApplicationId, panNumber }) {
  const clauses = [];
  const params = [];
  const normalizedLoanId = clean(loanId);
  const normalizedSourceSystem = clean(sourceSystem).toLowerCase();
  const normalizedSourceLeadId = clean(sourceLeadId);
  const normalizedSourceApplicationId = clean(sourceApplicationId);
  const normalizedPanNumber = clean(panNumber).toUpperCase();

  if (normalizedLoanId) {
    clauses.push('loan.id = ?');
    params.push(normalizedLoanId);
  }

  if (normalizedSourceSystem && normalizedSourceLeadId) {
    clauses.push('(la.source_system = ? AND la.source_lead_id = ?)');
    params.push(normalizedSourceSystem, normalizedSourceLeadId);
  }

  if (normalizedSourceSystem && normalizedSourceApplicationId) {
    clauses.push('(la.source_system = ? AND la.source_application_id = ?)');
    params.push(normalizedSourceSystem, normalizedSourceApplicationId);
  }

  if (normalizedPanNumber) {
    clauses.push('(la.pan_number = ?)');
    params.push(normalizedPanNumber);
  }

  if (!clauses.length) return null;

  const rows = await query(`
    SELECT
      loan.id AS loanId,
      loan.customer_id AS customerId,
      loan.principal,
      loan.total_amount AS totalAmount,
      loan.amount_paid AS amountPaid,
      loan.balance,
      loan.due_date AS dueDate,
      loan.status AS loanStatus,
      loan.payment_status AS paymentStatus,
      schedule.id AS scheduleId,
      schedule.principal_due AS schedulePrincipalDue,
      schedule.interest_due AS scheduleInterestDue,
      schedule.fees_due AS scheduleFeesDue,
      schedule.penalty_due AS schedulePenaltyDue,
      schedule.total_due AS scheduleTotalDue,
      schedule.amount_paid AS scheduleAmountPaid,
      schedule.due_date AS scheduleDueDate,
      schedule.status AS scheduleStatus,
      la.id AS rawLeadId,
      COALESCE(NULLIF(la.application_id, ''), CONCAT('APP-', la.id)) AS applicationId,
      COALESCE(NULLIF(la.full_name, ''), collection.customer, customer.name, '') AS customerName,
      COALESCE(la.mobile, collection.phone, customer.phone, '') AS phone,
      COALESCE(la.email, customer.email, '') AS email,
      COALESCE(la.source_system, '') AS sourceSystem,
      COALESCE(la.source_lead_id, '') AS sourceLeadId,
      COALESCE(la.source_application_id, '') AS sourceApplicationId,
      CASE la.status
        WHEN 'draft' THEN 'New'
        WHEN 'submitted' THEN 'Contacted'
        WHEN 'review' THEN 'Document Collection'
        WHEN 'approved' THEN 'Qualified'
        WHEN 'rejected' THEN 'Lost'
        WHEN 'disbursed' THEN 'Converted'
        ELSE 'Converted'
      END AS leadStatus,
      collection.id AS collectionCaseId,
      collection.status AS collectionStatus,
      collection.total_due AS collectionTotalDue
    FROM loans loan
    LEFT JOIN loan_repayment_schedule schedule
      ON schedule.id = (
        SELECT s2.id
        FROM loan_repayment_schedule s2
        WHERE s2.loan_id = loan.id
        ORDER BY s2.installment_number ASC, s2.id ASC
        LIMIT 1
      )
    LEFT JOIN collection_cases collection
      ON TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(collection.loan_id), ' ', ''), '-', ''), '_', '')) = TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(loan.id), ' ', ''), '-', ''), '_', ''))
    LEFT JOIN customers customer
      ON customer.id = loan.customer_id
    LEFT JOIN loan_applications la
      ON la.id = (
        SELECT la2.id
        FROM loan_applications la2
        WHERE la2.application_id = schedule.application_id
          OR CAST(la2.id AS CHAR) = schedule.lead_id
          OR (
            collection.phone <> ''
            AND la2.mobile = collection.phone
          )
        ORDER BY
          CASE
            WHEN la2.application_id = schedule.application_id THEN 1
            WHEN CAST(la2.id AS CHAR) = schedule.lead_id THEN 2
            WHEN collection.phone <> '' AND la2.mobile = collection.phone THEN 3
            ELSE 4
          END,
          la2.id DESC
        LIMIT 1
      )
    WHERE ${clauses.map((clause) => `(${clause})`).join(' OR ')}
    ORDER BY loan.created_at DESC
    LIMIT 1
  `, params);

  return mapContext(rows[0]);
}

function allocatePayment(context, amount) {
  const appliedAmount = toNumber(amount);
  const schedule = context.schedule || {};
  const alreadyPaid = toNumber(schedule.amountPaid || context.loan.amountPaid);
  const penaltyDue = Math.max(0, toNumber(schedule.penaltyDue));
  const feesDue = Math.max(0, toNumber(schedule.feesDue));
  const interestDue = Math.max(0, toNumber(schedule.interestDue));
  const principalDue = Math.max(0, toNumber(schedule.principalDue || context.loan.principal));
  const buckets = [
    { key: 'penaltyComponent', due: penaltyDue },
    { key: 'feesComponent', due: feesDue },
    { key: 'interestComponent', due: interestDue },
    { key: 'principalComponent', due: principalDue },
  ];
  const allocation = {
    appliedAmount,
    feesComponent: 0,
    interestComponent: 0,
    penaltyComponent: 0,
    principalComponent: 0,
  };
  let remainingPaid = alreadyPaid;
  let remainingPayment = appliedAmount;

  buckets.forEach((bucket) => {
    const paidInBucket = Math.min(bucket.due, Math.max(0, remainingPaid));
    remainingPaid = Math.max(0, remainingPaid - bucket.due);
    const bucketBalance = Math.max(0, bucket.due - paidInBucket);
    const component = Math.min(remainingPayment, bucketBalance);
    allocation[bucket.key] = component;
    remainingPayment = Math.max(0, remainingPayment - component);
  });

  if (remainingPayment > 0) {
    allocation.principalComponent += remainingPayment;
  }

  return allocation;
}

async function createRepayment(context, payload = {}) {
  const allocation = allocatePayment(context, payload.amount);
  let safePaidAt = payload.paidAt || payload.receivedAt || payload.transactionDate || null;
  if (safePaidAt) {
    const parsedDate = new Date(safePaidAt);
    if (isNaN(parsedDate.getTime()) || parsedDate > new Date()) {
      safePaidAt = new Date();
    }
  }

  const result = await query(`
    INSERT INTO loan_repayments (
      loan_id, repayment_schedule_id, customer_id, lead_id, application_id,
      amount, principal_component, interest_component, fees_component,
      penalty_component, method, reference, status, received_by, received_at,
      metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, COALESCE(?, CURRENT_TIMESTAMP), ?)
  `, [
    context.loan.id,
    context.schedule?.id || null,
    context.loan.customerId,
    context.lead.rawId || '',
    context.lead.id || '',
    allocation.appliedAmount,
    allocation.principalComponent,
    allocation.interestComponent,
    allocation.feesComponent,
    allocation.penaltyComponent,
    payload.method || '',
    payload.reference,
    payload.receivedBy || 'Source Website',
    safePaidAt,
    JSON.stringify(payload.metadata || {}),
  ]);

  const rows = await query('SELECT * FROM loan_repayments WHERE id = ? LIMIT 1', [result.insertId]);
  return mapRepayment(rows[0]);
}

async function refreshLoanAfterRepayment(context, options = {}) {
  const loanId = context.loan.id;
  const closeFully = Boolean(options && options.closeFully);
  const [totals] = await query(`
    SELECT
      COALESCE(SUM(amount), 0) AS totalPaid,
      COALESCE(SUM(principal_component), 0) AS principalPaid,
      COALESCE(SUM(interest_component), 0) AS interestPaid
    FROM loan_repayments
    WHERE loan_id = ? AND status IN ('received', 'settled')
  `, [loanId]);

  const totalPaid = Number(totals.totalPaid || 0);
  const totalAmount = Number(context.loan.totalAmount || 0);
  const principal = Number(context.loan.principal || 0);
  const interestRate = Number(context.loan.interestRate || 1.0);

  const dueDateStr = String(context.schedule?.dueDate || context.loan.dueDate || '').slice(0, 10);
  const todayStr = new Date().toISOString().slice(0, 10);
  let accruedPenalty = 0;

  if (dueDateStr && dueDateStr < todayStr) {
    const dueDate = new Date(dueDateStr);
    dueDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (86400000)));
    accruedPenalty = Math.round(principal * (interestRate / 100) * daysOverdue);
  }

  const effectiveTotalDue = totalAmount + accruedPenalty;
  const balance = closeFully ? 0 : Math.max(0, Math.round(effectiveTotalDue - totalPaid));
  const isOverdue = Boolean(dueDateStr) && dueDateStr < todayStr && balance > 0;
  const paymentStatus = (closeFully || balance <= 0) ? 'Paid' : totalPaid > 0 ? 'Partial' : isOverdue ? 'Overdue' : 'Pending';
  const loanStatus = (closeFully || balance <= 0) ? 'Paid Off' : isOverdue ? 'Overdue' : 'Active';
  const scheduleStatus = (closeFully || balance <= 0)
    ? 'paid'
    : totalPaid > 0
      ? 'partial'
      : isOverdue
        ? 'overdue'
        : 'pending';

  await query(`
    UPDATE loans
    SET amount_paid = ?,
        balance = ?,
        status = ?,
        payment_status = ?,
        next_payment_amount = ?,
        next_payment_date = CASE WHEN ? <= 0 THEN NULL ELSE next_payment_date END
    WHERE id = ?
  `, [totalPaid, balance, loanStatus, paymentStatus, balance, balance, loanId]);

  if (balance <= 0 && context.lead?.rawId) {
    await query(`
      UPDATE loan_applications
      SET status = 'closed', is_active_application = 0
      WHERE id = ? OR application_id = ?
    `, [context.lead.rawId, context.lead.id]);
  } else if (context.lead?.rawId) {
    await query(`
      UPDATE loan_applications
      SET status = 'disbursed', is_active_application = 1
      WHERE id = ? OR application_id = ?
    `, [context.lead.rawId, context.lead.id]);
  }

  if (context.schedule?.id) {
    await query(`
      UPDATE loan_repayment_schedule
      SET amount_paid = LEAST(total_due, ?),
          status = ?,
          paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP)
      WHERE id = ?
    `, [totalPaid, scheduleStatus, context.schedule.id]);
  }

  await query(`
    UPDATE collection_cases
    SET total_due = ?,
        last_payment_date = CURRENT_DATE,
        status = CASE WHEN ? <= 0 THEN 'Paid Off' ELSE ? END
    WHERE loan_id = ?
       OR TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(loan_id), ' ', ''), '-', ''), '_', '')) = TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(?), ' ', ''), '-', ''), '_', ''))
  `, [balance, balance, isOverdue ? 'Overdue' : 'Active', loanId, loanId]);


  // Dynamically require and run syncOverdueLoans to update overdue interest / DPD balance in real-time
  try {
    const collectionModel = require('./collectionModel');
    await collectionModel.syncOverdueLoans();
  } catch (syncError) {
    console.error('[RepaymentModel] Failed to sync overdue loans interest:', syncError);
  }

  // Retrieve the updated balance from the database
  const [updatedLoan] = await query('SELECT balance, status, payment_status FROM loans WHERE id = ?', [loanId]);
  const finalBalance = updatedLoan ? Number(updatedLoan.balance) : balance;

  // Auto-trigger NOC generation and email when loan is fully paid off
  if (finalBalance <= 0) {
    try {
      const nocService = require('../services/nocService');
      nocService.triggerNocForClosedLoan({ loanId }).catch((nocErr) => {
        console.error(`[RepaymentModel] Background NOC trigger failed for Loan ID ${loanId}:`, nocErr);
      });
    } catch (nocInitErr) {
      console.error(`[RepaymentModel] Failed to initialize nocService for Loan ID ${loanId}:`, nocInitErr);
    }
  }

  return {
    balance: finalBalance,
    loanStatus: updatedLoan ? updatedLoan.status : loanStatus,
    paymentStatus: updatedLoan ? updatedLoan.payment_status : paymentStatus,
    scheduleStatus,
    totalPaid,
  };
}

async function repaymentSummaryByLead(lead) {
  if (!lead?.id && !lead?.rawId) return null;

  const customerId = `CUS${String(lead.rawId || lead.id || '').replace(/[^a-z0-9]/gi, '').toUpperCase()}`.slice(0, 32);

  const rows = await query(`
    SELECT
      loan.id AS loanId,
      loan.total_amount AS dueAmount,
      COALESCE(
        NULLIF((
          SELECT SUM(r.amount)
          FROM loan_repayments r
          WHERE (
            r.loan_id = loan.id
            OR TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(r.loan_id), ' ', ''), '-', ''), '_', '')) = TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(loan.id), ' ', ''), '-', ''), '_', ''))
          ) AND r.status IN ('received', 'success', 'paid', 'settled')
        ), 0),
        NULLIF(loan.amount_paid, 0),
        0
      ) AS amountPaid,
      loan.balance AS outstanding,
      loan.status AS loanStatus,
      loan.payment_status AS repaymentStatus,
      COALESCE(schedule.due_date, loan.due_date) AS dueDate,
      COALESCE(schedule.interest_due, (loan.total_amount - loan.principal)) AS interestAccrued,
      schedule.status AS scheduleStatus,
      last_payment.received_at AS lastPaymentAt,
      last_payment.reference AS lastPaymentReference,
      loan.principal AS principal,
      loan.interest_rate AS interestRate,
      COALESCE((SELECT DATE(disbursed_at) FROM lead_accounting_payments WHERE loan_id = loan.id ORDER BY id DESC LIMIT 1), loan.start_date) AS startDate,
      loan.due_date AS loanDueDate
    FROM loans loan
    LEFT JOIN loan_repayment_schedule schedule
      ON schedule.id = (
        SELECT s2.id
        FROM loan_repayment_schedule s2
        WHERE s2.loan_id = loan.id
          AND (s2.application_id = ? OR s2.lead_id = ? OR ? = '')
        ORDER BY s2.installment_number ASC, s2.id ASC
        LIMIT 1
      )
    LEFT JOIN collection_cases collection
      ON TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(collection.loan_id), ' ', ''), '-', ''), '_', '')) = TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(loan.id), ' ', ''), '-', ''), '_', ''))
    LEFT JOIN loan_repayments last_payment
      ON last_payment.id = (
        SELECT rp.id
        FROM loan_repayments rp
        WHERE rp.loan_id = loan.id
        ORDER BY rp.received_at DESC, rp.id DESC
        LIMIT 1
      )
    WHERE schedule.application_id = ?
      OR schedule.lead_id = ?
      OR (? <> '' AND collection.phone = ?)
      OR (? <> '' AND LOWER(TRIM(collection.customer)) = LOWER(TRIM(?)))
      OR (loan.id = ?)
      OR (TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(loan.id), ' ', ''), '-', ''), '_', '')) = TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(?), ' ', ''), '-', ''), '_', '')))
      OR (TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(collection.loan_id), ' ', ''), '-', ''), '_', '')) = TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(?), ' ', ''), '-', ''), '_', '')))
    ORDER BY loan.created_at DESC
    LIMIT 1
  `, [
    lead.id || '',
    lead.rawId || '',
    lead.id || '',
    lead.id || '',
    lead.rawId || '',
    lead.phone || '',
    lead.phone || '',
    lead.name || '',
    lead.name || '',
    lead.rawId || lead.id || '',
    lead.rawId || lead.id || '',
    lead.rawId || lead.id || '',
  ]);

  const row = rows[0];
  if (!row) return null;

  return {
    amountPaid: Number(row.amountPaid || 0),
    dueAmount: Number(row.dueAmount || 0),
    dueDate: row.dueDate,
    interestAccrued: Number(row.interestAccrued || 0),
    lastPaymentAt: row.lastPaymentAt,
    lastPaymentReference: row.lastPaymentReference || '',
    loanId: row.loanId || '',
    loanStatus: row.loanStatus || '',
    outstanding: Number(row.outstanding || 0),
    repaymentStatus: row.repaymentStatus || row.scheduleStatus || '',
    scheduleStatus: row.scheduleStatus || '',
    principal: Number(row.principal || 0),
    interestRate: Number(row.interestRate || 0),
    startDate: row.startDate,
    loanDueDate: row.loanDueDate,
  };
}

async function disbursementSummaryByLead(lead) {
  if (!lead?.id && !lead?.rawId) return null;

  const rows = await query(`
    SELECT
      payment.loan_id AS loanId,
      payment.amount AS disbursedAmount,
      payment.transfer_type AS transferType,
      payment.transaction_id AS transactionId,
      payment.status AS paymentStatus,
      payment.disbursed_at AS disbursedAt,
      loan.status AS loanStatus,
      loan.payment_status AS loanPaymentStatus,
      loan.balance AS outstanding,
      loan.due_date AS dueDate,
      sanction.agreement_number AS agreementNumber,
      sanction.disbursed_amount AS sanctionedDisbursedAmount
    FROM lead_accounting_payments payment
    LEFT JOIN loans loan
      ON loan.id = payment.loan_id
    LEFT JOIN lead_sanctions sanction
      ON sanction.id = (
        SELECT s2.id
        FROM lead_sanctions s2
        WHERE s2.application_id = payment.application_id
          OR s2.lead_id = payment.lead_id
        ORDER BY s2.created_at DESC, s2.id DESC
        LIMIT 1
      )
    WHERE payment.application_id = ? OR payment.lead_id = ?
    ORDER BY payment.disbursed_at DESC, payment.id DESC
    LIMIT 1
  `, [lead.id || '', lead.rawId || '']);

  const row = rows[0];
  if (!row) return {
    status: 'pending',
  };

  return {
    agreementNumber: row.agreementNumber || '',
    disbursedAmount: Number(row.disbursedAmount || row.sanctionedDisbursedAmount || 0),
    disbursedAt: row.disbursedAt,
    dueDate: row.dueDate,
    loanId: row.loanId || '',
    loanPaymentStatus: row.loanPaymentStatus || '',
    loanStatus: row.loanStatus || '',
    outstanding: Number(row.outstanding || 0),
    status: row.paymentStatus || 'paid',
    transactionId: row.transactionId || '',
    transferType: row.transferType || '',
  };
}

module.exports = {
  createRepayment,
  disbursementSummaryByLead,
  findByReference,
  findLoanContext,
  refreshLoanAfterRepayment,
  repaymentSummaryByLead,
};
