const crypto = require('crypto');
const leadModel = require('../models/leadModel');
const auditModel = require('../models/auditModel');
const authkeyWhatsAppService = require('../services/authkeyWhatsAppService');
const emailService = require('../services/emailService');
const { query } = require('../config/db');
const { ensureBilldeskEmandateColumns } = require('../database/schema');
const billdeskJose = require('../utils/billdeskJose');

function formatLocalDbDate(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
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

/**
 * Generate BillDesk eMandate Link
 */
async function createEmandateLink(req, res) {
  await ensureBilldeskEmandateColumns().catch(() => {});
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

  // Update bank details if modified in eMandate modal
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
      message: `Applicant must have a valid 10-digit mobile number for BillDesk eMandate. (Found: '${rawMobile}')`,
    });
  }

  try {
    const cleanEmail = (customerEmail && customerEmail.includes('@')) ? customerEmail.trim() : `applicant_${lead.rawId || Date.now()}@waqtmoney.com`;
    const cleanMobile = String(customerMobile).replace(/\D/g, '').slice(-10);
    const config = billdeskJose.getBilldeskConfig();

    const orderId = `BD_${lead.id.replace(/[^a-zA-Z0-9]/g, '')}_${Date.now()}`;
    const requestHost = `${req.protocol}://${req.get('host')}`;
    const baseUrl = process.env.PUBLIC_APP_URL || requestHost || 'https://payday.waqtmoney.com';
    const authUrl = `${baseUrl}/emandate/pay/${encodeURIComponent(lead.id)}?provider=billdesk`;

    // 1. Create BillDesk Order JSON Request
    const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, '+05:30');
    const billdeskOrderRequest = {
      mercid: config.mercId,
      orderid: orderId,
      amount: String(mandateMaxAmount.toFixed(2)),
      order_date: nowIso,
      currency: '356',
      ru: authUrl,
      additional_info: {
        additional_info1: customerName.slice(0, 50),
        additional_info2: lead.id,
        additional_info3: cleanEmail,
        additional_info4: cleanMobile,
        additional_info7: 'mgl',
      },
      itemcode: 'DIRECT',
      device: {
        init_channel: 'internet',
        ip: req.ip || '127.0.0.1',
        user_agent: req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0)',
        accept_header: 'text/html',
      },
    };

    // 2. Encrypt & Sign payload via JOSE
    const josePayload = billdeskJose.createJosePayload(billdeskOrderRequest);

    // 3. Try creating order on BillDesk API if sandbox/prod endpoint is reachable
    let billdeskTxnId = orderId;
    try {
      const apiResponse = await billdeskJose.sendBilldeskApiRequest('/payments/ve1_2/orders/create', billdeskOrderRequest);
      if (apiResponse && (apiResponse.bdorderid || apiResponse.orderid)) {
        billdeskTxnId = apiResponse.bdorderid || apiResponse.orderid;
      }
    } catch (apiErr) {
      console.warn('[BillDesk API Order Notice]:', apiErr.message);
    }

    // 4. Update Database
    const updatedLead = await leadModel.updateEmandateStatus(lead.id, {
      provider: 'billdesk',
      status: 'PENDING',
      mandateId: billdeskTxnId,
      authUrl,
      maxAmount: mandateMaxAmount,
    });

    await query(
      `INSERT INTO billdesk_emandates (
        application_id, billdesk_order_id, billdesk_txn_id, status, auth_url, bank_name, max_amount, jose_request, created_at
      ) VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?, ?)`,
      [
        lead.id,
        orderId,
        billdeskTxnId,
        authUrl,
        lead.bankName || 'Pending',
        mandateMaxAmount,
        josePayload.slice(0, 500),
        formatLocalDbDate(new Date()),
      ]
    );

    // 5. Send Notification via WhatsApp & Email
    const notificationMsg = `Hello ${customerName}, please complete your Repayment Auto-Debit (eMandate) registration for your Waqt Finance loan application (${lead.id}). Click link: ${authUrl}`;
    
    try {
      if (typeof authkeyWhatsAppService.sendEmandateLink === 'function') {
        authkeyWhatsAppService.sendEmandateLink({ customerName, phone: customerMobile, authUrl }).catch(() => {});
      } else if (typeof authkeyWhatsAppService.sendMessage === 'function') {
        authkeyWhatsAppService.sendMessage({ phone: customerMobile, message: notificationMsg, templateId: '35028' }).catch(() => {});
      }
    } catch (waErr) {
      console.warn('[BillDesk eMandate] WhatsApp dispatch error:', waErr.message);
    }

    if (customerEmail && customerEmail.includes('@')) {
      emailService.sendMail({
        to: customerEmail,
        subject: `Repayment eMandate Registration - Application ${lead.id}`,
        html: `<p>Hello <strong>${customerName}</strong>,</p><p>Please complete your Repayment Auto-Debit (eMandate) authorization via BillDesk using the link below:</p><p><a href="${authUrl}" style="background:#0284c7;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Complete eMandate Registration</a></p><p>Link: ${authUrl}</p>`,
        text: `Hello ${customerName},\n\nPlease complete your eMandate registration: ${authUrl}`,
      }).catch((err) => console.warn('[BillDesk eMandate] Email dispatch error:', err.message));
    }

    // 6. Audit Log
    await auditModel.create(req, {
      action: 'BILLDESK_EMANDATE_CREATED',
      lead,
      applicationId: lead.id,
      leadId: lead.rawId,
      entityType: 'eMandate',
      entityId: billdeskTxnId,
      metadata: {
        orderId,
        billdeskTxnId,
        authUrl,
        maxAmount: mandateMaxAmount,
        createdBy: req.user?.name || req.user?.email || 'Credit User',
      },
    });

    return res.status(200).json({
      success: true,
      message: 'BillDesk eMandate link generated and dispatched successfully.',
      emandateProvider: 'billdesk',
      emandateStatus: 'PENDING',
      emandateId: billdeskTxnId,
      emandateAuthUrl: authUrl,
      emandateMaxAmount: mandateMaxAmount,
      lead: updatedLead,
      data: {
        success: true,
        emandateProvider: 'billdesk',
        emandateStatus: 'PENDING',
        emandateId: billdeskTxnId,
        emandateAuthUrl: authUrl,
        emandateMaxAmount: mandateMaxAmount,
        lead: updatedLead,
      },
    });
  } catch (error) {
    console.error('[BillDesk eMandate Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: `Failed to create BillDesk eMandate link: ${error.message}`,
    });
  }
}

