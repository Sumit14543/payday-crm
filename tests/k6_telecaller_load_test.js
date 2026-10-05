import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const workbenchDuration = new Trend('telecaller_workbench_duration_ms', true);
const leadsDuration = new Trend('leads_list_duration_ms', true);
const policyDuration = new Trend('telecaller_policy_duration_ms', true);
const successfulRequests = new Counter('successful_requests');
const errorRate = new Rate('custom_error_rate');

export const options = {
  scenarios: {
    telecaller_performance: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '5s', target: 5 },
        { duration: '15s', target: 10 },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '3s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    telecaller_workbench_duration_ms: ['p(95)<1000'],
    leads_list_duration_ms: ['p(95)<1000'],
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

  // 1. Test GET /api/leads/telecaller-workbench-v2
  {
    const res = http.get(`${BASE_URL}/api/leads/telecaller-workbench-v2?page=1&pageSize=10&tab=all`, {
      headers,
      tags: { endpoint: 'telecaller_workbench' },
    });

    const isOk = check(res, {
      'workbench status is 200': (r) => r.status === 200,
      'workbench returns items': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.success && Array.isArray(body.data?.items);
        } catch {
          return false;
        }
      },
    });

    workbenchDuration.add(res.timings.duration);
    errorRate.add(!isOk);
    if (isOk) successfulRequests.add(1);
  }

  sleep(0.5);

  // 2. Test GET /api/leads?page=1&limit=25
  {
    const res = http.get(`${BASE_URL}/api/leads?page=1&limit=25`, {
      headers,
      tags: { endpoint: 'leads_list' },
    });

    const isOk = check(res, {
      'leads status is 200': (r) => r.status === 200,
      'leads returns array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.data || body);
        } catch {
          return false;
        }
      },
    });

    leadsDuration.add(res.timings.duration);
    errorRate.add(!isOk);
    if (isOk) successfulRequests.add(1);
  }

  sleep(0.5);

  // 3. Test GET /api/leads/telecaller-policy
  {
    const res = http.get(`${BASE_URL}/api/leads/telecaller-policy`, {
      headers,
      tags: { endpoint: 'telecaller_policy' },
    });

    const isOk = check(res, {
      'policy status is 200': (r) => r.status === 200,
    });

    policyDuration.add(res.timings.duration);
    errorRate.add(!isOk);
    if (isOk) successfulRequests.add(1);
  }

  sleep(1);
}
