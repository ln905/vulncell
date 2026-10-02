# Mẫu report để submit thử (dán trực tiếp vào form)

> Dùng để demo nhanh: đăng nhập tài khoản HACKER — ví dụ **`reporter1` / `password123`** — rồi bấm **Submit Report** trên navbar và dán từng ô bên dưới.
> ⚠️ Đừng dùng `reporter10` (Signal đang âm → **bị khóa nộp**, nút Submit bị làm mờ).
> Nội dung report viết tiếng Anh cho khớp giao diện.

## Demo sau khi nộp (2 phút)

1. Nộp xong hệ thống chuyển thẳng vào trang Case — kéo xuống block **Proof of concept**: header `Code · <dung lượng>`, nút **wrap / copy / collapse**, có số dòng.
2. Đăng nhập **`admin`** → mở case đó → **Change State → Triaged**, chọn **Triage Severity**, rồi **Resolved + Award Bounty** → xem timeline đổi chấm màu, điểm nhảy ở Profile/Leaderboard.

---

## Mẫu 1 — SQL Injection (code block dài, hợp để thử nút wrap/collapse)

| Ô trên form | Giá trị dán vào |
|---|---|
| Target * | `vulncell.dev/login` |
| Weakness * | `SQL Injection` |
| CVE ID | `CVE-2026-31337` (hoặc để trống) |
| Short Description * | `Time-based blind SQL injection in the login redirect parameter` |
| Proof of Concept / Details * | dán nguyên khối dưới đây |

````markdown
## Description
The `redirect` parameter is concatenated into a server-side SQL query without parameterisation. A time-based payload makes the database sleep, proving the value reaches SQL unsanitised.

## Steps to reproduce
1. Open `https://vulncell.dev/login?redirect=%2Fhome`
2. Replace the value with the payload below and send the request.
3. The response is delayed by about 5 seconds — blind SQL injection confirmed.

## Proof of concept
```
POST /login HTTP/2
Host: vulncell.dev
Content-Type: application/x-www-form-urlencoded
Cookie: [session cookie]

redirect=1' AND SLEEP(5)-- -
```

## Impact
An attacker can enumerate and extract rows from the `users` table (emails, password hashes) and, depending on database privileges, read files from the database host.
````

---

## Mẫu 2 — IDOR (cross-tenant export)

| Ô trên form | Giá trị dán vào |
|---|---|
| Target * | `api.vulncell.dev/v2/export` |
| Weakness * | `IDOR` |
| CVE ID | (để trống) |
| Short Description * | `IDOR lets an authenticated user export another tenant's data` |
| Proof of Concept / Details * | dán nguyên khối dưới đây |

````markdown
## Description
`GET /v2/export` returns the export for any `tenant_id` without verifying that the caller belongs to that tenant.

## Steps to reproduce
1. Log in as tenant A and capture the bearer token.
2. Call the export endpoint with tenant B's id (request below).
3. The response contains tenant B's records.

## Proof of concept
```
GET /v2/export?tenant_id=<victim-uuid> HTTP/2
Host: api.vulncell.dev
Authorization: Bearer <attacker-token>
Accept: text/csv
```

## Impact
Full cross-tenant data disclosure (customer lists, invoices) with a single request per tenant id — no brute force required.
````

---

## Mẫu 3 — Reflected XSS (ngắn, hợp để thử severity MEDIUM/LOW)

| Ô trên form | Giá trị dán vào |
|---|---|
| Target * | `shop.vulncell.dev/search` |
| Weakness * | `Reflected XSS` |
| CVE ID | (để trống) |
| Short Description * | `Reflected XSS in the search query parameter` |
| Proof of Concept / Details * | dán nguyên khối dưới đây |

````markdown
## Description
The `q` parameter is echoed back into the results page without output encoding.

## Steps to reproduce
1. Open the URL below in a browser.
2. An alert box appears — the script executes in the page context.

## Proof of concept
```
GET /search?q=<script>alert(document.domain)</script> HTTP/2
Host: shop.vulncell.dev
```

## Impact
An attacker can run arbitrary JavaScript in a victim's session via a crafted link (session theft, phishing, unauthorised actions).
````

---

## Mẹo

- **Nhiều dòng code dài** → thử nút **wrap** trong code block; **copy** để lấy lại payload; **collapse** để thu gọn khi timeline dài.
- Muốn thử **giới hạn nộp theo Signal**: `reporter10` (Signal −30) thấy nút Submit mờ + banner đỏ ở trang Submit; `reporter9` (Signal 0) chỉ nộp được **1 report/ngày**.
- Muốn thử **privacy của SPAM**: admin đổi một report thành `SPAM` → khách/người khác không thấy, chủ nick thấy kèm nhãn **Private**.
- Nộp xong muốn xóa bớt bài test: `npm run seed:reset` (reset sạch về 11 tài khoản + 100 report mẫu).
