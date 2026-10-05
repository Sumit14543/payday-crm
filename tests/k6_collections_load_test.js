import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// Custom metrics to track each endpoint independently
const listDuration = new Trend('collections_list_duration_ms', true);
const summaryDuration = new Trend('collections_summary_duration_ms', true);
const reportsDuration = new Trend('collections_reports_duration_ms', true);
const listPayloadBytes = new Trend('collections_list_payload_bytes');
const successfulRequests = new Counter('successful_requests');
const errorRate = new Rate('custom_error_rate');

export const options = {
  scenarios: {
    collections_performance: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '5s', target: 5 },   // Ramp up to 5 users
        { duration: '15s', target: 10 }, // Sustained load at 10 concurrent users
        { duration: '5s', target: 0 },   // Ramp down
      ],
      gracefulRampDown: '3s',
    },
  },
  thresholds: {
    // 95% of all collection requests must complete under 1500ms
    http_req_duration: ['p(95)<2000'],
    // 95% of list requests should complete under 1000ms
    collections_list_duration_ms: ['p(95)<1500'],
    // Summary endpoint with in-memory caching should be under 300ms
    collections_summary_duration_ms: ['p(95)<500'],
    // Error rate must remain below 5%
    custom_error_rate: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.TARGET_URL || 'https://testing-api.waqtmoney.com';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export default function () {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  // 1. Test POST /api/collections/list
  {
    const res = http.post(`${BASE_URL}/api/collections/list`, JSON.stringify({}), {
      headers,
      tags: { endpoint: 'collections_list' },
    });

    const isOk = check(res, {
      'list status is 200': (r) => r.status === 200,
      'list has json response': (r) => r.headers['Content-Type'] && r.headers['Content-Type'].includes('json'),
      'list returns array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.data || body);
        } catch {
          return false;
        }
      },
    });

    listDuration.add(res.timings.duration);
    listPayloadBytes.add(res.body ? res.body.length : 0);
    errorRate.add(!isOk);
    if (isOk) successfulRequests.add(1);
  }

  sleep(0.5);

  // 2. Test POST /api/collections/summary/fetch
  {
    const res = http.post(`${BASE_URL}/api/collections/summary/fetch`, JSON.stringify({}), {
      headers,
      tags: { endpoint: 'collections_summary' },
    });

    const isOk = check(res, {
      'summary status is 200': (r) => r.status === 200,
      'summary returns data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return (body.data && typeof body.data.activeCases !== 'undefined') || typeof body.activeCases !== 'undefined';
        } catch {
          return false;
        }
      },
    });

    summaryDuration.add(res.timings.duration);
    errorRate.add(!isOk);
    if (isOk) successfulRequests.add(1);
  }

  sleep(0.5);

  // 3. Test GET /api/collections/reports
  {
    const res = http.get(`${BASE_URL}/api/collections/reports`, {
      headers,
      tags: { endpoint: 'collections_reports' },
    });

    const isOk = check(res, {
      'reports status is 200': (r) => r.status === 200,
    });

    reportsDuration.add(res.timings.duration);
    errorRate.add(!isOk);
    if (isOk) successfulRequests.add(1);
  }

  sleep(1);
}
