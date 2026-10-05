const fs = require('fs');
const path = require('path');

function loadEnv(filePath = path.join(__dirname, '..', '.env'), override = true) {
  if (!fs.existsSync(filePath)) return;

  fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex === -1) return;

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');

      if (override || process.env[key] === undefined) {
        process.env[key] = value;
      }
    });
}

// Always load root backend/.env first
const baseEnvFile = path.join(__dirname, '..', '.env');
loadEnv(baseEnvFile, true);

const runtimeMode = process.env.NODE_ENV || 'development';
const envFileByMode = path.join(__dirname, '..', `.env.${runtimeMode}`);
const selectedEnvFile = process.env.ENV_FILE
  ? path.resolve(process.cwd(), process.env.ENV_FILE)
  : (envFileByMode && fs.existsSync(envFileByMode) ? envFileByMode : null);

if (selectedEnvFile && selectedEnvFile !== baseEnvFile) {
  loadEnv(selectedEnvFile, true);
}

function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function readIntegrationApiKeys(value) {
  return String(value || '')
    .split(',')
    .map((item) => {
      const trimmed = item.trim();
      if (!trimmed) return null;

      const separatorIndex = trimmed.indexOf(':');
      if (separatorIndex === -1) {
        return {
          key: trimmed,
          sourceSystem: '',
        };
      }

      return {
        key: trimmed.slice(separatorIndex + 1).trim(),
        sourceSystem: trimmed.slice(0, separatorIndex).trim().toLowerCase(),
      };
    })
    .filter((item) => item && item.key);
}

function readSourceMap(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((map, item) => {
      const separatorIndex = item.indexOf(':');
      if (separatorIndex === -1) return map;

      const sourceSystem = item.slice(0, separatorIndex).trim().toLowerCase();
      const mappedValue = item.slice(separatorIndex + 1).trim();
      if (sourceSystem && mappedValue) map[sourceSystem] = mappedValue;
      return map;
    }, {});
}

function defaultDigioBaseUrl(environment) {
  return String(environment || '').trim().toLowerCase() === 'production'
    ? 'https://api.digio.in'
    : 'https://ext.digio.in:444';
}

function defaultCashfreeBaseUrl(environment) {
  return String(environment || '').trim().toLowerCase() === 'production'
    ? 'https://api.cashfree.com'
    : 'https://sandbox.cashfree.com';
}

const digioEnvironment = process.env.DIGIO_ENVIRONMENT || 'test';
const cashfreeEnvironment = process.env.CASHFREE_ENVIRONMENT || process.env.CASHFREE_ENV || 'sandbox';

