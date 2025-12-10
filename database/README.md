# Database Migration Guide

## Yêu cầu
- MySQL 5.7+ hoặc MariaDB 10.2+
- Quyền tạo database và table

## Cấu trúc thư mục

```
database/
├── migrations/          # Schema migrations
│   └── 001_create_users_table.sql
├── seeds/              # Seed data với credentials 
│   ├── 001_default_users.sql          # LOCAL ONLY 
│   └── 001_default_users.sql.example  # Template 
└── README.md
```

## Setup ban đầu

### 1. Tạo seed file từ template

```bash
# Copy template
cp database/seeds/001_default_users.sql.example database/seeds/001_default_users.sql

# Chỉnh sửa file với credentials của bạn
```

### 2. Chạy Migration

#### Windows (PowerShell)
```powershell
# Kiểm tra kết nối MySQL
mysql --version

# Chạy migration (tạo schema)
mysql -u root -p < database/migrations/001_create_users_table.sql

# Chạy seed (tạo tài khoản mặc định)
mysql -u root -p < database/seeds/001_default_users.sql
```

#### Linux/MacOS
```bash
# Chạy migration
mysql -u root -p < database/migrations/001_create_users_table.sql

# Chạy seed
mysql -u root -p < database/seeds/001_default_users.sql
```

### 3. Cấu hình .env

Cập nhật các biến môi trường trong file `.env`:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_mysql_password
DB_DATABASE=opendatafithou

SESSION_SECRET=your_secret_key_change_in_production
SESSION_MAX_AGE=86400000
```

## Tạo Password Hash

Để tạo bcrypt hash cho password:

### Sử dụng Node.js
```javascript
const bcrypt = require('bcrypt');
const password = 'your_password';
bcrypt.hash(password, 10).then(hash => console.log(hash));
```

### Sử dụng online tool
- https://bcrypt-generator.com (chọn salt rounds: 10)

## Tài khoản mặc định

File `database/seeds/001_default_users.sql` sẽ tạo 2 tài khoản:
- Admin account (role: admin)
- Demo user account (role: user)

⚠️ **Bảo mật quan trọng**:
1. File seed chứa credentials không được commit lên repo
2. Đổi mật khẩu ngay sau lần đăng nhập đầu tiên
3. Sử dụng mật khẩu mạnh trong production

## Kiểm tra Migration

```sql
USE opendatafithou;

-- Kiểm tra bảng đã tạo
SHOW TABLES;

-- Xem cấu trúc bảng users
DESCRIBE users;

-- Xem dữ liệu users
SELECT id, username, email, role, is_active, created_at FROM users;

-- Xem thống kê qua view
SELECT * FROM user_stats;
```

## Rollback (nếu cần)

```sql
USE opendatafithou;

DROP VIEW IF EXISTS user_stats;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS user_contributions;
DROP TABLE IF EXISTS users;
```
