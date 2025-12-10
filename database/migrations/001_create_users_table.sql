-- Migration: 001_create_users_table.sql
-- Description: Tạo bảng users để lưu thông tin tài khoản người dùng
-- Date: 2025-12-09

-- Tạo database nếu chưa tồn tại
CREATE DATABASE IF NOT EXISTS opendatafithou
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE opendatafithou;

-- Tạo bảng users
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL COMMENT 'Tên đăng nhập duy nhất',
  email VARCHAR(100) UNIQUE NOT NULL COMMENT 'Email người dùng',
  password VARCHAR(255) NOT NULL COMMENT 'Mật khẩu đã hash (bcrypt)',
  full_name VARCHAR(100) DEFAULT NULL COMMENT 'Họ và tên đầy đủ',
  role ENUM('admin', 'moderator', 'user') DEFAULT 'user' COMMENT 'Vai trò người dùng',
  is_active BOOLEAN DEFAULT TRUE COMMENT 'Trạng thái tài khoản',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời gian tạo tài khoản',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Thời gian cập nhật',
  INDEX idx_username (username),
  INDEX idx_email (email),
  INDEX idx_role (role),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng quản lý tài khoản người dùng';


-- Tạo bảng audit_logs để theo dõi hoạt động
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT NULL COMMENT 'ID người dùng thực hiện hành động',
  action VARCHAR(100) NOT NULL COMMENT 'Hành động thực hiện',
  entity_type VARCHAR(50) DEFAULT NULL COMMENT 'Loại entity',
  entity_id VARCHAR(255) DEFAULT NULL COMMENT 'ID entity',
  old_value TEXT DEFAULT NULL COMMENT 'Giá trị cũ (JSON)',
  new_value TEXT DEFAULT NULL COMMENT 'Giá trị mới (JSON)',
  ip_address VARCHAR(45) DEFAULT NULL COMMENT 'Địa chỉ IP',
  user_agent TEXT DEFAULT NULL COMMENT 'User agent',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng log audit các hoạt động trong hệ thống';



-- Thông báo hoàn thành
SELECT 'Migration 001_create_users_table.sql completed successfully!' as message;
SELECT 'Run seed file (database/seeds/001_default_users.sql) to create default accounts' as note;
