// Đọc tất cả file JSON trong bench/results/ và in bảng so sánh.
// Cách dùng:  npm run bench:results      (từ thư mục gốc)
//             node bench/read-results.js
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'results');
const val = (d, name) => (d.metrics && d.metrics[name] && (d.metrics[name].values || d.metrics[name])) || {};

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

if (files.length === 0) {
  console.log('Chưa có file kết quả nào trong bench/results/.');
  console.log('Ví dụ chạy: k6 run --summary-export=bench/results/v0-search.json bench/k6/dashboard-search.js');
  process.exit(0);
}

console.log('');
console.log('File                          | p95(ms) | p99(ms) | med(ms) | max(ms) | requests | RPS   | error%');
console.log('------------------------------|---------|---------|---------|---------|----------|-------|-------');

for (const f of files) {
  let d;
  try {
    d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  } catch {
    continue;
  }
  const dur = val(d, 'http_req_duration');
  const req = val(d, 'http_reqs');
  const fail = val(d, 'http_req_failed');
  // k6 v1: fail.rate · k6 v2: fail.value (tỷ lệ lỗi)
  const failRate = fail.rate ?? fail.value ?? 0;
  console.log(
    [
      f.replace('.json', '').padEnd(29),
      (dur['p(95)'] ?? 0).toFixed(1).padStart(7),
      (dur['p(99)'] ?? NaN).toFixed(1).padStart(7),
      (dur.med ?? 0).toFixed(1).padStart(7),
      (dur.max ?? 0).toFixed(1).padStart(7),
      String(req.count ?? 0).padStart(8),
      (req.rate ?? 0).toFixed(1).padStart(5),
      (failRate * 100).toFixed(2).padStart(6),
    ].join(' | ')
  );
}
console.log('');
console.log('p99 hiện không được in mặc định. Muốn có p99, chạy k6 kèm flag:');
console.log('  k6 run --summary-trend-stats="avg,min,med,p(90),p(95),p(99),max" ...');
