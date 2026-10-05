import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const queueDuration = new Trend('credit_queue_duration_ms', true);
const applicationsDuration = new Trend('credit_applications_duration_ms', true);
const successfulRequests = new Counter('successful_requests');
const errorRate = new Rate('custom_error_rate');

export const options = {
  scenarios: {
    credit_performance: {
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
    credit_queue_duration_ms: ['p(95)<1000'],
    credit_applications_duration_ms: ['p(95)<1000'],
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

  // 1. Test GET /api/leads/credit-queue-v2
  {
    const res = http.get(`${BASE_URL}/api/leads/credit-queue-v2?page=1&pageSize=10&tab=all`, {
      headers,
      tags: { endpoint: 'credit_queue' },
    });

    const isOk = check(res, {
      'queue status is 200': (r) => r.status === 200,
      'queue returns items': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.success && Array.isArray(body.data?.items);
        } catch {
          return false;
        }
      },
    });

    queueDuration.add(res.timings.duration);
    errorRate.add(!isOk);
    if (isOk) successfulRequests.add(1);
  }

  sleep(0.5);

  // 2. Test GET /api/leads/credit-applications-v2
  {
    const res = http.get(`${BASE_URL}/api/leads/credit-applications-v2?page=1&pageSize=10&stage=all`, {
      headers,
      tags: { endpoint: 'credit_applications' },
    });

    const isOk = check(res, {
      'applications status is 200': (r) => r.status === 200,
      'applications returns items': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.success && Array.isArray(body.data?.items);
        } catch {
          return false;
        }
      },
    });

    applicationsDuration.add(res.timings.duration);
    errorRate.add(!isOk);
    if (isOk) successfulRequests.add(1);
  }

  sleep(1);
}
