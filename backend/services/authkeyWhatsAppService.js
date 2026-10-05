const { config } = require('../config/env');

const AUTHKEY_ENDPOINT = 'https://console.authkey.io/restapi/requestjson.php';

function buildAuthorizationHeader() {
  const authKey = String(config.authkey.authKey || '').trim();
  return /^Basic\s+/i.test(authKey) ? authKey : `Basic ${authKey}`;
}

function normalizeMobile(value, countryCode = config.authkey.countryCode) {
  const digits = String(value || '').replace(/\D/g, '');
  const normalizedCountryCode = String(countryCode || '').replace(/\D/g, '') || '91';

  if (!digits) return '';
  if (digits.startsWith(normalizedCountryCode) && digits.length > 10) {
    return digits.slice(normalizedCountryCode.length);
  }
  return digits;
}

function authkeyAccepted(data) {
  if (!data || typeof data !== 'object') return true;
  const status = String(data.status || data.Status || data.success || '').trim().toLowerCase();
  if (['false', 'failed', 'error', '0'].includes(status)) return false;
  if (data.error || data.Error) return false;
  return true;
}

function compactText(value, fallback = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function formatWhatsAppAmount(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return Math.round(amount).toLocaleString('en-IN');
}

function bodyVariables(values = []) {
  return values.reduce((acc, value, index) => {
    const key = String(index + 1);
    acc[key] = value;
    acc[`var${key}`] = value;
    return acc;
  }, {});
}

async function parseAuthkeyResponse(response) {
  const responseText = await response.text();
  if (!responseText) return null;

  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

async function sendAuthkeyRequest(body) {
  const response = await fetch(AUTHKEY_ENDPOINT, {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      Authorization: buildAuthorizationHeader(),
    },
    method: 'POST',
  });
  const data = await parseAuthkeyResponse(response);

  if (!response.ok) {
    return {
      attempted: true,
      error: `Authkey responded with HTTP ${response.status}.`,
      response: data,
      sent: false,
    };
  }

  const accepted = authkeyAccepted(data);
  return {
    attempted: true,
    error: accepted ? undefined : 'Authkey did not accept the WhatsApp message.',
    response: data,
    sent: accepted,
  };
}

async function sendDocumentUploadLink({ customerName, phone, token }) {
  if (!config.authkey.authKey) {
    return {
      attempted: false,
      error: 'AUTH_KEY is not configured.',
      sent: false,
    };
  }

  const mobile = normalizeMobile(phone);
  if (!mobile) {
    return {
      attempted: false,
      error: 'Customer phone number is not available.',
      sent: false,
    };
  }

  const uploadToken = String(token || '').trim();
  if (!uploadToken) {
    return {
      attempted: false,
      error: 'Document upload token is not available.',
      sent: false,
    };
  }

  const body = {
    country_code: config.authkey.countryCode,
    mobile,
    wid: config.authkey.documentUploadTemplateId,
    type: 'text',
    button_param_value: uploadToken,
    bodyValues: bodyVariables([customerName || 'Customer']),
  };
  try {
    return await sendAuthkeyRequest(body);
  } catch (error) {
    console.warn('Authkey WhatsApp send failed:', error.message || error);
    return {
      attempted: true,
      error: error.message || 'Unable to send WhatsApp message.',
      sent: false,
    };
  }
}

async function sendSanctionLetter({ customerName, phone, amount, pdfUrl, filename = 'sanction-letter.pdf' }) {
  if (!config.authkey.authKey) {
    return {
      attempted: false,
      error: 'AUTH_KEY is not configured.',
      sent: false,
    };
  }

  const mobile = normalizeMobile(phone);
  if (!mobile) {
    return {
      attempted: false,
      error: 'Customer phone number is not available.',
      sent: false,
    };
  }

  const documentUrl = String(pdfUrl || '').trim();
  if (!documentUrl) {
    return {
      attempted: false,
      error: 'Sanction letter PDF URL is not available.',
      sent: false,
    };
  }

  const borrowerName = compactText(customerName, 'Customer');
  const sanctionAmount = formatWhatsAppAmount(amount) || compactText(amount, '');
  const body = {
    country_code: config.authkey.countryCode,
    mobile,
    wid: config.authkey.sanctionLetterTemplateId,
    type: 'media',
    headerValues: {
      headerFileName: filename,
      headerData: documentUrl,
      filename,
      url: documentUrl,
    },
    bodyValues: bodyVariables([borrowerName, sanctionAmount]),
  };

  try {
    const result = await sendAuthkeyRequest(body);
    return {
      ...result,
      request: {
        bodyValues: body.bodyValues,
        filename,
        mobile,
        templateId: body.wid,
        type: body.type,
      },
    };
  } catch (error) {
    console.warn('Authkey sanction WhatsApp send failed:', error.message || error);
    return {
      attempted: true,
      error: error.message || 'Unable to send sanction WhatsApp message.',
      sent: false,
    };
  }
}

async function sendLoanRejectionMessage({ customerName, phone }) {
  if (!config.authkey.authKey) {
    return {
      attempted: false,
      error: 'AUTH_KEY is not configured.',
      sent: false,
    };
  }

  const mobile = normalizeMobile(phone);
  if (!mobile) {
    return {
      attempted: false,
      error: 'Customer phone number is not available.',
      sent: false,
    };
  }

  const body = {
    country_code: config.authkey.countryCode,
    mobile,
    wid: config.authkey.loanRejectionTemplateId,
    type: 'text',
    bodyValues: bodyVariables([customerName || 'Customer']),
  };

  try {
    return await sendAuthkeyRequest(body);
  } catch (error) {
    console.warn('Authkey loan rejection WhatsApp send failed:', error.message || error);
    return {
      attempted: true,
      error: error.message || 'Unable to send loan rejection WhatsApp message.',
      sent: false,
    };
  }
}

async function sendMessage({ phone, message, templateId }) {
  if (!config.authkey.authKey) {
    return { attempted: false, error: 'AUTH_KEY is not configured.', sent: false };
  }

  const mobile = normalizeMobile(phone);
  if (!mobile) {
    return { attempted: false, error: 'Customer phone number is not available.', sent: false };
  }

  const body = {
    country_code: config.authkey.countryCode,
    mobile,
    wid: templateId || config.authkey.sanctionLetterTemplateId,
    type: 'text',
    bodyValues: bodyVariables([message || '']),
  };

  try {
    return await sendAuthkeyRequest(body);
  } catch (error) {
    console.warn('Authkey WhatsApp send failed:', error.message || error);
    return { attempted: true, error: error.message, sent: false };
  }
}

async function sendEmandateLink({ customerName, phone, authUrl }) {
  return await sendMessage({
    phone,
    message: `Hello ${customerName || 'Customer'}, please complete your Repayment Auto-Debit (eMandate) registration for your Waqt Finance loan application: ${authUrl}`,
  });
}

async function sendCustomWhatsAppMessage({ mobile, phone, message }) {
  return await sendMessage({
    phone: mobile || phone,
    message: message || '',
  });
}

module.exports = {
  sendDocumentUploadLink,
  sendEmandateLink,
  sendLoanRejectionMessage,
  sendSanctionLetter,
  sendMessage,
  sendCustomWhatsAppMessage,
};