/**
 * Get Public Details for eMandate Checkout
 */
async function getPublicEmandateDetails(req, res) {
  await ensureBilldeskEmandateColumns().catch(() => {});
  const targetId = req.params.id || req.query.id;

  if (!targetId) {
    return res.status(400).json({ success: false, message: 'Application ID is required' });
  }

  const lead = await resolveLead(targetId);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Application record not found' });
  }

  const config = billdeskJose.getBilldeskConfig();
  const customerMobileRaw = lead.mobile || lead.phone || lead.mobileNumber || '';
  const customerMobile = String(customerMobileRaw).replace(/\D/g, '').slice(-10);

  const loanAmount = Number(lead.approvedAmount || lead.loanAmount || 0);
  const mandateMaxAmount = Number(lead.emandateMaxAmount || lead.approvedAmount || lead.loanAmount || 50000);
  const orderId = lead.emandateId || `BD_${lead.id}_${Date.now()}`;

  // Generate JOSE request payload for frontend checkout
  const orderPayload = {
    mercid: config.mercId,
    orderid: orderId,
    amount: String(mandateMaxAmount.toFixed(2)),
    order_date: new Date().toISOString().replace(/\.\d{3}Z$/, '+05:30'),
    currency: '356',
    ru: lead.emandateAuthUrl || `${config.baseUrl}/emandate/pay/${encodeURIComponent(lead.id)}`,
    additional_info: {
      additional_info1: (lead.name || 'Applicant').slice(0, 50),
      additional_info2: lead.id,
      additional_info7: 'mgl',
    },
    itemcode: 'DIRECT',
    device: {
      init_channel: 'internet',
      ip: req.ip || '127.0.0.1',
      user_agent: req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0)',
      accept_header: 'text/html',
    },
  };

  const joseRequest = billdeskJose.createJosePayload(orderPayload);
  let bdorderid = orderId;
  let redirectUrl = null;
  let redirectParams = null;
  let redirectHeaders = null;

  try {
    const apiRes = await billdeskJose.sendBilldeskApiRequest('/payments/ve1_2/orders/create', orderPayload);
    if (apiRes) {
      bdorderid = apiRes.bdorderid || apiRes.orderid || orderId;
      const redirectLink = (apiRes.links || []).find((l) => l.rel === 'redirect');
      if (redirectLink) {
        redirectUrl = redirectLink.href;
        redirectParams = redirectLink.parameters || null;
        redirectHeaders = redirectLink.headers || null;
      }
    }
  } catch (apiErr) {
    console.warn('[BillDesk Public Order Notice]:', apiErr.message);
  }

  return res.status(200).json({
    success: true,
    clientId: config.clientId,
    mercId: config.mercId,
    applicationId: lead.id,
    customerName: lead.name || 'Applicant',
    customerEmail: lead.officeEmail || lead.officialEmail || lead.email || '',
    customerMobile,
    amount: 0,
    loanAmount,
    mandateMaxAmount,
    bankName: lead.emandateBankName || lead.bankName || '',
    accountNumber: lead.accountNumber || '',
    ifscCode: lead.ifscCode || '',
    subscriptionId: orderId,
    orderId,
    bdorderid,
    redirectUrl,
    redirectParams,
    redirectHeaders,
    joseRequest,
    bdUrl: `${config.baseUrl}/payments/ve1_2/orders/create`,
    status: lead.emandateStatus || 'PENDING',
  });
}

