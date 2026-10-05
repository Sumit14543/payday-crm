const { config } = require('../config/env');

const CRIF_BASE_URL = String(config.crif.baseUrl || 'https://orch.crif.com/orchestrator').replace(/\/$/, '');

let tokenCache = {
  token: '',
  expiresAt: 0,
};

async function getAccessToken(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && tokenCache.token && tokenCache.expiresAt > now + 60000) {
    return tokenCache.token;
  }

  const apiUser = config.crif.apiUser || 'waqtit3@gmail.com';
  const apiPassword = config.crif.apiPassword || 'Waqt@#@#08#@';

  if (!apiUser || !apiPassword) {
    console.log('[CRIF AA] API credentials missing, using sandbox mock token.');
    return 'mock_crif_uat_token_12345';
  }

  try {
    const res = await fetch(`${CRIF_BASE_URL}/public/api-user/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userName: apiUser,
        username: apiUser,
        password: apiPassword,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Token endpoint returned ${res.status}: ${errText}`);
    }

    const data = await res.json();
    console.log('[CRIF AA Token Response Raw]', JSON.stringify(data));
    const token = typeof data === 'string'
      ? data
      : (data.accessToken ||
         data.access_token ||
         data.token ||
         data.jwtToken ||
         data.jwt ||
         data.bearerToken ||
         data.data?.accessToken ||
         data.data?.access_token ||
         data.data?.token ||
         data.tokenDetails?.accessToken ||
         (typeof data === 'object' && Object.values(data).find((v) => typeof v === 'string' && v.length > 20)));

    if (!token) {
      throw new Error(`Token missing in CRIF response: ${JSON.stringify(data)}`);
    }

    const expiresInSec = Number(data.expires_in || data.expiresIn || 1800);
    const ttlMs = Math.max((expiresInSec - 180) * 1000, 5 * 60 * 1000); // 3 minutes buffer

    tokenCache = {
      token,
      expiresAt: Date.now() + ttlMs,
    };

    return token;
  } catch (err) {
    console.error('[CRIF AA Token Error]', err.message);
    throw new Error(`CRIF Token Auth Failed: ${err.message}`);
  }
}

