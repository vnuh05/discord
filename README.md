# Discord Shop Bot v2

Bot Discord bán acc tự động kèm dashboard quản trị, thanh toán ngân hàng qua Casso webhook, hỗ trợ gạch thẻ và quản lý ticket CSKH.

## Tổng Quan

Project này gồm 2 phần chạy cùng một hệ thống dữ liệu:

- Discord bot viết bằng `discord.js`
- Dashboard quản trị viết bằng `Express` và frontend tĩnh
- Cơ sở dữ liệu dùng `SQLite` qua `better-sqlite3`

Toàn bộ dữ liệu được lưu cục bộ trong file `shop.db` ở thư mục gốc. Khi khởi động, app sẽ tự tạo bảng nếu chưa tồn tại.

## Tính Năng Chính

### Shop và bán acc

- Lệnh `/shop` gửi embed cửa hàng với danh sách stock còn hàng
- Khách chọn loại acc trực tiếp từ select menu
- Tự giữ acc ở trạng thái `reserved` trong lúc chờ thanh toán
- Tự gửi thông tin acc qua DM sau khi thanh toán thành công
- Tự tạo ticket hỗ trợ sau mỗi đơn hoàn tất

### Thanh toán

- Chuyển khoản ngân hàng qua mã nội dung riêng cho từng đơn
- Xác nhận thanh toán tự động qua webhook `Casso`
- Tạo QR VietQR theo thông tin ngân hàng cấu hình
- Hỗ trợ nạp thẻ qua API `thesieure.com`
- Tự hủy đơn pending quá hạn và trả lại acc về kho

### Ticket CSKH

- Lệnh `/ticket` để tạo ticket thủ công
- Sau khi mua hàng thành công, bot tự tạo ticket hỗ trợ cho đơn đó
- Gửi thông báo ticket mới tới kênh CSKH
- CSKH nhận ticket bằng nút bấm
- Nếu quá thời gian chờ, ticket sẽ được random lại cho nhân viên khác
- Khi đóng ticket, bot yêu cầu khách đánh giá từ 1 đến 5 sao
- Đánh giá được gửi tới kênh review
- Hệ thống cộng doanh số và lương cho CSKH theo số đơn xử lý

### Quản lý chi tiêu và role

- Theo dõi tổng chi tiêu và chi tiêu theo tháng của từng user
- Tự động cập nhật role tier theo mốc chi tiêu
- Có bảng xếp hạng tháng bằng lệnh `/leaderboard`
- Tự reset chi tiêu tháng vào ngày 1 hàng tháng

### Moderation

- Chặn link mời Discord và một số link rút gọn
- Phát hiện spam tin nhắn và timeout tự động 10 phút
- Phát hiện anti-raid khi có nhiều thành viên join trong thời gian ngắn
- Có các lệnh `/ban`, `/kick`, `/mute`, `/purge`
- Ghi log hành động moderation vào kênh log

### Dashboard

- Đăng nhập bằng tài khoản dashboard riêng
- Thống kê doanh thu, số acc, đơn hàng, user, ticket
- Quản lý kho acc từ giao diện web
- Xem danh sách orders, users, staff, tickets
- Chỉnh một số cấu hình bot lưu trong bảng `settings`
- Điều khiển bot `start`, `stop`, `restart` ngay trong dashboard

## Công Nghệ Sử Dụng

- Node.js
- Discord.js 14
- Express
- better-sqlite3
- Axios
- node-cron
- Winston

## Yêu Cầu Môi Trường

- Node.js `>= 18`
- Discord application đã bật bot và tạo token
- Một server Discord để cấp các channel và role ID cần thiết
- Tài khoản ngân hàng dùng với Casso nếu muốn nhận chuyển khoản tự động
- Tài khoản API thẻ nếu muốn bật gạch thẻ

## Cài Đặt

### 1. Cài dependency

```bash
npm install
```

### 2. Tạo hoặc chỉnh file `.env`

