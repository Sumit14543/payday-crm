const dns = require('dns').promises;
const https = require('https');

const FREE_PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.in',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'rediffmail.com',
  'aol.com',
  'gmx.com',
  'yandex.com',
  'protonmail.com',
  'proton.me',
  'zoho.com',
  'mail.com',
  'inbox.com',
]);

const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com',
  'temp-mail.org',
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'throwawaymail.com',
  'dispostable.com',
  'yopmail.com',
  'sharklasers.com',
  'getnada.com',
  'maildrop.cc',
  'crazymailing.com',
  'tmail.com',
  'fakemailgenerator.com',
  'tmpmail.net',
  'generator.email',
  'inboxkitten.com',
]);

/**
 * Perform HTTPS GET request with timeout to fetch JSON
 */
function fetchJsonWithTimeout(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(null);
    }, timeoutMs);

    const req = https.get(url, { headers: { 'User-Agent': 'WaqtFinanceCRM-DomainChecker/1.0' } }, (res) => {
      if (res.statusCode !== 200) {
        clearTimeout(timer);
        return resolve(null);
      }
      let rawData = '';
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      res.on('end', () => {
        clearTimeout(timer);
        try {
          const parsed = JSON.parse(rawData);
          resolve(parsed);
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });

    req.end();
  });
}

/**
 * Fetch domain registration creation date via Verisign RDAP / RDAP Org / Google DNS API
 */
async function fetchDomainRegistrationInfo(domain) {
  const domainLower = String(domain || '').trim().toLowerCase();

  // 1. Try Verisign RDAP for .com / .net domains
  let rdapUrls = [];
  if (domainLower.endsWith('.com') || domainLower.endsWith('.net')) {
    rdapUrls.push(`https://rdap.verisign.com/com/v1/domain/${encodeURIComponent(domainLower)}`);
  }
  rdapUrls.push(`https://rdap.org/domain/${encodeURIComponent(domainLower)}`);

  for (const url of rdapUrls) {
    const rdapData = await fetchJsonWithTimeout(url, 2500);
    if (rdapData && Array.isArray(rdapData.events)) {
      const regEvent = rdapData.events.find(
        (e) => e.eventAction === 'registration' || e.eventAction === 'creation'
      );

      if (regEvent && regEvent.eventDate) {
        const created = new Date(regEvent.eventDate);
        if (!isNaN(created.getTime())) {
          const ageMs = Date.now() - created.getTime();
          const ageDays = Math.max(1, Math.floor(ageMs / (1000 * 60 * 60 * 24)));
          const ageYears = Number((ageDays / 365.25).toFixed(1));

          let formattedAge = `${ageDays} days active`;
          if (ageYears >= 1) {
            formattedAge = `${ageYears} years (${ageDays} days active)`;
          }

          return {
            createdDate: created.toISOString().split('T')[0],
            ageDays,
            ageYears,
            formattedAge,
            isNewDomain: ageDays < 90,
            source: 'RDAP Registry',
          };
        }
      }
    }
  }

  // 2. Fallback to Google DNS SOA check
  try {
    const googleDns = await fetchJsonWithTimeout(`https://dns.google/resolve?name=${encodeURIComponent(domainLower)}&type=SOA`, 2000);
    if (googleDns && googleDns.Answer && googleDns.Answer.length > 0) {
      return {
        createdDate: null,
        ageDays: null,
        ageYears: null,
        formattedAge: 'Active Registered Domain (Verified)',
        isNewDomain: false,
        source: 'Google DNS SOA',
      };
    }
  } catch {}

  return {
    createdDate: null,
    ageDays: null,
    ageYears: null,
    formattedAge: 'Active Domain',
    isNewDomain: false,
    source: 'DNS Lookup',
  };
}

/**
 * Resolve MX records for a domain using Node.js DNS Promises & Google DNS API fallback
 */
async function checkDnsMxRecords(domain) {
  const domainLower = String(domain || '').trim().toLowerCase();

  // 1. Local Node.js DNS resolveMx
  try {
    const mxRecords = await dns.resolveMx(domainLower);
    if (Array.isArray(mxRecords) && mxRecords.length > 0) {
      mxRecords.sort((a, b) => a.priority - b.priority);
      return {
        hasMxRecords: true,
        mxRecords: mxRecords.map((r) => r.exchange),
        primaryMx: mxRecords[0].exchange,
      };
    }
  } catch {}

  // 2. Google DNS HTTP API fallback for MX
  try {
    const googleMx = await fetchJsonWithTimeout(`https://dns.google/resolve?name=${encodeURIComponent(domainLower)}&type=MX`, 2500);
    if (googleMx && Array.isArray(googleMx.Answer) && googleMx.Answer.length > 0) {
      const exchanges = googleMx.Answer.map((a) => {
        const parts = String(a.data || '').trim().split(/\s+/);
        return parts.length > 1 ? parts[1].replace(/\.$/, '') : a.data;
      });
      return {
        hasMxRecords: true,
        mxRecords: exchanges,
        primaryMx: exchanges[0],
      };
    }
  } catch {}

  // 3. Fallback to Google DNS A record
  try {
    const googleA = await fetchJsonWithTimeout(`https://dns.google/resolve?name=${encodeURIComponent(domainLower)}&type=A`, 2000);
    if (googleA && Array.isArray(googleA.Answer) && googleA.Answer.length > 0) {
      return {
        hasMxRecords: true,
        mxRecords: [`mail.${domainLower}`],
        primaryMx: `mail.${domainLower}`,
      };
    }
  } catch {}

  return { hasMxRecords: false, mxRecords: [], primaryMx: null };
}

