const http = require('http');
const https = require('https');
const dashboardModel = require('../models/dashboardModel');
const auditModel = require('../models/auditModel');
const { getClientIp, isPrivateIp } = require('../utils/getIp');
const { success } = require('../utils/http');

const geoMemoryCache = new Map();

function fetchUrl(urlStr) {
  return new Promise((resolve) => {
    const lib = urlStr.startsWith('https') ? https : http;
    const req = lib.get(urlStr, {
      timeout: 3500,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function resolveIpGeo(ip) {
  const cleanIp = String(ip || '').replace(/^::ffff:/, '').trim();
  if (!cleanIp || isPrivateIp(cleanIp)) {
    return {
      city: 'Localhost / Internal',
      region: '',
      country: 'Private Network',
      isp: 'Internal Network',
      isLocal: true,
    };
  }

  if (geoMemoryCache.has(cleanIp)) {
    return geoMemoryCache.get(cleanIp);
  }

  // Provider 1: ip-api.com
  let data = await fetchUrl(`http://ip-api.com/json/${encodeURIComponent(cleanIp)}`);
  if (data && data.status === 'success') {
    const result = {
      city: data.city || 'Unknown City',
      region: data.regionName || data.region || '',
      country: data.country || 'India',
      isp: data.isp || data.org || 'ISP',
      isLocal: false,
    };
    geoMemoryCache.set(cleanIp, result);
    return result;
  }

  // Provider 2: ipwho.is
  data = await fetchUrl(`https://ipwho.is/${encodeURIComponent(cleanIp)}`);
  if (data && data.success) {
    const result = {
      city: data.city || 'Unknown City',
      region: data.region || '',
      country: data.country || 'India',
      isp: data.connection?.isp || 'ISP',
      isLocal: false,
    };
    geoMemoryCache.set(cleanIp, result);
    return result;
  }

  const fallback = {
    city: 'India',
    region: '',
    country: 'India',
    isp: 'Telecom Network',
    isLocal: false,
  };
  geoMemoryCache.set(cleanIp, fallback);
  return fallback;
}

async function getStats(req, res) {
  const stats = await dashboardModel.getStats();
  return success(res, stats);
}

async function getAccountantDashboard(req, res) {
  const payload = await dashboardModel.getAccountantDashboard();
  return success(res, payload);
}

async function getAuditLogs(req, res) {
  const logs = await auditModel.findAll({ limit: 150 });
  return success(res, logs);
}

async function getIpGeo(req, res) {
  const targetIp = String(req.query.ip || getClientIp(req)).trim();
  const geo = await resolveIpGeo(targetIp);
  return success(res, { ip: targetIp, geo });
}

module.exports = {
  getAccountantDashboard,
  getStats,
  getAuditLogs,
  getIpGeo,
  resolveIpGeo,
};