Repo hiện đang có file `.env` trong thư mục gốc. Nếu muốn cấu hình mới, chỉ cần cập nhật file đó với các giá trị phù hợp.

Ví dụ tối thiểu:

```env


# Tier roles
ROLE_BRONZE_ID=
ROLE_BRONZE_MIN=200000
ROLE_SILVER_ID=
ROLE_SILVER_MIN=500000
ROLE_GOLD_ID=
ROLE_GOLD_MIN=1000000
ROLE_DIAMOND_ID=
ROLE_DIAMOND_MIN=5000000

# Casso / bank transfer
CASSO_API_KEY=your_casso_api_key
BANK_ACCOUNT_NUMBER=your_bank_account_number
BANK_NAME=MBBank
BANK_ID=MB
BANK_ACCOUNT_NAME=YOUR_ACCOUNT_NAME

# Card charging API
CARD_API_URL=https://api.thesieure.com/chargingws/v2
CARD_API_PARTNER_ID=your_card_partner_id
CARD_API_PARTNER_KEY=your_card_partner_key

# Dashboard
DASHBOARD_PORT=3000
DASHBOARD_SECRET=change_this_secret
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=change_this_password

# Customer support settings
CS_COMMISSION_PER_ORDER=7000
CS_TICKET_TIMEOUT=300000


```

### 3. Chạy bot Discord

```bash
npm start
```

Lệnh này chỉ chạy bot.

### 4. Chạy dashboard

```bash
npm run web
```

Lưu ý quan trọng: file `dashboard/server.js` có import bot, nên khi chạy lệnh này thì dashboard và bot sẽ cùng chạy trong một process.

Dashboard mặc định truy cập tại:

```text
http://localhost:3000
```

## Scripts

```json
{
	"start": "node src/index.js",
	"dev": "nodemon src/index.js",
	"web": "node dashboard/server.js"
}
```

## Biến Môi Trường Quan Trọng

### Discord

- `DISCORD_TOKEN`: token bot
- `CLIENT_ID`: application ID để đăng ký slash commands
- `GUILD_ID`: guild ID để đăng ký slash commands dạng guild

### Channel

- `SHOP_CHANNEL_ID`: nơi bot gửi embed shop khi khởi động
- `LOG_CHANNEL_ID`: nơi ghi log moderation và thông báo hệ thống
- `NOTIFY_CS_CHANNEL_ID`: kênh báo ticket mới cho CSKH
- `TICKET_CATEGORY_ID`: category chứa các channel ticket
- `REVIEW_CHANNEL_ID`: kênh nhận đánh giá sau hỗ trợ
- `ANNOUNCEMENT_CHANNEL_ID`: hiện có trong settings, dùng cho mở rộng sau này

### Role

- `CS_ROLE_ID`: role CSKH
- `ADMIN_ROLE_ID`: role admin để nhìn ticket và nhận cảnh báo anti-raid
- `MOD_ROLE_ID`: role moderator
- `ROLE_*_ID`, `ROLE_*_MIN`: cấu hình role tier theo chi tiêu

### Thanh toán ngân hàng

- `CASSO_API_KEY`: dùng để xác thực chữ ký webhook Casso
- `BANK_ACCOUNT_NUMBER`: số tài khoản nhận tiền
- `BANK_NAME`: tên ngân hàng hiển thị cho khách
- `BANK_ID`: mã ngân hàng dùng để tạo ảnh QR VietQR
- `BANK_ACCOUNT_NAME`: tên chủ tài khoản hiển thị trên QR

### Gạch thẻ

- `CARD_API_URL`: endpoint API thẻ
- `CARD_API_PARTNER_ID`: partner ID
- `CARD_API_PARTNER_KEY`: partner key

### Dashboard

- `DASHBOARD_PORT`: cổng web
- `DASHBOARD_SECRET`: secret cho `express-session`
- `DASHBOARD_USERNAME`: tài khoản đăng nhập dashboard
- `DASHBOARD_PASSWORD`: mật khẩu dashboard

