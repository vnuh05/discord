# 🤖 Discord Shop Bot - Full Featured

Bot Discord bán acc tự động với dashboard quản lý, hỗ trợ thanh toán ngân hàng (Sepay) và gạch thẻ.

---

## 📦 Tính Năng

### 🛒 Shop & Bán Acc
- ✅ Gửi form card (embed) tự động vào kênh shop
- ✅ Xem stock theo loại acc
- ✅ Thanh toán ngân hàng tự động qua **Sepay webhook**
- ✅ Gạch thẻ cào tự động qua **API thẻ siêu rẻ**
- ✅ Gửi acc tự động qua DM khi thanh toán xong
- ✅ Tạo ticket hỗ trợ tự động sau mỗi đơn hàng

### 🎫 Ticket System (giống bot nổi tiếng)
- ✅ Tạo ticket → channel riêng, ẩn với mọi người
- ✅ Thông báo CSKH, random người nhận
- ✅ Timer 5 phút: nếu không ai nhận → random người khác (trừ người đã được random trước)
- ✅ CSKH nhận ticket → chỉ người đó thấy
- ✅ Đánh giá 1-5 sao sau khi đóng ticket
- ✅ Đăng đánh giá lên kênh review

### 👥 CSKH
- ✅ Role CSKH riêng
- ✅ Nhận ticket ngẫu nhiên
- ✅ Ghi nhận đơn bán được
- ✅ Lương 7,000đ/đơn
- ✅ Bảng lương tháng → `/salary`

### 📊 Chi Tiêu & Role
- ✅ Tự động cập nhật chi tiêu khách hàng
- ✅ Tự động up role theo mức chi tiêu
- ✅ Bảng xếp hạng tháng → `/leaderboard`
- ✅ Reset chi tiêu đầu mỗi tháng (cron)

### 🛡️ Moderation
- ✅ Anti-spam link (block invite Discord, link rút gọn)
- ✅ Anti-spam tin nhắn → tự động mute 10 phút
- ✅ Anti-raid (10 người join/10 giây → lockdown)
- ✅ `/ban`, `/kick`, `/mute`, `/purge`
- ✅ Log toàn bộ hành động mod

### 🌐 Dashboard Web
- ✅ Đăng nhập bảo mật
- ✅ Tổng quan: doanh thu, stock, đơn hàng, ticket
- ✅ Quản lý acc: thêm bulk, xóa, filter
- ✅ Xem danh sách đơn hàng
- ✅ Bảng khách hàng & chi tiêu
- ✅ Quản lý ticket
- ✅ Bảng lương CSKH

---

## 🚀 Cài Đặt

### 1. Yêu cầu
- Node.js >= 18
- MongoDB (local hoặc MongoDB Atlas)

### 2. Cài packages
```bash
cd discord-bot
npm install
```

### 3. Cấu hình .env
```bash
cp .env.example .env
# Chỉnh sửa .env với thông tin của bạn
```

**Các thứ cần điền:**
| Biến | Mô tả |
|---|---|
| `DISCORD_TOKEN` | Token bot từ Discord Developer Portal |
| `CLIENT_ID` | Application ID của bot |
| `GUILD_ID` | Server ID của bạn |
| `MONGODB_URI` | Chuỗi kết nối MongoDB |
| `SEPAY_API_KEY` | API key từ Sepay.vn |
| `SEPAY_WEBHOOK_SECRET` | Secret key của webhook Sepay |
| `BANK_ACCOUNT_NUMBER` | Số tài khoản ngân hàng nhận tiền |
| `BANK_NAME` | Tên ngân hàng (VD: VCB, TCB, MB) |
| `CARD_API_PARTNER_ID` | Partner ID từ thesieure.com |
| `CARD_API_PARTNER_KEY` | Partner Key từ thesieure.com |
| `CS_ROLE_ID` | Role ID của CSKH trên server |
| `SHOP_CHANNEL_ID` | Kênh gửi form shop |
| `NOTIFY_CS_CHANNEL_ID` | Kênh thông báo ticket cho CSKH |
| `TICKET_CATEGORY_ID` | Category chứa các ticket channel |

### 4. Chạy Bot
```bash
npm start
```

### 5. Chạy Dashboard
```bash
npm run dashboard
# Truy cập: http://localhost:3000
```

---

## ⚙️ Cấu Hình Sepay Webhook

1. Đăng nhập [Sepay.vn](https://sepay.vn)
2. Vào **Tài khoản → Webhook**
3. Nhập URL: `http://your-server-ip:3000/webhook/sepay`
4. Lấy Secret Key → điền vào `SEPAY_WEBHOOK_SECRET`

---

## ⚙️ Cấu Hình Gạch Thẻ

Đăng ký tại [thesieure.com](https://thesieure.com) → Lấy `Partner ID` và `Partner Key`.

---

## 📁 Cấu Trúc File

```
discord-bot/
├── src/
│   ├── index.js            # Entry point bot
│   ├── config.js           # Cấu hình
│   ├── database.js         # Kết nối MongoDB
│   ├── commands/
│   │   ├── shop.js         # /shop, form mua acc
│   │   └── admin.js        # /addacc /ban /kick /mute ...
│   ├── events/
│   │   ├── ready.js        # Khởi động, register commands
│   │   ├── interactionCreate.js  # Xử lý buttons, menus, modals
│   │   ├── messageCreate.js      # Anti-spam
│   │   └── guildMemberAdd.js     # Anti-raid
│   ├── modules/
│   │   ├── ticketManager.js  # Hệ thống ticket
│   │   ├── payment.js        # Sepay + thẻ cào
│   │   ├── accManager.js     # Quản lý acc
│   │   ├── roleManager.js    # Role tier tự động
│   │   └── antiSpamRaid.js   # Anti-spam, anti-raid
│   ├── models/               # MongoDB schemas
│   └── utils/logger.js
├── dashboard/
│   ├── server.js             # Express server
│   └── public/               # Frontend HTML/CSS/JS
├── .env.example
├── package.json
└── README.md
```

---

## 🎯 Slash Commands

| Command | Mô tả | Quyền |
|---|---|---|
| `/shop` | Hiện form shop | Tất cả |
| `/stock` | Xem kho acc | Tất cả |
| `/ticket` | Tạo ticket hỗ trợ | Tất cả |
| `/leaderboard` | BXH chi tiêu tháng | Tất cả |
| `/addacc` | Thêm acc vào kho | Admin |
| `/salary` | Xem bảng lương CSKH | Admin |
| `/ban` | Ban thành viên | Mod |
| `/kick` | Kick thành viên | Mod |
| `/mute` | Mute thành viên | Mod |
| `/purge` | Xóa tin nhắn user | Mod |

---

## 💡 Lưu Ý

- Bot cần quyền: `Administrator` hoặc đủ các quyền cần thiết
- Cần bật **Privileged Intents**: `Server Members`, `Message Content` trong Developer Portal
- Webhook Sepay cần server public IP hoặc dùng ngrok để test
- Mỗi tháng chi tiêu tự reset vào **ngày 1** lúc **00:00**
