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

/**
 * DTO (Data Transfer Object) để tạo điểm quan tâm (POI - Point of Interest) mới
 * - Dùng khi admin muốn thêm địa điểm vào hệ thống (ATM, nhà vệ sinh,...)
 */
export class CreatePoiDto {
  name: string;
  type: string;
  lat: number;
  lon: number;
  address?: string;
}

/**
 * DTO chứa thống kê tổng quan cho Admin Dashboard
 * - totalPois: Tổng số tất cả các POI trong hệ thống
 * - graphCount: Số lượng loại POI khác nhau (atm, school, v.v.)
 * - breakdown: Object chứa số lượng POI cho từng loại (key: tên loại, value: số lượng)
 *   Ví dụ: { "atm": 150, "hospital": 45, "cafe": 200, "school": 80, ... }
 * - topCategories: Mảng chứa top 5 loại POI có nhiều địa điểm nhất
 */
export class StatsResponseDto {
  totalPois: number;
  graphCount: number;
  breakdown: Record<string, number>;
  topCategories: Array<{
    type: string;
    count: number;
  }>;
}
