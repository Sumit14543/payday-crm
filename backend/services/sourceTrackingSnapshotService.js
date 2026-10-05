const { config } = require('../config/env');
const repaymentModel = require('../models/repaymentModel');
const sanctionModel = require('../models/sanctionModel');

function publicApiBaseUrl() {
  return String(config.app.publicApiUrl || '').replace(/\/+$/, '');
}

function sourceQuery(lead) {
  const params = new URLSearchParams();
  if (lead.sourceSystem) params.set('sourceSystem', lead.sourceSystem);
  if (lead.sourceLeadId) params.set('sourceLeadId', lead.sourceLeadId);
  if (!lead.sourceLeadId && lead.sourceApplicationId) params.set('sourceApplicationId', lead.sourceApplicationId);
  return params.toString();
}

function sanctionPdfUrl(lead, sanction) {
  const baseUrl = publicApiBaseUrl();
  const query = sourceQuery(lead);
  if (!query || !sanction?.pdfPath) return '';
  const path = `/api/integrations/leads/sanction-pdf?${query}`;
  return baseUrl ? `${baseUrl}${path}` : path;
}

function parseDateParts(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return dateInput;
  const str = String(dateInput).trim();
  if (!str) return null;
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function calculateTenureDays(dueDateStr, disbursedDateStr) {
  const dDue = parseDateParts(dueDateStr);
  const dDisbursed = parseDateParts(disbursedDateStr);
  if (!dDue || !dDisbursed) return 0;
  return Math.round((dDue.getTime() - dDisbursed.getTime()) / (1000 * 60 * 60 * 24));
}

function formatInterestRate(rate) {
  if (rate === undefined || rate === null) return '0.00%';
  const num = Number(rate);
  if (!isNaN(num)) {
    return num.toFixed(2) + '%';
  }
  const str = String(rate).trim();
  return str.endsWith('%') ? str : str + '%';
}

function calculateLiveStatusBlocks(lead, sanction, disbursement, repayment) {
  const hasLoanOrSanction = Boolean(repayment || sanction);

  const principalAmount = repayment?.principal !== undefined
    ? repayment.principal
    : (sanction?.principalAmount !== undefined ? Number(sanction.principalAmount) : Number(lead.loanAmount || 0));

  const dueAmount = repayment?.dueAmount !== undefined
    ? repayment.dueAmount
    : (sanction?.repaymentAmount !== undefined ? Number(sanction.repaymentAmount) : 0);

  const amountPaid = repayment?.amountPaid !== undefined ? repayment.amountPaid : 0;
  const outstanding = repayment?.outstanding !== undefined
    ? Number(repayment.outstanding)
    : Math.max(0, dueAmount - amountPaid);
  const interestAccrued = Math.max(0, dueAmount - principalAmount);

  const disbursedDate = disbursement?.disbursedAt || sanction?.disbursementDate || repayment?.startDate || null;
  const dueDate = repayment?.dueDate || repayment?.loanDueDate || sanction?.dueDate || disbursement?.dueDate || null;
  
  let tenureDays = 0;
  if (dueDate && disbursedDate) {
    tenureDays = calculateTenureDays(dueDate, disbursedDate);
  } else if (sanction?.tenureDays !== undefined) {
    tenureDays = Number(sanction.tenureDays);
  }

  const rawInterestRate = repayment?.interestRate !== undefined
    ? repayment.interestRate
    : (sanction?.interestRate !== undefined ? sanction.interestRate : 0);
  const interestRateStr = formatInterestRate(rawInterestRate);

  const repaymentBlock = hasLoanOrSanction ? {
    amountPaid,
    dueAmount,
    dueDate: dueDate ? String(dueDate).slice(0, 10) : null,
    interestAccrued,
    interestRate: interestRateStr,
    lastPaymentAt: repayment?.lastPaymentAt || null,
    lastPaymentReference: repayment?.lastPaymentReference || '',
    loanId: repayment?.loanId || '',
    loanStatus: repayment?.loanStatus || (sanction ? 'Sanctioned' : ''),
    outstanding,
    repaymentStatus: repayment?.repaymentStatus || '',
    scheduleStatus: repayment?.scheduleStatus || '',
    principal: principalAmount,
    startDate: repayment?.startDate || sanction?.disbursementDate || null,
    loanDueDate: repayment?.loanDueDate || sanction?.dueDate || null,
    tenureDays,
  } : null;

  const sanctionBlock = sanction ? {
    agreementNumber: sanction.agreementNumber,
    emailStatus: sanction.emailStatus,
    pdfAvailable: Boolean(sanction.pdfPath),
    pdfUrl: sanctionPdfUrl(lead, sanction),
    sentAt: sanction.sentAt,
    whatsappStatus: sanction.whatsappStatus,
    dueDate: sanction.dueDate,
    principalAmount: Number(sanction.principalAmount || 0),
    repaymentAmount: Number(sanction.repaymentAmount || 0),
    disbursedAmount: Number(sanction.disbursedAmount || 0),
  } : (hasLoanOrSanction ? {
    principalAmount,
    repaymentAmount: dueAmount,
    disbursedAmount: disbursement?.disbursedAmount || 0,
  } : null);

  return { repaymentBlock, sanctionBlock };
}

async function buildForLead(lead) {
  if (!lead?.id && !lead?.rawId) return {};

  const [sanction, disbursement, repayment] = await Promise.all([
    sanctionModel.findLatestByLead(lead),
    repaymentModel.disbursementSummaryByLead(lead),
    repaymentModel.repaymentSummaryByLead(lead),
  ]);

  const { repaymentBlock, sanctionBlock } = calculateLiveStatusBlocks(lead, sanction, disbursement, repayment);

  return {
    disbursement,
    repayment: repaymentBlock,
    sanction: sanctionBlock,
  };
}

module.exports = {
  buildForLead,
  sanctionPdfUrl,
  calculateLiveStatusBlocks,
};
