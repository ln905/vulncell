// KỊCH BẢN 5 (SECURITY): Spam API — chứng minh lớp rate limit TỔNG QUÁT theo IP (300 request/phút).
//
// ⚠️ Server phải chạy CHẾ ĐỘ THƯỜNG (rate limit BẬT) — tức npm run dev, KHÔNG phải serve:bench.
// ⚠️ Chạy kịch bản này SAU CÙNG: nó sẽ khóa IP của bạn ~60 giây (sau đó tự hết).
//    Muốn mở khóa ngay: docker exec vulncell-redis-1 redis-cli --scan --pattern "api:*"  rồi DEL từng key.
//
// Cách chạy (từ thư mục gốc vulncell/):
//   k6 run bench/k6/api-spam.js
//   k6 run --summary-export=bench/results/security-spam.json bench/k6/api-spam.js
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:4000';
const QUICK = __ENV.QUICK === 'true';

const c200 = new Counter('api_200_qua_duoc');
const c429 = new Counter('api_429_DA_BI_CHAN');

export const options = {
  scenarios: {
    spam: {
      executor: 'constant-vus',
      vus: QUICK ? 3 : 8,
      duration: QUICK ? '6s' : '20s',
    },
  },
};

export default function () {
  // Endpoint rẻ nhất, có cache — mục tiêu là CHẠM TRẦN số request, không phải làm chậm DB
  const res = http.get(`${BASE}/api/reports?disclosed=true&pageSize=1`);

  if (res.status === 200) c200.add(1);
  if (res.status === 429) c429.add(1);

  check(res, { '200 hoac 429': (r) => r.status === 200 || r.status === 429 });
}
