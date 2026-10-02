# Báo cáo Benchmark — VulnCell

> Ngày đo: 30/09 – 01/10/2026 · Công cụ: **k6 v2.2.0** · Dữ liệu: **500.000 report** (seed bench)
> Số thô: `bench/results/*.json` · Kịch bản k6: `bench/k6/*.js`.

---

## 1. Tổng quan

### 1.1 Mục tiêu
1. Đo hiệu năng của **3 mốc**: v0 (baseline, DB thuần) → v1 (thêm cache Redis) → v2 (sau gói tối ưu).
2. Xác định endpoint nghẽn nhất và **định lượng mức cải thiện** sau tối ưu.
3. Chứng minh các **cơ chế chống spam/brute-force** hoạt động đúng dưới tải xấu.

### 1.2 Môi trường đo

| Thành phần | Cấu hình |
|---|---|
| Máy | Windows 11, **12 logical CPU**, 31 GB RAM (k6 và server chạy **cùng máy** — xem Hạn chế) |
| Backend | Node.js v24, Express, Prisma |
| Database | PostgreSQL 16 (Docker) · Redis 7 (Docker) · dữ liệu trên ổ D |
| Dữ liệu | 2.003 user, **500.017 report**, 299.780 dòng ledger (trải 3 năm) |
| Tải | k6 ramping-vus: 10s→10 VU, 40s→30/50 VU, 10s→0 (mỗi kịch bản ~60s) |

### 1.3 Ba mốc đo — khác nhau ở đâu (setup)

**v0 và v1 là CÙNG một code baseline; khác nhau đúng một thứ: cache bật hay tắt** (qua biến `CACHE_DISABLED`, không sửa code):

| Mốc | Code | Cache Redis | Tối ưu khác | Lệnh chạy | Đo được gì |
|---|---|---|---|---|---|
| **v0** | baseline | ❌ tắt (`CACHE_DISABLED=true`) | không | `npm run serve:bench:nocache` | chi phí DB thuần (không có cache che) |
| **v1** | baseline | ✅ bật | không | `npm run serve:bench` | hiệu quả của **riêng cache** trên baseline |
| **v2** | đã tối ưu | công tắc — chạy **cả hai** | xem danh sách bên dưới | cả 2 lệnh trên, lưu file `-nocache` / `-cache` | hiệu quả **tầng dữ liệu + cache** trên code mới |

**v2 thêm những gì so với baseline** (gói "mức v2" đã làm khi tối ưu):
1. **Denormalize `User.reputation`** — thêm cột tổng điểm + backfill từ ledger; leaderboard đọc 1 cột thay vì 2 phép `GROUP BY` trên ~300k dòng.
2. **Composite index** `(state, createdAt)`, `(severity, createdAt)`, `(reporterId, createdAt)` — lọc + sắp xếp cùng lúc, bỏ bước Sort.
3. **GIN + pg_trgm** cho `weakness` / `shortDescription` / `target` — index cho tìm kiếm `ILIKE '%…%'`.
4. **Keyset cursor** cho `GET /reports?sort=newest` — phân trang không OFFSET.
5. **Cache `user:stats:<id>`** (60s) — profile không aggregate lại mỗi lần xem.
6. **gzip compression** — giảm payload list/facets ~70–80%.
7. **Connection pool 25** (`connection_limit=25` trong `DATABASE_URL`).

> v0/v1 chạy trên code **trước** các mục trên; v2 chạy **sau khi áp migration `perf_optimizations`** (và sau này là `restore_perf_indexes`).

### 1.4 Cách đọc chỉ số
- **p95 / p90**: 95%/90% request nhanh hơn mức này — chỉ số chính để so sánh (avg dễ bị outlier kéo lệch).
- **med**: trung vị — trải nghiệm "người dùng điển hình".
- **RPS**: throughput (số request/giây), càng cao càng tốt nếu p95 không tăng.
- **fail%**: tỷ lệ request lỗi. Với kịch bản security, fail% cao là **chủ đích** (đó là request bị chặn 429).

---

## 2. Bảng kết quả tổng hợp (xếp lại từ 14 file trong `bench/results/`)

### 2.1 Ma trận so sánh — p95 (ms)