const config = {
  app: {
    port: readNumber(process.env.PORT, 5000),
    corsOrigin: process.env.CORS_ORIGIN || '*',
    publicApiUrl: process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL || '',
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? process.env.DB_PASS ?? '',
    port: readNumber(process.env.DB_PORT, 3306),
    database: process.env.DB_NAME || 'waqt-finance',
    connectionLimit: readNumber(process.env.DB_CONNECTION_LIMIT, 10),
    autoCreate: readBoolean(process.env.DB_AUTO_CREATE, false),
  },
  bifrost: {
    apiUrl: process.env.BIFROST_API_URL || '',
    aadhaarApiUrl: process.env.BIFROST_AADHAAR_API_URL || 'https://bifrost.unifers.ai/enrich/get-aadhaar-data',
    apiToken: process.env.BIFROST_API_TOKEN || '',
    authScheme: process.env.BIFROST_AUTH_SCHEME ?? '',
    callbackUrl: process.env.BIFROST_CALLBACK_URL || '',
    timeoutMs: readNumber(process.env.BIFROST_TIMEOUT_MS, 90000),
    cibilPendingRetryAfterMs: readNumber(process.env.CIBIL_PENDING_RETRY_AFTER_MS, 120000),
  },
  digitap: {
    apiUrl: process.env.DIGITAP_API_URL || 'https://svcdemo.digitap.work/credit_analytics/v2/cf',
    clientId: process.env.DIGITAP_CLIENT_ID || '',
    clientSecret: process.env.DIGITAP_CLIENT_SECRET || '',
    timeoutMs: readNumber(process.env.DIGITAP_TIMEOUT_MS, 90000),
  },
  cibilProvider: (process.env.CIBIL_PROVIDER || '').trim().toLowerCase() || (process.env.DIGITAP_CLIENT_ID ? 'digitap' : 'digitap'),
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_CIBIL_MODEL || 'gpt-4.1',
    timeoutMs: readNumber(process.env.OPENAI_TIMEOUT_MS, 45000),
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: readNumber(process.env.SMTP_PORT, 587),
    secure: ['1', 'true', 'yes', 'ssl'].includes(String(process.env.SMTP_SECURE || '').trim().toLowerCase()),
    username: process.env.SMTP_USERNAME || '',
    password: process.env.SMTP_PASSWORD || '',
    fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USERNAME || '',
    fromName: process.env.SMTP_FROM_NAME || 'Waqt Finance',
  },
  authkey: {
    authKey: process.env.AUTH_KEY || process.env.AUTHKEY_AUTH_KEY || '',
    countryCode: process.env.AUTHKEY_COUNTRY_CODE || '91',
    documentUploadTemplateId: process.env.AUTHKEY_DOCUMENT_UPLOAD_TEMPLATE_ID || '35201',
    documentUploadTemplateName: process.env.AUTHKEY_DOCUMENT_UPLOAD_TEMPLATE_NAME || 'document_upload_link',
    sanctionLetterTemplateId: process.env.AUTHKEY_SANCTION_LETTER_TEMPLATE_ID || '35026',
    loanRejectionTemplateId: process.env.AUTHKEY_LOAN_REJECTION_TEMPLATE_ID || '35391',
  },
  esign: {
    provider: String(process.env.ESIGN_PROVIDER || 'dummy').trim().toLowerCase(),
    publicBaseUrl: process.env.PUBLIC_APP_URL || process.env.CORS_ORIGIN || '',
  },
  integrations: {
    apiKeys: readIntegrationApiKeys(process.env.INTEGRATION_API_KEYS),
    statusWebhookSecrets: readSourceMap(process.env.INTEGRATION_STATUS_WEBHOOK_SECRETS),
    statusWebhookTimeoutMs: readNumber(process.env.INTEGRATION_STATUS_WEBHOOK_TIMEOUT_MS, 5000),
    statusWebhookUrls: readSourceMap(process.env.INTEGRATION_STATUS_WEBHOOK_URLS),
  },
  digio: {
    clientId: process.env.DIGIO_CLIENT_ID || '',
    clientSecret: process.env.DIGIO_CLIENT_SECRET || '',
    baseUrl: process.env.DIGIO_API_BASE_URL || defaultDigioBaseUrl(digioEnvironment),
    environment: digioEnvironment,
    signType: process.env.DIGIO_SIGN_TYPE || 'AADHAAR',
    notifyForSigning: readBoolean(process.env.DIGIO_NOTIFY_SIGNER, true),
    webhookUrl: process.env.DIGIO_WEBHOOK_URL || '',
    redirectUrl: process.env.DIGIO_REDIRECT_URL || '',
  },
  cashfree: {
    clientId: process.env.CASHFREE_CLIENT_ID || process.env.CASHFREE_APP_ID || '',
    clientSecret: process.env.CASHFREE_CLIENT_SECRET || process.env.CASHFREE_SECRET_KEY || '',
    apiVersion: process.env.CASHFREE_API_VERSION || '2025-01-01',
    baseUrl: process.env.CASHFREE_API_BASE_URL || defaultCashfreeBaseUrl(cashfreeEnvironment),
    environment: cashfreeEnvironment,
    returnUrl: process.env.CASHFREE_RETURN_URL || process.env.PUBLIC_APP_URL || process.env.CORS_ORIGIN || '',
    notifyUrl: process.env.CASHFREE_NOTIFY_URL || process.env.CASHFREE_WEBHOOK_URL || '',
  },
  crif: {
    baseUrl: process.env.CRIF_BASE_URL || 'https://orch.crif.com/orchestrator',
    apiUser: process.env.CRIF_API_USER || 'waqtit3@gmail.com',
    apiPassword: process.env.CRIF_API_PASSWORD || 'Waqt@#@#08#@',
    templateCode: process.env.CRIF_TEMPLATE_CODE || 'CT003',
    flowId: process.env.CRIF_FLOW_ID || 'F001',
    redirectUrl: process.env.CRIF_REDIRECT_URL || (process.env.PUBLIC_APP_URL ? `${process.env.PUBLIC_APP_URL}/account-aggregator/callback` : 'https://payday.waqtmoney.com/account-aggregator/callback'),
  },
};

if (process.env.NODE_ENV === 'production' && config.app.corsOrigin === '*') {
  throw new Error('CORS_ORIGIN must be set to the production frontend origin.');
}

module.exports = { config, loadEnv };
