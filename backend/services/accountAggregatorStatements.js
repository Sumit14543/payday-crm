// Read saved AA data without starting a new consent, provider fetch or analytics write.
function field(object, ...names) {
  if (!object || typeof object !== 'object') return undefined;
  for (const name of names) {
    const key = Object.keys(object).find(key => key.toLowerCase() === name.toLowerCase());
    if (key !== undefined && object[key] !== null && object[key] !== '') return object[key];
  }
}

function number(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function transaction(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && field(value, 'amount', 'txnAmount') !== undefined
    && field(value, 'type', 'txnType', 'narration', 'description', 'transactionTimestamp', 'date', 'valueDate') !== undefined;
}

function transactions(object, depth = 0) {
  if (!object || typeof object !== 'object' || depth > 12) return [];
  if (Array.isArray(object)) return object.filter(transaction);
  if (transaction(object)) return [object];
  const keys = Object.keys(object).sort((a, b) => Number(/^(transactions?|txns?|txn)$/i.test(b)) - Number(/^(transactions?|txns?|txn)$/i.test(a)));
  for (const key of keys) {
    const found = transactions(object[key], depth + 1);
    if (found.length) return found;
  }
  return [];
}

function accounts(object, depth = 0, inherited = {}) {
  if (!object || typeof object !== 'object' || depth > 12 || transaction(object)) return [];
  if (Array.isArray(object)) return object.flatMap(item => accounts(item, depth + 1, inherited));
  const context = { ...inherited };
  for (const name of ['bankName', 'fipName', 'ifscCode', 'ifsc', 'accountId', 'linkedAccRef', 'maskedAccNumber', 'accountNumber']) {
    const value = field(object, name);
    if (value !== undefined) context[name] = value;
  }
  const children = Object.entries(object)
    .filter(([key]) => !/^(accountDetails|summary|transactions?|txns?|txn|profile|holders?)$/i.test(key))
    .flatMap(([, value]) => accounts(value, depth + 1, context));
  // The AA sync also stores a root summary of the first account. Prefer bank
  // account payloads underneath it so that bank transactions are never mixed.
  if (children.length) return children;
  if (field(object, 'accountDetails', 'summary', 'maskedAccNumber', 'accountNumber', 'accountNumberMasked') !== undefined) return [{ ...context, ...object }];
  return [];
}

const BANKS = { UBIN: 'Union Bank of India', UTIB: 'Axis Bank', SBIN: 'State Bank of India', HDFC: 'HDFC Bank', ICIC: 'ICICI Bank', PUNB: 'Punjab National Bank', BARB: 'Bank of Baroda', CNRB: 'Canara Bank', KKBK: 'Kotak Mahindra Bank', IDFB: 'IDFC FIRST Bank', YESB: 'Yes Bank', INDB: 'IndusInd Bank' };

function statementsFromRows(rows) {
  const statements = [];
  const seen = new Map();
  for (const row of rows) {
    let data = row.rawAnalyticsJson ?? row.raw_analytics_json;
    try { if (typeof data === 'string') data = JSON.parse(data); } catch { continue; }
    if (!data || typeof data !== 'object') continue;
    const raw = data.rawFiData || data.analytics?.rawFiData || data;
    const candidates = accounts(raw);
    if (!candidates.length && transactions(raw).length) candidates.push(raw);
    candidates.forEach((account, index) => {
      const details = field(account, 'accountDetails', 'summary') || account;
      const ifscCode = String(field(details, 'ifscCode', 'ifsc') || field(account, 'ifscCode', 'ifsc') || '');
      const bankName = String(field(details, 'bankName', 'fipName') || field(account, 'bankName', 'fipName') || BANKS[ifscCode.slice(0, 4).toUpperCase()] || row.fipName || 'Bank account');
      const rawNumber = String(field(details, 'accountNumberMasked', 'maskedAccNumber', 'accountNumber') || field(account, 'maskedAccNumber', 'accountNumberMasked', 'accountNumber') || '');
      const digits = rawNumber.replace(/\D/g, '');
      const maskedAccountNumber = digits ? `XXXX${digits.slice(-4)}` : '';
      const items = transactions(account).map(item => {
        const rawType = String(field(item, 'type', 'txnType') || '').toUpperCase();
        return {
          date: String(field(item, 'transactionTimestamp', 'valueDate', 'date', 'txnDate') || ''),
          narration: String(field(item, 'narration', 'description', 'summary') || ''),
          type: ['CR', 'CREDIT'].includes(rawType) ? 'CREDIT' : ['DR', 'DEBIT'].includes(rawType) ? 'DEBIT' : rawType,
          amount: number(field(item, 'amount', 'txnAmount')),
          balance: number(field(item, 'transactionalBalance', 'currentBalance', 'balance')),
        };
      });
      if (!items.length && !maskedAccountNumber && !ifscCode) return;
      const identity = `${bankName}:${ifscCode}:${field(account, 'accountId', 'linkedAccRef') || maskedAccountNumber || `${row.id}-${index}`}`;
      const statement = {
        id: `aa-${row.id}-${index}`, bankName, maskedAccountNumber, ifscCode,
        accountType: String(field(details, 'accountSubType', 'accountType', 'type') || ''),
        balance: number(field(details, 'currentBalance', 'balance')),
        fetchedAt: row.createdAt || row.created_at || null, transactions: items,
      };
      if (seen.has(identity)) {
        const previous = seen.get(identity);
        // A later consent-only placeholder must not hide previously saved data.
        if (!statements[previous].transactions.length && items.length) statements[previous] = statement;
        return;
      }
      seen.set(identity, statements.length);
      statements.push(statement);
    });
  }
  return statements;
}

module.exports = { statementsFromRows };