/**
 * Complete Official Email & Domain Checker Verification Engine
 */
async function verifyOfficialEmailDomain(emailAddress) {
  const email = String(emailAddress || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return {
      isValidFormat: false,
      email,
      domain: '',
      isCorporateDomain: false,
      isFreeEmail: false,
      isDisposable: false,
      hasMxRecords: false,
      mxRecords: [],
      primaryMx: null,
      createdDate: null,
      ageDays: null,
      ageYears: null,
      formattedAge: 'Invalid',
      isNewDomain: false,
      qualityScore: 0,
      riskLevel: 'CRITICAL',
      riskFlags: ['Invalid email format'],
      recommendation: 'Enter a valid email address with @ and domain.',
    };
  }

  const parts = email.split('@');
  const domain = parts[parts.length - 1].trim();

  // Basic Checks
  const isDisposable = DISPOSABLE_DOMAINS.has(domain);
  const isFreeEmail = FREE_PERSONAL_DOMAINS.has(domain);
  const isCorporateDomain = !isFreeEmail && !isDisposable;

  // Run DNS MX Record Lookup & RDAP Domain Age parallelly
  const [mxResult, domainRegResult] = await Promise.all([
    checkDnsMxRecords(domain),
    fetchDomainRegistrationInfo(domain),
  ]);

  const riskFlags = [];
  let score = 100;

  if (!mxResult.hasMxRecords) {
    score -= 60;
    riskFlags.push('No valid MX mail server records found in DNS');
  }

  if (isDisposable) {
    score -= 80;
    riskFlags.push('Disposable/Temporary email domain flagged');
  } else if (isFreeEmail) {
    score -= 40;
    riskFlags.push('Personal/Free Email provider used instead of corporate email');
  }

  if (domainRegResult.isNewDomain && domainRegResult.ageDays !== null) {
    score -= 20;
    riskFlags.push(`Newly registered domain (${domainRegResult.ageDays} days old)`);
  }

  score = Math.max(0, Math.min(100, score));

  let riskLevel = 'LOW';
  if (score < 30 || isDisposable || !mxResult.hasMxRecords) {
    riskLevel = 'CRITICAL';
  } else if (score < 60 || isFreeEmail) {
    riskLevel = 'MEDIUM';
  } else if (score < 80) {
    riskLevel = 'LOW';
  }

  let recommendation = 'Verified Official Corporate Domain. Low Risk.';
  if (!mxResult.hasMxRecords) {
    recommendation = 'Invalid Domain! No MX mail server records exist. Do NOT accept this email.';
  } else if (isDisposable) {
    recommendation = 'High Risk Fraud Alert! Temporary/Disposable email address detected. Reject.';
  } else if (isFreeEmail) {
    recommendation = 'Personal Email (Gmail/Yahoo/etc.) used as Official Email. Request corporate email (e.g. user@company.com) or verify employment proof.';
  } else if (domainRegResult.isNewDomain) {
    recommendation = `Caution: Domain registered recently (${domainRegResult.ageDays} days ago). Verify company background.`;
  }

  return {
    isValidFormat: true,
    email,
    domain,
    isCorporateDomain,
    isFreeEmail,
    isDisposable,
    hasMxRecords: mxResult.hasMxRecords,
    mxRecords: mxResult.mxRecords,
    primaryMx: mxResult.primaryMx,
    createdDate: domainRegResult.createdDate,
    ageDays: domainRegResult.ageDays,
    ageYears: domainRegResult.ageYears,
    formattedAge: domainRegResult.formattedAge,
    isNewDomain: domainRegResult.isNewDomain,
    qualityScore: score,
    riskLevel,
    riskFlags,
    recommendation,
    verifiedAt: new Date().toISOString(),
  };
}

module.exports = {
  verifyOfficialEmailDomain,
  checkDnsMxRecords,
  FREE_PERSONAL_DOMAINS,
  DISPOSABLE_DOMAINS,
};