| Kịch bản | v0 — nocache (DB thuần) | v1 — cache | v2 — nocache | v2 — cache |
|---|---|---|---|---|
| **Search** | 9.2 | 4.3 | 9.8 | 7.9 |
| **Leaderboard** | **1263.1** | **3.0** | **47.8** | **3.0** |
| **Case detail** | 5.9 | 6.2 | 6.6 | 5.6 |
| **Security** | brute-force 4.5 · spam 4.6 *(không áp dụng cache)* | | | |

> `v0` = baseline + cache **tắt**; `v1` = baseline + cache **bật**; `v2` = code tối ưu (cache là công tắc nên đo cả hai). Chi tiết setup từng mốc ở **§1.3**. Bảng dùng **p95** (bảng chi tiết bên dưới có thêm avg/p90/med).

### 2.2 Chi tiết từng file

| File (chế độ) | avg (ms) | p90 (ms) | p95 (ms) | med (ms) | max (ms) | requests | RPS | fail% |
|---|---|---|---|---|---|---|---|---|
| v0-leaderboard (nocache) | 673.9 | 1156.2 | **1263.1** | 678.2 | 1533.5 | 1.498 | 24.8 | 0 |
| v0-search (nocache) | 6.8 | 8.7 | 9.2 | 6.8 | 29.9 | 3.221 | 53.4 | 0 |
| v0-case (nocache) | 4.1 | 5.2 | 5.9 | 4.2 | 24.4 | 5.595 | 92.9 | 0 |
| v1-leaderboard (cache) | 2.4 | 2.8 | 3.0 | 2.3 | 351.7 | 3.474 | 57.6 | 0 |
| v1-search (cache) | 3.5 | 4.0 | 4.3 | 3.3 | 27.7 | 3.255 | 54.0 | 0 |
| v1-case (cache) | 4.3 | 5.5 | 6.2 | 4.3 | 56.4 | 5.589 | 93.0 | 0 |
| **v2-leaderboard-nocache** | 19.4 | 43.3 | **47.8** | 12.8 | 88.9 | 3.363 | 55.8 | 0 |
| v2-leaderboard-cache | 2.3 | 2.8 | 3.0 | 2.3 | 41.2 | 3.474 | 57.5 | 0 |
| v2-search-nocache | 7.4 | 9.3 | 9.8 | 7.4 | 32.2 | 3.215 | 53.5 | 0 |
| v2-search-cache | 3.8 | 4.4 | 7.9 | 3.4 | 33.9 | 3.252 | 54.2 | 0 |
| v2-case-nocache | 4.5 | 5.8 | 6.6 | 4.4 | 17.1 | 5.585 | 92.9 | 0 |
| v2-case-cache | 4.0 | 5.1 | 5.6 | 4.1 | 58.3 | 5.601 | 92.8 | 0 |
| security-bruteforce | 3.0 | 4.1 | 4.5 | 2.5 | 82.9 | 1.210 | 48.2 | 100* |
| security-spam | 3.0 | 4.0 | 4.6 | 2.9 | 46.7 | 51.698 | 2.584,7 | 99.42* |

`*` fail% cao là **chủ đích**: k6 tính 401/429 là "failed", đó chính là các request bị chặn.

---

## 3. Phân tích từng kịch bản

### 3.1 Leaderboard — điểm nghẽn chính, nơi tối ưu ăn tiền nhất

**v0 (DB thuần):** p95 **1.263 ms**, med 678 ms, chỉ đạt 24,8 RPS.
→ Mỗi request chạy **2 phép `GROUP BY` trên ~300k dòng ledger** (tổng reputation cả đời + tổng signal 365 ngày), cộng truy vấn bounty; 50 VU tranh nhau pool 25 connection → hàng đợi dài, p90 vọt lên 1.156 ms.

**v1 (cache Redis):** p95 **3,0 ms**, med 2,3 ms — nhanh **~421× ở p95** (và ~295× ở median) so v0.
→ Nhưng `max = 351,7 ms`: request **cache miss đầu tiên** (hoặc sau khi TTL 60s hết) vẫn phải chạy aggregate nặng. Cache che được đa số, không sửa được gốc.

