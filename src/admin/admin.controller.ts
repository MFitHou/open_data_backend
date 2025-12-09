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

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
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
   * GET /admin/pois/schema
   * Lấy schema (cấu trúc thuộc tính) của một loại POI
   * Query params: type (school, bus-stop, play-ground, drinking-water, toilet)
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
   * POST /admin/pois
   * Tạo POI mới trong database
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
   * GET /admin/pois
   * Lấy danh sách POIs từ Named Graphs với filter
   * Query params: type (school, bus-stop, play-ground, drinking-water, toilet, all), page, limit
   */
  @Get('pois')
  async getPois(
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const pageNum = page ? parseInt(page, 10) : 1;
      const limitNum = limit ? parseInt(limit, 10) : 10;

      const result = await this.adminService.getPois(type, pageNum, limitNum);
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
   * DELETE /admin/pois/:id
   * Xóa POI khỏi database
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

  /**
   * GET /admin/iot/traffic
   * DEPRECATED - IoT simulation không còn được sử dụng
   */
  @Get('iot/traffic')
  async getTrafficData() {
    return {
      success: false,
      message: 'IoT simulation has been disabled',
      count: 0,
      data: [],
    };
  }

  /**
   * GET /admin/iot/flood
   * DEPRECATED - IoT simulation không còn được sử dụng
   */
  @Get('iot/flood')
  async getFloodData() {
    return {
      success: false,
      message: 'IoT simulation has been disabled',
      count: 0,
      data: [],
    };
  }
}
