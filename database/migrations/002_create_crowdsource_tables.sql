-- Migration: Create crowdsource tables
-- Date: 2025-12-10
-- Description: Tạo bảng user_contributions và contribution_votes để lưu trữ đề xuất cập nhật POI với consensus mechanism
-- Dependencies: 001_create_users_table.sql (cần bảng users tồn tại trước)

USE opendatafithou;

-- Drop tables nếu tồn tại (để tránh conflict với migration 001 cũ)
DROP TABLE IF EXISTS `contribution_votes`;
DROP TABLE IF EXISTS `user_contributions`;

-- Bảng user_contributions: Lưu các đề xuất cập nhật POI từ users
CREATE TABLE IF NOT EXISTS `user_contributions` (
  `id` VARCHAR(36) PRIMARY KEY COMMENT 'UUID của contribution',
  `user_id` INT NOT NULL COMMENT 'ID của user tạo contribution',
  `target_poi_id` VARCHAR(255) NOT NULL COMMENT 'URI của POI cần cập nhật (ex: school_001)',
  `report_uri` VARCHAR(500) NOT NULL COMMENT 'URI của báo cáo trong Fuseki (ex: report_uuid)',
  `proposal_hash` VARCHAR(32) NOT NULL COMMENT 'MD5 hash để phát hiện duplicate proposals',
  `proposed_data` JSON NOT NULL COMMENT 'Dữ liệu đề xuất cập nhật',
  `status` ENUM('pending', 'approved', 'rejected') DEFAULT 'pending' COMMENT 'Trạng thái của contribution',
  `upvotes` INT DEFAULT 1 COMMENT 'Số vote ủng hộ',
  `downvotes` INT DEFAULT 0 COMMENT 'Số vote phản đối',
  `auto_merged` BOOLEAN DEFAULT FALSE COMMENT 'Tự động merge khi đạt threshold',
  `trust_threshold` INT DEFAULT 5 COMMENT 'Ngưỡng vote cần đạt để auto-merge',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `approved_at` TIMESTAMP NULL COMMENT 'Thời điểm được approve',
  INDEX `idx_user` (`user_id`),
  INDEX `idx_target_poi` (`target_poi_id`),
  INDEX `idx_proposal_hash` (`proposal_hash`),
  INDEX `idx_status` (`status`),
  INDEX `idx_compound` (`target_poi_id`, `proposal_hash`, `status`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng lưu trữ đề xuất cập nhật POI';

-- Bảng contribution_votes: Lưu các vote của users cho mỗi contribution
CREATE TABLE IF NOT EXISTS `contribution_votes` (
  `id` VARCHAR(36) PRIMARY KEY COMMENT 'UUID của vote',
  `contribution_id` VARCHAR(36) NOT NULL COMMENT 'ID của contribution được vote',
  `user_id` VARCHAR(100) NOT NULL COMMENT 'ID của user vote',
  `vote_type` ENUM('up', 'down') NOT NULL COMMENT 'Loại vote: up hoặc down',
  `user_ip` VARCHAR(45) NULL COMMENT 'IP address của user (để phát hiện spam)',
  `comment` TEXT NULL COMMENT 'Comment tùy chọn của người vote',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_contribution` (`contribution_id`),
  INDEX `idx_user` (`user_id`),
  UNIQUE KEY `unique_user_vote` (`contribution_id`, `user_id`) COMMENT 'Mỗi user chỉ vote 1 lần cho 1 contribution',
  FOREIGN KEY (`contribution_id`) REFERENCES `user_contributions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng lưu trữ votes của users';

-- Tạo view để xem thống kê contributions của users
CREATE OR REPLACE VIEW user_contribution_stats AS
SELECT 
  u.id as user_id,
  u.username,
  u.email,
  u.full_name,
  u.role,
  COUNT(DISTINCT uc.id) as total_contributions,
  SUM(CASE WHEN uc.status = 'approved' THEN 1 ELSE 0 END) as approved_contributions,
  SUM(CASE WHEN uc.status = 'pending' THEN 1 ELSE 0 END) as pending_contributions,
  SUM(CASE WHEN uc.status = 'rejected' THEN 1 ELSE 0 END) as rejected_contributions,
  SUM(CASE WHEN uc.auto_merged = TRUE THEN 1 ELSE 0 END) as auto_merged_contributions,
  COUNT(DISTINCT cv.id) as total_votes_given,
  MAX(uc.created_at) as last_contribution_date
FROM users u
LEFT JOIN user_contributions uc ON CAST(uc.id AS CHAR) = CAST(u.id AS CHAR)
LEFT JOIN contribution_votes cv ON cv.user_id = CAST(u.id AS CHAR)
GROUP BY u.id, u.username, u.email, u.full_name, u.role;

-- Tạo view để xem chi tiết contributions với vote counts
CREATE OR REPLACE VIEW contribution_details AS
SELECT 
  uc.id,
  uc.target_poi_id,
  uc.report_uri,
  uc.proposal_hash,
  uc.proposed_data,
  uc.status,
  uc.upvotes,
  uc.downvotes,
  uc.auto_merged,
  uc.trust_threshold,
  uc.created_at,
  uc.updated_at,
  uc.approved_at,
  COUNT(DISTINCT cv.id) as total_votes,
  GROUP_CONCAT(DISTINCT cv.user_id ORDER BY cv.created_at SEPARATOR ',') as voters
FROM user_contributions uc
LEFT JOIN contribution_votes cv ON cv.contribution_id = uc.id
GROUP BY uc.id;

-- Thông báo hoàn thành
SELECT 'Migration 002_create_crowdsource_tables.sql completed successfully!' as message;
SELECT 'Tables created: user_contributions, contribution_votes' as tables;
SELECT 'Views created: user_contribution_stats, contribution_details' as views;
