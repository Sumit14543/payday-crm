import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const dashboardDuration = new Trend('product_admin_dashboard_ms', true);
const loansDuration = new Trend('loans_api_duration_ms', true);
const leadsDuration = new Trend('leads_api_duration_ms', true);
const collectionsDuration = new Trend('collections_api_duration_ms', true);
const summaryDuration = new Trend('collections_summary_ms', true);
const errorRate = new Rate('custom_error_rate');

export const options = {
  scenarios: {
    product_admin_flow: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '3s', target: 5 },
        { duration: '12s', target: 10 },
        { duration: '3s', target: 0 },
      ],
      gracefulRampDown: '2s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1200'],
    loans_api_duration_ms: ['p(95)<1000'],
    leads_api_duration_ms: ['p(95)<800'],
    collections_api_duration_ms: ['p(95)<500'],
    custom_error_rate: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.TARGET_URL || 'https://payday-api.waqtmoney.com';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export default function () {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${AUTH_TOKEN}`,
  };

  const tStart = new Date().getTime();

  // 1. Fetch Loans (powers Today's Disbursed & Revenue on Dashboard)
  const t0 = new Date().getTime();
  const loansRes = http.get(`${BASE_URL}/api/loans?page=1&limit=5000&pageSize=5000`, { headers });
  loansDuration.add(new Date().getTime() - t0);
  const loansOk = check(loansRes, {
    'loans status 200': (r) => r.status === 200,
    'loans has data array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data) && body.data.length > 0;
      } catch {
        return false;
      }
    },
  });
  if (!loansOk) errorRate.add(1);

  // 2. Fetch Leads
  const t1 = new Date().getTime();
  const leadsRes = http.get(`${BASE_URL}/api/leads?page=1&pageSize=5000`, { headers });
  leadsDuration.add(new Date().getTime() - t1);
  const leadsOk = check(leadsRes, {
    'leads status 200': (r) => r.status === 200,
  });
  if (!leadsOk) errorRate.add(1);

  // 3. Fetch Collections
  const t2 = new Date().getTime();
  const colRes = http.get(`${BASE_URL}/api/collections`, { headers });
  collectionsDuration.add(new Date().getTime() - t2);
  const colOk = check(colRes, {
    'collections status 200': (r) => r.status === 200,
  });
  if (!colOk) errorRate.add(1);

  // 4. Fetch Collections Summary
  const t3 = new Date().getTime();
  const sumRes = http.get(`${BASE_URL}/api/collections/summary`, { headers });
  summaryDuration.add(new Date().getTime() - t3);
  const sumOk = check(sumRes, {
    'summary status 200': (r) => r.status === 200,
  });
  if (!sumOk) errorRate.add(1);

  dashboardDuration.add(new Date().getTime() - tStart);
  sleep(0.5);
}
