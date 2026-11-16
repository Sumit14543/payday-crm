function moneyInput(value, { defaultValue = 0 } = {}) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !/^\+?\d+(?:\.\d{1,2})?$/.test(value.trim()))) return invalid();
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 9999999999999.99 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.001) return invalid();
  return amount;
}
function invalid() { const error = new Error('Enter a valid non-negative amount with at most two decimal places.'); error.statusCode = 400; error.publicMessage = error.message; throw error; }
module.exports = { moneyInput };
