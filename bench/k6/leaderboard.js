// KỊCH BẢN 3: Leaderboard — đo hiệu quả của cache + (sau này) cột reputation denormalized.
//
// Cách chạy (từ thư mục gốc vulncell/):
//   k6 run bench/k6/leaderboard.js
//   k6 run --summary-export=bench/results/v0-leaderboard-cache.json bench/k6/leaderboard.js
//   # Muốn đo "DB thuần" (không cache): khởi động server bằng npm run serve:bench:nocache
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:4000';
const QUICK = __ENV.QUICK === 'true';

export const options = {
  scenarios: {
    leaderboard: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: QUICK
        ? [
            { duration: '3s', target: 3 },
            { duration: '4s', target: 0 },
          ]
        : [
            { duration: '10s', target: 20 },
            { duration: '40s', target: 50 },
            { duration: '10s', target: 0 },
          ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.10'],
  },
};

export default function () {
  const sortBy = Math.random() < 0.8 ? 'reputation' : 'signal';
  const res = http.get(`${BASE}/api/leaderboard?sortBy=${sortBy}`);
  check(res, { 'HTTP 200': (r) => r.status === 200 });
  sleep(0.5);
}
