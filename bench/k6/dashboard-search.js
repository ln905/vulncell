// KỊCH BẢN 1: Search Dashboard — điểm "nặng" nhất khi DB có 500k report.
//
// Cách chạy (từ thư mục gốc vulncell/):
//   k6 run bench/k6/dashboard-search.js
//   k6 run --summary-export=bench/results/v0-search.json bench/k6/dashboard-search.js
//   $env:QUICK='true'; k6 run bench/k6/dashboard-search.js     # chạy thử 7 giây
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:4000';
const QUICK = __ENV.QUICK === 'true';

// Từ khóa lấy từ chính weaknesses trong seed data
const KEYWORDS = ['xss', 'injection', 'ssrf', 'redirect', 'takeover', 'traversal', 'csrf', 'idor', 'smuggling', 'tls', 'authentication'];

export const options = {
  scenarios: {
    search: {
      executor: 'ramping-vus', // tăng dần số user ảo giống người dùng thật vào trang
      startVUs: 1,
      stages: QUICK
        ? [
            { duration: '3s', target: 3 },
            { duration: '4s', target: 0 },
          ]
        : [
            { duration: '10s', target: 10 },
            { duration: '40s', target: 30 },
            { duration: '10s', target: 0 },
          ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    // Kịch bản thất bại nếu > 10% request lỗi (429/5xx) — chủ yếu để cảnh báo
    http_req_failed: ['rate<0.10'],
  },
};

export default function () {
  const kw = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
  const page = 1 + Math.floor(Math.random() * 3);
  const res = http.get(`${BASE}/api/reports?q=${encodeURIComponent(kw)}&disclosed=true&page=${page}&pageSize=10`);
  check(res, { 'HTTP 200': (r) => r.status === 200 });
  sleep(0.3); // nghỉ giữa các lượt như người dùng thật (không bắn liên tục)
}