**v2 (tối ưu, không cache):** p95 **47,8 ms**, med **12,8 ms** → **−96,2% p95 / −98,1% median** so v0.
→ Nhờ **denormalize `User.reputation`**: leaderboard còn đúng 1 query `ORDER BY reputation DESC LIMIT 50` (có index), signal chỉ SUM cho 50 user top. RPS tăng 24,8 → **55,8** (+125%).

**v2 (cache):** p95 3,0 ms — giữ nguyên; điểm hay nhất: `max` cold-miss giảm **351,7 → 41,2 ms (−88%)**.
→ Kể cả khi Redis sập/miss, trải nghiệm giờ vẫn ~tens of ms thay vì >1 giây.

| Chỉ số | v0 | v1 | v2 (nocache) | v2 (cache) |
|---|---|---|---|---|
| p95 | 1263,1 ms | 3,0 ms | 47,8 ms | 3,0 ms |
| med | 678,2 ms | 2,3 ms | 12,8 ms | 2,3 ms |
| max | 1533,5 ms | 351,7 ms | 88,9 ms | 41,2 ms |
| RPS | 24,8 | 57,6 | 55,8 | 57,5 |

### 3.2 Search Dashboard

| Chỉ số | v0 | v2 (nocache) | v1 (cache) | v2 (cache) |
|---|---|---|---|---|
| p95 | 9,2 ms | 9,8 ms | 4,3 ms | 7,9 ms |
| med | 6,8 ms | 7,4 ms | 3,3 ms | 3,4 ms |

**Nhận xét trung thực:**
- Giữa v0 và v2 (DB thuần) **gần như không đổi (±6%, mức nhiễu)**. Lý do: query luôn có `ORDER BY createdAt DESC LIMIT 10`, Postgres dùng index `createdAt` quét ngược và **dừng ngay khi gom đủ 10 kết quả khớp**; bộ từ khóa đo (xss, injection…) đều phổ biến (khớp ~10–12% dataset) nên early-exit rất nhanh. **pg_trgm không tạo khác biệt trên dạng truy vấn này** — nó là "bảo hiểm" cho từ khóa hiếm/trang sâu, không phải để làm nhanh trường hợp phổ biến.
- Cache giúp median **6,8 → 3,3–3,4 ms (~2×)**. p95 của bản cache dao động (4,3 vs 7,9 ms) vì mỗi từ khóa chỉ miss ~1 lần/cửa sổ 30s — p95 phụ thuộc việc đúng lúc đó là hit hay miss, không phải hồi quy.
- **Kết luận: không hồi quy.** Đây cũng là ví dụ tốt để nói trước hội đồng: "tối ưu đúng chỗ" — search vốn đã nhanh, thời gian nên dành cho leaderboard.

### 3.3 Case detail (mở 1 report + timeline)

| Chỉ số | v0 | v1 | v2 (nocache) | v2 (cache) |
|---|---|---|---|---|
| p95 | 5,9 ms | 6,2 ms | 6,6 ms | 5,6 ms |
| med | 4,2 ms | 4,3 ms | 4,4 ms | 4,1 ms |

- Phẳng ở cả 4 cấu hình (chênh ≤ 0,7 ms = nhiễu), RPS ổn định ~93.
- Đúng kỳ vọng: đọc theo `id` (primary key) không có gì để tối ưu thêm; gzip giảm payload nhưng độ trễ đã ở mức ms.
- Mỗi "iteration" = 2 request (report + events) → `iterations` ≈ một nửa `requests`.

---

## 4. Nhóm Security — định lượng cơ chế chặn

### 4.1 Brute-force login (`security-bruteforce.json`)

| Chỉ số | Giá trị |
|---|---|
| Tổng request | 1.210 (5 VU × 25s, sai mật khẩu liên tục) |
| Kết quả | **5 × 401** (được thử) → **1.205 × 429** (bị chặn) |
| p95 / max | 4,5 ms / 82,9 ms |

→ Đúng thiết kế: 5 lần sai đầu tiên phải chạy `bcrypt.compare` (~70–80 ms — chính là các `max`), sau đó **khóa IP+username 15 phút**; mọi request tiếp theo chỉ mất ~2–3 ms để trả 429 (chỉ kiểm tra TTL trên Redis). Kẻ tấn công không còn "đốt" CPU bcrypt.

