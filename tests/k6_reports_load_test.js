import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const reportsDuration = new Trend('reports_dashboard_duration_ms', true);
const accountantDuration = new Trend('accountant_report_duration_ms', true);
const interestDuration = new Trend('interest_report_duration_ms', true);
const collectionsDuration = new Trend('collections_duration_ms', true);
const slaDuration = new Trend('sla_report_duration_ms', true);
const errorRate = new Rate('custom_error_rate');

export const options = {
  scenarios: {
    reports_performance: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '3s', target: 5 },
        { duration: '10s', target: 10 },
        { duration: '3s', target: 0 },
      ],
      gracefulRampDown: '2s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    reports_dashboard_duration_ms: ['p(95)<800'],
    custom_error_rate: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.TARGET_URL || 'https://payday-api.waqtmoney.com';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export default function () {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  // 1. Accountant Report
  const t0 = new Date().getTime();
  const accRes = http.get(`${BASE_URL}/api/dashboard/accountant`, { headers });
  accountantDuration.add(new Date().getTime() - t0);
  const accOk = check(accRes, {
    'accountant status 200': (r) => r.status === 200,
    'accountant has actionQueue': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.actionQueue !== undefined || body.success !== false;
      } catch {
        return false;
      }
    },
  });
  if (!accOk) errorRate.add(1);

  // 2. Interest Report
  const t1 = new Date().getTime();
  const intRes = http.get(`${BASE_URL}/api/accounts/reports/interest`, { headers });
  interestDuration.add(new Date().getTime() - t1);
  const intOk = check(intRes, {
    'interest status 200': (r) => r.status === 200,
  });
  if (!intOk) errorRate.add(1);

  // 3. Collections Report
  const t2 = new Date().getTime();
  const colRes = http.get(`${BASE_URL}/api/collections/reports`, { headers });
  collectionsDuration.add(new Date().getTime() - t2);
  const colOk = check(colRes, {
    'collections status 200': (r) => r.status === 200,
  });
  if (!colOk) errorRate.add(1);

  // 4. SLA Report
  const t3 = new Date().getTime();
  const slaRes = http.get(`${BASE_URL}/api/leads/telecaller-sla-report?period=last6months`, { headers });
  slaDuration.add(new Date().getTime() - t3);
  const slaOk = check(slaRes, {
    'sla status 200': (r) => r.status === 200,
  });
  if (!slaOk) errorRate.add(1);

  reportsDuration.add(new Date().getTime() - t0);
  sleep(0.5);
}
