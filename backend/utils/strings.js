function clean(value) {
  return String(value ?? '').trim();
}

function likeParams(value, count) {
  return Array.from({ length: count }, () => `%${value}%`);
}

function currentDate() {
  return new Date().toISOString().slice(0, 10);
}

async function generateApplicationId(sourceSystem) {
  const { query, getActiveBrand } = require('../config/db');
  
  let source = String(sourceSystem || '').trim().toLowerCase();
  if (!source) {
    try {
      const activeBrand = getActiveBrand();
      if (activeBrand && activeBrand.slug) {
        source = activeBrand.slug.toLowerCase();
      }
    } catch (e) {
      // Ignore errors when database context isn't available
    }
  }

  let prefix = 'WAQT-MN-PD-';
  if (source === 'geetpay') {
    prefix = 'WAQT-GP-PD-';
  } else if (source === 'loaninwallet') {
    prefix = 'WAQT-LIW-PD-';
  } else if (source === 'salarywaves') {
    prefix = 'WAQT-SW-PD-';
  } else if (source === 'waqtfinance') {
    prefix = 'WAQT-FN-PD-';
  }

  let nextSeq = 1;
  try {
    const rows = await query(`SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM loan_applications`);
    if (rows && rows.length) {
      nextSeq = rows[0].nextId;
    }
  } catch (err) {
    console.error('Failed to query sequential application_id:', err);
  }

  const seqStr = String(nextSeq).padStart(6, '0');
  return `${prefix}${seqStr}`;
}

module.exports = {
  clean,
  currentDate,
  generateApplicationId,
  likeParams,
};