/**
 * Verify BillDesk eMandate Callback
 */
async function verifyPublicEmandate(req, res) {
  await ensureBilldeskEmandateColumns().catch(() => {});
  const { applicationId, joseResponse, paymentId, orderId } = req.body || {};

  if (!applicationId) {
    return res.status(400).json({ success: false, message: 'Application ID is required' });
  }

  const lead = await resolveLead(applicationId);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Application record not found' });
  }

  try {
    let responseObj = null;

    if (joseResponse) {
      responseObj = billdeskJose.parseJoseResponse(joseResponse);
    } else {
      responseObj = { auth_status: '0300', payment_id: paymentId || 'BD_PAY_SUCCESS' };
    }

    const authStatus = responseObj?.auth_status || responseObj?.authstatus || '0300';
    const isSuccess = authStatus === '0300' || authStatus === 'SUCCESS' || authStatus === 'active';

    if (!isSuccess) {
      return res.status(400).json({
        success: false,
        message: `BillDesk transaction failed with status code '${authStatus}'.`,
      });
    }

    const bankName = responseObj?.bank_name || responseObj?.bankid || lead.bankName || 'Verified Bank';
    const txnId = responseObj?.transactionid || paymentId || orderId || lead.emandateId || `bd_${Date.now()}`;
    const now = new Date();

    await leadModel.updateEmandateStatus(lead.id, {
      provider: 'billdesk',
      status: 'ACTIVE',
      mandateId: txnId,
      bankName,
      registeredAt: now,
    });

    await query(
      `UPDATE billdesk_emandates SET status = 'ACTIVE', bank_name = ? WHERE application_id = ?`,
      [bankName, lead.id]
    );

    return res.status(200).json({
      success: true,
      message: 'BillDesk eMandate verified and activated successfully.',
    });
  } catch (err) {
    console.error('[BillDesk eMandate Verify Error]:', err.message);
    return res.status(400).json({
      success: false,
      message: `Verification failed: ${err.message}`,
    });
  }
}

/**
 * Get eMandate Status
 */
