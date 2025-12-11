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
 * DTO cho việc cập nhật POI thông qua crowdsource
 */
export interface UpdatePoiDto {
  poiId: string; // URI của POI cần cập nhật (ex: ex:school_001)

  data: {
    // Thông tin liên hệ
    telephone?: string;
    email?: string;
    website?: string;

    // Giờ hoạt động
    openingHours?: string;

    // Tiện ích
    hasWifi?: boolean;
    wheelchairAccessible?: boolean;
    parking?: boolean;
    airConditioning?: boolean;
    petsAllowed?: boolean;

    // Dịch vụ
    reservationRequired?: boolean;

    // Giá cả
    priceLevel?: 'free' | 'low' | 'medium' | 'high';
    paymentMethods?: string; // "cash, card, transfer"

    // Mô tả bổ sung
    description?: string;
    notes?: string;
  };
}

/**
 * DTO cho response khi submit update
 */
export interface UpdatePoiResponseDto {
  success: boolean;
  message: string;
  contributionId?: string;
  status: 'new' | 'voted' | 'auto-merged';
  currentVotes?: number;
  requiredVotes?: number;
}

/**
 * DTO cho việc vote một contribution
 */
export interface VoteContributionDto {
  contributionId: string;
  voteType: 'up' | 'down';
  comment?: string;
}

/**
 * DTO cho query pending contributions
 */
export interface GetPendingContributionsDto {
  poiId?: string;
  status?: 'pending' | 'approved' | 'rejected';
  page?: number;
  limit?: number;
}
