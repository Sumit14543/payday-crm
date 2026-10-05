const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { query } = require('../config/db');
const { ensureRazorpayEmandateColumns } = require('../database/schema');
const leadModel = require('../models/leadModel');
const auditModel = require('../models/auditModel');
const emailService = require('../services/emailService');
const authkeyWhatsAppService = require('../services/authkeyWhatsAppService');

function getCashfreeConfig() {
  const appId = String(process.env.CASHFREE_CLIENT_ID || process.env.CASHFREE_APP_ID || '').trim();
  const secretKey = String(process.env.CASHFREE_CLIENT_SECRET || process.env.CASHFREE_SECRET_KEY || '').trim();
  const explicitEnv = String(process.env.CASHFREE_ENV || 'PROD').trim().toUpperCase();
  const isTestKey = secretKey.includes('_test_') || appId.includes('_test_') || secretKey.startsWith('cfsk_ma_test_');
  const env = isTestKey ? 'TEST' : (explicitEnv || 'PROD');
  const baseUrl = env === 'PROD' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
  const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET || secretKey;

  return { appId, secretKey, env, baseUrl, webhookSecret };
}

function cashfreeRequest(method, endpoint, bodyData = null) {
  const { appId, secretKey, baseUrl } = getCashfreeConfig();
  const cleanEndpoint = endpoint.startsWith('/pg/') ? endpoint.slice(3) : endpoint;
  const url = new URL(`${baseUrl}${cleanEndpoint.startsWith('/') ? '' : '/'}${cleanEndpoint}`);

  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const payloadString = bodyData ? JSON.stringify(bodyData) : '';

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: method.toUpperCase(),
      headers: {
        'x-client-id': appId,
        'x-client-secret': secretKey,
        'x-api-version': '2023-08-01',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    if (payloadString) {
      options.headers['Content-Length'] = Buffer.byteLength(payloadString);
    }

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.message || parsed.reason || `Cashfree HTTP ${res.statusCode}`));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ raw: data });
          } else {
            reject(new Error(`Cashfree response error (${res.statusCode}): ${data}`));
          }
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (payloadString) req.write(payloadString);
    req.end();
  });
}

async function resolveLead(applicationIdOrLeadId) {
  if (!applicationIdOrLeadId) return null;
  const cleanedId = String(applicationIdOrLeadId).trim();
  let lead = await leadModel.findById(cleanedId).catch(() => null);
  if (lead) return lead;

  try {
    const rows = await query(`
      SELECT
        COALESCE(NULLIF(application_id, ''), CONCAT('APP-', id)) AS id,
        CAST(id AS CHAR) AS rawId,
        COALESCE(NULLIF(full_name, ''), CONCAT('Applicant ', id)) AS name,
        email,
        office_email AS officeEmail,
        office_email AS officialEmail,
        mobile,
        loan_amount AS loanAmount,
        approved_amount AS approvedAmount,
        bank_name AS bankName,
        account_number AS accountNumber,
        ifsc_code AS ifscCode,
        emandate_id AS emandateId,
        emandate_id AS mandateId,
        emandate_status AS emandateStatus,
        emandate_auth_url AS emandateAuthUrl,
        emandate_bank_name AS emandateBankName,
        emandate_payment_mode AS emandatePaymentMode,
        emandate_ref_id AS emandateRefId,
        emandate_plan_name AS emandatePlanName,
        emandate_upi_id AS emandateUpiId,
        emandate_account_number AS emandateAccountNumber,
        emandate_max_amount AS emandateMaxAmount,
        emandate_provider AS emandateProvider
      FROM loan_applications
      WHERE application_id = ? OR id = ? OR emandate_id = ? OR application_id LIKE ?
      ORDER BY CASE WHEN application_id = ? THEN 0 WHEN id = ? THEN 1 ELSE 2 END
      LIMIT 1
    `, [cleanedId, cleanedId, cleanedId, `%${cleanedId}%`, cleanedId, cleanedId]);

    if (rows && rows.length > 0) {
      return rows[0];
    }
  } catch (err) {
    console.warn('[resolveLead Fallback Notice]:', err.message);
  }
  return null;
}

