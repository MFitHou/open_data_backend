/**
 * Copyright (C) 2025 MFitHou
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminFusekiService } from './admin-fuseki.service';

/**
 * Admin Module - Module quản lý tất cả chức năng admin dashboard
 * 
 * Chức năng:
 * - Quản lý POI (Point of Interest): tạo, xem, xóa địa điểm
 * - Thống kê dashboard: tổng số POI, phân loại theo type, top categories
 * - Lấy schema/cấu trúc của từng loại POI
 * - Tương tác với Apache Jena Fuseki để lưu/đọc dữ liệu RDF
 * 
 * Components:
 * - AdminController: Xử lý HTTP requests (GET, POST, DELETE)
 * - AdminService: Business logic chính (CRUD operations, statistics)
 * - AdminFusekiService: Xử lý SPARQL queries với Fuseki triplestore
 * 
 * Dependencies:
 * - ConfigModule: Đọc environment variables (.env)
 * - AdminGuard: Bảo vệ endpoints, yêu cầu role 'admin'
 * 
 * Exports:
 * - AdminService: Để các module khác có thể sử dụng nếu cần
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [AdminService, AdminFusekiService],
  controllers: [AdminController],
  exports: [AdminService],
})
export class AdminModule {}
