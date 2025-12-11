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
  Post,
  Get,
  Body,
  Query,
  Param,
  HttpException,
  HttpStatus,
  Req,
  Logger,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';

import { CrowdsourceService } from './crowdsource.service';
import { AuthGuard } from '../users/guards/auth.guard';
import { CurrentUser } from '../users/decorators/current-user.decorator';
import type { SessionUser } from '../users/decorators/current-user.decorator';
import type {
  UpdatePoiDto,
  UpdatePoiResponseDto,
  VoteContributionDto,
  GetPendingContributionsDto,
} from './dto/update-poi.dto';

/**
 * Controller xử lý các API endpoints cho crowdsource feature
 */
@Controller('crowdsource')
export class CrowdsourceController {
  private readonly logger = new Logger(CrowdsourceController.name);

  constructor(private readonly crowdsourceService: CrowdsourceService) {}

  /**
   * POST /crowdsource/submit
   * Submit một đề xuất cập nhật POI
   * Yêu cầu đăng nhập
   */
  @Post('submit')
  @UseGuards(AuthGuard)
  async submitUpdate(
    @Body() dto: UpdatePoiDto,
    @CurrentUser() currentUser: SessionUser,
    @Req() request: Request,
  ): Promise<UpdatePoiResponseDto> {
    try {
      const userId = currentUser.userId.toString();
      const userIp = request.ip || request.socket.remoteAddress;

      this.logger.log(`Submit update request from user: ${userId} (${currentUser.username})`);

      const result = await this.crowdsourceService.submitUpdate(
        userId,
        dto,
        userIp,
      );

      return result;
    } catch (error) {
      this.logger.error('Error in submitUpdate:', error);
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Không thể submit đề xuất',
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /crowdsource/vote
   * Vote cho một contribution
   * Yêu cầu đăng nhập
   */
  @Post('vote')
  @UseGuards(AuthGuard)
  async voteContribution(
    @Body() dto: VoteContributionDto,
    @CurrentUser() currentUser: SessionUser,
    @Req() request: Request,
  ): Promise<UpdatePoiResponseDto> {
    try {
      const userId = currentUser.userId.toString();
      const userIp = request.ip || request.socket.remoteAddress;

      this.logger.log(`Vote request from user: ${userId} (${currentUser.username})`);

      const result = await this.crowdsourceService.voteContribution(
        userId,
        dto,
        userIp,
      );

      return result;
    } catch (error) {
      this.logger.error('Error in voteContribution:', error);
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Không thể vote',
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /crowdsource/pending
   * Lấy danh sách các contribution pending
   */
  @Get('pending')
  async getPendingContributions(@Query() query: GetPendingContributionsDto) {
    try {
      this.logger.log('Get pending contributions');

      const result = await this.crowdsourceService.getPendingContributions(
        query,
      );

      return {
        success: true,
        count: result.count,
        data: result.data,
      };
    } catch (error) {
      this.logger.error('Error getting pending contributions:', error);
      throw new HttpException(
        {
          success: false,
          message: 'Không thể lấy danh sách contributions',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /crowdsource/contribution/:id
   * Lấy chi tiết một contribution
   */
  @Get('contribution/:id')
  async getContributionDetail(@Param('id') id: string) {
    try {
      this.logger.log(`Get contribution detail: ${id}`);

      const contribution = await this.crowdsourceService.getContributionDetail(
        id,
      );

      return {
        success: true,
        data: contribution,
      };
    } catch (error) {
      this.logger.error('Error getting contribution detail:', error);
      throw new HttpException(
        {
          success: false,
          message: 'Không thể lấy chi tiết contribution',
          error: error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /crowdsource/poi/:poiId/contributions
   * Lấy tất cả contributions cho một POI
   */
  @Get('poi/:poiId/contributions')
  async getPoiContributions(
    @Param('poiId') poiId: string,
    @Query() query: GetPendingContributionsDto,
  ) {
    try {
      this.logger.log(`Get contributions for POI: ${poiId}`);

      const result = await this.crowdsourceService.getPendingContributions({
        ...query,
        poiId,
      });

      return {
        success: true,
        poiId,
        count: result.count,
        data: result.data,
      };
    } catch (error) {
      this.logger.error('Error getting POI contributions:', error);
      throw new HttpException(
        {
          success: false,
          message: 'Không thể lấy contributions của POI',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