async function createEmandateLink(req, res) {
  const { applicationId, leadId, id, maxAmount, bankName, accountNumber, ifscCode } = req.body || {};
  const targetId = applicationId || leadId || id || req.params?.id;

  if (!targetId) {
    return res.status(400).json({
      success: false,
      message: 'Application ID or Lead ID is required.',
    });
  }

  const lead = await resolveLead(targetId);
  if (!lead) {
    return res.status(404).json({
      success: false,
      message: 'Application record not found.',
    });
  }

  // Update bank details if credit manager modified them in eMandate modal
  if (bankName !== undefined || accountNumber !== undefined || ifscCode !== undefined) {
    await query(`
      UPDATE loan_applications
      SET bank_name = COALESCE(NULLIF(?, ''), bank_name),
          account_number = COALESCE(NULLIF(?, ''), account_number),
          ifsc_code = COALESCE(NULLIF(?, ''), ifsc_code)
      WHERE id = ? OR application_id = ?
    `, [
      String(bankName || '').trim(),
      String(accountNumber || '').trim(),
      String(ifscCode || '').trim().toUpperCase(),
      lead.rawId,
      lead.id,
    ]);
  }

  const customerName = String(lead.name || lead.fullName || 'Applicant').trim();
  const customerEmail = String(lead.officeEmail || lead.officialEmail || lead.email || 'customer@example.com').trim();
  const rawMobile = lead.mobile || lead.phone || lead.mobileNumber || lead.contact || req.body?.mobile || '';
  const customerMobile = String(rawMobile).replace(/\D/g, '').slice(-10);
  const rawMaxAmount = Number(maxAmount || lead.approvedAmount || lead.loanAmount || 50000);

  if (isNaN(rawMaxAmount) || rawMaxAmount < 5 || rawMaxAmount > 100000) {
    return res.status(400).json({
      success: false,
      message: 'Invalid eMandate limit amount. Must be between ₹5 and ₹1,00,000.',
    });
  }
  const mandateMaxAmount = Math.round(rawMaxAmount);

  if (!customerMobile || customerMobile.length < 10) {
    return res.status(400).json({
      success: false,
      message: `Applicant must have a valid 10-digit mobile number for Cashfree eMandate. (Found: '${rawMobile}')`,
    });
  }

  try {
    let subscriptionId = `cf_sub_${Date.now()}`;
    const requestHost = `${req.protocol}://${req.get('host')}`;
    const baseUrl = process.env.PUBLIC_APP_URL || requestHost || 'https://payday.waqtmoney.com';
    let authUrl = `${baseUrl}/emandate/pay/${encodeURIComponent(lead.id)}?provider=cashfree`;

    // Cashfree Subscriptions API for true eNACH / AutoPay
    try {
      const bankAccount = String(lead.accountNumber || '').trim();
      const bankIfsc = String(lead.ifscCode || '').trim().toUpperCase();
      const isValidIfsc = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankIfsc);
      const bankCode = isValidIfsc ? bankIfsc.slice(0, 4) : 'HDFC';

      if (!isValidIfsc || !bankAccount) {
        return res.status(400).json({
          success: false,
          message: `Valid 11-character Bank IFSC Code (e.g. HDFC0000123) and Account Number are required to lock Cashfree eMandate. (Found IFSC: '${bankIfsc}', Acc: '${bankAccount}')`,
        });
      }

      const subPayload = {
        subscription_id: `sub_${lead.id}_${Date.now()}`,
        customer_details: {
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerMobile || '9999999999',
          ...(isValidIfsc && bankAccount ? { customer_bank_account_number: bankAccount } : {}),
          ...(isValidIfsc ? { customer_bank_ifsc: bankIfsc } : {}),
          ...(isValidIfsc && bankCode ? { customer_bank_code: bankCode } : {}),
          customer_bank_account_type: 'SAVINGS',
        },
        plan_details: {
          plan_name: `eMandate On Demand Plan ${mandateMaxAmount}`,
          plan_type: 'ON_DEMAND',
          plan_max_amount: mandateMaxAmount,
          plan_currency: 'INR',
          plan_note: `eMandate Auto-Debit Authorization for ${lead.id}`,
        },
        authorization_details: {
          authorization_amount: 1,
          authorization_amount_refund: true,
          payment_methods: ['enach', 'upi', 'card'],
          ...(isValidIfsc && bankAccount ? {
            payment_method: {
              enach: {
                channel: 'link',
                account_number: bankAccount,
                account_ifsc: bankIfsc,
                account_holder_name: customerName,
              },
            },
          } : {}),
        },
        subscription_meta: {
          return_url: `${baseUrl}/emandate/pay/${encodeURIComponent(lead.id)}?provider=cashfree`,
          notification_channel: ['EMAIL', 'SMS'],
        },
      };

      const cfSubRes = await cashfreeRequest('POST', '/pg/subscriptions', subPayload);
      if (cfSubRes && (cfSubRes.subscription_session_id || cfSubRes.subscription_id)) {
        subscriptionId = cfSubRes.subscription_id || subscriptionId;
        if (cfSubRes.auth_url || cfSubRes.subscription_meta?.payment_url) {
          authUrl = cfSubRes.auth_url || cfSubRes.subscription_meta.payment_url;
        }
      }
    } catch (cfErr) {
      console.error('[Cashfree Subscriptions Error]:', cfErr.message);
      return res.status(400).json({
        success: false,
        message: `Cashfree Subscriptions Error: ${cfErr.message}`,
      });
    }

    // Update DB
    const updatedLead = await leadModel.updateEmandateStatus(lead.id, {
      status: 'PENDING',
      provider: 'cashfree',
      mandateId: subscriptionId,
      authUrl,
      maxAmount: mandateMaxAmount,
    });

    // Log transaction
    await query(
      `INSERT INTO razorpay_emandates (
        application_id, razorpay_customer_id, razorpay_subscription_id, razorpay_order_id,
        status, auth_url, bank_name, max_amount, created_at
      ) VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
      [
        lead.id,
        `cf_cust_${lead.rawId}`,
        subscriptionId,
        subscriptionId,
        authUrl,
        lead.bankName || 'Cashfree Bank',
        mandateMaxAmount,
        new Date().toISOString().slice(0, 19).replace('T', ' '),
      ]
    );

    // Send Notification via WhatsApp & Email
    const notificationMsg = `Hello ${customerName}, please complete your Repayment Auto-Debit (eMandate) via Cashfree for your Waqt Finance loan application (${lead.id}). Click link: ${authUrl}`;

    try {
      if (typeof authkeyWhatsAppService.sendEmandateLink === 'function') {
        authkeyWhatsAppService.sendEmandateLink({ customerName, phone: customerMobile, authUrl }).catch(() => {});
      } else if (typeof authkeyWhatsAppService.sendMessage === 'function') {
        authkeyWhatsAppService.sendMessage({ phone: customerMobile, message: notificationMsg, templateId: '35028' }).catch(() => {});
      }
    } catch (waErr) {
      console.warn('[Cashfree eMandate] WhatsApp dispatch error:', waErr.message);
    }

    // Cashfree automatically dispatches official email via notification_channel: ['EMAIL', 'SMS']
    // Duplicate CRM email disabled to prevent multiple emails to customer

    await auditModel.create(req, {
      action: 'CASHFREE_EMANDATE_CREATED',
      lead,
      applicationId: lead.id,
      leadId: lead.rawId,
      entityType: 'Cashfree_eMandate',
      entityId: subscriptionId,
      metadata: {
        subscriptionId,
        authUrl,
        maxAmount: mandateMaxAmount,
        provider: 'cashfree',
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Cashfree eMandate link generated and dispatched successfully.',
      emandateProvider: 'cashfree',
      emandateStatus: 'PENDING',
      emandateId: subscriptionId,
      emandateAuthUrl: authUrl,
      emandateMaxAmount: mandateMaxAmount,
      lead: updatedLead,
    });
  } catch (error) {
    console.error('[Cashfree eMandate Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: `Failed to create Cashfree eMandate link: ${error.message}`,
    });
  }
}

function resolveCashfreeStatus(cfSubDetails) {
  if (!cfSubDetails) return 'PENDING';

  // 1. Extract subscription status strictly from subscription-specific fields (never generic API 'status')
  const subObj = cfSubDetails.subscription || cfSubDetails.data?.subscription || cfSubDetails.data || cfSubDetails;

  const rawCfStatus = String(
    subObj.subscription_status ||
    subObj.sub_status ||
    (cfSubDetails.subscription_status ? cfSubDetails.subscription_status : '') ||
    ''
  ).trim().toUpperCase();

  const activeAuth = cfSubDetails.authorisation_details || cfSubDetails.authorization_details || subObj.authorisation_details || subObj.authorization_details || {};

  const authStatus = String(
    activeAuth.auth_status ||
    activeAuth.authorisation_status ||
    activeAuth.status ||
    ''
  ).trim().toUpperCase();

  console.log(`[resolveCashfreeStatus] Evaluating subStatus='${rawCfStatus}', authStatus='${authStatus}'`);

  // 2. Explicit failure / rejected check
  if (
    ['FAILED', 'REJECTED', 'FAILURE', 'ERROR', 'CANCELLED_BY_USER', 'DECLINED'].includes(authStatus) ||
    ['FAILED', 'REJECTED', 'FAILURE', 'DECLINED'].includes(rawCfStatus)
  ) {
    return 'REJECTED';
  }

  // 3. Explicit cancelled / terminated / revoked check
  if (
    ['CANCELLED', 'CANCELED', 'REVOKED', 'TERMINATED', 'CANCEL'].includes(rawCfStatus) ||
    ['CANCELLED', 'CANCELED', 'REVOKED', 'TERMINATED', 'CANCEL'].includes(authStatus)
  ) {
    return 'CANCELLED';
  }

  // 4. Explicit expired check
  if (rawCfStatus === 'EXPIRED' || authStatus === 'EXPIRED') {
    return 'EXPIRED';
  }

  // 5. Explicit bank approval pending check
  if (
    ['BANK_APPROVAL_PENDING', 'PENDING_BANK_APPROVAL', 'BANK_PENDING', 'APPROVAL_PENDING'].includes(rawCfStatus) ||
    ['BANK_APPROVAL_PENDING', 'PENDING_BANK_APPROVAL', 'BANK_PENDING', 'APPROVAL_PENDING'].includes(authStatus)
  ) {
    return 'BANK_APPROVAL_PENDING';
  }

  // 6. Explicit initialized / pending check
  if (
    ['INITIALIZED', 'INITIALISED', 'CREATED', 'LINK_SENT', 'PENDING'].includes(rawCfStatus) ||
    ['INITIALIZED', 'INITIALISED', 'CREATED', 'LINK_SENT', 'PENDING'].includes(authStatus) ||
    (!rawCfStatus && !authStatus)
  ) {
    // If subscription is initialized/created or auth is pending, it CANNOT be ACTIVE
    if (!['ACTIVE', 'COMPLETED', 'REGISTERED'].includes(rawCfStatus)) {
      return 'INITIALIZED';
    }
  }

  // 7. Explicit ACTIVE / COMPLETED check (ONLY if subscription_status is strictly ACTIVE/COMPLETED/REGISTERED AND authStatus is NOT failed/pending)
  if (
    ['ACTIVE', 'COMPLETED', 'REGISTERED'].includes(rawCfStatus) &&
    (['SUCCESS', 'SUCCESSFUL', 'ACTIVE', 'COMPLETED', ''].includes(authStatus))
  ) {
    return 'ACTIVE';
  }

  // Default fallback if not strictly ACTIVE
  return 'INITIALIZED';
}

async function getPublicCashfreeDetails(req, res) {
  const targetId = req.params.id || req.query.id;
  if (!targetId) {
    return res.status(400).json({ success: false, message: 'Application ID is required' });
  }

  const lead = await resolveLead(targetId);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Application record not found' });
  }

  const { appId, env } = getCashfreeConfig();
  const customerMobileRaw = lead.mobile || lead.phone || lead.mobileNumber || '';
  const customerMobile = String(customerMobileRaw).replace(/\D/g, '').slice(-10);

  const loanAmount = Number(lead.approvedAmount || lead.loanAmount || 0);
  const mandateMaxAmount = Number(lead.emandateMaxAmount || lead.approvedAmount || lead.loanAmount || 50000);

  let currentStatus = lead.emandateStatus || 'PENDING';
  let subscriptionId = lead.mandateId || lead.emandateId || '';
  let subscriptionSessionId = '';
  let authUrl = lead.emandateAuthUrl || '';

  // If a subscription ID exists, check live status from Cashfree first
  if (subscriptionId) {
    try {
      const liveSub = await cashfreeRequest('GET', `/pg/subscriptions/${encodeURIComponent(subscriptionId)}`).catch(() => null);
      if (liveSub) {
        currentStatus = resolveCashfreeStatus(liveSub);
        subscriptionSessionId = liveSub.subscription_session_id || liveSub.subscriptionSessionId || liveSub.data?.subscription_session_id || '';
        if (liveSub.auth_url || liveSub.subscription_meta?.payment_url) {
          authUrl = liveSub.auth_url || liveSub.subscription_meta.payment_url;
        }

        const { bankName: registeredBank, paymentMode: detectedPaymentMode, upiId: detectedUpiId, accountNumber: detectedAccNum, refId: detectedRefId, planName: detectedPlanName } = extractCashfreeBankAndMode(liveSub);

        await leadModel.updateEmandateStatus(lead.id, {
          status: currentStatus,
          provider: 'cashfree',
          mandateId: subscriptionId,
          refId: detectedRefId,
          planName: detectedPlanName,
          bankName: registeredBank,
          paymentMode: detectedPaymentMode,
          upiId: detectedUpiId,
          accountNumber: detectedAccNum,
          registeredAt: currentStatus === 'ACTIVE' ? new Date() : undefined,
        });
      }
    } catch (checkErr) {
      console.warn('[getPublicCashfreeDetails Live Status Warning]:', checkErr.message);
    }
  }

  // If we don't have an active subscription session ID yet, generate a new subscription session
  if (currentStatus !== 'ACTIVE' && !subscriptionSessionId) {
    try {
      const requestHost = `${req.protocol}://${req.get('host')}`;
      const baseUrl = process.env.PUBLIC_APP_URL || requestHost || 'https://payday.waqtmoney.com';
      const customerName = String(lead.name || lead.fullName || 'Applicant').trim();
      const customerEmail = String(lead.officeEmail || lead.officialEmail || lead.email || 'customer@example.com').trim();
      
      const bankAccount = String(lead.accountNumber || '').trim();
      const bankIfsc = String(lead.ifscCode || '').trim().toUpperCase();
      const isValidIfsc = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankIfsc);
      const bankCode = isValidIfsc ? bankIfsc.slice(0, 4) : '';

      // Always use a unique subscription ID if creating a fresh subscription
      const newSubId = `sub_${lead.id}_${Date.now()}`;

      const subPayload = {
        subscription_id: newSubId,
        customer_details: {
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerMobile || '9999999999',
          ...(isValidIfsc && bankAccount ? { customer_bank_account_number: bankAccount } : {}),
          ...(isValidIfsc ? { customer_bank_ifsc: bankIfsc } : {}),
          ...(isValidIfsc && bankCode ? { customer_bank_code: bankCode } : {}),
          customer_bank_account_type: 'SAVINGS',
        },
        plan_details: {
          plan_name: `eMandate On Demand Plan ${mandateMaxAmount}`,
          plan_type: 'ON_DEMAND',
          plan_max_amount: mandateMaxAmount,
          plan_currency: 'INR',
          plan_note: `eMandate Auto-Debit Authorization for ${lead.id}`,
        },
        authorization_details: {
          authorization_amount: 1,
          authorization_amount_refund: true,
          payment_methods: ['enach', 'upi', 'card'],
          ...(isValidIfsc && bankAccount ? {
            payment_method: {
              enach: {
                channel: 'link',
                account_number: bankAccount,
                account_ifsc: bankIfsc,
                account_holder_name: customerName,
              },
            },
          } : {}),
        },
        subscription_meta: {
          return_url: `${baseUrl}/emandate/pay/${encodeURIComponent(lead.id)}?provider=cashfree`,
          notification_channel: ['EMAIL', 'SMS'],
        },
      };

      const cfRes = await cashfreeRequest('POST', '/pg/subscriptions', subPayload).catch((err) => {
        console.warn('[Cashfree Create Sub Session Warning]:', err.message);
        return null;
      });

      console.log(`[getPublicCashfreeDetails] POST /pg/subscriptions response for ${lead.id}:`, JSON.stringify(cfRes));

      if (cfRes && (cfRes.subscription_session_id || cfRes.subscription_id)) {
        subscriptionSessionId = cfRes.subscription_session_id || '';
        if (cfRes.auth_url || cfRes.subscription_meta?.payment_url) {
          authUrl = cfRes.auth_url || cfRes.subscription_meta.payment_url;
        }
        subscriptionId = cfRes.subscription_id || newSubId;

        await leadModel.updateEmandateStatus(lead.id, {
          status: 'PENDING',
          provider: 'cashfree',
          mandateId: subscriptionId,
          authUrl: authUrl || undefined,
        });
      }
    } catch (err) {
      console.warn('[Cashfree Subscription Session Error]:', err.message);
    }
  }

  return res.status(200).json({
    success: true,
    provider: 'cashfree',
    appId,
    env,
    applicationId: lead.id,
    customerName: String(lead.name || lead.fullName || 'Applicant').trim(),
    customerEmail: String(lead.officeEmail || lead.officialEmail || lead.email || 'customer@example.com').trim(),
    customerMobile,
    amount: 0,
    loanAmount,
    mandateMaxAmount,
    bankName: lead.bankName || 'N/A',
    accountNumber: lead.accountNumber ? `(*****${String(lead.accountNumber).slice(-4)})` : 'N/A',
    ifscCode: lead.ifscCode || 'N/A',
    authUrl,
    emandateAuthUrl: authUrl,
    subscriptionSessionId,
    paymentSessionId: subscriptionSessionId,
    status: currentStatus,
  });
}

