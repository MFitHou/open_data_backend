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
import { TypeOrmModule } from '@nestjs/typeorm';

import { CrowdsourceController } from './crowdsource.controller';
import { CrowdsourceService } from './crowdsource.service';
import { CrowdsourceSparqlHelper } from './crowdsource-sparql.helper';
import { UserContribution } from './entities/user-contribution.entity';
import { ContributionVote } from './entities/contribution-vote.entity';

/**
 * Module quản lý crowdsource feature
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserContribution, ContributionVote])],
  controllers: [CrowdsourceController],
  providers: [CrowdsourceService, CrowdsourceSparqlHelper],
  exports: [CrowdsourceService],
})
export class CrowdsourceModule {}