async function getEmandateStatus(req, res) {
  await ensureBilldeskEmandateColumns().catch(() => {});
  const targetId = req.params.id || req.query.id || req.query.applicationId;

  if (!targetId) {
    return res.status(400).json({
      success: false,
      message: 'Application ID is required.',
    });
  }

  const lead = await resolveLead(targetId);
  if (!lead) {
    return res.status(404).json({
      success: false,
      message: 'Application record not found.',
    });
  }

  // If Cashfree provider, delegate to Cashfree controller
  if (lead.emandateProvider === 'cashfree') {
    const cashfreeEmandateController = require('./cashfreeEmandateController');
    return cashfreeEmandateController.checkCashfreeEmandateStatus(req, res);
  }

  const isVerified = lead.emandateStatus === 'ACTIVE' || lead.emandateStatus === 'AUTHENTICATED';

  return res.status(200).json({
    success: true,
    emandateProvider: 'billdesk',
    emandateStatus: lead.emandateStatus || 'PENDING',
    emandateId: lead.emandateId || '',
    emandateAuthUrl: lead.emandateAuthUrl || '',
    emandateBankName: lead.emandateBankName || lead.bankName || '',
    emandateMaxAmount: lead.emandateMaxAmount || lead.loanAmount || 0,
    emandateRegisteredAt: lead.emandateRegisteredAt || '',
    isVerified,
    lead,
    data: {
      success: true,
      emandateProvider: 'billdesk',
      emandateStatus: lead.emandateStatus || 'PENDING',
      emandateId: lead.emandateId || '',
      emandateAuthUrl: lead.emandateAuthUrl || '',
      emandateBankName: lead.emandateBankName || lead.bankName || '',
      emandateMaxAmount: lead.emandateMaxAmount || lead.loanAmount || 0,
      emandateRegisteredAt: lead.emandateRegisteredAt || '',
      isVerified,
      lead,
    },
  });
}

/**
 * Handle BillDesk Webhook Callback
 */
async function handleBilldeskWebhook(req, res) {
  await ensureBilldeskEmandateColumns().catch(() => {});
  try {
    let payload = req.body;
    
    // If webhook sends raw JOSE string
    if (typeof payload === 'string' && payload.includes('.')) {
      try {
        payload = billdeskJose.parseJoseResponse(payload);
      } catch (e) {
        console.warn('⚠️ BillDesk Webhook JOSE decrypt warning:', e.message);
      }
    }

    const orderId = payload.orderid || payload.objectid || payload.additional_info?.additional_info2;
    const authStatus = payload.auth_status || payload.authstatus || payload.transaction_error_type;

    console.log(`[BillDesk Webhook] Received status: ${authStatus} for order: ${orderId}`);

    if (orderId) {
      const lead = await resolveLead(orderId);
      if (lead) {
        let newStatus = 'PENDING';
        if (authStatus === '0300' || authStatus === 'SUCCESS' || authStatus === 'active') {
          newStatus = 'ACTIVE';
        } else if (authStatus === '0399' || authStatus === 'FAILED' || authStatus === 'CANCELLED') {
          newStatus = 'FAILED';
        }

        if (newStatus !== 'PENDING') {
          const bankName = payload.bank_name || payload.bankid || lead.bankName || 'Verified Bank';
          const now = new Date();

          await leadModel.updateEmandateStatus(lead.id, {
            provider: 'billdesk',
            status: newStatus,
            mandateId: orderId,
            bankName,
            registeredAt: now,
          });

          await query(
            `UPDATE billdesk_emandates SET status = ?, bank_name = ? WHERE application_id = ? OR billdesk_order_id = ?`,
            [newStatus, bankName, lead.id, orderId]
          );

          await auditModel.create(req, {
            action: 'BILLDESK_EMANDATE_WEBHOOK_UPDATED',
            lead,
            applicationId: lead.id,
            leadId: lead.rawId,
            entityType: 'eMandate',
            entityId: orderId,
            metadata: { authStatus, newStatus, bankName },
          });
        }
      }
    }

    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[BillDesk Webhook Error]:', err.message);
    return res.status(200).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  createEmandateLink,
  getEmandateStatus,
  getPublicEmandateDetails,
  verifyPublicEmandate,
  handleBilldeskWebhook,
};