function extractCashfreeBankAndMode(cfSubDetails = {}) {
  const activeAuth = cfSubDetails.authorisation_details || cfSubDetails.authorization_details || {};
  const activeMethod = activeAuth.payment_method || {};
  const activeEnach = activeMethod.enach || {};
  const activeUpi = activeMethod.upi || {};
  const activeCard = activeMethod.card || {};

  let bankName = '';
  let paymentMode = 'UPI AutoPay';
  
  let upiId = String(
    activeUpi.vpa ||
    activeAuth.vpa ||
    activeAuth.upi_id ||
    activeAuth.vpa_id ||
    activeMethod.vpa ||
    activeMethod.upi_id ||
    (typeof activeMethod === 'string' && activeMethod.includes('@') ? activeMethod : '') ||
    (typeof activeAuth.payment_method_id === 'string' && activeAuth.payment_method_id.includes('@') ? activeAuth.payment_method_id : '') ||
    cfSubDetails.vpa ||
    cfSubDetails.payment_method?.upi?.vpa ||
    cfSubDetails.customer_details?.vpa ||
    ''
  ).trim();

  let accountNumber = String(
    activeEnach.account_number ||
    activeUpi.account_number ||
    activeCard.account_number ||
    activeAuth.customer_bank_account_number ||
    cfSubDetails.customer_details?.customer_bank_account_number ||
    ''
  ).trim();

  const refId = String(
    cfSubDetails.cf_subscription_id ||
    cfSubDetails.reference_id ||
    cfSubDetails.subscription_reference_id ||
    ''
  ).trim();

  const planName = String(
    cfSubDetails.plan_details?.plan_name ||
    cfSubDetails.plan_name ||
    ''
  ).trim();

  const rawPaymentMethod = String(cfSubDetails.payment_method || activeAuth.authorization_mode || activeAuth.mode || '').toLowerCase();

  if (activeEnach.channel || activeAuth.mode === 'ENACH' || activeMethod.mode === 'ENACH' || rawPaymentMethod.includes('enach')) {
    paymentMode = `eNACH ${activeEnach.channel ? `(${activeEnach.channel})` : 'AutoPay'}`.trim();
    bankName = cfSubDetails.bank_name || activeEnach.account_bank_code || '';
    upiId = '';
  } else if (activeCard.card_number || activeAuth.mode === 'CARD' || rawPaymentMethod.includes('card')) {
    paymentMode = 'Debit Card AutoPay';
    bankName = activeCard.card_bank_name || cfSubDetails.bank_name || activeCard.card_network || '';
    upiId = '';
  } else {
    paymentMode = 'UPI AutoPay';
    bankName = activeUpi.account_bank_code || cfSubDetails.bank_name || '';
    accountNumber = '';
  }

  return { bankName, paymentMode, upiId, accountNumber, refId, planName };
}

