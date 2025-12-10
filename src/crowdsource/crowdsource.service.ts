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

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

import { UserContribution } from './entities/user-contribution.entity';
import { ContributionVote } from './entities/contribution-vote.entity';
import {
  UpdatePoiDto,
  UpdatePoiResponseDto,
  VoteContributionDto,
  GetPendingContributionsDto,
} from './dto/update-poi.dto';
import { CrowdsourceSparqlHelper } from './crowdsource-sparql.helper';

/**
 * Service xử lý logic crowdsource với consensus mechanism
 */
@Injectable()
export class CrowdsourceService {
  private readonly logger = new Logger(CrowdsourceService.name);
  private readonly TRUST_THRESHOLD = 5; // Số vote cần để auto-merge

  constructor(
    @InjectRepository(UserContribution)
    private readonly contributionRepo: Repository<UserContribution>,
    @InjectRepository(ContributionVote)
    private readonly voteRepo: Repository<ContributionVote>,
    private readonly dataSource: DataSource,
    private readonly sparqlHelper: CrowdsourceSparqlHelper,
    // Giả sử bạn đã có SparqlService
    // private readonly sparqlService: SparqlService,
  ) {}

  /**
   * Submit một đề xuất cập nhật POI
   * Xử lý consensus mechanism
   */
  async submitUpdate(
    userId: string,
    dto: UpdatePoiDto,
    userIp?: string,
  ): Promise<UpdatePoiResponseDto> {
    this.logger.log(`User ${userId} submitting update for POI ${dto.poiId}`);

    // Bước 1: Generate hash từ poiId + data
    const proposalHash = this.generateProposalHash(dto.poiId, dto.data);
    this.logger.debug(`Generated hash: ${proposalHash}`);

    // Bước 2: Check duplicate trong MySQL
    const existingContribution = await this.contributionRepo.findOne({
      where: {
        targetPoiId: dto.poiId,
        proposalHash,
        status: 'pending',
      },
      relations: ['votes'],
    });

    // Bước 3: Transaction để đảm bảo consistency
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let contribution: UserContribution;
      let isNewProposal = false;

      if (existingContribution) {
        // Scenario A: Proposal đã tồn tại - Vote logic
        this.logger.log(`Found existing proposal: ${existingContribution.id}`);

        // Check xem user đã vote chưa
        const existingVote = await this.voteRepo.findOne({
          where: {
            contributionId: existingContribution.id,
            userId,
          },
        });

        if (existingVote) {
          await queryRunner.rollbackTransaction();
          return {
            success: false,
            message: 'Bạn đã vote cho đề xuất này rồi',
            status: 'voted',
            currentVotes: existingContribution.upvotes,
            requiredVotes: this.TRUST_THRESHOLD,
          };
        }

        // Tạo vote mới
        const newVote = this.voteRepo.create({
          contributionId: existingContribution.id,
          userId,
          voteType: 'up',
          userIp,
        });
        await queryRunner.manager.save(newVote);

        // Increment upvotes
        existingContribution.upvotes += 1;
        contribution = await queryRunner.manager.save(existingContribution);

        this.logger.log(
          `Upvotes: ${contribution.upvotes}/${this.TRUST_THRESHOLD}`,
        );
      } else {
        // Scenario B: Proposal mới
        this.logger.log('Creating new proposal');
        isNewProposal = true;

        const reportUri = `report_${uuidv4().replace(/-/g, '')}`;

        // Tạo contribution mới
        contribution = this.contributionRepo.create({
          userId: parseInt(userId),
          targetPoiId: dto.poiId,
          reportUri,
          proposalHash,
          proposedData: dto.data,
          status: 'pending',
          upvotes: 1,
          trustThreshold: this.TRUST_THRESHOLD,
        });
        contribution = await queryRunner.manager.save(contribution);

        // Tạo vote đầu tiên
        const initialVote = this.voteRepo.create({
          contributionId: contribution.id,
          userId,
          voteType: 'up',
          userIp,
        });
        await queryRunner.manager.save(initialVote);

        // Insert vào Fuseki Pending Graph
        const insertQuery = this.sparqlHelper.buildInsertReportQuery(
          reportUri,
          dto.poiId,
          userId,
          dto.data,
        );

        // TODO: Uncomment khi có SparqlService
        // await this.sparqlService.update(insertQuery);
        this.logger.debug(`SPARQL INSERT query prepared: ${insertQuery}`);
      }

      // Bước 4: Check threshold và auto-merge
      if (contribution.upvotes >= this.TRUST_THRESHOLD) {
        this.logger.log('Threshold reached! Auto-merging...');

        // Merge vào Main Graph
        const mergeQuery = this.sparqlHelper.buildMergeToMainGraphQuery(
          contribution.reportUri,
          contribution.targetPoiId,
          contribution.proposedData,
        );

        // TODO: Uncomment khi có SparqlService
        // await this.sparqlService.update(mergeQuery);
        this.logger.debug(`SPARQL MERGE query prepared: ${mergeQuery}`);

        // Update status trong Pending Graph
        const updateStatusQuery =
          this.sparqlHelper.buildUpdateReportStatusQuery(
            contribution.reportUri,
            'approved',
          );
        // await this.sparqlService.update(updateStatusQuery);

        // Update MySQL
        contribution.status = 'approved';
        contribution.autoMerged = true;
        contribution.approvedAt = new Date();
        await queryRunner.manager.save(contribution);

        await queryRunner.commitTransaction();

        return {
          success: true,
          message: 'Đề xuất đã được chấp nhận và cập nhật tự động!',
          contributionId: contribution.id,
          status: 'auto-merged',
          currentVotes: contribution.upvotes,
        };
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      return {
        success: true,
        message: isNewProposal
          ? 'Đề xuất mới đã được tạo thành công'
          : 'Vote của bạn đã được ghi nhận',
        contributionId: contribution.id,
        status: isNewProposal ? 'new' : 'voted',
        currentVotes: contribution.upvotes,
        requiredVotes: this.TRUST_THRESHOLD,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Error submitting update:', error);
      throw new BadRequestException('Không thể submit đề xuất: ' + error.message);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Vote cho một contribution
   */
  async voteContribution(
    userId: string,
    dto: VoteContributionDto,
    userIp?: string,
  ): Promise<UpdatePoiResponseDto> {
    const contribution = await this.contributionRepo.findOne({
      where: { id: dto.contributionId },
      relations: ['votes'],
    });

    if (!contribution) {
      throw new BadRequestException('Contribution không tồn tại');
    }

    if (contribution.status !== 'pending') {
      throw new BadRequestException('Contribution này đã được xử lý');
    }

    // Check duplicate vote
    const existingVote = await this.voteRepo.findOne({
      where: {
        contributionId: dto.contributionId,
        userId,
      },
    });

    if (existingVote) {
      throw new BadRequestException('Bạn đã vote cho đề xuất này rồi');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Tạo vote
      const newVote = this.voteRepo.create({
        contributionId: dto.contributionId,
        userId,
        voteType: dto.voteType,
        userIp,
        comment: dto.comment,
      });
      await queryRunner.manager.save(newVote);

      // Update vote count
      if (dto.voteType === 'up') {
        contribution.upvotes += 1;
      } else {
        contribution.downvotes += 1;
      }
      await queryRunner.manager.save(contribution);

      // Check threshold
      if (contribution.upvotes >= this.TRUST_THRESHOLD) {
        // Auto-merge logic (giống như trên)
        const mergeQuery = this.sparqlHelper.buildMergeToMainGraphQuery(
          contribution.reportUri,
          contribution.targetPoiId,
          contribution.proposedData,
        );

        // await this.sparqlService.update(mergeQuery);

        contribution.status = 'approved';
        contribution.autoMerged = true;
        contribution.approvedAt = new Date();
        await queryRunner.manager.save(contribution);

        await queryRunner.commitTransaction();

        return {
          success: true,
          message: 'Đề xuất đã đạt ngưỡng và được merge tự động!',
          contributionId: contribution.id,
          status: 'auto-merged',
          currentVotes: contribution.upvotes,
        };
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Vote của bạn đã được ghi nhận',
        contributionId: contribution.id,
        status: 'voted',
        currentVotes: contribution.upvotes,
        requiredVotes: this.TRUST_THRESHOLD,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Error voting:', error);
      throw new BadRequestException('Không thể vote: ' + error.message);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Lấy danh sách pending contributions
   */
  async getPendingContributions(
    dto: GetPendingContributionsDto,
  ): Promise<{ count: number; data: UserContribution[] }> {
    const query = this.contributionRepo
      .createQueryBuilder('contribution')
      .leftJoinAndSelect('contribution.votes', 'votes');

    if (dto.poiId) {
      query.andWhere('contribution.targetPoiId = :poiId', {
        poiId: dto.poiId,
      });
    }

    if (dto.status) {
      query.andWhere('contribution.status = :status', { status: dto.status });
    } else {
      query.andWhere('contribution.status = :status', { status: 'pending' });
    }

    query.orderBy('contribution.createdAt', 'DESC');

    const page = dto.page || 1;
    const limit = dto.limit || 20;
    query.skip((page - 1) * limit).take(limit);

    const [data, count] = await query.getManyAndCount();

    return { count, data };
  }

  /**
   * Lấy contribution detail
   */
  async getContributionDetail(contributionId: string): Promise<UserContribution> {
    const contribution = await this.contributionRepo.findOne({
      where: { id: contributionId },
      relations: ['votes'],
    });

    if (!contribution) {
      throw new BadRequestException('Contribution không tồn tại');
    }

    return contribution;
  }

  /**
   * Generate MD5 hash từ poiId + data
   */
  private generateProposalHash(poiId: string, data: Record<string, any>): string {
    // Normalize data để đảm bảo hash nhất quán
    const normalizedData = this.normalizeData(data);
    const dataString = JSON.stringify(normalizedData);
    const input = `${poiId}:${dataString}`;

    return crypto.createHash('md5').update(input).digest('hex');
  }

  /**
   * Normalize data để tránh hash khác nhau do thứ tự keys
   */
  private normalizeData(data: Record<string, any>): Record<string, any> {
    const normalized: Record<string, any> = {};
    const sortedKeys = Object.keys(data).sort();

    for (const key of sortedKeys) {
      const value = data[key];
      // Chỉ lấy các giá trị có ý nghĩa
      if (value !== undefined && value !== null && value !== '') {
        normalized[key] = value;
      }
    }

    return normalized;
  }
}
