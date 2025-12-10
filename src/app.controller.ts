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

import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

/**
 * AppController - Root controller cho ứng dụng
 * 
 * Controller cơ bản xử lý requests tới root path (/).
 * Trong production, controller này thường được dùng cho:
 * - Health check endpoint
 * - API documentation redirect
 * - Basic application info
 * 
 * Endpoints:
 * - GET / (hoặc GET /api/ do global prefix)
 * 
 * Note: Các feature endpoints chính nằm ở các feature controllers:
 * - /api/fuseki/* - FusekiController
 * - /api/admin/* - AdminController
 * - /api/chatbot/* - ChatbotController
 * - /api/auth/* - AuthController (UsersModule)
 */
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * getHello - Endpoint test cơ bản
   * 
   * GET /api/
   * 
   * @returns String "Hello World!" để verify API đang hoạt động
   * 
   * @example
   * Response: "Hello World!"
   */
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