async function fetchFipBanks() {
  const token = await getAccessToken();
  if (token.startsWith('mock_')) {
    return [
      { fipId: 'FINVU-FIP-01', fipName: 'Finvu Bank Ltd.' },
      { fipId: 'FINVU-FIP-02', fipName: 'Dhanagar Finvu Bank Ltd.' },
    ];
  }

  try {
    const res = await fetch(`${CRIF_BASE_URL}/fiu-ws/fip`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error('[CRIF AA Fetch FIP Error]', err.message);
    return [];
  }
}

async function fetchConsentTemplates() {
  const token = await getAccessToken();
  if (token.startsWith('mock_')) {
    return [
      { templateCode: 'CT003', templateName: 'Loan Underwriting and Monitoring', active: true },
    ];
  }

  try {
    const res = await fetch(`${CRIF_BASE_URL}/fiu-ws/template/consent/fetch?page=0&size=20`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error('[CRIF AA Fetch Consent Templates Error]', err.message);
    return [];
  }
}

async function generateDigitalFlowUrl({ templateCode, trackingId, flowId, phoneNumber, pan, redirectionBackUrl }) {
  const token = await getAccessToken();
  const finalTrackingId = trackingId || `AA_TRACK_${Date.now()}`;
  const rawBackUrl = redirectionBackUrl || config.crif.redirectUrl || (process.env.PUBLIC_APP_URL ? `${process.env.PUBLIC_APP_URL}/account-aggregator/callback` : 'https://payday.waqtmoney.com/account-aggregator/callback');
  const finalBackUrl = (rawBackUrl.includes('trackingId') || rawBackUrl.includes('tracking_id'))
    ? rawBackUrl
    : (rawBackUrl.includes('?') ? `${rawBackUrl}&trackingId=${encodeURIComponent(finalTrackingId)}` : `${rawBackUrl}?trackingId=${encodeURIComponent(finalTrackingId)}`);

  const reqBody = {
    templateCode: templateCode || config.crif.templateCode || 'PLUWV1',
    trackingId: finalTrackingId,
    flowId: flowId || config.crif.flowId || 'F001',
    phoneNumber: String(phoneNumber || '').replace(/\D/g, '').slice(-10),
    pan: String(pan || '').trim().toUpperCase(),
    redirectionBackUrl: finalBackUrl,
  };

  if (token.startsWith('mock_')) {
    const mockDigitalFlowRequestId = `DF_REQ_${Date.now()}`;
    const publicAppUrl = config.crif.redirectUrl
      ? config.crif.redirectUrl.replace(/\/account-aggregator\/callback\/?$/, '')
      : (process.env.PUBLIC_APP_URL || 'https://payday.waqtmoney.com');
    const mockRedirectionUrl = `${publicAppUrl}/account-aggregator/test-journey?trackingId=${encodeURIComponent(reqBody.trackingId)}&digitalFlowRequestId=${encodeURIComponent(mockDigitalFlowRequestId)}`;
    return {
      trackingId: reqBody.trackingId,
      digitalFlowRequestId: mockDigitalFlowRequestId,
      redirectionUrl: mockRedirectionUrl,
      isMock: true,
    };
  }

  try {
    let activeToken = token;
    let res = await fetch(`${CRIF_BASE_URL}/fiu-ws/df/generate-url`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${activeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reqBody),
    });

    if (res.status === 401) {
      console.log('[CRIF AA] Token expired during generate-url (401), refreshing token and retrying...');
      activeToken = await getAccessToken(true);
      res = await fetch(`${CRIF_BASE_URL}/fiu-ws/df/generate-url`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reqBody),
      });
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Generate URL returned ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return {
      trackingId: data.trackingId || reqBody.trackingId,
      digitalFlowRequestId: data.digitalFlowRequestId || data.requestId,
      redirectionUrl: data.redirectionUrl || data.url,
      raw: data,
    };
  } catch (err) {
    console.error('[CRIF AA Generate URL Error]', err.message);
    throw err;
  }
}

async function getDigitalFlowStatus({ trackingId, digitalFlowRequestId }) {
  const token = await getAccessToken();

  if (token.startsWith('mock_')) {
    return {
      trackingId,
      digitalFlowRequestId,
      consentDetails: {
        status: 'ACTIVE',
        consentId: `CONSENT_${Date.now()}`,
        fipId: 'FINVU-FIP-01',
      },
      consentAnalyticsDetails: {
        status: 'COMPLETED',
        referenceId: `REF_${Date.now()}`,
        analysisId: `ANALYSIS_${Date.now()}`,
      },
      isMock: true,
    };
  }

  try {
    let activeToken = token;
    let res = await fetch(`${CRIF_BASE_URL}/fiu-ws/df/status`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${activeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trackingId,
        digitalFlowRequestId,
      }),
    });

    if (res.status === 401) {
      activeToken = await getAccessToken(true);
      res = await fetch(`${CRIF_BASE_URL}/fiu-ws/df/status`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trackingId,
          digitalFlowRequestId,
        }),
      });
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`DF Status returned ${res.status}: ${errText}`);
    }

    return await res.json();
  } catch (err) {
    console.error('[CRIF AA Status Error]', err.message);
    throw err;
  }
}

