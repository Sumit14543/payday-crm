const crypto = require('crypto');
const { tenantLocalStorage } = require('../config/db');

// Names, agreement numbers and numeric IDs can repeat in different companies.
// Keep human-readable download names separate from unique physical filenames.
function privateDocumentName(filename) {
  const tenant = tenantLocalStorage.getStore()?.tenant;
  const scope = JSON.stringify([tenant?.slug || 'waqtfinance', tenant?.db_name || 'default']);
  const prefix = crypto.createHash('sha256').update(scope).digest('hex').slice(0, 24);
  return `${prefix}-${crypto.randomUUID()}-${filename}`;
}
module.exports = { privateDocumentName };