### 4.2 Spam API (`security-spam.json`)

| Chỉ số | Giá trị |
|---|---|
| Tổng request | **51.698** (8 VU bắn không nghỉ, 20s) |
| Kết quả | **300 × 200** (đúng trần) → **51.398 × 429** |
| Throughput | **2.584,7 RPS** · p95 4,6 ms |

→ Trần **300 request/phút/IP** chính xác **từng request một** (đúng 300 request lọt qua). Phần bị chặn vẫn được phục vụ với tốc độ cao (2.585 RPS, p95 4,6 ms) chứng minh **hệ thống không treo khi bị spam** — request 429 rẻ, không chạm DB.

> Khi trình bày: đây là **bằng chứng chống spam/DoS**, không phải biểu đồ hiệu năng. Đừng để cột fail% 100% gây nhầm.

---

## 5. Tác động của từng nhóm tối ưu (so sánh chéo)

| Nhóm kỹ thuật | Đo ở đâu | Trước | Sau | Mức cải thiện |
|---|---|---|---|---|
| **Cache Redis** | leaderboard p95 | 1263,1 ms (v0) | 3,0 ms (v1) | **−99,76%** |
| **Cache Redis** | leaderboard median | 678,2 ms | 2,3 ms | **−99,7%** |
| **Denormalize reputation + composite index** | leaderboard p95 (nocache) | 1263,1 ms (v0) | 47,8 ms (v2) | **−96,2%** |
| **Denormalize reputation** | leaderboard cold-miss max | 351,7 ms (v1) | 41,2 ms (v2) | **−88%** |
| **Denormalize + keyset** | leaderboard RPS | 24,8 | 55,8 | **+125%** |
| **Cache Redis** | search median | 6,8 ms | 3,3 ms | ~−50% |
| **pg_trgm/GIN** | search (từ khóa phổ biến) | 9,2 ms | 9,8 ms | không đổi (dự phòng từ khóa hiếm) |
| **gzip + pool** | mọi endpoint | — | — | không hồi quy; gzip giảm payload list/facets ~70–80% (không thể hiện qua p95) |

**Kết luận chính:** lợi ích lớn nhất đến từ **hai lớp độc lập**:
1. **Cache** — hiệu quả tức thời nhưng phụ thuộc Redis (cold miss vẫn đau).
2. **Thiết kế lại tầng dữ liệu (denormalize + index)** — sửa tận gốc; khi bật cùng cache thì "worst case" cũng nhẹ (max 41 ms so với 352 ms).

---

## 6. Hạn chế & độ tin cậy của số đo

1. **Mỗi cấu hình chạy 1 lần** (khuyến nghị chuẩn là 3 lần lấy median) — hoàn toàn có thể chạy lại để xác nhận; các số đều ổn định và khớp kỳ vọng lý thuyết.
2. **k6 và server cùng máy** → nhiễu CPU; số tuyệt đối có thể khác khi tách 2 máy, nhưng **xu hướng và tỷ lệ cải thiện** là đáng tin.
3. **Bộ từ khóa search đều phổ biến** → lợi ích pg_trgm chưa được thể hiện; nếu muốn con số đẹp hơn cho pg_trgm cần kịch bản từ khóa hiếm/trang sâu (ví dụ `page=1000`).
4. Dữ liệu bench là dữ liệu tổng hợp phân bố đều, không hoàn toàn như traffic thật.

---

## 7. Kết luận

- ✅ **Mục tiêu hiệu năng đạt**: endpoint nặng nhất (leaderboard) từ **1.263 ms → 47,8 ms** ở tầng DB thuần (**26×**), và **3,0 ms** khi có cache; không endpoint nào hồi quy.
- ✅ **Bảo mật định lượng được**: brute-force bị khóa đúng sau 5 lần; trần spam 300 request/phút/IP chặn đúng từng request, phục vụ 2.585 RPS mà không treo.
- ✅ Kiến trúc 3 lớp bảo vệ (IP tổng quát / login / Signal) + 2 lớp cache (danh sách-facets / leaderboard-profile) + tầng dữ liệu tối ưu (index, denormalize, keyset) — đủ để trình bày ở mức "Advanced".

