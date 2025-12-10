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
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserContribution } from './user-contribution.entity';

/**
 * Entity lưu trữ các vote của người dùng cho mỗi contribution
 */
@Entity('contribution_votes')
@Index(['contributionId', 'userId'], { unique: true })
export class ContributionVote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contribution_id', type: 'uuid' })
  @Index()
  contributionId: string;

  @ManyToOne(() => UserContribution, (contribution) => contribution.votes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'contribution_id' })
  contribution: UserContribution;

  @Column({ name: 'user_id', type: 'varchar', length: 100 })
  @Index()
  userId: string; // ID người dùng từ MySQL users table

  @Column({
    name: 'vote_type',
    type: 'enum',
    enum: ['up', 'down'],
  })
  voteType: string; // 'up' hoặc 'down'

  @Column({ name: 'user_ip', type: 'varchar', length: 45, nullable: true })
  userIp: string; // IP để phát hiện spam/abuse

  @Column({ type: 'text', nullable: true })
  comment: string; // Comment tùy chọn của người vote

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
