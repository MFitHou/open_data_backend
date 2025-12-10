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

import { Controller, Get, Post, Delete, Body, Param, Query, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreatePoiDto } from './dto/CreatePoiDto';
import { AdminGuard } from '../users/guards';

/**
 * Controller xử lý các API endpoints cho Admin Dashboard
 * 
 * Bảo mật:
 * - Tất cả endpoints yêu cầu xác thực admin qua AdminGuard.
 * - Chỉ user có role 'admin' mới truy cập được.
 * 
 * Chức năng chính:
 * - Quản lý POI (Point of Interest): tạo, xem.
 * - Thống kê dashboard: tổng số POI, phân loại theo type.
 * - Lấy schema/cấu trúc của từng loại POI.
 * - Health check cho monitoring.
 * 
 * Base URL: /admin
 */
@Controller('admin')
@UseGuards(AdminGuard) 
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
  ) {}

  /**
   * Lấy thống kê tổng quan cho Admin Dashboard
   * 
   * Endpoint: GET /admin/stats
   * Auth: Yêu cầu Admin role
   * 
   * Response bao gồm:
   * - totalPois: Tổng số địa điểm trong hệ thống
   * - graphCount: Số loại POI khác nhau
   * - breakdown: Object {type: count} cho từng loại
   * - topCategories: Top 5 loại POI có nhiều địa điểm nhất
   * 
   * @returns Object chứa success flag và data thống kê
   */
  @Get('stats')
  async getDashboardStats() {
    try {
      const stats = await this.adminService.getDashboardStats();
      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to fetch dashboard statistics',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Lấy schema/cấu trúc thuộc tính của một loại POI
   * 
   * Endpoint: GET /admin/pois/schema?type={type}
   * Auth: Yêu cầu Admin role
   * 
   * Schema giúp frontend biết:
   * - POI này có những thuộc tính gì (name, address, phone, website, etc.)
   * - Kiểu dữ liệu của từng thuộc tính (string, number, boolean)
   * - Thuộc tính nào bắt buộc, thuộc tính nào optional
   * 
   * @param type Loại POI cần lấy schema
   * @returns Object chứa schema definition của loại POI đó
   */
  @Get('pois/schema')
  async getPoiSchema(@Query('type') type: string) {
    try {
      if (!type) {
        throw new HttpException(
          {
            success: false,
            message: 'Missing required query parameter: type',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const schema = await this.adminService.getPoiSchema(type);
      return schema;
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to fetch POI schema',
          error: error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Tạo POI (Point of Interest) mới trong hệ thống
   * 
   * Endpoint: POST /admin/pois
   * Auth: Yêu cầu Admin role
   * 
   * Workflow:
   * 1. Validate dữ liệu đầu vào (name, type, lat, lon)
   * 2. Generate URI cho POI mới
   * 3. Tạo RDF triples theo ontology của dự án
   * 4. Insert vào Named Graph tương ứng trong Fuseki
   * 
   * @param createPoiDto DTO chứa thông tin POI cần tạo
   * @returns Object chứa success flag, message và data POI vừa tạo
   */
  @Post('pois')
  async createPoi(@Body() createPoiDto: CreatePoiDto) {
    try {
      const result = await this.adminService.createPoi(createPoiDto);
      return {
        success: true,
        message: 'POI created successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to create POI',
          error: error.message,
        },
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Lấy danh sách POI với phân trang và filter
   * 
   * Endpoint: GET /admin/pois?type={type}&page={page}&limit={limit}&lightweight={boolean}
   * Auth: Yêu cầu Admin role
   * 
   * Cho phép:
   * - Lọc theo loại POI cụ thể hoặc lấy tất cả ('all')
   * - Phân trang để tránh load quá nhiều data
   * - Lightweight mode: chỉ lấy fields cần thiết (id, name, lat, lon, type) cho hiển thị map
   *
   * @returns Object chứa success, totalCount, page info và mảng POI
   */
  @Get('pois')
  async getPois(
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('lightweight') lightweight?: string,
  ) {
    try {
      const pageNum = page ? parseInt(page, 10) : 1;
      const limitNum = limit ? parseInt(limit, 10) : 10;
      const isLightweight = lightweight === 'true' || lightweight === '1';

      const result = await this.adminService.getPois(type, pageNum, limitNum, isLightweight);
      return result;
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to fetch POIs',
          error: error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Xóa POI khỏi hệ thống
   * 
   * Endpoint: DELETE /admin/pois/:id
   * Auth: Yêu cầu Admin role
   * 
   * Workflow:
   * 1. Tìm POI theo ID trong tất cả Named Graphs
   * 2. Xác định graph chứa POI đó
   * 3. Thực thi SPARQL DELETE để xóa tất cả triples liên quan
   * 4. Trả về kết quả xóa
   * 
   * Lưu ý: Thao tác này KHÔNG THỂ HOÀN TÁC
   * 
   * @param id URI hoặc ID của POI cần xóa
   * @returns Object chứa success flag, message và data xác nhận
   */
  @Delete('pois/:id')
  async deletePoi(@Param('id') id: string) {
    try {
      const result = await this.adminService.deletePoi(id);
      return {
        success: true,
        message: 'POI deleted successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to delete POI',
          error: error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Health check endpoint để kiểm tra trạng thái Admin module
   * 
   * Endpoint: GET /admin/health
   * Auth: Yêu cầu Admin role
   * 
   * Dùng cho:
   * - Monitoring systems để kiểm tra service còn sống không
   * 
   * @returns Object chứa success flag, message và timestamp
   */
  @Get('health')
  async healthCheck() {
    return {
      success: true,
      message: 'Admin module is running',
      timestamp: new Date().toISOString(),
    };
  }


}