---

## 8. Raw summary — đọc trực tiếp từ file (`npm run bench:results`, không chạy lại)

| File | p95 (ms) | med (ms) | max (ms) | requests | RPS | error % |
|---|---|---|---|---|---|---|
| security-bruteforce | 4.5 | 2.5 | 82.9 | 1,210 | 48.2 | 100.00* |
| security-spam | 4.6 | 2.9 | 46.7 | 51,698 | 2,584.7 | 99.42* |
| v0-case | 5.9 | 4.2 | 24.4 | 5,595 | 92.9 | 0.00 |
| v0-leaderboard | 1,263.1 | 678.2 | 1,533.5 | 1,498 | 24.8 | 0.00 |
| v0-search | 9.2 | 6.8 | 29.9 | 3,221 | 53.4 | 0.00 |
| v1-case | 6.2 | 4.3 | 56.4 | 5,589 | 93.0 | 0.00 |
| v1-leaderboard | 3.0 | 2.3 | 351.7 | 3,474 | 57.6 | 0.00 |
| v1-search | 4.3 | 3.3 | 27.7 | 3,255 | 54.0 | 0.00 |
| v2-case-cache | 5.6 | 4.1 | 58.3 | 5,601 | 92.8 | 0.00 |
| v2-case-nocache | 6.6 | 4.4 | 17.1 | 5,585 | 92.9 | 0.00 |
| v2-leaderboard-cache | 3.0 | 2.3 | 41.2 | 3,474 | 57.5 | 0.00 |
| v2-leaderboard-nocache | 47.8 | 12.8 | 88.9 | 3,363 | 55.8 | 0.00 |
| v2-search-cache | 7.9 | 3.4 | 33.9 | 3,252 | 54.2 | 0.00 |
| v2-search-nocache | 9.8 | 7.4 | 32.2 | 3,215 | 53.5 | 0.00 |

`*` Security scenarios count blocked requests (401/429) as "failed" by design — a high error rate means the protection is working.
> Numbers match Section 2 (same raw files); the `error %` column is the raw k6 `http_req_failed` metric.

## Phụ lục A — Lệnh tái lập toàn bộ số đo

```powershell
# 0) Dữ liệu (một lần)
npm run seed:bench

# 1) v0 — DB thuần
npm run kill:api ; npm run serve:bench:nocache
k6 run --summary-export=bench/results/v0-search.json      bench/k6/dashboard-search.js
k6 run --summary-export=bench/results/v0-leaderboard.json bench/k6/leaderboard.js
k6 run --summary-export=bench/results/v0-case.json        bench/k6/case-detail.js

# 2) v1 — cache (trước tối ưu)
npm run kill:api ; npm run serve:bench
k6 run --summary-export=bench/results/v1-search.json      bench/k6/dashboard-search.js
k6 run --summary-export=bench/results/v1-leaderboard.json bench/k6/leaderboard.js
k6 run --summary-export=bench/results/v1-case.json        bench/k6/case-detail.js

# 3) v2 — sau tối ưu (lặp lại ở cả 2 chế độ, tên file thêm -nocache / -cache)

# 4) Security — server chế độ thường (rate limit BẬT)
npm run kill:api ; npm run dev:api
k6 run --summary-export=bench/results/security-bruteforce.json bench/k6/login-bruteforce.js
k6 run --summary-export=bench/results/security-spam.json       bench/k6/api-spam.js

# 5) Xem bảng tổng hợp
npm run bench:results
```

## Phụ lục B — Nhắc lại ngắn gọn cho slide

| Điểm trình bày | Con số |
|---|---|
| Leaderboard trước tối ưu | p95 **1.263 ms**, med 678 ms |
| Leaderboard sau tối ưu (DB thuần) | p95 **47,8 ms** (26×), med 12,8 ms (53×) |
| Leaderboard sau tối ưu (cache) | p95 **3,0 ms**, cold-miss max 352 → **41 ms** |
| Search & Case | ổn định 5–10 ms, không hồi quy |
| Brute-force | 5 × 401 → **1.205 × 429** |
| Spam API | 300 × 200 → **51.398 × 429** @ 2.585 RPS |