async function handleCashfreeWebhook(req, res) {
  try {
    const signature = String(req.headers['x-webhook-signature'] || req.headers['x-cashfree-signature'] || '').trim();
    const timestamp = String(req.headers['x-webhook-timestamp'] || req.headers['x-cashfree-timestamp'] || '').trim();
    const { webhookSecret } = getCashfreeConfig();

    if (webhookSecret && signature) {
      if (timestamp) {
        const numericTimestamp = Number(timestamp);
        if (Number.isFinite(numericTimestamp)) {
          const timestampMs = timestamp.length <= 10 ? numericTimestamp * 1000 : numericTimestamp;
          if (Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
            console.warn('[Cashfree Webhook Security] Rejected: Timestamp window expired');
            return res.status(400).json({ status: 'ERROR', message: 'Webhook timestamp window expired' });
          }
        }
      }

      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(timestamp ? timestamp + rawBody : rawBody)
        .digest('base64');

      const expectedHex = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const isValid = signature === expectedSignature || signature === expectedHex;
      if (!isValid) {
        console.warn('[Cashfree Webhook Security] Rejected: Invalid HMAC Signature');
        return res.status(401).json({ status: 'ERROR', message: 'Invalid Cashfree Webhook Signature' });
      }
    }

    const payload = req.body || {};
    const event = payload.type || payload.event || '';
    const data = payload.data || {};
    const subOrOrder = data.subscription || data.order || {};
    const subId = subOrOrder.subscription_id || subOrOrder.order_id || data.subscription_id;

    const authDetails = subOrOrder.authorisation_details || data.authorisation_details || {};
    const paymentMethod = authDetails.payment_method || {};
    const enachMethod = paymentMethod.enach || {};
    const upiMethod = paymentMethod.upi || {};
    const cardMethod = paymentMethod.card || {};

    const authorizedAccNum = String(
      enachMethod.account_number ||
      upiMethod.account_number ||
      cardMethod.account_number ||
      authDetails.customer_bank_account_number ||
      data.customer_details?.customer_bank_account_number ||
      ''
    ).trim();

    const authorizedPhone = String(
      data.customer_details?.customer_phone ||
      subOrOrder.customer_details?.customer_phone ||
      ''
    ).replace(/\D/g, '').slice(-10);

    console.log(`[Cashfree Webhook] Received event: ${event} for subId: ${subId}`);

    if (subId) {
      const cfSubDetails = await cashfreeRequest('GET', `/pg/subscriptions/${encodeURIComponent(subId)}`).catch(() => null);
      const activeDetails = cfSubDetails || subOrOrder;

      const rows = await query(`
        SELECT application_id AS id, id AS rawId, mobile, phone, account_number AS accountNumber, bank_name AS bankName, emandate_status AS emandateStatus
        FROM loan_applications
        WHERE emandate_id = ? OR application_id = ? OR CAST(id AS CHAR) = ? OR emandate_id LIKE ?
        LIMIT 1
      `, [subId, subId, subId, `%${subId}%`]);

      if (rows && rows.length > 0) {
        const lead = rows[0];
        const expectedAccNum = String(lead.accountNumber || '').trim();
        const expectedPhone = String(lead.mobile || lead.phone || '').replace(/\D/g, '').slice(-10);

        let isMismatch = false;
        let mismatchReason = '';

        if (authorizedAccNum && expectedAccNum && !authorizedAccNum.endsWith(expectedAccNum.slice(-4)) && expectedAccNum !== authorizedAccNum) {
          isMismatch = true;
          mismatchReason = `Bank Account Mismatch: Authorized account (****${authorizedAccNum.slice(-4)}) does not match loan application account (****${expectedAccNum.slice(-4)})`;
        } else if (authorizedPhone && expectedPhone && authorizedPhone !== expectedPhone) {
          isMismatch = true;
          mismatchReason = `Mobile Number Mismatch: Authorized mobile (${authorizedPhone}) does not match applicant mobile (${expectedPhone})`;
        }

        if (isMismatch) {
          console.warn(`[Cashfree Webhook Security] Alert: ${mismatchReason} for lead ${lead.id}`);
          await cashfreeRequest('POST', `/pg/subscriptions/${encodeURIComponent(subId)}/manage`, { action: 'CANCEL' }).catch(() => null);

          await leadModel.updateEmandateStatus(lead.id, {
            status: 'REJECTED',
            provider: 'cashfree',
            rejectionReason: mismatchReason,
          });
        } else {
          const updatedStatus = resolveCashfreeStatus(activeDetails);
          const { bankName: cfBankName, paymentMode: cfPaymentMode, upiId: cfUpiId, accountNumber: cfAccNum, refId: cfRefId, planName: cfPlanName } = extractCashfreeBankAndMode(activeDetails);
          await leadModel.updateEmandateStatus(lead.id, {
            status: updatedStatus,
            provider: 'cashfree',
            mandateId: subId,
            refId: cfRefId,
            planName: cfPlanName,
            bankName: cfBankName,
            paymentMode: cfPaymentMode,
            upiId: cfUpiId,
            accountNumber: cfAccNum,
            registeredAt: updatedStatus === 'ACTIVE' ? new Date() : undefined,
          });
        }
      }
    }

    return res.status(200).json({ status: 'OK' });
  } catch (err) {
    console.error('[Cashfree Webhook Error]:', err.message);
    return res.status(200).json({ status: 'ERROR', message: err.message });
  }
}

