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

import { Controller, Get, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreatePoiDto } from './dto/CreatePoiDto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * GET /admin/stats
   * Lấy thống kê tổng quan cho dashboard
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
   * POST /admin/poi
   * Tạo POI mới trong database
   */
  @Post('poi')
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
   * GET /admin/health
   * Health check endpoint
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
