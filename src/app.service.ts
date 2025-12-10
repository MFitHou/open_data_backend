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

import { Injectable } from '@nestjs/common';

/**
 * Service này hiện tại chỉ chứa method getHello() đơn giản để test.
 * Trong production, service này có thể được mở rộng để xử lý:
 * - Health check endpoints
 * - Application-level business logic
 * - Common utilities được chia sẻ giữa các modules
 * 
 * Hiện tại, các feature chính được implement trong các feature modules:
 * - FusekiModule, AdminModule, ChatbotModule, etc.
 */
@Injectable()
export class AppService {
  /**
   * getHello - Method test cơ bản
   * 
   * @returns String "Hello World!" để verify service hoạt động
   */
  getHello(): string {
    return 'Hello World!';
  }
}