async function checkCashfreeEmandateStatus(req, res) {
  try {
    const targetId = req.params.id || req.query.id;
    const lead = await resolveLead(targetId);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Application record not found' });
    }

    let subId = lead.mandateId || lead.emandateId;
    if (!subId) {
      const dbRows = await query(
        `SELECT emandate_id FROM loan_applications WHERE application_id = ? OR id = ? OR emandate_id LIKE ? LIMIT 1`,
        [lead.id, lead.rawId || lead.id, `%${lead.id}%`]
      ).catch(() => []);
      if (dbRows && dbRows.length > 0 && dbRows[0].emandate_id) {
        subId = dbRows[0].emandate_id;
      }
    }
    if (!subId) {
      const rzpRows = await query(
        `SELECT razorpay_subscription_id FROM razorpay_emandates WHERE application_id = ? ORDER BY id DESC LIMIT 1`,
        [lead.id]
      ).catch(() => []);
      if (rzpRows && rzpRows.length > 0 && rzpRows[0].razorpay_subscription_id) {
        subId = rzpRows[0].razorpay_subscription_id;
      }
    }
    if (!subId) subId = `sub_${lead.id}`;

    console.log(`[Cashfree Check Status] Checking live Cashfree API for subId: '${subId}' (Lead: ${lead.id})`);
    let cfSubDetails = await cashfreeRequest('GET', `/pg/subscriptions/${encodeURIComponent(subId)}`).catch(() => null);

    if (!cfSubDetails && !subId.startsWith('sub_')) {
      cfSubDetails = await cashfreeRequest('GET', `/pg/subscriptions/${encodeURIComponent(`sub_${subId}`)}`).catch(() => null);
    }

    if (cfSubDetails) {
      const activeAuth = cfSubDetails.authorisation_details || cfSubDetails.authorization_details || {};
      const activeMethod = activeAuth.payment_method || {};
      const activeEnach = activeMethod.enach || {};
      const activeUpi = activeMethod.upi || {};
      const activeCard = activeMethod.card || {};

      const finalAccNum = String(
        activeEnach.account_number ||
        activeUpi.account_number ||
        activeCard.account_number ||
        activeAuth.customer_bank_account_number ||
        cfSubDetails.customer_details?.customer_bank_account_number ||
        ''
      ).trim();

      const finalPhone = String(
        cfSubDetails.customer_details?.customer_phone || ''
      ).replace(/\D/g, '').slice(-10);

      const expectedAccNum = String(lead.accountNumber || '').trim();
      const expectedPhone = String(lead.mobile || lead.phone || '').replace(/\D/g, '').slice(-10);

      let isMismatch = false;
      let mismatchReason = '';

      if (finalAccNum && expectedAccNum && !finalAccNum.endsWith(expectedAccNum.slice(-4)) && expectedAccNum !== finalAccNum) {
        isMismatch = true;
        mismatchReason = `Bank Account Mismatch: Authorized account (****${finalAccNum.slice(-4)}) does not match loan application account (****${expectedAccNum.slice(-4)})`;
      } else if (finalPhone && expectedPhone && finalPhone !== expectedPhone) {
        isMismatch = true;
        mismatchReason = `Mobile Number Mismatch: Authorized mobile (${finalPhone}) does not match applicant (${expectedPhone})`;
      }

      if (isMismatch) {
        await cashfreeRequest('POST', `/pg/subscriptions/${encodeURIComponent(subId)}/manage`, { action: 'CANCEL' }).catch(() => null);

        await leadModel.updateEmandateStatus(lead.id, {
          status: 'REJECTED',
          provider: 'cashfree',
          rejectionReason: mismatchReason,
        });

        return res.status(200).json({
          success: true,
          status: 'REJECTED',
          emandateStatus: 'REJECTED',
          reason: mismatchReason,
          message: 'AutoPay rejected and cancelled due to account mismatch.',
        });
      } else {
        const updatedStatus = resolveCashfreeStatus(cfSubDetails);

        const { bankName: registeredBank, paymentMode: detectedPaymentMode, upiId: detectedUpiId, accountNumber: detectedAccNum, refId: detectedRefId, planName: detectedPlanName } = extractCashfreeBankAndMode(cfSubDetails);
        const registeredAtDate = new Date();

        await leadModel.updateEmandateStatus(lead.id, {
          status: updatedStatus,
          provider: 'cashfree',
          mandateId: subId,
          refId: detectedRefId,
          planName: detectedPlanName,
          bankName: registeredBank,
          paymentMode: detectedPaymentMode,
          upiId: detectedUpiId,
          accountNumber: detectedAccNum,
          registeredAt: updatedStatus === 'ACTIVE' ? registeredAtDate : undefined,
        });

        return res.status(200).json({
          success: true,
          status: updatedStatus,
          emandateStatus: updatedStatus,
          emandateId: subId,
          emandateRefId: detectedRefId || subId,
          emandatePlanName: detectedPlanName,
          emandateBankName: registeredBank,
          emandatePaymentMode: detectedPaymentMode,
          emandateUpiId: detectedUpiId,
          emandateAccountNumber: detectedAccNum,
          emandateMaxAmount: lead.emandateMaxAmount || lead.approvedAmount || lead.loanAmount || 0,
          emandateRegisteredAt: registeredAtDate.toISOString(),
          isVerified: updatedStatus === 'ACTIVE',
          message: `eMandate status is ${updatedStatus}.`,
          lead: {
            ...lead,
            emandateStatus: updatedStatus,
            emandateId: subId,
            emandateRefId: detectedRefId || subId,
            emandatePlanName: detectedPlanName,
            emandateBankName: registeredBank,
            emandatePaymentMode: detectedPaymentMode,
            emandateUpiId: detectedUpiId,
            emandateAccountNumber: detectedAccNum,
          },
        });
      }
    }

    return res.status(200).json({
      success: true,
      status: lead.emandateStatus || 'PENDING',
      emandateStatus: lead.emandateStatus || 'PENDING',
      emandateId: subId || lead.mandateId || lead.emandateId || '',
      emandateRefId: lead.emandateRefId || subId || '',
      emandatePlanName: lead.emandatePlanName || '',
      emandateBankName: lead.emandateBankName || '',
      emandatePaymentMode: lead.emandatePaymentMode || 'UPI',
      emandateUpiId: lead.emandateUpiId || '',
      emandateAccountNumber: lead.emandateAccountNumber || '',
      emandateMaxAmount: lead.emandateMaxAmount || lead.approvedAmount || lead.loanAmount || 0,
      emandateRegisteredAt: lead.emandateRegisteredAt || '',
      isVerified: lead.emandateStatus === 'ACTIVE',
      lead,
    });
  } catch (err) {
    console.error('[checkCashfreeEmandateStatus Error]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  createEmandateLink,
  getPublicCashfreeDetails,
  handleCashfreeWebhook,
  checkCashfreeEmandateStatus,
};