async function fetchAnalytics({ trackingId, referenceId, analysisId }) {
  const token = await getAccessToken();

  if (token.startsWith('mock_')) {
    return {
      trackingId,
      referenceId,
      analysisId,
      cashFlowSummary: {
        averageMonthlyCredits: 45000,
        averageMonthlyDebits: 28000,
        netCashFlow: 17000,
        salaryDetected: true,
        detectedEmployer: 'Reputed Corporate Solutions',
        averageSalary: 42000,
        lastSalaryDate: new Date().toISOString().slice(0, 10),
        chequeBouncesCount: 0,
        nachBouncesCount: 0,
        riskIndicatorScore: 'LOW_RISK',
      },
      recurringTransactions: [
        { type: 'SALARY', amount: 42000, frequency: 'MONTHLY' },
        { type: 'RENT', amount: 12000, frequency: 'MONTHLY' },
      ],
      isMock: true,
    };
  }

  try {
    let activeToken = token;
    let res = await fetch(`${CRIF_BASE_URL}/fiu-ws/analytics/fetch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${activeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trackingId,
        referenceId,
        analysisId,
      }),
    });

    if (res.status === 401) {
      activeToken = await getAccessToken(true);
      res = await fetch(`${CRIF_BASE_URL}/fiu-ws/analytics/fetch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trackingId,
          referenceId,
          analysisId,
        }),
      });
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Analytics fetch returned ${res.status}: ${errText}`);
    }

    return await res.json();
  } catch (err) {
    console.error('[CRIF AA Analytics Error]', err.message);
    return null;
  }
}

async function fetchFiJson({ trackingId, referenceId }) {
  const token = await getAccessToken();

  if (token.startsWith('mock_')) {
    return {
      trackingId,
      referenceId,
      accountDetails: {
        bankName: 'Finvu Bank Ltd.',
        accountType: 'SAVINGS',
        accountNumberMasked: 'XXXXXX4892',
        balance: 34500,
      },
      transactions: [
        { date: '2026-08-01', type: 'CREDIT', amount: 42000, narration: 'SALARY CREDIT BY CORPORATE' },
        { date: '2026-08-05', type: 'DEBIT', amount: 12000, narration: 'RENT PAYMENT UPI' },
        { date: '2026-08-10', type: 'DEBIT', amount: 3500, narration: 'UTILITY BILL PAYMENT' },
      ],
      isMock: true,
    };
  }

  try {
    let activeToken = token;
    let res = await fetch(`${CRIF_BASE_URL}/fiu-ws/fi/fetch/JSON`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${activeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trackingId,
        referenceId,
      }),
    });

    if (res.status === 401) {
      activeToken = await getAccessToken(true);
      res = await fetch(`${CRIF_BASE_URL}/fiu-ws/fi/fetch/JSON`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trackingId,
          referenceId,
        }),
      });
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`FI JSON fetch returned ${res.status}: ${errText}`);
    }

    return await res.json();
  } catch (err) {
    console.error('[CRIF AA FI JSON Error]', err.message);
    return null;
  }
}

async function initiateFiData({ trackingId, referenceId }) {
  const token = await getAccessToken();

  try {
    let activeToken = token;
    let res = await fetch(`${CRIF_BASE_URL}/fiu-ws/fi/initiate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${activeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trackingId,
        referenceId,
      }),
    });

    if (res.status === 401) {
      activeToken = await getAccessToken(true);
      res = await fetch(`${CRIF_BASE_URL}/fiu-ws/fi/initiate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trackingId,
          referenceId,
        }),
      });
    }

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[CRIF AA FI Initiate Warning] ${res.status}: ${errText}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error('[CRIF AA FI Initiate Error]', err.message);
    return null;
  }
}

async function fetchConsentDetails({ trackingId, referenceId }) {
  const token = await getAccessToken();

  try {
    let activeToken = token;
    let res = await fetch(`${CRIF_BASE_URL}/fiu-ws/consent/fetch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${activeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trackingId,
        referenceId,
      }),
    });

    if (res.status === 401) {
      activeToken = await getAccessToken(true);
      res = await fetch(`${CRIF_BASE_URL}/fiu-ws/consent/fetch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trackingId,
          referenceId,
        }),
      });
    }

    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[CRIF AA Consent Fetch Error]', err.message);
    return null;
  }
}

module.exports = {
  getAccessToken,
  generateDigitalFlowUrl,
  getDigitalFlowStatus,
  fetchAnalytics,
  fetchConsentDetails,
  fetchFiJson,
  initiateFiData,
};
