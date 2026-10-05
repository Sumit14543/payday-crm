const accountAggregatorModel = require('../models/accountAggregatorModel');
const activityModel = require('../models/activityModel');
const leadModel = require('../models/leadModel');
const crifService = require('../services/crifAccountAggregatorService');
const authkeyWhatsAppService = require('../services/authkeyWhatsAppService');
const emailService = require('../services/emailService');
const { notFound, requireFields, success } = require('../utils/http');

async function sendAaLinkToCustomer({ lead, redirectionUrl }) {
  const phone = lead.phone || lead.mobile;
  const targetEmail = lead.email || lead.officeEmail || lead.officialEmail;
  const customerName = lead.name || 'Customer';

  let waResult = { sent: false };
  let emailResult = { sent: false };

  if (phone) {
    try {
      const msgText = `Hello ${customerName}, please complete your bank account statement consent for Waqt Finance using this link: ${redirectionUrl}`;
      if (typeof authkeyWhatsAppService.sendCustomWhatsAppMessage === 'function') {
        waResult = await authkeyWhatsAppService.sendCustomWhatsAppMessage({ mobile: phone, message: msgText });
      } else if (typeof authkeyWhatsAppService.sendMessage === 'function') {
        waResult = await authkeyWhatsAppService.sendMessage({ phone: phone, message: msgText });
      }
      console.log('[AA Dispatch] WhatsApp result:', waResult);
    } catch (waErr) {
      console.error('[AA WhatsApp Send Error]', waErr.message);
    }
  }

  if (targetEmail) {
    try {
      emailResult = await emailService.sendMail({
        to: targetEmail,
        subject: `Action Required: Bank Statement Consent Link - Waqt Finance`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="color: #4f46e5; margin: 0; font-size: 22px;">Waqt Finance</h2>
              <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Bank Account Statement Consent Verification</p>
            </div>
            <p style="color: #334155; font-size: 15px; line-height: 1.6;">Dear <strong>${customerName}</strong>,</p>
            <p style="color: #334155; font-size: 14px; line-height: 1.6;">
              Please complete your bank account statement consent for your loan application using our RBI-regulated Account Aggregator service (CRIF / Finvu).
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${redirectionUrl}" target="_blank" style="background-color: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block; font-size: 15px;">
                Complete Bank Consent Now →
              </a>
            </div>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 24px;">
              <p style="font-size: 12px; color: #64748b; margin: 0; word-break: break-all;">
                Or copy and paste this link in your browser:<br/>
                <a href="${redirectionUrl}" style="color: #4f46e5;">${redirectionUrl}</a>
              </p>
            </div>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
              This is an automated email from Waqt Finance. Verified & secured via RBI Regulated Account Aggregator.
            </p>
          </div>
        `,
      });
      console.log('[AA Dispatch] Email sent successfully to:', targetEmail);
    } catch (emailErr) {
      console.error('[AA Email Send Error]', emailErr.message);
    }
  }

  return { waResult, emailResult };
}

async function generateUrl(req, res) {
  const leadId = req.params.id;
  const lead = await leadModel.findById(leadId);
  if (!lead) return notFound(res, 'Lead not found');

  const trackingId = `AA_TRK_${lead.rawId}_${Date.now()}`;
  const phone = lead.phone || lead.mobile;
  const pan = lead.panNumber || lead.pan;

  if (!phone) {
    const error = new Error('Mobile number is required to generate AA link.');
    error.statusCode = 400;
    throw error;
  }

  const result = await crifService.generateDigitalFlowUrl({
    phoneNumber: phone,
    pan: pan || '',
    trackingId,
    name: lead.name,
    leadId: lead.id,
  });

  // Clear previous test session and analytics for a fresh AA attempt
  await accountAggregatorModel.resetSession(lead.id, lead.rawId);

  await accountAggregatorModel.createSession({
    applicationId: lead.id,
    trackingId: result.trackingId,
    digitalFlowRequestId: result.digitalFlowRequestId,
    redirectionUrl: result.redirectionUrl,
    templateCode: req.body.templateCode || 'CT003',
  });

  await activityModel.createForLead(lead, {
    type: 'status',
    description: `Account Aggregator Digital Flow Link generated: ${result.redirectionUrl}`,
    user: req.user?.name || 'System',
    metadata: {
      trackingId: result.trackingId,
      digitalFlowRequestId: result.digitalFlowRequestId,
    },
  });

  // Automatically dispatch WhatsApp and Email notifications
  await sendAaLinkToCustomer({ lead, redirectionUrl: result.redirectionUrl });

  return success(res, {
    applicationId: lead.id,
    trackingId: result.trackingId,
    digitalFlowRequestId: result.digitalFlowRequestId,
    redirectionUrl: result.redirectionUrl,
    isMock: result.isMock || false,
  }, 'Account Aggregator digital flow link generated successfully.', 201);
}

function isUUID(str) {
  return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

async function getStatus(req, res) {
  const leadId = req.params.id;
  const lead = await leadModel.findById(leadId);
  if (!lead) return notFound(res, 'Lead not found');

  let session = await accountAggregatorModel.findLatestSessionByApplicationId(lead.id, lead.rawId);
  if (!session) {
    return success(res, {
      hasSession: false,
      status: 'NOT_INITIATED',
    });
  }

  let crifStatus = {};
  try {
    crifStatus = await crifService.getDigitalFlowStatus({
      trackingId: session.trackingId,
      digitalFlowRequestId: session.digitalFlowRequestId || session.digital_flow_request_id,
    });
  } catch (syncErr) {
    console.error('[AA Status Sync Error]', syncErr.message);
  }

  const consentObj = Array.isArray(crifStatus.consentDetails)
    ? (crifStatus.consentDetails[0] || {})
    : (crifStatus.consentDetails || {});

  const analyticsObj = Array.isArray(crifStatus.consentAnalyticsDetails)
    ? (crifStatus.consentAnalyticsDetails[0] || {})
    : (crifStatus.consentAnalyticsDetails || {});

  const bankSelectedEvent = (crifStatus.events || []).find((ev) => ev && ev.code === 'BANK_SELECTED');
  const detectedBankName = bankSelectedEvent
    ? String(bankSelectedEvent.description || '').replace(/ added by user/gi, '').trim()
    : null;

  const rawRefId = analyticsObj.referenceId || consentObj.referenceId || session.referenceId;
  const rawAnalysisId = analyticsObj.analysisId || consentObj.analysisId || session.analysisId;

  const activeRefId = isUUID(rawRefId) ? rawRefId : null;
  const activeAnalysisId = isUUID(rawAnalysisId) ? rawAnalysisId : null;
  const fipName = consentObj.fipName || detectedBankName || session.fipName || null;
  const consentStatus = String(consentObj.status || '').toUpperCase();
  const analyticsStatus = String(analyticsObj.status || '').toUpperCase();

  let calculatedStatus = 'PENDING';
  if (['APPROVED', 'CONSENT_APPROVED', 'SUCCESS', 'READY', 'COMPLETED', 'ACTIVE'].includes(analyticsStatus) ||
      ['APPROVED', 'CONSENT_APPROVED', 'SUCCESS', 'READY', 'COMPLETED', 'ACTIVE'].includes(consentStatus)) {
    calculatedStatus = 'ACTIVE';
  } else if (['REJECTED', 'EXPIRED', 'FAILED', 'REVOKED'].includes(analyticsStatus) ||
             ['REJECTED', 'EXPIRED', 'FAILED', 'REVOKED'].includes(consentStatus)) {
    calculatedStatus = consentStatus || analyticsStatus || 'REJECTED';
  } else if (activeRefId) {
    calculatedStatus = 'ACTIVE';
  } else {
    calculatedStatus = (session.status === 'ACTIVE' && !activeRefId) ? 'PENDING' : (session.status || 'PENDING');
  }

  console.log('[AA Status Sync Debug]', {
    leadId: lead.id,
    trackingId: session.trackingId,
    crifStatus,
    activeRefId,
    activeAnalysisId,
    fipName,
    calculatedStatus,
  });

  // Update session status dynamically from CRIF Orchestrator response
  await accountAggregatorModel.updateSessionStatus({
    trackingId: session.trackingId,
    status: calculatedStatus,
    consentId: consentObj.consentId || session.consentId,
    referenceId: activeRefId,
    analysisId: activeAnalysisId,
    fipName,
  });

  session = await accountAggregatorModel.findLatestSessionByApplicationId(lead.id, lead.rawId);
  let analytics = await accountAggregatorModel.findLatestAnalyticsByApplicationId(lead.id, lead.rawId);
  let consentDetailsData = null;

  const allConsentDetails = Array.isArray(crifStatus.consentDetails)
    ? crifStatus.consentDetails
    : (crifStatus.consentDetails ? [crifStatus.consentDetails] : []);

  const approvedConsentItem = allConsentDetails.find((c) => {
    const st = String(c?.status || '').toUpperCase();
    return ['APPROVED', 'CONSENT_APPROVED', 'SUCCESS', 'READY', 'COMPLETED', 'ACTIVE'].includes(st) && isUUID(c?.referenceId);
  });
  const targetRefId = activeRefId || approvedConsentItem?.referenceId;

  if (targetRefId) {
    let analyticsData = null;
    let rawFiData = null;

    try {
      console.log('[AA Initiating FI Data Fetch & Analytics with UUIDs]', { trackingId: session.trackingId, activeRefId, activeAnalysisId, allConsentsCount: allConsentDetails.length });
      await crifService.initiateFiData({
        trackingId: session.trackingId,
        referenceId: activeRefId || allConsentDetails[0]?.referenceId,
      });

      consentDetailsData = await crifService.fetchConsentDetails({
        trackingId: session.trackingId,
        referenceId: activeRefId || allConsentDetails[0]?.referenceId,
      });

      analyticsData = await crifService.fetchAnalytics({
        trackingId: session.trackingId,
        referenceId: activeRefId || allConsentDetails[0]?.referenceId,
        analysisId: activeAnalysisId || activeRefId || allConsentDetails[0]?.referenceId,
      });

      // Multi-consent reference ID loop to fetch FI JSON for all linked banks (Axis Bank + Union Bank of India)
      let combinedFiObj = {};
      let itemIdx = 0;

      for (const consentItem of allConsentDetails) {
        const targetRef = consentItem.referenceId || activeRefId;
        if (!targetRef) continue;

        try {
          await crifService.initiateFiData({ trackingId: session.trackingId, referenceId: targetRef }).catch(() => {});
          const singleFi = await crifService.fetchFiJson({ trackingId: session.trackingId, referenceId: targetRef });
          if (singleFi) {
            if (Array.isArray(singleFi)) {
              singleFi.forEach((acc, idx) => {
                combinedFiObj[String(itemIdx + idx)] = acc;
              });
              itemIdx += singleFi.length;
            } else if (typeof singleFi === 'object') {
              combinedFiObj[String(itemIdx)] = singleFi;
              itemIdx += 1;
            }
          }
        } catch (singleErr) {
          console.error('[AA Single FI Fetch Error]', targetRef, singleErr.message);
        }
      }

      rawFiData = Object.keys(combinedFiObj).length > 0 ? combinedFiObj : await crifService.fetchFiJson({
        trackingId: session.trackingId,
        referenceId: activeRefId,
      });
    } catch (e) {
      console.error('[AA Fetch Analytics Error]', e.message);
    }

    const accountsArray = consentDetailsData?.data?.accounts || consentDetailsData?.accounts || [];
    let consentAccountObj = accountsArray[0] || {};

    if (accountsArray.length > 1) {
      if (fipName) {
        const targetStr = String(fipName).toLowerCase().replace(/bank/g, '').trim();
        const matched = accountsArray.find(a => {
          const fipStr = String(a.fipId || a.fipName || a.bankName || a.accountType || '').toLowerCase();
          return targetStr && (fipStr.includes(targetStr) || targetStr.includes(fipStr.replace(/-fip/g, '').trim()));
        });
        if (matched) consentAccountObj = matched;
        else consentAccountObj = accountsArray[accountsArray.length - 1];
      } else {
        consentAccountObj = accountsArray[accountsArray.length - 1];
      }
    }

    const extractedAccNo = consentAccountObj.accountNumber || rawFiData?.accountDetails?.accountNumberMasked || 'Verified via FIP Bank';
    const extractedBalance = consentAccountObj.balance || consentAccountObj.currentBalance || rawFiData?.accountDetails?.balance || 0;
    const extractedIfsc = consentAccountObj.ifscCode || consentAccountObj.ifsc || rawFiData?.accountDetails?.ifscCode || '';

    const freshTxns = (function extract(obj) {
      if (!obj) return [];
      if (Array.isArray(obj.transactions) && obj.transactions.length > 0) return obj.transactions;
      if (Array.isArray(obj.accountDetails?.transactions) && obj.accountDetails.transactions.length > 0) return obj.accountDetails.transactions;
      for (const k of Object.keys(obj)) {
        const accObj = obj[k];
        const txns = accObj?.data?.account?.transactions?.transaction ||
                     accObj?.data?.account?.transactions ||
                     accObj?.account?.transactions?.transaction ||
                     accObj?.transactions?.transaction ||
                     accObj?.transactions;
        if (Array.isArray(txns) && txns.length > 0) return txns;
      }
      return [];
    })(rawFiData);

    let finalTxns = freshTxns;
    if (!finalTxns.length && analytics) {
      const prevTxns = (function extract(obj) {
        if (!obj) return [];
        const raw = obj.rawFiData || obj.analytics?.rawFiData || obj;
        if (Array.isArray(raw.transactions) && raw.transactions.length > 0) return raw.transactions;
        if (Array.isArray(raw.accountDetails?.transactions) && raw.accountDetails.transactions.length > 0) return raw.accountDetails.transactions;
        for (const k of Object.keys(raw)) {
          const accObj = raw[k];
          const txns = accObj?.data?.account?.transactions?.transaction ||
                       accObj?.data?.account?.transactions ||
                       accObj?.account?.transactions?.transaction ||
                       accObj?.transactions?.transaction ||
                       accObj?.transactions;
          if (Array.isArray(txns) && txns.length > 0) return txns;
        }
        return [];
      })(analytics.rawAnalyticsJson || analytics);

      if (prevTxns.length) finalTxns = prevTxns;
    }

    const realAnalyticsData = {
      avgMonthlyCredits: analyticsData?.cashFlowSummary?.averageMonthlyCredits || analyticsData?.avgMonthlyCredits || 0,
      avgMonthlyDebits: analyticsData?.cashFlowSummary?.averageMonthlyDebits || analyticsData?.avgMonthlyDebits || 0,
      salaryDetected: analyticsData?.salaryDetected || analyticsData?.cashFlowSummary?.salaryDetected || false,
      avgSalary: analyticsData?.cashFlowSummary?.averageSalary || analyticsData?.avgSalary || 0,
      bouncesCount: (analyticsData?.cashFlowSummary?.chequeBouncesCount || 0) + (analyticsData?.cashFlowSummary?.nachBouncesCount || 0),
      riskScore: analyticsData?.cashFlowSummary?.riskIndicatorScore || analyticsData?.riskScore || 'LOW_RISK',
      accountNumberMasked: extractedAccNo,
      ifscCode: extractedIfsc,
      ...(analyticsData || {}),
      rawFiData: {
        ...(rawFiData || {}),
        accountDetails: {
          bankName: fipName || rawFiData?.accountDetails?.bankName || 'Bank Account (Consent Approved)',
          accountType: rawFiData?.accountDetails?.accountType || consentAccountObj.accountType || 'SAVINGS',
          accountNumberMasked: extractedAccNo,
          balance: extractedBalance,
          ifscCode: extractedIfsc,
        },
        transactions: finalTxns,
      },
    };

    try {
      await accountAggregatorModel.saveAnalytics({
        applicationId: lead.id,
        trackingId: session.trackingId,
        referenceId: activeRefId,
        analysisId: activeAnalysisId || activeRefId,
        analyticsData: realAnalyticsData,
      });

      analytics = await accountAggregatorModel.findLatestAnalyticsByApplicationId(lead.id, lead.rawId);
    } catch (saveErr) {
      console.error('[AA Save Real Analytics Error]', saveErr.message);
    }
  }

  // Fallback: If session is ACTIVE/COMPLETED but no analytics record exists yet, create initial non-null statement record
  if (!analytics && (calculatedStatus === 'ACTIVE' || calculatedStatus === 'COMPLETED' || session.status === 'ACTIVE' || session.status === 'COMPLETED')) {
    try {
      await accountAggregatorModel.saveAnalytics({
        applicationId: lead.id,
        trackingId: session.trackingId,
        referenceId: session.trackingId,
        analysisId: session.trackingId,
        analyticsData: {
          avgMonthlyCredits: 0,
          avgMonthlyDebits: 0,
          salaryDetected: false,
          avgSalary: 0,
          bouncesCount: 0,
          riskScore: 'LOW_RISK',
          rawFiData: {
            accountDetails: {
              bankName: fipName || session.fipName || 'Bank Account (Consent Submitted)',
              accountType: 'SAVINGS',
              accountNumberMasked: 'Pending FIP Sync',
              balance: 0,
            },
            transactions: [],
          },
        },
      });
      analytics = await accountAggregatorModel.findLatestAnalyticsByApplicationId(lead.id, lead.rawId);
    } catch (initErr) {
      console.error('[AA Save Initial Statement Error]', initErr.message);
    }
  }

  // Dynamic multi-bank account number override check
  if (analytics && consentDetailsData) {
    const accountsArray = consentDetailsData?.data?.accounts || consentDetailsData?.accounts || [];
    if (accountsArray.length > 0) {
      let matchedAcc = accountsArray[0];
      if (accountsArray.length > 1 && fipName) {
        const targetStr = String(fipName).toLowerCase().replace(/bank/g, '').trim();
        const found = accountsArray.find(a => {
          const fipStr = String(a.fipId || a.fipName || a.bankName || a.accountType || '').toLowerCase();
          return targetStr && (fipStr.includes(targetStr) || targetStr.includes(fipStr.replace(/-fip/g, '').trim()));
        });
        if (found) matchedAcc = found;
        else matchedAcc = accountsArray[accountsArray.length - 1];
      }
      if (matchedAcc && matchedAcc.accountNumber) {
        const freshAccNo = matchedAcc.accountNumber;
        if (analytics.rawAnalyticsJson) {
          try {
            const parsed = typeof analytics.rawAnalyticsJson === 'string' ? JSON.parse(analytics.rawAnalyticsJson) : analytics.rawAnalyticsJson;
            if (parsed.rawFiData && parsed.rawFiData.accountDetails) {
              parsed.rawFiData.accountDetails.accountNumberMasked = freshAccNo;
              if (fipName) parsed.rawFiData.accountDetails.bankName = fipName;
            }
            analytics.rawAnalyticsJson = parsed;
          } catch {}
        }
        if (analytics.analyticsData && analytics.analyticsData.rawFiData && analytics.analyticsData.rawFiData.accountDetails) {
          analytics.analyticsData.rawFiData.accountDetails.accountNumberMasked = freshAccNo;
          if (fipName) analytics.analyticsData.rawFiData.accountDetails.bankName = fipName;
        }
        if (analytics.analytics && analytics.analytics.rawFiData && analytics.analytics.rawFiData.accountDetails) {
          analytics.analytics.rawFiData.accountDetails.accountNumberMasked = freshAccNo;
          if (fipName) analytics.analytics.rawFiData.accountDetails.bankName = fipName;
        }
      }
    }
  }

  return success(res, {
    hasSession: true,
    session,
    analytics,
  });
}

async function handleWebhook(req, res) {
  const body = req.body || {};
  console.log('[AA Webhook Received]', JSON.stringify(body));

  const trackingId = body.trackingId || body.data?.trackingId;
  if (trackingId) {
    const session = await accountAggregatorModel.findSessionByTrackingId(trackingId);
    if (session) {
      const newStatus = body.status || body.consentStatus || 'ACTIVE';
      await accountAggregatorModel.updateSessionStatus({
        trackingId: session.trackingId,
        status: newStatus,
        consentId: body.consentId || session.consentId,
        referenceId: isUUID(body.referenceId) ? body.referenceId : session.referenceId,
        analysisId: isUUID(body.analysisId) ? body.analysisId : session.analysisId,
        fipName: body.fipName || session.fipName,
      });
    }
  }

  return success(res, { received: true }, 'Webhook processed successfully.');
}

async function sendWhatsAppLink(req, res) {
  const leadId = req.params.id;
  const lead = await leadModel.findById(leadId);
  if (!lead) return notFound(res, 'Lead not found');

  const session = await accountAggregatorModel.findLatestSessionByApplicationId(lead.id, lead.rawId);
  if (!session || !session.redirectionUrl) {
    const error = new Error('No active Account Aggregator session found. Generate URL first.');
    error.statusCode = 400;
    throw error;
  }

  const { waResult, emailResult } = await sendAaLinkToCustomer({ lead, redirectionUrl: session.redirectionUrl });

  const phone = lead.phone || lead.mobile;
  const targetEmail = lead.email || lead.officeEmail || lead.officialEmail;

  await activityModel.createForLead(lead, {
    type: 'whatsapp_sent',
    description: `Account Aggregator link dispatched via WhatsApp (${phone || 'N/A'}) & Email (${targetEmail || 'N/A'})`,
    user: req.user?.name || 'Telecaller',
  });

  return success(res, { sent: true, waResult, emailResult }, 'Account Aggregator link sent via WhatsApp & Email successfully.');
}

async function reset(req, res) {
  const leadId = req.params.id;
  const lead = await leadModel.findById(leadId);
  if (!lead) return notFound(res, 'Lead not found');

  await accountAggregatorModel.resetSession(lead.id, lead.rawId);

  await activityModel.createForLead(lead, {
    type: 'status',
    description: 'Account Aggregator session reset to Not Initiated.',
    user: req.user?.name || 'System',
  });

  return success(res, { reset: true }, 'Account Aggregator session cleared successfully.');
}

async function verifyCallback(req, res) {
  const query = req.query || {};
  console.log('[AA Callback Query Received]', JSON.stringify(query));

  const trackingId = query.trackingId || query.tracking_id || query.trackingid;
  const digitalFlowRequestId = query.digitalFlowRequestId || query.requestId || query.digitalflowrequestid;

  if (!trackingId) {
    return success(res, { status: 'PENDING', message: 'No trackingId in callback' });
  }

  let session = await accountAggregatorModel.findSessionByTrackingId(trackingId);
  if (!session) {
    return notFound(res, 'Session not found for trackingId: ' + trackingId);
  }

  let crifStatus = {};
  try {
    crifStatus = await crifService.getDigitalFlowStatus({
      trackingId: session.trackingId,
      digitalFlowRequestId: digitalFlowRequestId || session.digitalFlowRequestId || session.digital_flow_request_id,
    });
  } catch (err) {
    console.error('[AA Callback Sync Error]', err.message);
  }

  const consentObj = Array.isArray(crifStatus.consentDetails) ? (crifStatus.consentDetails[0] || {}) : (crifStatus.consentDetails || {});
  const analyticsObj = Array.isArray(crifStatus.consentAnalyticsDetails) ? (crifStatus.consentAnalyticsDetails[0] || {}) : (crifStatus.consentAnalyticsDetails || {});

  const rawRefId = analyticsObj.referenceId || consentObj.referenceId || query.referenceId || session.referenceId;
  const rawAnalysisId = analyticsObj.analysisId || consentObj.analysisId || query.analysisId || session.analysisId;

  const activeRefId = isUUID(rawRefId) ? rawRefId : null;
  const activeAnalysisId = isUUID(rawAnalysisId) ? rawAnalysisId : null;
  const consentStatus = String(consentObj.status || '').toUpperCase();
  const analyticsStatus = String(analyticsObj.status || '').toUpperCase();
  const queryStatus = String(query.status || '').toUpperCase();

  let calculatedStatus = 'PENDING';
  if (['APPROVED', 'CONSENT_APPROVED', 'SUCCESS', 'READY', 'COMPLETED', 'ACTIVE'].includes(analyticsStatus) ||
      ['APPROVED', 'CONSENT_APPROVED', 'SUCCESS', 'READY', 'COMPLETED', 'ACTIVE'].includes(consentStatus) ||
      ['APPROVED', 'CONSENT_APPROVED', 'SUCCESS', 'READY', 'COMPLETED', 'ACTIVE'].includes(queryStatus)) {
    calculatedStatus = 'ACTIVE';
  } else if (['REJECTED', 'EXPIRED', 'FAILED', 'REVOKED'].includes(analyticsStatus) ||
             ['REJECTED', 'EXPIRED', 'FAILED', 'REVOKED'].includes(consentStatus) ||
             ['REJECTED', 'EXPIRED', 'FAILED', 'REVOKED'].includes(queryStatus)) {
    calculatedStatus = 'REJECTED';
  } else if (activeRefId) {
    calculatedStatus = 'ACTIVE';
  } else {
    calculatedStatus = (session.status === 'ACTIVE' && !activeRefId) ? 'PENDING' : (session.status || 'PENDING');
  }

  await accountAggregatorModel.updateSessionStatus({
    trackingId: session.trackingId,
    status: calculatedStatus,
    consentId: consentObj.consentId || query.consentId || session.consentId,
    referenceId: activeRefId,
    analysisId: activeAnalysisId,
    fipName: consentObj.fipName || session.fipName,
  });

  if (activeRefId) {
    try {
      await crifService.initiateFiData({
        trackingId: session.trackingId,
        referenceId: activeRefId,
      });

      const analyticsData = await crifService.fetchAnalytics({
        trackingId: session.trackingId,
        referenceId: activeRefId,
        analysisId: activeAnalysisId || activeRefId,
      });

      const rawFiData = await crifService.fetchFiJson({
        trackingId: session.trackingId,
        referenceId: activeRefId,
      });

      if (analyticsData && rawFiData) {
        await accountAggregatorModel.saveAnalytics({
          applicationId: session.applicationId,
          trackingId: session.trackingId,
          referenceId: activeRefId,
          analysisId: activeAnalysisId,
          analyticsData: {
            avgMonthlyCredits: analyticsData.cashFlowSummary?.averageMonthlyCredits || analyticsData.avgMonthlyCredits || 0,
            avgMonthlyDebits: analyticsData.cashFlowSummary?.averageMonthlyDebits || analyticsData.avgMonthlyDebits || 0,
            salaryDetected: analyticsData.cashFlowSummary?.salaryDetected || false,
            avgSalary: analyticsData.cashFlowSummary?.averageSalary || analyticsData.avgSalary || 0,
            bouncesCount: (analyticsData.cashFlowSummary?.chequeBouncesCount || 0) + (analyticsData.cashFlowSummary?.nachBouncesCount || 0),
            riskScore: analyticsData.cashFlowSummary?.riskIndicatorScore || analyticsData.riskScore || 'LOW_RISK',
            ...analyticsData,
            rawFiData,
            analytics: {
              ...analyticsData,
              rawFiData,
            },
          },
        });
      }
    } catch (e) {
      console.error('[AA Callback Fetch Analytics Error]', e.message);
    }
  }

  return success(res, {
    verified: true,
    status: calculatedStatus,
    referenceId: activeRefId,
  }, 'Callback verified and status synced with CRIF.');
}

async function debugSession(req, res) {
  const leadId = req.params.id;
  const lead = await leadModel.findById(leadId);
  if (!lead) return notFound(res, 'Lead not found');

  const session = await accountAggregatorModel.findLatestSessionByApplicationId(lead.id);
  const analytics = await accountAggregatorModel.findLatestAnalyticsByApplicationId(lead.id);

  let crifStatus = null;
  let crifError = null;

  if (session) {
    try {
      crifStatus = await crifService.getDigitalFlowStatus({
        trackingId: session.trackingId,
        digitalFlowRequestId: session.digitalFlowRequestId,
      });
    } catch (err) {
      crifError = err.message;
    }
  }

  return success(res, {
    leadId: lead.id,
    leadName: lead.name,
    session,
    analytics,
    crifStatus,
    crifError,
  }, 'Session diagnostic info retrieved.');
}

module.exports = {
  generateUrl,
  getStatus,
  handleWebhook,
  verifyCallback,
  sendWhatsAppLink,
  reset,
  debugSession,
};
