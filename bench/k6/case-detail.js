// KỊCH BẢN 2: Mở trang Case — mỗi lượt đọc 1 report + timeline của nó.
//
// Cách chạy (từ thư mục gốc vulncell/):
//   k6 run bench/k6/case-detail.js
//   k6 run --summary-export=bench/results/v0-case.json bench/k6/case-detail.js
//   $env:QUICK='true'; k6 run bench/k6/case-detail.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:4000';
const QUICK = __ENV.QUICK === 'true';

export const options = {
  scenarios: {
    caseDetail: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: QUICK
        ? [
            { duration: '3s', target: 3 },
            { duration: '4s', target: 0 },
          ]
        : [
            { duration: '10s', target: 10 },
            { duration: '40s', target: 25 },
            { duration: '10s', target: 0 },
          ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.10'],
  },
};

// setup() chạy 1 lần trước khi bắn tải: lấy 50 id report thật để test
export function setup() {
  const res = http.get(`${BASE}/api/reports?disclosed=true&pageSize=50`);
  const ids = res.json().map((r) => r.id);
  if (ids.length === 0) throw new Error('Không lấy được report nào — đã seed chưa?');
  return { ids };
}

export default function (data) {
  const id = data.ids[Math.floor(Math.random() * data.ids.length)];

  const r1 = http.get(`${BASE}/api/reports/${id}`);
  check(r1, { 'report 200': (r) => r.status === 200 });

  const r2 = http.get(`${BASE}/api/reports/${id}/events`);
  check(r2, { 'events 200': (r) => r.status === 200 });

  sleep(0.3);
}