### CSKH

- `CS_COMMISSION_PER_ORDER`: tiền công mỗi ticket hoàn tất
- `CS_TICKET_TIMEOUT`: thời gian chờ trước khi random lại ticket, đơn vị mili giây

## Slash Commands

| Lệnh | Mô tả | Quyền |
|---|---|---|
| `/shop` | Mở giao diện cửa hàng | Tất cả |
| `/stock` | Xem tồn kho hiện tại | Tất cả |
| `/ticket` | Tạo ticket hỗ trợ | Tất cả |
| `/leaderboard` | Xem top chi tiêu tháng | Tất cả |
| `/addacc` | Thêm acc vào kho | Admin |
| `/salary` | Xem bảng lương CSKH tháng | Admin |
| `/ban` | Ban thành viên | Mod |
| `/kick` | Kick thành viên | Mod |
| `/mute` | Timeout thành viên theo phút | Mod |
| `/purge` | Xóa tin nhắn của một user | Mod |

## Webhook Casso

Dashboard expose endpoint webhook tại:

```text
POST /webhook/casso
```

Khi cấu hình bên Casso, hãy trỏ webhook về:

```text
http://your-domain-or-ip:3000/webhook/casso
```

Webhook sẽ:

- kiểm tra chữ ký bằng `secure-token`
- dò nội dung chuyển khoản theo mã đơn
- xác nhận đơn trong database
- hoàn tất đơn hàng và gửi thông tin acc cho khách

## Dữ Liệu Và Lưu Trữ

- SQLite file: `shop.db`
- Log runtime: thư mục `logs/`
- Cấu hình runtime có thể được lưu trong bảng `settings`

Một số cấu hình Discord được đọc theo thứ tự:

1. Bảng `settings` trong SQLite
2. Giá trị trong `.env` nếu chưa có trong database

Điều này cho phép dashboard cập nhật cấu hình mà không cần sửa file nguồn.

## Cấu Trúc Thư Mục

```text
.
├── dashboard/
│   ├── public/
│   └── server.js
├── logs/
├── src/
│   ├── commands/
│   ├── events/
│   ├── models/
│   ├── modules/
│   ├── utils/
│   ├── config.js
│   ├── database.js
│   └── index.js
├── package.json
├── shop.db
└── README.md
```

## Luồng Hoạt Động Cơ Bản

1. Admin thêm acc bằng `/addacc` hoặc từ dashboard
2. Bot gửi shop embed vào kênh shop khi online
3. Khách chọn loại acc trong `/shop`
4. Bot giữ acc tạm thời và hiển thị phương thức thanh toán
5. Nếu chuyển khoản, bot chờ webhook Casso xác nhận
6. Nếu gạch thẻ thành công, bot hoàn tất đơn ngay
7. Bot gửi acc qua DM, cập nhật chi tiêu, cập nhật role và tạo ticket hỗ trợ

## Lưu Ý Vận Hành

- Bot cần bật `Server Members Intent` và `Message Content Intent` trong Discord Developer Portal
- Nếu không cấu hình đúng channel hoặc role ID, một số tính năng vẫn chạy nhưng sẽ không gửi thông báo vào đúng nơi
- `npm run web` sẽ cố đăng nhập bot Discord; nếu token sai thì dashboard vẫn chạy nhưng bot không online
- File `shop.db`, `shop.db-wal`, `shop.db-shm` sẽ xuất hiện trong thư mục gốc khi SQLite hoạt động
- Trong code có một số khóa cấu hình cũ như `mongodb`, nhưng hệ thống hiện tại đang vận hành bằng SQLite

## Gợi Ý Triển Khai

- Dùng PM2 hoặc NSSM để chạy lâu dài trên VPS Windows hoặc Linux
- Expose cổng dashboard nếu cần nhận webhook Casso từ bên ngoài
- Đặt lại `DASHBOARD_SECRET` và `DASHBOARD_PASSWORD` trước khi đưa vào môi trường thật
