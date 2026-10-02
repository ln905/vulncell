# Host demo VulnCell qua Cloudflare Tunnel (ghi chú để tái sử dụng)

> Mục đích: sau khi format/đổi máy, chỉ cần đọc file này là host lại được bản demo cho người khác xem qua Internet — **không cần mở firewall, không cần cấu hình router, chạy được cả sau CGNAT/4G**.
> Lần host gần nhất: **02–03/10/2026**, máy Windows này, cloudflared đặt tại `D:\cloudflared\cloudflared.exe`.

## 0. Cần có gì

| Thứ | Ghi chú |
|---|---|
| **Docker Desktop** | Mở lên, chờ engine báo "Running" |
| **Repo VulnCell** | Bản đầy đủ (kèm tài liệu): `https://github.com/ln905/vulncell-demo` · Bản sạch (1 commit): `https://github.com/ln905/vulncell` |
| **cloudflared** | File portable — nếu mất thì tải lại: `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe` → lưu thành `D:\cloudflared\cloudflared.exe` |

## 1. Bật demo ở localhost:8080

```powershell
cd "D:\GrindingNal\USTH\Web Application Development\vulncell"   # repo chính (hoặc thư mục vulncell-release)
docker compose -p vulncell-demo -f docker-compose.demo.yml up -d --build
# chờ ~30–60 giây, kiểm tra:
curl.exe -s http://localhost:8080/health        # mong đợi {"ok":true}
```

- Container **tự chạy migrate + seed** khi khởi động; dữ liệu nằm trong volume `vulncell-demo_demo_db_data` nên **không mất** khi tắt/mở.
- Muốn dữ liệu sạch như mới:
  ```powershell
  docker exec vulncell-demo-backend-1 node prisma/seed.js --force
  docker exec vulncell-demo-redis-1 redis-cli flushdb
  ```
- Tài khoản demo: `admin`, `reporter1` … `reporter10` — mật khẩu `password123`.

## 2. Mở tunnel công khai

```powershell
D:\cloudflared\cloudflared.exe tunnel --url http://localhost:8080 --no-autoupdate
```

- Chờ ~5 giây, terminal in ra link dạng: `https://<vài-từ-ngẫu-nhiên>.trycloudflare.com`
- Gửi link đó cho mọi người — mở được từ **mọi mạng** (kể cả 4G).

## 3. Kiểm tra & chia sẻ

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" https://<link-vừa-in>/health   # mong đợi 200
```

- **Nếu cả lớp cùng mở**: qua tunnel mọi người **chung một "rổ" IP** ở lớp rate-limit 1 (300 request/phút) → nên nâng giới hạn: sửa `docker-compose.demo.yml`, dòng `RATE_LIMIT_API_MAX: "300"` → `"2000"`, rồi `up -d` lại.

## 4. Tắt dọn

```powershell
Stop-Process -Name cloudflared                                   # tắt tunnel
docker compose -p vulncell-demo -f docker-compose.demo.yml down  # tắt demo (GIỮ dữ liệu)
# docker compose -p vulncell-demo -f docker-compose.demo.yml down -v   # CHỈ dùng khi muốn xoá sạch dữ liệu
```

## 5. Lưu ý quan trọng (đọc trước khi demo)

- **Link tạm**: URL đổi mỗi lần chạy cloudflared; máy crash/reboot → chạy lại lệnh ở mục 2 là có URL mới (gửi lại cho lớp).
- **Tunnel sống cùng máy**: app + tunnel đều chạy trên máy host. Máy tắt = link chết (nhưng demo `localhost` vẫn chạy nếu máy còn).
- **Không cần mở firewall** cho tunnel (chỉ kết nối outbound). Chỉ cần mở port 8080 nếu muốn người khác vào qua **LAN** (`http://<IP-LAN>:8080`).
  - Lệnh mở LAN (PowerShell admin): `New-NetFirewallRule -DisplayName "VulnCell demo 8080" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow`
- Muốn **URL cố định** (ví dụ `demo.tenmien.com`): cần tài khoản Cloudflare + tên miền → dùng "named tunnel" — hướng dẫn: https://developers.cloudflare.com/cloudflare-tunnel/
- Muốn chạy ở **chế độ dev** (hot reload): `npm run dev` → web `:5173`, API `:4000` (có thể trỏ tunnel vào `http://localhost:5173`).

## 6. Nếu máy host bị "màn hình xanh" giữa chừng

- Docker Desktop tự khởi động cùng Windows + container `restart: unless-stopped` → sau khi đăng nhập lại, stack **tự lên trong ~1–3 phút**, dữ liệu nguyên vẹn.
- Tunnel không tự chạy lại → mở PowerShell, chạy lại mục 2 (URL mới).
- Giảm rủi ro BSOD (đã làm 03/10/2026): VMware services stopped+disabled, `VMnet*` adapters disabled, `powercfg /change standby-timeout-ac 0`. Nghi phạm còn lại: **driver Wi-Fi MediaTek MT7921 (bản 2022)** — nên cập nhật driver sau.

---

### TL;DR — 3 lệnh để host lại

```powershell
docker compose -p vulncell-demo -f docker-compose.demo.yml up -d --build
D:\cloudflared\cloudflared.exe tunnel --url http://localhost:8080 --no-autoupdate
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:8080/health
```
