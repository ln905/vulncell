// KỊCH BẢN 4 (SECURITY): Brute-force login — chứng minh cơ chế chặn "5 lần sai/phút → khóa 15 phút".
//
// ⚠️ Server phải chạy CHẾ ĐỘ THƯỜNG (rate limit BẬT) — tức npm run dev, KHÔNG phải serve:bench.
// Mỗi lần chạy dùng 1 username giả mới (theo timestamp) để demo lặp lại được.
//
// Cách chạy (từ thư mục gốc vulncell/):
//   k6 run bench/k6/login-bruteforce.js
//   k6 run --summary-export=bench/results/security-bruteforce.json bench/k6/login-bruteforce.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:4000';
const QUICK = __ENV.QUICK === 'true';

// Username mục tiêu: mặc định là tài khoản KHÔNG tồn tại, mới mỗi lần chạy
const TARGET = __ENV.TARGET_USERNAME || `bruteforce_demo_${Date.now()}`;

// 2 bộ đếm riêng để nhìn rõ "trước khi bị chặn" và "sau khi bị chặn"
const c401 = new Counter('login_401_sai_mat_khau');
const c429 = new Counter('login_429_DA_BI_CHAN');

export const options = {
  scenarios: {
    bruteforce: {
      executor: 'constant-vus', // giữ số user ảo cố định, bắn liên tục
      vus: QUICK ? 2 : 5,
      duration: QUICK ? '6s' : '25s',
    },
  },
};

export default function () {
  const body = JSON.stringify({
    username: TARGET,
    password: `sai_${Math.random().toString(36).slice(2)}`, // mật khẩu rác
  });

  const res = http.post(`${BASE}/api/auth/login`, body, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (res.status === 401) c401.add(1);
  if (res.status === 429) c429.add(1);

  check(res, { 'bi chan 429 hoac sai 401': (r) => r.status === 401 || r.status === 429 });
  sleep(0.1);
}
